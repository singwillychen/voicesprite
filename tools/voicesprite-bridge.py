#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VoiceSprite 橋接程式：讓 VoiceSprite 網站可以使用你電腦上的 GPT-SoVITS。

GPT-SoVITS 的 API（api_v2.py）不允許其他網站呼叫，也只能讀取電腦上的參考錄音檔案。
這個程式負責：
  1. 開放 VoiceSprite 網站連線（CORS），其他網站一律拒絕
  2. 把網站送來的參考錄音存成暫存檔
  3. 轉給 GPT-SoVITS 生成語音，再把 WAV 回傳給網站

只使用 Python 內建功能，不需要安裝任何套件（Python 3.8 以上）。

用法：
  python voicesprite-bridge.py
  python voicesprite-bridge.py --port 9881 --sovits http://127.0.0.1:9880
  python voicesprite-bridge.py --allow-origin https://你的網域

關閉：直接關掉視窗，或按 Ctrl + C。
"""

import argparse
import base64
import hashlib
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

VERSION = "1.0"
DEFAULT_ORIGINS = ["https://singwillychen.github.io"]
MAX_BODY = 25 * 1024 * 1024  # 25 MB
# 允許從網站傳給 GPT-SoVITS 的參數（其餘一律忽略）
PASS_THROUGH = {
    "text_lang", "prompt_lang", "top_k", "top_p", "temperature", "text_split_method",
    "batch_size", "speed_factor", "fragment_interval", "seed", "repetition_penalty",
    "sample_steps", "super_sampling",
}

# Windows 主控台可能不是 UTF-8，避免中文訊息造成錯誤
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(errors="replace")
    except Exception:
        pass


def log(msg):
    print(msg, flush=True)


class Bridge(BaseHTTPRequestHandler):
    server_version = "VoiceSpriteBridge/" + VERSION

    # ---------- CORS ----------
    def origin_allowed(self, origin):
        if not origin:
            return True  # 不是瀏覽器（例如 curl 測試）
        if origin in self.server.allowed_origins:
            return True
        host = urlsplit(origin).hostname or ""
        # 本機開發（http://localhost:xxxx、http://127.0.0.1:xxxx）
        return host in ("localhost", "127.0.0.1", "::1") or host.endswith(".localhost")

    def cors_headers(self):
        origin = self.headers.get("Origin")
        if origin and self.origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            # Chrome 存取本機網路（Private Network Access）的預檢
            if self.headers.get("Access-Control-Request-Private-Network"):
                self.send_header("Access-Control-Allow-Private-Network", "true")

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def reject_origin(self):
        origin = self.headers.get("Origin")
        if self.origin_allowed(origin):
            return False
        log(f"[拒絕] 不允許的網站來源：{origin}")
        self.send_json(403, {"message": f"這個網站沒有權限使用橋接程式：{origin}"})
        return True

    # ---------- 路由 ----------
    def do_OPTIONS(self):
        if self.reject_origin():
            return
        self.send_response(204)
        self.cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.reject_origin():
            return
        if self.path.split("?")[0] == "/health":
            online, detail = self.sovits_online()
            self.send_json(200, {
                "ok": True,
                "name": "voicesprite-bridge",
                "version": VERSION,
                "sovits": {"url": self.server.sovits_url, "online": online, "detail": detail},
            })
        else:
            self.send_json(404, {"message": "找不到這個路徑，可用：GET /health、POST /tts"})

    def do_POST(self):
        if self.reject_origin():
            return
        if self.path.split("?")[0] != "/tts":
            self.send_json(404, {"message": "找不到這個路徑"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self.send_json(413, {"message": "請求內容大小不正確（上限 25 MB）"})
            return
        try:
            req = json.loads(self.rfile.read(length).decode("utf-8"))
            text = str(req.get("text") or "").strip()
            prompt_text = str(req.get("prompt_text") or "").strip()
            ref_path = self.save_reference(req.get("ref_audio") or "")
        except Exception as e:
            self.send_json(400, {"message": f"請求格式錯誤：{e}"})
            return
        if not text:
            self.send_json(400, {"message": "缺少要生成的文字"})
            return

        payload = {k: v for k, v in req.items() if k in PASS_THROUGH}
        payload.setdefault("text_lang", "zh")
        payload.setdefault("prompt_lang", "zh")
        payload.update({
            "text": text,
            "prompt_text": prompt_text,
            "ref_audio_path": ref_path,
            "media_type": "wav",
            "streaming_mode": False,
        })
        log(f"[生成] {text[:30]}{'…' if len(text) > 30 else ''}")
        try:
            audio = self.call_sovits(payload)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:500]
            log(f"[錯誤] GPT-SoVITS 回應 {e.code}：{detail}")
            self.send_json(502, {"message": f"GPT-SoVITS 生成失敗（{e.code}）：{detail}"})
            return
        except Exception as e:
            log(f"[錯誤] 無法連線到 GPT-SoVITS：{e}")
            self.send_json(503, {"message": f"無法連線到 GPT-SoVITS（{self.server.sovits_url}），請確認 api_v2.py 已啟動"})
            return
        self.send_response(200)
        self.cors_headers()
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)

    # ---------- 工具 ----------
    def save_reference(self, data):
        if "," in data[:100]:
            data = data.split(",", 1)[1]  # 去掉 data:audio/wav;base64,
        raw = base64.b64decode(data, validate=False)
        if len(raw) < 44 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
            raise ValueError("參考錄音不是 WAV 格式")
        name = hashlib.sha256(raw).hexdigest()[:20] + ".wav"
        path = os.path.join(self.server.ref_dir, name)
        if not os.path.exists(path):
            with open(path, "wb") as f:
                f.write(raw)
        return path

    def call_sovits(self, payload):
        req = urllib.request.Request(
            self.server.sovits_url + "/tts",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=600) as res:
            return res.read()

    def sovits_online(self):
        # GPT-SoVITS 沒有健康檢查端點；呼叫 /control（不帶參數會回 400）確認服務有在執行
        try:
            urllib.request.urlopen(self.server.sovits_url + "/control", timeout=3)
            return True, "ok"
        except urllib.error.HTTPError:
            return True, "ok"
        except Exception as e:
            return False, str(e)

    def log_message(self, fmt, *args):
        pass  # 只顯示上面整理過的中文訊息


def main():
    ap = argparse.ArgumentParser(description="VoiceSprite ↔ GPT-SoVITS 橋接程式")
    ap.add_argument("--port", type=int, default=9881, help="橋接程式的 port（預設 9881）")
    ap.add_argument("--sovits", default="http://127.0.0.1:9880", help="GPT-SoVITS api_v2 的網址（預設 http://127.0.0.1:9880）")
    ap.add_argument("--allow-origin", action="append", default=[], help="額外允許的網站來源，可重複指定")
    args = ap.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Bridge)  # 只接受本機連線
    server.sovits_url = args.sovits.rstrip("/")
    server.allowed_origins = set(DEFAULT_ORIGINS + [o.rstrip("/") for o in args.allow_origin])
    server.ref_dir = os.path.join(tempfile.gettempdir(), "voicesprite-refs")
    os.makedirs(server.ref_dir, exist_ok=True)

    log("=" * 52)
    log(f" VoiceSprite 橋接程式 v{VERSION}")
    log(f" 網站連線位址：http://127.0.0.1:{args.port}")
    log(f" GPT-SoVITS：{server.sovits_url}")
    log(f" 允許的網站：{', '.join(sorted(server.allowed_origins))}（以及本機）")
    log(" 關閉方式：關掉這個視窗，或按 Ctrl + C")
    log("=" * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("\n已關閉橋接程式。")


if __name__ == "__main__":
    main()

#!/bin/bash
# VoiceSprite x GPT-SoVITS 一鍵啟動（macOS）
# 請把這個檔案和 voicesprite-bridge.py 放在 GPT-SoVITS 資料夾（有 api_v2.py 的那一層）
# 執行方式：打開「終端機」，輸入 bash 加一個空格，把這個檔案拖進去，按 Enter
cd "$(dirname "$0")" || exit 1

if [ ! -f api_v2.py ]; then
  echo "[錯誤] 找不到 api_v2.py。請把這個檔案放到 GPT-SoVITS 資料夾裡再執行。"
  echo "[Error] api_v2.py not found. Put this file in the GPT-SoVITS folder and run it again."
  exit 1
fi
if [ ! -f voicesprite-bridge.py ]; then
  echo "[錯誤] 找不到 voicesprite-bridge.py。請把它放在和這個檔案同一個資料夾。"
  echo "[Error] voicesprite-bridge.py not found. Put it in the same folder as this file."
  exit 1
fi

# 啟用安裝 GPT-SoVITS 時建立的 conda 環境
if command -v conda >/dev/null 2>&1; then
  eval "$(conda shell.bash hook)"
  conda activate GPTSoVits || echo "[提醒] 找不到 conda 環境 GPTSoVits，改用目前的 Python"
fi

echo "啟動 GPT-SoVITS API（port 9880），第一次載入模型需要一點時間..."
echo "Starting GPT-SoVITS API (port 9880). Loading the model takes a while the first time..."
python api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml &
API_PID=$!
# 關閉視窗或按 Ctrl + C 時，一起關閉 GPT-SoVITS API
trap 'kill $API_PID 2>/dev/null; echo "已關閉 GPT-SoVITS 與橋接程式。 / GPT-SoVITS and the bridge have stopped."' EXIT INT TERM

echo "啟動 VoiceSprite 橋接程式（port 9881）..."
echo "Starting VoiceSprite Bridge (port 9881)..."
python voicesprite-bridge.py

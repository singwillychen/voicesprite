@echo off
chcp 65001 >nul
title VoiceSprite x GPT-SoVITS
rem 請把這個檔案和 voicesprite-bridge.py 放在 GPT-SoVITS 資料夾（有 api_v2.py 的那一層）
cd /d "%~dp0"

if not exist "api_v2.py" (
  echo [錯誤] 找不到 api_v2.py。請把這個檔案放到 GPT-SoVITS 資料夾裡再執行。
  pause
  exit /b 1
)
if not exist "voicesprite-bridge.py" (
  echo [錯誤] 找不到 voicesprite-bridge.py。請把它放在和這個檔案同一個資料夾。
  pause
  exit /b 1
)

rem 整合包內建的 Python 在 runtime 資料夾；沒有的話改用系統的 python
set "PY=runtime\python.exe"
if not exist "%PY%" set "PY=python"

echo 啟動 GPT-SoVITS API（port 9880），第一次載入模型需要一點時間...
start "" /b "%PY%" api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml

echo 啟動 VoiceSprite 橋接程式（port 9881）...
echo 兩個程式都在這個視窗裡執行：直接關掉這個視窗，就會一起關閉。
"%PY%" voicesprite-bridge.py
pause

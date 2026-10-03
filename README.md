# VoiceSprite 聲線工坊

朗讀 5 句台詞，建立你的聲線特徵檔；選一個動漫角色，輸入文字就能讓角色依你的聲線說話，也能帶進直播。

純靜態網站（HTML／CSS／JavaScript），不需要安裝或建置，直接上傳到 GitHub Pages 即可使用。

## 頁面

| 檔案 | 功能 |
| --- | --- |
| `index.html` | 首頁、角色選擇（5 種風格 × 男女）、直播教學 |
| `record.html` | 錄製聲紋、產生／匯出／匯入聲線特徵檔 |
| `tts.html` | 文字轉語音，可調語速、音高、音量、語氣、情緒 |
| `live.html` | 直播模式：只顯示角色與字幕，綠幕／透明背景 |

## 注意事項

- 麥克風只能在 https 或 localhost 下使用。GitHub Pages 是 https，可以直接用；在電腦上直接點兩下開 html 檔則無法錄音。
- 錄音與特徵檔只存在瀏覽器（IndexedDB），不會上傳。
- 引擎 A（瀏覽器內建語音）：即時、免下載，但音色只能近似，無法下載音檔。
- 引擎 B（Beta，AI 音色複製）：sherpa-onnx WebAssembly + ZipVoice，在瀏覽器內用參考錄音複製音色，可下載 WAV。
  - 首次下載約 210 MB 模型（來自 Hugging Face，固定版本），之後存在瀏覽器快取。
  - 生成比即時慢，適合先做成「直播台詞板」，直播時用按鈕或數字鍵 1～9 播放。
  - 僅支援電腦；手機與預覽框架會自動改用引擎 A。
  - 模型訓練資料含非商業授權條款，營利用途請先確認授權。
- 本地開源引擎（Beta，GPT-SoVITS）：使用者自行安裝 GPT-SoVITS，再執行 `tools/` 裡的橋接程式連到網站。安裝與連線教學見 `local-setup.html`。
  - `tools/voicesprite-bridge.py`：橋接程式（只用 Python 內建功能），處理跨網域與參考錄音上傳
  - `tools/start-gptsovits-windows.bat`、`tools/start-gptsovits-mac.command`：一鍵啟動 GPT-SoVITS 與橋接程式

## 聲線特徵檔格式（.voiceprofile.json）

```
format: "voicesprite-profile", version: 2（v1 仍可匯入）
features: f0（基頻）、spectralCentroid、mfccMean、speakingRate、energy …
references: 24kHz 參考錄音（base64 WAV，已裁掉頭尾靜音）＋朗讀文字＋emotionId，供引擎 B 依情緒挑選
```

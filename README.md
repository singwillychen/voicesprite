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
- 目前使用引擎 A（瀏覽器內建語音），音色只能近似，且無法下載音檔。引擎 B（瀏覽器 AI 模型）與本地開源引擎已預留介面，見 `js/engines/`。

## 聲線特徵檔格式（.voiceprofile.json）

```
format: "voicesprite-profile", version: 1
features: f0（基頻）、spectralCentroid、mfccMean、speakingRate、energy …
references: 16kHz 參考錄音（base64 WAV）＋朗讀文字，供未來的音色複製引擎使用
```

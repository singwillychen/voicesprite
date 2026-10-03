/* 本地開源引擎（預留，尚未實作）：呼叫使用者電腦上執行的語音模型
 *
 * 規劃：
 * - 使用者自行在電腦上啟動開源 TTS（例如 GPT-SoVITS、CosyVoice、F5-TTS），
 *   並開放 http://127.0.0.1 的 API 與 CORS。
 * - 網站（即使放在 GitHub Pages）以 fetch 呼叫 localhost，瀏覽器允許 https 頁面連到 localhost。
 * - 預計的請求格式（各模型需要一個小轉接器對應到這個格式）：
 *     POST {apiUrl}/tts
 *     { text, ref_audio: <特徵檔 references[0].audio 的 data URL>, ref_text, speed, emotion }
 *     → 回傳 audio/wav
 * - 設定值存放於 VS.prefs 'localApiUrl'。
 */
(function (VS) {
  'use strict';

  VS.engines.register({
    id: 'local',
    name: '本地開源引擎',
    short: 'L',
    status: 'planned',
    description: '連到你電腦上的開源模型（如 GPT-SoVITS），中文音色最接近本人，需要自行安裝。',
    capabilities: { download: true, cloneTimbre: true, needsServer: true },
    apiUrl: () => VS.prefs.get('localApiUrl', 'http://127.0.0.1:9880'),
    isAvailable: () => false,
    loadVoices: () => Promise.resolve([]),
    listVoices: () => [],
    describe: () => null,
    speak: () => Promise.reject(new Error('本地開源引擎尚未推出')),
    synthesize: () => Promise.reject(new Error('本地開源引擎尚未推出')),
    stop: () => {}
  });
})(window.VS);

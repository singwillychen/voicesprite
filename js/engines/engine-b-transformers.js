/* 引擎 B（預留，尚未實作）：在瀏覽器內執行開源 AI 語音模型
 *
 * 規劃：
 * - 以 CDN <script> 載入 transformers.js（或 onnxruntime-web），不需要建置工具。
 * - 以特徵檔 references[]（16kHz 參考錄音＋朗讀文字）作為說話者條件，做零樣本音色複製。
 * - 產出 Float32Array → VS.audio.wavBlob() → 可播放也可下載。
 * - 待決定：支援中文的模型、模型下載進度條與快取（Cache Storage）。
 *
 * 實作時須符合引擎介面：
 *   isAvailable() → boolean
 *   speak(text, profile, opts, hooks) → Promise
 *   synthesize(text, profile, opts) → Promise<Blob>（capabilities.download 為 true 時必須提供）
 *   stop()、describe(profile, opts)
 */
(function (VS) {
  'use strict';

  VS.engines.register({
    id: 'transformers',
    name: '引擎 B：瀏覽器 AI 模型',
    short: 'B',
    status: 'planned',
    description: '在瀏覽器內執行開源模型，音色更接近本人，可下載音檔。首次使用需下載模型。',
    capabilities: { download: true, cloneTimbre: true, needsServer: false },
    isAvailable: () => false,
    loadVoices: () => Promise.resolve([]),
    listVoices: () => [],
    describe: () => null,
    speak: () => Promise.reject(new Error('引擎 B 尚未推出')),
    synthesize: () => Promise.reject(new Error('引擎 B 尚未推出')),
    stop: () => {}
  });
})(window.VS);

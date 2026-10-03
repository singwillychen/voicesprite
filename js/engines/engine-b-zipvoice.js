/* 引擎 B（Beta）：sherpa-onnx WebAssembly + ZipVoice，在瀏覽器內用參考錄音複製音色
 * - 模型約 210 MB，第一次下載後存在 Cache Storage（見 zipvoice-worker.js）
 * - 生成比即時慢，所以逐句生成、邊生成邊播放；生成結果存在 VS.clipStore
 * - 情緒：依情緒挑選特徵檔裡對應語氣的參考錄音 */
(function (VS) {
  'use strict';

  const BASE = 'https://huggingface.co/spaces/k2-fsa/web-assembly-zh-en-tts-zipvoice/resolve/a118980aaa8d985d10e57425c1fdc2301c05f4cc/';
  const MODEL_CACHE = 'voicesprite-models-v1';
  const MODEL_TAG = 'zipvoice-distill-int8-a118980';

  const RT = VS.refTools;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  let worker = null;
  let loadPromise = null;
  let status = { state: 'idle', loaded: 0, total: 0, message: '' };
  const listeners = new Set();
  const pending = new Map();
  let reqId = 0;
  const refCache = new Map();
  const player = VS.AudioPlayer ? new VS.AudioPlayer() : null;
  const speaker = player ? RT.createSpeaker(player) : null;

  function setStatus(patch) {
    status = Object.assign({}, status, patch);
    listeners.forEach(fn => { try { fn(status); } catch (e) { /* 忽略 */ } });
  }

  function unavailableReason() {
    if (VS.isSandboxPreview) return '預覽模式無法使用';
    if (typeof WebAssembly !== 'object' || typeof Worker === 'undefined' || !('caches' in window)) return '此瀏覽器不支援';
    const mobile = (navigator.userAgentData && navigator.userAgentData.mobile) ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (mobile) return '手機暫不支援（需要大量記憶體）';
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return '裝置記憶體不足';
    if (!player) return '缺少播放器';
    return '';
  }

  /* ---------- 模型生命週期 ---------- */
  function onMessage(e) {
    const m = e.data;
    if (m.type === 'progress') {
      if (m.phase === 'init') setStatus({ state: 'loading' });
      else setStatus({ state: 'downloading', loaded: m.loaded, total: m.total, cached: m.cached });
    } else if (m.type === 'ready') {
      setStatus({ state: 'ready', message: '' });
      if (loadPromise) loadPromise.resolve();
    } else if (m.type === 'warn') {
      if (VS.toast) VS.toast(m.message);
    } else if (m.type === 'genProgress') {
      const p = pending.get(m.id);
      if (p && p.onProgress) p.onProgress(m.progress);
    } else if (m.type === 'result') {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (p) p.resolve({ samples: m.samples, sampleRate: m.sampleRate, ms: m.ms });
    } else if (m.type === 'error') {
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        p.reject(new Error(m.message));
      } else if (m.stage === 'init') {
        fail(m.message);
      }
    }
  }

  function fail(message) {
    setStatus({ state: 'error', message });
    if (loadPromise) loadPromise.reject(new Error(message));
    teardown();
  }

  function teardown() {
    if (worker) worker.terminate();
    worker = null;
    loadPromise = null;
    pending.forEach(p => p.reject(new Error('模型已卸載')));
    pending.clear();
  }

  function load() {
    if (status.state === 'ready' && worker) return Promise.resolve();
    if (loadPromise) return loadPromise.promise;
    const reason = unavailableReason();
    if (reason) return Promise.reject(new Error(reason));
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    loadPromise = { promise, resolve, reject };
    setStatus({ state: 'downloading', loaded: 0, total: 0, message: '' });
    try {
      worker = new Worker('js/engines/zipvoice-worker.js');
    } catch (e) {
      fail('無法啟動背景執行緒：' + e.message);
      return promise;
    }
    worker.onmessage = onMessage;
    worker.onerror = e => fail('背景執行緒錯誤：' + (e.message || '未知錯誤'));
    worker.postMessage({ type: 'init', base: BASE });
    return promise;
  }

  async function isCached() {
    try {
      const cache = await caches.open(MODEL_CACHE);
      return !!(await cache.match(BASE + 'sherpa-onnx-wasm-main-tts.data'));
    } catch (e) {
      return false;
    }
  }

  async function clearCache() {
    stop();
    teardown();
    setStatus({ state: 'idle', loaded: 0, total: 0, message: '' });
    try { await caches.delete(MODEL_CACHE); } catch (e) { /* 忽略 */ }
  }

  function generateRaw(text, ref, speed, steps, onProgress) {
    const id = ++reqId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      worker.postMessage({
        type: 'generate', id, text, speed, numSteps: steps,
        ref: { samples: ref.samples.slice(), sampleRate: ref.sampleRate, text: ref.text }
      });
    });
  }

  /* ---------- 參考錄音 ---------- */
  function refAudio(profile, pick) {
    const k = profile.id + ':' + pick.i;
    if (!refCache.has(k)) {
      const wav = VS.audio.parseWav(VS.audio.dataUrlToBuffer(pick.r.audio));
      refCache.set(k, { samples: wav.samples, sampleRate: wav.sampleRate, text: pick.r.text });
    }
    return refCache.get(k);
  }

  function settings(opts) {
    return {
      speed: RT.speedFor(opts, 0.6, 1.6),
      steps: clamp(Math.round(Number(opts.steps) || 4), 1, 8)
    };
  }

  async function synthChunk(text, profile, pick, set, onProgress) {
    const k = VS.clipStore.key([MODEL_TAG, profile.id, pick.i, text, set.speed.toFixed(2), set.steps]);
    const hit = await VS.clipStore.get(k).catch(() => null);
    if (hit) return Object.assign(hit, { cached: true });
    await load();
    const res = await generateRaw(text, refAudio(profile, pick), set.speed, set.steps, onProgress);
    VS.clipStore.put(k, res.samples, res.sampleRate).catch(() => {});
    return res;
  }

  /* ---------- 對外介面 ---------- */
  async function synthesize(text, profile, opts, cb) {
    opts = opts || {};
    cb = cb || {};
    RT.requireProfile(profile, '引擎 B ');
    const pick = RT.pickReference(profile, opts);
    const set = settings(opts);
    const chunks = RT.chunkText(text);
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      if (cb.onProgress) cb.onProgress(i / chunks.length, i, chunks.length);
      parts.push(await synthChunk(chunks[i], profile, pick, set, p => {
        if (cb.onProgress) cb.onProgress((i + p) / chunks.length, i, chunks.length);
      }));
    }
    return VS.audio.concat(parts, 0.15);
  }

  function stop() {
    if (speaker) speaker.stop();
  }

  // 邊生成邊播放：第 1 段一生成好就開始播，同時生成下一段
  function speak(text, profile, opts, hooks) {
    opts = opts || {};
    hooks = hooks || {};
    stop();
    try { RT.requireProfile(profile, '引擎 B '); } catch (e) { return Promise.reject(e); }
    const pick = RT.pickReference(profile, opts);
    const set = settings(opts);
    const chunks = RT.chunkText(text);
    return speaker.speak(chunks, (i, onProgress) => synthChunk(chunks[i], profile, pick, set, onProgress), opts, hooks,
      i => (i > 0 ? 'AI 生成下一句中…' : status.state === 'ready' ? 'AI 生成中…' : '載入 AI 模型中…'));
  }

  function describe(profile, opts) {
    opts = opts || {};
    if (!RT.hasReferences(profile)) {
      return { summary: '引擎 B 需要聲線特徵檔，請先選擇或錄製聲紋' };
    }
    const pick = RT.pickReference(profile, opts);
    const set = settings(opts);
    const old = (pick.r.sampleRate || 16000) < 24000 ? '・舊版 16 kHz，建議重錄' : '';
    return {
      summary: `參考錄音：${pick.r.emotion}（${pick.r.durationSec} 秒${old}）｜語速 ×${set.speed.toFixed(2)}｜品質 ${set.steps} 步`
    };
  }

  VS.engines.register({
    id: 'zipvoice',
    name: '引擎 B：AI 音色複製',
    short: 'B',
    status: 'beta',
    description: '在瀏覽器內用你的錄音複製音色。首次需下載約 210 MB 模型；生成比即時慢，適合先生成再播放。',
    capabilities: {
      download: true, cloneTimbre: true, needsServer: false, needsModel: true, needsProfile: true,
      realtime: false, emotion: 'reference', pitch: false, systemVoices: false, lipsync: 'level'
    },
    modelSizeMB: 210,
    isAvailable: () => !unavailableReason(),
    unavailableReason,
    getStatus: () => status,
    onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    load,
    isCached,
    clearCache,
    loadVoices: () => Promise.resolve([]),
    listVoices: () => [],
    describe,
    synthesize,
    speak,
    stop
  });
})(window.VS);

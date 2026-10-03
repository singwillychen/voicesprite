/* 引擎 B（Beta）：sherpa-onnx WebAssembly + ZipVoice，在瀏覽器內用參考錄音複製音色
 * - 模型約 210 MB，第一次下載後存在 Cache Storage（見 zipvoice-worker.js）
 * - 生成比即時慢，所以逐句生成、邊生成邊播放；生成結果存在 VS.clipStore
 * - 情緒：依情緒挑選特徵檔裡對應語氣的參考錄音 */
(function (VS) {
  'use strict';

  const BASE = 'https://huggingface.co/spaces/k2-fsa/web-assembly-zh-en-tts-zipvoice/resolve/a118980aaa8d985d10e57425c1fdc2301c05f4cc/';
  const MODEL_CACHE = 'voicesprite-models-v1';
  const MODEL_TAG = 'zipvoice-distill-int8-a118980';

  const LABEL_TO_ID = { '平靜': 'calm', '開心': 'happy', '敘述': 'neutral', '激動': 'excited', '溫柔': 'gentle' };
  const PREFER = {
    calm: ['calm', 'neutral', 'gentle', 'happy'],
    happy: ['happy', 'excited', 'calm'],
    surprised: ['happy', 'excited', 'calm'],
    angry: ['excited', 'happy', 'calm'],
    sad: ['gentle', 'calm', 'neutral']
  };
  const EMO_SPEED = { calm: 1, happy: 1.03, angry: 1.05, sad: 0.9, surprised: 1.03 };
  const TONE_SPEED = { flat: 1, gentle: 0.93, strong: 1.04 };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  let worker = null;
  let loadPromise = null;
  let status = { state: 'idle', loaded: 0, total: 0, message: '' };
  const listeners = new Set();
  const pending = new Map();
  let reqId = 0;
  const refCache = new Map();
  const player = VS.AudioPlayer ? new VS.AudioPlayer() : null;
  let currentRun = null;

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
  function pickReference(profile, opts) {
    const refs = ((profile && profile.references) || []).map((r, i) => ({
      r, i, id: r.emotionId || LABEL_TO_ID[r.emotion] || 'neutral'
    }));
    if (!refs.length) return null;
    const order = (PREFER[opts.emotion] || PREFER.calm).slice();
    if (opts.tone === 'gentle' && (!opts.emotion || opts.emotion === 'calm')) order.unshift('gentle');
    const byLen = (a, b) => (a.r.durationSec || 0) - (b.r.durationSec || 0);
    for (const id of order) {
      const hit = refs.filter(x => x.id === id).sort(byLen)[0];
      if (hit) return hit;
    }
    return refs.sort(byLen)[0];
  }

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
      speed: clamp((Number(opts.rate) || 1) * (EMO_SPEED[opts.emotion] || 1) * (TONE_SPEED[opts.tone] || 1), 0.6, 1.6),
      steps: clamp(Math.round(Number(opts.steps) || 4), 1, 8)
    };
  }

  // 把句子併成適合生成的段落：太短的句子合併，減少重複處理參考錄音的成本
  function chunkText(text) {
    const split = VS.engines.get('webspeech').splitSentences(String(text || ''));
    const out = [];
    let cur = '';
    split.forEach(s => {
      cur += s.text;
      if (cur.length >= 12) { out.push(cur); cur = ''; }
    });
    if (cur) {
      if (out.length && cur.length < 6) out[out.length - 1] += cur;
      else out.push(cur);
    }
    return out;
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

  function requireProfile(profile) {
    if (!profile || !profile.references || !profile.references.length) {
      throw new Error('引擎 B 需要含參考錄音的聲線特徵檔，請先到「錄製聲紋」錄音');
    }
  }

  /* ---------- 對外介面 ---------- */
  async function synthesize(text, profile, opts, cb) {
    opts = opts || {};
    cb = cb || {};
    requireProfile(profile);
    const pick = pickReference(profile, opts);
    const set = settings(opts);
    const chunks = chunkText(text);
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
    if (currentRun) currentRun.cancel();
    if (player) player.stop();
  }

  // 邊生成邊播放：第 1 段一生成好就開始播，同時生成下一段
  function speak(text, profile, opts, hooks) {
    opts = opts || {};
    hooks = hooks || {};
    stop();
    try { requireProfile(profile); } catch (e) { return Promise.reject(e); }
    const pick = pickReference(profile, opts);
    const set = settings(opts);
    const chunks = chunkText(text);
    if (!chunks.length) return Promise.resolve();

    const run = { cancelled: false, results: [], waiters: [] };
    const wake = () => { run.waiters.splice(0).forEach(fn => fn()); };
    run.cancel = () => { run.cancelled = true; wake(); };
    currentRun = run;
    const say = t => { if (hooks.onStatusText) hooks.onStatusText(t); };

    return new Promise((resolve, reject) => {
      let done = false;
      const finish = err => {
        if (done) return;
        done = true;
        if (currentRun === run) currentRun = null;
        if (hooks.onEnd) hooks.onEnd();
        if (err) reject(err); else resolve();
      };
      if (hooks.onStart) hooks.onStart();

      (async () => {
        for (let i = 0; i < chunks.length && !run.cancelled; i++) {
          try {
            if (status.state !== 'ready') say('載入 AI 模型中…');
            run.results[i] = await synthChunk(chunks[i], profile, pick, set, p => {
              if (run.waiting === i) say(`AI 生成中… ${Math.round(p * 100)}%`);
            });
          } catch (err) {
            run.error = err;
            run.cancel();
          }
          wake();
        }
      })();

      (async () => {
        for (let i = 0; i < chunks.length; i++) {
          if (!run.results[i] && !run.cancelled) {
            run.waiting = i;
            say(i > 0 ? 'AI 生成下一句中…' : status.state === 'ready' ? 'AI 生成中…' : '載入 AI 模型中…');
          }
          while (!run.results[i] && !run.cancelled) await new Promise(r => run.waiters.push(r));
          run.waiting = -1;
          if (run.cancelled) break;
          const r = run.results[i];
          if (hooks.onSentence) hooks.onSentence(chunks[i], i, chunks.length);
          await player.play(r.samples, r.sampleRate, { volume: opts.volume, onLevel: hooks.onLevel });
          if (hooks.onPause) hooks.onPause();
        }
        finish(run.error);
      })();
    });
  }

  function describe(profile, opts) {
    opts = opts || {};
    if (!profile || !profile.references || !profile.references.length) {
      return { summary: '引擎 B 需要聲線特徵檔，請先選擇或錄製聲紋' };
    }
    const pick = pickReference(profile, opts);
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
    stop,
    pickReference
  });
})(window.VS);

/* 引擎 B 背景執行緒：sherpa-onnx WebAssembly + ZipVoice（中英、零樣本音色複製）
 *
 * 模型檔放在 Hugging Face（固定 commit，內容不會變），第一次下載約 218 MB，
 * 之後存在 Cache Storage，不必重新下載。
 * 訊息：
 *   → { type:'init', base }                       ← progress / ready / error
 *   → { type:'generate', id, text, ref, speed, numSteps }  ← genProgress / result / error
 */
'use strict';

const CACHE_NAME = 'voicesprite-models-v1';
const FILES = {
  wasm: 'sherpa-onnx-wasm-main-tts.wasm',
  data: 'sherpa-onnx-wasm-main-tts.data',
  loader: 'sherpa-onnx-wasm-main-tts.js',
  api: 'sherpa-onnx-tts.js'
};

let tts = null;

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

// 先查 Cache Storage，沒有才下載，並回報進度
async function fetchCached(url, label, onProgress) {
  let cache = null;
  try { cache = await caches.open(CACHE_NAME); } catch (e) { /* 無法使用快取時直接下載 */ }
  if (cache) {
    const hit = await cache.match(url);
    if (hit) {
      const buf = await hit.arrayBuffer();
      onProgress(label, buf.byteLength, buf.byteLength, true);
      return buf;
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載 ${label} 失敗（HTTP ${res.status}）`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(label, loaded, total, false);
  }
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  if (cache) {
    try {
      await cache.put(url, new Response(buf.slice(0).buffer, { headers: { 'content-type': 'application/octet-stream' } }));
    } catch (e) {
      post({ type: 'warn', message: '瀏覽器儲存空間不足，模型無法快取，下次需要重新下載。' });
    }
  }
  return buf.buffer;
}

async function init(base) {
  const t0 = performance.now();
  const sizes = {};
  const report = (label, loaded, total, cached) => {
    sizes[label] = { loaded, total: total || loaded };
    let l = 0, t = 0;
    Object.values(sizes).forEach(s => { l += s.loaded; t += s.total; });
    post({ type: 'progress', phase: 'download', label, loaded: l, total: t, cached });
  };
  try {
    const [wasmBinary, dataBuf] = await Promise.all([
      fetchCached(base + FILES.wasm, 'wasm', report),
      fetchCached(base + FILES.data, 'data', report)
    ]);
    post({ type: 'progress', phase: 'init' });
    let pkg = dataBuf;
    self.Module = {
      wasmBinary,
      locateFile: path => base + path,
      // 讓 Emscripten 直接使用已下載（或快取）的模型資料，不再自己下載
      getPreloadedPackage: () => { const p = pkg; pkg = null; return p; },
      setStatus: () => {},
      onRuntimeInitialized() {
        try {
          tts = createOfflineTts(self.Module);
          post({
            type: 'ready',
            modelType: getDefaultOfflineTtsModelType(),
            sampleRate: tts.sampleRate,
            loadMs: Math.round(performance.now() - t0)
          });
        } catch (err) {
          post({ type: 'error', stage: 'init', message: '模型初始化失敗：' + errorMessage(err) });
        }
      }
    };
    // Hugging Face 以 text/plain 提供 .js，瀏覽器不允許直接 importScripts，改用 Blob URL 執行
    const noop = () => {};
    const [loaderBuf, apiBuf] = await Promise.all([
      fetchCached(base + FILES.loader, 'loader', noop),
      fetchCached(base + FILES.api, 'api', noop)
    ]);
    const toUrl = buf => URL.createObjectURL(new Blob([buf], { type: 'text/javascript' }));
    importScripts(toUrl(loaderBuf), toUrl(apiBuf));
  } catch (err) {
    post({ type: 'error', stage: 'init', message: errorMessage(err) });
  }
}

function generate(m) {
  if (!tts) {
    post({ type: 'error', id: m.id, stage: 'generate', message: '模型尚未載入完成' });
    return;
  }
  const t0 = performance.now();
  try {
    const audio = tts.generateWithConfig(m.text, {
      speed: m.speed || 1,
      numSteps: m.numSteps || 4,
      referenceAudio: m.ref.samples,
      referenceSampleRate: m.ref.sampleRate,
      referenceText: m.ref.text,
      extra: { min_char_in_sentence: 10 },
      callback: (samples, n, progress) => {
        post({ type: 'genProgress', id: m.id, progress });
        return 1;
      }
    });
    const samples = audio.samples;
    post({
      type: 'result',
      id: m.id,
      samples,
      sampleRate: audio.sampleRate,
      ms: Math.round(performance.now() - t0)
    }, [samples.buffer]);
  } catch (err) {
    post({ type: 'error', id: m.id, stage: 'generate', message: '語音生成失敗：' + errorMessage(err) });
  }
}

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') init(m.base);
  else if (m.type === 'generate') generate(m);
};

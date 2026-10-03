/* 本地開源引擎（Beta）：透過 VoiceSprite 橋接程式，使用使用者電腦上的 GPT-SoVITS
 *
 * 網站 ──POST /tts（文字＋參考錄音）──▶ voicesprite-bridge.py（127.0.0.1:9881）
 *                                       └─▶ GPT-SoVITS api_v2（127.0.0.1:9880）
 * 橋接程式在 tools/，安裝與連線教學在 local-setup.html。 */
(function (VS) {
  'use strict';

  const RT = VS.refTools;
  const DEFAULT_URL = 'http://127.0.0.1:9881';
  const player = VS.AudioPlayer ? new VS.AudioPlayer() : null;
  const speaker = player ? RT.createSpeaker(player) : null;

  let status = { state: 'unknown', message: '', sovitsUrl: '' };
  const listeners = new Set();

  function setStatus(patch) {
    status = Object.assign({}, status, patch);
    listeners.forEach(fn => { try { fn(status); } catch (e) { /* 忽略 */ } });
  }

  function bridgeUrl() {
    return String(VS.prefs.get('localBridgeUrl', DEFAULT_URL) || DEFAULT_URL).replace(/\/+$/, '');
  }

  function setBridgeUrl(url) {
    VS.prefs.set('localBridgeUrl', String(url || '').trim() || DEFAULT_URL);
    setStatus({ state: 'unknown', message: '' });
  }

  function unavailableReason() {
    if (VS.isSandboxPreview) return '預覽模式無法使用';
    if (!player || typeof fetch !== 'function') return '此瀏覽器不支援';
    return '';
  }

  async function fetchWithTimeout(url, options, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
    } finally {
      clearTimeout(t);
    }
  }

  // 回傳 { state: 'online' | 'bridge-only' | 'offline', message }
  async function check() {
    setStatus({ state: 'checking', message: '' });
    try {
      const res = await fetchWithTimeout(bridgeUrl() + '/health', {}, 4000);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
      if (data.sovits && data.sovits.online) {
        setStatus({ state: 'online', message: `已連線（橋接程式 v${data.version}）`, sovitsUrl: data.sovits.url });
      } else {
        setStatus({
          state: 'bridge-only',
          message: `橋接程式已啟動，但連不到 GPT-SoVITS（${data.sovits ? data.sovits.url : ''}）。請確認 api_v2.py 正在執行，第一次啟動載入模型需要一點時間。`,
          sovitsUrl: data.sovits ? data.sovits.url : ''
        });
      }
    } catch (e) {
      setStatus({
        state: 'offline',
        message: '連不到橋接程式。請先雙擊啟動檔；如果 Chrome 詢問「存取本機網路裝置」，請按允許。'
      });
    }
    return status;
  }

  // GPT-SoVITS 規定參考錄音必須 3～10 秒：太短的在尾端補靜音，太長的截到 9.5 秒
  const refCache = new Map();
  function refBase64(profile, pick) {
    const k = profile.id + ':' + pick.i;
    if (refCache.has(k)) return refCache.get(k);
    let out = pick.r.audio;
    const dur = pick.r.durationSec || 0;
    if (dur && (dur < 3.1 || dur > 9.8)) {
      const wav = VS.audio.parseWav(VS.audio.dataUrlToBuffer(pick.r.audio));
      const sr = wav.sampleRate;
      const target = dur < 3.1 ? Math.ceil(3.3 * sr) : Math.floor(9.5 * sr);
      const fixed = new Float32Array(target);
      fixed.set(wav.samples.subarray(0, Math.min(target, wav.samples.length)));
      out = VS.audio.wavDataUrl(fixed, sr);
    }
    refCache.set(k, out);
    return out;
  }

  async function synthChunk(text, profile, pick, speed) {
    const k = VS.clipStore.key(['gptsovits', profile.id, pick.i, text, speed.toFixed(2)]);
    const hit = await VS.clipStore.get(k).catch(() => null);
    if (hit) return hit;
    let res;
    try {
      res = await fetchWithTimeout(bridgeUrl() + '/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          text_lang: 'zh',
          prompt_text: pick.r.text,
          prompt_lang: 'zh',
          ref_audio: refBase64(profile, pick),
          speed_factor: speed,
          text_split_method: 'cut5'
        })
      }, 600000);
    } catch (e) {
      setStatus({ state: 'offline', message: '連不到橋接程式，請確認啟動檔視窗還開著。' });
      throw new Error('連不到橋接程式，請確認已啟動（可到「本地引擎安裝教學」頁測試連線）');
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).message || msg; } catch (e) { /* 不是 JSON */ }
      throw new Error(msg);
    }
    const wav = VS.audio.parseWav(await res.arrayBuffer());
    setStatus({ state: 'online' });
    VS.clipStore.put(k, wav.samples, wav.sampleRate).catch(() => {});
    return wav;
  }

  async function synthesize(text, profile, opts, cb) {
    opts = opts || {};
    cb = cb || {};
    RT.requireProfile(profile, '本地開源引擎');
    const pick = RT.pickReference(profile, opts);
    const speed = RT.speedFor(opts, 0.6, 1.6);
    const chunks = RT.chunkText(text, 20);
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      if (cb.onProgress) cb.onProgress(i / chunks.length, i, chunks.length);
      parts.push(await synthChunk(chunks[i], profile, pick, speed));
    }
    return VS.audio.concat(parts, 0.15);
  }

  function speak(text, profile, opts, hooks) {
    opts = opts || {};
    hooks = hooks || {};
    stop();
    try { RT.requireProfile(profile, '本地開源引擎'); } catch (e) { return Promise.reject(e); }
    const pick = RT.pickReference(profile, opts);
    const speed = RT.speedFor(opts, 0.6, 1.6);
    const chunks = RT.chunkText(text, 20);
    return speaker.speak(chunks, i => synthChunk(chunks[i], profile, pick, speed), opts, hooks,
      i => (i > 0 ? '本地引擎生成下一句中…' : '本地引擎生成中…'));
  }

  function stop() {
    if (speaker) speaker.stop();
  }

  function describe(profile, opts) {
    if (!RT.hasReferences(profile)) return { summary: '本地開源引擎需要聲線特徵檔，請先選擇或錄製聲紋' };
    const pick = RT.pickReference(profile, opts || {});
    return { summary: `GPT-SoVITS｜參考錄音：${pick.r.emotion}（${pick.r.durationSec} 秒）｜語速 ×${RT.speedFor(opts || {}, 0.6, 1.6).toFixed(2)}｜${bridgeUrl()}` };
  }

  VS.engines.register({
    id: 'local',
    name: '本地開源引擎：GPT-SoVITS',
    short: 'L',
    status: 'beta',
    description: '連到你電腦上的 GPT-SoVITS，中文音色最接近本人；有 NVIDIA 顯示卡時接近即時。需自行安裝。',
    capabilities: {
      download: true, cloneTimbre: true, needsServer: true, needsModel: false, needsProfile: true,
      realtime: false, emotion: 'reference', pitch: false, systemVoices: false, lipsync: 'level'
    },
    DEFAULT_URL,
    isAvailable: () => !unavailableReason(),
    unavailableReason,
    getStatus: () => status,
    onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    check,
    bridgeUrl,
    setBridgeUrl,
    loadVoices: () => Promise.resolve([]),
    listVoices: () => [],
    describe,
    synthesize,
    speak,
    stop
  });
})(window.VS);

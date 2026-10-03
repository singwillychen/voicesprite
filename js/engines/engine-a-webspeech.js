/* 引擎 A：瀏覽器內建語音（Web Speech API）
 * 依聲線特徵檔的基頻與語速，挑選最接近的系統語音並換算 pitch / rate。
 * 限制：音色只能近似，且瀏覽器不提供錄下合成語音的方法，所以無法下載音檔。 */
(function (VS) {
  'use strict';

  const synth = window.speechSynthesis;

  const EMOTION_PRESET = {
    calm: { pitch: 1, rate: 0.95, volume: 0.9, pause: 1.15 },
    happy: { pitch: 1.12, rate: 1.08, volume: 1, pause: 0.9 },
    angry: { pitch: 0.96, rate: 1.12, volume: 1, pause: 0.7 },
    sad: { pitch: 0.9, rate: 0.82, volume: 0.75, pause: 1.5 },
    surprised: { pitch: 1.2, rate: 1.05, volume: 1, pause: 0.9 }
  };

  const TONE_PRESET = {
    flat: { pitch: 1, rate: 1, volume: 0.95, pause: 1, vary: 0 },
    gentle: { pitch: 1.03, rate: 0.9, volume: 0.8, pause: 1.4, vary: 0.02 },
    strong: { pitch: 1, rate: 1.05, volume: 1, pause: 0.8, vary: 0.06 }
  };

  // 句尾停頓（毫秒）
  const PAUSE = { '。': 260, '.': 260, '！': 220, '!': 220, '？': 240, '?': 240, '；': 200, ';': 200, '…': 520, '，': 140, '\n': 400, '': 200 };

  // 系統語音沒有標示性別，只能用名稱推測
  const FEMALE_RE = /(female|女|美佳|婷婷|善怡|mei-?jia|ting-?ting|sin-?ji|hsiao|hanhan|yaoyao|huihui|xiaoxiao|xiaoyi|xiaochen|xiaomo|xiaorui|yating|shan-?shan|yu-?shu|lili|flo|sandy|shelley|grandma|samantha|karen|moira|tessa|victoria|allison|\bava\b|susan|zira|aria|jenny|nicky|serena|\bkate\b|fiona|catherine|emma|libby|sonia)/i;
  const MALE_RE = /(\bmale\b|男|zhiwei|yunjhe|yunxi|yunyang|yunjian|yunfeng|kangkang|li-?mu|han ?sen|reed|eddy|rocko|grandpa|\balex\b|daniel|\bfred\b|\btom\b|aaron|david|\bmark\b|\bguy\b|davis|ryan|arthur|oliver|gordon|rishi|thomas|george)/i;
  const BASE_F0 = { female: 215, male: 125, unknown: 190 };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function voiceGender(v) {
    const n = v.name + ' ' + v.voiceURI;
    if (FEMALE_RE.test(n)) return 'female';
    if (MALE_RE.test(n)) return 'male';
    return 'unknown';
  }

  // 語音的語言排序：數字越小越優先；9 代表不是這個語言
  function langRank(lang, kind) {
    const l = String(lang || '').toLowerCase().replace('_', '-');
    if (kind === 'en') {
      if (l === 'en-us') return 0;
      if (l === 'en-gb') return 1;
      return l.startsWith('en') ? 2 : 9;
    }
    if (l === 'zh-tw' || l.startsWith('zh-hant-tw') || l.startsWith('cmn-hant')) return 0;
    if (l === 'zh-cn' || l === 'zh' || l.startsWith('zh-hans') || l.startsWith('cmn')) return 1;
    if (l === 'zh-hk' || l.startsWith('yue')) return 3;
    if (l.startsWith('zh')) return 2;
    return 9;
  }

  const voiceKind = v => (langRank(v.lang, 'en') < 9 ? 'en' : langRank(v.lang, 'zh') < 9 ? 'zh' : null);

  let voicesCache = [];

  function loadVoices() {
    return new Promise(resolve => {
      if (!synth) return resolve([]);
      const v = synth.getVoices();
      if (v.length) { voicesCache = v; return resolve(v); }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        voicesCache = synth.getVoices();
        resolve(voicesCache);
      };
      synth.addEventListener('voiceschanged', finish, { once: true });
      setTimeout(finish, 1500);
    });
  }

  function voicesFor(kind) {
    return voicesCache.filter(v => langRank(v.lang, kind) < 9).sort((a, b) => langRank(a.lang, kind) - langRank(b.lang, kind));
  }

  // 下拉選單用：介面語言的語音排前面
  function listVoices() {
    const first = VS.lang === 'en' ? 'en' : 'zh';
    return voicesFor(first).concat(voicesFor(first === 'en' ? 'zh' : 'en'));
  }

  // kind：要說的文字是中文（zh）還是英文（en）；手動選的語音只用在同語言的文字
  function pickVoice(opts, profile, kind) {
    kind = kind || opts.textLang || 'zh';
    if (opts.voiceURI && opts.voiceURI !== 'auto') {
      const v = voicesCache.find(x => x.voiceURI === opts.voiceURI);
      if (v && voiceKind(v) === kind) return v;
    }
    const all = voicesFor(kind);
    if (!all.length) return null;
    const want = (profile && profile.engineHints && profile.engineHints.suggestedGender) || opts.genderHint || null;
    const score = v => {
      const g = voiceGender(v);
      return langRank(v.lang, kind) * 10 + (!want || g === want ? 0 : g === 'unknown' ? 4 : 8);
    };
    return all.slice().sort((a, b) => score(a) - score(b))[0];
  }

  function computeParams(profile, opts, voice) {
    const emo = EMOTION_PRESET[opts.emotion] || EMOTION_PRESET.calm;
    const tone = TONE_PRESET[opts.tone] || TONE_PRESET.flat;
    const g = voice ? voiceGender(voice) : 'unknown';
    let pitchBase = 1, rateBase = 1;
    if (profile && profile.features) {
      const f0 = profile.features.f0 && profile.features.f0.median;
      if (f0) pitchBase = clamp(f0 / BASE_F0[g], 0.55, 1.6);
      const sr = profile.features.speakingRate;
      if (sr) rateBase = clamp(sr / 4.3, 0.75, 1.35);
    }
    const semis = Number(opts.pitchShift) || 0;
    const userVol = opts.volume == null ? 1 : Number(opts.volume);
    return {
      voice,
      voiceGender: g,
      pitchBase,
      rateBase,
      pitch: clamp(pitchBase * emo.pitch * tone.pitch * Math.pow(2, semis / 12), 0.1, 2),
      rate: clamp(rateBase * emo.rate * tone.rate * (Number(opts.rate) || 1), 0.3, 3),
      volume: clamp(userVol * emo.volume * tone.volume, 0, 1),
      pause: emo.pause * tone.pause,
      vary: tone.vary,
      flat: opts.tone === 'flat'
    };
  }

  const END = '。！？!?；;…';
  const CLOSERS = '」』"\'）)';

  function splitSentences(text) {
    const out = [];
    let buf = '';
    const flush = endCh => {
      const t = buf.trim();
      if (t) out.push({ text: t, end: endCh || '' });
      buf = '';
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') { flush('\n'); continue; }
      buf += ch;
      // 英文句點：後面接空白或結尾才算句尾（避免把 3.5 切開）
      const enStop = ch === '.' && (i + 1 >= text.length || /\s/.test(text[i + 1]));
      if (END.includes(ch) || enStop) {
        while (i + 1 < text.length && (END.includes(text[i + 1]) || CLOSERS.includes(text[i + 1]))) buf += text[++i];
        flush(ch);
      }
    }
    flush('');
    // 太長的句子在逗號處切開，避免 Chrome 長句被截斷
    const res = [];
    out.forEach(s => {
      if (s.text.length <= 40) { res.push(s); return; }
      let cur = '';
      for (const ch of s.text) {
        cur += ch;
        if ('，,、'.includes(ch) && cur.length >= 12) { res.push({ text: cur, end: '，' }); cur = ''; }
      }
      if (cur) res.push({ text: cur, end: s.end });
    });
    return res;
  }

  function sentenceParams(p, s, idx) {
    let pitch = p.pitch, rate = p.rate, volume = p.volume;
    if (!p.flat) {
      if ('！!'.includes(s.end) && s.end) { pitch *= 1.05; rate *= 1.04; volume = Math.min(1, volume * 1.1); }
      else if ('？?'.includes(s.end) && s.end) pitch *= 1.08;
      else if (s.end === '…') rate *= 0.9;
      if (p.vary) pitch *= 1 + (idx % 2 ? -p.vary : p.vary) * 0.5;
    }
    const base = PAUSE[s.end] !== undefined ? PAUSE[s.end] : 200;
    return {
      pitch: clamp(pitch, 0.1, 2),
      rate: clamp(rate, 0.3, 3),
      volume,
      pauseMs: base * p.pause / Math.max(0.5, rate)
    };
  }

  let finishCurrent = null;
  let timer = null;
  let keepAlive = null; // 保留參照，避免 Chrome 把 utterance 回收導致事件不觸發

  function stop() {
    clearTimeout(timer);
    const f = finishCurrent;
    finishCurrent = null;
    if (synth) synth.cancel();
    if (f) f();
  }

  function speak(text, profile, opts, hooks) {
    opts = opts || {};
    hooks = hooks || {};
    stop();
    if (!synth) return Promise.reject(new Error(VS.t('此瀏覽器不支援語音合成')));
    const sentences = splitSentences(String(text || ''));
    if (!sentences.length) return Promise.resolve();
    // 每句依中文／英文挑對應語言的語音
    const byKind = {};
    const setup = kind => {
      if (!byKind[kind]) {
        const voice = pickVoice(opts, profile, kind);
        byKind[kind] = { voice, params: computeParams(profile, opts, voice) };
      }
      return byKind[kind];
    };

    return new Promise((resolve, reject) => {
      let done = false;
      let i = 0;
      const finish = err => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (finishCurrent === finish) finishCurrent = null;
        if (hooks.onEnd) hooks.onEnd();
        if (err) reject(err); else resolve();
      };
      finishCurrent = finish;
      if (hooks.onStart) hooks.onStart();

      const next = () => {
        if (done) return;
        if (i >= sentences.length) { finish(); return; }
        const idx = i++;
        const s = sentences[idx];
        const kind = VS.textLang(s.text);
        const { voice, params } = setup(kind);
        const sp = sentenceParams(params, s, idx);
        const u = new SpeechSynthesisUtterance(s.text);
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = kind === 'en' ? 'en-US' : 'zh-TW';
        u.pitch = sp.pitch;
        u.rate = sp.rate;
        u.volume = sp.volume;
        u.onstart = () => { if (!done && hooks.onSentence) hooks.onSentence(s.text, idx, sentences.length); };
        u.onend = () => {
          if (done) return;
          if (hooks.onPause) hooks.onPause();
          timer = setTimeout(next, sp.pauseMs);
        };
        u.onerror = e => {
          if (done) return;
          if (e.error === 'interrupted' || e.error === 'canceled') finish();
          else finish(new Error(e.error || VS.t('語音合成失敗')));
        };
        keepAlive = u;
        synth.speak(u);
      };
      // cancel() 後立刻 speak() 在部分瀏覽器會被吃掉，稍等一下
      timer = setTimeout(next, 60);
    });
  }

  function describe(profile, opts) {
    const voice = pickVoice(opts || {}, profile, (opts && opts.textLang) || 'zh');
    const p = computeParams(profile, opts || {}, voice);
    return {
      voiceName: voice ? voice.name : null,
      voiceLang: voice ? voice.lang : null,
      voiceGender: p.voiceGender,
      pitch: p.pitch,
      rate: p.rate,
      volume: p.volume,
      pitchBase: p.pitchBase,
      rateBase: p.rateBase
    };
  }

  VS.engines.register({
    id: 'webspeech',
    name: VS.t('引擎 A：瀏覽器內建語音'),
    short: 'A',
    status: 'ready',
    description: VS.t('用系統內建語音，依你的聲線調整音高與語速。免下載、可離線，但音色只能近似。'),
    capabilities: {
      download: false, cloneTimbre: false, needsServer: false, needsModel: false, needsProfile: false,
      realtime: true, emotion: 'params', pitch: true, systemVoices: true, lipsync: 'random'
    },
    isAvailable: () => !!synth && typeof window.SpeechSynthesisUtterance !== 'undefined',
    unavailableReason: () => VS.t('此瀏覽器不支援語音合成'),
    loadVoices,
    listVoices,
    voiceGender,
    describe,
    speak,
    stop,
    splitSentences
  });
})(window.VS);

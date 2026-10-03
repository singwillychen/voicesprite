/* 「參考錄音型」引擎共用工具（引擎 B、本地開源引擎）
 * - 依情緒挑選特徵檔裡的參考錄音
 * - 文字切段
 * - 邊生成邊播放 */
(function (VS) {
  'use strict';

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

  function hasReferences(profile) {
    return !!(profile && profile.references && profile.references.length);
  }

  function requireProfile(profile, engineName) {
    if (!hasReferences(profile)) {
      throw new Error(`${engineName}需要含參考錄音的聲線特徵檔，請先到「錄製聲紋」錄音`);
    }
  }

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

  function speedFor(opts, min, max) {
    return clamp((Number(opts.rate) || 1) * (EMO_SPEED[opts.emotion] || 1) * (TONE_SPEED[opts.tone] || 1), min, max);
  }

  // 把句子併成適合生成的段落：太短的句子合併，減少重複處理參考錄音的成本
  function chunkText(text, minLen) {
    minLen = minLen || 12;
    const split = VS.engines.get('webspeech').splitSentences(String(text || ''));
    const out = [];
    let cur = '';
    split.forEach(s => {
      cur += s.text;
      if (cur.length >= minLen) { out.push(cur); cur = ''; }
    });
    if (cur) {
      if (out.length && cur.length < 6) out[out.length - 1] += cur;
      else out.push(cur);
    }
    return out;
  }

  /* 邊生成邊播放：第 1 段一生成好就開始播，同時生成下一段
   * synth(i, onProgress) → Promise<{samples, sampleRate}>
   * waitText(i) → 等待第 i 段時要顯示的文字 */
  function createSpeaker(player) {
    let currentRun = null;

    function stop() {
      if (currentRun) currentRun.cancel();
      player.stop();
    }

    function speak(chunks, synth, opts, hooks, waitText) {
      stop();
      if (!chunks.length) return Promise.resolve();
      const run = { cancelled: false, results: [], waiters: [], waiting: -1 };
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
              run.results[i] = await synth(i, p => {
                if (run.waiting === i && p != null) say(`AI 生成中… ${Math.round(p * 100)}%`);
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
              say(waitText(i));
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

    return { speak, stop };
  }

  VS.refTools = { LABEL_TO_ID, hasReferences, requireProfile, pickReference, speedFor, chunkText, createSpeaker };
})(window.VS);

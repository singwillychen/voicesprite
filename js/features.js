/* 聲學特徵擷取：基頻 F0、頻譜質心、MFCC、語速、能量；並做錄音品質檢查
 * 輸入一律為 16kHz 單聲道 Float32Array */
(function (VS) {
  'use strict';

  const SR = 16000;
  const N = 1024;          // 分析視窗 64ms
  const HOP = 256;         // 16ms
  const ACF_N = 2048;      // 自相關用的 FFT 長度（補零）
  const F0_MIN = 70, F0_MAX = 450;
  const LAG_MIN = Math.floor(SR / F0_MAX);
  const LAG_MAX = Math.ceil(SR / F0_MIN);
  const N_MEL = 26, N_MFCC = 13, BINS = N / 2 + 1;

  const hann = new Float64Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));

  const mel = f => 2595 * Math.log10(1 + f / 700);
  const imel = m => 700 * (Math.pow(10, m / 2595) - 1);

  const melBank = (() => {
    const lo = mel(80), hi = mel(7600);
    const pts = [];
    for (let i = 0; i < N_MEL + 2; i++) pts.push(imel(lo + (hi - lo) * i / (N_MEL + 1)));
    const bank = [];
    for (let m = 0; m < N_MEL; m++) {
      const w = new Float64Array(BINS);
      const fl = pts[m], fc = pts[m + 1], fh = pts[m + 2];
      for (let k = 0; k < BINS; k++) {
        const f = k * SR / N;
        if (f > fl && f < fh) w[k] = f <= fc ? (f - fl) / (fc - fl) : (fh - f) / (fh - fc);
      }
      bank.push(w);
    }
    return bank;
  })();

  const dct = [];
  for (let i = 0; i < N_MFCC; i++) {
    const row = new Float64Array(N_MEL);
    for (let j = 0; j < N_MEL; j++) row[j] = Math.cos(Math.PI * i * (j + 0.5) / N_MEL);
    dct.push(row);
  }

  // 原地 radix-2 FFT
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const tr = re[b] * cr - im[b] * ci;
          const ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = ncr;
        }
      }
    }
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const s = Array.from(arr).sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
  }
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const std = a => {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
  };
  const round = (v, d) => {
    const k = Math.pow(10, d === undefined ? 2 : d);
    return Math.round(v * k) / k;
  };

  // 估算音節數：中文每字一個音節；英文依母音群估算；數字每位一個
  function countSpeechChars(text) {
    const s = String(text);
    const cjk = (s.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    const digits = (s.match(/[0-9]/g) || []).length;
    let syllables = 0;
    (s.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).forEach(w => {
      const groups = w.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]+/g);
      syllables += Math.max(1, groups ? groups.length : 1);
    });
    return cjk + digits + syllables;
  }

  function analyzeClip(x, text) {
    const nFrames = x.length >= N ? Math.floor((x.length - N) / HOP) + 1 : 0;
    const db = new Float64Array(nFrames);
    for (let f = 0; f < nFrames; f++) {
      let s = 0;
      const o = f * HOP;
      for (let i = 0; i < N; i++) { const v = x[o + i]; s += v * v; }
      db[f] = 10 * Math.log10(s / N + 1e-12);
    }
    const p10 = percentile(db, 0.1), p90 = percentile(db, 0.9);
    const floor = Math.min(p10, p90 - 20);

    let first = -1, last = -1;
    const activeDb = [];
    for (let f = 0; f < nFrames; f++) {
      if (db[f] > floor + 10) {
        if (first < 0) first = f;
        last = f;
        activeDb.push(db[f]);
      }
    }
    const activeSec = first < 0 ? 0 : ((last - first) * HOP + N) / SR;

    const f0s = [], cents = [], mfccs = [];
    const re = new Float64Array(N), im = new Float64Array(N);
    const are = new Float64Array(ACF_N), aim = new Float64Array(ACF_N);
    const pow = new Float64Array(BINS), logE = new Float64Array(N_MEL);

    for (let f = 0; f < nFrames; f++) {
      if (db[f] <= floor + 12) continue;
      const o = f * HOP;

      // 頻譜：質心與 MFCC
      for (let i = 0; i < N; i++) { re[i] = x[o + i] * hann[i]; im[i] = 0; }
      fft(re, im);
      let num = 0, den = 0;
      for (let k = 0; k < BINS; k++) {
        const p = re[k] * re[k] + im[k] * im[k];
        pow[k] = p;
        const m = Math.sqrt(p);
        num += m * k * SR / N;
        den += m;
      }
      if (den > 0) cents.push(num / den);
      for (let m = 0; m < N_MEL; m++) {
        let e = 0;
        const w = melBank[m];
        for (let k = 0; k < BINS; k++) if (w[k]) e += w[k] * pow[k];
        logE[m] = Math.log(e + 1e-10);
      }
      const c = new Array(N_MFCC);
      for (let i = 0; i < N_MFCC; i++) {
        let s = 0;
        for (let j = 0; j < N_MEL; j++) s += dct[i][j] * logE[j];
        c[i] = s;
      }
      mfccs.push(c);

      // 基頻：以 FFT 計算自相關
      let mu = 0;
      for (let i = 0; i < N; i++) mu += x[o + i];
      mu /= N;
      for (let i = 0; i < ACF_N; i++) { are[i] = i < N ? x[o + i] - mu : 0; aim[i] = 0; }
      fft(are, aim);
      for (let i = 0; i < ACF_N; i++) { are[i] = are[i] * are[i] + aim[i] * aim[i]; aim[i] = 0; }
      fft(are, aim);
      const r0 = are[0];
      if (r0 <= 0) continue;
      const r = lag => are[lag] / r0 * N / (N - lag);
      let best = -1, bestLag = -1;
      for (let l = LAG_MIN; l <= LAG_MAX; l++) {
        const v = r(l);
        if (v > best) { best = v; bestLag = l; }
      }
      if (best < 0.45) continue;
      // 取最短的接近最高峰，減少低八度誤判
      for (let l = LAG_MIN + 1; l < LAG_MAX; l++) {
        const v = r(l);
        if (v >= 0.88 * best && v >= r(l - 1) && v >= r(l + 1)) { bestLag = l; break; }
      }
      const y0 = r(bestLag - 1), y1 = r(bestLag), y2 = r(bestLag + 1);
      const d = y0 - 2 * y1 + y2;
      const shift = d !== 0 ? 0.5 * (y0 - y2) / d : 0;
      const f0 = SR / (bestLag + (Math.abs(shift) < 1 ? shift : 0));
      if (f0 >= F0_MIN && f0 <= F0_MAX) f0s.push(f0);
    }

    // 品質檢查
    let peak = 0, clipN = 0;
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]);
      if (a > peak) peak = a;
      if (a > 0.99) clipN++;
    }
    const chars = countSpeechChars(text);
    const quality = {
      durationSec: x.length / SR,
      activeSec,
      peak,
      clipRatio: clipN / Math.max(1, x.length),
      levelDb: p90,
      snrDb: p90 - p10,
      messages: [],
      status: 'pass'
    };
    const fail = [], warn = [];
    if (activeSec < 1.2) fail.push(VS.t('沒有偵測到足夠的說話聲，請靠近麥克風再錄一次'));
    else if (p90 < -45) fail.push(VS.t('音量太小，請靠近麥克風或調高輸入音量'));
    else {
      if (quality.clipRatio > 0.002) warn.push(VS.t('有爆音，請離麥克風遠一點'));
      if (p90 < -35) warn.push(VS.t('音量偏小'));
      if (quality.snrDb < 15) warn.push(VS.t('背景雜音偏大，建議換到安靜的地方'));
      if (activeDb.length && f0s.length / activeDb.length < 0.2) warn.push(VS.t('偵測到的發聲段落偏少'));
      if (chars / Math.max(activeSec, 0.1) > 9) warn.push(VS.t('錄音好像太短，可能沒有唸完整句'));
    }
    if (fail.length) { quality.status = 'fail'; quality.messages = fail; }
    else if (warn.length) { quality.status = 'warn'; quality.messages = warn; }
    else quality.messages = [VS.t('錄音品質良好')];

    // 說話段落的起訖時間，用來裁掉參考錄音頭尾的靜音
    const startSec = first < 0 ? 0 : first * HOP / SR;
    const endSec = first < 0 ? x.length / SR : (last * HOP + N) / SR;
    return { text, chars, activeSec, startSec, endSec, f0s, cents, mfccs, activeDb, quality };
  }

  function combine(analyses) {
    const f0s = [], cents = [], mfccs = [], activeDb = [];
    let chars = 0, activeSec = 0;
    analyses.forEach(a => {
      f0s.push(...a.f0s);
      cents.push(...a.cents);
      mfccs.push(...a.mfccs);
      activeDb.push(...a.activeDb);
      chars += a.chars;
      activeSec += a.activeSec;
    });
    const mfccMean = new Array(N_MFCC).fill(0);
    mfccs.forEach(c => c.forEach((v, i) => { mfccMean[i] += v; }));
    const ep10 = percentile(activeDb, 0.1), ep90 = percentile(activeDb, 0.9);
    return {
      f0: {
        median: round(percentile(f0s, 0.5), 1),
        mean: round(mean(f0s), 1),
        p10: round(percentile(f0s, 0.1), 1),
        p90: round(percentile(f0s, 0.9), 1),
        std: round(std(f0s), 1)
      },
      spectralCentroid: round(mean(cents), 0),
      mfccMean: mfccMean.map(v => round(v / Math.max(1, mfccs.length), 3)),
      speakingRate: round(chars / Math.max(activeSec, 0.1), 2),
      energy: { p10: round(ep10, 1), p90: round(ep90, 1), range: round(ep90 - ep10, 1) },
      voicedRatio: round(f0s.length / Math.max(1, activeDb.length), 3),
      totalSpeechSec: round(activeSec, 1),
      analysis: { sampleRate: SR, frameSize: N, hop: HOP }
    };
  }

  function summarize(features) {
    const f0 = features.f0.median;
    const pitch = f0 < 120 ? '低沉' : f0 < 165 ? '中低' : f0 < 210 ? '中音' : f0 < 260 ? '中高' : '高亢';
    const sr = features.speakingRate;
    const rate = sr < 3.5 ? '偏慢' : sr < 5 ? '適中' : '偏快';
    const sc = features.spectralCentroid;
    const timbre = sc < 1300 ? '溫暖厚實' : sc < 2000 ? '均衡' : '明亮清脆';
    const dynamics = features.energy.range < 12 ? '平穩' : '起伏豐富';
    return { pitch, rate, timbre, dynamics, suggestedGender: f0 < 165 ? 'male' : 'female' };
  }

  VS.features = { SR, analyzeClip, combine, summarize, countSpeechChars };
})(window.VS);

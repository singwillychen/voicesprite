/* 音訊工具：合併、重新取樣、WAV 編碼、base64 轉換 */
(function (VS) {
  'use strict';

  function merge(chunks) {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    chunks.forEach(c => { out.set(c, offset); offset += c.length; });
    return out;
  }

  function resample(input, fromRate, toRate) {
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const outLen = Math.floor(input.length / ratio);
    const out = new Float32Array(outLen);
    if (ratio > 1) {
      // 降頻：取區間平均，順便做簡單低通
      for (let i = 0; i < outLen; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(input.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        for (let j = start; j < end; j++) sum += input[j];
        out[i] = sum / Math.max(1, end - start);
      }
    } else {
      for (let i = 0; i < outLen; i++) {
        const pos = i * ratio;
        const j = Math.floor(pos);
        const t = pos - j;
        const a = input[j] || 0;
        const b = input[Math.min(j + 1, input.length - 1)] || 0;
        out[i] = a + (b - a) * t;
      }
    }
    return out;
  }

  // 16-bit PCM 單聲道 WAV
  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let off = 44;
    for (let i = 0; i < samples.length; i++, off += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  function bufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function wavDataUrl(samples, sampleRate) {
    return 'data:audio/wav;base64,' + bufferToBase64(encodeWav(samples, sampleRate));
  }

  function wavBlob(samples, sampleRate) {
    return new Blob([encodeWav(samples, sampleRate)], { type: 'audio/wav' });
  }

  VS.audio = { merge, resample, encodeWav, bufferToBase64, wavDataUrl, wavBlob };
})(window.VS);

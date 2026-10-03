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

  function dataUrlToBuffer(url) {
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // 解析 16-bit PCM WAV（特徵檔裡的參考錄音就是這個格式）
  function parseWav(buf) {
    const v = new DataView(buf);
    let off = 12, sampleRate = 16000, bits = 16, ch = 1, dataOff = -1, dataLen = 0;
    while (off + 8 <= v.byteLength) {
      const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
      const size = v.getUint32(off + 4, true);
      if (id === 'fmt ') {
        ch = v.getUint16(off + 10, true);
        sampleRate = v.getUint32(off + 12, true);
        bits = v.getUint16(off + 22, true);
      } else if (id === 'data') {
        dataOff = off + 8;
        dataLen = Math.min(size, v.byteLength - dataOff);
        break;
      }
      off += 8 + size + (size % 2);
    }
    if (dataOff < 0 || bits !== 16) throw new Error(VS.t('不支援的 WAV 格式'));
    const n = Math.floor(dataLen / 2 / ch);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let c = 0; c < ch; c++) s += v.getInt16(dataOff + (i * ch + c) * 2, true);
      samples[i] = s / ch / 32768;
    }
    return { samples, sampleRate };
  }

  // 依序接起多段音訊，中間插入靜音
  function concat(parts, gapSec) {
    if (!parts.length) return { samples: new Float32Array(0), sampleRate: 24000 };
    const sampleRate = parts[0].sampleRate;
    const gap = Math.round((gapSec || 0) * sampleRate);
    const total = parts.reduce((n, p) => n + p.samples.length, 0) + gap * (parts.length - 1);
    const out = new Float32Array(total);
    let off = 0;
    parts.forEach((p, i) => {
      out.set(p.samples, off);
      off += p.samples.length + (i < parts.length - 1 ? gap : 0);
    });
    return { samples: out, sampleRate };
  }

  VS.audio = { merge, resample, encodeWav, bufferToBase64, wavDataUrl, wavBlob, dataUrlToBuffer, parseWav, concat };
})(window.VS);

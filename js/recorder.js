/* 麥克風錄音：擷取原始 PCM，結束時轉成 16kHz */
(function (VS) {
  'use strict';

  class Recorder {
    constructor() {
      this.ctx = null;
      this.stream = null;
      this.analyser = null;
      this.recording = false;
      this.chunks = [];
      this.buf = null;
    }

    get ready() { return !!this.ctx; }

    async init() {
      if (this.ctx) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const e = new Error('此瀏覽器不支援錄音');
        e.name = 'NotSupportedError';
        throw e;
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false }
      });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      src.connect(this.analyser);

      // ScriptProcessor 雖已不建議使用，但不需額外檔案、file:// 也能跑
      const proc = this.ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = e => {
        if (this.recording) this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      src.connect(proc);
      proc.connect(mute);
      mute.connect(this.ctx.destination);
      this.proc = proc;
      this.buf = new Float32Array(this.analyser.fftSize);
    }

    async start() {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.chunks = [];
      this.recording = true;
    }

    // s16：給特徵分析用；s24：給引擎 B 當參考錄音（模型輸出是 24 kHz）
    stop() {
      this.recording = false;
      const merged = VS.audio.merge(this.chunks);
      this.chunks = [];
      return {
        s16: VS.audio.resample(merged, this.ctx.sampleRate, VS.features.SR),
        s24: VS.audio.resample(merged, this.ctx.sampleRate, 24000)
      };
    }

    timeDomain() {
      this.analyser.getFloatTimeDomainData(this.buf);
      return this.buf;
    }

    levelDb() {
      if (!this.analyser) return -100;
      const b = this.timeDomain();
      let s = 0;
      for (let i = 0; i < b.length; i++) s += b[i] * b[i];
      return 10 * Math.log10(s / b.length + 1e-12);
    }

    destroy() {
      this.recording = false;
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.ctx) this.ctx.close();
      this.ctx = null;
      this.stream = null;
    }
  }

  VS.Recorder = Recorder;
})(window.VS);

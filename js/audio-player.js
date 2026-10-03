/* 網頁內播放器：播放 Float32Array 音訊，並即時回報音量給角色對嘴 */
(function (VS) {
  'use strict';

  class AudioPlayer {
    constructor() {
      this.ctx = null;
      this.current = null;
    }

    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.gain = this.ctx.createGain();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.buf = new Float32Array(this.analyser.fftSize);
        this.gain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    // 播完或被 stop() 時 resolve
    play(samples, sampleRate, opts) {
      opts = opts || {};
      this.stop();
      this.ensure();
      const buffer = this.ctx.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.gain);
      this.gain.gain.value = opts.volume == null ? 1 : opts.volume;

      return new Promise(resolve => {
        const cur = { src, done: false, timer: 0 };
        this.current = cur;
        cur.finish = () => {
          if (cur.done) return;
          cur.done = true;
          clearInterval(cur.timer);
          if (this.current === cur) this.current = null;
          if (opts.onLevel) opts.onLevel(0);
          resolve();
        };
        src.onended = cur.finish;
        // 用計時器而非 requestAnimationFrame：視窗在背景（例如被 OBS 擷取時）也能繼續對嘴
        const tick = () => {
          if (cur.done) return;
          this.analyser.getFloatTimeDomainData(this.buf);
          let s = 0;
          for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
          opts.onLevel(Math.sqrt(s / this.buf.length));
        };
        src.start();
        if (opts.onLevel) cur.timer = setInterval(tick, 40);
      });
    }

    stop() {
      const c = this.current;
      if (!c) return;
      try {
        c.src.onended = null;
        c.src.stop();
      } catch (e) { /* 已經停止 */ }
      c.finish();
    }
  }

  VS.AudioPlayer = AudioPlayer;
})(window.VS);

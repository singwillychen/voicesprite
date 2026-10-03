/* VoiceSprite 聲線工坊：共用工具 */
window.VS = window.VS || {};
(function (VS) {
  'use strict';

  VS.$ = (sel, root) => (root || document).querySelector(sel);
  VS.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // 偏好設定（只存在這台電腦的瀏覽器）
  VS.prefs = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('vs.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem('vs.' + key, JSON.stringify(value)); } catch (e) { /* 無痕模式等情況忽略 */ }
    }
  };

  VS.escapeHtml = s => String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  VS.EMOTIONS = [
    { id: 'calm', name: '平靜' },
    { id: 'happy', name: '開心' },
    { id: 'angry', name: '生氣' },
    { id: 'sad', name: '悲傷' },
    { id: 'surprised', name: '驚訝' }
  ];

  VS.TONES = [
    { id: 'flat', name: '平淡' },
    { id: 'gentle', name: '溫柔' },
    { id: 'strong', name: '強烈' }
  ];

  VS.toast = function (msg, type) {
    let box = VS.$('.toast-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toast-box';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' toast-' + type : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 300);
    }, 3200);
  };

  VS.downloadBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // TTS 引擎註冊表：每個引擎檔案呼叫 VS.engines.register() 加入
  VS.engines = {
    list: [],
    register(engine) { this.list.push(engine); },
    get(id) { return this.list.find(e => e.id === id) || null; }
  };

  // 與直播模式頁同步（同一個瀏覽器內）
  VS.channel = 'BroadcastChannel' in window ? new BroadcastChannel('voicesprite-live') : null;
  VS.broadcast = function (msg) {
    if (!VS.channel) return;
    try { VS.channel.postMessage(msg); } catch (e) { /* 忽略 */ }
  };

  function setupPage() {
    const page = document.body.dataset.page;
    VS.$$('.site-nav a').forEach(a => {
      if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
    });

    const els = VS.$$('.reveal');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12 });
      els.forEach(el => io.observe(el));
    } else {
      els.forEach(el => el.classList.add('in'));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupPage);
  else setupPage();
})(window.VS);

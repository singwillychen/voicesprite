/* VoiceSprite 聲線工坊：共用工具 */
window.VS = window.VS || {};
(function (VS) {
  'use strict';

  // 每次更新網站時，HTML 引用的檔案都加上 ?v=版本號，避免瀏覽器混用新舊快取
  VS.VERSION = '20261003-1701';

  // 網站剛更新時若仍有舊版快取導致程式出錯，提示重新整理，而不是默默少了功能
  let staleWarned = false;
  window.addEventListener('error', e => {
    if (staleWarned || !e.filename || e.filename.indexOf(location.origin) !== 0 || !/\/js\//.test(e.filename)) return;
    staleWarned = true;
    const key = /Mac/i.test(navigator.platform || '') ? 'Cmd + Shift + R' : 'Ctrl + Shift + R';
    const show = () => VS.toast(VS.t('網站剛更新，部分檔案還是舊版。請按 {key} 重新整理。', { key }), 'error');
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  });

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
    { id: 'calm', name: VS.t('平靜') },
    { id: 'happy', name: VS.t('開心') },
    { id: 'angry', name: VS.t('生氣') },
    { id: 'sad', name: VS.t('悲傷') },
    { id: 'surprised', name: VS.t('驚訝') }
  ];

  VS.TONES = [
    { id: 'flat', name: VS.t('平淡') },
    { id: 'gentle', name: VS.t('溫柔') },
    { id: 'strong', name: VS.t('強烈') }
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

  // 正式網址：在別人的預覽框架（例如 sandbox iframe）裡無法切換分頁時，改開這裡
  VS.SITE_URL = 'https://singwillychen.github.io/voicesprite/';
  VS.isSandboxPreview = location.protocol === 'about:' ||
    (window.origin === 'null' && location.protocol !== 'file:');

  function setupSandboxPreview() {
    VS.$$('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!/^[a-z0-9-]+\.html(#.*)?$/i.test(href)) return;
      a.href = VS.SITE_URL + href;
      a.target = '_blank';
      a.rel = 'noopener';
    });
    const bar = document.createElement('div');
    bar.className = 'preview-notice';
    bar.innerHTML = VS.t('目前是預覽模式：切換頁面會在新分頁開啟正式網站，錄音與儲存功能也請在正式網站使用。') +
      `<a href="${VS.SITE_URL}" target="_blank" rel="noopener">${VS.t('開啟正式網站 ↗')}</a>`;
    document.body.prepend(bar);
  }

  function setupPage() {
    if (VS.isSandboxPreview) setupSandboxPreview();
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

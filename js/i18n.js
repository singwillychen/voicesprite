/* 中英文切換
 * - 以中文原文當索引：VS.t('中文 {n}', { n }) 在英文模式下查 VS.I18N_EN（js/i18n-en.js）
 * - 頁面上的靜態中文文字與 placeholder／title／aria-label 會自動換成英文
 * - 一整段含粗體、連結的文字，用 data-i18n-html="key" 對應 VS.I18N_EN_HTML[key]
 * - 切換語言會重新整理頁面，讓所有動態內容一起換
 * 必須在 app.js 之前載入（app.js 等檔案會用到 VS.t） */
window.VS = window.VS || {};
(function (VS) {
  'use strict';

  const STORE_KEY = 'vs.lang';

  function detect() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved === 'zh' || saved === 'en') return saved;
    } catch (e) { /* 沒有存過或無法讀取 */ }
    return /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  }

  const lang = detect();
  const EN = VS.I18N_EN || {};
  const EN_HTML = VS.I18N_EN_HTML || {};

  VS.lang = lang;
  VS.locale = lang === 'en' ? 'en-US' : 'zh-TW';
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant-TW';

  const fill = (s, vars) => (vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s);
  const norm = s => s.replace(/\s+/g, ' ').trim();

  // 判斷一段要念的文字是中文還是英文（有漢字就算中文）
  VS.textLang = function (text) {
    const s = String(text || '');
    if (/[㐀-鿿豈-﫿]/.test(s)) return 'zh';
    return /[A-Za-z]/.test(s) ? 'en' : (lang === 'en' ? 'en' : 'zh');
  };

  VS.t = function (zh, vars) {
    const s = lang === 'en' && EN[zh] != null ? EN[zh] : zh;
    return fill(s, vars);
  };

  /* ---------- 翻譯頁面上的靜態文字 ---------- */
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const SKIP = 'script,style,code,pre,[data-i18n-skip]';

  function translateDom(root) {
    if (lang !== 'en') return;
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
      const html = EN_HTML[el.getAttribute('data-i18n-html')];
      if (html != null) el.innerHTML = html;
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement && n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const key = norm(n.nodeValue);
      if (!key || EN[key] == null) return;
      const lead = /^\s/.test(n.nodeValue) ? ' ' : '';
      const trail = /\s$/.test(n.nodeValue) ? ' ' : '';
      n.nodeValue = lead + EN[key] + trail;
    });
    root.querySelectorAll('*').forEach(el => {
      ATTRS.forEach(a => {
        const v = el.getAttribute(a);
        if (v && EN[norm(v)] != null) el.setAttribute(a, EN[norm(v)]);
      });
    });
  }

  function translateHead() {
    if (lang !== 'en') return;
    if (EN[norm(document.title)] != null) document.title = EN[norm(document.title)];
    const meta = document.querySelector('meta[name="description"]');
    if (meta && EN[norm(meta.content)] != null) meta.content = EN[norm(meta.content)];
  }

  // 開發用：在主控台輸入 VS.i18n.missing() 列出還沒翻譯的中文
  function missing() {
    const out = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.parentElement && n.parentElement.closest('script,style,[data-i18n-skip]')) continue;
      if (/[㐀-鿿]/.test(n.nodeValue)) out.add(norm(n.nodeValue));
    }
    return Array.from(out);
  }

  /* ---------- 切換按鈕 ---------- */
  function setLang(next) {
    if (next === lang) return;
    if (VS.i18n.beforeSwitch && VS.i18n.beforeSwitch() === false) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch (e) { /* 忽略 */ }
    location.reload();
  }

  function addToggle() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-toggle';
    btn.textContent = lang === 'en' ? '中文' : 'EN';
    btn.setAttribute('aria-label', lang === 'en' ? '切換為中文' : 'Switch to English');
    btn.setAttribute('lang', lang === 'en' ? 'zh-Hant-TW' : 'en');
    btn.addEventListener('click', () => setLang(lang === 'en' ? 'zh' : 'en'));
    const slot = document.querySelector('[data-lang-slot]');
    const header = document.querySelector('.site-header .inner');
    if (slot) slot.replaceWith(btn);
    else if (header) header.appendChild(btn);
  }

  VS.i18n = { lang, setLang, translate: translateDom, missing };

  translateHead();
  translateDom(document.body);
  addToggle();
})(window.VS);

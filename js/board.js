/* 直播台詞板：常用台詞清單（文字轉語音頁與直播頁共用） */
(function (VS) {
  'use strict';

  const KEY = 'board';
  const MAX = 20;

  function list() {
    const l = VS.prefs.get(KEY, []);
    return Array.isArray(l) ? l : [];
  }

  function save(l) { VS.prefs.set(KEY, l); }

  function add(text, emotion) {
    const l = list();
    if (l.length >= MAX) throw new Error(VS.t('台詞板最多 {n} 句', { n: MAX }));
    const p = { id: 'ph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text, emotion, clip: null };
    l.push(p);
    save(l);
    return p;
  }

  function remove(id) {
    const l = list();
    const p = l.find(x => x.id === id);
    save(l.filter(x => x.id !== id));
    if (p && p.clip && VS.clipStore) VS.clipStore.remove(p.clip.key).catch(() => {});
  }

  function setClip(id, clip) {
    const l = list();
    const p = l.find(x => x.id === id);
    if (!p) return;
    p.clip = clip;
    save(l);
  }

  function clearClips() {
    const l = list();
    l.forEach(p => { p.clip = null; });
    save(l);
  }

  // 已生成的語音必須是用目前選擇的聲線特徵檔做的
  function isReady(p, profileId) {
    return !!(p.clip && profileId && p.clip.profileId === profileId);
  }

  VS.board = { KEY, MAX, list, add, remove, setClip, clearClips, isReady };
})(window.VS);

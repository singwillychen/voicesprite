/* 聲線特徵檔：存放在瀏覽器 IndexedDB，並提供匯出／匯入 */
(function (VS) {
  'use strict';

  const DB_NAME = 'voicesprite';
  const STORE = 'profiles';
  const FORMAT = 'voicesprite-profile';
  const VERSION = 1;

  const memory = new Map(); // IndexedDB 無法使用時（例如部分無痕模式）的備援
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve(null);
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  function request(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

  async function list() {
    const db = await open();
    if (!db) return Array.from(memory.values()).sort(byNewest);
    const all = await request(db, 'readonly', s => s.getAll());
    return (all || []).sort(byNewest);
  }

  async function get(id) {
    if (!id) return null;
    const db = await open();
    if (!db) return memory.get(id) || null;
    return (await request(db, 'readonly', s => s.get(id))) || null;
  }

  async function put(profile) {
    const db = await open();
    if (!db) { memory.set(profile.id, profile); return profile; }
    await request(db, 'readwrite', s => s.put(profile));
    return profile;
  }

  async function remove(id) {
    const db = await open();
    if (!db) { memory.delete(id); return; }
    await request(db, 'readwrite', s => s.delete(id));
    if (VS.prefs.get('profile', '') === id) VS.prefs.set('profile', '');
  }

  function newId() {
    return 'vp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function exportProfile(profile) {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const safe = String(profile.name || 'voice').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'voice';
    VS.downloadBlob(blob, safe + '.voiceprofile.json');
  }

  async function importFile(file) {
    const text = await file.text();
    let p;
    try { p = JSON.parse(text); } catch (e) { throw new Error('檔案不是有效的 JSON'); }
    if (!p || p.format !== FORMAT) throw new Error('這不是 VoiceSprite 聲線特徵檔');
    if (typeof p.version !== 'number' || p.version > VERSION) throw new Error('特徵檔版本較新，請更新網站後再匯入');
    if (!p.features || !p.features.f0 || typeof p.features.f0.median !== 'number') throw new Error('特徵檔缺少必要的聲學資料');
    p.name = String(p.name || '匯入的聲線').slice(0, 40);
    if (!p.id || await get(p.id)) p.id = newId();
    p.importedAt = new Date().toISOString();
    if (!p.createdAt) p.createdAt = p.importedAt;
    if (!Array.isArray(p.references)) p.references = [];
    await put(p);
    return p;
  }

  async function getSelected() {
    return get(VS.prefs.get('profile', ''));
  }

  VS.profileStore = { FORMAT, VERSION, list, get, put, remove, newId, exportProfile, importFile, getSelected };
})(window.VS);

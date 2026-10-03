/* 已生成的語音快取：存在 IndexedDB，相同文字＋聲線＋設定不必重新生成 */
(function (VS) {
  'use strict';

  const DB_NAME = 'voicesprite-clips';
  const STORE = 'clips';
  const memory = new Map();
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve(null);
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
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

  async function get(key) {
    const db = await open();
    const row = db ? await request(db, 'readonly', s => s.get(key)) : memory.get(key);
    return row ? { samples: row.samples, sampleRate: row.sampleRate } : null;
  }

  async function put(key, samples, sampleRate) {
    const row = { key, samples, sampleRate, createdAt: Date.now() };
    const db = await open();
    if (!db) { memory.set(key, row); return; }
    await request(db, 'readwrite', s => s.put(row));
  }

  async function remove(key) {
    const db = await open();
    if (!db) { memory.delete(key); return; }
    await request(db, 'readwrite', s => s.delete(key));
  }

  async function clear() {
    const db = await open();
    if (!db) { memory.clear(); return; }
    await request(db, 'readwrite', s => s.clear());
  }

  // FNV-1a 雜湊，把設定組合成短的快取鍵
  function key(parts) {
    const str = parts.join('␟');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return 'c_' + (h >>> 0).toString(16) + '_' + str.length;
  }

  VS.clipStore = { get, put, remove, clear, key };
})(window.VS);

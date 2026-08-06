const DB_NAME = 'finanzasClarasDB';
const DB_VERSION = 1;
let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) { resolve(dbInstance); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('transactions')) {
        const store = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

async function addTransaction(tx) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('transactions', 'readwrite');
    const store = t.objectStore('transactions');
    const req = store.add(tx);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deleteTransaction(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('transactions', 'readwrite');
    const store = t.objectStore('transactions');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function updateTransaction(tx) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('transactions', 'readwrite');
    const store = t.objectStore('transactions');
    const req = store.put(tx);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getAllTransactions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('transactions', 'readonly');
    const store = t.objectStore('transactions');
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      all.sort((a, b) => new Date(b.date) - new Date(a.date));
      resolve(all);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getSetting(key, defaultValue) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('settings', 'readonly');
    const store = t.objectStore('settings');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function setSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('settings', 'readwrite');
    const store = t.objectStore('settings');
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}
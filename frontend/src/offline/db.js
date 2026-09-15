// MODULE 14 - Offline-first local storage for field reports.
//
// A small hand-written IndexedDB wrapper (no external dependency - this is
// ~40 lines of actual API surface, pulling in a library would be
// overengineering for it). Every report gets a client-generated UUID up
// front, which is what makes the later server sync idempotent (see
// backend POST /api/field-reports/sync).
//
//   LOCAL DATA (this file) -> SYNC QUEUE -> SERVER -> CENTRAL DASHBOARD

const DB_NAME = 'sih26002-offline';
const STORE = 'pending_reports';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'client_uuid' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueReport(report) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(report);
    tx.oncomplete = () => resolve(report);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingReports() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeReport(client_uuid) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(client_uuid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function newClientUuid() {
  return crypto.randomUUID();
}

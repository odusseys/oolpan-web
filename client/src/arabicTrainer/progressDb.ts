import type { ReviewStat } from "./types";

const DB_NAME = "arabic-letter-trainer";
const DB_VERSION = 1;
const STORE_NAME = "reviewStats";

export async function loadReviewStats() {
  const db = await openProgressDb();

  return new Promise<Map<string, ReviewStat>>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => {
      const stats = new Map<string, ReviewStat>();
      for (const stat of request.result as ReviewStat[]) {
        stats.set(stat.key, stat);
      }
      resolve(stats);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function saveReviewStat(stat: ReviewStat) {
  const db = await openProgressDb();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).put(stat);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function openProgressDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

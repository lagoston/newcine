// O armário do aparelho (IndexedDB) da camada de dados — 18/11/2026.
//
// Dois compartimentos: 'pub' (dado público, uma entrada só) e 'user' (uma
// entrada por pessoa, com o id dela como chave). Tudo aqui é "melhor esforço":
// sem IndexedDB (modo anônimo antigo, WebView restrito) ou com qualquer erro, as
// funções não fazem nada e o app segue só com a memória.
//
// As operações rodam UMA DE CADA VEZ, na ordem em que foram pedidas. É o que
// garante que um "apagar" (logout) nunca seja atropelado por um "gravar" que
// estava na fila.

const DB_NAME = 'cineoracle-data';
const DB_VERSION = 1;
export type Store = 'pub' | 'user';
const STORES: Store[] = ['pub', 'user'];
const OPEN_TIMEOUT_MS = 1000;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    // alguns navegadores nunca respondem ao abrir: não esperamos para sempre
    const timer = setTimeout(() => resolve(null), OPEN_TIMEOUT_MS);
    const finish = (db: IDBDatabase | null) => {
      clearTimeout(timer);
      resolve(db);
    };
    try {
      if (typeof indexedDB === 'undefined') return finish(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        });
      };
      request.onsuccess = () => {
        const db = request.result;
        // outra aba pediu uma versão nova do armário: solta este
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        finish(db);
      };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
  return dbPromise;
}

let chain: Promise<unknown> = Promise.resolve();

function run<T>(store: Store, mode: IDBTransactionMode, work: (os: IDBObjectStore, set: (value: T) => void) => void): Promise<T | undefined> {
  const task = chain.then(async () => {
    const db = await openDb();
    if (!db) return undefined;
    return new Promise<T | undefined>((resolve) => {
      try {
        let result: T | undefined;
        const tx = db.transaction(store, mode);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => resolve(undefined);
        tx.onabort = () => resolve(undefined);
        work(tx.objectStore(store), (value) => {
          result = value;
        });
      } catch {
        resolve(undefined);
      }
    });
  });
  chain = task.catch(() => undefined);
  return task;
}

export function kvGet<T>(store: Store, key: string): Promise<T | undefined> {
  return run<T>(store, 'readonly', (os, set) => {
    const request = os.get(key);
    request.onsuccess = () => set(request.result as T);
  });
}

export function kvSet(store: Store, key: string, value: unknown): Promise<void> {
  return run<void>(store, 'readwrite', (os) => {
    os.put(value, key);
  });
}

export function kvDelete(store: Store, key: string): Promise<void> {
  return run<void>(store, 'readwrite', (os) => {
    os.delete(key);
  });
}

// Apaga todas as entradas do compartimento, menos a de `keep` (null = todas).
export function kvKeepOnly(store: Store, keep: string | null): Promise<void> {
  return run<void>(store, 'readwrite', (os) => {
    if (keep === null) {
      os.clear();
      return;
    }
    const request = os.getAllKeys();
    request.onsuccess = () => {
      request.result.forEach((key) => {
        if (key !== keep) os.delete(key);
      });
    };
  });
}

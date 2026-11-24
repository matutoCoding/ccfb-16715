// IndexedDB 轻量封装, Promise 化
const DB_NAME = "darkfield_db"
const DB_VERSION = 1

export const STORES = {
  materials: "materials",
  wafers: "wafers",
  defectLib: "defect_lib",
  recipes: "recipes",
  settings: "settings",
} as const

let dbPromise: Promise<IDBDatabase> | null = null

const open_db = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const tx = async <T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open_db()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const db = {
  getAll: <T>(store: string): Promise<T[]> => tx(store, "readonly", (s) => s.getAll()) as Promise<T[]>,
  get: <T>(store: string, id: string): Promise<T | undefined> =>
    tx(store, "readonly", (s) => s.get(id)) as Promise<T | undefined>,
  put: <T>(store: string, value: T): Promise<IDBValidKey> => tx(store, "readwrite", (s) => s.put(value)),
  del: (store: string, id: string): Promise<undefined> => tx(store, "readwrite", (s) => s.delete(id)),
  clear: (store: string): Promise<undefined> => tx(store, "readwrite", (s) => s.clear()),
}

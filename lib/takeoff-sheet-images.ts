// The pictures of a take-off's plans, kept on this device. They used to be saved inside the project in localStorage, which holds only about 5MB: one big plan could fill it (and then NOTHING of the take-off was
// saved), and several plans never would fit. They are kept in IndexedDB instead (hundreds of MB), one picture per project and sheet. If the browser will not give us IndexedDB (a private window), they are held
// in memory for the session and `imagesArePersistent()` says so, so the screen can warn that they will not survive a reload. They are never sent to the cloud: only the sheets' names, scales and drawings are.

const DB_NAME = 'sbc-takeoff-images'
const STORE = 'images'

const memory = new Map<string, string>()
let persistent = true
let dbPromise: Promise<IDBDatabase | null> | null = null

const keyOf = (projectId: string, sheetId: string) => `${projectId}:${sheetId}`

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { persistent = false; resolve(null); return }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => { persistent = false; resolve(null) }
      req.onblocked = () => { persistent = false; resolve(null) }
    } catch { persistent = false; resolve(null) }
  })
  return dbPromise
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req ? (req.result as T) : undefined)
      tx.onerror = () => resolve(undefined)
      tx.onabort = () => resolve(undefined)
    } catch { resolve(undefined) }
  })
}

/** False once it is known the pictures will only last for this visit. */
export const imagesArePersistent = (): boolean => persistent

/** Keeps a sheet's picture (a data: URL). Returns whether it was saved to the device (it is always kept in memory for the session). */
export async function putSheetImage(projectId: string, sheetId: string, dataUrl: string): Promise<boolean> {
  memory.set(keyOf(projectId, sheetId), dataUrl)
  const db = await openDb()
  if (!db) return false
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(dataUrl, keyOf(projectId, sheetId))
    return await new Promise<boolean>(resolve => { tx.oncomplete = () => resolve(true); tx.onerror = () => { persistent = false; resolve(false) }; tx.onabort = () => { persistent = false; resolve(false) } })
  } catch { persistent = false; return false }
}

export async function getSheetImage(projectId: string, sheetId: string): Promise<string | null> {
  const k = keyOf(projectId, sheetId)
  const inMemory = memory.get(k)
  if (inMemory) return inMemory
  const db = await openDb()
  if (!db) return null
  const found = await run<string>(db, 'readonly', store => store.get(k))
  if (typeof found === 'string') { memory.set(k, found); return found }
  return null
}

export async function deleteSheetImage(projectId: string, sheetId: string): Promise<void> {
  const k = keyOf(projectId, sheetId)
  memory.delete(k)
  const db = await openDb()
  if (db) await run(db, 'readwrite', store => { store.delete(k) })
}

/** Removes every picture of a project (when the take-off is reset). */
export async function deleteProjectImages(projectId: string): Promise<void> {
  const prefix = `${projectId}:`
  for (const k of Array.from(memory.keys())) if (k.startsWith(prefix)) memory.delete(k)
  const db = await openDb()
  if (!db) return
  await run(db, 'readwrite', store => {
    const range = IDBKeyRange.bound(prefix, prefix + '￿')
    store.delete(range)
  })
}

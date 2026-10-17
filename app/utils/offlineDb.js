import {
    OFFLINE_DB,
    OFFLINE_DB_VERSION,
    OFFLINE_EP_STORE,
    OFFLINE_HISTORY_STORE,
    OFFLINE_META_STORE,
} from '#shared/utils/offline'

const STORES = [OFFLINE_EP_STORE, OFFLINE_META_STORE, OFFLINE_HISTORY_STORE]

let dbPromise = null

function openDb() {
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(OFFLINE_DB, OFFLINE_DB_VERSION)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result)
        req.onupgradeneeded = (e) => {
            const db = e.target.result
            for (const name of STORES) {
                if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
            }
        }
    })
    return dbPromise
}

function asPromise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

function complete(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

async function openStore(storeName, mode) {
    const db = await openDb()
    const tx = db.transaction(storeName, mode)
    return { tx, store: tx.objectStore(storeName) }
}

export async function idbGet(storeName, key) {
    const { store } = await openStore(storeName, 'readonly')
    return asPromise(store.get(key))
}

export async function idbPut(storeName, key, value) {
    const { tx, store } = await openStore(storeName, 'readwrite')
    store.put(value, key)
    return complete(tx)
}

export async function idbDelete(storeName, key) {
    const { tx, store } = await openStore(storeName, 'readwrite')
    store.delete(key)
    return complete(tx)
}

export async function idbKeys(storeName) {
    const { store } = await openStore(storeName, 'readonly')
    return (await asPromise(store.getAllKeys())) || []
}

export async function idbPairs(storeName) {
    const { tx, store } = await openStore(storeName, 'readonly')
    const keysReq = store.getAllKeys()
    const valsReq = store.getAll()
    await complete(tx)
    const keys = keysReq.result || []
    const values = valsReq.result || []
    return keys.map((key, i) => ({ key, value: values[i] }))
}

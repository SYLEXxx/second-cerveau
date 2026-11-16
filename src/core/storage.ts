import type { VaultState } from './types';
import { emptyVault, seedVault } from './vault';

// Sauvegarde locale dans IndexedDB (plus grand et plus fiable que localStorage).
// Une copie de secours de l'avant-dernière version est gardée à côté.

const DB_NAME = 'second_cerveau';
const STORE = 'kv';
const KEY = 'vault';
const BACKUP_KEY = 'vault.bak';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req ? req.result : undefined);
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export function migrateVault(raw: unknown): VaultState {
  const v = raw as Partial<VaultState> | null;
  if (!v || typeof v !== 'object' || !v.pages) throw new Error('Format de coffre inconnu');
  const out = emptyVault();
  out.pages = v.pages;
  out.order = { ...out.order, ...(v.order ?? {}) };
  for (const p of Object.values(out.pages)) {
    p.props ??= {};
    p.content ??= '';
    p.icon ??= '';
    p.favorite ??= false;
  }
  return out;
}

export async function loadVault(): Promise<{ state: VaultState; fresh: boolean }> {
  try {
    const text = await tx<string>('readonly', (s) => s.get(KEY));
    if (text) return { state: migrateVault(JSON.parse(text)), fresh: false };
  } catch (e) {
    console.warn('Coffre illisible, tentative avec la copie de secours', e);
    const bak = await tx<string>('readonly', (s) => s.get(BACKUP_KEY)).catch(() => undefined);
    if (bak) return { state: migrateVault(JSON.parse(bak)), fresh: false };
  }
  const state = emptyVault();
  seedVault(state);
  return { state, fresh: true };
}

let lastSaved: string | null = null;

export async function saveVault(state: VaultState): Promise<void> {
  const text = JSON.stringify(state);
  if (text === lastSaved) return;
  await tx('readwrite', (s) => {
    if (lastSaved) s.put(lastSaved, BACKUP_KEY);
    s.put(text, KEY);
  });
  lastSaved = text;
}

/** Demande au navigateur de ne pas effacer les données en cas de manque de place. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

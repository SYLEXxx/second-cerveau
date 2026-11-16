import type { FileFilter, Platform } from './platform';
import { getPref, setPref } from './prefs';
import { saveBlob } from '../../../platform/files';

// Même clé que la version HTML v4.4 : les données déjà saisies dans le
// navigateur sont reprises telles quelles en mode développement web.
const STORAGE_KEY = 'monbudgetpro_data';

// Comme côté Rust : UTF-8 si possible, sinon Windows-1252 (relevés bancaires français).
function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

// Pièces jointes du mode navigateur : IndexedDB (localStorage est trop petit).
function attachmentsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('monbudgetpro_attachments', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await attachmentsDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('files', mode).objectStore('files'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Sur téléphone, l'enregistrement passe par la feuille de partage (Drive, Fichiers...).
const download = (defaultName: string, blob: Blob) => saveBlob(defaultName, blob);

export function createBrowserPlatform(): Platform {
  return {
    isDesktop: false,

    async loadState() {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },

    async saveState(json) {
      try {
        localStorage.setItem(STORAGE_KEY, json);
      } catch (e) {
        console.warn('Stockage indisponible', e);
      }
    },

    async saveTextFile(defaultName, contents) {
      return download(defaultName, new Blob([contents], { type: 'application/octet-stream' }));
    },

    async saveBinaryFile(defaultName, bytes) {
      return download(defaultName, new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
    },

    async putAttachment(id, bytes) {
      await withStore('readwrite', (s) => s.put(bytes, id));
    },

    async getAttachment(id) {
      const v = await withStore<unknown>('readonly', (s) => s.get(id));
      return v instanceof Uint8Array ? v : null;
    },

    async deleteAttachment(id) {
      await withStore('readwrite', (s) => s.delete(id));
    },

    openTextFile(filter: FileFilter) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = filter.extensions.map((e) => '.' + e).join(',');
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          file.arrayBuffer().then((buf) => resolve(decodeText(buf)), () => resolve(null));
        });
        input.addEventListener('cancel', () => resolve(null));
        input.click();
      });
    },

    getPref,
    setPref,

    onBeforeExit(fn) {
      window.addEventListener('beforeunload', () => void fn());
    },
  };
}

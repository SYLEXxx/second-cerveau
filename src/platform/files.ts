import { Capacitor } from '@capacitor/core';

// Fichiers : téléchargement dans un navigateur, feuille de partage Android/iOS dans l'application.

export const isNative = (): boolean => Capacitor.isNativePlatform();
/** Application de bureau (Tauri, Windows / macOS / Linux). */
export const isDesktop = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function saveBlob(name: string, blob: Blob): Promise<boolean> {
  if (isDesktop()) {
    // PC : boîte « Enregistrer sous » puis écriture par la partie native (src-tauri).
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    const ext = name.includes('.') ? name.split('.').pop()! : '';
    const path = await save({ defaultPath: name, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
    if (!path) return false;
    await invoke('write_binary_file', { path, base64: await blobToBase64(blob) });
    return true;
  }
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title: name, files: [res.uri] });
    } catch {
      return false; // partage annulé
    }
    return true;
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  return true;
}

/** Fait choisir un ou plusieurs fichiers ; renvoie [] si annulé. */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener('change', () => resolve([...(input.files ?? [])]));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

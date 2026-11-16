// Chiffrement du fichier de données par mot de passe (AES-GCM 256 bits, clé
// dérivée par PBKDF2-SHA256). Sans le mot de passe, le fichier est illisible ;
// il n'existe aucun moyen de le récupérer en cas d'oubli.

const ITERATIONS = 310_000;

export interface Envelope {
  monbudgetproEncrypted: 1;
  salt: string;
  iv: string;
  data: string;
}

export interface VaultKey {
  key: CryptoKey;
  salt: Uint8Array;
}

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function isEncrypted(raw: string): boolean {
  try {
    return (JSON.parse(raw) as Partial<Envelope>).monbudgetproEncrypted === 1;
  } catch {
    return false;
  }
}

export async function deriveKey(password: string, salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): Promise<VaultKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { key, salt };
}

export async function encryptBytes(vk: VaultKey, plain: Uint8Array): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vk.key, plain as BufferSource));
  return { monbudgetproEncrypted: 1, salt: toB64(vk.salt), iv: toB64(iv), data: toB64(data) };
}

export async function decryptBytes(vk: VaultKey, env: Envelope): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) as BufferSource }, vk.key, fromB64(env.data) as BufferSource));
}

export const encryptText = async (vk: VaultKey, text: string) => JSON.stringify(await encryptBytes(vk, new TextEncoder().encode(text)));

/** Déchiffre un fichier ; renvoie la clé pour réchiffrer les sauvegardes suivantes. Lève une erreur si le mot de passe est faux. */
export async function unlock(raw: string, password: string): Promise<{ text: string; vault: VaultKey }> {
  const env = JSON.parse(raw) as Envelope;
  const vault = await deriveKey(password, fromB64(env.salt));
  const plain = await decryptBytes(vault, env);
  return { text: new TextDecoder().decode(plain), vault };
}

export { fromB64, toB64 };

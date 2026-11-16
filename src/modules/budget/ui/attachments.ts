import { decryptBytes, encryptBytes, type Envelope, type VaultKey } from '../domain/vault';
import type { AttachmentRef, BudgetState } from '../domain/types';
import type { AppContext } from './context';
import { closeModal, openModal, showToast } from './dialogs';
import { byId, on } from './dom';

// Pièces jointes des dépenses : le fichier est rangé à part (dossier
// « pieces-jointes » des données) et chiffré lui aussi quand un mot de passe
// protège l'application.

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function seal(bytes: Uint8Array, vault: VaultKey | null): Promise<Uint8Array> {
  return vault ? encoder.encode(JSON.stringify(await encryptBytes(vault, bytes))) : bytes;
}

function asEnvelope(bytes: Uint8Array): Envelope | null {
  if (bytes[0] !== 0x7b) return null; // « { »
  try {
    const env = JSON.parse(decoder.decode(bytes)) as Envelope;
    return env.monbudgetproEncrypted === 1 ? env : null;
  } catch {
    return null;
  }
}

async function unseal(bytes: Uint8Array, vault: VaultKey | null): Promise<Uint8Array> {
  const env = asEnvelope(bytes);
  if (!env) return bytes;
  if (!vault) throw new Error('Pièce jointe chiffrée sans mot de passe');
  return decryptBytes(vault, env);
}

export async function storeAttachment({ platform, store }: AppContext, file: File): Promise<AttachmentRef> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('Fichier trop lourd (10 Mo maximum)');
  const id = `pj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await platform.putAttachment(id, await seal(bytes, store.vaultKey));
  return { id, name: file.name, type: file.type || 'application/octet-stream', size: file.size };
}

export async function readAttachment({ platform, store }: AppContext, ref: AttachmentRef): Promise<Uint8Array | null> {
  const raw = await platform.getAttachment(ref.id);
  return raw ? unseal(raw, store.vaultKey) : null;
}

export const removeAttachment = ({ platform }: AppContext, ref: AttachmentRef) => platform.deleteAttachment(ref.id).catch(() => undefined);

export function allAttachments(s: BudgetState): AttachmentRef[] {
  return Object.values(s.actualExpenses).flatMap((list) => list.flatMap((t) => t.attachments ?? []));
}

/** Après un changement de mot de passe : chaque pièce jointe est réécrite avec la nouvelle clé (ou en clair). */
export async function resealAll(ctx: AppContext, from: VaultKey | null, to: VaultKey | null): Promise<number> {
  let failed = 0;
  for (const ref of allAttachments(ctx.store.get())) {
    try {
      const raw = await ctx.platform.getAttachment(ref.id);
      if (!raw) continue;
      await ctx.platform.putAttachment(ref.id, await seal(await unseal(raw, from), to));
    } catch {
      failed++;
    }
  }
  return failed;
}

let viewerUrl: string | null = null;
let viewerFile: { ref: AttachmentRef; bytes: Uint8Array } | null = null;

const closeViewer = () => {
  closeModal('modal-viewer', 'modal-viewer-box');
  setTimeout(() => {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = null;
    viewerFile = null;
    const body = byId('modal-viewer-body');
    if (body) body.innerHTML = '';
  }, 220);
};

export function mountViewer(ctx: AppContext): void {
  on('modal-viewer-close', 'click', closeViewer);
  on('modal-viewer-download', 'click', async () => {
    if (!viewerFile) return;
    const ext = viewerFile.ref.name.includes('.') ? viewerFile.ref.name.split('.').pop()! : 'bin';
    const ok = await ctx.platform.saveBinaryFile(viewerFile.ref.name, viewerFile.bytes, { name: 'Pièce jointe', extensions: [ext] });
    if (ok) showToast('Copie enregistrée');
  });
}

export async function showAttachment(ctx: AppContext, ref: AttachmentRef): Promise<void> {
  try {
    const bytes = await readAttachment(ctx, ref);
    if (!bytes) {
      showToast('Pièce jointe introuvable', false);
      return;
    }
    viewerFile = { ref, bytes };
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: ref.type }));
    const body = byId('modal-viewer-body');
    const title = byId('modal-viewer-title');
    if (title) title.textContent = ref.name;
    if (body) {
      if (ref.type.startsWith('image/')) {
        body.innerHTML = `<img src="${viewerUrl}" alt="" class="max-w-full max-h-full object-contain">`;
      } else if (ref.type === 'application/pdf') {
        body.innerHTML = `<iframe src="${viewerUrl}" class="w-full h-full rounded-b-2xl" title="Aperçu"></iframe>`;
      } else {
        body.innerHTML = `<p class="text-sm text-slate-500 p-6 text-center">Aperçu indisponible pour ce type de fichier.<br>Utilisez « Enregistrer une copie » pour l'ouvrir.</p>`;
      }
    }
    openModal('modal-viewer', 'modal-viewer-box');
  } catch {
    showToast("Impossible d'ouvrir la pièce jointe", false);
  }
}

/** Fait choisir un fichier image ou PDF. */
export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

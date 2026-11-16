import { byId } from './dom';

// Modales et notifications. Remplacent confirm()/prompt() du navigateur, qui
// n'existent pas dans la fenêtre de l'application de bureau.

export function openModal(modalId: string, boxId: string): void {
  const modal = byId(modalId);
  modal?.classList.remove('hidden');
  setTimeout(() => {
    modal?.classList.remove('opacity-0');
    byId(boxId)?.classList.remove('scale-95');
  }, 10);
}

export function closeModal(modalId: string, boxId: string): void {
  const modal = byId(modalId);
  modal?.classList.add('opacity-0');
  byId(boxId)?.classList.add('scale-95');
  setTimeout(() => modal?.classList.add('hidden'), 200);
}

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const msgEl = byId('custom-confirm-message');
    const okBtn = byId('custom-confirm-ok');
    const cancelBtn = byId('custom-confirm-cancel');
    if (!msgEl || !okBtn || !cancelBtn) return resolve(true);

    msgEl.textContent = message;
    openModal('custom-confirm-modal', 'custom-confirm-box');

    const cleanup = (res: boolean) => {
      closeModal('custom-confirm-modal', 'custom-confirm-box');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(res);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, isSuccess = true): void {
  const toast = byId('toast');
  const msgEl = byId('toast-message');
  const icon = byId('toast-icon');
  if (!toast || !msgEl || !icon) return;

  msgEl.textContent = message;
  icon.className = isSuccess
    ? 'fa-solid fa-circle-check text-emerald-400 dark:text-emerald-500'
    : 'fa-solid fa-triangle-exclamation text-amber-400';

  toast.classList.remove('opacity-0', 'pointer-events-none');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('opacity-0', 'pointer-events-none'), 2500);
}

/** Demande un montant ; renvoie null si l'utilisateur annule. */
export function promptAmount(title: string, label: string, initial = ''): Promise<number | null> {
  return new Promise((resolve) => {
    const form = byId<HTMLFormElement>('form-amount');
    const input = byId<HTMLInputElement>('modal-amount-input');
    const cancel = byId('modal-amount-cancel');
    if (!form || !input || !cancel) return resolve(null);

    const titleEl = byId('modal-amount-title');
    const labelEl = byId('modal-amount-label');
    if (titleEl) titleEl.textContent = title;
    if (labelEl) labelEl.textContent = label;
    input.value = initial;
    openModal('modal-amount', 'modal-amount-box');
    setTimeout(() => input.focus(), 20);

    const done = (value: number | null) => {
      closeModal('modal-amount', 'modal-amount-box');
      form.removeEventListener('submit', onSubmit);
      cancel.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onSubmit = (e: Event) => {
      e.preventDefault();
      const v = parseFloat(input.value);
      done(Number.isFinite(v) ? v : null);
    };
    const onCancel = () => done(null);
    form.addEventListener('submit', onSubmit);
    cancel.addEventListener('click', onCancel);
  });
}

export type FormField =
  | { key: string; label: string; type: 'text' | 'password'; value?: string; placeholder?: string; required?: boolean; hint?: string }
  | { key: string; label: string; type: 'number'; value?: number | null; placeholder?: string; required?: boolean; min?: number; max?: number; step?: string; hint?: string }
  | { key: string; label: string; type: 'select'; value?: string; options: { value: string; label: string }[]; hint?: string }
  | { key: string; label: string; type: 'checkbox'; value?: boolean; hint?: string };

export type FormValues = Record<string, string | number | boolean | null>;

export interface FormOptions {
  title: string;
  icon?: string;
  intro?: string;
  submitLabel?: string;
  fields: FormField[];
  /** Vérification avant fermeture : renvoie un message d'erreur pour garder la fenêtre ouverte. */
  validate?: (values: FormValues) => string | null;
}

const fieldClass = 'w-full p-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl';
const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function fieldHtml(f: FormField, i: number): string {
  const id = `ff-${i}`;
  const hint = f.hint ? `<p class="text-[11px] text-slate-400 mt-1">${attr(f.hint)}</p>` : '';
  if (f.type === 'checkbox') {
    return `<label class="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
      <input type="checkbox" id="${id}" ${f.value ? 'checked' : ''} class="mt-0.5 accent-brand-600"><span>${attr(f.label)}${hint}</span></label>`;
  }
  const label = `<label for="${id}" class="block text-xs font-semibold text-slate-500 mb-1">${attr(f.label)}</label>`;
  if (f.type === 'select') {
    const opts = f.options.map((o) => `<option value="${attr(o.value)}"${o.value === f.value ? ' selected' : ''}>${attr(o.label)}</option>`).join('');
    return `<div>${label}<select id="${id}" class="${fieldClass}">${opts}</select>${hint}</div>`;
  }
  if (f.type === 'number') {
    const v = f.value ?? '';
    return `<div>${label}<input type="number" id="${id}" value="${v}" step="${f.step ?? 'any'}"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}${f.required ? ' required' : ''} placeholder="${attr(f.placeholder ?? '')}" class="${fieldClass} font-bold">${hint}</div>`;
  }
  return `<div>${label}<input type="${f.type}" id="${id}" value="${attr(f.value ?? '')}"${f.required ? ' required' : ''} placeholder="${attr(f.placeholder ?? '')}" ${f.type === 'password' ? 'autocomplete="new-password"' : ''} class="${fieldClass}">${hint}</div>`;
}

/** Fenêtre de saisie construite à partir d'une liste de champs ; renvoie null si annulée. */
export function formDialog(opts: FormOptions): Promise<FormValues | null> {
  return new Promise((resolve) => {
    const form = byId<HTMLFormElement>('form-generic');
    const container = byId('form-generic-fields');
    const cancel = byId('modal-form-cancel');
    const closeBtn = byId('modal-form-close');
    const error = byId('modal-form-error');
    if (!form || !container || !cancel || !closeBtn || !error) return resolve(null);

    const titleEl = byId('modal-form-title');
    if (titleEl) titleEl.textContent = opts.title;
    const icon = byId('modal-form-icon');
    if (icon) icon.className = `fa-solid ${opts.icon ?? 'fa-pen'} text-brand-600`;
    const intro = byId('modal-form-intro');
    if (intro) {
      intro.textContent = opts.intro ?? '';
      intro.classList.toggle('hidden', !opts.intro);
    }
    const submit = byId('modal-form-submit');
    if (submit) submit.textContent = opts.submitLabel ?? 'Enregistrer';
    container.innerHTML = opts.fields.map(fieldHtml).join('');
    error.classList.add('hidden');
    openModal('modal-form', 'modal-form-box');
    setTimeout(() => container.querySelector<HTMLElement>('input, select')?.focus(), 30);

    const read = (): FormValues => Object.fromEntries(opts.fields.map((f, i) => {
      const el = byId<HTMLInputElement>(`ff-${i}`);
      if (!el) return [f.key, null];
      if (f.type === 'checkbox') return [f.key, el.checked];
      if (f.type === 'number') return [f.key, el.value === '' ? null : parseFloat(el.value)];
      return [f.key, el.value.trim()];
    }));
    const done = (v: FormValues | null) => {
      closeModal('modal-form', 'modal-form-box');
      form.removeEventListener('submit', onSubmit);
      cancel.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      resolve(v);
    };
    const onSubmit = (e: Event) => {
      e.preventDefault();
      const values = read();
      const message = opts.validate?.(values) ?? null;
      if (message) {
        error.textContent = message;
        error.classList.remove('hidden');
        return;
      }
      done(values);
    };
    const onCancel = () => done(null);
    form.addEventListener('submit', onSubmit);
    cancel.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
  });
}

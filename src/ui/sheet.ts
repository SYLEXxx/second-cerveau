import { el, esc } from './dom';

// Feuilles du bas (bottom sheets) : menus, saisies et confirmations adaptés au tactile.

interface Open {
  close: () => void;
}
const stack: Open[] = [];

/** Ferme la feuille du dessus ; renvoie false s'il n'y en avait pas (bouton retour Android). */
export function closeTopSheet(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export interface SheetOptions {
  title?: string;
  body: HTMLElement | string;
  onClose?: () => void;
}

export function openSheet(opts: SheetOptions): { root: HTMLElement; close: () => void } {
  const root = el(`<div class="sheet fixed inset-0 z-[150] flex items-end justify-center">
    <div class="sheet-backdrop absolute inset-0 bg-slate-900/50 opacity-0 transition-opacity"></div>
    <div class="sheet-panel relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-slate-800 rounded-t-3xl shadow-2xl translate-y-full transition-transform duration-200" style="padding-bottom:max(env(safe-area-inset-bottom),12px)">
      <div class="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600"></div>
      ${opts.title ? `<h3 class="px-5 pt-2 pb-3 text-base font-bold">${esc(opts.title)}</h3>` : ''}
      <div class="sheet-body overflow-y-auto px-5 pb-2"></div>
    </div>
  </div>`);
  const body = root.querySelector<HTMLElement>('.sheet-body')!;
  if (typeof opts.body === 'string') body.innerHTML = opts.body;
  else body.appendChild(opts.body);
  document.body.appendChild(root);
  requestAnimationFrame(() => {
    root.querySelector('.sheet-backdrop')!.classList.replace('opacity-0', 'opacity-100');
    root.querySelector('.sheet-panel')!.classList.remove('translate-y-full');
  });
  let closed = false;
  const entry: Open = {
    close() {
      if (closed) return;
      closed = true;
      stack.splice(stack.indexOf(entry), 1);
      root.querySelector('.sheet-backdrop')!.classList.replace('opacity-100', 'opacity-0');
      root.querySelector('.sheet-panel')!.classList.add('translate-y-full');
      setTimeout(() => root.remove(), 200);
      opts.onClose?.();
    },
  };
  stack.push(entry);
  root.querySelector('.sheet-backdrop')!.addEventListener('click', () => entry.close());
  return { root, close: entry.close };
}

export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  hint?: string;
  run: () => void;
}

export function openMenu(title: string | undefined, items: MenuItem[]): void {
  const list = el(`<div class="flex flex-col pb-2"></div>`);
  const sheet = openSheet({ title, body: list });
  for (const it of items) {
    const b = el<HTMLButtonElement>(`<button class="flex items-center gap-3 w-full text-left px-2 py-3 rounded-xl active:bg-slate-100 dark:active:bg-slate-700 ${it.danger ? 'text-rose-600' : ''}">
      <i class="fa-solid ${it.icon ?? 'fa-circle'} w-5 text-center ${it.danger ? '' : 'text-slate-400'}"></i>
      <span class="flex-1">${esc(it.label)}</span>${it.hint ? `<span class="text-xs text-slate-400">${esc(it.hint)}</span>` : ''}
    </button>`);
    b.addEventListener('click', () => {
      sheet.close();
      it.run();
    });
    list.appendChild(b);
  }
}

const INPUT = 'w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 border border-transparent focus:border-violet-500 outline-none';
export const inputClass = INPUT;
export const btnPrimary = 'px-4 py-2.5 rounded-xl bg-violet-600 active:bg-violet-700 text-white font-semibold';
export const btnGhost = 'px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-700 font-semibold';

export function promptText(title: string, initial = '', opts: { placeholder?: string; multiline?: boolean; type?: string; ok?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const field = opts.multiline
      ? `<textarea rows="5" class="${INPUT}" placeholder="${esc(opts.placeholder ?? '')}">${esc(initial)}</textarea>`
      : `<input type="${opts.type ?? 'text'}" class="${INPUT}" value="${esc(initial)}" placeholder="${esc(opts.placeholder ?? '')}" enterkeyhint="done">`;
    const form = el<HTMLFormElement>(`<form class="space-y-3 pb-2">${field}
      <div class="flex justify-end gap-2"><button type="button" class="${btnGhost}" data-cancel>Annuler</button><button class="${btnPrimary}">${esc(opts.ok ?? 'OK')}</button></div></form>`);
    let result: string | null = null;
    const sheet = openSheet({ title, body: form, onClose: () => resolve(result) });
    const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement>('input,textarea')!;
    setTimeout(() => {
      input.focus();
      if (input instanceof HTMLInputElement && input.type === 'text') input.select();
    }, 60);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      result = input.value;
      sheet.close();
    });
    form.querySelector('[data-cancel]')!.addEventListener('click', () => sheet.close());
  });
}

export function confirmSheet(message: string, ok = 'Confirmer', danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    const body = el(`<div class="pb-2"><p class="text-sm text-slate-600 dark:text-slate-300 mb-4">${esc(message)}</p>
      <div class="flex justify-end gap-2"><button class="${btnGhost}" data-no>Annuler</button><button class="${btnPrimary} ${danger ? '!bg-rose-600' : ''}" data-yes>${esc(ok)}</button></div></div>`);
    let result = false;
    const sheet = openSheet({ title: 'Confirmation', body, onClose: () => resolve(result) });
    body.querySelector('[data-no]')!.addEventListener('click', () => sheet.close());
    body.querySelector('[data-yes]')!.addEventListener('click', () => {
      result = true;
      sheet.close();
    });
  });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string, ok = true): void {
  let t = document.getElementById('app-toast');
  if (!t) {
    t = el(`<div id="app-toast" class="fixed left-1/2 -translate-x-1/2 z-[160] px-4 py-2.5 rounded-xl shadow-xl text-sm bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 opacity-0 pointer-events-none transition-opacity" style="bottom:calc(env(safe-area-inset-bottom) + 84px)"></div>`);
    document.body.appendChild(t);
  }
  t.innerHTML = `<i class="fa-solid ${ok ? 'fa-circle-check text-emerald-400' : 'fa-triangle-exclamation text-rose-400'} mr-1.5"></i>${esc(message)}`;
  t.classList.replace('opacity-0', 'opacity-100');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t!.classList.replace('opacity-100', 'opacity-0'), 2400);
}

const EMOJIS = '📝 📄 📓 📅 💡 ⭐ 🎯 ✅ 📌 🔖 📚 📖 🧠 💭 🗂️ 🗃️ 📊 📈 💰 💶 🏠 🚗 ✈️ 🏖️ 🍽️ 🛒 🏋️ ❤️ 🎵 🎬 🎮 🧪 🛠️ 💻 📱 🌱 🌍 🐾 👋 🎁 🔥 ⚡ 🧩 🗓️ 🏷️ 🔗 🕸️ 🚀'.split(' ');

export function pickEmoji(): Promise<string | null> {
  return new Promise((resolve) => {
    const body = el(`<div class="pb-2"><div class="grid grid-cols-8 gap-1 text-2xl">${EMOJIS.map((e) => `<button class="aspect-square rounded-lg active:bg-slate-100 dark:active:bg-slate-700" data-e="${e}">${e}</button>`).join('')}</div>
      <div class="flex gap-2 mt-3"><input class="${INPUT} flex-1" placeholder="Autre emoji…" maxlength="8"><button class="${btnGhost}" data-none>Aucune</button></div></div>`);
    let result: string | null = null;
    const sheet = openSheet({ title: 'Icône', body, onClose: () => resolve(result) });
    body.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-e],[data-none]');
      if (!b) return;
      result = b.dataset.e ?? '';
      sheet.close();
    });
    const input = body.querySelector('input')!;
    input.addEventListener('change', () => {
      result = input.value.trim();
      sheet.close();
    });
  });
}

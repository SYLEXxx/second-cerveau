export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/** Délégation : un seul écouteur pour tous les éléments `[data-action]` d'un conteneur. */
export function onAction(root: HTMLElement, handlers: Record<string, (el: HTMLElement, e: Event) => void>): void {
  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || !root.contains(target)) return;
    const h = handlers[target.dataset.action!];
    if (h) {
      e.preventDefault();
      h(target, e);
    }
  });
}

export function relTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `il y a ${Math.floor(diff / 86400)} j`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Classes Tailwind complètes (le compilateur ne voit pas les noms construits dynamiquement).
export const CHIP: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-200',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-200',
  lime: 'bg-lime-100 text-lime-800 dark:bg-lime-900/50 dark:text-lime-200',
};
export const chip = (color: string, text: string) =>
  `<span class="inline-block px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${CHIP[color] ?? CHIP.slate}">${esc(text)}</span>`;

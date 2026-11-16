import type { Page, VaultState } from '../core/types';
import { displayTitle, isDbRow } from '../core/vault';
import { esc, relTime } from './dom';

export function pageIcon(p: Page): string {
  if (p.icon) return esc(p.icon);
  return p.kind === 'database' ? '🗂️' : p.kind === 'canvas' ? '✍️' : '<i class="fa-regular fa-file-lines text-slate-400"></i>';
}

/** Ligne de liste cliquable vers une page. */
export function pageRow(s: VaultState, p: Page, extra = ''): string {
  const parent = p.parentId ? s.pages[p.parentId] : undefined;
  const where = parent ? `<span class="truncate">${isDbRow(s, p) ? '🗂️ ' : ''}${esc(displayTitle(parent))}</span> · ` : '';
  return `<a href="#/p/${p.id}" class="flex items-center gap-3 px-3 py-2.5 active:bg-slate-100 dark:active:bg-slate-700/60">
    <span class="w-7 text-center text-lg flex-shrink-0">${pageIcon(p)}</span>
    <span class="flex-1 min-w-0">
      <span class="block font-medium truncate">${esc(displayTitle(p))}</span>
      <span class="flex text-xs text-slate-400 min-w-0">${where}<span class="flex-shrink-0">${relTime(p.updatedAt)}</span></span>
      ${extra}
    </span>
  </a>`;
}

export function header(title: string, opts: { back?: boolean; actions?: string; sub?: string } = {}): string {
  return `<header class="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur safe-top">
    <div class="flex items-center gap-1 h-14 px-2">
      ${opts.back ? `<button class="icon-btn" data-action="back" aria-label="Retour"><i class="fa-solid fa-arrow-left"></i></button>` : '<div class="w-2"></div>'}
      <div class="flex-1 min-w-0"><h1 class="text-lg font-bold truncate">${title}</h1>${opts.sub ? `<p class="text-[11px] text-slate-400 truncate -mt-0.5">${opts.sub}</p>` : ''}</div>
      ${opts.actions ?? ''}
    </div>
  </header>`;
}

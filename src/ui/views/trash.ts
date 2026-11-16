import type { ViewFn } from '../app';
import { deleteForever, displayTitle, restorePage } from '../../core/vault';
import { header, pageIcon } from '../components';
import { esc, onAction, relTime } from '../dom';
import { confirmSheet, toast } from '../sheet';

export const trashView: ViewFn = (ctx, screen) => {
  const s = ctx.store.get();
  // Seules les pages mises à la corbeille directement (pas leurs sous-pages) sont listées.
  const items = Object.values(s.pages)
    .filter((p) => p.trashedAt && !(p.parentId && s.pages[p.parentId]?.trashedAt === p.trashedAt))
    .sort((a, b) => b.trashedAt! - a.trashedAt!);
  screen.innerHTML = `${header('Corbeille', { back: true, actions: items.length ? '<button class="px-3 h-9 text-sm text-rose-600 font-semibold" data-action="empty">Vider</button>' : '' })}
  <div class="max-w-2xl mx-auto px-4 pb-8">
    <div class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
    ${items
      .map(
        (p) => `<div class="flex items-center gap-3 px-3 py-2.5">
        <span class="w-6 text-center">${pageIcon(p)}</span>
        <a href="#/p/${p.id}" class="flex-1 min-w-0"><span class="block truncate font-medium">${esc(displayTitle(p))}</span><span class="text-xs text-slate-400">supprimée ${relTime(p.trashedAt!)}</span></a>
        <button class="icon-btn" data-action="restore" data-id="${p.id}" aria-label="Restaurer"><i class="fa-solid fa-rotate-left"></i></button>
        <button class="icon-btn !text-rose-500" data-action="delete" data-id="${p.id}" aria-label="Supprimer définitivement"><i class="fa-solid fa-xmark"></i></button>
      </div>`,
      )
      .join('') || '<p class="p-4 text-sm text-slate-400">La corbeille est vide.</p>'}
    </div>
  </div>`;
  onAction(screen, {
    back: () => history.back(),
    restore: (b) => {
      ctx.store.update((st) => restorePage(st, b.dataset.id!));
      toast('Page restaurée');
    },
    delete: async (b) => {
      if (await confirmSheet('Supprimer définitivement cette page ? C’est irréversible.', 'Supprimer')) ctx.store.update((st) => deleteForever(st, b.dataset.id!));
    },
    empty: async () => {
      if (await confirmSheet(`Supprimer définitivement ${items.length} page(s) ?`, 'Vider la corbeille')) ctx.store.update((st) => items.forEach((p) => deleteForever(st, p.id)));
    },
  });
};

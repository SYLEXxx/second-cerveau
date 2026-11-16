import type { ViewFn } from '../app';
import type { Page, VaultState } from '../../core/types';
import { children, displayTitle, livePages, movePage } from '../../core/vault';
import { rows } from '../../core/db';
import { header, pageIcon } from '../components';
import { esc, onAction } from '../dom';
import { openMenu } from '../sheet';

// Arborescence des pages, comme la barre latérale de Notion.

const OPEN_KEY = 'sc_tree_open';
const loadOpen = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
};
const saveOpen = (s: Set<string>) => {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...s]));
  } catch {
    /* ignoré */
  }
};

function tree(s: VaultState, parentId: string | null, depth: number, open: Set<string>): string {
  return children(s, parentId)
    .map((p) => {
      const kids = p.kind === 'database' ? [] : children(s, p.id);
      const isOpen = open.has(p.id);
      const count = p.kind === 'database' ? `<span class="text-xs text-slate-400">${rows(s, p).length}</span>` : '';
      return `<div>
        <div class="flex items-center pr-2 active:bg-slate-100 dark:active:bg-slate-700/60" style="padding-left:${depth * 18 + 4}px">
          <button class="w-8 h-10 flex-shrink-0 text-slate-400 ${kids.length ? '' : 'invisible'}" data-action="toggle" data-id="${p.id}"><i class="fa-solid fa-chevron-right text-[11px] transition ${isOpen ? 'rotate-90' : ''}"></i></button>
          <a href="#/p/${p.id}" class="flex-1 min-w-0 flex items-center gap-2 py-2.5">
            <span class="w-6 text-center flex-shrink-0">${pageIcon(p)}</span>
            <span class="truncate font-medium">${esc(displayTitle(p))}</span>
          </a>
          ${count}
          <button class="w-9 h-10 text-slate-400" data-action="more" data-id="${p.id}"><i class="fa-solid fa-ellipsis"></i></button>
        </div>
        ${isOpen && kids.length ? tree(s, p.id, depth + 1, open) : ''}
      </div>`;
    })
    .join('');
}

export const pagesView: ViewFn = (ctx, screen) => {
  const s = ctx.store.get();
  const open = loadOpen();
  const trashed = Object.values(s.pages).filter((p) => p.trashedAt).length;
  const dbs = livePages(s).filter((p) => p.kind === 'database');

  screen.innerHTML = `${header('Pages', {
    actions: `<button class="icon-btn" data-action="new-db" aria-label="Nouvelle base"><i class="fa-solid fa-table"></i></button>
      <button class="icon-btn !text-violet-600" data-action="new" aria-label="Nouvelle page"><i class="fa-solid fa-plus text-xl"></i></button>`,
  })}
  <div class="max-w-2xl mx-auto px-3 pb-8">
    ${dbs.length ? `<h2 class="section-title mt-2">Bases de données</h2>
    <div class="flex gap-2 overflow-x-auto no-scrollbar pb-3">${dbs
      .map((d) => `<a href="#/p/${d.id}" class="flex-shrink-0 card px-3 py-2 flex items-center gap-2"><span>${pageIcon(d)}</span><span class="font-medium text-sm">${esc(displayTitle(d))}</span><span class="text-xs text-slate-400">${rows(s, d).length}</span></a>`)
      .join('')}</div>` : ''}
    <h2 class="section-title mt-2">Toutes les pages</h2>
    <div class="card py-1 overflow-hidden">${tree(s, null, 0, open) || '<p class="p-4 text-sm text-slate-400">Aucune page.</p>'}</div>
    <a href="#/trash" class="flex items-center gap-2 mt-4 px-2 text-sm text-slate-400"><i class="fa-solid fa-trash-can"></i> Corbeille ${trashed ? `(${trashed})` : ''}</a>
  </div>`;

  onAction(screen, {
    back: () => history.back(),
    new: () => ctx.newPage(),
    'new-db': () => ctx.newPage({ kind: 'database', title: 'Nouvelle base' }),
    toggle: (b) => {
      const id = b.dataset.id!;
      if (open.has(id)) open.delete(id);
      else open.add(id);
      saveOpen(open);
      pagesView(ctx, screen, { name: 'pages', params: {} });
    },
    more: (b) => {
      const p = s.pages[b.dataset.id!];
      pageMenu(ctx, p, () => {
        open.add(p.id);
        saveOpen(open);
      });
    },
  });
};

/** Menu d'une page depuis l'arborescence. */
function pageMenu(ctx: Parameters<ViewFn>[0], p: Page, expand: () => void): void {
  const items = [
    { label: 'Ouvrir', icon: 'fa-arrow-up-right-from-square', run: () => ctx.go(`/p/${p.id}`) },
    ...(p.kind === 'page'
      ? [
          { label: 'Nouvelle sous-page', icon: 'fa-file-circle-plus', run: () => (expand(), ctx.newPage({ parentId: p.id })) },
          { label: 'Nouvelle base ici', icon: 'fa-table', run: () => (expand(), ctx.newPage({ parentId: p.id, kind: 'database', title: 'Nouvelle base' })) },
        ]
      : []),
    { label: p.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: 'fa-star', run: () => ctx.store.update(() => void (p.favorite = !p.favorite)) },
    ...(p.parentId ? [{ label: 'Mettre à la racine', icon: 'fa-arrow-turn-up', run: () => ctx.store.update((s) => void movePage(s, p.id, null)) }] : []),
  ];
  openMenu(displayTitle(p), items);
}

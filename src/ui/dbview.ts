import type { DbView, Page } from '../core/types';
import { activeView, addView, boardColumns, toCsv, viewRows } from '../core/db';
import { createPage, displayTitle } from '../core/vault';
import { saveBlob } from '../platform/files';
import type { Ctx } from './app';
import { pageIcon } from './components';
import { chip, esc } from './dom';
import { editValue, newProp, propMenu, valueHtml } from './props';
import { confirmSheet, openMenu, openSheet, promptText, toast } from './sheet';
import { el } from './dom';

// Affichage d'une base de données façon Notion : vues Tableau, Kanban et Liste.

const VIEW_ICONS: Record<DbView['type'], string> = { table: 'fa-table', board: 'fa-table-columns', list: 'fa-list' };

function tableHtml(ctx: Ctx, db: Page, view: DbView): string {
  const s = ctx.store.get();
  const props = db.schema!.props;
  const list = viewRows(s, db, view);
  const th = 'px-3 py-2 text-left text-xs font-semibold text-slate-500 whitespace-nowrap border-b border-slate-200 dark:border-slate-700';
  return `<div class="overflow-x-auto -mx-4 px-4"><table class="min-w-full text-sm border-separate border-spacing-0">
    <thead><tr>
      <th class="${th} sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 min-w-[150px]"><i class="fa-solid fa-font mr-1 opacity-60"></i>Nom</th>
      ${props.map((p) => `<th class="${th} min-w-[120px]" data-action="prop" data-prop="${p.id}"><i class="fa-solid ${iconOf(p.type)} mr-1 opacity-60"></i>${esc(p.name)}</th>`).join('')}
      <th class="${th}"><button data-action="add-prop" class="text-violet-600 px-1" aria-label="Ajouter une propriété"><i class="fa-solid fa-plus"></i></button></th>
    </tr></thead>
    <tbody>
      ${list
        .map(
          (r) => `<tr>
        <td class="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-3 py-2 max-w-[200px]"><a href="#/p/${r.id}" class="flex items-center gap-1.5 font-medium"><span>${pageIcon(r)}</span><span class="truncate">${esc(displayTitle(r))}</span></a></td>
        ${props.map((p) => `<td class="border-b border-slate-100 dark:border-slate-800 px-3 py-2 max-w-[220px] truncate" data-action="cell" data-row="${r.id}" data-prop="${p.id}">${valueHtml(p, r.props[p.id]) || '<span class="text-slate-300 dark:text-slate-600">—</span>'}</td>`).join('')}
        <td class="border-b border-slate-100 dark:border-slate-800"></td>
      </tr>`,
        )
        .join('')}
    </tbody></table></div>
    ${list.length ? '' : emptyHtml(view)}`;
}

const iconOf = (t: string) => ({ text: 'fa-align-left', number: 'fa-hashtag', select: 'fa-circle-chevron-down', multi: 'fa-list-ul', date: 'fa-calendar', checkbox: 'fa-square-check', url: 'fa-link' })[t] ?? 'fa-align-left';

const emptyHtml = (view: DbView) => `<p class="text-sm text-slate-400 py-6 text-center">${view.query ? 'Aucun résultat.' : 'Aucune ligne. Touchez « Nouveau » pour en ajouter.'}</p>`;

function propsLine(db: Page, r: Page, skip?: string): string {
  return db.schema!.props
    .filter((p) => p.id !== skip)
    .map((p) => valueHtml(p, r.props[p.id]))
    .filter(Boolean)
    .join(' ');
}

function boardHtml(ctx: Ctx, db: Page, view: DbView): string {
  const cols = boardColumns(ctx.store.get(), db, view);
  const hasGroup = db.schema!.props.some((p) => p.id === view.groupBy);
  return `${hasGroup ? '' : `<p class="text-sm text-amber-600 mb-2"><i class="fa-solid fa-circle-info"></i> Ajoutez une propriété « Sélection » pour regrouper en colonnes.</p>`}
  <div class="flex gap-3 overflow-x-auto -mx-4 px-4 scroll-px-4 pb-3 snap-x">
    ${cols
      .map(
        (c) => `<div class="flex-shrink-0 w-[78vw] max-w-[300px] snap-start">
      <div class="flex items-center justify-between mb-2 px-1">${chip(c.color, c.label)}<span class="text-xs text-slate-400">${c.rows.length}</span></div>
      <div class="space-y-2">
        ${c.rows
          .map(
            (r) => `<div class="card p-3">
          <div class="flex items-start gap-2"><a href="#/p/${r.id}" class="flex-1 font-medium">${pageIcon(r)} ${esc(displayTitle(r))}</a>
          ${hasGroup ? `<button class="text-slate-400 -mr-1 -mt-1 w-8 h-8" data-action="move" data-row="${r.id}" aria-label="Changer de colonne"><i class="fa-solid fa-right-left text-xs"></i></button>` : ''}</div>
          <div class="flex flex-wrap gap-1 mt-1.5 text-xs">${propsLine(db, r, view.groupBy)}</div>
        </div>`,
          )
          .join('')}
        <button data-action="add-in" data-col="${esc(c.key ?? '')}" class="w-full py-2 text-sm text-slate-400 rounded-xl border border-dashed border-slate-300 dark:border-slate-700"><i class="fa-solid fa-plus"></i> Ajouter</button>
      </div>
    </div>`,
      )
      .join('')}
  </div>`;
}

function listHtml(ctx: Ctx, db: Page, view: DbView): string {
  const list = viewRows(ctx.store.get(), db, view);
  return `<div class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">${list
    .map(
      (r) => `<a href="#/p/${r.id}" class="block px-3 py-2.5 active:bg-slate-100 dark:active:bg-slate-700/60">
      <div class="font-medium">${pageIcon(r)} ${esc(displayTitle(r))}</div>
      <div class="flex flex-wrap gap-1 mt-1 text-xs">${propsLine(db, r)}</div></a>`,
    )
    .join('')}</div>${list.length ? '' : emptyHtml(view)}`;
}

export function renderDatabase(ctx: Ctx, host: HTMLElement, db: Page): void {
  const schema = db.schema!;
  const view = activeView(schema);
  const sortProp = view.sort ? (view.sort.prop === 'title' ? 'Nom' : schema.props.find((p) => p.id === view.sort!.prop)?.name) : null;

  host.innerHTML = `
  <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 mb-3">
    ${schema.views
      .map(
        (v) => `<button data-action="view" data-view="${v.id}" class="flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium ${v.id === view.id ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}"><i class="fa-solid ${VIEW_ICONS[v.type]} mr-1 text-xs"></i>${esc(v.name)}</button>`,
      )
      .join('')}
    <button data-action="add-view" class="flex-shrink-0 w-8 h-8 rounded-full text-slate-400" aria-label="Nouvelle vue"><i class="fa-solid fa-plus"></i></button>
  </div>
  <div class="flex items-center gap-2 mb-3">
    <div class="flex-1 min-w-0 flex items-center gap-2 px-3 h-10 rounded-xl bg-slate-100 dark:bg-slate-800">
      <i class="fa-solid fa-magnifying-glass text-slate-400 text-sm"></i>
      <input data-q class="flex-1 min-w-0 bg-transparent outline-none text-sm" placeholder="Filtrer…" value="${esc(view.query ?? '')}">
    </div>
    <button data-action="sort" class="flex-shrink-0 whitespace-nowrap h-10 px-3 rounded-xl text-sm ${view.sort ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}" aria-label="Trier"><i class="fa-solid fa-arrow-down-wide-short"></i>${sortProp ? ` <span class="text-xs">${esc(sortProp)}</span>` : ''}</button>
    <button data-action="view-menu" class="flex-shrink-0 h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500" aria-label="Options de la base"><i class="fa-solid fa-sliders"></i></button>
    <button data-action="add-row" class="flex-shrink-0 whitespace-nowrap h-10 px-3 rounded-xl bg-violet-600 text-white text-sm font-semibold"><i class="fa-solid fa-plus"></i> Nouveau</button>
  </div>
  <div data-body>${view.type === 'board' ? boardHtml(ctx, db, view) : view.type === 'list' ? listHtml(ctx, db, view) : tableHtml(ctx, db, view)}</div>`;

  const store = ctx.store;
  const findRow = (id: string) => store.get().pages[id];

  const addRow = async (preset: Record<string, string> = {}) => {
    const title = await promptText('Nouvelle ligne', '', { placeholder: 'Nom', ok: 'Créer' });
    if (title == null) return;
    store.update((s) => void createPage(s, { title: title.trim(), parentId: db.id, props: { ...preset } }));
  };

  // Le filtre se tape sans redessiner tout l'écran (le clavier resterait sinon fermé).
  const q = host.querySelector<HTMLInputElement>('[data-q]')!;
  q.addEventListener('input', () => {
    store.update(() => void (view.query = q.value), true);
    const body = host.querySelector<HTMLElement>('[data-body]')!;
    body.innerHTML = view.type === 'board' ? boardHtml(ctx, db, view) : view.type === 'list' ? listHtml(ctx, db, view) : tableHtml(ctx, db, view);
  });

  host.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!t || !host.contains(t)) return;
    const action = t.dataset.action;
    switch (action) {
      case 'view':
        return store.update(() => void (schema.activeView = t.dataset.view!));
      case 'add-view':
        return openMenu('Nouvelle vue', [
          { label: 'Tableau', icon: VIEW_ICONS.table, run: () => store.update(() => void addView(schema, 'table')) },
          { label: 'Kanban', icon: VIEW_ICONS.board, run: () => store.update(() => void addView(schema, 'board')) },
          { label: 'Liste', icon: VIEW_ICONS.list, run: () => store.update(() => void addView(schema, 'list')) },
        ]);
      case 'add-row':
        return addRow();
      case 'add-in': {
        const prop = schema.props.find((p) => p.id === view.groupBy);
        return addRow(prop && t.dataset.col ? { [prop.id]: t.dataset.col } : {});
      }
      case 'add-prop':
        return newProp(store, db);
      case 'prop': {
        const p = schema.props.find((x) => x.id === t.dataset.prop);
        if (p) propMenu(store, db, p);
        return;
      }
      case 'cell': {
        const r = findRow(t.dataset.row!);
        const p = schema.props.find((x) => x.id === t.dataset.prop);
        if (r && p) editValue(store, r, p);
        return;
      }
      case 'move': {
        const r = findRow(t.dataset.row!);
        const p = schema.props.find((x) => x.id === view.groupBy);
        if (r && p) editValue(store, r, p);
        return;
      }
      case 'sort':
        return openMenu('Trier par', [
          { label: 'Aucun tri', icon: 'fa-ban', run: () => store.update(() => void (view.sort = undefined)) },
          ...[{ id: 'title', name: 'Nom' }, ...schema.props].flatMap((p) => [
            { label: `${p.name} (croissant)`, icon: 'fa-arrow-up-short-wide', run: () => store.update(() => void (view.sort = { prop: p.id, dir: 'asc' })) },
            { label: `${p.name} (décroissant)`, icon: 'fa-arrow-down-wide-short', run: () => store.update(() => void (view.sort = { prop: p.id, dir: 'desc' })) },
          ]),
        ]);
      case 'view-menu':
        return viewMenu(ctx, db, view);
    }
  });
}

function viewMenu(ctx: Ctx, db: Page, view: DbView): void {
  const store = ctx.store;
  const schema = db.schema!;
  const selects = schema.props.filter((p) => p.type === 'select');
  openMenu('Base de données', [
    { label: 'Propriétés…', icon: 'fa-list-check', run: () => propsSheet(ctx, db) },
    { label: 'Ajouter une propriété', icon: 'fa-plus', run: () => void newProp(store, db) },
    ...(view.type === 'board' && selects.length
      ? [
          {
            label: 'Regrouper par…',
            icon: 'fa-table-columns',
            hint: selects.find((p) => p.id === view.groupBy)?.name,
            run: () => openMenu('Regrouper par', selects.map((p) => ({ label: p.name, icon: 'fa-circle-chevron-down', run: () => store.update(() => void (view.groupBy = p.id)) }))),
          },
        ]
      : []),
    {
      label: 'Renommer la vue',
      icon: 'fa-pen',
      run: async () => {
        const n = await promptText('Nom de la vue', view.name);
        if (n?.trim()) store.update(() => void (view.name = n.trim()));
      },
    },
    ...(schema.views.length > 1
      ? [
          {
            label: 'Supprimer la vue',
            icon: 'fa-trash',
            danger: true,
            run: async () => {
              if (!(await confirmSheet(`Supprimer la vue « ${view.name} » ? Les données restent.`, 'Supprimer'))) return;
              store.update(() => {
                schema.views = schema.views.filter((v) => v.id !== view.id);
                schema.activeView = schema.views[0].id;
              });
            },
          },
        ]
      : []),
    {
      label: 'Exporter en CSV',
      icon: 'fa-file-csv',
      run: async () => {
        const csv = '﻿' + toCsv(store.get(), db);
        if (await saveBlob(`${displayTitle(db)}.csv`, new Blob([csv], { type: 'text/csv' }))) toast('Export CSV prêt');
      },
    },
  ]);
}

function propsSheet(ctx: Ctx, db: Page): void {
  const body = el(`<div class="pb-2 divide-y divide-slate-100 dark:divide-slate-700">${db
    .schema!.props.map((p) => `<button data-p="${p.id}" class="w-full flex items-center gap-3 py-3 text-left"><i class="fa-solid ${iconOf(p.type)} w-5 text-slate-400"></i><span class="flex-1">${esc(p.name)}</span><i class="fa-solid fa-chevron-right text-xs text-slate-300"></i></button>`)
    .join('')}</div>`);
  const sheet = openSheet({ title: 'Propriétés', body });
  body.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
    const p = db.schema!.props.find((x) => x.id === b?.dataset.p);
    if (!p) return;
    sheet.close();
    propMenu(ctx.store, db, p);
  });
}

/** Panneau des propriétés en haut d'une ligne de base. */
export function rowPropsHtml(db: Page, row: Page): string {
  const props = db.schema!.props;
  return `<div class="mb-4 rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60">
    ${props
      .map(
        (p) => `<button data-action="row-prop" data-prop="${p.id}" class="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm">
      <span class="w-32 flex-shrink-0 text-slate-500 truncate"><i class="fa-solid ${iconOf(p.type)} w-4 opacity-60"></i> ${esc(p.name)}</span>
      <span class="flex-1 min-w-0 flex flex-wrap gap-1">${valueHtml(p, row.props[p.id]) || '<span class="text-slate-300 dark:text-slate-600">Vide</span>'}</span>
    </button>`,
      )
      .join('')}
    <button data-action="row-add-prop" class="w-full px-3 py-2 text-left text-xs text-slate-400"><i class="fa-solid fa-plus"></i> Ajouter une propriété</button>
  </div>`;
}

import type { ViewFn, Ctx } from '../app';
import type { Page } from '../../core/types';
import { ancestors, backlinks, children, createPage, displayTitle, isDbRow, movePage, toggleTask, trashPage } from '../../core/vault';
import { renameLinks } from '../../core/links';
import { vaultToFiles } from '../../core/exporter';
import { saveBlob } from '../../platform/files';
import { header, pageIcon } from '../components';
import { esc } from '../dom';
import { mountEditor } from '../editor';
import { renderNote } from '../render';
import { renderDatabase, rowPropsHtml } from '../dbview';
import { editValue, newProp } from '../props';
import { confirmSheet, openMenu, pickEmoji, promptText, toast } from '../sheet';
import { livePages } from '../../core/vault';
import { whiteboardView } from '../whiteboard';

// Écran d'une page : titre, propriétés (ligne de base), contenu en lecture ou en édition,
// sous-pages, base de données et rétroliens.

let editingId: string | null = null;
let editCaret: number | undefined;

export const pageView: ViewFn = (ctx, screen, route) => {
  const s = ctx.store.get();
  const page = s.pages[route.params.id];
  if (!page) {
    screen.innerHTML = `${header('Page introuvable', { back: true })}<p class="p-6 text-slate-500">Cette page n'existe plus.</p>`;
    screen.querySelector('[data-action=back]')?.addEventListener('click', () => history.back());
    return;
  }
  if (page.kind === 'canvas') return whiteboardView(ctx, screen, page);
  if (route.params.edit) {
    editingId = page.id;
    editCaret = undefined;
    ctx.go(`/p/${page.id}`, true); // retire ?edit=1 pour que « retour » ne rouvre pas l'édition
    return;
  }
  if (editingId && editingId !== page.id) editingId = null;
  const editing = editingId === page.id;
  const db = isDbRow(s, page) ? s.pages[page.parentId!] : undefined;
  const crumbs = ancestors(s, page.id);
  const subpages = page.kind === 'database' ? [] : children(s, page.id);
  const links = backlinks(s, page.id);
  const trashed = !!page.trashedAt;

  screen.innerHTML = `${header('', {
    back: true,
    actions: `
      <button class="icon-btn" data-action="fav" aria-label="Favori"><i class="fa-${page.favorite ? 'solid text-amber-400' : 'regular'} fa-star"></i></button>
      <button class="icon-btn" data-action="more" aria-label="Plus"><i class="fa-solid fa-ellipsis-vertical"></i></button>`,
  })}
  <article class="max-w-2xl mx-auto px-4 pb-28">
    ${trashed ? `<div class="mb-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-sm flex items-center justify-between gap-2">Cette page est dans la corbeille. <a href="#/trash" class="font-semibold underline">Corbeille</a></div>` : ''}
    <nav class="flex items-center gap-1 text-xs text-slate-400 overflow-x-auto no-scrollbar whitespace-nowrap -mt-1 mb-2">
      ${crumbs.map((c) => `<a href="#/p/${c.id}" class="hover:underline">${c.icon ? esc(c.icon) + ' ' : ''}${esc(displayTitle(c))}</a><i class="fa-solid fa-chevron-right text-[8px]"></i>`).join('')}
    </nav>
    <button data-action="icon" class="text-4xl leading-none mb-1 ${page.icon ? '' : 'text-sm text-slate-400'}">${page.icon ? esc(page.icon) : '<i class="fa-regular fa-face-smile"></i> Ajouter une icône'}</button>
    <textarea data-title rows="1" class="block w-full bg-transparent outline-none resize-none text-3xl font-extrabold leading-tight mb-3 placeholder:text-slate-300 dark:placeholder:text-slate-600" placeholder="Sans titre" enterkeyhint="next">${esc(page.title)}</textarea>
    ${db ? rowPropsHtml(db, page) : ''}
    <div data-content class="${editing ? '' : 'prose-note min-h-[3rem]'}"></div>
    ${page.kind === 'database' ? '<section data-db class="mt-5"></section>' : ''}
    ${
      subpages.length
        ? `<section class="mt-8"><h2 class="section-title">Sous-pages</h2><div class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
      ${subpages.map((c) => `<a href="#/p/${c.id}" class="flex items-center gap-3 px-3 py-2.5"><span class="w-6 text-center">${pageIcon(c)}</span><span class="flex-1 truncate font-medium">${esc(displayTitle(c))}</span><i class="fa-solid fa-chevron-right text-xs text-slate-300"></i></a>`).join('')}
      </div></section>`
        : ''
    }
    <section class="mt-8">
      <h2 class="section-title"><i class="fa-solid fa-link"></i> Rétroliens (${links.length})</h2>
      ${
        links.length
          ? `<div class="space-y-2">${links
              .map(
                (l) => `<a href="#/p/${l.page.id}" class="block card p-3"><div class="font-medium text-sm">${pageIcon(l.page)} ${esc(displayTitle(l.page))}</div><div class="text-xs text-slate-500 mt-1 line-clamp-2">${esc(l.snippet)}</div></a>`,
              )
              .join('')}</div>`
          : `<p class="text-sm text-slate-400 px-1">Aucune page ne pointe ici. Écrivez <code>[[${esc(displayTitle(page))}]]</code> ailleurs pour créer un lien.</p>`
      }
    </section>
  </article>
  ${editing ? '' : `<button data-action="edit" class="fixed right-4 z-30 w-14 h-14 rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/30 active:scale-95 transition" style="bottom:calc(env(safe-area-inset-bottom) + 76px)" aria-label="Modifier"><i class="fa-solid fa-pen text-lg"></i></button>`}`;

  const content = screen.querySelector<HTMLElement>('[data-content]')!;
  const titleEl = screen.querySelector<HTMLTextAreaElement>('[data-title]')!;
  const grow = () => {
    titleEl.style.height = 'auto';
    titleEl.style.height = titleEl.scrollHeight + 'px';
  };
  requestAnimationFrame(grow);

  // Titre : saisie silencieuse, puis mise à jour des [[liens]] à la validation.
  let titleAtFocus = page.title;
  titleEl.addEventListener('focus', () => (titleAtFocus = page.title));
  titleEl.addEventListener('input', () => {
    grow();
    ctx.store.update(() => {
      page.title = titleEl.value.replace(/\n/g, ' ');
      page.updatedAt = Date.now();
    }, true);
  });
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleEl.blur();
      if (!editing) startEdit();
    }
  });
  titleEl.addEventListener('change', () => {
    const old = titleAtFocus.trim();
    const now = page.title.trim();
    titleAtFocus = page.title;
    if (!old || old.toLowerCase() === now.toLowerCase() || !now) return;
    let n = 0;
    ctx.store.update((st) => {
      for (const p of Object.values(st.pages)) {
        const next = renameLinks(p.content, old, now);
        if (next !== p.content) {
          p.content = next;
          n++;
        }
      }
    }, true);
    if (n) toast(`${n} lien${n > 1 ? 's' : ''} mis à jour`);
  });

  let editor: ReturnType<typeof mountEditor> | null = null;
  const startEdit = () => {
    editingId = page.id;
    editCaret = undefined;
    ctx.store.update(() => {}, false); // redessine en mode édition
  };
  const stopEdit = () => {
    if (editor) editCaret = undefined;
    editingId = null;
    ctx.store.update(() => {}, false);
  };

  if (editing) {
    editor = mountEditor(
      content,
      page.content,
      {
        state: () => ctx.store.get(),
        selfId: page.id,
        onChange: (text) =>
          ctx.store.update(() => {
            page.content = text;
            page.updatedAt = Date.now();
            editCaret = editor?.textarea.selectionStart;
          }, true),
        onDone: stopEdit,
        createChild: async (kind) => {
          const title = await promptText(kind === 'database' ? 'Nom de la base' : kind === 'canvas' ? 'Nom du tableau blanc' : 'Nom de la sous-page', '', { ok: 'Créer' });
          if (!title?.trim()) return null;
          ctx.store.update((st) => void createPage(st, { title: title.trim(), parentId: page.id, kind }), true);
          return kind === 'page' ? `[[${title.trim()}]]` : `![[${title.trim()}]]\n`;
        },
      },
      editCaret,
    );
  } else {
    renderNote(content, s, page);
    if (!page.content.trim()) content.innerHTML = `<p class="text-slate-400" data-action="edit">${page.kind === 'database' ? 'Ajouter une description…' : 'Page vide. Touchez pour écrire…'}</p>`;
  }

  if (page.kind === 'database') renderDatabase(ctx, screen.querySelector<HTMLElement>('[data-db]')!, page);

  screen.addEventListener('click', onClick);
  async function onClick(e: Event) {
    const target = e.target as HTMLElement;
    const wl = target.closest<HTMLElement>('a.wikilink');
    if (wl && !editing) {
      e.preventDefault();
      return ctx.openTitle(wl.dataset.target!);
    }
    const tag = target.closest<HTMLElement>('a.tag');
    if (tag) {
      e.preventDefault();
      return ctx.go(`/tag/${encodeURIComponent(tag.dataset.tag!)}`);
    }
    const cb = target.closest<HTMLInputElement>('input[data-task]');
    if (cb && content.contains(cb)) {
      e.preventDefault();
      ctx.store.update(() => {
        page.content = toggleTask(page.content, Number(cb.dataset.task));
        page.updatedAt = Date.now();
      });
      return;
    }
    const a = target.closest<HTMLElement>('[data-action]');
    if (!a || a.closest('[data-db]')) return;
    switch (a.dataset.action) {
      case 'back':
        return history.back();
      case 'edit':
        return startEdit();
      case 'open-budget':
        return ctx.go('/budget');
      case 'fav':
        return ctx.store.update(() => void (page.favorite = !page.favorite));
      case 'icon': {
        const icon = await pickEmoji();
        if (icon != null) ctx.store.update(() => void (page.icon = icon));
        return;
      }
      case 'row-prop': {
        const p = db?.schema!.props.find((x) => x.id === a.dataset.prop);
        if (db && p) editValue(ctx.store, page, p);
        return;
      }
      case 'row-add-prop':
        if (db) void newProp(ctx.store, db);
        return;
      case 'more':
        return moreMenu(ctx, page);
    }
  }

  return () => {
    editor?.destroy();
    screen.removeEventListener('click', onClick);
  };
};

function moreMenu(ctx: Ctx, page: Page): void {
  const store = ctx.store;
  openMenu(displayTitle(page), [
    ...(page.kind === 'page'
      ? [
          { label: 'Nouvelle sous-page', icon: 'fa-file-circle-plus', run: () => ctx.newPage({ parentId: page.id }) },
          { label: 'Nouvelle base dans cette page', icon: 'fa-table', run: () => ctx.newPage({ parentId: page.id, kind: 'database', title: 'Nouvelle base' }) },
          { label: 'Nouveau tableau blanc ici', icon: 'fa-signature', run: () => ctx.newPage({ parentId: page.id, kind: 'canvas', title: 'Croquis' }) },
        ]
      : []),
    { label: 'Voir dans le graphe', icon: 'fa-circle-nodes', run: () => ctx.go(`/graph?focus=${page.id}`) },
    { label: 'Déplacer…', icon: 'fa-folder-open', run: () => moveSheet(ctx, page) },
    {
      label: 'Dupliquer',
      icon: 'fa-copy',
      run: () => {
        let id = '';
        store.update((s) => {
          id = createPage(s, { title: `${page.title} (copie)`, parentId: page.parentId, content: page.content, icon: page.icon, props: structuredClone(page.props), kind: page.kind, schema: page.schema ? structuredClone(page.schema) : undefined, ink: page.ink ? structuredClone(page.ink) : undefined }).id;
        });
        ctx.go(`/p/${id}`);
      },
    },
    {
      label: 'Exporter en Markdown',
      icon: 'fa-file-arrow-down',
      run: async () => {
        const files = vaultToFiles({ ...store.get(), order: { __root__: [page.id] } });
        const text = Object.values(files)[0] ?? page.content;
        if (await saveBlob(`${displayTitle(page)}.md`, new Blob([text], { type: 'text/markdown' }))) toast('Note exportée');
      },
    },
    {
      label: 'Mettre à la corbeille',
      icon: 'fa-trash',
      danger: true,
      run: async () => {
        const n = children(store.get(), page.id).length;
        if (n && !(await confirmSheet(`« ${displayTitle(page)} » et ses ${n} sous-page(s) iront à la corbeille.`, 'Mettre à la corbeille'))) return;
        store.update((s) => trashPage(s, page.id));
        toast('Page mise à la corbeille');
        history.back();
      },
    },
  ]);
}

function moveSheet(ctx: Ctx, page: Page): void {
  const s = ctx.store.get();
  const blocked = new Set([page.id, ...Object.values(s.pages).filter((p) => ancestors(s, p.id).some((a) => a.id === page.id)).map((p) => p.id)]);
  const targets = livePages(s)
    .filter((p) => !blocked.has(p.id) && !isDbRow(s, p))
    .sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
  openMenu('Déplacer vers', [
    { label: 'Racine (aucun parent)', icon: 'fa-house', run: () => ctx.store.update((st) => void movePage(st, page.id, null)) },
    ...targets.map((t) => ({
      label: displayTitle(t),
      icon: t.kind === 'database' ? 'fa-table' : 'fa-file-lines',
      hint: t.kind === 'database' ? 'devient une ligne' : undefined,
      run: () => ctx.store.update((st) => void movePage(st, page.id, t.id)),
    })),
  ]);
}


import type { ViewFn } from '../app';
import { allTags, search } from '../../core/vault';
import { pageRow } from '../components';
import { esc } from '../dom';

let lastQuery = '';

export const searchView: ViewFn = (ctx, screen, route) => {
  const initial = route.params.q ?? lastQuery;
  screen.innerHTML = `
  <div class="sticky top-0 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur safe-top px-4 pt-3 pb-2">
    <div class="flex items-center gap-2 px-3 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      <i class="fa-solid fa-magnifying-glass text-slate-400"></i>
      <input type="search" class="flex-1 min-w-0 bg-transparent outline-none" placeholder="Titre, texte, #étiquette…" value="${esc(initial)}" enterkeyhint="search">
    </div>
  </div>
  <div class="max-w-2xl mx-auto px-4 pb-8" data-results></div>`;
  const input = screen.querySelector('input')!;
  const out = screen.querySelector<HTMLElement>('[data-results]')!;

  const draw = () => {
    const s = ctx.store.get();
    const q = input.value;
    lastQuery = q;
    if (!q.trim()) {
      const tags = allTags(s);
      out.innerHTML = tags.length
        ? `<h2 class="section-title mt-2">Étiquettes</h2><div class="flex flex-wrap gap-2">${tags.map((t) => `<button data-tag="${esc(t.tag)}" class="px-3 py-1 rounded-full text-sm bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">#${esc(t.tag)} <span class="opacity-60">${t.count}</span></button>`).join('')}</div>`
        : '<p class="text-sm text-slate-400 mt-4 text-center">Tapez pour chercher dans toutes vos pages.</p>';
      return;
    }
    const hits = search(s, q).slice(0, 60);
    out.innerHTML = `<p class="text-xs text-slate-400 my-2 px-1">${hits.length} résultat${hits.length > 1 ? 's' : ''}</p>
      <div class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">${hits.map((h) => pageRow(s, h.page, h.snippet.trim() ? `<span class="block text-xs text-slate-500 mt-0.5 line-clamp-2">${esc(h.snippet)}</span>` : '')).join('') || '<p class="p-4 text-sm text-slate-400">Rien trouvé.</p>'}</div>
      ${q.startsWith('#') ? '' : `<button data-create class="mt-3 w-full py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500"><i class="fa-solid fa-plus"></i> Créer la page « ${esc(q.trim())} »</button>`}`;
  };
  draw();
  input.addEventListener('input', draw);
  out.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const tag = t.closest<HTMLElement>('[data-tag]');
    if (tag) {
      input.value = '#' + tag.dataset.tag;
      draw();
    }
    if (t.closest('[data-create]')) ctx.newPage({ title: input.value.trim() });
  });
  if (!route.params.q) setTimeout(() => input.focus(), 50);
};

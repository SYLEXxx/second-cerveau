import type { ViewFn } from '../app';
import { allTags, livePages, recent } from '../../core/vault';
import { pageRow } from '../components';
import { esc, onAction } from '../dom';
import { budgetWidgetHtml } from '../../modules/budget/widget';

const hello = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
};

export const homeView: ViewFn = (ctx, screen) => {
  const s = ctx.store.get();
  const favs = livePages(s).filter((p) => p.favorite);
  const rec = recent(s, 6);
  const tags = allTags(s).slice(0, 16);
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  screen.innerHTML = `
  <div class="safe-top max-w-2xl mx-auto px-4 pb-8">
    <div class="flex items-center justify-between pt-5 pb-4">
      <div>
        <p class="text-xs font-semibold text-violet-600 dark:text-violet-400 capitalize">${esc(today)}</p>
        <h1 class="text-2xl font-extrabold">${hello()} 🧠</h1>
      </div>
      <a href="#/settings" class="icon-btn" aria-label="Réglages"><i class="fa-solid fa-gear"></i></a>
    </div>

    ${import.meta.env.MODE === 'single' ? `<p class="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs">Aperçu en ligne : vos essais restent dans ce navigateur et les exports de fichiers sont désactivés ici. Pour l'usage réel, installez l'application (voir LISEZMOI).</p>` : ''}
    <a href="#/search" class="flex items-center gap-3 px-4 py-3 mb-4 card text-slate-400"><i class="fa-solid fa-magnifying-glass"></i><span>Rechercher dans vos notes…</span></a>

    <div class="grid grid-cols-5 gap-2 mb-5">
      ${[
        ['new', 'fa-pen-to-square', 'Note', 'text-violet-600 bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300'],
        ['daily', 'fa-calendar-day', 'Du jour', 'text-sky-600 bg-sky-100 dark:bg-sky-900/40 dark:text-sky-300'],
        ['ink', 'fa-signature', 'Croquis', 'text-pink-600 bg-pink-100 dark:bg-pink-900/40 dark:text-pink-300'],
        ['db', 'fa-table', 'Base', 'text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300'],
        ['expense', 'fa-receipt', 'Dépense', 'text-rose-600 bg-rose-100 dark:bg-rose-900/40 dark:text-rose-300'],
      ]
        .map(
          ([a, icon, label, cls]) => `<button data-action="${a}" class="flex flex-col items-center gap-1.5 py-3 card active:scale-95 transition">
            <span class="w-10 h-10 rounded-xl flex items-center justify-center ${cls}"><i class="fa-solid ${icon}"></i></span>
            <span class="text-[11px] font-semibold">${label}</span></button>`,
        )
        .join('')}
    </div>

    <a href="#/budget" class="block card p-4 mb-5">${budgetWidgetHtml()}</a>

    ${favs.length ? `<h2 class="section-title"><i class="fa-solid fa-star text-amber-400"></i> Favoris</h2>
      <div class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden mb-5">${favs.map((p) => pageRow(s, p)).join('')}</div>` : ''}

    <h2 class="section-title">Récemment modifiées</h2>
    <div class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden mb-5">
      ${rec.map((p) => pageRow(s, p)).join('') || '<p class="p-4 text-sm text-slate-400">Aucune page pour l’instant.</p>'}
    </div>

    ${tags.length ? `<h2 class="section-title">Étiquettes</h2>
      <div class="flex flex-wrap gap-2">${tags.map((t) => `<a href="#/tag/${encodeURIComponent(t.tag)}" class="px-3 py-1 rounded-full text-sm bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">#${esc(t.tag)} <span class="opacity-60">${t.count}</span></a>`).join('')}</div>` : ''}
  </div>`;

  onAction(screen, {
    new: () => ctx.newPage(),
    daily: () => ctx.openDaily(),
    db: () => ctx.newPage({ kind: 'database', title: 'Nouvelle base' }),
    ink: () => ctx.newPage({ kind: 'canvas', title: 'Croquis' }),
    expense: () => ctx.go('/budget?add=1'),
  });
};

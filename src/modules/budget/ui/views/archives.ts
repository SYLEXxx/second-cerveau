import { periodReport } from '../../domain/actuals';
import { archiveCurrentPeriod, isCycleExpired } from '../../domain/archive';
import { MONTH_NAMES } from '../../domain/defaults';
import { escapeHtml, formatCurrency, formatCurrencyCents, formatDate } from '../../domain/format';
import { migrate } from '../../domain/migrations';
import type { Archive } from '../../domain/types';
import { axes, legendTop, renderChart } from '../charts';
import type { AppContext, View } from '../context';
import { confirmDialog, showToast } from '../dialogs';
import { byId, on, setText } from '../dom';

export function archiveNow({ store }: AppContext): void {
  store.replace(archiveCurrentPeriod(store.get()));
  showToast('Exercice archivé avec succès !');
}

/** Bilan affiché en détail (null = liste des archives). */
let openArchiveId: string | null = null;

function periodLabel(a: Archive): string {
  const start = new Date(a.stateSnapshot?.cycleStartDate ?? '');
  const end = new Date(a.createdAt);
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return Number.isNaN(start.getTime()) ? `Clôturé le ${end.toLocaleDateString('fr-FR')}` : `Période : ${fmt(start)} → ${fmt(end)} · clôturé le ${end.toLocaleDateString('fr-FR')}`;
}

function renderDetail(a: Archive): void {
  setText('archive-detail-title', a.title);
  setText('archive-detail-period', periodLabel(a));
  if (!a.stateSnapshot) {
    const kpis = byId('archive-detail-kpis');
    if (kpis) kpis.innerHTML = `<p class="col-span-full text-xs text-slate-500 italic">Ce bilan vient d'une ancienne version et ne contient pas le détail du budget. Total épargné : <strong class="text-emerald-600">${formatCurrency(a.totalSavings)}</strong>.</p>`;
    byId('chart-archive')?.closest('div.bg-slate-50')?.classList.add('hidden');
    const months = byId('archive-detail-months');
    if (months) months.innerHTML = '';
    return;
  }
  byId('chart-archive')?.closest('div.bg-slate-50')?.classList.remove('hidden');
  // Les anciens bilans sont remis au format actuel avant calcul.
  const snap = migrate(a.stateSnapshot);
  const start = new Date(snap.cycleStartDate);
  const firstMonth = Number.isNaN(start.getTime()) ? 0 : start.getMonth();
  const r = periodReport(snap, firstMonth);

  const kpi = (label: string, value: number, color: string) => `
    <div class="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700">
      <div class="text-[10px] uppercase font-semibold text-slate-500">${label}</div>
      <div class="text-lg font-bold ${color} mt-1">${formatCurrency(value)}</div>
    </div>`;
  const kpis = byId('archive-detail-kpis');
  if (kpis) {
    kpis.innerHTML = [
      kpi('Revenus', r.income, 'text-emerald-600'),
      kpi('Dépenses prévues', r.planned, 'text-slate-800 dark:text-slate-100'),
      kpi('Dépenses réelles', r.real, 'text-rose-600'),
      kpi('Épargne & invest.', r.invest, 'text-purple-600'),
      kpi('Reste à vivre prévu', r.net, r.net < 0 ? 'text-rose-600' : 'text-brand-600'),
    ].join('');
  }

  renderChart('chart-archive', {
    type: 'bar',
    data: {
      labels: r.rows.map((row) => MONTH_NAMES[row.month].substring(0, 3)),
      datasets: [
        { label: 'Dépenses prévues', data: r.rows.map((row) => Math.round(row.totals.totalExpenses)), backgroundColor: '#94a3b8', borderRadius: 4 },
        { label: 'Dépenses réelles', data: r.rows.map((row) => Math.round(row.real)), backgroundColor: '#f43f5e', borderRadius: 4 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: legendTop(), scales: axes() },
  });

  const months = byId('archive-detail-months');
  if (months) {
    months.innerHTML = r.rows.map((row) => {
      const list = snap.actualExpenses[row.month] ?? [];
      const over = row.diff < 0;
      return `
        <details class="group bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700">
          <summary class="flex items-center justify-between gap-3 p-3 cursor-pointer text-sm">
            <span class="font-semibold w-28">${MONTH_NAMES[row.month]}</span>
            <span class="text-xs text-slate-500 flex-1">${row.count} dépense${row.count > 1 ? 's' : ''} saisie${row.count > 1 ? 's' : ''}</span>
            <span class="text-xs">Prévu <strong>${formatCurrency(row.totals.totalExpenses)}</strong></span>
            <span class="text-xs">Réel <strong class="text-rose-600">${formatCurrency(row.real)}</strong></span>
            <span class="text-xs font-bold w-20 text-right ${over ? 'text-rose-600' : 'text-emerald-600'}">${over ? '' : '+ '}${formatCurrency(row.diff)}</span>
            <i class="fa-solid fa-chevron-down text-slate-400 text-xs transition-transform group-open:rotate-180"></i>
          </summary>
          <div class="px-3 pb-3">
            ${list.length === 0
              ? '<p class="text-xs text-slate-400 italic">Aucune dépense saisie ce mois-là.</p>'
              : `<table class="w-full text-xs"><tbody class="divide-y divide-slate-200 dark:divide-slate-700">${list.map((t) => `
                  <tr>
                    <td class="py-1.5 text-slate-500 w-24">${escapeHtml(formatDate(t.date || '-'))}</td>
                    <td class="py-1.5 font-medium">${escapeHtml(t.label)}</td>
                    <td class="py-1.5 text-slate-500">${escapeHtml(t.category)}</td>
                    <td class="py-1.5 text-right font-bold text-rose-600">${formatCurrencyCents(t.amount)}</td>
                  </tr>`).join('')}</tbody></table>`}
          </div>
        </details>`;
    }).join('');
  }
}

export const archivesView: View = {
  mount(ctx) {
    on('btn-manual-archive', 'click', () => archiveNow(ctx));
    on('banner-rollover-btn', 'click', () => archiveNow(ctx));
    on('btn-archive-back', 'click', () => {
      openArchiveId = null;
      ctx.store.refresh();
    });
    on('btn-archive-export', 'click', async () => {
      const a = ctx.store.get().archives.find((x) => x.id === openArchiveId);
      if (!a) return;
      const name = `MonBudgetPro_${a.title.replace(/[^\p{L}\d]+/gu, '_')}.json`;
      if (await ctx.platform.saveTextFile(name, JSON.stringify(a, null, 2), { name: 'Bilan MonBudgetPro', extensions: ['json'] })) {
        showToast('Bilan exporté !');
      }
    });

    byId('archives-list')?.addEventListener('click', async (e) => {
      const el = e.target as HTMLElement;
      const view = el.closest<HTMLElement>('.btn-view-archive');
      if (view) {
        openArchiveId = view.dataset.id ?? null;
        ctx.store.refresh();
        byId('archive-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const btn = el.closest<HTMLElement>('.btn-del-archive');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!(await confirmDialog('Voulez-vous vraiment supprimer cette archive ?'))) return;
      ctx.store.update((s) => { s.archives = s.archives.filter((a) => a.id !== id); });
      showToast('Archive supprimée');
    });
  },

  render(s) {
    byId('cycle-alert-banner')?.classList.toggle('hidden', !isCycleExpired(s));

    const opened = s.archives.find((a) => a.id === openArchiveId);
    if (!opened) openArchiveId = null;
    byId('archives-list')?.classList.toggle('hidden', !!opened);
    byId('btn-manual-archive')?.classList.toggle('hidden', !!opened);
    byId('archive-detail')?.classList.toggle('hidden', !opened);
    if (opened) {
      renderDetail(opened);
      return;
    }

    const list = byId('archives-list');
    if (!list) return;
    list.innerHTML = s.archives.length === 0
      ? `<div class="p-8 text-center text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-700/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">Aucune archive pour l'instant. Vos bilans de 12 mois apparaîtront ici lors de la clôture.</div>`
      : s.archives.map((a) => `
        <div class="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h4 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHtml(a.title)}</h4>
            <p class="text-xs text-slate-500">${escapeHtml(periodLabel(a))} - Total épargné : <strong class="text-emerald-600">${formatCurrency(a.totalSavings)}</strong></p>
          </div>
          <div class="flex items-center gap-2">
            <button data-id="${escapeHtml(a.id)}" class="btn-view-archive px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition flex items-center gap-1.5">
              <i class="fa-solid fa-eye"></i> Consulter
            </button>
            <button data-id="${escapeHtml(a.id)}" class="btn-del-archive px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition border border-rose-200 dark:border-rose-800">
              Supprimer
            </button>
          </div>
        </div>`).join('');
  },
};

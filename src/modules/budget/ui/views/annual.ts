import { computeAnnualTrend, rollingMonths } from '../../domain/actuals';
import { MONTH_NAMES } from '../../domain/defaults';
import { overrideCount, totalsForMonth } from '../../domain/months';
import { formatCurrency } from '../../domain/format';
import { axes, legendTop, renderChart } from '../charts';
import type { View } from '../context';
import { byId, on } from '../dom';
import { archiveNow } from './archives';

export const annualView: View = {
  mount(ctx) {
    on('btn-rollover-annual', 'click', () => archiveNow(ctx));
  },

  render(s) {
    const currentMonth = new Date().getMonth();
    const tbody = byId('annual-table-body');
    if (tbody) {
      tbody.innerHTML = rollingMonths(currentMonth).map((m) => {
        const t = totalsForMonth(s, m);
        const specific = overrideCount(s, m) > 0;
        return `
        <tr>
          <td class="p-3 font-semibold sticky left-0 bg-white dark:bg-slate-800">${MONTH_NAMES[m]}${specific ? ' <i class="fa-solid fa-pen text-[10px] text-indigo-500" title="Budget spécifique à ce mois"></i>' : ''}</td>
          <td class="p-3 text-emerald-600 font-medium">${formatCurrency(t.income)}</td>
          <td class="p-3 text-slate-600 dark:text-slate-300">${formatCurrency(t.housing)}</td>
          <td class="p-3 text-slate-600 dark:text-slate-300">${formatCurrency(t.vehicleNet)}</td>
          <td class="p-3 text-slate-600 dark:text-slate-300">${formatCurrency(t.food)}</td>
          <td class="p-3 text-slate-600 dark:text-slate-300">${formatCurrency(t.subscriptionsNet)}</td>
          <td class="p-3 text-purple-600 font-medium">${formatCurrency(t.invest)}</td>
          <td class="p-3 text-right font-bold ${t.netAvailable < 0 ? 'text-rose-600' : 'text-brand-600'}">${formatCurrency(t.netAvailable)}</td>
        </tr>`;
      }).join('');
    }

    const trend = computeAnnualTrend(s, currentMonth);
    renderChart('chart-annual-trend', {
      type: 'line',
      data: {
        labels: trend.labels,
        datasets: [
          { label: 'Revenus (€)', data: trend.income, borderColor: '#10b981', tension: 0.3 },
          { label: 'Dépenses Prévues (€)', data: trend.plannedExpenses, borderColor: '#f43f5e', tension: 0.3 },
          { label: 'Dépenses Réelles (€)', data: trend.realExpenses, borderColor: '#f59e0b', borderDash: [5, 5], tension: 0.3 },
          { label: 'Patrimoine Cumulé (€)', data: trend.cumulative, borderColor: '#6366f1', borderWidth: 3, tension: 0.3 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: legendTop(), scales: axes() },
    });
  },
};

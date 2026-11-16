import { INVEST_CATEGORIES } from '../../domain/defaults';
import { camelToKebab, formatCurrency } from '../../domain/format';
import { computeProjection } from '../../domain/invest';
import { axes, legendTop, renderChart } from '../charts';
import type { View } from '../context';
import { setText } from '../dom';

export const investView: View = {
  mount() {},

  render(s, t) {
    setText('subtotal-invest', formatCurrency(t.invest));
    setText('val-proj-years', s.projYears);

    const p = computeProjection(s);

    for (const c of INVEST_CATEGORIES) {
      const data = p.series[c.id];
      setText(`final-${camelToKebab(c.id)}`, formatCurrency(data[data.length - 1]));
      renderChart(`chart-cat-${camelToKebab(c.id)}`, {
        type: 'line',
        data: {
          labels: p.labels,
          datasets: [{ data, borderColor: c.color, backgroundColor: c.color + '22', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.3 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { display: false }, y: { display: false } },
        },
      });
    }

    setText('proj-kpi-final', formatCurrency(p.totalFinal));
    setText('proj-kpi-total-invested', formatCurrency(p.totalInvested));
    setText('proj-kpi-interests', formatCurrency(p.totalInterests));

    renderChart('chart-proj-global', {
      type: 'line',
      data: {
        labels: p.labels,
        datasets: INVEST_CATEGORIES.map((c) => ({
          label: c.label,
          data: p.series[c.id],
          backgroundColor: c.color + '88',
          borderColor: c.color,
          fill: true,
          tension: 0.3,
        })),
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: legendTop(), scales: axes({ y: true }) },
    });

    renderChart('chart-proj-interest', {
      type: 'bar',
      data: {
        labels: p.labels,
        datasets: [
          { label: 'Capital sorti de votre poche', data: p.outOfPocket, backgroundColor: '#0284c7', borderRadius: 4 },
          { label: 'Intérêts composés générés', data: p.interests, backgroundColor: '#10b981', borderRadius: 4 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: legendTop(), scales: axes({ x: true, y: true }) },
    });
  },
};

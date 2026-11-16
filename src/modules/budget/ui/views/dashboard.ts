import { summaryRows } from '../../domain/budget';
import { escapeHtml, formatCurrency } from '../../domain/format';
import { nextDue } from '../../domain/annual';
import { monthEvents, projectBalance } from '../../domain/calendar';
import { coupleBudget } from '../../domain/couple';
import { detectRecurring } from '../../domain/insights';
import type { BudgetState } from '../../domain/types';
import { axes, renderChart, textColor } from '../charts';
import type { View } from '../context';
import { byId, setText } from '../dom';

interface Alert { icon: string; tone: string; title: string; text: string; tab: string }

/** Points qui méritent l'attention ce mois-ci, chacun renvoie à son onglet. */
function alerts(s: BudgetState): Alert[] {
  const out: Alert[] = [];
  const now = new Date();
  const checking = s.accounts.filter((a) => a.kind === 'courant' || a.kind === 'joint');
  if (checking.length) {
    const p = projectBalance(monthEvents(s, now.getMonth(), now.getFullYear()), checking.reduce((a, x) => a + x.balance, 0), now.getDate());
    if (p.lowest.balance < 0) out.push({ icon: 'fa-triangle-exclamation', tone: 'rose', title: 'Risque de découvert', text: `Solde prévu de ${formatCurrency(p.lowest.balance)} le ${p.lowest.day}.`, tab: 'calendar' });
  }
  const soon = s.annualCharges.map((c) => ({ c, due: nextDue(c, now) }))
    .filter((x) => x.due.getTime() - now.getTime() < 45 * 86400000).sort((a, b) => a.due.getTime() - b.due.getTime())[0];
  if (soon) out.push({ icon: 'fa-calendar-plus', tone: 'amber', title: 'Charge annuelle à venir', text: `${escapeHtml(soon.c.name)} : ${formatCurrency(soon.c.amount)} le ${soon.due.toLocaleDateString('fr-FR')}.`, tab: 'subscriptions' });
  const rec = detectRecurring(s);
  if (rec.length) out.push({ icon: 'fa-magnifying-glass-dollar', tone: 'teal', title: `${rec.length} prélèvement(s) récurrent(s) repéré(s)`, text: `Par exemple ${escapeHtml(rec[0].label)} (${formatCurrency(rec[0].amount)}). Abonnement oublié ?`, tab: 'subscriptions' });
  return out;
}

const TONE: Record<string, string> = {
  rose: 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-600',
  amber: 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-600',
  teal: 'border-teal-200 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/30 text-teal-600',
};

export const dashboardView: View = {
  mount() {
    document.getElementById('dash-alerts')?.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]')?.dataset.goto;
      if (tab) document.querySelector<HTMLElement>(`.tab-btn[data-tab="${tab}"]`)?.click();
    });
  },

  render(s, t) {
    const list = alerts(s);
    const box = byId('dash-alerts');
    if (box) {
      box.classList.toggle('hidden', !list.length);
      box.innerHTML = list.map((a) => `
        <button data-goto="${a.tab}" class="text-left p-4 rounded-2xl border ${TONE[a.tone]} hover:shadow-sm transition flex gap-3">
          <i class="fa-solid ${a.icon} mt-0.5"></i>
          <span><span class="block text-sm font-bold text-slate-800 dark:text-slate-100">${a.title}</span><span class="text-xs text-slate-600 dark:text-slate-300">${a.text}</span></span>
        </button>`).join('');
    }

    byId('dash-couple')?.classList.toggle('hidden', !s.couple.enabled);
    if (s.couple.enabled) {
      const cb = coupleBudget(s, t);
      setText('dash-couple-split', `· répartition ${Math.round(cb.shareA * 100)} % / ${100 - Math.round(cb.shareA * 100)} %`);
      const person = (name: string, p: { income: number; expenses: number; left: number }) => `
        <div class="p-3 rounded-xl bg-pink-50/50 dark:bg-pink-950/20 space-y-1 text-sm">
          <div class="font-bold">${escapeHtml(name)}</div>
          <div class="flex justify-between text-xs"><span class="text-slate-500">Revenus</span><span>${formatCurrency(p.income)}</span></div>
          <div class="flex justify-between text-xs"><span class="text-slate-500">Part des dépenses communes</span><span class="text-rose-600">${formatCurrency(p.expenses)}</span></div>
          <div class="flex justify-between text-xs font-bold"><span>Reste (avant épargne)</span><span class="${p.left < 0 ? 'text-rose-600' : 'text-emerald-600'}">${formatCurrency(p.left)}</span></div>
        </div>`;
      const body = byId('dash-couple-body');
      if (body) body.innerHTML = person(s.couple.nameA, cb.A) + person(s.couple.nameB, cb.B);
    }

    setText('kpi-income', formatCurrency(t.income));
    setText('kpi-income-hint', s.couple.enabled ? `Vos revenus + ceux de ${s.couple.nameB}` : 'Salaire + Primes + Annexes');
    setText('kpi-expenses', formatCurrency(t.totalExpenses));
    setText('kpi-invest', formatCurrency(t.invest));
    setText('kpi-net', formatCurrency(t.netAvailable));
    setText('kpi-invest-rate', `${t.income > 0 ? ((t.invest / t.income) * 100).toFixed(1) : 0}%`);

    // Les postes à zéro (pas de dette, pas de charge annuelle...) sont retirés de la légende.
    const slices = [
      { label: 'Logement', value: t.housing, color: '#3b82f6' },
      { label: 'Voiture', value: t.vehicleNet, color: '#f59e0b' },
      { label: 'Nourriture', value: t.food, color: '#f97316' },
      { label: 'Abonnements', value: t.subscriptionsNet, color: '#14b8a6' },
      { label: 'Dettes', value: t.debts, color: '#e11d48' },
      { label: 'Charges annuelles', value: t.annualProvision, color: '#eab308' },
      { label: 'Investissements', value: t.invest, color: '#a855f7' },
    ].filter((x) => x.value > 0);
    renderChart('chart-breakdown', {
      type: 'doughnut',
      data: {
        labels: slices.map((x) => `${x.label} (${formatCurrency(x.value)})`),
        datasets: [{
          data: slices.map((x) => x.value),
          backgroundColor: slices.map((x) => x.color),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: textColor(), font: { size: 10 } } } },
      },
    });

    renderChart('chart-summary', {
      type: 'bar',
      data: {
        labels: ['Revenus', 'Dépenses', 'Investis', 'Reste'],
        datasets: [{
          data: [t.income, t.totalExpenses, t.invest, Math.max(0, t.netAvailable)],
          backgroundColor: ['#10b981', '#f43f5e', '#a855f7', '#0284c7'],
          borderRadius: 8,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axes() },
    });

    const tbody = byId('summary-table-body');
    if (!tbody) return;
    tbody.innerHTML = summaryRows(t)
      .map((it) => `
        <tr>
          <td class="p-4 font-semibold text-slate-800 dark:text-slate-200">${it.name}</td>
          <td class="p-4"><span class="px-2.5 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${it.cat}</span></td>
          <td class="p-4 text-right font-bold">${formatCurrency(it.amount)}</td>
          <td class="p-4 text-right text-slate-500">${it.pct}%</td>
        </tr>`)
      .join('');
  },
};

import { MONTH_NAMES } from '../../domain/defaults';
import { CHARGE_ITEMS, DEFAULT_DEBT_DAY, DEFAULT_SUB_DAY, monthEvents, projectBalance, type CalendarEvent } from '../../domain/calendar';
import { escapeHtml, formatCurrency } from '../../domain/format';
import { stateForMonth, yearOfCycleMonth } from '../../domain/months';
import type { BudgetState } from '../../domain/types';
import type { View } from '../context';
import { byId, on, setText } from '../dom';

const KIND_STYLE: Record<CalendarEvent['kind'], string> = {
  income: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  charge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  sub: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
  debt: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
  annual: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  invest: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
};

/** Comptes dont le solde sert au calendrier : courant et joint. */
const checkingBalance = (s: BudgetState) => s.accounts.filter((a) => a.kind === 'courant' || a.kind === 'joint');

const dayInput = (target: string, value: number | undefined, fallback: number, label: string, amount: string) => `
  <label class="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700">
    <span class="flex-1 min-w-0"><span class="block text-xs font-semibold truncate">${escapeHtml(label)}</span><span class="text-[11px] text-slate-500">${amount}</span></span>
    <span class="text-[11px] text-slate-400">le</span>
    <input type="number" min="1" max="31" step="1" data-target="${target}" value="${value ?? fallback}"
      class="inp-cal-day w-14 p-1.5 text-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold ${value === undefined ? 'text-slate-400' : ''}">
  </label>`;

export const calendarView: View = {
  mount({ store, ui }) {
    const shift = (d: number) => { ui.calendarMonth = (ui.calendarMonth + d + 12) % 12; store.refresh(); };
    on('cal-prev', 'click', () => shift(-1));
    on('cal-next', 'click', () => shift(1));

    byId('cal-days')?.addEventListener('change', (e) => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('.inp-cal-day');
      if (!input) return;
      const raw = Math.round(Number(input.value));
      const day = raw >= 1 && raw <= 31 ? raw : undefined;
      const [kind, id] = input.dataset.target!.split(':');
      store.update((s) => {
        if (kind === 'charge') {
          if (day) s.chargeDays[id] = day;
          else delete s.chargeDays[id];
        } else {
          const list = kind === 'sub' ? s.customSubscriptions : kind === 'debt' ? s.debts : s.annualCharges;
          const item = (list as { id: number; day?: number }[]).find((x) => x.id === Number(id));
          if (item) item.day = day;
        }
      });
    });
  },

  render(s, _t, { ui }) {
    const month = ui.calendarMonth;
    const year = yearOfCycleMonth(month);
    const now = new Date();
    const isCurrent = month === now.getMonth() && year === now.getFullYear();
    setText('cal-month-label', `${MONTH_NAMES[month]} ${year}`);

    const events = monthEvents(s, month, year);
    const totalIn = events.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
    const totalOut = events.filter((e) => e.amount < 0).reduce((a, e) => a - e.amount, 0);
    setText('cal-in', formatCurrency(totalIn));
    setText('cal-out', formatCurrency(totalOut));

    // Solde prévu : seulement pour le mois en cours, à partir du solde réel des comptes courants.
    const accounts = checkingBalance(s);
    const alert = byId('cal-alert');
    let balances = new Map<string, number>();
    if (isCurrent && accounts.length) {
      const start = accounts.reduce((a, x) => a + x.balance, 0);
      const p = projectBalance(events, start, now.getDate());
      balances = new Map(p.rows.map((r) => [r.key, r.balance]));
      setText('cal-start-label', "Solde des comptes courants aujourd'hui");
      setText('cal-start', formatCurrency(start));
      const low = byId('cal-low');
      if (low) {
        low.textContent = `${formatCurrency(p.lowest.balance)} le ${p.lowest.day}`;
        low.className = `text-xl font-bold mt-1 ${p.lowest.balance < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`;
      }
      alert?.classList.toggle('hidden', p.lowest.balance >= 0);
      setText('cal-alert-text', `Risque de découvert : le solde prévu descend à ${formatCurrency(p.lowest.balance)} le ${p.lowest.day} ${MONTH_NAMES[month].toLowerCase()}, avant les dépenses courantes. Pensez à alimenter le compte ou à décaler un virement.`);
    } else {
      setText('cal-start-label', 'Solde des comptes courants');
      setText('cal-start', accounts.length ? '-' : 'Aucun compte');
      setText('cal-low', '-');
      const low = byId('cal-low');
      if (low) low.className = 'text-xl font-bold mt-1 text-slate-400';
      alert?.classList.add('hidden');
    }

    const grid = byId('cal-grid');
    if (grid) {
      const first = (new Date(year, month, 1).getDay() + 6) % 7;
      const days = new Date(year, month + 1, 0).getDate();
      const cells: string[] = Array.from({ length: first }, () => '<div></div>');
      for (let d = 1; d <= days; d++) {
        const dayEvents = events.filter((e) => e.day === d);
        const today = isCurrent && d === now.getDate();
        const past = isCurrent && d < now.getDate();
        cells.push(`
          <div class="min-h-[5.5rem] p-1.5 rounded-lg border ${today ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200 dark:border-slate-700'} ${past ? 'opacity-50' : ''} bg-slate-50/60 dark:bg-slate-700/20">
            <div class="text-[11px] font-bold ${today ? 'text-brand-600' : 'text-slate-500'}">${d}</div>
            <div class="space-y-0.5 mt-0.5">${dayEvents.map((e) => `
              <div title="${escapeHtml(e.label)} : ${formatCurrency(e.amount)}" class="truncate text-[10px] leading-tight px-1 py-0.5 rounded ${KIND_STYLE[e.kind]}">${e.amount > 0 ? '+' : ''}${formatCurrency(e.amount)} ${escapeHtml(e.label)}</div>`).join('')}
            </div>
          </div>`);
      }
      grid.innerHTML = cells.join('');
    }

    const list = byId('cal-list');
    if (list) {
      list.innerHTML = events.length === 0
        ? '<p class="text-xs text-slate-400 italic">Aucun mouvement fixe ce mois-ci.</p>'
        : events.map((e) => {
          const bal = balances.get(e.key);
          return `
            <div class="flex items-center gap-2 text-xs p-2 rounded-lg ${isCurrent && e.day < now.getDate() ? 'opacity-50' : ''} hover:bg-slate-50 dark:hover:bg-slate-700/40">
              <span class="w-7 text-center font-bold text-slate-500">${e.day}</span>
              <span class="flex-1 min-w-0 truncate">${escapeHtml(e.label)}</span>
              <span class="font-bold ${e.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}">${e.amount > 0 ? '+' : ''}${formatCurrency(e.amount)}</span>
              ${bal !== undefined ? `<span class="w-20 text-right ${bal < 0 ? 'text-rose-600 font-bold' : 'text-slate-500'}">${formatCurrency(bal)}</span>` : ''}
            </div>`;
        }).join('');
    }
    const m = stateForMonth(s, month);
    const variable = m.groceries + m.restaurant + m.leisure + m.family;
    setText('cal-variable', `Non comptées ici : les dépenses courantes (courses, restaurants, loisirs), ${formatCurrency(variable)} prévus ce mois-ci, et l'énergie de la voiture.`);

    const days = byId('cal-days');
    if (days && !days.contains(document.activeElement)) {
      const ev = new Map(events.map((e) => [e.key, e]));
      const amountOf = (key: string, fallback = '') => {
        const e = ev.get(key);
        return e ? `${e.amount > 0 ? '+' : ''}${formatCurrency(e.amount)} / mois` : fallback;
      };
      const rows = CHARGE_ITEMS.map((c) => dayInput(`charge:${c.key}`, s.chargeDays[c.key], c.day, c.label, amountOf(`charge:${c.key}`, 'Montant nul')));
      if (s.couple.enabled) rows.push(dayInput('charge:incomeB', s.chargeDays.incomeB, s.chargeDays.income ?? 28, `Revenus de ${s.couple.nameB}`, formatCurrency(s.couple.incomeB)));
      rows.push(...s.customSubscriptions.map((x) => dayInput(`sub:${x.id}`, x.day, DEFAULT_SUB_DAY, x.name, `${formatCurrency(x.amount)} / mois`)));
      rows.push(...s.debts.filter((d) => d.amount > 0).map((d) => dayInput(`debt:${d.id}`, d.day, DEFAULT_DEBT_DAY, d.name, `${formatCurrency(d.monthly)} / mois`)));
      rows.push(...s.annualCharges.map((c) => dayInput(`annual:${c.id}`, c.day, 1, `${c.name} (${MONTH_NAMES[c.month].toLowerCase()})`, `${formatCurrency(c.amount)} / an`)));
      days.innerHTML = rows.join('');
    }
  },
};

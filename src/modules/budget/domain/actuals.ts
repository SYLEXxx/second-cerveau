import { MONTH_NAMES } from './defaults';
import { totalsForMonth } from './months';
import type { ActualExpense, BudgetState, MonthlyTotals } from './types';

export const sumExpenses = (list: ActualExpense[] = []) =>
  list.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

export type ConsumptionLevel = 'ok' | 'warning' | 'over';

export const consumptionLevel = (pct: number): ConsumptionLevel =>
  pct >= 100 ? 'over' : pct >= 85 ? 'warning' : 'ok';

/** Comparaison prévu / réel d'un mois, globale et par catégorie. */
export function computeActualsOverview(totals: MonthlyTotals, list: ActualExpense[]) {
  const planned = totals.totalExpenses;
  const real = sumExpenses(list);
  const pct = planned > 0 ? Math.min(100, Math.round((real / planned) * 100)) : 0;

  const categories = [
    { name: 'Logement', planned: totals.housing },
    { name: 'Voiture', planned: totals.vehicleNet },
    { name: 'Nourriture', planned: totals.food },
    { name: 'Abonnements', planned: totals.subscriptionsNet },
    ...(totals.debts > 0 ? [{ name: 'Crédits', planned: totals.debts }] : []),
  ].map((c) => {
    const spent = sumExpenses(
      list.filter((t) => t.category === c.name || (c.name === 'Voiture' && String(t.category).includes('Voiture'))),
    );
    const cPct = c.planned > 0 ? Math.min(100, Math.round((spent / c.planned) * 100)) : 0;
    return { ...c, spent, pct: cPct, level: consumptionLevel(cPct) };
  });

  return { planned, real, diff: planned - real, pct, level: consumptionLevel(pct), categories };
}

/** Mois du cycle de 12 mois, en partant du mois courant. */
export function rollingMonths(currentMonth: number): number[] {
  return Array.from({ length: 12 }, (_, i) => (currentMonth + i) % 12);
}

/** Séries du graphique « Trajectoire du patrimoine cumulé ». */
export function computeAnnualTrend(s: BudgetState, currentMonth: number) {
  let cum = 0;
  const months = rollingMonths(currentMonth);
  const totals = months.map((m) => totalsForMonth(s, m));
  return {
    labels: months.map((m) => MONTH_NAMES[m].substring(0, 3)),
    income: totals.map((t) => t.income),
    plannedExpenses: totals.map((t) => t.totalExpenses),
    realExpenses: months.map((m) => sumExpenses(s.actualExpenses[m])),
    cumulative: totals.map((t) => (cum += t.invest + Math.max(0, t.netAvailable))),
  };
}

/** Bilan d'une période (en cours ou archivée) : prévu et réel, mois par mois. */
export function periodReport(s: BudgetState, firstMonth: number) {
  const rows = rollingMonths(firstMonth).map((m) => {
    const t = totalsForMonth(s, m);
    const real = sumExpenses(s.actualExpenses[m]);
    return { month: m, totals: t, real, diff: t.totalExpenses - real, count: (s.actualExpenses[m] ?? []).length };
  });
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((acc, r) => acc + f(r), 0);
  return {
    rows,
    income: sum((r) => r.totals.income),
    planned: sum((r) => r.totals.totalExpenses),
    real: sum((r) => r.real),
    invest: sum((r) => r.totals.invest),
    net: sum((r) => r.totals.netAvailable),
  };
}

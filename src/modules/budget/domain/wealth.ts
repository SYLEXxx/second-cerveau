import { INVEST_CATEGORIES, type InvestCategoryId } from './defaults';
import { initKey, monthlyKey, rateKey } from './invest';
import type { BudgetState } from './types';

// Patrimoine : comptes + placements - dettes, et suivi de son évolution.

export const ACCOUNT_KINDS = [
  { value: 'courant', label: 'Compte courant' },
  { value: 'epargne', label: 'Épargne (livret...)' },
  { value: 'joint', label: 'Compte joint' },
  { value: 'autre', label: 'Autre' },
] as const;

const monthsBetween = (from: Date, to: Date) =>
  Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));

/**
 * Valeur attendue d'un placement à une date d'après le simulateur : capital de
 * départ au début du cycle, puis versements et rendement mensuels.
 */
export function expectedInvestValue(s: BudgetState, id: InvestCategoryId, at: Date = new Date()): number {
  const start = new Date(s.cycleStartDate);
  const months = Number.isNaN(start.getTime()) ? 0 : monthsBetween(start, at);
  const r = (s[rateKey(id)] || 0) / 100 / 12;
  let v = s[initKey(id)] || 0;
  for (let m = 0; m < months; m++) v = v * (1 + r) + (s[monthlyKey(id)] || 0);
  return v;
}

/** Valeur retenue d'un placement : la valeur réelle saisie, sinon le capital de départ. */
export const investValue = (s: BudgetState, id: InvestCategoryId) => s.investValues[id]?.value ?? (s[initKey(id)] || 0);

export function computeNetWorth(s: BudgetState) {
  const accounts = s.accounts.reduce((acc, a) => acc + (a.balance || 0), 0);
  const investments = INVEST_CATEGORIES.reduce((acc, c) => acc + investValue(s, c.id), 0);
  const debts = s.debts.reduce((acc, d) => acc + Math.max(0, d.amount || 0), 0);
  return { accounts, investments, debts, total: accounts + investments - debts };
}

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * Note la valeur nette du mois en cours dans l'historique (un point par mois,
 * le dernier calcul du mois l'emporte). Renvoie true si l'historique a changé.
 */
export function recordNetWorth(s: BudgetState, now: Date = new Date()): boolean {
  // Rien à suivre tant qu'aucun compte, placement réel ou dette n'est saisi.
  if (!s.accounts.length && !Object.keys(s.investValues).length && !s.debts.length) return false;
  const value = Math.round(computeNetWorth(s).total);
  const month = monthKey(now);
  const last = s.netWorthHistory[s.netWorthHistory.length - 1];
  if (last?.month === month) {
    if (last.value === value) return false;
    last.value = value;
  } else {
    s.netWorthHistory.push({ month, value });
    s.netWorthHistory.sort((a, b) => a.month.localeCompare(b.month));
  }
  return true;
}

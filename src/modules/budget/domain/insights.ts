import { sumExpenses } from './actuals';
import { merchantKey, normalizeLabel } from './categorize';
import type { ActualExpense, BudgetState } from './types';

// Analyses des dépenses réelles : comparaison avec l'an dernier, prélèvements
// récurrents oubliés, recherche.

/** Dépenses du même mois l'an dernier, tirées du dernier bilan archivé qui en contient. */
export function lastYearSameMonth(s: BudgetState, month: number) {
  for (const a of s.archives) {
    const list = a.stateSnapshot?.actualExpenses?.[month];
    if (list?.length) {
      const byCategory: Record<string, number> = {};
      for (const t of list) byCategory[String(t.category)] = (byCategory[String(t.category)] ?? 0) + (Number(t.amount) || 0);
      return { total: sumExpenses(list), byCategory, archiveTitle: a.title };
    }
  }
  return null;
}

export interface RecurringCandidate {
  key: string;
  label: string;
  /** Montant habituel (médiane). */
  amount: number;
  months: number;
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

/** Toutes les dépenses connues : année en cours et dernier bilan archivé, avec leur mois. */
function allExpenses(s: BudgetState): { month: string; tx: ActualExpense }[] {
  const out: { month: string; tx: ActualExpense }[] = [];
  for (const [m, list] of Object.entries(s.actualExpenses)) for (const tx of list) out.push({ month: `cur-${m}`, tx });
  const archived = s.archives.find((a) => a.stateSnapshot)?.stateSnapshot?.actualExpenses ?? {};
  for (const [m, list] of Object.entries(archived)) for (const tx of list as ActualExpense[]) out.push({ month: `old-${m}`, tx });
  return out;
}

/**
 * Prélèvements qui reviennent au moins 2 mois différents pour un montant
 * proche (±15 %) et qui ne figurent pas dans les abonnements : souvent un
 * abonnement oublié.
 */
export function detectRecurring(s: BudgetState): RecurringCandidate[] {
  const groups = new Map<string, { label: string; months: Set<string>; amounts: number[] }>();
  for (const { month, tx } of allExpenses(s)) {
    const key = merchantKey(tx.label);
    if (!key) continue;
    const g = groups.get(key) ?? { label: tx.label, months: new Set(), amounts: [] };
    g.months.add(month);
    g.amounts.push(Number(tx.amount) || 0);
    groups.set(key, g);
  }
  const known = s.customSubscriptions.map((c) => normalizeLabel(c.name));
  const out: RecurringCandidate[] = [];
  for (const [key, g] of groups) {
    if (g.months.size < 2 || s.ignoredRecurring.includes(key)) continue;
    if (known.some((k) => k && (k.includes(key) || key.includes(k)))) continue;
    const med = median(g.amounts);
    if (med <= 0 || !g.amounts.every((a) => Math.abs(a - med) <= med * 0.15)) continue;
    out.push({ key, label: g.label, amount: Math.round(med * 100) / 100, months: g.months.size });
  }
  return out.sort((a, b) => b.months - a.months || b.amount - a.amount);
}

export interface ExpenseFilter {
  text?: string;
  category?: string;
  tag?: string;
  min?: number;
  max?: number;
}

export function matchesFilter(tx: ActualExpense, f: ExpenseFilter): boolean {
  if (f.text) {
    const needle = normalizeLabel(f.text);
    const hay = normalizeLabel(`${tx.label} ${tx.subcategory ?? ''} ${(tx.tags ?? []).join(' ')}`);
    if (needle && !hay.includes(needle)) return false;
  }
  if (f.category && tx.category !== f.category) return false;
  if (f.tag && !(tx.tags ?? []).includes(f.tag)) return false;
  if (f.min !== undefined && tx.amount < f.min) return false;
  if (f.max !== undefined && tx.amount > f.max) return false;
  return true;
}

export const isFilterActive = (f: ExpenseFilter) =>
  !!(f.text || f.category || f.tag || f.min !== undefined || f.max !== undefined);

/** « courses, Vacances 2026 ,, » → ["courses", "vacances 2026"] (sans doublons). */
export function parseTags(input: string): string[] {
  return [...new Set(input.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

/** Toutes les étiquettes utilisées, avec leur total. */
export function tagTotals(s: BudgetState) {
  const totals = new Map<string, number>();
  for (const list of Object.values(s.actualExpenses)) {
    for (const tx of list) for (const tag of tx.tags ?? []) totals.set(tag, (totals.get(tag) ?? 0) + tx.amount);
  }
  return [...totals.entries()].map(([tag, total]) => ({ tag, total })).sort((a, b) => b.total - a.total);
}

/** Sous-catégories déjà utilisées pour une catégorie (suggestions de saisie). */
export function knownSubcategories(s: BudgetState, category: string): string[] {
  const set = new Set<string>();
  for (const list of Object.values(s.actualExpenses)) {
    for (const tx of list) if (tx.category === category && tx.subcategory) set.add(tx.subcategory);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}

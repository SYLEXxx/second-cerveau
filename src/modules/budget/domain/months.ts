import { computeMonthlyTotals } from './budget';
import type { BudgetState, MonthlyTotals, NumericKey } from './types';

/**
 * Montants du planificateur (onglet Budget) qui peuvent varier d'un mois à
 * l'autre. Les abonnements, investissements et réglages du véhicule restent
 * communs à toute l'année.
 */
export const MONTHLY_FIELDS: NumericKey[] = [
  'salary', 'bonus', 'extra', 'allowance',
  'rent', 'charges', 'elec', 'taxIns', 'webMobile',
  'kmTotal', 'kmWork', 'reimbRate',
  'evLease', 'evInsurance', 'evMaint', 'evCons', 'evHomeRatio', 'evPriceHome', 'evPricePublic',
  'iceLease', 'iceInsurance', 'iceMaint', 'iceCons', 'iceFuelPrice',
  'groceries', 'restaurant', 'leisure', 'family',
];

export const isMonthlyField = (key: NumericKey) => MONTHLY_FIELDS.includes(key);

/** Budget effectif d'un mois : budget de base + montants propres à ce mois. */
export function stateForMonth(s: BudgetState, month: number): BudgetState {
  const o = s.monthOverrides?.[month];
  return o ? { ...s, ...o } : s;
}

export const totalsForMonth = (s: BudgetState, month: number): MonthlyTotals =>
  computeMonthlyTotals(stateForMonth(s, month));

export const overrideCount = (s: BudgetState, month: number) => Object.keys(s.monthOverrides?.[month] ?? {}).length;

/** Fixe un montant pour un seul mois ; revenir à la valeur de base efface l'exception. */
export function setMonthValue(s: BudgetState, month: number, key: NumericKey, value: number): void {
  const o = { ...(s.monthOverrides[month] ?? {}) };
  if (value === s[key]) delete o[key];
  else o[key] = value;
  if (Object.keys(o).length) s.monthOverrides[month] = o;
  else delete s.monthOverrides[month];
}

/** « Valable toute l'année » : les montants de ce mois deviennent le budget de base de tous les mois. */
export function applyMonthToAllYear(s: BudgetState, month: number): void {
  const o = s.monthOverrides[month] ?? {};
  for (const [key, value] of Object.entries(o) as [NumericKey, number][]) {
    s[key] = value;
    for (const m of Object.keys(s.monthOverrides).map(Number)) {
      const other = s.monthOverrides[m];
      delete other[key];
      if (!Object.keys(other).length) delete s.monthOverrides[m];
    }
  }
}

export function resetMonth(s: BudgetState, month: number): void {
  delete s.monthOverrides[month];
}

/** Année d'un mois du cycle glissant de 12 mois qui commence au mois courant. */
export function yearOfCycleMonth(month: number, now: Date = new Date()): number {
  return month >= now.getMonth() ? now.getFullYear() : now.getFullYear() + 1;
}

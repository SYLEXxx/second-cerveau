import { computeMonthlyTotals } from './budget';
import { computeProjection } from './invest';
import type { BudgetState, NumericKey, Scenario } from './types';

// Scénarios « et si... » : variantes du budget de base comparées sans le modifier.

export const SCENARIO_GROUPS: { title: string; fields: { key: NumericKey; label: string }[] }[] = [
  { title: 'Revenus', fields: [
    { key: 'salary', label: 'Salaire net' }, { key: 'bonus', label: 'Primes' },
    { key: 'extra', label: 'Freelance / extras' }, { key: 'allowance', label: 'Aides' },
  ] },
  { title: 'Logement', fields: [
    { key: 'rent', label: 'Loyer / crédit' }, { key: 'charges', label: 'Charges' },
    { key: 'elec', label: 'Énergie' }, { key: 'taxIns', label: 'Taxes et assurance' }, { key: 'webMobile', label: 'Box et mobile' },
  ] },
  { title: 'Voiture', fields: [
    { key: 'kmTotal', label: 'Km par mois' }, { key: 'evLease', label: 'Location électrique' },
    { key: 'iceLease', label: 'Crédit / LLD thermique' }, { key: 'evInsurance', label: 'Assurance électrique' },
    { key: 'iceInsurance', label: 'Assurance thermique' },
  ] },
  { title: 'Vie courante', fields: [
    { key: 'groceries', label: 'Courses' }, { key: 'restaurant', label: 'Restaurants' },
    { key: 'leisure', label: 'Loisirs' }, { key: 'family', label: 'Shopping / famille' },
  ] },
  { title: 'Épargne mensuelle', fields: [
    { key: 'savings', label: 'Épargne sécurisée' }, { key: 'etf', label: 'Bourse / ETF' },
    { key: 'crypto', label: 'Crypto' }, { key: 'realestate', label: 'Immobilier / SCPI' }, { key: 'otherInvest', label: 'Autres' },
  ] },
];

export const SCENARIO_KEYS = SCENARIO_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

export function applyScenario(s: BudgetState, sc: Scenario): BudgetState {
  const out = { ...s };
  for (const [k, v] of Object.entries(sc.changes)) {
    if (SCENARIO_KEYS.includes(k as NumericKey) && typeof v === 'number') out[k as NumericKey] = v;
  }
  return out;
}

/** Chiffres clés du budget de base et du scénario, côte à côte. */
export function compareScenario(s: BudgetState, sc: Scenario) {
  const variant = applyScenario(s, sc);
  const summary = (x: BudgetState) => {
    const t = computeMonthlyTotals(x);
    return {
      income: t.income,
      expenses: t.totalExpenses,
      invest: t.invest,
      net: t.netAvailable,
      yearlySavings: (t.invest + Math.max(0, t.netAvailable)) * 12,
      projected: computeProjection(x).totalFinal,
    };
  };
  return { base: summary(s), scenario: summary(variant), years: s.projYears };
}

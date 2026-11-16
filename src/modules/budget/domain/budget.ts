import type { BudgetState, MonthlyTotals } from './types';

// Calculs du budget mensuel. Fonctions pures : aucune dépendance au DOM,
// testées dans tests/budget.test.ts.

const n = (v: number | undefined | null): number => (Number.isFinite(v) ? (v as number) : 0);

export function vehicleCostPerKm(s: BudgetState): number {
  if (s.vehicleMode === 'EV') {
    const kwhPerKm = n(s.evCons) / 100;
    const homeRatio = n(s.evHomeRatio) / 100;
    const avgPrice = n(s.evPriceHome) * homeRatio + n(s.evPricePublic) * (1 - homeRatio);
    return kwhPerKm * avgPrice;
  }
  return (n(s.iceCons) / 100) * n(s.iceFuelPrice);
}

export interface VehicleBreakdown {
  lease: number;
  insuranceAndMaintenance: number;
  fixed: number;
  costPerKm: number;
  kmPerso: number;
  persoCost: number;
  workGrossCost: number;
  grossEnergy: number;
  reimbursement: number;
  netEnergy: number;
  net: number;
}

export function computeVehicle(s: BudgetState): VehicleBreakdown {
  const ev = s.vehicleMode === 'EV';
  const lease = ev ? n(s.evLease) : n(s.iceLease);
  const insuranceAndMaintenance = ev
    ? n(s.evInsurance) + n(s.evMaint)
    : n(s.iceInsurance) + n(s.iceMaint);
  const fixed = lease + insuranceAndMaintenance;

  const costPerKm = vehicleCostPerKm(s);
  const kmPerso = Math.max(0, n(s.kmTotal) - n(s.kmWork));
  const grossEnergy = n(s.kmTotal) * costPerKm;
  const workGrossCost = n(s.kmWork) * costPerKm;
  const reimbursement = s.isWorkReimbursed ? workGrossCost * (n(s.reimbRate) / 100) : 0;
  const netEnergy = grossEnergy - reimbursement;

  return {
    lease,
    insuranceAndMaintenance,
    fixed,
    costPerKm,
    kmPerso,
    persoCost: kmPerso * costPerKm,
    workGrossCost,
    grossEnergy,
    reimbursement,
    netEnergy,
    net: fixed + netEnergy,
  };
}

export interface SubscriptionsBreakdown {
  transitGross: number;
  transitReimbursement: number;
  transitNet: number;
  customTotal: number;
  net: number;
}

export function computeSubscriptions(s: BudgetState): SubscriptionsBreakdown {
  const transitGross = n(s.subTransit);
  const transitReimbursement = transitGross * (n(s.subTransitReimbRate) / 100);
  const transitNet = transitGross - transitReimbursement;
  const customTotal = (s.customSubscriptions ?? []).reduce((acc, c) => acc + n(Number(c.amount)), 0);
  return { transitGross, transitReimbursement, transitNet, customTotal, net: transitNet + customTotal };
}

/** Mensualités des dettes en cours comptées dans le budget. */
export function debtsMonthly(s: BudgetState): number {
  return (s.debts ?? []).filter((d) => d.inBudget && d.amount > 0).reduce((acc, d) => acc + n(d.monthly), 0);
}

/** Provision mensuelle des charges annuelles (assurance, taxe foncière...). */
export function annualProvisionMonthly(s: BudgetState): number {
  return (s.annualCharges ?? []).reduce((acc, c) => acc + n(c.amount), 0) / 12;
}

export function computeMonthlyTotals(s: BudgetState): MonthlyTotals {
  const income = n(s.salary) + n(s.bonus) + n(s.extra) + n(s.allowance) + (s.couple?.enabled ? n(s.couple.incomeB) : 0);
  const housing = n(s.rent) + n(s.charges) + n(s.elec) + n(s.taxIns) + n(s.webMobile);
  const food = n(s.groceries) + n(s.restaurant) + n(s.leisure) + n(s.family);
  const invest = n(s.savings) + n(s.etf) + n(s.crypto) + n(s.realestate) + n(s.otherInvest);
  const vehicleNet = computeVehicle(s).net;
  const subscriptionsNet = computeSubscriptions(s).net;
  const debts = debtsMonthly(s);
  const annualProvision = annualProvisionMonthly(s);
  const totalExpenses = housing + food + vehicleNet + subscriptionsNet + debts + annualProvision;

  return {
    income,
    housing,
    food,
    invest,
    vehicleNet,
    subscriptionsNet,
    debts,
    annualProvision,
    totalExpenses,
    netAvailable: income - totalExpenses - invest,
  };
}

/** Lignes du tableau « Synthèse récapitulative » du tableau de bord. */
export function summaryRows(t: MonthlyTotals) {
  const pct = (v: number) => (t.income ? ((v / t.income) * 100).toFixed(1) : '0');
  return [
    { name: 'Logement & Charges', cat: 'Fixe', amount: t.housing },
    { name: 'Voiture & Transports', cat: 'Transport', amount: t.vehicleNet },
    { name: 'Nourriture & Quotidien', cat: 'Vie courante', amount: t.food },
    { name: 'Abonnements', cat: 'Services', amount: t.subscriptionsNet },
    ...(t.debts > 0 ? [{ name: 'Dettes & crédits', cat: 'Remboursement', amount: t.debts }] : []),
    ...(t.annualProvision > 0 ? [{ name: 'Charges annuelles (provision)', cat: 'Mise de côté', amount: t.annualProvision }] : []),
    { name: 'Épargne & Investissements', cat: 'Patrimoine', amount: t.invest },
  ].map((r) => ({ ...r, pct: pct(r.amount) }));
}

import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../../src/modules/budget/domain/defaults';
import { computeMonthlyTotals, computeVehicle } from '../../src/modules/budget/domain/budget';
import type { BudgetState } from '../../src/modules/budget/domain/types';

// Copie conforme de computeBaseMonthlyTotals() de simulateur_budget_pro_v4_4.html,
// pour vérifier que le portage donne les mêmes chiffres.
function legacyTotals(state: any) {
  const income = (state.salary || 0) + (state.bonus || 0) + (state.extra || 0) + (state.allowance || 0);
  const housing = (state.rent || 0) + (state.charges || 0) + (state.elec || 0) + (state.taxIns || 0) + (state.webMobile || 0);
  const food = (state.groceries || 0) + (state.restaurant || 0) + (state.leisure || 0) + (state.family || 0);
  const invest = (state.savings || 0) + (state.etf || 0) + (state.crypto || 0) + (state.realestate || 0) + (state.otherInvest || 0);
  let fixedAuto = 0;
  let costPerKm = 0;
  if (state.vehicleMode === 'EV') {
    fixedAuto = (state.evLease || 0) + (state.evInsurance || 0) + (state.evMaint || 0);
    const kwhPerKm = (state.evCons || 16) / 100;
    const avgPrice = ((state.evPriceHome || 0.25) * ((state.evHomeRatio || 80) / 100)) + ((state.evPricePublic || 0.55) * ((100 - (state.evHomeRatio || 80)) / 100));
    costPerKm = kwhPerKm * avgPrice;
  } else {
    fixedAuto = (state.iceLease || 0) + (state.iceInsurance || 0) + (state.iceMaint || 0);
    costPerKm = ((state.iceCons || 6.5) / 100) * (state.iceFuelPrice || 1.85);
  }
  const grossEnergy = (state.kmTotal || 0) * costPerKm;
  const workEnergy = (state.kmWork || 0) * costPerKm;
  const reimb = state.isWorkReimbursed ? workEnergy * ((state.reimbRate || 100) / 100) : 0;
  const vehicleNet = fixedAuto + (grossEnergy - reimb);
  const transitNet = (state.subTransit || 0) * (1 - ((state.subTransitReimbRate || 50) / 100));
  const customSubsTotal = (state.customSubscriptions || []).reduce((acc: number, c: any) => acc + (parseFloat(c.amount) || 0), 0);
  const subsNet = transitNet + customSubsTotal;
  return {
    income, housing, food, invest, vehicleNet,
    subscriptionsNet: subsNet,
    totalExpenses: housing + food + vehicleNet + subsNet,
    netAvailable: income - (housing + food + vehicleNet + subsNet) - invest,
  };
}

function expectClose(a: Record<string, number>, b: Record<string, number>) {
  for (const k of Object.keys(b)) expect(a[k], k).toBeCloseTo(b[k], 9);
}

describe('computeMonthlyTotals', () => {
  it('donne les chiffres attendus sur les données par défaut', () => {
    const t = computeMonthlyTotals(createDefaultState());
    expect(t.income).toBe(2800);
    expect(t.housing).toBe(1095);
    expect(t.food).toBe(700);
    expect(t.invest).toBe(550);
    expect(t.vehicleNet).toBeCloseTo(409.76, 6);
    expect(t.subscriptionsNet).toBeCloseTo(87.5, 6);
    expect(t.netAvailable).toBeCloseTo(-42.26, 6);
  });

  it('est identique à la version HTML sur des budgets aléatoires (valeurs non nulles)', () => {
    let seed = 42;
    const rnd = (max: number) => ((seed = (seed * 16807) % 2147483647) / 2147483647) * max + 1;
    for (let i = 0; i < 200; i++) {
      const s: BudgetState = {
        ...createDefaultState(),
        vehicleMode: i % 2 ? 'EV' : 'ICE',
        isWorkReimbursed: i % 3 !== 0,
        salary: rnd(8000), bonus: rnd(500), rent: rnd(2000), groceries: rnd(800),
        kmTotal: rnd(3000), kmWork: rnd(1000), reimbRate: rnd(99),
        evCons: rnd(25), evHomeRatio: rnd(99), evPriceHome: rnd(1), evPricePublic: rnd(1),
        iceCons: rnd(10), iceFuelPrice: rnd(2), subTransit: rnd(100), subTransitReimbRate: rnd(99),
        etf: rnd(500),
      };
      expectClose(computeMonthlyTotals(s) as any, legacyTotals(s));
    }
  });

  it('respecte un taux de remboursement à 0 % (la version HTML le lisait comme 100 %)', () => {
    const s = { ...createDefaultState(), reimbRate: 0 };
    expect(computeVehicle(s).reimbursement).toBe(0);
  });
});

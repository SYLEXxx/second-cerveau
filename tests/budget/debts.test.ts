import { describe, expect, it } from 'vitest';
import { computeMonthlyTotals, summaryRows } from '../../src/modules/budget/domain/budget';
import { addDebtPayment, debtEnd } from '../../src/modules/budget/domain/debt';
import { createDefaultState } from '../../src/modules/budget/domain/defaults';
import { migrate } from '../../src/modules/budget/domain/migrations';
import { categorize } from '../../src/modules/budget/domain/categorize';
import type { Debt } from '../../src/modules/budget/domain/types';

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 1, name: 'Prêt auto', amount: 1200, initial: 1200, rate: 0, monthly: 100, inBudget: true, payments: [], ...over,
});

describe('dettes', () => {
  it('compte les mensualités dans les dépenses prévues, sauf hors budget ou soldées', () => {
    const base = computeMonthlyTotals(createDefaultState());
    const s = createDefaultState();
    s.debts = [debt(), debt({ id: 2, monthly: 50, inBudget: false }), debt({ id: 3, amount: 0, monthly: 70 })];
    const t = computeMonthlyTotals(s);
    expect(t.debts).toBe(100);
    expect(t.totalExpenses).toBeCloseTo(base.totalExpenses + 100, 6);
    expect(t.netAvailable).toBeCloseTo(base.netAvailable - 100, 6);
    expect(summaryRows(t).some((r) => r.name === 'Dettes & crédits')).toBe(true);
    expect(summaryRows(base).some((r) => r.name === 'Dettes & crédits')).toBe(false);
  });

  it('un paiement couvre les intérêts du mois puis réduit le capital', () => {
    const d = debt({ amount: 1000, rate: 12 });
    const p = addDebtPayment(d, 110);
    expect(p.principal).toBeCloseTo(100, 6);
    expect(d.amount).toBe(900);
    expect(d.payments).toHaveLength(1);
  });

  it('le capital ne descend pas sous zéro', () => {
    const d = debt({ amount: 50 });
    addDebtPayment(d, 100);
    expect(d.amount).toBe(0);
  });

  it('estime la date de fin', () => {
    const end = debtEnd(debt(), new Date(2026, 9, 1));
    expect(end.kind).toBe('ok');
    if (end.kind === 'ok') {
      expect(end.months).toBe(12);
      expect(end.date.getFullYear()).toBe(2027);
    }
  });

  it('migre une sauvegarde v2 sans dettes et nettoie les dettes importées', () => {
    expect(migrate({ schemaVersion: 2 }).debts).toEqual([]);
    const s = migrate({ debts: [{ name: 'X', amount: '500', monthly: 50 }, 'bad'] });
    expect(s.debts).toHaveLength(1);
    expect(s.debts[0]).toMatchObject({ amount: 500, initial: 500, rate: 0, inBudget: true, payments: [] });
  });

  it('classe les échéances de crédit', () => {
    expect(categorize('PRLV SEPA COFIDIS ECHEANCE', [])).toBe('Crédits');
  });
});

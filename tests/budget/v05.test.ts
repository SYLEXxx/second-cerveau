import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { computeMonthlyTotals } from '../../src/modules/budget/domain/budget';
import { createDefaultState } from '../../src/modules/budget/domain/defaults';
import { migrate } from '../../src/modules/budget/domain/migrations';
import { computeNetWorth, expectedInvestValue, recordNetWorth } from '../../src/modules/budget/domain/wealth';
import { nextDue, provisionStatus } from '../../src/modules/budget/domain/annual';
import { monthEvents, projectBalance } from '../../src/modules/budget/domain/calendar';
import { detectRecurring, lastYearSameMonth, matchesFilter, parseTags } from '../../src/modules/budget/domain/insights';
import { coupleBudget, settlement, shareOfA } from '../../src/modules/budget/domain/couple';
import { compareScenario } from '../../src/modules/budget/domain/scenarios';
import { simulatePayoff } from '../../src/modules/budget/domain/debt';
import { buildXlsx } from '../../src/modules/budget/domain/xlsx';
import { deriveKey, encryptText, isEncrypted, unlock } from '../../src/modules/budget/domain/vault';
import { archiveCurrentPeriod } from '../../src/modules/budget/domain/archive';
import type { Debt } from '../../src/modules/budget/domain/types';

const debt = (o: Partial<Debt>): Debt => ({ id: 1, name: 'D', amount: 1000, initial: 1000, rate: 0, monthly: 100, inBudget: true, payments: [], ...o });

describe('patrimoine', () => {
  it('valeur nette = comptes + placements - dettes', () => {
    const s = createDefaultState();
    s.accounts = [{ id: 1, name: 'CC', kind: 'courant', balance: 1500, updatedAt: '' }];
    s.debts = [debt({ amount: 2000 })];
    s.investValues = { etf: { value: 1200, date: '' } };
    const nw = computeNetWorth(s);
    // Placements : ETF réel 1200 + capital de départ des autres (5000 + 500).
    expect(nw.investments).toBe(1200 + 5000 + 500);
    expect(nw.total).toBe(1500 + 6700 - 2000);
  });

  it('un point d\'historique par mois', () => {
    const s = createDefaultState();
    expect(recordNetWorth(s)).toBe(false);
    s.accounts = [{ id: 1, name: 'CC', kind: 'courant', balance: 100, updatedAt: '' }];
    expect(recordNetWorth(s, new Date(2026, 9, 3))).toBe(true);
    s.accounts[0].balance = 200;
    recordNetWorth(s, new Date(2026, 9, 20));
    recordNetWorth(s, new Date(2026, 10, 2));
    expect(s.netWorthHistory.map((p) => p.month)).toEqual(['2026-10', '2026-11']);
  });

  it('valeur attendue d\'un placement', () => {
    const s = createDefaultState(new Date(2026, 0, 1));
    s.initEtf = 1000; s.etf = 100; s.rateEtf = 0;
    expect(expectedInvestValue(s, 'etf', new Date(2026, 3, 1))).toBe(1300);
  });
});

describe('charges annuelles', () => {
  it('provision mensuelle comptée dans les dépenses', () => {
    const s = createDefaultState();
    const base = computeMonthlyTotals(s).totalExpenses;
    s.annualCharges = [{ id: 1, name: 'Taxe foncière', amount: 1200, month: 9 }];
    const t = computeMonthlyTotals(s);
    expect(t.annualProvision).toBe(100);
    expect(t.totalExpenses).toBeCloseTo(base + 100, 6);
  });

  it('prochaine échéance et part déjà mise de côté', () => {
    const c = { id: 1, name: 'Assurance', amount: 600, month: 2, day: 15 };
    expect(nextDue(c, new Date(2026, 9, 19))).toEqual(new Date(2027, 2, 15));
    const st = provisionStatus(c, new Date(2026, 9, 19));
    expect(st.monthsLeft).toBe(5);
    expect(st.saved).toBeCloseTo(600 - 5 * 50, 6);
  });
});

describe('calendrier', () => {
  it('place les prélèvements et calcule le solde le plus bas', () => {
    const s = createDefaultState();
    s.chargeDays = { income: 25, rent: 3 };
    const ev = monthEvents(s, 9, 2026);
    expect(ev.find((e) => e.key === 'charge:rent')).toMatchObject({ day: 3, amount: -850, defaultDay: false });
    expect(ev.find((e) => e.key === 'charge:income')).toMatchObject({ day: 25, amount: 2800 });
    const p = projectBalance(ev, 500);
    expect(p.lowest.day).toBeLessThan(25);
    expect(p.lowest.balance).toBeLessThan(0);
    expect(p.end).toBeCloseTo(500 + ev.reduce((a, e) => a + e.amount, 0), 6);
  });

  it('ramène le 31 au dernier jour du mois', () => {
    const s = createDefaultState();
    s.chargeDays = { rent: 31 };
    expect(monthEvents(s, 1, 2027).find((e) => e.key === 'charge:rent')?.day).toBe(28);
  });
});

describe('analyses des dépenses', () => {
  it('repère un prélèvement récurrent absent des abonnements', () => {
    const s = createDefaultState();
    s.actualExpenses[0] = [{ id: 1, date: '', label: 'PRLV NETFLIX', amount: 13.49, category: 'Abonnements' }];
    s.actualExpenses[1] = [{ id: 2, date: '', label: 'PRLV NETFLIX', amount: 13.49, category: 'Abonnements' }, { id: 3, date: '', label: 'CB CARREFOUR', amount: 80, category: 'Nourriture' }];
    s.actualExpenses[2] = [{ id: 4, date: '', label: 'CB CARREFOUR', amount: 140, category: 'Nourriture' }];
    const r = detectRecurring(s);
    expect(r.map((x) => x.key)).toEqual(['netflix']);
    s.ignoredRecurring = ['netflix'];
    expect(detectRecurring(s)).toEqual([]);
  });

  it('compare avec le même mois de l\'an dernier', () => {
    const s = createDefaultState();
    s.actualExpenses[3] = [{ id: 1, date: '', label: 'x', amount: 50, category: 'Loisirs' }];
    const archived = archiveCurrentPeriod(s);
    expect(lastYearSameMonth(archived, 3)?.total).toBe(50);
    expect(lastYearSameMonth(archived, 4)).toBeNull();
  });

  it('filtre et étiquettes', () => {
    const tx = { id: 1, date: '', label: 'Hôtel Nice', amount: 120, category: 'Loisirs', tags: parseTags('Vacances 2026, hotel,  ,hotel') };
    expect(tx.tags).toEqual(['vacances 2026', 'hotel']);
    expect(matchesFilter(tx, { text: 'hotel' })).toBe(true);
    expect(matchesFilter(tx, { tag: 'vacances 2026', min: 100 })).toBe(true);
    expect(matchesFilter(tx, { max: 100 })).toBe(false);
  });
});

describe('budget à deux', () => {
  it('répartit au prorata des revenus et calcule qui doit quoi', () => {
    const s = createDefaultState();
    s.couple = { enabled: true, nameA: 'A', nameB: 'B', incomeB: 1400, split: 'prorata', shareA: 50 };
    expect(shareOfA(s)).toBeCloseTo(2800 / 4200, 6);
    const t = computeMonthlyTotals(s);
    expect(t.income).toBe(4200);
    const cb = coupleBudget(s, t);
    expect(cb.A.expenses + cb.B.expenses).toBeCloseTo(t.totalExpenses, 6);
    s.couple.split = 'equal';
    const st = settlement(s, [
      { id: 1, date: '', label: 'a', amount: 100, category: 'Divers', paidBy: 'A' },
      { id: 2, date: '', label: 'b', amount: 40, category: 'Divers', paidBy: 'B' },
    ]);
    expect(st.balance).toBe(30);
  });
});

describe('scénarios et stratégie de dettes', () => {
  it('compare un scénario sans toucher au budget', () => {
    const s = createDefaultState();
    const r = compareScenario(s, { id: 1, name: 'Augmentation', changes: { salary: 3000 } });
    expect(r.scenario.income - r.base.income).toBe(200);
    expect(s.salary).toBe(2800);
  });

  it('avalanche coûte moins d\'intérêts que le minimum', () => {
    const debts = [debt({ id: 1, name: 'Carte', amount: 3000, rate: 18, monthly: 100 }), debt({ id: 2, name: 'Auto', amount: 6000, rate: 4, monthly: 200 })];
    const min = simulatePayoff(debts, 150, 'minimum');
    const ava = simulatePayoff(debts, 150, 'avalanche');
    const snow = simulatePayoff(debts, 150, 'snowball');
    expect(ava.totalInterest).toBeLessThan(min.totalInterest);
    expect(ava.months).toBeLessThan(min.months);
    expect(ava.order[0]).toBe('Carte');
    expect(snow.order[0]).toBe('Carte');
    expect(ava.totalInterest).toBeLessThanOrEqual(snow.totalInterest + 0.01);
    expect(debts[0].amount).toBe(3000);
  });
});

describe('export Excel', () => {
  it('produit un classeur lisible', () => {
    const bytes = buildXlsx([{ name: 'Dépenses', rows: [['Libellé', 'Montant'], ['Café <&>', 2.5]] }]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain('xl/worksheets/sheet1.xml');
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(xml).toContain('Café &lt;&amp;&gt;');
    expect(xml).toContain('<v>2.5</v>');
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Dépenses"');
  });
});

describe('chiffrement', () => {
  it('chiffre et déchiffre avec le bon mot de passe seulement', async () => {
    const vk = await deriveKey('secret');
    const raw = await encryptText(vk, '{"salary":1}');
    expect(isEncrypted(raw)).toBe(true);
    expect(raw).not.toContain('salary');
    expect((await unlock(raw, 'secret')).text).toBe('{"salary":1}');
    await expect(unlock(raw, 'faux')).rejects.toThrow();
  });
});

describe('migration v4', () => {
  it('nettoie les nouvelles données', () => {
    const s = migrate({ accounts: [{ name: 'CC', balance: '12.5', kind: 'bizarre' }], chargeDays: { rent: 40, income: 25 }, couple: { enabled: true, shareA: 150 } });
    expect(s.accounts[0]).toMatchObject({ balance: 12.5, kind: 'courant' });
    expect(s.chargeDays).toEqual({ income: 25 });
    expect(s.couple.shareA).toBe(100);
    expect(s.schemaVersion).toBe(4);
  });
});

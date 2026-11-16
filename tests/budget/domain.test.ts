import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../../src/modules/budget/domain/defaults';
import { simulateDebt } from '../../src/modules/budget/domain/debt';
import { computeProjection } from '../../src/modules/budget/domain/invest';
import { parseBankCsv } from '../../src/modules/budget/domain/csv';
import { archiveCurrentPeriod, isCycleExpired } from '../../src/modules/budget/domain/archive';
import { migrate } from '../../src/modules/budget/domain/migrations';
import { computeActualsOverview } from '../../src/modules/budget/domain/actuals';
import { computeMonthlyTotals } from '../../src/modules/budget/domain/budget';

describe('simulateDebt', () => {
  it('calcule durée et intérêts', () => {
    const r = simulateDebt(8000, 4.5, 250);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.months).toBe(35);
      expect(Math.round(r.totalInterest)).toBeGreaterThan(500);
    }
  });
  it('signale une mensualité insuffisante', () => {
    expect(simulateDebt(100000, 12, 500).kind).toBe('insufficient');
  });
  it('ne calcule rien sans montant', () => {
    expect(simulateDebt(0, 4, 100).kind).toBe('none');
  });
});

describe('computeProjection', () => {
  it('cumule versements et intérêts', () => {
    const s = { ...createDefaultState(), projYears: 1 };
    const p = computeProjection(s);
    expect(p.labels).toEqual(['Départ', 'An 1']);
    expect(p.outOfPocket[0]).toBe(6500);
    expect(p.totalInvested).toBe(6500 + 550 * 12);
    expect(p.totalFinal).toBeGreaterThan(p.totalInvested);
    expect(p.totalInterests).toBe(p.totalFinal - p.totalInvested);
  });
});

describe('parseBankCsv', () => {
  it('lit date;libellé;montant et ignore les lignes vides', () => {
    const rows = parseBankCsv('2026-10-01;Carrefour;-45,30\n\n2026-10-02;Pressing du coin;1 012,00\r\nligne invalide', [], new Date(), () => 1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ label: 'Carrefour', amount: 45.3, category: 'Nourriture' });
    expect(rows[1]).toMatchObject({ amount: 1012, category: 'Divers' });
  });
  it('accepte le séparateur virgule avec montant à point', () => {
    const rows = parseBankCsv('2026-10-01,PRLV NETFLIX.COM,-13.49', [], new Date(), () => 1);
    expect(rows[0]).toMatchObject({ amount: 13.49, category: 'Abonnements' });
  });
});

describe('archives', () => {
  it('détecte la fin du cycle de 12 mois', () => {
    const s = { ...createDefaultState(), cycleStartDate: '2025-01-15T00:00:00.000Z' };
    expect(isCycleExpired(s, new Date('2025-12-01'))).toBe(false);
    expect(isCycleExpired(s, new Date('2026-01-16'))).toBe(true);
  });
  it('archive, vide les dépenses réelles et ne recopie pas les anciennes archives', () => {
    let s = createDefaultState();
    s.actualExpenses[0].push({ id: 1, date: '2026-01-01', label: 'x', amount: 10, category: 'Divers' });
    s = archiveCurrentPeriod(s, new Date('2026-10-19'));
    s = archiveCurrentPeriod(s, new Date('2026-10-20'));
    expect(s.archives).toHaveLength(2);
    expect(s.actualExpenses[0]).toEqual([]);
    expect('archives' in s.archives[0].stateSnapshot!).toBe(false);
    expect(s.archives[1].stateSnapshot!.actualExpenses[0]).toHaveLength(1);
  });
});

describe('migrate', () => {
  it('accepte un export de la version HTML', () => {
    const legacy = { salary: 3100, actualExpenses: { '3': [{ id: 1, date: '', label: 'a', amount: 5, category: 'Divers' }] } };
    const s = migrate(legacy);
    expect(s.schemaVersion).toBe(4);
    expect(s.salary).toBe(3100);
    expect(s.actualExpenses[3]).toHaveLength(1);
    expect(s.actualExpenses[11]).toEqual([]);
    expect(s.rent).toBe(850);
  });
  it('refuse un contenu qui n\'est pas un objet', () => {
    expect(() => migrate('texte')).toThrow();
  });
});

describe('computeActualsOverview', () => {
  it('compare prévu et réel par catégorie', () => {
    const t = computeMonthlyTotals(createDefaultState());
    const o = computeActualsOverview(t, [
      { id: 1, date: '', label: 'loyer', amount: 1095, category: 'Logement' },
      { id: 2, date: '', label: 'essence', amount: 50, category: 'Voiture' },
    ]);
    expect(o.real).toBe(1145);
    expect(o.categories[0]).toMatchObject({ name: 'Logement', pct: 100, level: 'over' });
    expect(o.diff).toBeCloseTo(t.totalExpenses - 1145, 6);
  });
});

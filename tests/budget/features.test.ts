import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../../src/modules/budget/domain/defaults';
import { applyMonthToAllYear, overrideCount, resetMonth, setMonthValue, totalsForMonth, yearOfCycleMonth } from '../../src/modules/budget/domain/months';
import { categorize, learnCategory, merchantKey } from '../../src/modules/budget/domain/categorize';
import { addContribution, projectEta } from '../../src/modules/budget/domain/projects';
import { periodReport, computeAnnualTrend } from '../../src/modules/budget/domain/actuals';
import { migrate } from '../../src/modules/budget/domain/migrations';

describe('budget mois par mois', () => {
  it("une prime en décembre ne change que décembre", () => {
    const s = createDefaultState();
    setMonthValue(s, 11, 'bonus', 1500);
    expect(totalsForMonth(s, 11).income).toBe(4300);
    expect(totalsForMonth(s, 10).income).toBe(2800);
    expect(overrideCount(s, 11)).toBe(1);
    const trend = computeAnnualTrend(s, 9);
    expect(trend.income[2]).toBe(4300); // octobre, novembre, décembre
  });
  it('revenir à la valeur de base efface l\'exception', () => {
    const s = createDefaultState();
    setMonthValue(s, 3, 'rent', 900);
    setMonthValue(s, 3, 'rent', 850);
    expect(s.monthOverrides[3]).toBeUndefined();
  });
  it("« Valable toute l'année » applique le mois à tous les mois", () => {
    const s = createDefaultState();
    setMonthValue(s, 2, 'rent', 900);
    setMonthValue(s, 5, 'rent', 1000);
    setMonthValue(s, 5, 'groceries', 300);
    applyMonthToAllYear(s, 2);
    expect(s.rent).toBe(900);
    expect(s.monthOverrides[2]).toBeUndefined();
    expect(s.monthOverrides[5]).toEqual({ groceries: 300 });
    resetMonth(s, 5);
    expect(s.monthOverrides).toEqual({});
  });
  it('donne l\'année de chaque mois du cycle', () => {
    const now = new Date('2026-10-19');
    expect(yearOfCycleMonth(11, now)).toBe(2026);
    expect(yearOfCycleMonth(2, now)).toBe(2027);
  });
});

describe('classement automatique', () => {
  it('reconnaît les commerçants courants', () => {
    expect(categorize('CB CARREFOUR MARKET 12/10')).toBe('Nourriture');
    expect(categorize('PRLV TOTALENERGIES CLIENTS')).toBe('Logement');
    expect(categorize('CB TOTAL ACCESS 3421')).toBe('Voiture');
    expect(categorize('UBER EATS PARIS')).toBe('Loisirs');
    expect(categorize('PRESSING DU CENTRE')).toBe('Divers');
  });
  it('apprend une correction et reclasse les dépenses semblables', () => {
    const s = createDefaultState();
    s.actualExpenses[1].push({ id: 1, date: '', label: 'CB BOULANGER ELECTROMENAGER 01/02', amount: 300, category: 'Divers' });
    s.actualExpenses[4].push({ id: 2, date: '', label: 'CB BOULANGER ELECTROMENAGER 03/05', amount: 50, category: 'Divers' });
    expect(merchantKey('CB BOULANGER ELECTROMENAGER 01/02')).toBe('boulanger electromenager');
    const n = learnCategory(s, 'CB BOULANGER ELECTROMENAGER 01/02', 'Logement');
    expect(n).toBe(2);
    expect(categorize('CB BOULANGER ELECTROMENAGER 9/9', s.categoryRules)).toBe('Logement');
  });
});

describe('projets', () => {
  const now = new Date('2026-10-19');
  it('estime la date avec le versement mensuel', () => {
    const eta = projectEta({ id: 1, name: 'x', target: 1000, current: 400, monthly: 100 }, now);
    expect(eta).toMatchObject({ kind: 'eta', months: 6 });
    if (eta.kind === 'eta') expect(eta.date.getMonth()).toBe(3); // avril 2027
  });
  it("utilise l'historique des versements à défaut", () => {
    const p = { id: 1, name: 'x', target: 1000, current: 0, contributions: [] as { date: string; amount: number }[] };
    addContribution(p, 200, new Date('2026-08-19'));
    addContribution(p, 200, new Date('2026-09-19'));
    const eta = projectEta(p, now);
    expect(p.current).toBe(400);
    expect(eta.kind).toBe('eta');
  });
  it('signale un objectif atteint ou inestimable', () => {
    expect(projectEta({ id: 1, name: 'x', target: 10, current: 10 }, now).kind).toBe('done');
    expect(projectEta({ id: 1, name: 'x', target: 10, current: 0 }, now).kind).toBe('unknown');
  });
});

describe('bilans et migration', () => {
  it('résume une période', () => {
    const s = createDefaultState();
    s.actualExpenses[0].push({ id: 1, date: '', label: 'a', amount: 100, category: 'Divers' });
    const r = periodReport(s, 0);
    expect(r.rows).toHaveLength(12);
    expect(r.real).toBe(100);
    expect(r.income).toBe(2800 * 12);
  });
  it('migre une sauvegarde v1', () => {
    const s = migrate({ schemaVersion: 1, monthlyAdjustments: [0, 0], projects: [{ id: 1, name: 'a', target: 10, current: 1 }] });
    expect(s.schemaVersion).toBe(4);
    expect('monthlyAdjustments' in s).toBe(false);
    expect(s.monthOverrides).toEqual({});
    expect(s.projects[0].contributions).toEqual([]);
  });
});

describe('archives anciennes', () => {
  it('accepte une archive sans stateSnapshot (cause du plantage au démarrage)', () => {
    const s = migrate({ archives: [{ id: 'a1', title: 'Bilan 2025', createdAt: '2025-12-31T00:00:00Z', totalSavings: 1200 }, null, 'x'] });
    expect(s.archives).toHaveLength(1);
    expect(s.archives[0]).toMatchObject({ id: 'a1', title: 'Bilan 2025', totalSavings: 1200, stateSnapshot: null });
  });
});

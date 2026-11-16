import { createDefaultState, defaultCouple, emptyActualExpenses, SCHEMA_VERSION } from './defaults';
import type { Account, AccountKind, AnnualCharge, Archive, BudgetState, Debt, Scenario } from './types';

/**
 * Transforme n'importe quelle donnée chargée (fichier, export JSON de la v4.4
 * HTML, version antérieure de l'app) en BudgetState valide et à jour.
 * Ajouter ici une étape par nouvelle version de schéma.
 */
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Les archives venant d'anciennes versions (ou de la v4.4) peuvent ne pas avoir
 * de copie du budget (`stateSnapshot`) : on garde le bilan, sans son détail.
 */
function normalizeArchive(a: Record<string, unknown>, i: number): Archive {
  const createdAt = typeof a.createdAt === 'string' && !Number.isNaN(Date.parse(a.createdAt)) ? a.createdAt : new Date().toISOString();
  return {
    id: typeof a.id === 'string' || typeof a.id === 'number' ? String(a.id) : `arch_import_${i}`,
    title: typeof a.title === 'string' ? a.title : `Bilan ${new Date(createdAt).getFullYear()}`,
    createdAt,
    totalSavings: Number(a.totalSavings) || 0,
    stateSnapshot: (isObject(a.stateSnapshot) ? a.stateSnapshot : null) as Archive['stateSnapshot'],
  };
}

const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
const day = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 31 ? Number(v) : undefined);
const objects = (v: unknown) => (Array.isArray(v) ? v.filter(isObject) : []);
const ACCOUNT_KINDS: AccountKind[] = ['courant', 'epargne', 'joint', 'autre'];

/** v3 → v4 : comptes, charges annuelles, scénarios, budget à deux, calendrier. */
function normalizeV4(state: BudgetState, data: Record<string, unknown>): void {
  state.accounts = objects(data.accounts).map((a, i): Account => ({
    id: num(a.id, Date.now() + i),
    name: typeof a.name === 'string' ? a.name : 'Compte',
    kind: ACCOUNT_KINDS.includes(a.kind as AccountKind) ? (a.kind as AccountKind) : 'courant',
    balance: num(a.balance),
    updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : new Date().toISOString(),
  }));
  state.annualCharges = objects(data.annualCharges).map((c, i): AnnualCharge => ({
    id: num(c.id, Date.now() + i),
    name: typeof c.name === 'string' ? c.name : 'Charge annuelle',
    amount: num(c.amount),
    month: Math.min(11, Math.max(0, Math.trunc(num(c.month)))),
    day: day(c.day),
  }));
  state.scenarios = objects(data.scenarios).map((sc, i): Scenario => ({
    id: num(sc.id, Date.now() + i),
    name: typeof sc.name === 'string' ? sc.name : 'Scénario',
    changes: isObject(sc.changes)
      ? Object.fromEntries(Object.entries(sc.changes).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]))
      : {},
  }));
  const couple = isObject(data.couple) ? data.couple : {};
  const dc = defaultCouple();
  state.couple = {
    enabled: couple.enabled === true,
    nameA: typeof couple.nameA === 'string' && couple.nameA ? couple.nameA : dc.nameA,
    nameB: typeof couple.nameB === 'string' && couple.nameB ? couple.nameB : dc.nameB,
    incomeB: num(couple.incomeB),
    split: couple.split === 'equal' || couple.split === 'custom' ? couple.split : 'prorata',
    shareA: Math.min(100, Math.max(0, num(couple.shareA, 50))),
  };
  state.investValues = isObject(data.investValues)
    ? Object.fromEntries(Object.entries(data.investValues).filter(([, v]) => isObject(v)).map(([k, v]) => {
      const x = v as Record<string, unknown>;
      return [k, { value: num(x.value), date: typeof x.date === 'string' ? x.date : new Date().toISOString() }];
    }))
    : {};
  state.netWorthHistory = objects(data.netWorthHistory)
    .filter((p) => typeof p.month === 'string' && /^\d{4}-\d{2}$/.test(p.month as string))
    .map((p) => ({ month: p.month as string, value: num(p.value) }));
  state.chargeDays = isObject(data.chargeDays)
    ? Object.fromEntries(Object.entries(data.chargeDays).map(([k, v]) => [k, day(v)]).filter(([, v]) => v !== undefined))
    : {};
  state.ignoredRecurring = Array.isArray(data.ignoredRecurring) ? data.ignoredRecurring.filter((x): x is string => typeof x === 'string') : [];
  state.debtExtra = num(data.debtExtra);
  state.customSubscriptions = state.customSubscriptions.map((c) => ({ ...c, day: day(c.day) }));
  state.debts = state.debts.map((d) => ({ ...d, day: day(d.day) }));
}

export function migrate(raw: unknown): BudgetState {
  if (!raw || typeof raw !== 'object') throw new Error('Données de sauvegarde invalides');
  const data = raw as Partial<BudgetState> & Record<string, unknown>;

  // v0 = exports de la version HTML (pas de schemaVersion) : même forme que v1.
  // v1 → v2 : monthlyAdjustments (jamais utilisé) remplacé par monthOverrides, ajout de categoryRules.
  const { monthlyAdjustments: _unused, ...rest } = data as Record<string, unknown>;
  const state: BudgetState = { ...createDefaultState(), ...(rest as Partial<BudgetState>), schemaVersion: SCHEMA_VERSION };

  const expenses = emptyActualExpenses();
  if (data.actualExpenses && typeof data.actualExpenses === 'object') {
    for (let m = 0; m < 12; m++) {
      const list = (data.actualExpenses as Record<string, unknown>)[m];
      if (Array.isArray(list)) expenses[m] = list;
    }
  }
  state.actualExpenses = expenses;

  if (!Array.isArray(state.projects)) state.projects = [];
  // v2 → v3 : liste de dettes.
  state.debts = Array.isArray(state.debts)
    ? (state.debts as unknown[]).filter(isObject).map((d, i) => {
      const x = d as Partial<Debt>;
      const amount = Number(x.amount) || 0;
      return {
        id: Number(x.id) || Date.now() + i,
        name: typeof x.name === 'string' ? x.name : 'Dette',
        amount,
        initial: Number(x.initial) || amount,
        rate: Number(x.rate) || 0,
        monthly: Number(x.monthly) || 0,
        inBudget: x.inBudget !== false,
        payments: Array.isArray(x.payments) ? x.payments : [],
      };
    })
    : [];
  state.archives = Array.isArray(state.archives) ? (state.archives as unknown[]).filter(isObject).map(normalizeArchive) : [];
  if (!Array.isArray(state.customSubscriptions)) state.customSubscriptions = [];
  if (!Array.isArray(state.categoryRules)) state.categoryRules = [];
  if (!state.monthOverrides || typeof state.monthOverrides !== 'object') state.monthOverrides = {};
  state.projects = state.projects.map((p) => ({ ...p, contributions: Array.isArray(p.contributions) ? p.contributions : [] }));
  normalizeV4(state, data);
  if (state.vehicleMode !== 'ICE') state.vehicleMode = 'EV';

  return state;
}

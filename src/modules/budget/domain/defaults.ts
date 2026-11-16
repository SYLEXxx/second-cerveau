import type { ActualExpensesByMonth, BudgetState, CoupleSettings } from './types';

export const SCHEMA_VERSION = 4;

export const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
] as const;

export const INVEST_CATEGORIES = [
  { id: 'savings', color: '#10b981', label: 'Épargne Sécurisée' },
  { id: 'etf', color: '#a855f7', label: 'Bourse / ETF' },
  { id: 'crypto', color: '#f59e0b', label: 'Crypto' },
  { id: 'realestate', color: '#3b82f6', label: 'Immo / SCPI' },
  { id: 'otherInvest', color: '#64748b', label: 'Autres' },
] as const;

export type InvestCategoryId = (typeof INVEST_CATEGORIES)[number]['id'];

export function emptyActualExpenses(): ActualExpensesByMonth {
  const out: ActualExpensesByMonth = {};
  for (let m = 0; m < 12; m++) out[m] = [];
  return out;
}

export const defaultCouple = (): CoupleSettings => ({
  enabled: false, nameA: 'Moi', nameB: 'Partenaire', incomeB: 0, split: 'prorata', shareA: 50,
});

/** Données d'exemple affichées au premier lancement (identiques à la v4.4 HTML). */
export function createDefaultState(now: Date = new Date()): BudgetState {
  return {
    schemaVersion: SCHEMA_VERSION,

    vehicleMode: 'EV',
    startFromCurrentMonth: true,
    cycleStartDate: now.toISOString(),

    kmTotal: 1200,
    kmWork: 600,
    isWorkReimbursed: true,
    reimbRate: 100,

    evLease: 300,
    evInsurance: 60,
    evMaint: 20,
    evCons: 16.0,
    evHomeRatio: 80,
    evPriceHome: 0.25,
    evPricePublic: 0.55,

    iceLease: 250,
    iceInsurance: 55,
    iceMaint: 40,
    iceCons: 6.5,
    iceFuelPrice: 1.85,

    salary: 2800,
    bonus: 0,
    extra: 0,
    allowance: 0,

    rent: 850,
    charges: 80,
    elec: 70,
    taxIns: 45,
    webMobile: 50,

    groceries: 400,
    restaurant: 150,
    leisure: 100,
    family: 50,

    subTransit: 75,
    subTransitReimbRate: 50,
    customSubscriptions: [
      { id: 1, name: 'Sport & Loisirs', amount: 30 },
      { id: 2, name: 'Streaming & Cloud', amount: 20 },
    ],

    savings: 200,
    etf: 300,
    crypto: 50,
    realestate: 0,
    otherInvest: 0,

    rateSavings: 3.0,
    rateEtf: 8.0,
    rateCrypto: 10.0,
    rateRealestate: 5.0,
    rateOtherInvest: 4.0,

    initSavings: 5000,
    initEtf: 1000,
    initCrypto: 500,
    initRealestate: 0,
    initOtherInvest: 0,

    projYears: 20,

    projects: [
      { id: 1, name: "Fonds d'Urgence", target: 5000, current: 2800 },
      { id: 2, name: 'Voyage', target: 2500, current: 850 },
    ],

    debts: [],
    debtAmount: 8000,
    debtRate: 4.5,
    debtMonthly: 250,
    debtExtra: 0,

    accounts: [],
    investValues: {},
    netWorthHistory: [],
    annualCharges: [],
    chargeDays: {},
    scenarios: [],
    couple: defaultCouple(),
    ignoredRecurring: [],

    monthOverrides: {},
    categoryRules: [],
    actualExpenses: emptyActualExpenses(),
    archives: [],
  };
}

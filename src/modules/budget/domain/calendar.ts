import { computeSubscriptions, computeVehicle } from './budget';
import { stateForMonth } from './months';
import type { BudgetState } from './types';

// Calendrier des prélèvements : quels jours partent (et arrivent) les montants fixes.

export interface CalendarEvent {
  /** Clé stable : « charge:rent », « sub:12 », « debt:3 », « annual:5 ». */
  key: string;
  label: string;
  day: number;
  /** Positif = entrée d'argent, négatif = sortie. */
  amount: number;
  kind: 'income' | 'charge' | 'sub' | 'debt' | 'annual' | 'invest';
  /** Le jour vient d'un réglage par défaut, pas de l'utilisateur. */
  defaultDay: boolean;
}

/** Postes du budget de base qui donnent lieu à un virement ou prélèvement, avec leur jour par défaut. */
export const CHARGE_ITEMS = [
  { key: 'income', label: 'Salaire et revenus', day: 28 },
  { key: 'rent', label: 'Loyer / crédit immobilier', day: 5 },
  { key: 'charges', label: 'Charges de copropriété', day: 5 },
  { key: 'elec', label: 'Énergie', day: 10 },
  { key: 'taxIns', label: 'Taxes et assurance habitation', day: 15 },
  { key: 'webMobile', label: 'Box et mobile', day: 12 },
  { key: 'vehicle', label: 'Voiture (location, assurance)', day: 10 },
  { key: 'transit', label: 'Pass transport', day: 1 },
  { key: 'invest', label: 'Virements épargne et placements', day: 2 },
] as const;

export const DEFAULT_SUB_DAY = 15;
export const DEFAULT_DEBT_DAY = 5;

const clampDay = (day: number, month: number, year: number) => Math.min(day, new Date(year, month + 1, 0).getDate());

/** Tous les mouvements fixes d'un mois, triés par jour. */
export function monthEvents(s: BudgetState, month: number, year: number): CalendarEvent[] {
  const m = stateForMonth(s, month);
  const v = computeVehicle(m);
  const subs = computeSubscriptions(m);
  const ev: CalendarEvent[] = [];
  const push = (e: Omit<CalendarEvent, 'day' | 'defaultDay'>, day: number | undefined, fallback: number) => {
    if (!e.amount) return;
    ev.push({ ...e, day: clampDay(day ?? fallback, month, year), defaultDay: day === undefined });
  };
  const charge = (key: string) => CHARGE_ITEMS.find((c) => c.key === key)!;
  const d = (key: string) => s.chargeDays[key];

  const income = m.salary + m.bonus + m.extra + m.allowance;
  push({ key: 'charge:income', label: charge('income').label, amount: income, kind: 'income' }, d('income'), charge('income').day);
  if (s.couple.enabled && s.couple.incomeB) {
    push({ key: 'charge:incomeB', label: `Revenus de ${s.couple.nameB}`, amount: s.couple.incomeB, kind: 'income' }, d('incomeB') ?? d('income'), charge('income').day);
  }
  for (const key of ['rent', 'charges', 'elec', 'taxIns', 'webMobile'] as const) {
    push({ key: `charge:${key}`, label: charge(key).label, amount: -m[key], kind: 'charge' }, d(key), charge(key).day);
  }
  push({ key: 'charge:vehicle', label: charge('vehicle').label, amount: -v.fixed, kind: 'charge' }, d('vehicle'), charge('vehicle').day);
  push({ key: 'charge:transit', label: charge('transit').label, amount: -subs.transitNet, kind: 'sub' }, d('transit'), charge('transit').day);
  const invest = m.savings + m.etf + m.crypto + m.realestate + m.otherInvest;
  push({ key: 'charge:invest', label: charge('invest').label, amount: -invest, kind: 'invest' }, d('invest'), charge('invest').day);

  for (const sub of s.customSubscriptions) {
    push({ key: `sub:${sub.id}`, label: sub.name, amount: -sub.amount, kind: 'sub' }, sub.day, DEFAULT_SUB_DAY);
  }
  for (const debt of s.debts) {
    if (debt.amount <= 0) continue;
    push({ key: `debt:${debt.id}`, label: debt.name, amount: -debt.monthly, kind: 'debt' }, debt.day, DEFAULT_DEBT_DAY);
  }
  for (const c of s.annualCharges) {
    if (c.month !== month) continue;
    push({ key: `annual:${c.id}`, label: `${c.name} (annuel)`, amount: -c.amount, kind: 'annual' }, c.day, 1);
  }
  return ev.sort((a, b) => a.day - b.day || b.amount - a.amount);
}

/**
 * Solde prévu jour par jour à partir d'un solde de départ. Pour le mois en
 * cours, seuls les mouvements à venir (à partir de `fromDay`) sont appliqués.
 */
export function projectBalance(events: CalendarEvent[], start: number, fromDay = 1) {
  let balance = start;
  let lowest = { day: fromDay, balance: start };
  const rows = events.filter((e) => e.day >= fromDay).map((e) => {
    balance += e.amount;
    if (balance < lowest.balance) lowest = { day: e.day, balance };
    return { ...e, balance };
  });
  return { rows, end: balance, lowest };
}

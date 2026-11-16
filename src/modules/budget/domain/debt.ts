import type { Debt, DebtPayment } from './types';

export type DebtResult =
  | { kind: 'none' }
  | { kind: 'insufficient' }
  | { kind: 'ok'; months: number; totalInterest: number };

const MAX_MONTHS = 600;

/** Durée et coût d'un remboursement à mensualité constante (taux annuel en %). */
export function simulateDebt(amount: number, annualRatePct: number, monthly: number): DebtResult {
  if (!(amount > 0) || !(monthly > 0)) return { kind: 'none' };

  const rate = (annualRatePct || 0) / 100 / 12;
  if (rate > 0 && monthly <= amount * rate) return { kind: 'insufficient' };

  let balance = amount;
  let totalInterest = 0;
  let months = 0;
  while (balance > 0 && months < MAX_MONTHS) {
    const interest = balance * rate;
    totalInterest += interest;
    balance = balance + interest - monthly;
    months++;
  }
  return { kind: 'ok', months, totalInterest };
}

/**
 * Enregistre un paiement : les intérêts du mois sont couverts d'abord, le
 * reste réduit le capital. Un montant négatif (nouvel emprunt) augmente le capital.
 */
export function addDebtPayment(d: Debt, amount: number, now: Date = new Date()): DebtPayment {
  const interest = amount > 0 ? d.amount * ((d.rate || 0) / 100 / 12) : 0;
  const principal = Math.min(d.amount, amount - Math.min(interest, amount));
  d.amount = Math.max(0, Math.round((d.amount - principal) * 100) / 100);
  const payment = { date: now.toISOString(), amount, principal };
  d.payments = [...(d.payments ?? []), payment];
  return payment;
}

/** Date de fin estimée d'une dette à partir de sa mensualité. */
export function debtEnd(d: Debt, now: Date = new Date()) {
  const r = simulateDebt(d.amount, d.rate, d.monthly);
  if (r.kind !== 'ok') return r;
  return { ...r, date: new Date(now.getFullYear(), now.getMonth() + r.months, 1) };
}

export type PayoffStrategy = 'minimum' | 'avalanche' | 'snowball';

export interface PayoffResult {
  strategy: PayoffStrategy;
  months: number;
  totalInterest: number;
  /** Ordre dans lequel les dettes sont soldées. */
  order: string[];
  /** Une mensualité ne couvre pas ses intérêts : la dette ne finit jamais. */
  endless: boolean;
}

/**
 * Remboursement de toutes les dettes ensemble. « minimum » paie chaque
 * mensualité ; « avalanche » met le surplus (et les mensualités libérées) sur
 * le taux le plus élevé, « boule de neige » sur le plus petit capital.
 */
export function simulatePayoff(debts: Debt[], extra: number, strategy: PayoffStrategy): PayoffResult {
  const list = debts.filter((d) => d.amount > 0).map((d) => ({ name: d.name, balance: d.amount, rate: (d.rate || 0) / 100 / 12, monthly: d.monthly || 0 }));
  const budget = list.reduce((acc, d) => acc + d.monthly, 0) + (strategy === 'minimum' ? 0 : Math.max(0, extra));
  const order: string[] = [];
  let months = 0;
  let totalInterest = 0;
  while (list.some((d) => d.balance > 0.005) && months < MAX_MONTHS) {
    months++;
    for (const d of list) {
      if (d.balance <= 0) continue;
      const interest = d.balance * d.rate;
      totalInterest += interest;
      d.balance += interest;
    }
    let available = budget;
    // Mensualités normales d'abord.
    for (const d of list) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.monthly, d.balance, available);
      d.balance -= pay;
      available -= pay;
    }
    // Le reste va à la dette ciblée par la stratégie.
    if (strategy !== 'minimum') {
      const targets = list.filter((d) => d.balance > 0).sort((a, b) => (strategy === 'avalanche' ? b.rate - a.rate || a.balance - b.balance : a.balance - b.balance));
      for (const d of targets) {
        if (available <= 0) break;
        const pay = Math.min(d.balance, available);
        d.balance -= pay;
        available -= pay;
      }
    }
    for (const d of list) {
      if (d.balance <= 0.005 && !order.includes(d.name)) {
        d.balance = 0;
        order.push(d.name);
      }
    }
  }
  return { strategy, months, totalInterest, order, endless: months >= MAX_MONTHS };
}

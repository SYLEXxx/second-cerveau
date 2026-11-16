import type { AnnualCharge } from './types';

/** Prochaine échéance d'une charge annuelle (aujourd'hui compris). */
export function nextDue(c: AnnualCharge, now: Date = new Date()): Date {
  const day = c.day ?? 1;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let due = new Date(now.getFullYear(), c.month, day);
  if (due < today) due = new Date(now.getFullYear() + 1, c.month, day);
  return due;
}

/**
 * Où en est la provision : ce qui devrait déjà être mis de côté en épargnant
 * 1/12 par mois depuis l'échéance précédente, et ce qu'il reste à mettre.
 */
export function provisionStatus(c: AnnualCharge, now: Date = new Date()) {
  const due = nextDue(c, now);
  const monthsLeft = Math.max(0, (due.getFullYear() - now.getFullYear()) * 12 + due.getMonth() - now.getMonth());
  const monthly = c.amount / 12;
  const saved = Math.max(0, c.amount - monthsLeft * monthly);
  return { due, monthsLeft, monthly, saved, pct: c.amount > 0 ? Math.round((saved / c.amount) * 100) : 100 };
}

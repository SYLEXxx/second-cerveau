import type { ActualExpense, BudgetState, MonthlyTotals } from './types';

// Budget à deux : répartition des dépenses communes et équilibre des paiements.

/** Part de la 1re personne (entre 0 et 1). */
export function shareOfA(s: BudgetState): number {
  const c = s.couple;
  if (c.split === 'equal') return 0.5;
  if (c.split === 'custom') return c.shareA / 100;
  const incomeA = s.salary + s.bonus + s.extra + s.allowance;
  const total = incomeA + c.incomeB;
  return total > 0 ? incomeA / total : 0.5;
}

/** Ce que chacun verse pour les dépenses prévues du mois, et ce qu'il lui reste. */
export function coupleBudget(s: BudgetState, t: MonthlyTotals) {
  const a = shareOfA(s);
  const incomeA = t.income - s.couple.incomeB;
  const expensesA = t.totalExpenses * a;
  const expensesB = t.totalExpenses - expensesA;
  return {
    shareA: a,
    A: { income: incomeA, expenses: expensesA, left: incomeA - expensesA },
    B: { income: s.couple.incomeB, expenses: expensesB, left: s.couple.incomeB - expensesB },
  };
}

/**
 * Qui doit combien à qui sur des dépenses réelles : chacun aurait dû payer sa
 * part ; la différence avec ce qu'il a réellement payé est à rembourser.
 * Les dépenses sans payeur sont comptées comme payées par la 1re personne.
 */
export function settlement(s: BudgetState, list: ActualExpense[]) {
  const a = shareOfA(s);
  let paidA = 0;
  let paidB = 0;
  for (const tx of list) {
    if (tx.paidBy === 'B') paidB += tx.amount;
    else paidA += tx.amount;
  }
  const total = paidA + paidB;
  // Positif : B doit cette somme à A. Négatif : A doit à B.
  const balance = Math.round((paidA - total * a) * 100) / 100;
  return { paidA, paidB, total, dueA: total * a, dueB: total * (1 - a), balance };
}

import { emptyActualExpenses } from './defaults';
import type { Archive, BudgetState } from './types';

const CYCLE_MONTHS = 12;

/** Vrai quand le cycle de 12 mois démarré à `cycleStartDate` est écoulé. */
export function isCycleExpired(s: BudgetState, now: Date = new Date()): boolean {
  const start = new Date(s.cycleStartDate);
  if (Number.isNaN(start.getTime())) return false;
  const end = new Date(start);
  end.setMonth(end.getMonth() + CYCLE_MONTHS);
  return now >= end;
}

/**
 * Clôture la période : ajoute un bilan en tête des archives, vide les dépenses
 * réelles et redémarre le cycle. Le budget de base est conservé.
 */
export function archiveCurrentPeriod(s: BudgetState, now: Date = new Date()): BudgetState {
  const { archives, ...snapshot } = s;
  const archive: Archive = {
    id: 'arch_' + now.getTime(),
    title: `Bilan clôturé ${now.getFullYear()}`,
    createdAt: now.toISOString(),
    totalSavings: (s.savings + s.etf + s.crypto + s.realestate + s.otherInvest) * 12,
    // Le bilan ne recopie pas les archives précédentes (évite un fichier qui grossit à chaque clôture).
    stateSnapshot: structuredClone(snapshot),
  };
  return {
    ...s,
    archives: [archive, ...archives],
    actualExpenses: emptyActualExpenses(),
    cycleStartDate: now.toISOString(),
  };
}

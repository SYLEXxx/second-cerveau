import type { MonthlyTotals, BudgetState } from '../domain/types';
import type { ExpenseFilter } from '../domain/insights';
import type { Platform } from '../platform/platform';
import type { Store } from '../store';

/** État d'interface non sauvegardé (sélections en cours). */
export interface UiState {
  selectedActualMonth: number;
  /** Mois édité dans l'onglet Budget ; null = budget de base (tous les mois). */
  plannerMonth: number | null;
  /** Mois affiché dans le calendrier des prélèvements. */
  calendarMonth: number;
  /** Scénario ouvert dans l'onglet Scénarios. */
  scenarioId: number | null;
  /** Recherche dans les dépenses réelles. */
  filter: ExpenseFilter;
  /** La recherche porte sur les 12 mois au lieu du mois affiché. */
  filterAllMonths: boolean;
}

export interface AppContext {
  store: Store;
  platform: Platform;
  ui: UiState;
}

/** Contrat de chaque onglet : brancher ses événements une fois, se redessiner à chaque changement. */
export interface View {
  mount(ctx: AppContext): void;
  render(state: BudgetState, totals: MonthlyTotals, ctx: AppContext): void;
}

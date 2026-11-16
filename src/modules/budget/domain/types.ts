// Modèle de données de l'application. C'est le format du fichier de sauvegarde
// (budget.json) et des exports JSON : toute évolution passe par migrations.ts.

export type VehicleMode = 'EV' | 'ICE';

export type ExpenseCategory =
  | 'Logement'
  | 'Voiture'
  | 'Nourriture'
  | 'Abonnements'
  | 'Loisirs'
  | 'Crédits'
  | 'Divers';

export interface CustomSubscription {
  id: number;
  name: string;
  amount: number;
  /** Jour du prélèvement dans le mois (1-31), pour le calendrier. */
  day?: number;
}

export type AccountKind = 'courant' | 'epargne' | 'joint' | 'autre';

/** Compte bancaire dont l'utilisateur tient le solde à jour. */
export interface Account {
  id: number;
  name: string;
  kind: AccountKind;
  balance: number;
  /** Date de la dernière mise à jour du solde (ISO). */
  updatedAt: string;
}

/** Dépense qui tombe une fois par an, mise de côté chaque mois (provision). */
export interface AnnualCharge {
  id: number;
  name: string;
  amount: number;
  /** Mois d'échéance, 0 = janvier. */
  month: number;
  day?: number;
}

/** Variante du budget de base, pour comparer sans rien modifier. */
export interface Scenario {
  id: number;
  name: string;
  changes: Partial<Record<string, number>>;
}

export type CoupleSplit = 'prorata' | 'equal' | 'custom';

export interface CoupleSettings {
  enabled: boolean;
  nameA: string;
  nameB: string;
  /** Revenus mensuels de la 2e personne (ceux du budget sont ceux de la 1re). */
  incomeB: number;
  split: CoupleSplit;
  /** Part de la 1re personne en %, pour split = 'custom'. */
  shareA: number;
}

export type Payer = 'A' | 'B';

/** Fichier rangé à part (photo de ticket, facture) ; seule la référence est dans budget.json. */
export interface AttachmentRef {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface InvestValue {
  value: number;
  date: string;
}

export interface NetWorthPoint {
  /** Mois au format AAAA-MM. */
  month: string;
  value: number;
}

export interface ProjectContribution {
  date: string;
  amount: number;
}

export interface SavingsProject {
  id: number;
  name: string;
  target: number;
  current: number;
  /** Versement mensuel prévu, sert à estimer la date d'atteinte de l'objectif. */
  monthly?: number;
  contributions?: ProjectContribution[];
}

export interface DebtPayment {
  date: string;
  amount: number;
  /** Part du paiement qui a réduit le capital (le reste couvre les intérêts du mois). */
  principal: number;
}

/** Dette en cours (prêt, crédit conso, dette familiale...). */
export interface Debt {
  id: number;
  name: string;
  /** Capital restant dû. */
  amount: number;
  /** Capital au moment de la création, pour la barre de progression. */
  initial: number;
  /** Taux annuel en %. */
  rate: number;
  monthly: number;
  /** La mensualité compte-t-elle dans les dépenses prévues du budget ? */
  inBudget: boolean;
  payments: DebtPayment[];
  day?: number;
}

/** Règle de classement automatique : un libellé contenant `pattern` va dans `category`. */
export interface CategoryRule {
  pattern: string;
  category: ExpenseCategory;
}

export interface ActualExpense {
  id: number;
  date: string;
  label: string;
  amount: number;
  category: ExpenseCategory | string;
  subcategory?: string;
  tags?: string[];
  attachments?: AttachmentRef[];
  /** Budget à deux : qui a payé. */
  paidBy?: Payer;
}

/** Dépenses réelles indexées par mois (0 = janvier ... 11 = décembre). */
export type ActualExpensesByMonth = Record<number, ActualExpense[]>;

export interface Archive {
  id: string;
  title: string;
  createdAt: string;
  totalSavings: number;
  /** Budget au moment de la clôture ; null pour certaines archives importées d'anciennes versions. */
  stateSnapshot: ArchiveSnapshot | null;
}

export type ArchiveSnapshot = Omit<BudgetState, 'archives'>;

export interface BudgetState {
  schemaVersion: number;

  vehicleMode: VehicleMode;
  startFromCurrentMonth: boolean;
  cycleStartDate: string;

  kmTotal: number;
  kmWork: number;
  isWorkReimbursed: boolean;
  reimbRate: number;

  evLease: number;
  evInsurance: number;
  evMaint: number;
  evCons: number;
  evHomeRatio: number;
  evPriceHome: number;
  evPricePublic: number;

  iceLease: number;
  iceInsurance: number;
  iceMaint: number;
  iceCons: number;
  iceFuelPrice: number;

  salary: number;
  bonus: number;
  extra: number;
  allowance: number;

  rent: number;
  charges: number;
  elec: number;
  taxIns: number;
  webMobile: number;

  groceries: number;
  restaurant: number;
  leisure: number;
  family: number;

  subTransit: number;
  subTransitReimbRate: number;
  customSubscriptions: CustomSubscription[];

  savings: number;
  etf: number;
  crypto: number;
  realestate: number;
  otherInvest: number;

  rateSavings: number;
  rateEtf: number;
  rateCrypto: number;
  rateRealestate: number;
  rateOtherInvest: number;

  initSavings: number;
  initEtf: number;
  initCrypto: number;
  initRealestate: number;
  initOtherInvest: number;

  projYears: number;

  projects: SavingsProject[];

  /** Dettes suivies (onglet Projets & dettes). */
  debts: Debt[];

  debtAmount: number;
  debtRate: number;
  debtMonthly: number;
  /** Somme ajoutée chaque mois aux mensualités pour la stratégie de remboursement. */
  debtExtra: number;

  accounts: Account[];
  /** Valeur réelle saisie des placements, par catégorie d'investissement. */
  investValues: Partial<Record<string, InvestValue>>;
  netWorthHistory: NetWorthPoint[];
  annualCharges: AnnualCharge[];
  /** Jours de prélèvement des postes du budget (loyer, salaire...), pour le calendrier. */
  chargeDays: Partial<Record<string, number>>;
  scenarios: Scenario[];
  couple: CoupleSettings;
  /** Commerçants signalés « pas un abonnement » dans la détection automatique. */
  ignoredRecurring: string[];

  /** Montants propres à un mois (0 = janvier), qui remplacent le budget de base ce mois-là. */
  monthOverrides: MonthOverrides;
  /** Règles apprises quand l'utilisateur corrige la catégorie d'une dépense. */
  categoryRules: CategoryRule[];
  actualExpenses: ActualExpensesByMonth;
  archives: Archive[];
}

// Clés en string (et non NumericKey) pour éviter une définition circulaire avec BudgetState.
export type MonthOverrides = Record<number, Partial<Record<string, number>>>;

/** Clés numériques du state, celles qu'un champ de saisie peut piloter. */
export type NumericKey = {
  [K in keyof BudgetState]: BudgetState[K] extends number ? K : never;
}[keyof BudgetState];

export interface MonthlyTotals {
  income: number;
  housing: number;
  food: number;
  invest: number;
  vehicleNet: number;
  subscriptionsNet: number;
  /** Mensualités des dettes comptées dans le budget. */
  debts: number;
  /** Part mensuelle mise de côté pour les charges annuelles. */
  annualProvision: number;
  totalExpenses: number;
  netAvailable: number;
}

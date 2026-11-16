import type { ActualExpense, BudgetState, CategoryRule, ExpenseCategory } from './types';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'Logement', label: 'Logement' },
  { value: 'Voiture', label: 'Voiture & Transport' },
  { value: 'Nourriture', label: 'Nourriture & Courses' },
  { value: 'Abonnements', label: 'Abonnements' },
  { value: 'Loisirs', label: 'Loisirs & Sorties' },
  { value: 'Crédits', label: 'Crédits & dettes' },
  { value: 'Divers', label: 'Divers' },
];

/** Mots-clés courants des relevés bancaires français. Les règles apprises passent avant. */
// Ordre important : « totalenergies » est du logement avant d'être « total » (carburant),
// « uber eats » un loisir avant d'être « uber » (transport).
const DEFAULT_RULES: [ExpenseCategory, string[]][] = [
  ['Crédits', ['echeance pret', 'echeance credit', 'remboursement pret', 'pret immo', 'cofidis', 'cetelem', 'sofinco', 'franfinance', 'younited', 'floa']],
  ['Logement', ['loyer', 'edf', 'engie', 'totalenergies', 'veolia', 'suez', 'eau de', 'syndic', 'foncia', 'nexity', 'assurance habitation', 'leroy merlin', 'castorama', 'ikea']],
  ['Abonnements', ['netflix', 'spotify', 'deezer', 'disney', 'canal', 'prime video', 'amazon prime', 'apple com', 'icloud', 'google storage', 'youtube', 'free mobile', 'freebox', 'orange', 'sfr', 'bouygues', 'sosh', 'red by', 'basic fit', 'fitness']],
  ['Loisirs', ['restaurant', 'resto', 'mcdonald', 'mcdo', 'burger king', 'kfc', 'deliveroo', 'uber eats', 'just eat', 'cinema', 'pathe', 'ugc', 'fnac', 'decathlon', 'bar ', 'cafe', 'starbucks', 'steam', 'playstation']],
  ['Nourriture', ['carrefour', 'leclerc', 'auchan', 'lidl', 'aldi', 'intermarche', 'monoprix', 'franprix', 'casino', 'super u', 'hyper u', 'systeme u', 'netto', 'picard', 'biocoop', 'grand frais', 'boulangerie', 'boucherie', 'primeur']],
  ['Voiture', ['total', 'esso', 'shell', 'avia', 'station', 'carburant', 'peage', 'autoroute', 'vinci', 'sanef', 'aprr', 'parking', 'indigo', 'norauto', 'feu vert', 'midas', 'speedy', 'ionity', 'tesla', 'electra', 'freshmile', 'sncf', 'ratp', 'navigo', 'uber']],
];

/** Minuscules, sans accents ni chiffres ni ponctuation : « CB CARREFOUR 12/10 » → « cb carrefour ». */
export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NOISE = new Set(['cb', 'carte', 'prlv', 'prelevement', 'sepa', 'vir', 'virement', 'paiement', 'achat', 'facture', 'de', 'du', 'la', 'le', 'les', 'sas', 'sa', 'sarl', 'fr', 'x']);

/** Partie du libellé qui identifie le commerçant, utilisée comme règle apprise. */
export function merchantKey(label: string): string {
  return normalizeLabel(label)
    .split(' ')
    .filter((w) => w.length > 1 && !NOISE.has(w))
    .slice(0, 2)
    .join(' ');
}

export function categorize(label: string, rules: CategoryRule[] = []): ExpenseCategory {
  const text = ` ${normalizeLabel(label)} `;
  // Correspondance en début de mot : « esso » ne doit pas reconnaître « pressing ».
  const has = (w: string) => text.includes(' ' + w);
  for (const r of rules) if (r.pattern && has(r.pattern)) return r.category;
  for (const [cat, words] of DEFAULT_RULES) if (words.some(has)) return cat;
  return 'Divers';
}

/**
 * Retient la correction faite par l'utilisateur et l'applique aux autres
 * dépenses du même commerçant encore classées en « Divers ».
 * Renvoie le nombre de dépenses reclassées en plus de celle corrigée.
 */
export function learnCategory(s: BudgetState, label: string, category: ExpenseCategory): number {
  const key = merchantKey(label);
  if (!key) return 0;
  s.categoryRules = [{ pattern: key, category }, ...s.categoryRules.filter((r) => r.pattern !== key)];
  let changed = 0;
  for (const list of Object.values(s.actualExpenses) as ActualExpense[][]) {
    for (const t of list) {
      if (t.category === 'Divers' && category !== 'Divers' && merchantKey(t.label) === key) {
        t.category = category;
        changed++;
      }
    }
  }
  return changed;
}

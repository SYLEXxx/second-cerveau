import { INVEST_CATEGORIES, type InvestCategoryId } from './defaults';
import type { BudgetState, NumericKey } from './types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const monthlyKey = (id: InvestCategoryId) => id as NumericKey;
export const rateKey = (id: InvestCategoryId) => `rate${cap(id)}` as NumericKey;
export const initKey = (id: InvestCategoryId) => `init${cap(id)}` as NumericKey;

export interface Projection {
  labels: string[];
  /** Capital par catégorie, année par année (index 0 = capital de départ). */
  series: Record<InvestCategoryId, number[]>;
  /** Total sorti de la poche (capital de départ + versements cumulés). */
  outOfPocket: number[];
  /** Part des intérêts composés dans le capital, année par année. */
  interests: number[];
  totalFinal: number;
  totalInvested: number;
  totalInterests: number;
}

/** Intérêts composés mensuels, versement en fin de mois, sur `projYears` années. */
export function computeProjection(s: BudgetState): Projection {
  const years = s.projYears || 20;
  const labels = ['Départ'];
  const running = {} as Record<InvestCategoryId, number>;
  const series = {} as Record<InvestCategoryId, number[]>;

  for (const c of INVEST_CATEGORIES) {
    running[c.id] = s[initKey(c.id)] || 0;
    series[c.id] = [running[c.id]];
  }

  let pocket = INVEST_CATEGORIES.reduce((sum, c) => sum + (s[initKey(c.id)] || 0), 0);
  const outOfPocket = [pocket];

  for (let y = 1; y <= years; y++) {
    labels.push(`An ${y}`);
    let yearDeposit = 0;
    for (const c of INVEST_CATEGORIES) {
      const monthly = s[monthlyKey(c.id)] || 0;
      const r = (s[rateKey(c.id)] || 0) / 100 / 12;
      for (let m = 0; m < 12; m++) running[c.id] = running[c.id] * (1 + r) + monthly;
      series[c.id].push(Math.round(running[c.id]));
      yearDeposit += monthly * 12;
    }
    pocket += yearDeposit;
    outOfPocket.push(Math.round(pocket));
  }

  const totalAt = (i: number) => INVEST_CATEGORIES.reduce((sum, c) => sum + series[c.id][i], 0);
  const interests = labels.map((_, i) => Math.max(0, totalAt(i) - outOfPocket[i]));
  const totalFinal = totalAt(labels.length - 1);
  const totalInvested = outOfPocket[outOfPocket.length - 1];

  return {
    labels,
    series,
    outOfPocket,
    interests,
    totalFinal,
    totalInvested,
    totalInterests: Math.max(0, totalFinal - totalInvested),
  };
}

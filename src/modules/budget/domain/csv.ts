import { categorize } from './categorize';
import type { ActualExpense, CategoryRule } from './types';

/**
 * Import d'un relevé bancaire CSV : colonnes date ; libellé ; montant
 * (séparateur ; ou ,). Les montants sont pris en valeur absolue ; la catégorie
 * est devinée d'après le libellé (règles apprises puis mots-clés courants).
 */
export function parseBankCsv(
  text: string,
  rules: CategoryRule[] = [],
  now: Date = new Date(),
  makeId = () => Date.now() + Math.random(),
): ActualExpense[] {
  const out: ActualExpense[] = [];
  for (const line of text.split(/\r?\n/)) {
    // « ; » prioritaire : sinon « -45,30 » serait coupé en deux et perdrait ses centimes (bug v4.4).
    const parts = line.split(line.includes(';') ? ';' : ',').map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 3) continue;
    const [date, label] = parts;
    const amount = Math.abs(parseFloat(parts[2].replace(/[\s\u00a0€]/g, '').replace(',', '.'))) || 0;
    if (!label || amount <= 0) continue;
    out.push({
      id: makeId(),
      date: date || now.toISOString().split('T')[0],
      label,
      amount,
      category: categorize(label, rules),
    });
  }
  return out;
}

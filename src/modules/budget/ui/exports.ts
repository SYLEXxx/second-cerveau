import { computeActualsOverview, periodReport } from '../domain/actuals';
import { provisionStatus } from '../domain/annual';
import { summaryRows } from '../domain/budget';
import { EXPENSE_CATEGORIES } from '../domain/categorize';
import { settlement } from '../domain/couple';
import { debtEnd } from '../domain/debt';
import { MONTH_NAMES } from '../domain/defaults';
import { escapeHtml, formatCurrency, formatCurrencyCents, formatDate, todayIso } from '../domain/format';
import { totalsForMonth, yearOfCycleMonth } from '../domain/months';
import type { BudgetState } from '../domain/types';
import { ACCOUNT_KINDS, computeNetWorth } from '../domain/wealth';
import { buildXlsx, type Sheet } from '../domain/xlsx';
import type { AppContext } from './context';
import { showToast } from './dialogs';

// Exports pour l'extérieur : classeur Excel et rapports imprimables (PDF).

const round2 = (v: number) => Math.round(v * 100) / 100;
const categoryLabel = (c: string) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;
const monthName = (m: number) => `${MONTH_NAMES[m]} ${yearOfCycleMonth(m)}`;
const cycleMonths = () => Array.from({ length: 12 }, (_, i) => (new Date().getMonth() + i) % 12);

export function workbookSheets(s: BudgetState): Sheet[] {
  const couple = s.couple.enabled;
  const report = periodReport(s, new Date().getMonth());
  const sheets: Sheet[] = [
    {
      name: 'Synthèse 12 mois',
      widths: [18, 14, 16, 16, 14, 16, 16],
      rows: [
        ['Mois', 'Revenus', 'Dépenses prévues', 'Dépenses réelles', 'Écart', 'Épargne & placements', 'Reste à vivre'],
        ...report.rows.map((r) => [monthName(r.month), round2(r.totals.income), round2(r.totals.totalExpenses), round2(r.real), round2(r.diff), round2(r.totals.invest), round2(r.totals.netAvailable)]),
        ['Total', round2(report.income), round2(report.planned), round2(report.real), round2(report.planned - report.real), round2(report.invest), round2(report.net)],
      ],
    },
    {
      name: 'Dépenses réelles',
      widths: [12, 16, 34, 22, 20, 24, 12, ...(couple ? [14] : []), 10],
      rows: [
        ['Date', 'Mois', 'Libellé', 'Catégorie', 'Sous-catégorie', 'Étiquettes', 'Montant', ...(couple ? ['Payé par'] : []), 'Pièces'],
        ...cycleMonths().flatMap((m) => (s.actualExpenses[m] ?? []).map((t) => [
          formatDate(t.date), monthName(m), t.label, categoryLabel(String(t.category)), t.subcategory ?? '', (t.tags ?? []).join(', '), round2(t.amount),
          ...(couple ? [t.paidBy === 'B' ? s.couple.nameB : s.couple.nameA] : []), (t.attachments ?? []).length || '',
        ])),
      ],
    },
    {
      name: 'Budget du mois',
      widths: [34, 18, 16],
      rows: [
        ['Poste', 'Catégorie', 'Montant mensuel'],
        ...summaryRows(totalsForMonth(s, new Date().getMonth())).map((r) => [r.name, r.cat, round2(r.amount)]),
      ],
    },
    {
      name: 'Abonnements et charges',
      widths: [30, 14, 18, 14],
      rows: [
        ['Libellé', 'Montant', 'Fréquence', 'Par mois'],
        ['Pass transport (reste à charge)', round2(s.subTransit * (1 - s.subTransitReimbRate / 100)), 'Mensuel', round2(s.subTransit * (1 - s.subTransitReimbRate / 100))],
        ...s.customSubscriptions.map((c) => [c.name, round2(c.amount), 'Mensuel', round2(c.amount)]),
        ...s.annualCharges.map((c) => [c.name, round2(c.amount), `Annuel (${MONTH_NAMES[c.month].toLowerCase()})`, round2(c.amount / 12)]),
      ],
    },
    {
      name: 'Dettes',
      widths: [26, 14, 10, 14, 18, 16],
      rows: [
        ['Dette', 'Reste dû', 'Taux %', 'Mensualité', 'Fin estimée', 'Intérêts restants'],
        ...s.debts.map((d) => {
          const end = debtEnd(d);
          return [d.name, round2(d.amount), d.rate, round2(d.monthly),
            end.kind === 'ok' ? end.date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : end.kind === 'insufficient' ? 'Jamais (mensualité trop faible)' : '-',
            end.kind === 'ok' ? round2(end.totalInterest) : ''];
        }),
      ],
    },
    {
      name: 'Comptes et patrimoine',
      widths: [26, 20, 14, 14],
      rows: [
        ['Compte', 'Type', 'Solde', 'Mis à jour'],
        ...s.accounts.map((a) => [a.name, ACCOUNT_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind, round2(a.balance), formatDate(a.updatedAt.slice(0, 10))]),
        [],
        ['Valeur nette', '', round2(computeNetWorth(s).total), ''],
        [],
        ['Mois', 'Valeur nette'],
        ...s.netWorthHistory.map((p) => [p.month, p.value]),
      ],
    },
    {
      name: 'Projets',
      widths: [26, 14, 14, 14],
      rows: [['Projet', 'Épargné', 'Objectif', 'Progression %'], ...s.projects.map((p) => [p.name, round2(p.current), round2(p.target), p.target ? Math.round((p.current / p.target) * 100) : ''])],
    },
  ];
  return sheets;
}

export async function exportExcel({ store, platform }: AppContext): Promise<void> {
  try {
    const bytes = buildXlsx(workbookSheets(store.get()));
    const ok = await platform.saveBinaryFile(`MonBudgetPro_${todayIso()}.xlsx`, bytes, { name: 'Classeur Excel', extensions: ['xlsx'] });
    if (ok) showToast('Classeur Excel exporté !');
  } catch (e) {
    console.error(e);
    showToast("Échec de l'export Excel", false);
  }
}

const table = (head: string[], rows: string[][], numCols: number[] = []) => `
  <table><thead><tr>${head.map((h, i) => `<th class="${numCols.includes(i) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${numCols.includes(i) ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

const kpi = (label: string, value: string) => `<div class="kpi"><span class="muted">${label}</span><b>${value}</b></div>`;

function monthReport(s: BudgetState, month: number): string {
  const t = totalsForMonth(s, month);
  const list = s.actualExpenses[month] ?? [];
  const o = computeActualsOverview(t, list);
  const byCat = EXPENSE_CATEGORIES.map((c) => ({ c, total: list.filter((x) => x.category === c.value).reduce((a, x) => a + x.amount, 0) })).filter((x) => x.total > 0);
  let html = `
    <h1>Rapport de ${monthName(month)}</h1>
    <p class="muted">MonBudgetPro · édité le ${new Date().toLocaleDateString('fr-FR')}</p>
    <h2>Chiffres clés</h2>
    <div class="kpis">${kpi('Revenus', formatCurrency(t.income))}${kpi('Dépenses prévues', formatCurrency(o.planned))}${kpi('Dépenses réelles', formatCurrencyCents(o.real))}${kpi('Écart', `${o.diff >= 0 ? '+' : ''}${formatCurrency(o.diff)}`)}</div>
    <h2>Prévu et réel par poste</h2>
    ${table(['Poste', 'Prévu', 'Réel', 'Consommé'], o.categories.map((c) => [c.name, formatCurrency(c.planned), formatCurrencyCents(c.spent), `${c.pct} %`]), [1, 2, 3])}
    ${byCat.length ? `<h2>Dépenses réelles par catégorie</h2>${table(['Catégorie', 'Total'], byCat.map((x) => [x.c.label, formatCurrencyCents(x.total)]), [1])}` : ''}`;
  if (s.couple.enabled && list.length) {
    const st = settlement(s, list);
    const who = st.balance > 0 ? `${s.couple.nameB} doit ${formatCurrencyCents(st.balance)} à ${s.couple.nameA}` : st.balance < 0 ? `${s.couple.nameA} doit ${formatCurrencyCents(-st.balance)} à ${s.couple.nameB}` : 'Les comptes sont équilibrés';
    html += `<h2>Budget à deux</h2>${table(['', s.couple.nameA, s.couple.nameB], [['A payé', formatCurrencyCents(st.paidA), formatCurrencyCents(st.paidB)], ['Part à payer', formatCurrencyCents(st.dueA), formatCurrencyCents(st.dueB)]], [1, 2])}<p><b>${who}.</b></p>`;
  }
  html += `<h2>Détail des dépenses (${list.length})</h2>${list.length
    ? table(['Date', 'Libellé', 'Catégorie', 'Montant'], [...list].sort((a, b) => a.date.localeCompare(b.date)).map((x) => [formatDate(x.date), escapeHtml(x.label) + (x.tags?.length ? ` <span class="muted">#${x.tags.map(escapeHtml).join(' #')}</span>` : ''), categoryLabel(String(x.category)), formatCurrencyCents(x.amount)]), [3])
    : '<p class="muted">Aucune dépense saisie.</p>'}`;
  return html;
}

function yearReport(s: BudgetState): string {
  const r = periodReport(s, new Date().getMonth());
  const nw = computeNetWorth(s);
  return `
    <h1>Bilan sur 12 mois</h1>
    <p class="muted">MonBudgetPro · ${monthName(r.rows[0].month)} → ${monthName(r.rows[11].month)} · édité le ${new Date().toLocaleDateString('fr-FR')}</p>
    <h2>Chiffres clés</h2>
    <div class="kpis">${kpi('Revenus', formatCurrency(r.income))}${kpi('Dépenses prévues', formatCurrency(r.planned))}${kpi('Dépenses réelles', formatCurrency(r.real))}${kpi('Épargne & placements', formatCurrency(r.invest))}</div>
    <h2>Mois par mois</h2>
    ${table(['Mois', 'Revenus', 'Prévu', 'Réel', 'Écart', 'Reste à vivre'], r.rows.map((x) => [monthName(x.month), formatCurrency(x.totals.income), formatCurrency(x.totals.totalExpenses), formatCurrency(x.real), `${x.diff >= 0 ? '+' : ''}${formatCurrency(x.diff)}`, formatCurrency(x.totals.netAvailable)]), [1, 2, 3, 4, 5])}
    <h2>Patrimoine</h2>
    <div class="kpis">${kpi('Valeur nette', formatCurrency(nw.total))}${kpi('Comptes', formatCurrency(nw.accounts))}${kpi('Placements', formatCurrency(nw.investments))}${kpi('Dettes', formatCurrency(nw.debts))}</div>
    ${s.debts.length ? `<h2>Dettes</h2>${table(['Dette', 'Reste dû', 'Mensualité', 'Fin estimée'], s.debts.map((d) => { const e = debtEnd(d); return [escapeHtml(d.name), formatCurrencyCents(d.amount), formatCurrency(d.monthly), e.kind === 'ok' ? e.date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '-']; }), [1, 2])}` : ''}
    ${s.projects.length ? `<h2>Projets d'épargne</h2>${table(['Projet', 'Épargné', 'Objectif', 'Progression'], s.projects.map((p) => { const pct = p.target ? Math.min(100, Math.round((p.current / p.target) * 100)) : 0; return [escapeHtml(p.name), formatCurrency(p.current), formatCurrency(p.target), `<div class="bar"><span style="width:${pct}%"></span></div> ${pct} %`]; }), [1, 2])}` : ''}
    ${s.annualCharges.length ? `<h2>Charges annuelles</h2>${table(['Charge', 'Montant', 'Prochaine échéance', 'Déjà provisionné'], s.annualCharges.map((c) => { const st = provisionStatus(c); return [escapeHtml(c.name), formatCurrency(c.amount), st.due.toLocaleDateString('fr-FR'), formatCurrency(st.saved)]; }), [1, 3])}` : ''}`;
}

/** Ouvre la boîte d'impression avec le rapport ; choisir « Enregistrer au format PDF » pour un fichier. */
export function printReport(s: BudgetState, kind: 'month' | 'year', month = new Date().getMonth()): void {
  const el = document.getElementById('print-report');
  if (!el) return;
  el.innerHTML = kind === 'month' ? monthReport(s, month) : yearReport(s);
  window.print();
}

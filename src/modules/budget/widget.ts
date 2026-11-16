import { computeActualsOverview } from './domain/actuals';
import { formatCurrency } from './domain/format';
import { migrate } from './domain/migrations';
import { totalsForMonth } from './domain/months';
import { isEncrypted } from './domain/vault';
import { MONTH_NAMES } from './domain/defaults';
import type { BudgetState } from './domain/types';
import { liveBudgetState } from './index';

// Résumé du mois pour l'accueil et le bloc ```budget des notes, sans ouvrir tout le module.

const STORAGE_KEY = 'monbudgetpro_data';

export type BudgetSummary =
  | { status: 'locked' }
  | { status: 'ok'; month: string; income: number; planned: number; real: number; pct: number; net: number; left: number };

function readState(): BudgetState | 'locked' | null {
  const live = liveBudgetState();
  if (live) return live;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  if (isEncrypted(raw)) return 'locked';
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function budgetSummary(): BudgetSummary | null {
  const s = readState();
  if (s === 'locked') return { status: 'locked' };
  if (!s) return null;
  const m = new Date().getMonth();
  const t = totalsForMonth(s, m);
  const o = computeActualsOverview(t, s.actualExpenses[m] ?? []);
  return { status: 'ok', month: MONTH_NAMES[m], income: t.income, planned: o.planned, real: o.real, pct: o.pct, net: t.netAvailable, left: o.planned - o.real };
}

export function budgetWidgetHtml(): string {
  const b = budgetSummary();
  const head = `<div class="flex items-center justify-between mb-2"><span class="text-xs font-bold uppercase tracking-wide text-slate-400"><i class="fa-solid fa-wallet text-sky-600 mr-1"></i> Budget${b?.status === 'ok' ? ' · ' + b.month : ''}</span><span class="text-[11px] text-sky-600 font-semibold">Ouvrir <i class="fa-solid fa-chevron-right text-[9px]"></i></span></div>`;
  if (!b) return `${head}<p class="text-sm text-slate-500">Pas encore de budget. Touchez pour le créer.</p>`;
  if (b.status === 'locked') return `${head}<p class="text-sm text-slate-500"><i class="fa-solid fa-lock text-amber-500"></i> Budget protégé par mot de passe. Touchez pour le déverrouiller.</p>`;
  const bar = b.pct >= 100 ? 'bg-rose-500' : b.pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return `${head}
  <div class="grid grid-cols-3 gap-2 text-sm">
    <div><div class="text-[10px] uppercase text-slate-400 font-semibold">Revenus</div><div class="font-bold text-emerald-600 dark:text-emerald-400">${formatCurrency(b.income)}</div></div>
    <div><div class="text-[10px] uppercase text-slate-400 font-semibold">Dépensé</div><div class="font-bold">${formatCurrency(b.real)}</div></div>
    <div><div class="text-[10px] uppercase text-slate-400 font-semibold">Reste à vivre</div><div class="font-bold text-sky-600 dark:text-sky-400">${formatCurrency(b.net)}</div></div>
  </div>
  <div class="mt-2 flex items-center gap-2 text-[11px] text-slate-500"><div class="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div class="h-full ${bar}" style="width:${b.pct}%"></div></div>${b.pct} % de ${formatCurrency(b.planned)} prévus</div>`;
}

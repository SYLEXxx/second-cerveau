import { addDebtPayment, debtEnd, simulateDebt, simulatePayoff, type PayoffResult } from '../../domain/debt';
import { escapeHtml, formatCurrency, formatCurrencyCents } from '../../domain/format';
import { addContribution, projectEta } from '../../domain/projects';
import type { Debt, SavingsProject } from '../../domain/types';
import type { View } from '../context';
import { closeModal, confirmDialog, openModal, promptAmount, showToast } from '../dialogs';
import { byId, on, setText } from '../dom';

const close = () => closeModal('modal-project', 'modal-project-box');

const monthYear = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

/** Projet en cours de modification (null = création). */
let editingId: number | null = null;

function openProjectModal(p?: SavingsProject): void {
  editingId = p?.id ?? null;
  setText('modal-project-title', p ? 'Modifier le projet' : "Ajouter un Projet d'Épargne");
  setText('modal-project-submit', p ? 'Enregistrer' : 'Créer le projet');
  const set = (id: string, v: string) => { const el = byId<HTMLInputElement>(id); if (el) el.value = v; };
  set('project-input-name', p?.name ?? '');
  set('project-input-target', p ? String(p.target) : '');
  set('project-input-current', String(p?.current ?? 0));
  set('project-input-monthly', p?.monthly ? String(p.monthly) : '');
  openModal('modal-project', 'modal-project-box');
}

const closeDebt = () => closeModal('modal-debt', 'modal-debt-box');
/** Dette en cours de modification (null = création). */
let editingDebtId: number | null = null;

function openDebtModal(d?: Debt): void {
  editingDebtId = d?.id ?? null;
  setText('modal-debt-title', d ? 'Modifier la dette' : 'Ajouter une dette');
  setText('modal-debt-submit', d ? 'Enregistrer' : 'Ajouter la dette');
  const set = (id: string, v: string) => { const el = byId<HTMLInputElement>(id); if (el) el.value = v; };
  set('debt-input-name', d?.name ?? '');
  set('debt-input-amount', d ? String(d.amount) : '');
  set('debt-input-rate', String(d?.rate ?? 0));
  set('debt-input-monthly', d ? String(d.monthly) : '');
  const inBudget = byId<HTMLInputElement>('debt-input-inbudget');
  if (inBudget) inBudget.checked = d?.inBudget ?? true;
  openModal('modal-debt', 'modal-debt-box');
}

function debtEndText(d: Debt): string {
  if (d.amount <= 0) return '<span class="text-emerald-600 font-semibold"><i class="fa-solid fa-circle-check"></i> Dette remboursée !</span>';
  const end = debtEnd(d);
  if (end.kind === 'none') return '<span class="italic">Indiquez une mensualité pour estimer la fin.</span>';
  if (end.kind === 'insufficient') return '<span class="text-rose-600 font-semibold">Mensualité trop faible : elle ne couvre pas les intérêts.</span>';
  const interest = end.totalInterest > 0.5 ? `, encore ${formatCurrency(Math.round(end.totalInterest))} d'intérêts` : '';
  return `Remboursée vers <strong class="text-slate-800 dark:text-slate-200">${monthYear(end.date)}</strong> (${end.months} mois${interest})`;
}

function debtCard(d: Debt): string {
  const paid = Math.max(0, d.initial - d.amount);
  const pct = d.initial > 0 ? Math.min(100, Math.round((paid / d.initial) * 100)) : 100;
  const last = (d.payments ?? []).slice(-1)[0];
  return `
    <div class="p-4 bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl border border-rose-200/70 dark:border-rose-900/50 space-y-3">
      <div class="flex justify-between items-start">
        <div>
          <span class="font-bold text-sm text-slate-800 dark:text-slate-100">${escapeHtml(d.name)}</span>
          <div class="text-[10px] text-slate-500">${d.rate ? `${String(d.rate).replace('.', ',')} % / an` : 'Sans intérêts'} · ${formatCurrency(d.monthly)} / mois${d.inBudget ? '' : ' · hors budget'}</div>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-xs font-bold text-rose-600 dark:text-rose-400 mr-1" title="Part déjà remboursée">${pct}%</span>
          <button data-id="${d.id}" title="Modifier" class="btn-edit-debt text-slate-400 hover:text-brand-600 transition p-1"><i class="fa-solid fa-pen text-xs"></i></button>
          <button data-id="${d.id}" title="Supprimer" class="btn-del-debt text-slate-400 hover:text-rose-500 transition p-1"><i class="fa-solid fa-trash-can text-xs"></i></button>
        </div>
      </div>
      <div class="w-full bg-slate-200 dark:bg-slate-600 h-2.5 rounded-full overflow-hidden">
        <div class="h-2.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-rose-500'} transition-all duration-300" style="width: ${pct}%"></div>
      </div>
      <div class="flex justify-between items-center text-xs text-slate-500 pt-1">
        <span>Reste dû : <strong class="text-slate-800 dark:text-slate-200">${formatCurrencyCents(d.amount)}</strong></span>
        <span>Remboursé : <strong class="text-slate-800 dark:text-slate-200">${formatCurrency(paid)}</strong></span>
      </div>
      <p class="text-[11px] text-slate-500">${debtEndText(d)}</p>
      <div class="flex items-center justify-between pt-1">
        <span class="text-[10px] text-slate-400">${last ? `Dernier paiement : ${formatCurrency(last.amount)} le ${new Date(last.date).toLocaleDateString('fr-FR')}` : ''}</span>
        <button data-id="${d.id}" ${d.amount <= 0 ? 'disabled' : ''} class="btn-pay-debt px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex items-center gap-1">
          <i class="fa-solid fa-check"></i> Paiement
        </button>
      </div>
    </div>`;
}

const STRATEGIES = [
  { key: 'minimum', title: 'Mensualités seules', hint: 'Sans rien ajouter' },
  { key: 'avalanche', title: 'Avalanche', hint: 'Le taux le plus élevé d\'abord : le moins cher' },
  { key: 'snowball', title: 'Boule de neige', hint: 'La plus petite dette d\'abord : motivant' },
] as const;

function strategyCards(results: PayoffResult[], best: PayoffResult): string {
  const base = results[0];
  return results.map((r, i) => {
    const s = STRATEGIES[i];
    const end = new Date(new Date().getFullYear(), new Date().getMonth() + r.months, 1);
    const saved = base.totalInterest - r.totalInterest;
    const isBest = r === best && r !== base;
    return `
      <div class="p-3 rounded-xl border ${isBest ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'} space-y-1">
        <div class="flex items-center justify-between"><span class="text-sm font-bold">${s.title}</span>${isBest ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">Conseillé</span>' : ''}</div>
        <div class="text-[11px] text-slate-500">${s.hint}</div>
        ${r.endless
          ? '<div class="text-xs font-semibold text-rose-600 pt-1">Une mensualité ne couvre pas ses intérêts.</div>'
          : `<div class="text-xs pt-1">Libéré vers <strong>${monthYear(end)}</strong> (${r.months} mois)</div>
             <div class="text-xs">Intérêts : <strong class="text-rose-600">${formatCurrency(Math.round(r.totalInterest))}</strong>${i > 0 && saved > 0.5 ? ` <span class="text-emerald-600 font-semibold">(-${formatCurrency(Math.round(saved))})</span>` : ''}</div>
             ${i > 0 && r.order.length > 1 ? `<div class="text-[10px] text-slate-400">Ordre : ${r.order.map(escapeHtml).join(' → ')}</div>` : ''}`}
      </div>`;
  }).join('');
}

function etaText(p: SavingsProject): string {
  const eta = projectEta(p);
  if (eta.kind === 'done') return '<span class="text-emerald-600 font-semibold"><i class="fa-solid fa-circle-check"></i> Objectif atteint !</span>';
  if (eta.kind === 'unknown') return '<span class="italic">Ajoutez un versement mensuel ou un versement pour estimer la date.</span>';
  return `Objectif atteint vers <strong class="text-slate-800 dark:text-slate-200">${monthYear(eta.date)}</strong> (${formatCurrency(eta.monthlyPace)} / mois)`;
}

export const projectsView: View = {
  mount({ store }) {
    on('btn-add-project', 'click', () => openProjectModal());
    on('modal-project-close', 'click', close);
    on('modal-project-cancel', 'click', close);

    on('form-new-project', 'submit', (e) => {
      e.preventDefault();
      const num = (id: string) => parseFloat(byId<HTMLInputElement>(id)?.value ?? '') || 0;
      const name = byId<HTMLInputElement>('project-input-name')?.value.trim();
      const target = num('project-input-target');
      const current = num('project-input-current');
      const monthly = num('project-input-monthly');
      if (!name || target <= 0) return;
      const id = editingId;
      store.update((s) => {
        const existing = s.projects.find((p) => p.id === id);
        if (existing) Object.assign(existing, { name, target, current, monthly });
        else s.projects.push({ id: Date.now(), name, target, current, monthly, contributions: [] });
      });
      close();
      showToast(id !== null ? 'Projet modifié !' : "Nouveau projet d'épargne créé !");
    });

    on('btn-add-debt', 'click', () => openDebtModal());
    on('modal-debt-close', 'click', closeDebt);
    on('modal-debt-cancel', 'click', closeDebt);

    on('form-debt', 'submit', (e) => {
      e.preventDefault();
      const num = (id: string) => parseFloat(byId<HTMLInputElement>(id)?.value ?? '') || 0;
      const name = byId<HTMLInputElement>('debt-input-name')?.value.trim();
      const amount = num('debt-input-amount');
      const rate = num('debt-input-rate');
      const monthly = num('debt-input-monthly');
      const inBudget = byId<HTMLInputElement>('debt-input-inbudget')?.checked ?? true;
      if (!name || amount < 0) return;
      const id = editingDebtId;
      store.update((s) => {
        const existing = s.debts.find((d) => d.id === id);
        if (existing) {
          // Un capital revu à la hausse devient la nouvelle référence de progression.
          Object.assign(existing, { name, amount, rate, monthly, inBudget, initial: Math.max(existing.initial, amount) });
        } else {
          s.debts.push({ id: Date.now(), name, amount, initial: amount, rate, monthly, inBudget, payments: [] });
        }
      });
      closeDebt();
      showToast(id !== null ? 'Dette modifiée !' : 'Dette ajoutée !');
    });

    byId('debts-grid')?.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const debt = store.get().debts.find((d) => d.id === id);
      if (!debt) return;

      if (btn.classList.contains('btn-del-debt')) {
        if (!(await confirmDialog(`Supprimer la dette « ${debt.name} » ?`))) return;
        store.update((s) => { s.debts = s.debts.filter((d) => d.id !== id); });
      } else if (btn.classList.contains('btn-edit-debt')) {
        openDebtModal(debt);
      } else if (btn.classList.contains('btn-pay-debt')) {
        const amount = await promptAmount(
          `Paiement sur « ${debt.name} »`,
          "Montant payé (€). Les intérêts du mois sont déduits, le reste réduit le capital.",
          String(Math.min(debt.monthly || debt.amount, debt.amount + debt.amount * (debt.rate / 100 / 12)).toFixed(2).replace(/\.00$/, '')),
        );
        if (!amount || amount <= 0) return;
        let principal = 0;
        store.update((s) => {
          const d = s.debts.find((x) => x.id === id);
          if (d) principal = addDebtPayment(d, amount).principal;
        });
        const left = store.get().debts.find((d) => d.id === id)?.amount ?? 0;
        showToast(left <= 0 ? `« ${debt.name} » est entièrement remboursée !` : `${formatCurrencyCents(principal)} de capital remboursé`);
      }
    });

    byId('projects-grid')?.addEventListener('click', async (e) => {
      const el = e.target as HTMLElement;
      const btn = el.closest<HTMLElement>('[data-id]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const project = store.get().projects.find((p) => p.id === id);
      if (!project) return;

      if (btn.classList.contains('btn-del-project')) {
        if (!(await confirmDialog(`Supprimer le projet « ${project.name} » ?`))) return;
        store.update((s) => { s.projects = s.projects.filter((p) => p.id !== id); });
      } else if (btn.classList.contains('btn-edit-project')) {
        openProjectModal(project);
      } else if (btn.classList.contains('btn-add-contrib')) {
        const amount = await promptAmount(`Versement sur « ${project.name} »`, 'Montant versé (€). Un montant négatif enregistre un retrait.', project.monthly ? String(project.monthly) : '');
        if (!amount) return;
        store.update((s) => {
          const p = s.projects.find((x) => x.id === id);
          if (p) addContribution(p, amount);
        });
        showToast(amount > 0 ? `${formatCurrency(amount)} ajoutés à « ${project.name} »` : `Retrait enregistré sur « ${project.name} »`);
      }
    });
  },

  render(s) {
    const grid = byId('projects-grid');
    if (grid) {
      grid.innerHTML = s.projects.length === 0
        ? `<p class="col-span-full text-xs text-slate-400 italic p-4 text-center">Aucun projet pour le moment. Cliquez sur "Nouveau Projet" pour vous fixer un objectif !</p>`
        : s.projects.map((p) => {
          const pct = Math.min(100, Math.round((p.current / p.target) * 100));
          const last = (p.contributions ?? []).slice(-1)[0];
          return `
            <div class="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 relative group">
              <div class="flex justify-between items-start">
                <span class="font-bold text-sm text-slate-800 dark:text-slate-100">${escapeHtml(p.name)}</span>
                <div class="flex items-center gap-1">
                  <span class="text-xs font-bold text-brand-600 dark:text-brand-400 mr-1">${pct}%</span>
                  <button data-id="${p.id}" title="Modifier" class="btn-edit-project text-slate-400 hover:text-brand-600 transition p-1">
                    <i class="fa-solid fa-pen text-xs"></i>
                  </button>
                  <button data-id="${p.id}" title="Supprimer" class="btn-del-project text-slate-400 hover:text-rose-500 transition p-1">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                  </button>
                </div>
              </div>
              <div class="w-full bg-slate-200 dark:bg-slate-600 h-2.5 rounded-full overflow-hidden">
                <div class="h-2.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-brand-600'} transition-all duration-300" style="width: ${pct}%"></div>
              </div>
              <div class="flex justify-between items-center text-xs text-slate-500 pt-1">
                <span>Épargné : <strong class="text-slate-800 dark:text-slate-200">${formatCurrency(p.current)}</strong></span>
                <span>Cible : <strong class="text-slate-800 dark:text-slate-200">${formatCurrency(p.target)}</strong></span>
              </div>
              <p class="text-[11px] text-slate-500">${etaText(p)}</p>
              <div class="flex items-center justify-between pt-1">
                <span class="text-[10px] text-slate-400">${last ? `Dernier versement : ${formatCurrency(last.amount)} le ${new Date(last.date).toLocaleDateString('fr-FR')}` : ''}</span>
                <button data-id="${p.id}" class="btn-add-contrib px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1">
                  <i class="fa-solid fa-plus"></i> Versement
                </button>
              </div>
            </div>`;
        }).join('');
    }

    const debtsGrid = byId('debts-grid');
    if (debtsGrid) {
      debtsGrid.innerHTML = s.debts.length === 0
        ? `<p class="col-span-full text-xs text-slate-400 italic p-4 text-center">Aucune dette enregistrée. Cliquez sur « Nouvelle dette » pour suivre un prêt ou un crédit.</p>`
        : s.debts.map(debtCard).join('');
    }
    const open = s.debts.filter((d) => d.amount > 0);
    setText('debts-summary', open.length
      ? `Total restant dû : ${formatCurrency(open.reduce((a, d) => a + d.amount, 0))} · ${formatCurrency(open.reduce((a, d) => a + d.monthly, 0))} / mois`
      : '');

    const active = s.debts.filter((d) => d.amount > 0);
    byId('debt-strategy')?.classList.toggle('hidden', active.length === 0);
    const extraEl = byId<HTMLInputElement>('debt-extra');
    if (extraEl && extraEl !== document.activeElement) extraEl.value = String(s.debtExtra || 0);
    const cards = byId('debt-strategy-cards');
    if (cards && active.length) {
      const results = STRATEGIES.map((st) => simulatePayoff(active, s.debtExtra, st.key));
      const best = results.filter((r) => !r.endless).sort((a, b) => a.totalInterest - b.totalInterest || a.months - b.months)[0] ?? results[0];
      cards.innerHTML = strategyCards(results, best);
    }

    const debt = simulateDebt(s.debtAmount, s.debtRate, s.debtMonthly);
    if (debt.kind === 'none') {
      setText('debt-result-months', '0 mois');
      setText('debt-result-interest', '0 €');
    } else if (debt.kind === 'insufficient') {
      setText('debt-result-months', 'Mensualité insuffisante !');
      setText('debt-result-interest', '∞ €');
    } else {
      setText('debt-result-months', `${debt.months} mois (~${(debt.months / 12).toFixed(1)} ans)`);
      setText('debt-result-interest', formatCurrency(Math.round(debt.totalInterest)));
    }
  },
};

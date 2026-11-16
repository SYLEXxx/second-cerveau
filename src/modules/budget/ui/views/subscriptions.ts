import { provisionStatus } from '../../domain/annual';
import { annualProvisionMonthly, computeSubscriptions } from '../../domain/budget';
import { MONTH_NAMES } from '../../domain/defaults';
import { detectRecurring } from '../../domain/insights';
import type { AnnualCharge } from '../../domain/types';
import { escapeHtml, formatCurrency } from '../../domain/format';
import type { View } from '../context';
import { closeModal, confirmDialog, formDialog, openModal, showToast } from '../dialogs';
import { byId, on, setText } from '../dom';

const close = () => closeModal('modal-sub', 'modal-sub-box');

/** Abonnement en cours de modification (null = ajout). */
let editingId: number | null = null;

function openSubModal(sub?: { id: number; name: string; amount: number }): void {
  editingId = sub?.id ?? null;
  setText('modal-sub-title', sub ? "Modifier l'abonnement" : 'Ajouter un Abonnement');
  setText('modal-sub-submit', sub ? 'Enregistrer' : 'Ajouter');
  const name = byId<HTMLInputElement>('sub-input-name');
  const amount = byId<HTMLInputElement>('sub-input-amount');
  if (name) name.value = sub?.name ?? '';
  if (amount) amount.value = String(sub?.amount ?? 15);
  openModal('modal-sub', 'modal-sub-box');
  setTimeout(() => name?.focus(), 20);
}

const editAnnual = (c?: AnnualCharge) => formDialog({
  title: c ? 'Modifier la charge annuelle' : 'Nouvelle charge annuelle',
  icon: 'fa-calendar-plus',
  submitLabel: c ? 'Enregistrer' : 'Ajouter',
  fields: [
    { key: 'name', label: 'Nom', type: 'text', value: c?.name ?? '', placeholder: 'ex: Assurance auto, Taxe foncière...', required: true },
    { key: 'amount', label: 'Montant annuel (€)', type: 'number', value: c?.amount ?? null, min: 0, required: true },
    { key: 'month', label: "Mois de l'échéance", type: 'select', value: String(c?.month ?? new Date().getMonth()), options: MONTH_NAMES.map((m, i) => ({ value: String(i), label: m })) },
    { key: 'day', label: 'Jour du prélèvement (facultatif)', type: 'number', value: c?.day ?? null, min: 1, max: 31, step: '1' },
  ],
});

export const subscriptionsView: View = {
  mount({ store }) {
    on('btn-add-custom-sub', 'click', () => openSubModal());
    on('modal-sub-close', 'click', close);
    on('modal-sub-cancel', 'click', close);

    on('form-new-sub', 'submit', (e) => {
      e.preventDefault();
      const name = byId<HTMLInputElement>('sub-input-name')?.value.trim();
      const amount = parseFloat(byId<HTMLInputElement>('sub-input-amount')?.value ?? '') || 0;
      if (!name) return;
      const id = editingId;
      store.update((s) => {
        const existing = s.customSubscriptions.find((x) => x.id === id);
        if (existing) Object.assign(existing, { name, amount });
        else s.customSubscriptions.push({ id: Date.now(), name, amount });
      });
      close();
      if (id !== null) showToast('Abonnement modifié !');
    });

    on('btn-add-annual', 'click', async () => {
      const v = await editAnnual();
      if (!v) return;
      store.update((s) => s.annualCharges.push({
        id: Date.now(), name: String(v.name), amount: Number(v.amount) || 0, month: Number(v.month), day: v.day ? Number(v.day) : undefined,
      }));
      showToast('Charge annuelle ajoutée !');
    });

    byId('annual-charges-list')?.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const charge = store.get().annualCharges.find((c) => c.id === id);
      if (!charge) return;
      if (btn.classList.contains('btn-del-annual')) {
        if (!(await confirmDialog(`Supprimer « ${charge.name} » ?`))) return;
        store.update((s) => { s.annualCharges = s.annualCharges.filter((c) => c.id !== id); });
      } else {
        const v = await editAnnual(charge);
        if (!v) return;
        store.update((s) => {
          const c = s.annualCharges.find((x) => x.id === id);
          if (c) Object.assign(c, { name: String(v.name), amount: Number(v.amount) || 0, month: Number(v.month), day: v.day ? Number(v.day) : undefined });
        });
      }
    });

    byId('recurring-list')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
      if (!btn) return;
      const key = btn.dataset.key!;
      if (btn.classList.contains('btn-ignore-recurring')) {
        store.update((s) => { s.ignoredRecurring.push(key); });
        return;
      }
      // « PRLV SEPA NETFLIX.COM » devient « Netflix ».
      const name = key.replace(/\b\w/g, (c) => c.toUpperCase());
      const amount = Number(btn.dataset.amount);
      store.update((s) => s.customSubscriptions.push({ id: Date.now(), name, amount }));
      showToast(`« ${name} » ajouté aux abonnements`);
    });

    byId('custom-subs-container')?.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const del = el.closest<HTMLElement>('.btn-del-sub');
      if (del) {
        const id = Number(del.dataset.id);
        store.update((s) => { s.customSubscriptions = s.customSubscriptions.filter((x) => x.id !== id); });
        return;
      }
      const edit = el.closest<HTMLElement>('.btn-edit-sub');
      if (edit) openSubModal(store.get().customSubscriptions.find((x) => x.id === Number(edit.dataset.id)));
    });
  },

  render(s, t) {
    const b = computeSubscriptions(s);
    setText('subtotal-subscriptions', `${formatCurrency(t.subscriptionsNet)} / mois`);
    setText('sub-transit-reimb-display', `${s.subTransitReimbRate}%`);
    setText('sub-calc-transit-gross', formatCurrency(b.transitGross));
    setText('sub-calc-transit-reimb', `- ${formatCurrency(b.transitReimbursement)}`);
    setText('sub-calc-custom', formatCurrency(b.customTotal));
    setText('val-sub-transit-reimb', `- ${formatCurrency(b.transitReimbursement)}`);
    setText('val-sub-transit-net', formatCurrency(b.transitNet));

    const annual = byId('annual-charges-list');
    if (annual) {
      annual.innerHTML = s.annualCharges.length === 0
        ? '<p class="text-xs text-slate-400 italic p-3 text-center">Aucune charge annuelle.</p>'
        : [...s.annualCharges].sort((a, b) => provisionStatus(a).due.getTime() - provisionStatus(b).due.getTime()).map((c) => {
          const st = provisionStatus(c);
          return `
          <div class="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-sm font-semibold truncate">${escapeHtml(c.name)}</div>
                <div class="text-[11px] text-slate-500">${formatCurrency(c.amount)} / an · prochaine échéance le ${st.due.toLocaleDateString('fr-FR')}${st.monthsLeft ? ` (dans ${st.monthsLeft} mois)` : ' (ce mois-ci)'}</div>
              </div>
              <div class="flex items-center gap-1">
                <span class="text-xs font-bold text-amber-600 mr-1">${formatCurrency(st.monthly)} / mois</span>
                <button data-id="${c.id}" title="Modifier" class="btn-edit-annual text-slate-400 hover:text-amber-600 p-1"><i class="fa-solid fa-pen text-xs"></i></button>
                <button data-id="${c.id}" title="Supprimer" class="btn-del-annual text-slate-400 hover:text-rose-500 p-1"><i class="fa-solid fa-trash-can text-xs"></i></button>
              </div>
            </div>
            <div class="flex items-center gap-2 text-[10px] text-slate-500">
              <div class="flex-1 bg-slate-200 dark:bg-slate-600 h-1.5 rounded-full overflow-hidden"><div class="h-1.5 bg-amber-500 rounded-full" style="width:${st.pct}%"></div></div>
              <span>${formatCurrency(st.saved)} devraient être de côté</span>
            </div>
          </div>`;
        }).join('');
    }
    setText('annual-provision-total', formatCurrency(annualProvisionMonthly(s)));

    const recurring = byId('recurring-list');
    if (recurring) {
      const found = detectRecurring(s);
      recurring.innerHTML = found.length === 0
        ? '<p class="text-xs text-slate-400 italic p-3 text-center">Rien à signaler. La détection s\'appuie sur vos dépenses réelles : plus vous en saisissez ou importez, plus elle est utile.</p>'
        : found.map((r) => `
          <div class="flex items-center gap-3 p-3 bg-teal-50/60 dark:bg-teal-950/20 rounded-xl border border-teal-200/80 dark:border-teal-900/50">
            <i class="fa-solid fa-rotate text-teal-500"></i>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold truncate">${escapeHtml(r.label)}</div>
              <div class="text-[11px] text-slate-500">${formatCurrency(r.amount)} environ, vu sur ${r.months} mois</div>
            </div>
            <button data-key="${escapeHtml(r.key)}" data-label="${escapeHtml(r.label)}" data-amount="${r.amount}" class="btn-add-recurring px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white">Ajouter aux abonnements</button>
            <button data-key="${escapeHtml(r.key)}" title="Ce n'est pas un abonnement" class="btn-ignore-recurring px-2 py-1 text-[11px] rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">Ignorer</button>
          </div>`).join('');
    }

    const container = byId('custom-subs-container');
    if (!container) return;
    container.innerHTML = s.customSubscriptions
      .map((sub) => `
        <div class="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
          <span class="text-xs font-medium">${escapeHtml(sub.name)}</span>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-teal-600">${formatCurrency(sub.amount)}</span>
            <button data-id="${sub.id}" title="Modifier" class="btn-edit-sub text-slate-400 hover:text-teal-600 p-1">
              <i class="fa-solid fa-pen text-xs"></i>
            </button>
            <button data-id="${sub.id}" title="Supprimer" class="btn-del-sub text-rose-500 hover:text-rose-700 p-1">
              <i class="fa-solid fa-trash text-xs"></i>
            </button>
          </div>
        </div>`)
      .join('');
  },
};

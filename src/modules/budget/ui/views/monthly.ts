import { computeMonthlyTotals, computeVehicle } from '../../domain/budget';
import { MONTH_NAMES } from '../../domain/defaults';
import { formatCurrency } from '../../domain/format';
import { applyMonthToAllYear, overrideCount, resetMonth, stateForMonth, totalsForMonth, yearOfCycleMonth } from '../../domain/months';
import { rollingMonths } from '../../domain/actuals';
import { syncInputs } from '../bindings';
import type { View } from '../context';
import { showToast } from '../dialogs';
import { byId, on, setText, toggleClasses } from '../dom';

const ACTIVE = ['bg-amber-500', 'text-white'];
const BASE = 'base';

export const monthLabel = (m: number) => `${MONTH_NAMES[m]} ${yearOfCycleMonth(m)}`;

export const monthlyView: View = {
  mount({ store, ui }) {
    const select = byId<HTMLSelectElement>('monthly-month-select');
    select?.addEventListener('change', () => {
      ui.plannerMonth = select.value === BASE ? null : Number(select.value);
      syncInputs(store.get(), ui, true);
      store.refresh();
    });

    on('btn-mode-ev', 'click', () => store.update((s) => { s.vehicleMode = 'EV'; }));
    on('btn-mode-ice', 'click', () => store.update((s) => { s.vehicleMode = 'ICE'; }));
    on('btn-reimb-yes', 'click', () => store.update((s) => { s.isWorkReimbursed = true; }));
    on('btn-reimb-no', 'click', () => store.update((s) => { s.isWorkReimbursed = false; }));

    on('btn-apply-all-year', 'click', () => {
      const m = ui.plannerMonth;
      if (m === null) return;
      store.update((s) => applyMonthToAllYear(s, m));
      syncInputs(store.get(), ui, true);
      showToast(`Montants de ${monthLabel(m)} appliqués à toute l'année !`);
    });

    on('btn-reset-month', 'click', () => {
      const m = ui.plannerMonth;
      if (m === null) return;
      store.update((s) => resetMonth(s, m));
      syncInputs(store.get(), ui, true);
      showToast(`${monthLabel(m)} suit à nouveau le budget de base`);
    });
  },

  render(s, _t, { ui }) {
    const m = ui.plannerMonth;
    const select = byId<HTMLSelectElement>('monthly-month-select');
    if (select) {
      const options = [`<option value="${BASE}">Tous les mois (budget de base)</option>`]
        .concat(rollingMonths(new Date().getMonth()).map((month) => {
          const n = overrideCount(s, month);
          return `<option value="${month}">${monthLabel(month)}${n ? ` • ${n} spécifique${n > 1 ? 's' : ''}` : ''}</option>`;
        }));
      select.innerHTML = options.join('');
      select.value = m === null ? BASE : String(m);
    }

    const count = m === null ? 0 : overrideCount(s, m);
    setText('planner-info', m === null
      ? 'Vous modifiez le budget de base, appliqué à tous les mois.'
      : count
        ? `${monthLabel(m)} : ${count} montant${count > 1 ? 's' : ''} propre${count > 1 ? 's' : ''} à ce mois (champs entourés).`
        : `${monthLabel(m)} : identique au budget de base. Toute modification ne s'appliquera qu'à ce mois.`);
    const applyBtn = byId<HTMLButtonElement>('btn-apply-all-year');
    const resetBtn = byId<HTMLButtonElement>('btn-reset-month');
    if (applyBtn) applyBtn.disabled = !count;
    if (resetBtn) resetBtn.disabled = !count;

    const visible = m === null ? s : stateForMonth(s, m);
    const t = m === null ? computeMonthlyTotals(s) : totalsForMonth(s, m);
    setText('acc-total-income', formatCurrency(t.income));
    setText('acc-total-housing', formatCurrency(t.housing));
    setText('acc-total-vehicle', formatCurrency(t.vehicleNet));
    setText('acc-total-food', formatCurrency(t.food));

    const ev = s.vehicleMode === 'EV';
    toggleClasses(byId('btn-mode-ev'), ev, ACTIVE);
    toggleClasses(byId('btn-mode-ice'), !ev, ACTIVE);
    byId('section-ev')?.classList.toggle('hidden', !ev);
    byId('section-ice')?.classList.toggle('hidden', ev);
    toggleClasses(byId('btn-reimb-yes'), s.isWorkReimbursed, ACTIVE);
    toggleClasses(byId('btn-reimb-no'), !s.isWorkReimbursed, ACTIVE);

    const v = computeVehicle(visible);
    setText('val-km-perso', `${v.kmPerso} km`);
    setText('ev-ratio-display', `${visible.evHomeRatio}%`);
    setText('veh-calc-lease', formatCurrency(v.lease));
    setText('veh-calc-fixed', formatCurrency(v.insuranceAndMaintenance));
    setText('veh-calc-energy-gross', formatCurrency(v.grossEnergy));
    setText('calc-perso-km', v.kmPerso);
    setText('calc-perso-cost', formatCurrency(v.persoCost));
    setText('calc-work-km', visible.kmWork || 0);
    setText('calc-work-gross-cost', formatCurrency(v.workGrossCost));
    setText('veh-calc-reimbursement', `- ${formatCurrency(v.reimbursement)}`);
    setText('veh-calc-energy-net', formatCurrency(v.netEnergy));
  },
};

import { isMonthlyField, setMonthValue, stateForMonth } from '../domain/months';
import type { BudgetState, NumericKey } from '../domain/types';
import type { AppContext, UiState } from './context';
import { byId } from './dom';

/**
 * Champs numériques reliés au state. Chaque entrée peut exister sous deux
 * formes synchronisées : `<id>` (curseur) et `<id>-num` (saisie).
 * Cette table explicite remplace la détection par id.includes(...) de la
 * v4.4, qui faisait par exemple écraser le versement mensuel « Livrets » par
 * le rendement saisi juste à côté.
 */
const FIELDS: [string, NumericKey][] = [
  ['input-salary', 'salary'],
  ['input-bonus', 'bonus'],
  ['input-extra', 'extra'],
  ['input-allowance', 'allowance'],
  ['input-rent', 'rent'],
  ['input-charges', 'charges'],
  ['input-elec', 'elec'],
  ['input-tax-ins', 'taxIns'],
  ['input-web-mobile', 'webMobile'],
  ['input-km-total', 'kmTotal'],
  ['input-km-work', 'kmWork'],
  ['input-reimb-rate', 'reimbRate'],
  ['input-ev-lease', 'evLease'],
  ['input-ev-insurance', 'evInsurance'],
  ['input-ev-maint', 'evMaint'],
  ['input-ev-cons', 'evCons'],
  ['input-ev-home-ratio', 'evHomeRatio'],
  ['input-ev-price-home', 'evPriceHome'],
  ['input-ev-price-public', 'evPricePublic'],
  ['input-ice-lease', 'iceLease'],
  ['input-ice-insurance', 'iceInsurance'],
  ['input-ice-maint', 'iceMaint'],
  ['input-ice-cons', 'iceCons'],
  ['input-ice-fuel-price', 'iceFuelPrice'],
  ['input-groceries', 'groceries'],
  ['input-restaurant', 'restaurant'],
  ['input-leisure', 'leisure'],
  ['input-family', 'family'],
  ['input-sub-transit', 'subTransit'],
  ['input-sub-transit-reimb', 'subTransitReimbRate'],
  ['input-savings', 'savings'],
  ['input-etf', 'etf'],
  ['input-crypto', 'crypto'],
  ['input-realestate', 'realestate'],
  ['input-other-invest', 'otherInvest'],
  ['input-rate-savings', 'rateSavings'],
  ['input-rate-etf', 'rateEtf'],
  ['input-rate-crypto', 'rateCrypto'],
  ['input-rate-realestate', 'rateRealestate'],
  ['input-rate-other-invest', 'rateOtherInvest'],
  ['input-init-savings', 'initSavings'],
  ['input-init-etf', 'initEtf'],
  ['input-init-crypto', 'initCrypto'],
  ['input-init-realestate', 'initRealestate'],
  ['input-init-other-invest', 'initOtherInvest'],
  ['input-proj-years', 'projYears'],
  ['debt-amount', 'debtAmount'],
  ['debt-rate', 'debtRate'],
  ['debt-monthly', 'debtMonthly'],
  ['debt-extra', 'debtExtra'],
];

const variants = (id: string) =>
  [byId<HTMLInputElement>(id), byId<HTMLInputElement>(`${id}-num`)].filter((el): el is HTMLInputElement => !!el);

/** Le champ édite-t-il un mois précis plutôt que le budget de base ? */
const editsMonth = (ui: UiState, key: NumericKey) => ui.plannerMonth !== null && isMonthlyField(key);

/** Valeurs affichées : celles du mois choisi dans le planificateur, sinon le budget de base. */
const visibleState = (s: BudgetState, ui: UiState) => (ui.plannerMonth === null ? s : stateForMonth(s, ui.plannerMonth));

/**
 * Recopie le state dans les champs. `force` réécrit aussi le champ actif
 * (changement de mois, import) ; sinon on le laisse pour ne pas gêner la frappe.
 */
export function syncInputs(s: BudgetState, ui: UiState, force = false): void {
  const visible = visibleState(s, ui);
  const overrides = ui.plannerMonth === null ? {} : s.monthOverrides[ui.plannerMonth] ?? {};
  for (const [id, key] of FIELDS) {
    for (const el of variants(id)) {
      // On ne réécrit pas le champ en cours de frappe (« 2. » deviendrait « 2 »).
      if (force || el !== document.activeElement) el.value = String(visible[key]);
      // Les montants propres au mois affiché sont entourés.
      el.classList.toggle('ring-2', key in overrides);
      el.classList.toggle('ring-indigo-400', key in overrides);
    }
  }
}

export function bindInputs({ store, ui }: AppContext): void {
  for (const [id, key] of FIELDS) {
    const els = variants(id);
    for (const el of els) {
      el.addEventListener('input', () => {
        const raw = parseFloat(el.value) || 0;
        const visible = visibleState(store.get(), ui);
        const val = key === 'kmWork' ? Math.min(raw, visible.kmTotal) : raw;
        if (key === 'kmWork') byId('work-km-warning')?.classList.toggle('hidden', val === raw);
        for (const other of els) if (other !== el || val !== raw) other.value = String(val);

        store.update((s) => {
          const write = (k: NumericKey, v: number) => {
            if (editsMonth(ui, k)) setMonthValue(s, ui.plannerMonth!, k, v);
            else s[k] = v;
          };
          write(key, val);
          if (key === 'kmTotal') {
            const kmWork = visibleState(s, ui).kmWork;
            if (kmWork > val) write('kmWork', val);
          }
        });
        if (key === 'kmTotal' || editsMonth(ui, key)) syncInputs(store.get(), ui);
      });
    }
  }
}

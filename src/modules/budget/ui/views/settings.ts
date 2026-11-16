import { coupleBudget } from '../../domain/couple';
import { formatCurrency } from '../../domain/format';
import { rollingMonths } from '../../domain/actuals';
import type { CoupleSplit } from '../../domain/types';
import { resealAll } from '../attachments';
import type { View } from '../context';
import { confirmDialog, formDialog, showToast } from '../dialogs';
import { byId, on, setText } from '../dom';
import { exportExcel, printReport } from '../exports';
import { monthLabel } from './monthly';

const MIN_PASSWORD = 6;

export const settingsView: View = {
  mount(ctx) {
    const { store } = ctx;

    on('btn-set-password', 'click', async () => {
      const v = await formDialog({
        title: store.isProtected ? 'Changer le mot de passe' : 'Définir un mot de passe',
        icon: 'fa-key',
        intro: 'Il sera demandé à chaque ouverture. Il ne peut pas être récupéré en cas d\'oubli.',
        submitLabel: 'Protéger mes données',
        fields: [
          { key: 'pw', label: 'Nouveau mot de passe', type: 'password', required: true },
          { key: 'pw2', label: 'Confirmer le mot de passe', type: 'password', required: true },
        ],
        validate: (x) => (String(x.pw).length < MIN_PASSWORD ? `Au moins ${MIN_PASSWORD} caractères.` : x.pw !== x.pw2 ? 'Les deux mots de passe sont différents.' : null),
      });
      if (!v) return;
      const before = store.vaultKey;
      const after = await store.setPassword(String(v.pw));
      const failed = await resealAll(ctx, before, after);
      store.refresh();
      showToast(failed ? `Mot de passe défini, ${failed} pièce(s) jointe(s) non chiffrée(s)` : 'Données protégées par mot de passe', !failed);
    });

    on('btn-remove-password', 'click', async () => {
      if (!(await confirmDialog('Retirer le mot de passe ? Vos données seront de nouveau enregistrées en clair sur ce PC.'))) return;
      const before = store.vaultKey;
      await store.setPassword(null);
      await resealAll(ctx, before, null);
      store.refresh();
      showToast('Mot de passe retiré');
    });

    const coupleUpdate = (fn: (c: ReturnType<typeof store.get>['couple']) => void) => store.update((s) => fn(s.couple));
    byId('couple-enabled')?.addEventListener('change', (e) => coupleUpdate((c) => { c.enabled = (e.target as HTMLInputElement).checked; }));
    byId('couple-name-a')?.addEventListener('input', (e) => coupleUpdate((c) => { c.nameA = (e.target as HTMLInputElement).value || 'Moi'; }));
    byId('couple-name-b')?.addEventListener('input', (e) => coupleUpdate((c) => { c.nameB = (e.target as HTMLInputElement).value || 'Partenaire'; }));
    byId('couple-income-b')?.addEventListener('input', (e) => coupleUpdate((c) => { c.incomeB = parseFloat((e.target as HTMLInputElement).value) || 0; }));
    byId('couple-split')?.addEventListener('change', (e) => coupleUpdate((c) => { c.split = (e.target as HTMLSelectElement).value as CoupleSplit; }));
    byId('couple-share-a')?.addEventListener('input', (e) => coupleUpdate((c) => { c.shareA = Number((e.target as HTMLInputElement).value); }));

    on('btn-export-excel', 'click', () => void exportExcel(ctx));
    const reportMonth = () => Number(byId<HTMLSelectElement>('report-month')?.value ?? new Date().getMonth());
    on('btn-report-month', 'click', () => printReport(store.get(), 'month', reportMonth()));
    on('btn-report-year', 'click', () => printReport(store.get(), 'year'));
    on('btn-settings-export', 'click', () => byId('export-json-btn')?.click());
    on('btn-settings-import', 'click', () => byId('import-json-btn')?.click());
  },

  render(s, t, { store }) {
    const status = byId('security-status');
    if (status) {
      status.className = `p-3 rounded-xl text-sm flex items-center gap-2 ${store.isProtected ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200' : 'bg-slate-100 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300'}`;
      status.innerHTML = store.isProtected
        ? '<i class="fa-solid fa-lock"></i> Vos données sont chiffrées et protégées par mot de passe.'
        : '<i class="fa-solid fa-lock-open"></i> Aucun mot de passe : les données sont lisibles par toute personne ayant accès à ce PC.';
    }
    setText('btn-set-password-label', store.isProtected ? 'Changer le mot de passe' : 'Définir un mot de passe');
    byId('btn-remove-password')?.classList.toggle('hidden', !store.isProtected);
    byId('lock-btn')?.classList.toggle('hidden', !store.isProtected);

    const c = s.couple;
    const set = (id: string, v: string) => { const el = byId<HTMLInputElement>(id); if (el && el !== document.activeElement) el.value = v; };
    const enabled = byId<HTMLInputElement>('couple-enabled');
    if (enabled) enabled.checked = c.enabled;
    set('couple-name-a', c.nameA);
    set('couple-name-b', c.nameB);
    set('couple-income-b', String(c.incomeB));
    set('couple-split', c.split);
    set('couple-share-a', String(c.shareA));
    setText('couple-share-display', `${c.shareA} % / ${100 - c.shareA} %`);
    byId('couple-share-wrap')?.classList.toggle('hidden', c.split !== 'custom');
    byId('couple-fields')?.classList.toggle('opacity-50', !c.enabled);
    if (c.enabled) {
      const cb = coupleBudget(s, t);
      setText('couple-summary', `Ce mois-ci : ${c.nameA} verse ${formatCurrency(cb.A.expenses)} (${Math.round(cb.shareA * 100)} %), ${c.nameB} verse ${formatCurrency(cb.B.expenses)}.`);
    } else {
      setText('couple-summary', '');
    }

    const sel = byId<HTMLSelectElement>('report-month');
    if (sel && !sel.options.length) {
      sel.innerHTML = rollingMonths(new Date().getMonth()).map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join('');
    }
  },
};

import { escapeHtml, formatCurrency } from '../../domain/format';
import { compareScenario, SCENARIO_GROUPS, SCENARIO_KEYS } from '../../domain/scenarios';
import type { NumericKey } from '../../domain/types';
import { syncInputs } from '../bindings';
import type { View } from '../context';
import { confirmDialog, formDialog, showToast } from '../dialogs';
import { byId, on, setText } from '../dom';

const askName = (title: string, value = '') =>
  formDialog({
    title,
    icon: 'fa-code-branch',
    fields: [{ key: 'name', label: 'Nom du scénario', type: 'text', value, placeholder: 'ex: Augmentation, Déménagement à Lyon...', required: true }],
  });

const signed = (v: number) => `${v > 0 ? '+' : ''}${formatCurrency(v)}`;

export const scenariosView: View = {
  mount(ctx) {
    const { store, ui } = ctx;
    const current = () => store.get().scenarios.find((x) => x.id === ui.scenarioId);

    on('btn-add-scenario', 'click', async () => {
      const v = await askName('Nouveau scénario');
      if (!v) return;
      const id = Date.now();
      store.update((s) => s.scenarios.push({ id, name: String(v.name), changes: {} }));
      ui.scenarioId = id;
      store.refresh();
    });

    byId('scenarios-tabs')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!btn) return;
      ui.scenarioId = Number(btn.dataset.id);
      store.refresh();
    });

    on('btn-rename-scenario', 'click', async () => {
      const sc = current();
      if (!sc) return;
      const v = await askName('Renommer le scénario', sc.name);
      if (v) store.update(() => { sc.name = String(v.name); });
    });

    on('btn-reset-scenario', 'click', () => {
      const sc = current();
      if (sc) store.update(() => { sc.changes = {}; });
    });

    on('btn-del-scenario', 'click', async () => {
      const sc = current();
      if (!sc || !(await confirmDialog(`Supprimer le scénario « ${sc.name} » ?`))) return;
      store.update((s) => { s.scenarios = s.scenarios.filter((x) => x.id !== sc.id); });
      ui.scenarioId = null;
      store.refresh();
    });

    on('btn-apply-scenario', 'click', async () => {
      const sc = current();
      if (!sc) return;
      const n = Object.keys(sc.changes).length;
      if (!n) return showToast('Ce scénario ne change rien au budget', false);
      if (!(await confirmDialog(`Remplacer ${n} montant(s) du budget de base par ceux de « ${sc.name} » ?`))) return;
      store.update((s) => {
        for (const [k, v] of Object.entries(sc.changes)) if (SCENARIO_KEYS.includes(k as NumericKey) && typeof v === 'number') s[k as NumericKey] = v;
        sc.changes = {};
      });
      syncInputs(store.get(), ui, true);
      showToast('Scénario appliqué au budget');
    });

    byId('scenario-fields')?.addEventListener('input', (e) => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('.inp-scenario');
      const sc = current();
      if (!input || !sc) return;
      const key = input.dataset.key as NumericKey;
      store.update((s) => {
        const v = parseFloat(input.value);
        if (input.value === '' || !Number.isFinite(v) || v === s[key]) delete sc.changes[key];
        else sc.changes[key] = v;
      });
    });
  },

  render(s, _t, { ui }) {
    if (ui.scenarioId !== null && !s.scenarios.some((x) => x.id === ui.scenarioId)) ui.scenarioId = null;
    if (ui.scenarioId === null && s.scenarios.length) ui.scenarioId = s.scenarios[0].id;
    const sc = s.scenarios.find((x) => x.id === ui.scenarioId);

    const tabs = byId('scenarios-tabs');
    if (tabs) {
      tabs.innerHTML = s.scenarios.map((x) => `
        <button data-id="${x.id}" class="px-3 py-1.5 text-xs font-semibold rounded-lg transition ${x.id === ui.scenarioId ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}">
          ${escapeHtml(x.name)}${Object.keys(x.changes).length ? ` <span class="opacity-70">(${Object.keys(x.changes).length})</span>` : ''}
        </button>`).join('');
    }
    byId('scenarios-empty')?.classList.toggle('hidden', !!sc);
    byId('scenario-editor')?.classList.toggle('hidden', !sc);
    if (!sc) return;
    setText('scenario-name', sc.name);

    const fields = byId('scenario-fields');
    if (fields && !fields.contains(document.activeElement)) {
      fields.innerHTML = SCENARIO_GROUPS.map((g) => `
        <div class="p-4 bg-slate-50 dark:bg-slate-700/20 rounded-2xl border border-slate-200 dark:border-slate-700">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">${g.title}</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            ${g.fields.map((f) => {
              const changed = f.key in sc.changes;
              return `
              <label class="flex items-center gap-2 text-xs">
                <span class="flex-1 min-w-0">${f.label}<span class="block text-[10px] text-slate-400">actuel : ${s[f.key]}</span></span>
                <input type="number" step="any" data-key="${f.key}" value="${changed ? sc.changes[f.key] : s[f.key]}"
                  class="inp-scenario w-24 p-1.5 text-right rounded-lg border font-bold ${changed ? 'border-amber-400 ring-2 ring-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800'}">
              </label>`;
            }).join('')}
          </div>
        </div>`).join('');
    } else if (fields) {
      // Pendant la frappe, seul l'encadré des champs modifiés suit.
      fields.querySelectorAll<HTMLInputElement>('.inp-scenario').forEach((el) => {
        const changed = (el.dataset.key as string) in sc.changes;
        el.classList.toggle('ring-2', changed);
        el.classList.toggle('ring-amber-300', changed);
        el.classList.toggle('border-amber-400', changed);
      });
    }

    const r = compareScenario(s, sc);
    const rows: [string, number, number, boolean][] = [
      ['Revenus', r.base.income, r.scenario.income, true],
      ['Dépenses prévues', r.base.expenses, r.scenario.expenses, false],
      ['Épargne & placements', r.base.invest, r.scenario.invest, true],
      ['Reste à vivre', r.base.net, r.scenario.net, true],
      ['Mis de côté par an', r.base.yearlySavings, r.scenario.yearlySavings, true],
      [`Capital dans ${r.years} ans`, r.base.projected, r.scenario.projected, true],
    ];
    const body = byId('scenario-compare');
    if (body) {
      body.innerHTML = rows.map(([label, a, b, higherIsBetter]) => {
        const d = b - a;
        const good = d === 0 ? 'text-slate-400' : (d > 0) === higherIsBetter ? 'text-emerald-600' : 'text-rose-600';
        return `<tr><td class="p-3 font-semibold">${label}</td><td class="p-3 text-right">${formatCurrency(a)}</td><td class="p-3 text-right font-bold">${formatCurrency(b)}</td><td class="p-3 text-right font-semibold ${good}">${d === 0 ? '=' : signed(d)}</td></tr>`;
      }).join('');
    }
  },
};

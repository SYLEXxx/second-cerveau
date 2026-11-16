import { computeActualsOverview } from '../domain/actuals';
import { migrate } from '../domain/migrations';
import { formatCurrency, todayIso } from '../domain/format';
import type { View } from './context';
import { showToast } from './dialogs';
import { on, setText } from './dom';
import { syncInputs } from './bindings';
const version = '0.5.0';
import { monthLabel } from './views/monthly';

// Éléments communs à tous les onglets : menu latéral (navigation, sauvegarde,
// thème), barre du mois en cours et raccourcis clavier.

const THEME_PREF = 'theme';
const TAB_PREF = 'lastTab';
// Le survol ne doit pas rendre le texte de l'onglet actif invisible (texte bleu sur fond bleu).
const ACTIVE_TAB = ['bg-brand-600', 'text-white', 'shadow-sm'];
const INACTIVE_TAB = ['text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-100', 'dark:hover:bg-slate-700/60'];
const JSON_FILTER = { name: 'Sauvegarde MonBudgetPro', extensions: ['json'] };

function showTab(name: string): void {
  const buttons = document.querySelectorAll<HTMLElement>('.tab-btn');
  if (![...buttons].some((b) => b.dataset.tab === name)) return;
  buttons.forEach((b) => {
    const active = b.dataset.tab === name;
    b.classList.remove(...(active ? INACTIVE_TAB : ACTIVE_TAB));
    b.classList.add(...(active ? ACTIVE_TAB : INACTIVE_TAB));
  });
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hidden'));
  document.getElementById(`tab-${name}`)?.classList.remove('hidden');
  document.getElementById('main-scroll')?.scrollTo(0, 0);
}

/** Échap ferme la fenêtre ouverte en « cliquant » sur son bouton Annuler. */
function closeOpenModal(): boolean {
  // La fenêtre du dessus (z-index le plus élevé) se ferme en premier ; l'écran de verrouillage n'a pas d'Annuler.
  const modal = [...document.querySelectorAll<HTMLElement>('.fixed.inset-0')]
    .filter((m) => !m.classList.contains('hidden') && m.id !== 'lock-screen')
    .sort((a, b) => Number(getComputedStyle(b).zIndex) - Number(getComputedStyle(a).zIndex))[0];
  const cancel = modal?.querySelector<HTMLElement>('[id$="-cancel"], [id$="-close"]');
  cancel?.click();
  return !!cancel;
}

const byIdClick = (id: string) => document.getElementById(id)?.click();

export const shellView: View = {
  mount({ store, platform, ui }) {
    setText('app-version', `· v${version}`);
    if (platform.getPref(THEME_PREF) === 'dark') document.documentElement.classList.add('dark');
    on('theme-toggle', 'click', () => {
      const dark = document.documentElement.classList.toggle('dark');
      platform.setPref(THEME_PREF, dark ? 'dark' : 'light');
      store.refresh();
    });

    on('export-json-btn', 'click', async () => {
      try {
        const saved = await platform.saveTextFile(`MonBudgetPro_Backup_${todayIso()}.json`, store.toJson(true), JSON_FILTER);
        if (saved) showToast('Sauvegarde exportée !');
      } catch {
        showToast("Échec de l'export", false);
      }
    });

    on('import-json-btn', 'click', async () => {
      try {
        const text = await platform.openTextFile(JSON_FILTER);
        if (text == null) return;
        const next = migrate(JSON.parse(text));
        store.replace(next);
        syncInputs(next, ui, true);
        showToast('Données importées avec succès !');
      } catch {
        showToast('Fichier de sauvegarde invalide', false);
      }
    });

    const goTo = (name: string) => {
      showTab(name);
      platform.setPref(TAB_PREF, name);
      // Les graphiques d'un onglet masqué n'ont pas de taille : on les redessine à l'affichage.
      store.refresh();
    };
    document.querySelectorAll<HTMLElement>('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => goTo(btn.dataset.tab!));
    });
    showTab(platform.getPref(TAB_PREF) ?? 'dashboard');

    // Saisie rapide : onglet Dépenses réelles, mois en cours, curseur dans le libellé.
    const quickAdd = () => {
      const month = new Date().getMonth();
      if (ui.selectedActualMonth !== month) {
        document.querySelector<HTMLElement>(`#actuals-month-tabs [data-month="${month}"]`)?.click();
      }
      goTo('actuals');
      const label = document.getElementById('input-actual-label') as HTMLInputElement | null;
      label?.scrollIntoView({ block: 'center' });
      label?.focus();
    };
    on('quick-add-expense', 'click', quickAdd);

    // Verrouiller : dernière sauvegarde (chiffrée) puis rechargement sur l'écran du mot de passe.
    const lock = async () => {
      if (!store.isProtected) return;
      await store.flush();
      location.reload();
    };
    on('lock-btn', 'click', () => void lock());

    const search = () => {
      goTo('actuals');
      const input = document.getElementById('filter-text') as HTMLInputElement | null;
      input?.scrollIntoView({ block: 'center' });
      input?.focus();
      input?.select();
    };

    document.addEventListener('keydown', (e) => {
      // Dans le second cerveau, le module budget n'écoute le clavier que lorsqu'il est affiché.
      if (document.getElementById('budget-root')?.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        if (closeOpenModal()) e.preventDefault();
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (!document.getElementById('lock-screen')?.classList.contains('hidden')) return;
      const tab = document.querySelector<HTMLElement>(`.tab-btn[data-key="${e.key}"]`);
      const actions: Record<string, () => void> = {
        s: () => byIdClick('export-json-btn'),
        o: () => byIdClick('import-json-btn'),
        n: quickAdd,
        f: search,
        l: () => void lock(),
      };
      const action = tab ? () => goTo(tab.dataset.tab!) : actions[e.key.toLowerCase()];
      if (!action) return;
      e.preventDefault();
      action();
    });
  },

  render(s, t) {
    const month = new Date().getMonth();
    const real = computeActualsOverview(t, s.actualExpenses[month] ?? []);
    setText('top-month', monthLabel(month));
    setText('top-income', formatCurrency(t.income));
    setText('top-expenses', formatCurrency(t.totalExpenses));
    setText('top-real', `${formatCurrency(real.real)} / ${formatCurrency(real.planned)}`);
    setText('top-real-pct', `${real.pct} %`);
    const bar = document.getElementById('top-real-bar');
    if (bar) {
      bar.style.width = `${real.pct}%`;
      bar.className = `h-1 rounded-full ${real.pct >= 100 ? 'bg-rose-500' : real.pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`;
    }
    setText('top-net', formatCurrency(t.netAvailable));
  },
};

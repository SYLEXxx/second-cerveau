// Point d'entrée du module budget : reprend src/main.ts de MonBudgetPro 0.5.0,
// mais monte l'interface dans un conteneur de l'application au lieu de la page entière.
import shellHtml from './shell.html?raw';
import dashboardHtml from './ui/views/dashboard.html?raw';
import monthlyHtml from './ui/views/monthly.html?raw';
import subscriptionsHtml from './ui/views/subscriptions.html?raw';
import actualsHtml from './ui/views/actuals.html?raw';
import investHtml from './ui/views/invest.html?raw';
import projectsHtml from './ui/views/projects.html?raw';
import annualHtml from './ui/views/annual.html?raw';
import archivesHtml from './ui/views/archives.html?raw';
import calendarHtml from './ui/views/calendar.html?raw';
import wealthHtml from './ui/views/wealth.html?raw';
import scenariosHtml from './ui/views/scenarios.html?raw';
import settingsHtml from './ui/views/settings.html?raw';

import { totalsForMonth } from './domain/months';
import { createBrowserPlatform } from './platform/browser';
import { Store } from './store';
import { bindInputs, syncInputs } from './ui/bindings';
import type { AppContext, View } from './ui/context';
import { shellView } from './ui/shell';
import { dashboardView } from './ui/views/dashboard';
import { monthlyView } from './ui/views/monthly';
import { subscriptionsView } from './ui/views/subscriptions';
import { actualsView } from './ui/views/actuals';
import { investView } from './ui/views/invest';
import { projectsView } from './ui/views/projects';
import { annualView } from './ui/views/annual';
import { archivesView } from './ui/views/archives';
import { calendarView } from './ui/views/calendar';
import { wealthView } from './ui/views/wealth';
import { scenariosView } from './ui/views/scenarios';
import { settingsView } from './ui/views/settings';
import { mountViewer } from './ui/attachments';
import { recordNetWorth } from './domain/wealth';
import { unlock, type VaultKey } from './domain/vault';
import type { BudgetState } from './domain/types';

const VIEW_TEMPLATES = [dashboardHtml, monthlyHtml, subscriptionsHtml, actualsHtml, investHtml, projectsHtml, annualHtml, archivesHtml, calendarHtml, wealthHtml, scenariosHtml, settingsHtml];

const VIEWS: View[] = [shellView, dashboardView, monthlyView, subscriptionsView, actualsView, investView, projectsView, annualView, archivesView, calendarView, wealthView, scenariosView, settingsView];

export interface BudgetHandle {
  store: Store;
  /** Redessine (après un changement de thème ou au retour sur l'onglet). */
  refresh(): void;
  /** Ouvre la saisie rapide d'une dépense du mois en cours. */
  quickAdd(): void;
  flush(): Promise<void>;
}

/** Écran de déverrouillage : attend le bon mot de passe pour ouvrir des données chiffrées. */
function askPassword(raw: string): Promise<{ text: string; vault: VaultKey }> {
  const screen = document.getElementById('lock-screen')!;
  const form = document.getElementById('form-unlock') as HTMLFormElement;
  const input = document.getElementById('unlock-password') as HTMLInputElement;
  const error = document.getElementById('unlock-error')!;
  const submit = document.getElementById('unlock-submit') as HTMLButtonElement;
  screen.classList.remove('hidden');
  input.focus();
  return new Promise((resolve) => {
    form.addEventListener('submit', async function onSubmit(e) {
      e.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Ouverture...';
      try {
        const opened = await unlock(raw, input.value);
        form.removeEventListener('submit', onSubmit);
        input.value = '';
        screen.classList.add('hidden');
        resolve(opened);
      } catch {
        error.classList.remove('hidden');
        input.select();
      } finally {
        submit.disabled = false;
        submit.textContent = 'Déverrouiller';
      }
    });
  });
}

let liveState: (() => BudgetState) | null = null;
/** État du budget déjà ouvert (null tant que le module n'a pas été affiché). */
export const liveBudgetState = (): BudgetState | null => liveState?.() ?? null;

export async function mountBudget(root: HTMLElement): Promise<BudgetHandle> {
  root.innerHTML = shellHtml;
  document.getElementById('views')!.innerHTML = VIEW_TEMPLATES.join('\n');

  const platform = createBrowserPlatform();
  const store = await Store.load(platform, askPassword);
  store.addHook((s) => void recordNetWorth(s));
  const ctx: AppContext = {
    store,
    platform,
    ui: { selectedActualMonth: new Date().getMonth(), plannerMonth: null, calendarMonth: new Date().getMonth(), scenarioId: null, filter: {}, filterAllMonths: false },
  };

  const render = () => {
    if (root.classList.contains('hidden')) return; // redessiné au retour sur l'onglet
    const state = store.get();
    const totals = totalsForMonth(state, new Date().getMonth());
    for (const v of VIEWS) {
      try {
        v.render(state, totals, ctx);
      } catch (e) {
        console.error("Erreur d'affichage", e);
      }
    }
  };

  VIEWS.forEach((v) => v.mount(ctx));
  mountViewer(ctx);
  if (recordNetWorth(store.get())) void store.flush();
  syncInputs(store.get(), ctx.ui, true);
  bindInputs(ctx);
  store.subscribe(render);
  render();
  platform.onBeforeExit(() => store.flush());
  liveState = () => store.get();

  return {
    store,
    refresh: () => store.refresh(),
    quickAdd: () => document.getElementById('quick-add-expense')?.click(),
    flush: () => store.flush(),
  };
}

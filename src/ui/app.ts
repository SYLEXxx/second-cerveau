import { loadVault, requestPersistence } from '../core/storage';
import { VaultStore } from '../core/store';
import { createPage, dailyNote, findByTitle } from '../core/vault';
import type { NewPage } from '../core/vault';
import type { BudgetHandle } from '../modules/budget';
import { isNative } from '../platform/files';
import { $$ } from './dom';
import { closeTopSheet } from './sheet';
import { applyTheme } from './theme';
import { homeView } from './views/home';
import { pagesView } from './views/pages';
import { pageView } from './views/page';
import { searchView } from './views/search';
import { graphView } from './views/graph';
import { settingsView } from './views/settings';
import { trashView } from './views/trash';

export interface Ctx {
  store: VaultStore;
  go(path: string, replace?: boolean): void;
  /** Crée une page puis l'ouvre (en édition si elle est vide). */
  newPage(init?: NewPage): void;
  openTitle(title: string): void;
  openDaily(): void;
  budget(): Promise<BudgetHandle>;
}

export interface Route {
  name: string;
  params: Record<string, string>;
}

/** Une vue dessine l'écran ; elle peut renvoyer une fonction de nettoyage. */
export type ViewFn = (ctx: Ctx, screen: HTMLElement, route: Route) => void | (() => void);

const VIEWS: Record<string, ViewFn> = {
  home: homeView,
  pages: pagesView,
  page: pageView,
  search: searchView,
  tag: searchView,
  graph: graphView,
  settings: settingsView,
  trash: trashView,
};

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params: Record<string, string> = Object.fromEntries(new URLSearchParams(query));
  switch (parts[0]) {
    case undefined:
      return { name: 'home', params };
    case 'p':
      return { name: 'page', params: { ...params, id: parts[1] ?? '' } };
    case 'tag':
      return { name: 'tag', params: { ...params, q: '#' + (parts[1] ?? '') } };
    default:
      return { name: parts[0], params };
  }
}

const NAV_OF: Record<string, string> = { home: 'home', pages: 'pages', page: 'pages', search: 'search', tag: 'search', graph: 'graph', budget: 'budget', settings: 'home', trash: 'pages' };

export async function startApp(): Promise<void> {
  applyTheme();
  const { state } = await loadVault();
  const store = new VaultStore(state);
  void store.flush();
  void requestPersistence();

  const screen = document.getElementById('screen')!;
  const budgetRoot = document.getElementById('budget-root')!;
  let cleanup: void | (() => void);
  let budgetPromise: Promise<BudgetHandle> | null = null;

  const ctx: Ctx = {
    store,
    go(path, replace = false) {
      const target = '#' + path;
      if (replace) location.replace(target);
      else location.hash = target;
    },
    newPage(init = {}) {
      let id = '';
      store.update((s) => {
        id = createPage(s, init).id;
      });
      ctx.go(`/p/${id}${init.content || init.kind === 'database' ? '' : '?edit=1'}`);
    },
    openTitle(title) {
      const found = findByTitle(store.get(), title);
      if (found) return ctx.go(`/p/${found.id}`);
      ctx.newPage({ title });
    },
    openDaily() {
      let id = '';
      store.update((s) => {
        id = dailyNote(s).id;
      });
      ctx.go(`/p/${id}?edit=1`);
    },
    budget() {
      budgetPromise ??= import('../modules/budget').then((m) => m.mountBudget(budgetRoot));
      return budgetPromise;
    },
  };

  const render = () => {
    const route = parseHash(location.hash);
    if (typeof cleanup === 'function') cleanup();
    cleanup = undefined;
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === NAV_OF[route.name]));

    if (route.name === 'budget') {
      screen.classList.add('hidden');
      budgetRoot.classList.remove('hidden');
      void ctx.budget().then((b) => {
        b.refresh();
        if (route.params.add) b.quickAdd();
      });
      return;
    }
    budgetRoot.classList.add('hidden');
    screen.classList.remove('hidden');
    const view = VIEWS[route.name] ?? homeView;
    // Conteneur neuf à chaque affichage : les écouteurs de l'écran précédent disparaissent avec lui.
    const host = document.createElement('div');
    screen.replaceChildren(host);
    try {
      cleanup = view(ctx, host, route);
    } catch (e) {
      console.error(e);
      screen.innerHTML = `<p class="p-6 text-rose-600">Erreur d'affichage : ${String(e)}</p>`;
    }
  };

  let lastRoute = '';
  window.addEventListener('hashchange', () => {
    const r = location.hash.split('?')[0];
    if (r !== lastRoute) screen.scrollTo(0, 0);
    lastRoute = r;
    render();
  });
  // Les vues qui ne se redessinent pas seules (éditeur en cours) passent par update(..., true).
  store.subscribe(() => {
    if (!budgetRoot.classList.contains('hidden')) return;
    const top = screen.scrollTop;
    render();
    screen.scrollTop = top;
  });
  render();

  // Dernière sauvegarde quand l'application passe en arrière-plan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void store.flush();
      void budgetPromise?.then((b) => b.flush());
    }
  });

  if (isNative()) {
    const { App } = await import('@capacitor/app');
    void App.addListener('backButton', ({ canGoBack }) => {
      if (closeTopSheet()) return;
      // Fenêtre ouverte du module budget : Échap la ferme.
      if (!budgetRoot.classList.contains('hidden')) {
        const open = [...budgetRoot.querySelectorAll<HTMLElement>('.fixed.inset-0')].some((m) => !m.classList.contains('hidden') && m.id !== 'lock-screen');
        if (open) return void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
      if (canGoBack && location.hash && location.hash !== '#/') history.back();
      else void App.exitApp();
    });
    void App.addListener('pause', () => {
      void store.flush();
      void budgetPromise?.then((b) => b.flush());
    });
  }
}

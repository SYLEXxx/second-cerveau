import type { ViewFn } from '../app';
import { importMarkdown, vaultToZip } from '../../core/exporter';
import { migrateVault } from '../../core/storage';
import { livePages } from '../../core/vault';
import { pickFiles, saveBlob, isNative } from '../../platform/files';
import { header } from '../components';
import { onAction } from '../dom';
import { confirmSheet, toast } from '../sheet';
import { getTheme, setTheme, type ThemePref } from '../theme';
import { todayIso } from '../../core/ids';

const BUDGET_KEY = 'monbudgetpro_data';
const VERSION = '0.1.0';

export const settingsView: ViewFn = (ctx, screen) => {
  const s = ctx.store.get();
  const theme = getTheme();
  const count = livePages(s).length;
  const row = (action: string, icon: string, label: string, hint = '') =>
    `<button data-action="${action}" class="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-100 dark:active:bg-slate-700/60">
      <i class="fa-solid ${icon} w-5 text-center text-violet-500"></i><span class="flex-1">${label}</span>${hint ? `<span class="text-xs text-slate-400">${hint}</span>` : ''}</button>`;

  screen.innerHTML = `${header('Réglages', { back: true })}
  <div class="max-w-2xl mx-auto px-4 pb-10 space-y-6">
    <section>
      <h2 class="section-title">Apparence</h2>
      <div class="card p-1.5 grid grid-cols-3 gap-1">
        ${(['light', 'dark', 'auto'] as ThemePref[])
          .map((t) => `<button data-action="theme" data-theme="${t}" class="py-2 rounded-xl text-sm font-semibold ${t === theme ? 'bg-violet-600 text-white' : 'text-slate-500'}">${{ light: '☀️ Clair', dark: '🌙 Sombre', auto: '⚙️ Auto' }[t]}</button>`)
          .join('')}
      </div>
    </section>
    <section>
      <h2 class="section-title">Sauvegarde complète (notes + budget)</h2>
      <div class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
        ${row('backup', 'fa-download', 'Exporter une sauvegarde', '.json')}
        ${row('restore', 'fa-upload', 'Restaurer une sauvegarde')}
      </div>
      <p class="text-xs text-slate-400 mt-2 px-1">Vos données restent sur ce téléphone. Exportez régulièrement une sauvegarde (Drive, e-mail…) pour ne rien perdre en changeant d'appareil.</p>
    </section>
    <section>
      <h2 class="section-title">Markdown / Obsidian</h2>
      <div class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
        ${row('export-md', 'fa-file-zipper', 'Exporter toutes les notes en .md', '.zip')}
        ${row('import-md', 'fa-file-import', 'Importer des fichiers .md')}
      </div>
    </section>
    <section>
      <h2 class="section-title">Données</h2>
      <div class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
        <a href="#/trash" class="w-full flex items-center gap-3 px-4 py-3.5"><i class="fa-solid fa-trash-can w-5 text-center text-violet-500"></i><span class="flex-1">Corbeille</span></a>
        ${row('budget', 'fa-wallet', 'Réglages du budget')}
      </div>
    </section>
    <p class="text-center text-xs text-slate-400">Second cerveau v${VERSION} · ${count} pages · ${isNative() ? 'application' : 'navigateur'}<br>Module budget : MonBudgetPro 0.5.0</p>
  </div>`;

  onAction(screen, {
    back: () => history.back(),
    theme: (b) => {
      setTheme(b.dataset.theme as ThemePref);
      ctx.store.update(() => {}, false);

    },
    backup: async () => {
      let budget: string | null = null;
      try {
        budget = localStorage.getItem(BUDGET_KEY);
      } catch {
        /* pas de budget */
      }
      const data = { app: 'second-cerveau', version: 1, exportedAt: new Date().toISOString(), vault: ctx.store.get(), budget };
      if (await saveBlob(`SecondCerveau_${todayIso()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }))) toast('Sauvegarde exportée');
    },
    restore: async () => {
      const [file] = await pickFiles('.json,application/json');
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const vault = migrateVault(data.vault ?? data);
        const pages = Object.keys(vault.pages).length;
        if (!(await confirmSheet(`Remplacer toutes les notes actuelles par cette sauvegarde (${pages} pages)${data.budget ? ' et le budget' : ''} ?`, 'Restaurer'))) return;
        ctx.store.replace(vault);
        await ctx.store.flush();
        if (typeof data.budget === 'string') {
          localStorage.setItem(BUDGET_KEY, data.budget);
          // Le module budget déjà ouvert garde l'ancien état en mémoire : on recharge.
          location.reload();
          return;
        }
        toast('Sauvegarde restaurée');
      } catch (e) {
        toast('Fichier de sauvegarde invalide', false);
        console.error(e);
      }
    },
    'export-md': async () => {
      if (await saveBlob(`SecondCerveau_markdown_${todayIso()}.zip`, new Blob([vaultToZip(ctx.store.get()) as BlobPart], { type: 'application/zip' }))) toast('Archive .zip prête');
    },
    'import-md': async () => {
      const files = await pickFiles('.md,.markdown,.txt,text/markdown,text/plain', true);
      if (!files.length) return;
      const list = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
      ctx.store.update((st) => void importMarkdown(st, list));
      toast(`${list.length} note${list.length > 1 ? 's' : ''} importée${list.length > 1 ? 's' : ''}`);
    },
    budget: () => {
      ctx.go('/budget');
      setTimeout(() => document.querySelector<HTMLElement>('#budget-root [data-tab="settings"]')?.click(), 300);
    },
  });
};

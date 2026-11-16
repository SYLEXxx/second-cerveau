import { uid, todayIso } from './ids';
import { normTitle, parseLinks, parseTags, renameLinks, snippetAround } from './links';
import { ROOT, type DbSchema, type Page, type PageKind, type VaultState } from './types';

// Opérations sur le coffre (pures : elles modifient l'état passé en argument).

export function emptyVault(): VaultState {
  return { version: 1, pages: {}, order: { [ROOT]: [] } };
}

export const alive = (p: Page | undefined): p is Page => !!p && !p.trashedAt;

export function livePages(s: VaultState): Page[] {
  return Object.values(s.pages).filter(alive);
}

export function isDbRow(s: VaultState, p: Page): boolean {
  return !!p.parentId && s.pages[p.parentId]?.kind === 'database';
}

export function defaultSchema(): DbSchema {
  const status = uid();
  const table = uid();
  return {
    props: [
      {
        id: status,
        name: 'Statut',
        type: 'select',
        options: [
          { id: uid(), name: 'À faire', color: 'rose' },
          { id: uid(), name: 'En cours', color: 'amber' },
          { id: uid(), name: 'Fait', color: 'emerald' },
        ],
      },
      { id: uid(), name: 'Date', type: 'date' },
    ],
    views: [
      { id: table, name: 'Tableau', type: 'table' },
      { id: uid(), name: 'Kanban', type: 'board', groupBy: status },
      { id: uid(), name: 'Liste', type: 'list' },
    ],
    activeView: table,
  };
}

export interface NewPage {
  title?: string;
  kind?: PageKind;
  parentId?: string | null;
  content?: string;
  icon?: string;
  props?: Page['props'];
  schema?: DbSchema;
}

export function createPage(s: VaultState, init: NewPage = {}): Page {
  const now = Date.now();
  const kind = init.kind ?? 'page';
  const page: Page = {
    id: uid(),
    kind,
    title: init.title ?? '',
    icon: init.icon ?? (kind === 'database' ? '🗂️' : ''),
    parentId: init.parentId ?? null,
    content: init.content ?? '',
    props: init.props ?? {},
    schema: kind === 'database' ? init.schema ?? defaultSchema() : undefined,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
  s.pages[page.id] = page;
  const key = page.parentId ?? ROOT;
  (s.order[key] ??= []).push(page.id);
  return page;
}

export function children(s: VaultState, parentId: string | null): Page[] {
  const key = parentId ?? ROOT;
  const ids = s.order[key] ?? [];
  const listed = ids.map((id) => s.pages[id]).filter((p): p is Page => alive(p) && (p.parentId ?? ROOT) === key);
  // Filet de sécurité : une page absente de l'ordre apparaît quand même, à la fin.
  const extra = livePages(s).filter((p) => (p.parentId ?? ROOT) === key && !ids.includes(p.id));
  return [...listed, ...extra];
}

export function ancestors(s: VaultState, id: string): Page[] {
  const out: Page[] = [];
  let p = s.pages[id];
  const seen = new Set<string>();
  while (p?.parentId && !seen.has(p.parentId)) {
    seen.add(p.parentId);
    p = s.pages[p.parentId];
    if (p) out.unshift(p);
  }
  return out;
}

export function descendants(s: VaultState, id: string): Page[] {
  const out: Page[] = [];
  const walk = (pid: string) => {
    for (const p of Object.values(s.pages)) {
      if (p.parentId === pid) {
        out.push(p);
        walk(p.id);
      }
    }
  };
  walk(id);
  return out;
}

export function displayTitle(p: Page | undefined): string {
  return p?.title.trim() || 'Sans titre';
}

/** Recherche d'une page par titre (insensible à la casse), pour résoudre [[liens]]. */
export function findByTitle(s: VaultState, title: string): Page | undefined {
  const t = normTitle(title);
  const live = livePages(s);
  return live.find((p) => normTitle(p.title) === t);
}

export function movePage(s: VaultState, id: string, newParent: string | null): boolean {
  const p = s.pages[id];
  if (!p) return false;
  if (newParent === id || (newParent && ancestors(s, newParent).some((a) => a.id === id))) return false;
  const oldKey = p.parentId ?? ROOT;
  s.order[oldKey] = (s.order[oldKey] ?? []).filter((x) => x !== id);
  p.parentId = newParent;
  (s.order[newParent ?? ROOT] ??= []).push(id);
  p.updatedAt = Date.now();
  return true;
}

export function trashPage(s: VaultState, id: string): void {
  const now = Date.now();
  for (const p of [s.pages[id], ...descendants(s, id)]) if (p && !p.trashedAt) p.trashedAt = now;
}

export function restorePage(s: VaultState, id: string): void {
  const p = s.pages[id];
  if (!p) return;
  const when = p.trashedAt;
  for (const d of [p, ...descendants(s, id)]) if (d.trashedAt === when) delete d.trashedAt;
  // Parent toujours à la corbeille : la page revient à la racine.
  if (p.parentId && !alive(s.pages[p.parentId])) movePage(s, id, null);
}

export function deleteForever(s: VaultState, id: string): void {
  for (const p of [...descendants(s, id), s.pages[id]]) {
    if (!p) continue;
    delete s.pages[p.id];
    delete s.order[p.id];
    const key = p.parentId ?? ROOT;
    if (s.order[key]) s.order[key] = s.order[key].filter((x) => x !== p.id);
  }
}

/** Renomme une page et met à jour les [[liens]] qui la visent dans tout le coffre. */
export function renamePage(s: VaultState, id: string, title: string): number {
  const p = s.pages[id];
  if (!p) return 0;
  const old = p.title.trim();
  p.title = title;
  p.updatedAt = Date.now();
  if (!old || normTitle(old) === normTitle(title) || !title.trim()) return 0;
  let changed = 0;
  for (const other of Object.values(s.pages)) {
    const next = renameLinks(other.content, old, title.trim());
    if (next !== other.content) {
      other.content = next;
      changed++;
    }
  }
  return changed;
}

export interface Backlink {
  page: Page;
  snippet: string;
}

export function backlinks(s: VaultState, id: string): Backlink[] {
  const target = s.pages[id];
  if (!target?.title.trim()) return [];
  const t = normTitle(target.title);
  return livePages(s)
    .filter((p) => p.id !== id && parseLinks(p.content).some((l) => normTitle(l.target) === t))
    .map((page) => ({ page, snippet: snippetAround(page.content, `[[${target.title.trim()}`) }));
}

/** Toutes les étiquettes avec leur nombre de pages. */
export function allTags(s: VaultState): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of livePages(s)) for (const t of parseTags(p.content)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export interface SearchHit {
  page: Page;
  snippet: string;
  score: number;
}

export function search(s: VaultState, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (q.startsWith('#') && q.length > 1) {
    const tag = q.slice(1);
    return livePages(s)
      .filter((p) => parseTags(p.content).some((t) => t === tag || t.startsWith(tag + '/')))
      .map((page) => ({ page, snippet: snippetAround(page.content, '#' + tag), score: 1 }))
      .sort((a, b) => b.page.updatedAt - a.page.updatedAt);
  }
  const words = q.split(/\s+/);
  const hits: SearchHit[] = [];
  for (const page of livePages(s)) {
    const title = page.title.toLowerCase();
    const body = page.content.toLowerCase();
    const propsText = Object.values(page.props).flat().join(' ').toLowerCase();
    if (!words.every((w) => title.includes(w) || body.includes(w) || propsText.includes(w))) continue;
    const score = (title === q ? 100 : 0) + (title.startsWith(q) ? 30 : 0) + words.filter((w) => title.includes(w)).length * 10 + (body.includes(q) ? 3 : 0);
    hits.push({ page, snippet: snippetAround(page.content, words[0]), score });
  }
  return hits.sort((a, b) => b.score - a.score || b.page.updatedAt - a.page.updatedAt);
}

export const JOURNAL_TITLE = 'Journal';

/** Note du jour (Obsidian) rangée sous la page « Journal », créée au besoin. */
export function dailyNote(s: VaultState, date = new Date()): Page {
  const title = todayIso(date);
  const existing = findByTitle(s, title);
  if (existing) return existing;
  const journal = findByTitle(s, JOURNAL_TITLE) ?? createPage(s, { title: JOURNAL_TITLE, icon: '📓', content: 'Une note par jour. Elles sont créées depuis l\'accueil.\n' });
  const label = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return createPage(s, {
    title,
    icon: '📅',
    parentId: journal.id,
    content: `*${label}*\n\n## Tâches\n- [ ] \n\n## Notes\n\n`,
  });
}

export function recent(s: VaultState, n = 8): Page[] {
  return livePages(s)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, n);
}

/** Coche/décoche la n-ième case à cocher markdown du texte (hors blocs de code). */
export function toggleTask(md: string, index: number): string {
  const lines = md.split('\n');
  let inCode = false;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) inCode = !inCode;
    if (inCode) continue;
    const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\].*)$/.exec(lines[i]);
    if (!m) continue;
    if (n === index) {
      lines[i] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3];
      return lines.join('\n');
    }
    n++;
  }
  return md;
}

/** Contenu de démarrage : explique l'application par l'exemple. */
export function seedVault(s: VaultState): void {
  const welcome = createPage(s, {
    title: 'Bienvenue',
    icon: '👋',
    content: `Ce carnet mélange **Notion** (pages imbriquées, bases de données) et **Obsidian** (markdown, [[Liens et graphe|liens wiki]], rétroliens, graphe).

> [!tip] Astuce
> Touchez **Modifier** pour écrire. Tapez \`[[\` pour lier une page, \`/\` en début de ligne pour insérer un bloc, \`#\` pour une étiquette.

## Pour commencer
- [ ] Lire [[Liens et graphe]]
- [ ] Ouvrir la base [[Projets]]
- [ ] Créer la note du jour depuis l'accueil
- [ ] Ouvrir le module **Budget** (onglet en bas)

## Votre budget, dans une note
Le bloc ci-dessous affiche le mois en cours de MonBudgetPro :

\`\`\`budget
\`\`\`

#démarrage
`,
  });
  createPage(s, {
    title: 'Liens et graphe',
    icon: '🕸️',
    parentId: welcome.id,
    content: `Écrivez \`[[Nom d'une page]]\` pour créer un lien. Si la page n'existe pas, touchez le lien pour la créer.

- Chaque page liste en bas ses **rétroliens** : les pages qui pointent vers elle.
- L'onglet **Graphe** montre toutes les pages et leurs liens. Touchez un point pour ouvrir la page.
- Les étiquettes comme #idée ou #lecture/livres regroupent les notes.
- Renommer une page met à jour tous les liens qui la visent.

Retour à [[Bienvenue]].
`,
  });
  const db = createPage(s, { title: 'Projets', kind: 'database', content: 'Une base de données façon Notion : chaque ligne est une page.' });
  const statusProp = db.schema!.props[0];
  const [todo, doing, done] = statusProp.options!;
  const dateProp = db.schema!.props[1];
  const rows: Array<[string, string, string, string]> = [
    ['Organiser mes notes', '🗃️', doing.name, todayIso()],
    ['Préparer le budget des vacances', '🏖️', todo.name, ''],
    ['Installer l\'application sur mon téléphone', '📱', done.name, todayIso()],
  ];
  for (const [title, icon, status, date] of rows) {
    createPage(s, {
      title,
      icon,
      parentId: db.id,
      props: { [statusProp.id]: status, [dateProp.id]: date || null },
      content: title.includes('budget') ? 'Voir le module Budget, onglet *Projets & dettes*.\n\nLié à [[Bienvenue]].' : '',
    });
  }
}

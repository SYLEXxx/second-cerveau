import { describe, expect, it } from 'vitest';
import { parseLinks, parseTags, renameLinks } from '../../src/core/links';
import { allTags, backlinks, createPage, dailyNote, deleteForever, emptyVault, findByTitle, movePage, renamePage, restorePage, search, seedVault, toggleTask, trashPage, children } from '../../src/core/vault';
import { addProp, boardColumns, changePropType, ensureOption, toCsv, viewRows } from '../../src/core/db';
import { vaultToFiles, importMarkdown } from '../../src/core/exporter';
import { buildGraph, tick } from '../../src/core/graph';
import { migrateVault } from '../../src/core/storage';

describe('liens wiki et étiquettes', () => {
  it('trouve liens, alias, intégrations et ignore le code', () => {
    const md = 'Voir [[Projet A]] et [[Projet B|le B]], ![[Base]]\n```\n[[Pas un lien]]\n```\n`[[non]]`';
    expect(parseLinks(md)).toEqual([
      { target: 'Projet A', alias: undefined, embed: false },
      { target: 'Projet B', alias: 'le B', embed: false },
      { target: 'Base', alias: undefined, embed: true },
    ]);
  });
  it('trouve les étiquettes mais pas les titres ni les ancres', () => {
    expect(parseTags('# Titre\n#idée et #lecture/livres, pas#ça ni #123')).toEqual(['idée', 'lecture/livres']);
  });
  it('renomme les liens en gardant alias et section', () => {
    expect(renameLinks('[[vieux]] [[Vieux|alias]] [[Vieux#Partie]] [[Vieux2]]', 'Vieux', 'Neuf')).toBe('[[Neuf]] [[Neuf|alias]] [[Neuf#Partie]] [[Vieux2]]');
  });
});

describe('coffre', () => {
  it('rétroliens, renommage et recherche', () => {
    const s = emptyVault();
    const a = createPage(s, { title: 'Alpha', content: 'Lien vers [[Beta]] #test' });
    const b = createPage(s, { title: 'Beta', content: 'rien' });
    expect(backlinks(s, b.id).map((x) => x.page.id)).toEqual([a.id]);
    expect(renamePage(s, b.id, 'Gamma')).toBe(1);
    expect(a.content).toContain('[[Gamma]]');
    expect(search(s, 'gam')[0].page.id).toBe(b.id);
    expect(search(s, '#test')[0].page.id).toBe(a.id);
    expect(allTags(s)).toEqual([{ tag: 'test', count: 1 }]);
  });
  it('corbeille, restauration et suppression définitive', () => {
    const s = emptyVault();
    const p = createPage(s, { title: 'Parent' });
    const c = createPage(s, { title: 'Enfant', parentId: p.id });
    trashPage(s, p.id);
    expect(c.trashedAt).toBeTruthy();
    expect(findByTitle(s, 'Enfant')).toBeUndefined();
    restorePage(s, p.id);
    expect(c.trashedAt).toBeUndefined();
    deleteForever(s, p.id);
    expect(Object.keys(s.pages)).toHaveLength(0);
  });
  it('refuse de déplacer une page dans sa propre descendance', () => {
    const s = emptyVault();
    const p = createPage(s, { title: 'P' });
    const c = createPage(s, { title: 'C', parentId: p.id });
    expect(movePage(s, p.id, c.id)).toBe(false);
    expect(movePage(s, c.id, null)).toBe(true);
    expect(children(s, null).map((x) => x.title)).toEqual(['P', 'C']);
  });
  it('note du jour unique, rangée dans Journal', () => {
    const s = emptyVault();
    const d = new Date(2026, 10, 16);
    const n1 = dailyNote(s, d);
    const n2 = dailyNote(s, d);
    expect(n1.id).toBe(n2.id);
    expect(n1.title).toBe('2026-11-16');
    expect(s.pages[n1.parentId!].title).toBe('Journal');
  });
  it('coche la bonne case en ignorant le code', () => {
    const md = '- [ ] a\n```\n- [ ] code\n```\n- [x] b\n1. [ ] c';
    expect(toggleTask(md, 1)).toBe('- [ ] a\n```\n- [ ] code\n```\n- [ ] b\n1. [ ] c');
    expect(toggleTask(md, 2)).toContain('1. [x] c');
  });
  it('contenu de démarrage cohérent et relu après sérialisation', () => {
    const s = emptyVault();
    seedVault(s);
    const again = migrateVault(JSON.parse(JSON.stringify(s)));
    expect(Object.keys(again.pages)).toHaveLength(Object.keys(s.pages).length);
    const welcome = findByTitle(again, 'Bienvenue')!;
    expect(backlinks(again, welcome.id).length).toBeGreaterThan(0);
  });
});

describe('bases de données', () => {
  it('filtre, trie, regroupe et exporte', () => {
    const s = emptyVault();
    const db = createPage(s, { title: 'Livres', kind: 'database' });
    const status = db.schema!.props[0];
    const note = addProp(db.schema!, 'Note', 'number');
    createPage(s, { title: 'Dune', parentId: db.id, props: { [status.id]: 'Fait', [note.id]: 5 } });
    createPage(s, { title: 'Fondation', parentId: db.id, props: { [status.id]: 'À faire', [note.id]: 4 } });
    createPage(s, { title: 'Hypérion', parentId: db.id, props: {} });
    const view = { id: 'v', name: 'T', type: 'table' as const, sort: { prop: note.id, dir: 'desc' as const } };
    expect(viewRows(s, db, view).map((r) => r.title)).toEqual(['Dune', 'Fondation', 'Hypérion']);
    expect(viewRows(s, db, { ...view, query: 'fond' }).map((r) => r.title)).toEqual(['Fondation']);
    const cols = boardColumns(s, db, { id: 'b', name: 'K', type: 'board', groupBy: status.id });
    expect(cols.map((c) => [c.label, c.rows.length])).toEqual([['Sans statut', 1], ['À faire', 1], ['En cours', 0], ['Fait', 1]]);
    expect(toCsv(s, db).split('\n')[1]).toBe('Dune;Fait;;5');
  });
  it('convertit les valeurs quand le type change', () => {
    const s = emptyVault();
    const db = createPage(s, { title: 'B', kind: 'database' });
    const p = addProp(db.schema!, 'Tags', 'text');
    const r = createPage(s, { title: 'r', parentId: db.id, props: { [p.id]: 'a, b' } });
    changePropType(s, db, p, 'multi');
    expect(r.props[p.id]).toEqual(['a', 'b']);
    expect(p.options!.map((o) => o.name)).toEqual(['a', 'b']);
    expect(ensureOption(p, 'A').name).toBe('a');
  });
});

describe('markdown et graphe', () => {
  it('exporte un dossier compatible Obsidian et réimporte', () => {
    const s = emptyVault();
    seedVault(s);
    const files = vaultToFiles(s);
    expect(Object.keys(files)).toContain('Bienvenue/Bienvenue.md');
    expect(Object.keys(files)).toContain('Bienvenue/Liens et graphe.md');
    expect(files['Projets/Projets.md']).toContain('| Nom | Statut | Date |');
    const [p] = importMarkdown(s, [{ name: 'Idée.md', text: 'hello\r\nworld' }]);
    expect(p.title).toBe('Idée');
    expect(p.content).toBe('hello\nworld');
  });
  it('construit le graphe et la simulation reste finie', () => {
    const s = emptyVault();
    seedVault(s);
    const { nodes, edges } = buildGraph(s, { parents: true, tags: true, rows: true });
    expect(nodes.some((n) => n.kind === 'tag')).toBe(true);
    expect(edges.length).toBeGreaterThan(3);
    for (let i = 0; i < 200; i++) tick(nodes, edges, 1);
    expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });
});

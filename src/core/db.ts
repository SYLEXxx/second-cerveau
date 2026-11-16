import { COLORS, uid } from './ids';
import { children, displayTitle } from './vault';
import type { DbSchema, DbView, Page, PropDef, PropType, PropValue, SelectOption, VaultState } from './types';

// Bases de données façon Notion : schéma de propriétés, vues, filtres, tri, regroupement.

export const PROP_TYPES: Array<{ type: PropType; label: string; icon: string }> = [
  { type: 'text', label: 'Texte', icon: 'fa-align-left' },
  { type: 'number', label: 'Nombre', icon: 'fa-hashtag' },
  { type: 'select', label: 'Sélection', icon: 'fa-circle-chevron-down' },
  { type: 'multi', label: 'Multi-sélection', icon: 'fa-list-ul' },
  { type: 'date', label: 'Date', icon: 'fa-calendar' },
  { type: 'checkbox', label: 'Case à cocher', icon: 'fa-square-check' },
  { type: 'url', label: 'Lien web', icon: 'fa-link' },
];

export const propIcon = (t: PropType): string => PROP_TYPES.find((x) => x.type === t)?.icon ?? 'fa-align-left';

export function rows(s: VaultState, db: Page): Page[] {
  return children(s, db.id);
}

export function activeView(schema: DbSchema): DbView {
  return schema.views.find((v) => v.id === schema.activeView) ?? schema.views[0];
}

export function addProp(schema: DbSchema, name: string, type: PropType): PropDef {
  const def: PropDef = { id: uid(), name: name.trim() || 'Propriété', type };
  if (type === 'select' || type === 'multi') def.options = [];
  schema.props.push(def);
  return def;
}

export function removeProp(s: VaultState, db: Page, propId: string): void {
  const schema = db.schema!;
  schema.props = schema.props.filter((p) => p.id !== propId);
  for (const v of schema.views) {
    if (v.groupBy === propId) v.groupBy = undefined;
    if (v.sort?.prop === propId) v.sort = undefined;
  }
  for (const r of rows(s, db)) delete r.props[propId];
}

/** Change le type d'une propriété en convertissant au mieux les valeurs existantes. */
export function changePropType(s: VaultState, db: Page, prop: PropDef, type: PropType): void {
  const old = prop.type;
  prop.type = type;
  if ((type === 'select' || type === 'multi') && !prop.options) prop.options = [];
  for (const r of rows(s, db)) {
    const v = r.props[prop.id];
    if (v == null) continue;
    const text = Array.isArray(v) ? v.join(', ') : String(v);
    let next: PropValue = text;
    if (type === 'number') next = Number.isFinite(parseFloat(text)) ? parseFloat(text) : null;
    else if (type === 'checkbox') next = v === true || text === 'true' || text === 'oui';
    else if (type === 'multi') next = Array.isArray(v) ? v : text ? text.split(/\s*,\s*/) : [];
    else if (type === 'select') next = Array.isArray(v) ? v[0] ?? null : text;
    else if (old === 'checkbox') next = v ? 'oui' : '';
    if (type === 'select' || type === 'multi') for (const name of [next].flat()) if (typeof name === 'string' && name) ensureOption(prop, name);
    r.props[prop.id] = next;
  }
}

export function ensureOption(prop: PropDef, name: string): SelectOption {
  prop.options ??= [];
  const found = prop.options.find((o) => o.name.toLowerCase() === name.trim().toLowerCase());
  if (found) return found;
  const opt = { id: uid(), name: name.trim(), color: COLORS[prop.options.length % COLORS.length] };
  prop.options.push(opt);
  return opt;
}

export function optionColor(prop: PropDef, name: string): string {
  return prop.options?.find((o) => o.name === name)?.color ?? 'slate';
}

export function formatValue(prop: PropDef, v: PropValue | undefined): string {
  if (v == null || v === '') return '';
  switch (prop.type) {
    case 'checkbox':
      return v ? '✓' : '';
    case 'multi':
      return Array.isArray(v) ? v.join(', ') : String(v);
    case 'date': {
      const d = new Date(String(v) + 'T00:00:00');
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    case 'number':
      return typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v);
    default:
      return String(v);
  }
}

function sortKey(prop: PropDef | undefined, row: Page): string | number {
  if (!prop) return displayTitle(row).toLowerCase();
  const v = row.props[prop.id];
  if (v == null || v === '') return prop.type === 'number' ? Number.NEGATIVE_INFINITY : '';
  if (prop.type === 'number') return Number(v);
  if (prop.type === 'checkbox') return v ? 1 : 0;
  if (prop.type === 'select') {
    // Les sélections suivent l'ordre des options (À faire, En cours, Fait...).
    const i = prop.options?.findIndex((o) => o.name === v) ?? -1;
    return i < 0 ? 999 : i;
  }
  return (Array.isArray(v) ? v.join(',') : String(v)).toLowerCase();
}

/** Lignes visibles d'une vue : filtre texte puis tri. */
export function viewRows(s: VaultState, db: Page, view: DbView): Page[] {
  const schema = db.schema!;
  let list = rows(s, db);
  const q = view.query?.trim().toLowerCase();
  if (q) {
    list = list.filter((r) => {
      const text = [r.title, ...schema.props.map((p) => formatValue(p, r.props[p.id]))].join(' ').toLowerCase();
      return q.split(/\s+/).every((w) => text.includes(w));
    });
  }
  if (view.sort) {
    const prop = view.sort.prop === 'title' ? undefined : schema.props.find((p) => p.id === view.sort!.prop);
    const dir = view.sort.dir === 'desc' ? -1 : 1;
    list = [...list].sort((a, b) => {
      const ka = sortKey(prop, a);
      const kb = sortKey(prop, b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
    });
  }
  return list;
}

export interface BoardColumn {
  key: string | null;
  label: string;
  color: string;
  rows: Page[];
}

export function boardColumns(s: VaultState, db: Page, view: DbView): BoardColumn[] {
  const prop = db.schema!.props.find((p) => p.id === view.groupBy && p.type === 'select');
  const list = viewRows(s, db, view);
  if (!prop) return [{ key: null, label: 'Toutes', color: 'slate', rows: list }];
  const cols: BoardColumn[] = (prop.options ?? []).map((o) => ({ key: o.name, label: o.name, color: o.color, rows: [] }));
  const none: BoardColumn = { key: null, label: 'Sans ' + prop.name.toLowerCase(), color: 'slate', rows: [] };
  for (const r of list) {
    const v = r.props[prop.id];
    (cols.find((c) => c.key === v) ?? none).rows.push(r);
  }
  return none.rows.length ? [none, ...cols] : cols;
}

export function addView(schema: DbSchema, type: DbView['type']): DbView {
  const names = { table: 'Tableau', board: 'Kanban', list: 'Liste' };
  const v: DbView = { id: uid(), name: names[type], type };
  if (type === 'board') v.groupBy = schema.props.find((p) => p.type === 'select')?.id;
  schema.views.push(v);
  schema.activeView = v.id;
  return v;
}

/** Tableau CSV de la base (titre + propriétés), pour un export vers un tableur. */
export function toCsv(s: VaultState, db: Page): string {
  const props = db.schema!.props;
  const esc = (x: string) => (/[",;\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
  const lines = [['Nom', ...props.map((p) => p.name)].map(esc).join(';')];
  for (const r of rows(s, db)) lines.push([displayTitle(r), ...props.map((p) => formatValue(p, r.props[p.id]))].map(esc).join(';'));
  return lines.join('\n');
}

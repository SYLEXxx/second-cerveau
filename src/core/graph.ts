import type { VaultState } from './types';
import { displayTitle, findByTitle, livePages } from './vault';
import { parseLinks, parseTags } from './links';

// Graphe des notes façon Obsidian : nœuds = pages (et étiquettes), arêtes = liens.

export type NodeKind = 'page' | 'database' | 'canvas' | 'daily' | 'tag';

export interface GNode {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
}

export interface GEdge {
  a: number;
  b: number;
  kind: 'link' | 'parent' | 'tag';
}

export interface GraphOptions {
  parents: boolean;
  tags: boolean;
  rows: boolean;
}

export function buildGraph(s: VaultState, opts: GraphOptions): { nodes: GNode[]; edges: GEdge[] } {
  const pages = livePages(s).filter((p) => opts.rows || !(p.parentId && s.pages[p.parentId]?.kind === 'database'));
  const index = new Map<string, number>();
  const nodes: GNode[] = pages.map((p, i) => {
    index.set(p.id, i);
    const angle = i * 2.399963; // spirale de Vogel : départ régulier et déterministe
    const r = 30 * Math.sqrt(i + 1);
    return {
      id: p.id,
      label: (p.icon ? p.icon + ' ' : '') + displayTitle(p),
      kind: p.kind === 'database' ? 'database' : p.kind === 'canvas' ? 'canvas' : /^\d{4}-\d{2}-\d{2}$/.test(p.title.trim()) ? 'daily' : 'page',
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      degree: 0,
    };
  });
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number, kind: GEdge['kind']) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b, kind });
    nodes[a].degree++;
    nodes[b].degree++;
  };
  const tagIndex = new Map<string, number>();
  for (const p of pages) {
    const a = index.get(p.id)!;
    for (const l of parseLinks(p.content)) {
      const t = findByTitle(s, l.target);
      const b = t && index.get(t.id);
      if (b != null) add(a, b, 'link');
    }
    if (opts.parents && p.parentId && index.has(p.parentId)) add(a, index.get(p.parentId)!, 'parent');
    if (opts.tags) {
      for (const tag of parseTags(p.content)) {
        if (!tagIndex.has(tag)) {
          tagIndex.set(tag, nodes.length);
          const i = nodes.length;
          nodes.push({ id: 'tag:' + tag, label: '#' + tag, kind: 'tag', x: Math.cos(i * 2.4) * 30 * Math.sqrt(i + 1), y: Math.sin(i * 2.4) * 30 * Math.sqrt(i + 1), vx: 0, vy: 0, degree: 0 });
        }
        add(a, tagIndex.get(tag)!, 'tag');
      }
    }
  }
  return { nodes, edges };
}

/** Un pas de simulation de forces (répulsion, ressorts, gravité vers le centre). */
export function tick(nodes: GNode[], edges: GEdge[], alpha: number): void {
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        d2 = 0.25;
      }
      if (d2 > 250000) continue;
      const f = (1800 * alpha) / d2;
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }
  }
  for (const e of edges) {
    const a = nodes[e.a];
    const b = nodes[e.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const target = e.kind === 'link' ? 70 : 90;
    const f = ((d - target) / d) * 0.08 * alpha;
    a.vx += dx * f;
    a.vy += dy * f;
    b.vx -= dx * f;
    b.vy -= dy * f;
  }
  for (const node of nodes) {
    node.vx -= node.x * 0.004 * alpha;
    node.vy -= node.y * 0.004 * alpha;
    node.vx *= 0.6;
    node.vy *= 0.6;
    node.x += node.vx;
    node.y += node.vy;
  }
}

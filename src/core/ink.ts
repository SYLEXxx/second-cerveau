// Encre vectorielle pour les tableaux blancs manuscrits : chaque tracé garde ses points
// (x, y, pression) en coordonnées du monde, ce qui rend le tableau infini et zoomable sans perte.

export type InkTool = 'pen' | 'highlighter';
export type InkBackground = 'dots' | 'grid' | 'lines' | 'none';

export interface Stroke {
  id: string;
  tool: InkTool;
  color: string;
  /** Épaisseur de base, en unités du monde. */
  width: number;
  /** Points à plat : x0, y0, p0, x1, y1, p1… (p = pression 0..1). */
  pts: number[];
}

export interface InkData {
  strokes: Stroke[];
  bg: InkBackground;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const INK_COLORS = ['#1e293b', '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#facc15', '#ffffff'];

const boxCache = new WeakMap<Stroke, Box>();

export function strokeBox(s: Stroke): Box {
  let b = boxCache.get(s);
  if (b) return b;
  b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < s.pts.length; i += 3) {
    b.minX = Math.min(b.minX, s.pts[i]);
    b.maxX = Math.max(b.maxX, s.pts[i]);
    b.minY = Math.min(b.minY, s.pts[i + 1]);
    b.maxY = Math.max(b.maxY, s.pts[i + 1]);
  }
  const pad = s.width;
  b = { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
  boxCache.set(s, b);
  return b;
}

export function unionBox(strokes: Stroke[]): Box | null {
  if (!strokes.length) return null;
  return strokes.map(strokeBox).reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

export const boxesOverlap = (a: Box, b: Box) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** Largeur réelle d'un segment selon la pression (le stylet appuie plus = trait plus épais). */
export const pressureWidth = (s: Stroke, p: number) => (s.tool === 'highlighter' ? s.width : s.width * (0.35 + p * 1.3));

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Le point (x, y) touche-t-il le tracé, à `radius` près ? (gomme) */
export function hitStroke(s: Stroke, x: number, y: number, radius: number): boolean {
  const b = strokeBox(s);
  if (x < b.minX - radius || x > b.maxX + radius || y < b.minY - radius || y > b.maxY + radius) return false;
  const r = radius + s.width / 2;
  if (s.pts.length <= 3) return Math.hypot(s.pts[0] - x, s.pts[1] - y) <= r;
  for (let i = 3; i < s.pts.length; i += 3) {
    if (distToSegment(x, y, s.pts[i - 3], s.pts[i - 2], s.pts[i], s.pts[i + 1]) <= r) return true;
  }
  return false;
}

export function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Tracés entourés au lasso : au moins 60 % de leurs points dans le polygone. */
export function lassoSelect(strokes: Stroke[], poly: number[]): string[] {
  if (poly.length < 6) return [];
  return strokes
    .filter((s) => {
      let inside = 0;
      const n = s.pts.length / 3;
      for (let i = 0; i < s.pts.length; i += 3) if (pointInPolygon(s.pts[i], s.pts[i + 1], poly)) inside++;
      return inside / n >= 0.6;
    })
    .map((s) => s.id);
}

export function translateStroke(s: Stroke, dx: number, dy: number): Stroke {
  const pts = s.pts.slice();
  for (let i = 0; i < pts.length; i += 3) {
    pts[i] = round(pts[i] + dx);
    pts[i + 1] = round(pts[i + 1] + dy);
  }
  return { ...s, pts };
}

const round = (v: number) => Math.round(v * 10) / 10;

/**
 * Allège un tracé : retire les points trop proches du précédent (en unités du monde),
 * en gardant toujours le premier et le dernier.
 */
export function simplify(pts: number[], minDist: number): number[] {
  if (pts.length <= 6) return pts.map((v, i) => (i % 3 === 2 ? Math.round(v * 100) / 100 : round(v)));
  const out = [round(pts[0]), round(pts[1]), Math.round(pts[2] * 100) / 100];
  let lx = pts[0], ly = pts[1];
  for (let i = 3; i < pts.length - 3; i += 3) {
    if (Math.hypot(pts[i] - lx, pts[i + 1] - ly) < minDist) continue;
    out.push(round(pts[i]), round(pts[i + 1]), Math.round(pts[i + 2] * 100) / 100);
    lx = pts[i];
    ly = pts[i + 1];
  }
  const e = pts.length - 3;
  out.push(round(pts[e]), round(pts[e + 1]), Math.round(pts[e + 2] * 100) / 100);
  return out;
}

/** Chemin SVG lissé (courbes quadratiques passant par les milieux). */
function smoothPath(pts: number[]): string {
  const n = pts.length / 3;
  if (n === 1) return `M${pts[0]} ${pts[1]}l0.01 0`;
  if (n === 2) return `M${pts[0]} ${pts[1]}L${pts[3]} ${pts[4]}`;
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 3; i < pts.length - 3; i += 3) {
    const mx = round((pts[i] + pts[i + 3]) / 2);
    const my = round((pts[i + 1] + pts[i + 4]) / 2);
    d += `Q${pts[i]} ${pts[i + 1]} ${mx} ${my}`;
  }
  const e = pts.length - 3;
  return d + `L${pts[e]} ${pts[e + 1]}`;
}

function avgPressure(s: Stroke): number {
  let sum = 0;
  for (let i = 2; i < s.pts.length; i += 3) sum += s.pts[i];
  return sum / (s.pts.length / 3);
}

/** Dessin complet en SVG (aperçus dans les notes, export). */
export function inkToSvg(ink: InkData, opts: { padding?: number; background?: string; maxWidth?: number } = {}): string {
  const box = unionBox(ink.strokes);
  const pad = opts.padding ?? 20;
  if (!box) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120"></svg>`;
  const w = box.maxX - box.minX + pad * 2;
  const h = box.maxY - box.minY + pad * 2;
  const bg = opts.background ? `<rect x="${box.minX - pad}" y="${box.minY - pad}" width="${w}" height="${h}" fill="${opts.background}"/>` : '';
  const safe = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : '#1e293b');
  const paths = ink.strokes
    .map((s) => {
      const op = s.tool === 'highlighter' ? ' stroke-opacity="0.35"' : '';
      return `<path d="${smoothPath(s.pts)}" fill="none" stroke="${safe(s.color)}" stroke-width="${round(pressureWidth(s, avgPressure(s)))}" stroke-linecap="round" stroke-linejoin="round"${op}/>`;
    })
    .join('');
  const size = opts.maxWidth ? ` width="${Math.min(opts.maxWidth, w)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(box.minX - pad)} ${round(box.minY - pad)} ${round(w)} ${round(h)}"${size}>${bg}${paths}</svg>`;
}

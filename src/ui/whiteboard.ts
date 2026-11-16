import type { Page } from '../core/types';
import { INK_COLORS, boxesOverlap, hitStroke, inkToSvg, lassoSelect, pressureWidth, simplify, strokeBox, translateStroke, unionBox, type Box, type InkBackground, type InkTool, type Stroke } from '../core/ink';
import { renameLinks } from '../core/links';
import { uid } from '../core/ids';
import { displayTitle } from '../core/vault';
import { saveBlob } from '../platform/files';
import type { Ctx } from './app';
import { esc } from './dom';
import { confirmSheet, openMenu, toast } from './sheet';

// Tableau blanc infini pour la prise de notes manuscrite.
// Stylet : il dessine (avec la pression) ; les doigts déplacent et zooment (rejet de la paume).
// Sans stylet (téléphone), un doigt dessine et deux doigts déplacent / zooment.

type Tool = InkTool | 'eraser' | 'lasso' | 'hand';

interface ToolPrefs {
  tool: Tool;
  pen: { color: string; width: number };
  highlighter: { color: string; width: number };
  fingerDraw: boolean | null; // null = automatique (oui tant qu'aucun stylet n'a été vu)
  penSeen: boolean;
}

const PREFS_KEY = 'sc_ink_prefs';
const PEN_SIZES = [1.5, 3, 6];
const HL_SIZES = [12, 20, 32];
const HL_COLORS = ['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#fb923c'];

function loadPrefs(): ToolPrefs {
  const base: ToolPrefs = { tool: 'pen', pen: { color: INK_COLORS[0], width: 3 }, highlighter: { color: HL_COLORS[0], width: 20 }, fingerDraw: null, penSeen: false };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return base;
  }
}
function savePrefs(p: ToolPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignoré */
  }
}

interface Cam {
  x: number; // décalage écran du point (0,0) du monde
  y: number;
  z: number;
}

const TOOL_ICONS: Record<Tool, [string, string]> = {
  pen: ['fa-pen-nib', 'Stylo'],
  highlighter: ['fa-highlighter', 'Surligneur'],
  eraser: ['fa-eraser', 'Gomme'],
  lasso: ['fa-object-ungroup', 'Lasso'],
  hand: ['fa-hand', 'Déplacer'],
};

export function whiteboardView(ctx: Ctx, host: HTMLElement, page: Page): () => void {
  const ink = (page.ink ??= { strokes: [], bg: 'dots' });
  const prefs = loadPrefs();
  const camKey = 'sc_cam_' + page.id;
  let cam: Cam = { x: 0, y: 0, z: 1 };
  try {
    cam = { ...cam, ...JSON.parse(localStorage.getItem(camKey) ?? 'null') };
  } catch {
    /* vue par défaut */
  }

  document.body.classList.add('canvas-open');
  host.innerHTML = `
  <div class="wb fixed inset-0 z-30 flex flex-col select-none" style="background:var(--paper)">
    <header class="safe-top flex-shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 z-10">
      <div class="flex items-center gap-1 h-12 px-1.5">
        <button class="icon-btn" data-a="back" aria-label="Retour"><i class="fa-solid fa-arrow-left"></i></button>
        <input data-title class="flex-1 min-w-0 bg-transparent outline-none font-bold text-base" placeholder="Sans titre" value="${esc(page.title)}">
        <button class="icon-btn" data-a="undo" aria-label="Annuler"><i class="fa-solid fa-rotate-left"></i></button>
        <button class="icon-btn" data-a="redo" aria-label="Rétablir"><i class="fa-solid fa-rotate-right"></i></button>
        <button class="icon-btn" data-a="menu" aria-label="Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      </div>
    </header>
    <div data-stage class="relative flex-1 overflow-hidden touch-none">
      <canvas data-base class="absolute inset-0 w-full h-full"></canvas>
      <canvas data-live class="absolute inset-0 w-full h-full"></canvas>
      <div data-sel class="hidden absolute z-10 flex gap-1 p-1 rounded-xl bg-slate-900 text-white shadow-xl text-sm">
        <button data-a="sel-dup" class="px-3 py-2 rounded-lg active:bg-slate-700"><i class="fa-regular fa-copy"></i> Dupliquer</button>
        <button data-a="sel-color" class="px-3 py-2 rounded-lg active:bg-slate-700"><i class="fa-solid fa-palette"></i></button>
        <button data-a="sel-del" class="px-3 py-2 rounded-lg active:bg-slate-700 text-rose-300"><i class="fa-solid fa-trash"></i></button>
      </div>
      <button data-a="zoom" class="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-500"></button>
      <div class="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2" style="bottom:calc(env(safe-area-inset-bottom) + 14px)">
        <div data-pop class="hidden p-2 rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700"></div>
        <div data-bar class="flex items-center gap-0.5 p-1.5 rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700"></div>
      </div>
    </div>
  </div>`;

  const stage = host.querySelector<HTMLElement>('[data-stage]')!;
  const base = host.querySelector<HTMLCanvasElement>('[data-base]')!;
  const live = host.querySelector<HTMLCanvasElement>('[data-live]')!;
  const bg = base.getContext('2d')!;
  const lg = live.getContext('2d')!;
  const bar = host.querySelector<HTMLElement>('[data-bar]')!;
  const pop = host.querySelector<HTMLElement>('[data-pop]')!;
  const selBox = host.querySelector<HTMLElement>('[data-sel]')!;
  const zoomBtn = host.querySelector<HTMLElement>('[data-a=zoom]')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let W = 0;
  let H = 0;

  const dark = () => document.documentElement.classList.contains('dark');
  // Encre lisible dans les deux thèmes : le noir devient clair sur fond sombre (l'export garde le noir).
  const shown = (c: string) => (dark() ? (c === INK_COLORS[0] ? '#e2e8f0' : c === '#ffffff' ? '#0f172a' : c) : c);

  // ---------- historique ----------
  let strokes: Stroke[] = ink.strokes;
  const undo: Stroke[][] = [];
  const redo: Stroke[][] = [];
  const commit = (next: Stroke[]) => {
    undo.push(strokes);
    if (undo.length > 150) undo.shift();
    redo.length = 0;
    setStrokes(next);
  };
  const setStrokes = (next: Stroke[]) => {
    strokes = next;
    ctx.store.update(() => {
      ink.strokes = next;
      page.updatedAt = Date.now();
    }, true);
    updateButtons();
    drawBase();
  };

  // ---------- coordonnées ----------
  const toWorld = (sx: number, sy: number) => ({ x: (sx - cam.x) / cam.z, y: (sy - cam.y) / cam.z });
  const stageXY = (e: { clientX: number; clientY: number }) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const viewBox = (): Box => {
    const a = toWorld(0, 0);
    const b = toWorld(W, H);
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
  };
  let camTimer: ReturnType<typeof setTimeout> | undefined;
  const camChanged = () => {
    zoomBtn.textContent = `${Math.round(cam.z * 100)} %`;
    clearTimeout(camTimer);
    camTimer = setTimeout(() => {
      try {
        localStorage.setItem(camKey, JSON.stringify(cam));
      } catch {
        /* ignoré */
      }
    }, 300);
  };
  const zoomAt = (sx: number, sy: number, factor: number) => {
    const z = Math.min(8, Math.max(0.1, cam.z * factor));
    const w = toWorld(sx, sy);
    cam.z = z;
    cam.x = sx - w.x * z;
    cam.y = sy - w.y * z;
    camChanged();
  };

  // ---------- dessin ----------
  function drawBackground(g: CanvasRenderingContext2D): void {
    const style = getComputedStyle(host.firstElementChild!);
    g.fillStyle = style.getPropertyValue('--paper') || '#fff';
    g.fillRect(0, 0, W, H);
    if (ink.bg === 'none') return;
    let step = 32 * cam.z;
    while (step < 14) step *= 2;
    g.fillStyle = g.strokeStyle = dark() ? 'rgba(148,163,184,0.22)' : 'rgba(100,116,139,0.22)';
    g.lineWidth = 1;
    const sx = ((cam.x % step) + step) % step;
    const sy = ((cam.y % step) + step) % step;
    if (ink.bg === 'dots') {
      const r = Math.max(0.8, Math.min(1.6, cam.z));
      for (let x = sx; x < W; x += step) for (let y = sy; y < H; y += step) g.fillRect(x - r / 2, y - r / 2, r, r);
      return;
    }
    g.beginPath();
    if (ink.bg === 'grid') for (let x = sx; x < W; x += step) (g.moveTo(Math.round(x) + 0.5, 0), g.lineTo(Math.round(x) + 0.5, H));
    for (let y = sy; y < H; y += step) (g.moveTo(0, Math.round(y) + 0.5), g.lineTo(W, Math.round(y) + 0.5));
    g.stroke();
  }

  function drawStroke(g: CanvasRenderingContext2D, s: Stroke, dx = 0, dy = 0): void {
    const p = s.pts;
    const n = p.length / 3;
    g.strokeStyle = shown(s.color);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (s.tool === 'highlighter') {
      g.globalAlpha = 0.35;
      g.lineWidth = s.width;
      g.beginPath();
      g.moveTo(p[0] + dx, p[1] + dy);
      if (n === 1) g.lineTo(p[0] + dx + 0.01, p[1] + dy);
      for (let i = 3; i < p.length - 3; i += 3) g.quadraticCurveTo(p[i] + dx, p[i + 1] + dy, (p[i] + p[i + 3]) / 2 + dx, (p[i + 1] + p[i + 4]) / 2 + dy);
      if (n > 1) g.lineTo(p[p.length - 3] + dx, p[p.length - 2] + dy);
      g.stroke();
      g.globalAlpha = 1;
      return;
    }
    if (n === 1) {
      g.fillStyle = shown(s.color);
      g.beginPath();
      g.arc(p[0] + dx, p[1] + dy, pressureWidth(s, p[2]) / 2, 0, Math.PI * 2);
      g.fill();
      return;
    }
    // Segments lissés, chacun avec l'épaisseur de sa pression.
    let px = p[0];
    let py = p[1];
    for (let i = 3; i < p.length; i += 3) {
      const last = i >= p.length - 3;
      const ex = last ? p[i] : (p[i] + p[i + 3]) / 2;
      const ey = last ? p[i + 1] : (p[i + 1] + p[i + 4]) / 2;
      g.lineWidth = pressureWidth(s, (p[i - 1] + p[i + 2]) / 2);
      g.beginPath();
      g.moveTo(px + dx, py + dy);
      if (last) g.lineTo(ex + dx, ey + dy);
      else g.quadraticCurveTo(p[i] + dx, p[i + 1] + dy, ex + dx, ey + dy);
      g.stroke();
      px = ex;
      py = ey;
    }
  }

  let selected = new Set<string>();
  let moveOffset = { x: 0, y: 0 };
  let hidden = new Set<string>(); // tracés en cours de gommage

  function drawBase(): void {
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(bg);
    bg.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
    const vb = viewBox();
    for (const s of strokes) {
      if (hidden.has(s.id) || !boxesOverlap(strokeBox(s), vb)) continue;
      if (selected.has(s.id) && (moveOffset.x || moveOffset.y)) continue;
      drawStroke(bg, s);
    }
  }

  let current: Stroke | null = null;
  let lassoPts: number[] | null = null;
  function drawLive(): void {
    lg.setTransform(dpr, 0, 0, dpr, 0, 0);
    lg.clearRect(0, 0, W, H);
    lg.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
    if (current) drawStroke(lg, current);
    if (selected.size) {
      const sel = strokes.filter((s) => selected.has(s.id));
      if (moveOffset.x || moveOffset.y) sel.forEach((s) => drawStroke(lg, s, moveOffset.x, moveOffset.y));
      const b = unionBox(sel);
      if (b) {
        lg.setLineDash([6 / cam.z, 4 / cam.z]);
        lg.strokeStyle = '#7c3aed';
        lg.lineWidth = 1.5 / cam.z;
        lg.strokeRect(b.minX + moveOffset.x, b.minY + moveOffset.y, b.maxX - b.minX, b.maxY - b.minY);
        lg.setLineDash([]);
        const tl = { x: (b.minX + moveOffset.x) * cam.z + cam.x, y: (b.minY + moveOffset.y) * cam.z + cam.y };
        selBox.classList.remove('hidden');
        selBox.style.left = `${Math.max(8, Math.min(W - 260, tl.x))}px`;
        selBox.style.top = `${Math.max(8, tl.y - 52)}px`;
      }
    } else selBox.classList.add('hidden');
    if (lassoPts && lassoPts.length > 2) {
      lg.setLineDash([5 / cam.z, 5 / cam.z]);
      lg.strokeStyle = '#7c3aed';
      lg.lineWidth = 1.5 / cam.z;
      lg.fillStyle = 'rgba(124,58,237,0.06)';
      lg.beginPath();
      lg.moveTo(lassoPts[0], lassoPts[1]);
      for (let i = 2; i < lassoPts.length; i += 2) lg.lineTo(lassoPts[i], lassoPts[i + 1]);
      lg.closePath();
      lg.fill();
      lg.stroke();
      lg.setLineDash([]);
    }
  }

  let frame = 0;
  const schedule = (all = true) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (all) drawBase();
      drawLive();
    });
  };

  const resize = () => {
    const r = stage.getBoundingClientRect();
    W = r.width;
    H = r.height;
    for (const c of [base, live]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    drawBase();
    drawLive();
  };

  const fit = () => {
    const b = unionBox(strokes);
    if (!b) {
      cam = { x: W / 2, y: H / 3, z: 1 };
    } else {
      const z = Math.min(2, Math.max(0.1, Math.min((W - 60) / (b.maxX - b.minX), (H - 140) / (b.maxY - b.minY))));
      cam = { z, x: W / 2 - ((b.minX + b.maxX) / 2) * z, y: (H - 70) / 2 - ((b.minY + b.maxY) / 2) * z };
    }
    camChanged();
    schedule();
  };

  // ---------- barre d'outils ----------
  function renderBar(): void {
    const t = prefs.tool;
    const style = t === 'highlighter' ? prefs.highlighter : prefs.pen;
    const showStyle = t === 'pen' || t === 'highlighter';
    bar.innerHTML = `${(Object.keys(TOOL_ICONS) as Tool[])
      .map((k) => `<button data-tool="${k}" title="${TOOL_ICONS[k][1]}" aria-label="${TOOL_ICONS[k][1]}" class="w-11 h-11 rounded-xl ${k === t ? 'bg-violet-600 text-white' : 'text-slate-600 dark:text-slate-300'}"><i class="fa-solid ${TOOL_ICONS[k][0]}"></i></button>`)
      .join('')}
      ${showStyle ? `<span class="w-px h-7 bg-slate-200 dark:bg-slate-700 mx-1"></span>
      <button data-a="style" aria-label="Couleur et épaisseur" class="w-11 h-11 rounded-xl flex items-center justify-center">
        <span class="rounded-full border-2 border-slate-300 dark:border-slate-600" style="background:${shown(style.color)};width:${Math.min(26, 10 + style.width * (t === 'pen' ? 2.4 : 0.5))}px;height:${Math.min(26, 10 + style.width * (t === 'pen' ? 2.4 : 0.5))}px"></span>
      </button>` : ''}`;
  }

  function renderPop(): void {
    const t = prefs.tool === 'highlighter' ? 'highlighter' : 'pen';
    const style = prefs[t];
    const colors = t === 'pen' ? INK_COLORS : HL_COLORS;
    const sizes = t === 'pen' ? PEN_SIZES : HL_SIZES;
    pop.innerHTML = `<div class="flex gap-1.5 mb-2">${colors
      .map((c) => `<button data-color="${c}" aria-label="Couleur ${c}" class="w-8 h-8 rounded-full border-2 ${c === style.color ? 'border-violet-500 scale-110' : 'border-slate-200 dark:border-slate-600'}" style="background:${shown(c)}"></button>`)
      .join('')}</div>
      <div class="flex gap-1.5 justify-center">${sizes
        .map((w) => `<button data-size="${w}" aria-label="Épaisseur ${w}" class="w-12 h-9 rounded-lg flex items-center justify-center ${w === style.width ? 'bg-violet-100 dark:bg-violet-900/50' : ''}"><span class="rounded-full" style="background:${shown(style.color)};width:${Math.min(24, 4 + w * (t === 'pen' ? 2.2 : 0.6))}px;height:${Math.min(24, 4 + w * (t === 'pen' ? 2.2 : 0.6))}px"></span></button>`)
        .join('')}</div>`;
  }

  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.tool) {
      const tool = b.dataset.tool as Tool;
      if (tool === prefs.tool && (tool === 'pen' || tool === 'highlighter')) {
        pop.classList.toggle('hidden');
        renderPop();
        return;
      }
      prefs.tool = tool;
      if (tool !== 'lasso') clearSelection();
      pop.classList.add('hidden');
      savePrefs(prefs);
      renderBar();
    } else if (b.dataset.a === 'style') {
      pop.classList.toggle('hidden');
      renderPop();
    }
  });
  pop.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    const t = prefs.tool === 'highlighter' ? 'highlighter' : 'pen';
    if (b.dataset.color) prefs[t].color = b.dataset.color;
    if (b.dataset.size) prefs[t].width = Number(b.dataset.size);
    savePrefs(prefs);
    renderPop();
    renderBar();
  });

  const updateButtons = () => {
    host.querySelector<HTMLButtonElement>('[data-a=undo]')!.disabled = !undo.length;
    host.querySelector<HTMLButtonElement>('[data-a=redo]')!.disabled = !redo.length;
    host.querySelector('[data-a=undo]')!.classList.toggle('opacity-30', !undo.length);
    host.querySelector('[data-a=redo]')!.classList.toggle('opacity-30', !redo.length);
  };

  const clearSelection = () => {
    selected = new Set();
    moveOffset = { x: 0, y: 0 };
    schedule();
  };

  // ---------- gestes ----------
  type Mode = 'draw' | 'erase' | 'lasso' | 'move' | 'pan' | 'pinch' | null;
  let mode: Mode = null;
  let activeId: number | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let last = { x: 0, y: 0 };
  let pinch: { d: number; mx: number; my: number } | null = null;
  let erased: Stroke[] = [];
  let moveStart = { x: 0, y: 0 };

  const fingerDraws = () => (prefs.fingerDraw ?? !prefs.penSeen) && prefs.tool !== 'hand';

  const startTool = (e: PointerEvent, sx: number, sy: number, eraserButton: boolean) => {
    const w = toWorld(sx, sy);
    pop.classList.add('hidden');
    const tool = eraserButton ? 'eraser' : prefs.tool;
    if (tool === 'hand') {
      mode = 'pan';
      last = { x: sx, y: sy };
      return;
    }
    if (tool === 'eraser') {
      mode = 'erase';
      erased = [];
      eraseAt(w.x, w.y);
      return;
    }
    if (tool === 'lasso') {
      const b = unionBox(strokes.filter((s) => selected.has(s.id)));
      if (b && w.x >= b.minX && w.x <= b.maxX && w.y >= b.minY && w.y <= b.maxY) {
        mode = 'move';
        moveStart = w;
        return;
      }
      selected = new Set();
      mode = 'lasso';
      lassoPts = [w.x, w.y];
      schedule(false);
      return;
    }
    clearSelectionQuiet();
    mode = 'draw';
    const st = prefs[tool];
    current = { id: uid(), tool, color: st.color, width: st.width / Math.sqrt(cam.z), pts: [w.x, w.y, pressureOf(e)] };
    schedule(false);
  };
  const clearSelectionQuiet = () => {
    if (selected.size) {
      selected = new Set();
      moveOffset = { x: 0, y: 0 };
    }
  };

  const pressureOf = (e: PointerEvent) => (e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5);

  const eraseAt = (x: number, y: number) => {
    const r = 10 / cam.z;
    for (const s of strokes) {
      if (hidden.has(s.id)) continue;
      if (hitStroke(s, x, y, r)) {
        hidden.add(s.id);
        erased.push(s);
      }
    }
    if (erased.length) schedule();
  };

  const moveTool = (e: PointerEvent, sx: number, sy: number) => {
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = evs.length ? evs : [e];
    if (mode === 'draw' && current) {
      for (const ev of list) {
        const p = stageXY(ev);
        const w = toWorld(p.x, p.y);
        const n = current.pts.length;
        if (Math.hypot(current.pts[n - 3] - w.x, current.pts[n - 2] - w.y) < 0.6 / cam.z) continue;
        current.pts.push(w.x, w.y, pressureOf(ev));
      }
      schedule(false);
    } else if (mode === 'erase') {
      for (const ev of list) {
        const p = stageXY(ev);
        const w = toWorld(p.x, p.y);
        eraseAt(w.x, w.y);
      }
    } else if (mode === 'lasso' && lassoPts) {
      const w = toWorld(sx, sy);
      lassoPts.push(w.x, w.y);
      schedule(false);
    } else if (mode === 'move') {
      const w = toWorld(sx, sy);
      moveOffset = { x: w.x - moveStart.x, y: w.y - moveStart.y };
      schedule();
    } else if (mode === 'pan') {
      cam.x += sx - last.x;
      cam.y += sy - last.y;
      last = { x: sx, y: sy };
      camChanged();
      schedule();
    }
  };

  const endTool = () => {
    if (mode === 'draw' && current) {
      current.pts = simplify(current.pts, 0.8 / cam.z);
      current.width = Math.round(current.width * 100) / 100;
      const s = current;
      current = null;
      commit([...strokes, s]);
    } else if (mode === 'erase') {
      if (erased.length) {
        const gone = new Set(erased.map((s) => s.id));
        hidden = new Set();
        commit(strokes.filter((s) => !gone.has(s.id)));
      }
    } else if (mode === 'lasso' && lassoPts) {
      selected = new Set(lassoSelect(strokes, lassoPts));
      lassoPts = null;
    } else if (mode === 'move') {
      if (moveOffset.x || moveOffset.y) {
        const { x, y } = moveOffset;
        moveOffset = { x: 0, y: 0 };
        commit(strokes.map((s) => (selected.has(s.id) ? translateStroke(s, x, y) : s)));
      }
    }
    mode = null;
    activeId = null;
    schedule();
  };

  const cancelTool = () => {
    current = null;
    lassoPts = null;
    hidden = new Set();
    moveOffset = { x: 0, y: 0 };
    mode = null;
    activeId = null;
    schedule();
  };

  const startPinch = () => {
    const [a, b] = [...touches.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    mode = 'pinch';
  };

  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('[data-bar],[data-pop],[data-sel],[data-a]')) return;
    const p = stageXY(e);
    if (e.pointerType === 'pen') {
      if (!prefs.penSeen) {
        prefs.penSeen = true;
        savePrefs(prefs);
      }
      if (mode === 'pan' || mode === 'pinch') {
        touches.clear();
        pinch = null;
      } else if (mode) cancelTool();
      capture(e.pointerId);
      activeId = e.pointerId;
      // Bouton gomme du stylet (bout arrière ou bouton latéral configuré en gomme).
      startTool(e, p.x, p.y, e.button === 5 || (e.buttons & 32) === 32);
      return;
    }
    if (e.pointerType === 'touch') {
      if (activeId != null && mode !== 'pan' && mode !== 'pinch' && !fingerDrawingId(activeId)) return; // paume pendant que le stylet écrit
      touches.set(e.pointerId, p);
      capture(e.pointerId);
      if (touches.size === 2) {
        if (mode === 'draw' || mode === 'lasso' || mode === 'erase' || mode === 'move') cancelTool();
        startPinch();
        return;
      }
      if (touches.size > 2) return;
      if (fingerDraws()) {
        activeId = e.pointerId;
        startTool(e, p.x, p.y, false);
      } else {
        mode = 'pan';
        last = p;
      }
      return;
    }
    // Souris : bouton gauche = outil, autres boutons = déplacer.
    capture(e.pointerId);
    activeId = e.pointerId;
    if (e.button !== 0) {
      mode = 'pan';
      last = p;
      return;
    }
    startTool(e, p.x, p.y, false);
  });
  const fingerDrawingId = (id: number) => touches.has(id);
  function capture(id: number): void {
    try {
      stage.setPointerCapture(id);
    } catch {
      /* pointeur déjà relâché */
    }
  }

  stage.addEventListener('pointermove', (e) => {
    const p = stageXY(e);
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, p);
      if (mode === 'pinch' && pinch && touches.size >= 2) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        cam.x += mx - pinch.mx;
        cam.y += my - pinch.my;
        zoomAt(mx, my, d / pinch.d);
        pinch = { d, mx, my };
        schedule();
        return;
      }
      if (mode === 'pan') return moveTool(e, p.x, p.y);
    }
    if (e.pointerId === activeId) moveTool(e, p.x, p.y);
  });

  const up = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.delete(e.pointerId);
      if (mode === 'pinch') {
        if (touches.size < 2) {
          pinch = null;
          mode = touches.size === 1 ? 'pan' : null;
          if (mode === 'pan') last = [...touches.values()][0];
          schedule();
        }
        return;
      }
      if (mode === 'pan' && e.pointerId !== activeId) {
        if (!touches.size) mode = null;
        return;
      }
    }
    if (e.pointerId === activeId || (mode === 'pan' && !touches.size)) {
      if (e.type === 'pointercancel' && mode === 'draw') cancelTool();
      else endTool();
    }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = stageXY(e);
      if (e.ctrlKey || e.metaKey) zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.002));
      else {
        cam.x -= e.deltaX;
        cam.y -= e.deltaY;
        camChanged();
      }
      schedule();
    },
    { passive: false },
  );
  // Empêche le menu contextuel / la loupe d'iOS pendant l'écriture.
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  // ---------- actions ----------
  const titleEl = host.querySelector<HTMLInputElement>('[data-title]')!;
  let titleAtFocus = page.title;
  titleEl.addEventListener('focus', () => (titleAtFocus = page.title));
  titleEl.addEventListener('input', () => ctx.store.update(() => void ((page.title = titleEl.value), (page.updatedAt = Date.now())), true));
  titleEl.addEventListener('keydown', (e) => e.key === 'Enter' && titleEl.blur());
  titleEl.addEventListener('change', () => {
    const old = titleAtFocus.trim();
    const now = page.title.trim();
    if (!old || !now || old.toLowerCase() === now.toLowerCase()) return;
    ctx.store.update((st) => {
      for (const p of Object.values(st.pages)) p.content = renameLinks(p.content, old, now);
    }, true);
  });

  const exportPng = async () => {
    const b = unionBox(strokes);
    if (!b) return toast('Le tableau est vide', false);
    const scale = Math.min(3, 4000 / Math.max(b.maxX - b.minX, b.maxY - b.minY));
    const pad = 24;
    const c = document.createElement('canvas');
    c.width = Math.ceil((b.maxX - b.minX + pad * 2) * scale);
    c.height = Math.ceil((b.maxY - b.minY + pad * 2) * scale);
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.setTransform(scale, 0, 0, scale, (pad - b.minX) * scale, (pad - b.minY) * scale);
    const wasDark = dark();
    if (wasDark) document.documentElement.classList.remove('dark');
    strokes.forEach((s) => drawStroke(g, s));
    if (wasDark) document.documentElement.classList.add('dark');
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (blob && (await saveBlob(`${displayTitle(page)}.png`, blob))) toast('Image exportée');
  };

  host.addEventListener('click', async (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (!a) return;
    switch (a) {
      case 'back':
        return history.back();
      case 'undo':
        if (!undo.length) return;
        redo.push(strokes);
        selected = new Set();
        setStrokes(undo.pop()!);
        return;
      case 'redo':
        if (!redo.length) return;
        undo.push(strokes);
        setStrokes(redo.pop()!);
        return;
      case 'zoom':
        return openMenu('Vue', [
          { label: 'Tout afficher', icon: 'fa-expand', run: fit },
          { label: 'Zoom 100 %', icon: 'fa-magnifying-glass', run: () => (zoomAt(W / 2, H / 2, 1 / cam.z), schedule()) },
        ]);
      case 'sel-del': {
        const ids = selected;
        selected = new Set();
        return commit(strokes.filter((s) => !ids.has(s.id)));
      }
      case 'sel-dup': {
        const copies = strokes.filter((s) => selected.has(s.id)).map((s) => ({ ...translateStroke(s, 24, 24), id: uid() }));
        selected = new Set(copies.map((s) => s.id));
        return commit([...strokes, ...copies]);
      }
      case 'sel-color':
        return openMenu('Couleur de la sélection', INK_COLORS.map((c) => ({
          label: c,
          icon: 'fa-circle',
          run: () => commit(strokes.map((s) => (selected.has(s.id) && s.tool === 'pen' ? { ...s, color: c } : s))),
        })));
      case 'menu':
        return openMenu(displayTitle(page), [
          ...(['dots', 'grid', 'lines', 'none'] as InkBackground[]).map((b) => ({
            label: { dots: 'Fond à points', grid: 'Fond quadrillé', lines: 'Fond ligné', none: 'Fond uni' }[b],
            icon: b === ink.bg ? 'fa-circle-check' : 'fa-circle',
            run: () => {
              ctx.store.update(() => void (ink.bg = b), true);
              schedule();
            },
          })),
          { label: 'Tout afficher', icon: 'fa-expand', run: fit },
          {
            label: (prefs.fingerDraw ?? !prefs.penSeen) ? 'Le doigt dessine (toucher pour : le doigt déplace)' : 'Le doigt déplace (toucher pour : le doigt dessine)',
            icon: 'fa-hand-pointer',
            run: () => {
              prefs.fingerDraw = !(prefs.fingerDraw ?? !prefs.penSeen);
              savePrefs(prefs);
              toast(prefs.fingerDraw ? 'Le doigt dessine' : 'Le doigt déplace la vue');
            },
          },
          { label: 'Exporter en image PNG', icon: 'fa-image', run: () => void exportPng() },
          {
            label: 'Exporter en SVG',
            icon: 'fa-bezier-curve',
            run: async () => {
              const svg = inkToSvg({ ...ink, strokes }, { background: '#ffffff' });
              if (await saveBlob(`${displayTitle(page)}.svg`, new Blob([svg], { type: 'image/svg+xml' }))) toast('SVG exporté');
            },
          },
          {
            label: 'Tout effacer',
            icon: 'fa-trash',
            danger: true,
            run: async () => {
              if (strokes.length && (await confirmSheet('Effacer tout le tableau ? (Annuler reste possible)', 'Effacer'))) commit([]);
            },
          },
        ]);
    }
  });

  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  const ro = new ResizeObserver(onResize);
  ro.observe(stage);
  renderBar();
  updateButtons();
  camChanged();
  requestAnimationFrame(() => {
    resize();
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(camKey);
    } catch {
      /* ignoré */
    }
    if (!saved) fit();
  });

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', onResize);
    ro.disconnect();
    document.body.classList.remove('canvas-open');
  };
}

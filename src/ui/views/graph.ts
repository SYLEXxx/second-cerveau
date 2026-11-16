import type { ViewFn } from '../app';
import { buildGraph, tick, type GNode, type GraphOptions } from '../../core/graph';
import { esc } from '../dom';

const OPTS_KEY = 'sc_graph_opts';
const COLORS: Record<GNode['kind'], string> = { page: '#8b5cf6', database: '#f59e0b', canvas: '#ec4899', daily: '#0ea5e9', tag: '#10b981' };

function loadOpts(): GraphOptions {
  try {
    return { parents: true, tags: false, rows: true, ...JSON.parse(localStorage.getItem(OPTS_KEY) ?? '{}') };
  } catch {
    return { parents: true, tags: false, rows: true };
  }
}

export const graphView: ViewFn = (ctx, screen, route) => {
  const opts = loadOpts();
  screen.innerHTML = `<div class="relative h-full" style="height:calc(100dvh - 64px - env(safe-area-inset-bottom))">
    <canvas class="absolute inset-0 w-full h-full touch-none"></canvas>
    <div class="absolute top-0 left-0 right-0 safe-top pointer-events-none">
      <div class="flex items-center justify-between px-4 pt-3">
        <h1 class="text-lg font-bold pointer-events-auto">Graphe</h1>
        <div class="flex gap-1.5 pointer-events-auto text-xs">
          ${(
            [
              ['parents', 'Parents'],
              ['tags', 'Étiquettes'],
              ['rows', 'Lignes de base'],
            ] as const
          )
            .map(([k, l]) => `<button data-opt="${k}" class="px-2.5 py-1.5 rounded-full font-semibold ${opts[k] ? 'bg-violet-600 text-white' : 'bg-white/80 dark:bg-slate-800/80 text-slate-500 border border-slate-200 dark:border-slate-700'}">${l}</button>`)
            .join('')}
        </div>
      </div>
    </div>
    <div class="absolute left-4 bottom-4 flex gap-3 text-[11px] text-slate-500 pointer-events-none">
      <span><i class="fa-solid fa-circle" style="color:${COLORS.page}"></i> page</span>
      <span><i class="fa-solid fa-circle" style="color:${COLORS.database}"></i> base</span>
      <span><i class="fa-solid fa-circle" style="color:${COLORS.canvas}"></i> croquis</span>
      <span><i class="fa-solid fa-circle" style="color:${COLORS.daily}"></i> journal</span>
      ${opts.tags ? `<span><i class="fa-solid fa-circle" style="color:${COLORS.tag}"></i> étiquette</span>` : ''}
    </div>
    <button data-open class="hidden absolute right-4 bottom-4 max-w-[70%] px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold shadow-lg truncate"></button>
  </div>`;

  const canvas = screen.querySelector('canvas')!;
  const openBtn = screen.querySelector<HTMLButtonElement>('[data-open]')!;
  const g = canvas.getContext('2d')!;
  const { nodes, edges } = buildGraph(ctx.store.get(), opts);
  const neighbors = nodes.map(() => new Set<number>());
  edges.forEach((e) => {
    neighbors[e.a].add(e.b);
    neighbors[e.b].add(e.a);
  });

  let scale = 1;
  let ox = 0;
  let oy = 0;
  let selected = nodes.findIndex((n) => n.id === route.params.focus);
  let alpha = 1;
  let raf = 0;
  const dpr = window.devicePixelRatio || 1;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
  };
  resize();

  // Cadre tout le graphe à l'ouverture.
  const fit = () => {
    if (!nodes.length) return;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const bw = Math.max(...xs) - Math.min(...xs) + 160;
    const bh = Math.max(...ys) - Math.min(...ys) + 160;
    scale = Math.min(1.6, Math.max(0.25, Math.min(w / bw, (h - 120) / bh)));
    ox = (-(Math.max(...xs) + Math.min(...xs)) / 2) * scale;
    oy = (-(Math.max(...ys) + Math.min(...ys)) / 2) * scale + 10;
  };
  for (let a = 1; a > 0.02; a *= 0.985) tick(nodes, edges, a);
  fit();
  alpha = 0.05;

  const radius = (n: GNode) => 4 + Math.min(10, Math.sqrt(n.degree) * 2.2);
  const dark = () => document.documentElement.classList.contains('dark');

  const draw = () => {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.translate(w / 2 + ox, h / 2 + oy);
    g.scale(scale, scale);
    const hl = selected >= 0 ? neighbors[selected] : null;
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      const on = hl && (e.a === selected || e.b === selected);
      g.strokeStyle = on ? '#8b5cf6' : dark() ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.25)';
      g.lineWidth = (on ? 1.8 : 1) / scale;
      g.setLineDash(e.kind === 'parent' ? [4 / scale, 4 / scale] : []);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    g.setLineDash([]);
    nodes.forEach((n, i) => {
      const faded = hl && i !== selected && !hl.has(i);
      g.globalAlpha = faded ? 0.2 : 1;
      g.fillStyle = COLORS[n.kind];
      g.beginPath();
      g.arc(n.x, n.y, radius(n) * (i === selected ? 1.4 : 1), 0, Math.PI * 2);
      g.fill();
      if (scale > 0.7 || nodes.length <= 40 || n.degree > 3 || i === selected || (hl && hl.has(i))) {
        g.fillStyle = dark() ? '#e2e8f0' : '#334155';
        g.font = `${(i === selected ? 13 : 11) / Math.max(scale, 0.6)}px Inter, sans-serif`;
        g.textAlign = 'center';
        g.fillText(n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label, n.x, n.y + radius(n) + 12 / Math.max(scale, 0.6));
      }
    });
    g.globalAlpha = 1;
  };

  const loop = () => {
    if (alpha > 0.02) {
      tick(nodes, edges, alpha);
      alpha *= 0.985;
    }
    draw();
    raf = requestAnimationFrame(loop);
  };
  loop();

  const toWorld = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - r.width / 2 - ox) / scale, y: (cy - r.top - r.height / 2 - oy) / scale };
  };
  const hit = (cx: number, cy: number) => {
    const p = toWorld(cx, cy);
    let best = -1;
    let bestD = Infinity;
    nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < radius(n) + 14 / scale && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  };
  const select = (i: number) => {
    selected = i;
    if (i < 0 || nodes[i].kind === 'tag') {
      openBtn.classList.toggle('hidden', i < 0);
      if (i >= 0) openBtn.innerHTML = `Voir ${esc(nodes[i].label)} <i class="fa-solid fa-arrow-right ml-1"></i>`;
      return;
    }
    openBtn.classList.remove('hidden');
    openBtn.innerHTML = `Ouvrir ${esc(nodes[i].label)} <i class="fa-solid fa-arrow-right ml-1"></i>`;
  };
  if (selected >= 0) {
    select(selected);
    // Centre sur la page demandée une fois la disposition stabilisée.
    setTimeout(() => {
      ox = -nodes[selected].x * scale;
      oy = -nodes[selected].y * scale;
    }, 400);
  }
  openBtn.addEventListener('click', () => {
    const n = nodes[selected];
    if (!n) return;
    if (n.kind === 'tag') ctx.go(`/tag/${encodeURIComponent(n.label.slice(1))}`);
    else ctx.go(`/p/${n.id}`);
  });

  // Gestes : glisser un nœud, déplacer la vue, pincer pour zoomer, toucher pour sélectionner.
  const pointers = new Map<number, { x: number; y: number }>();
  let drag = -1;
  let moved = false;
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pointers.size === 1) drag = hit(e.clientX, e.clientY);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      drag = -1;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y) > 2) moved = true;
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) scale = Math.min(4, Math.max(0.2, scale * (d / pinch)));
      pinch = d;
    } else if (drag >= 0) {
      const p = toWorld(cur.x, cur.y);
      nodes[drag].x = p.x;
      nodes[drag].y = p.y;
      alpha = Math.max(alpha, 0.3);
    } else {
      ox += cur.x - prev.x;
      oy += cur.y - prev.y;
    }
  });
  const up = (e: PointerEvent) => {
    if (pointers.size === 1 && !moved) select(hit(e.clientX, e.clientY));
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    drag = -1;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = Math.min(4, Math.max(0.2, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
  }, { passive: false });

  screen.querySelectorAll<HTMLElement>('[data-opt]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.opt as keyof GraphOptions;
      opts[k] = !opts[k];
      try {
        localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
      } catch {
        /* ignoré */
      }
      ctx.go(`/graph?${route.params.focus ? `focus=${route.params.focus}&` : ''}v=${Date.now()}`, true);
    }),
  );
  window.addEventListener('resize', resize);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
};

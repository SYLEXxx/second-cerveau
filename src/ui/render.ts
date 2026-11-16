import { renderMarkdown } from '../core/markdown';
import type { Page, VaultState } from '../core/types';
import { displayTitle, findByTitle } from '../core/vault';
import { activeView, formatValue, viewRows } from '../core/db';
import { budgetWidgetHtml } from '../modules/budget/widget';
import { pageIcon } from './components';
import { esc } from './dom';
import { inkToSvg } from '../core/ink';

// Affichage d'une note : markdown + interactions façon Obsidian (étiquettes, cases à cocher,
// encadrés, intégrations ![[...]] et bloc budget).

const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_\-/]*\p{L}[\p{L}\p{N}_\-/]*)/gu;

function linkifyTags(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('code,pre,a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.data;
    TAG_RE.lastIndex = 0;
    if (!TAG_RE.test(text)) continue;
    TAG_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(TAG_RE)) {
      const start = m.index! + m[1].length;
      frag.append(text.slice(last, start));
      const a = document.createElement('a');
      a.className = 'tag';
      a.dataset.tag = m[2].toLowerCase();
      a.textContent = '#' + m[2];
      frag.append(a);
      last = start + m[2].length + 1;
    }
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
}

const CALLOUTS: Record<string, [string, string]> = {
  note: ['fa-circle-info', 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'],
  info: ['fa-circle-info', 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'],
  tip: ['fa-lightbulb', 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'],
  astuce: ['fa-lightbulb', 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'],
  success: ['fa-circle-check', 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'],
  warning: ['fa-triangle-exclamation', 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'],
  attention: ['fa-triangle-exclamation', 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'],
  danger: ['fa-circle-exclamation', 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'],
  question: ['fa-circle-question', 'border-violet-500 bg-violet-50 dark:bg-violet-950/40'],
  quote: ['fa-quote-left', 'border-slate-400 bg-slate-50 dark:bg-slate-800'],
};

function callouts(root: HTMLElement): void {
  for (const bq of root.querySelectorAll('blockquote')) {
    const p = bq.firstElementChild;
    if (!(p instanceof HTMLParagraphElement)) continue;
    const m = /^\[!(\w+)\][+-]?[ \t]*([^\n]*)/.exec(p.textContent ?? '');
    if (!m) continue;
    const type = m[1].toLowerCase();
    const [icon, cls] = CALLOUTS[type] ?? CALLOUTS.note;
    // Retire le marqueur [!type] Titre du premier paragraphe (premier nœud texte + <br>).
    const first = p.firstChild;
    if (first?.nodeType === Node.TEXT_NODE) {
      first.textContent = (first.textContent ?? '').replace(/^\[!\w+\][+-]?[ \t]*[^\n]*/, '');
      if (first.nextSibling?.nodeName === 'BR') first.nextSibling.remove();
    }
    if (!p.textContent?.trim()) p.remove();
    bq.classList.add('callout', ...cls.split(' '));
    const title = document.createElement('div');
    title.className = 'callout-title';
    title.innerHTML = `<i class="fa-solid ${icon}"></i><span>${esc(m[2] || type.charAt(0).toUpperCase() + type.slice(1))}</span>`;
    bq.prepend(title);
  }
}

function embedHtml(s: VaultState, target: string, depth: number): string {
  const p = findByTitle(s, target);
  if (!p) return `<span class="embed-card text-slate-400">Page introuvable : ${esc(target)}</span>`;
  const head = `<a class="wikilink !bg-transparent font-semibold" data-target="${esc(p.title)}">${pageIcon(p)} ${esc(displayTitle(p))}</a>`;
  if (p.kind === 'canvas' && p.ink) {
    const svg = p.ink.strokes.length ? inkToSvg(p.ink) : '<span class="text-slate-400 text-sm">Tableau vide : touchez pour dessiner.</span>';
    return `<a class="embed-card ink-embed no-underline text-inherit" href="#/p/${p.id}"><span class="block font-semibold mb-1">${pageIcon(p)} ${esc(displayTitle(p))}</span><span class="ink-thumb block">${svg}</span></a>`;
  }
  if (p.kind === 'database') {
    const view = activeView(p.schema!);
    const list = viewRows(s, p, view).slice(0, 8);
    const props = p.schema!.props.slice(0, 2);
    return `<span class="embed-card">${head}<span class="block mt-2 divide-y divide-slate-100 dark:divide-slate-700">${list
      .map((r) => `<a class="flex justify-between gap-2 py-1.5 no-underline text-inherit" href="#/p/${r.id}"><span class="truncate">${pageIcon(r)} ${esc(displayTitle(r))}</span><span class="text-xs text-slate-400 truncate">${props.map((x) => esc(formatValue(x, r.props[x.id]))).filter(Boolean).join(' · ')}</span></a>`)
      .join('')}</span></span>`;
  }
  const body = depth > 1 ? '' : renderMarkdown(p.content.slice(0, 1500), (t) => !!findByTitle(s, t));
  return `<span class="embed-card">${head}<span class="block mt-1 prose-note text-sm opacity-90">${body}</span></span>`;
}

export function renderNote(root: HTMLElement, s: VaultState, page: Page, depth = 0): void {
  root.innerHTML = renderMarkdown(page.content, (t) => !!findByTitle(s, t));
  linkifyTags(root);
  callouts(root);
  root.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((cb, i) => {
    cb.disabled = false;
    cb.dataset.task = String(i);
  });
  root.querySelectorAll<HTMLElement>('.embed[data-embed]').forEach((e) => {
    e.outerHTML = embedHtml(s, e.dataset.embed!, depth + 1);
  });
  root.querySelectorAll<HTMLElement>('.embed-card .embed-card .embed-card').forEach((e) => e.remove());
  root.querySelectorAll<HTMLElement>('.budget-embed').forEach((e) => {
    e.className = 'budget-embed block card p-4 not-italic';
    e.dataset.action = 'open-budget';
    e.innerHTML = budgetWidgetHtml();
  });
  root.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener';
  });
}

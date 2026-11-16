import type { VaultState } from '../core/types';
import { allTags, displayTitle, livePages } from '../core/vault';
import { todayIso } from '../core/ids';
import { pageIcon } from './components';
import { el, esc } from './dom';

// Éditeur markdown pour le tactile : barre d'outils au-dessus du clavier,
// suggestions de [[liens]], d'#étiquettes et commandes « / » façon Notion.

export interface EditorHooks {
  state: () => VaultState;
  selfId: string;
  onChange: (text: string) => void;
  onDone: () => void;
  /** Commandes « / » qui créent une page (sous-page, base) et renvoient le texte à insérer. */
  createChild: (kind: 'page' | 'database') => Promise<string | null>;
}

interface Suggestion {
  label: string;
  hint?: string;
  icon?: string;
  apply: () => void;
}

/** Remplace [start, end) par `text` en gardant l'annulation native quand c'est possible. */
export function replaceRange(ta: HTMLTextAreaElement, start: number, end: number, text: string, caret?: number): void {
  ta.focus();
  ta.setSelectionRange(start, end);
  const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
  if (!ok || ta.value.slice(start, start + text.length) !== text) {
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (caret != null) ta.setSelectionRange(start + caret, start + caret);
}

function lineBounds(v: string, pos: number): [number, number] {
  const start = v.lastIndexOf('\n', pos - 1) + 1;
  const nl = v.indexOf('\n', pos);
  return [start, nl < 0 ? v.length : nl];
}

const PREFIX_RE = /^(\s*)(#{1,6} |- \[[ xX]\] |[-*+] |\d+\. |> )?/;

function setLinePrefix(ta: HTMLTextAreaElement, prefix: string): void {
  const v = ta.value;
  const [s, e] = lineBounds(v, ta.selectionStart);
  const line = v.slice(s, e);
  const m = PREFIX_RE.exec(line)!;
  const indent = m[1];
  const current = m[2] ?? '';
  const rest = line.slice(indent.length + current.length);
  const next = current === prefix ? '' : prefix;
  replaceRange(ta, s, e, indent + next + rest);
  const pos = s + indent.length + next.length + rest.length;
  ta.setSelectionRange(pos, pos);
}

function cycleHeading(ta: HTMLTextAreaElement): void {
  const v = ta.value;
  const [s] = lineBounds(v, ta.selectionStart);
  const m = /^(#{1,3}) /.exec(v.slice(s));
  const next = !m ? '# ' : m[1].length >= 3 ? '' : '#'.repeat(m[1].length + 1) + ' ';
  setLinePrefix(ta, m ? m[0] : '');
  if (next) setLinePrefix(ta, next);
}

function wrap(ta: HTMLTextAreaElement, mark: string): void {
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const sel = value.slice(a, b);
  replaceRange(ta, a, b, mark + sel + mark, sel ? mark.length * 2 + sel.length : mark.length);
}

function indent(ta: HTMLTextAreaElement, dir: 1 | -1): void {
  const v = ta.value;
  const pos = ta.selectionStart;
  const [s, e] = lineBounds(v, pos);
  const line = v.slice(s, e);
  const next = dir > 0 ? '  ' + line : line.replace(/^ {1,2}/, '');
  replaceRange(ta, s, e, next);
  const p = Math.max(s, pos + (next.length - line.length));
  ta.setSelectionRange(p, p);
}

interface SlashCmd {
  key: string;
  label: string;
  icon: string;
  text?: string;
  caret?: number;
  run?: () => Promise<string | null>;
}

export function mountEditor(container: HTMLElement, initial: string, hooks: EditorHooks, caret?: number): { destroy: () => void; textarea: HTMLTextAreaElement } {
  const ta = el<HTMLTextAreaElement>(`<textarea class="editor-area" spellcheck="true" autocapitalize="sentences" placeholder="Écrivez… ( [[ pour lier, / pour un bloc, # pour une étiquette )"></textarea>`);
  ta.value = initial;
  container.appendChild(ta);

  const bar = el(`<div class="editor-bar fixed left-0 right-0 z-40 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
    <div class="suggest hidden max-h-56 overflow-y-auto border-b border-slate-200 dark:border-slate-700"></div>
    <div class="flex items-center">
      <div class="flex-1 flex overflow-x-auto no-scrollbar">
        ${[
          ['slash', 'fa-plus', 'Bloc'],
          ['h', 'fa-heading', 'Titre'],
          ['bold', 'fa-bold', 'Gras'],
          ['italic', 'fa-italic', 'Italique'],
          ['task', 'fa-square-check', 'Tâche'],
          ['list', 'fa-list-ul', 'Liste'],
          ['link', 'fa-link', 'Lien'],
          ['tag', 'fa-hashtag', 'Étiquette'],
          ['quote', 'fa-quote-left', 'Citation'],
          ['code', 'fa-code', 'Code'],
          ['outdent', 'fa-outdent', 'Désindenter'],
          ['indent', 'fa-indent', 'Indenter'],
        ]
          .map(([a, i, t]) => `<button type="button" data-tool="${a}" title="${t}" aria-label="${t}" class="w-11 h-11 flex-shrink-0 text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-700"><i class="fa-solid ${i}"></i></button>`)
          .join('')}
      </div>
      <button type="button" data-tool="done" class="h-11 px-4 font-semibold text-violet-600 dark:text-violet-400 border-l border-slate-200 dark:border-slate-700">OK</button>
    </div>
  </div>`);
  document.body.appendChild(bar);
  document.body.classList.add('editing');
  const suggestBox = bar.querySelector<HTMLElement>('.suggest')!;

  // La barre suit le haut du clavier (iOS ne redimensionne pas la page).
  const place = () => {
    const vv = window.visualViewport;
    const offset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    bar.style.bottom = `${offset}px`;
    bar.style.paddingBottom = offset > 0 ? '0' : 'env(safe-area-inset-bottom)';
  };
  place();
  window.visualViewport?.addEventListener('resize', place);
  window.visualViewport?.addEventListener('scroll', place);

  const autosize = () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  };

  let suggestions: Suggestion[] = [];
  const showSuggestions = (list: Suggestion[]) => {
    suggestions = list;
    if (!list.length) {
      suggestBox.classList.add('hidden');
      return;
    }
    suggestBox.classList.remove('hidden');
    suggestBox.innerHTML = list
      .map(
        (sg, i) => `<button type="button" data-sg="${i}" class="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-slate-100 dark:active:bg-slate-700">
        <span class="w-6 text-center">${sg.icon ?? ''}</span><span class="flex-1 truncate">${esc(sg.label)}</span>${sg.hint ? `<span class="text-xs text-slate-400">${esc(sg.hint)}</span>` : ''}</button>`,
      )
      .join('');
  };

  const slashCommands = (): SlashCmd[] => [
    { key: 'titre1 h1', label: 'Titre 1', icon: '<b>H1</b>', text: '# ' },
    { key: 'titre2 h2', label: 'Titre 2', icon: '<b>H2</b>', text: '## ' },
    { key: 'titre3 h3', label: 'Titre 3', icon: '<b>H3</b>', text: '### ' },
    { key: 'tache todo case', label: 'Tâche', icon: '<i class="fa-regular fa-square-check"></i>', text: '- [ ] ' },
    { key: 'liste puces', label: 'Liste à puces', icon: '<i class="fa-solid fa-list-ul"></i>', text: '- ' },
    { key: 'numerotee liste', label: 'Liste numérotée', icon: '<i class="fa-solid fa-list-ol"></i>', text: '1. ' },
    { key: 'citation quote', label: 'Citation', icon: '<i class="fa-solid fa-quote-left"></i>', text: '> ' },
    { key: 'encadre callout note', label: 'Encadré', icon: '<i class="fa-solid fa-circle-info"></i>', text: '> [!note] Titre\n> ', caret: 9 },
    { key: 'astuce tip', label: 'Encadré astuce', icon: '<i class="fa-solid fa-lightbulb"></i>', text: '> [!tip] Astuce\n> ' },
    { key: 'attention warning', label: 'Encadré attention', icon: '<i class="fa-solid fa-triangle-exclamation"></i>', text: '> [!warning] Attention\n> ' },
    { key: 'code', label: 'Bloc de code', icon: '<i class="fa-solid fa-code"></i>', text: '```\n\n```', caret: 4 },
    { key: 'tableau table', label: 'Tableau', icon: '<i class="fa-solid fa-table-cells"></i>', text: '| Colonne | Colonne |\n| --- | --- |\n|  |  |\n' },
    { key: 'separateur ligne hr', label: 'Séparateur', icon: '<i class="fa-solid fa-minus"></i>', text: '---\n' },
    { key: 'date aujourdhui', label: 'Date du jour', icon: '<i class="fa-regular fa-calendar"></i>', text: `[[${todayIso()}]] ` },
    { key: 'page sous-page', label: 'Sous-page', icon: '<i class="fa-regular fa-file"></i>', run: () => hooks.createChild('page') },
    { key: 'base database tableau', label: 'Base de données', icon: '<i class="fa-solid fa-table"></i>', run: () => hooks.createChild('database') },
    { key: 'budget argent', label: 'Résumé du budget', icon: '<i class="fa-solid fa-wallet"></i>', text: '```budget\n```\n' },
  ];

  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const update = () => {
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) return showSuggestions([]);
    const before = ta.value.slice(0, pos);
    const s = hooks.state();

    const link = /(!?)\[\[([^\[\]\n|]*)$/.exec(before);
    if (link) {
      const q = norm(link[2]);
      const start = pos - link[2].length;
      const after = ta.value.slice(pos, pos + 2) === ']]' ? 2 : 0;
      const pages = livePages(s)
        .filter((p) => p.id !== hooks.selfId && p.title.trim() && norm(p.title).includes(q))
        .sort((a, b) => Number(norm(b.title).startsWith(q)) - Number(norm(a.title).startsWith(q)) || b.updatedAt - a.updatedAt)
        .slice(0, 6);
      const list: Suggestion[] = pages.map((p) => ({
        label: displayTitle(p),
        icon: pageIcon(p),
        hint: p.kind === 'database' ? 'base' : undefined,
        apply: () => replaceRange(ta, start, pos + after, p.title.trim() + ']]'),
      }));
      if (link[2].trim() && !pages.some((p) => norm(p.title) === q)) {
        list.push({ label: `Lier « ${link[2].trim()} » (nouvelle page)`, icon: '<i class="fa-solid fa-plus text-violet-500"></i>', apply: () => replaceRange(ta, start, pos + after, link[2].trim() + ']]') });
      }
      return showSuggestions(list);
    }

    const tag = /(^|\s)#([\p{L}\p{N}_\-/]*)$/u.exec(before);
    if (tag?.[2]) {
      const q = norm(tag[2]);
      const start = pos - tag[2].length;
      const list = allTags(s)
        .filter((t) => norm(t.tag).startsWith(q) && t.tag !== q)
        .slice(0, 6)
        .map((t) => ({ label: '#' + t.tag, hint: String(t.count), apply: () => replaceRange(ta, start, pos, t.tag + ' ') }));
      return showSuggestions(list);
    }

    const slash = /(^|\n)\/([\p{L}\d]*)$/u.exec(before);
    if (slash) {
      const q = norm(slash[2]);
      const start = pos - slash[2].length - 1;
      return showSuggestions(
        slashCommands()
          .filter((c) => !q || norm(c.label).includes(q) || c.key.includes(q))
          .map((c) => ({
            label: c.label,
            icon: c.icon,
            apply: async () => {
              const text = c.run ? await c.run() : c.text!;
              if (text != null) replaceRange(ta, start, pos, text, c.caret);
              else replaceRange(ta, start, pos, '');
            },
          })),
      );
    }
    showSuggestions([]);
  };

  suggestBox.addEventListener('pointerdown', (e) => e.preventDefault()); // garde le clavier ouvert
  suggestBox.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sg]');
    if (!b) return;
    const sg = suggestions[Number(b.dataset.sg)];
    showSuggestions([]);
    sg?.apply();
  });

  bar.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('[data-tool]:not([data-tool=done])')) e.preventDefault();
  });
  bar.addEventListener('click', (e) => {
    const tool = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]')?.dataset.tool;
    if (!tool) return;
    const pos = ta.selectionStart;
    switch (tool) {
      case 'done':
        return hooks.onDone();
      case 'slash': {
        const [s] = lineBounds(ta.value, pos);
        const empty = ta.value.slice(s, pos).trim() === '';
        replaceRange(ta, pos, ta.selectionEnd, empty ? '/' : '\n/');
        break;
      }
      case 'h':
        cycleHeading(ta);
        break;
      case 'bold':
        wrap(ta, '**');
        break;
      case 'italic':
        wrap(ta, '*');
        break;
      case 'task':
        setLinePrefix(ta, '- [ ] ');
        break;
      case 'list':
        setLinePrefix(ta, '- ');
        break;
      case 'quote':
        setLinePrefix(ta, '> ');
        break;
      case 'link': {
        const sel = ta.value.slice(pos, ta.selectionEnd);
        replaceRange(ta, pos, ta.selectionEnd, `[[${sel}`, 2 + sel.length);
        break;
      }
      case 'tag': {
        const prev = ta.value[pos - 1];
        replaceRange(ta, pos, ta.selectionEnd, prev && !/\s/.test(prev) ? ' #' : '#');
        break;
      }
      case 'code':
        wrap(ta, '`');
        break;
      case 'indent':
        indent(ta, 1);
        break;
      case 'outdent':
        indent(ta, -1);
        break;
    }
    update();
  });

  // Entrée dans une liste : continue la liste (et la termine sur une ligne vide).
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    if (suggestions.length && !suggestBox.classList.contains('hidden')) {
      e.preventDefault();
      const sg = suggestions[0];
      showSuggestions([]);
      sg.apply();
      return;
    }
    const pos = ta.selectionStart;
    const [s] = lineBounds(ta.value, pos);
    const line = ta.value.slice(s, pos);
    const m = /^(\s*)(- \[[ xX]\] |[-*+] |(\d+)\. |> )/.exec(line);
    if (!m) return;
    e.preventDefault();
    if (line.trim() === m[2].trim()) {
      replaceRange(ta, s, pos, '');
      return;
    }
    let next = m[2];
    if (m[3]) next = `${Number(m[3]) + 1}. `;
    if (next.startsWith('- [')) next = '- [ ] ';
    replaceRange(ta, pos, ta.selectionEnd, '\n' + m[1] + next);
  });

  ta.addEventListener('input', () => {
    autosize();
    hooks.onChange(ta.value);
    update();
  });
  ta.addEventListener('click', update);
  ta.addEventListener('keyup', (e) => {
    if (e.key.startsWith('Arrow')) update();
  });

  requestAnimationFrame(() => {
    autosize();
    ta.focus({ preventScroll: true });
    const c = caret ?? ta.value.length;
    ta.setSelectionRange(c, c);
  });

  return {
    textarea: ta,
    destroy() {
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      bar.remove();
      document.body.classList.remove('editing');
    },
  };
}

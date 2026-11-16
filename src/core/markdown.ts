import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';

// Rendu markdown façon Obsidian : [[liens wiki]], ![[intégrations]], ==surlignage==,
// encadrés > [!note], cases à cocher, et bloc ```budget pour le module budget.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type Resolver = (title: string) => boolean;

export function createMarked(exists: Resolver): Marked {
  const m = new Marked({ gfm: true, breaks: true });
  m.use({
    extensions: [
      {
        name: 'wikilink',
        level: 'inline',
        start: (src: string) => src.match(/!?\[\[/)?.index,
        tokenizer(src: string) {
          const match = /^(!?)\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]*))?\]\]/.exec(src);
          if (!match) return undefined;
          return { type: 'wikilink', raw: match[0], embed: match[1] === '!', target: match[2].trim(), alias: match[3]?.trim() };
        },
        renderer(token) {
          const t = token as unknown as { embed: boolean; target: string; alias?: string };
          const target = t.target.split('#')[0].trim();
          if (t.embed) return `<span class="embed" data-embed="${esc(target)}"></span>`;
          const cls = exists(target) ? 'wikilink' : 'wikilink missing';
          return `<a class="${cls}" data-target="${esc(target)}">${esc(t.alias || t.target)}</a>`;
        },
      },
      {
        name: 'highlight',
        level: 'inline',
        start: (src: string) => src.indexOf('=='),
        tokenizer(src: string) {
          const match = /^==([^=\n]+)==/.exec(src);
          if (!match) return undefined;
          return { type: 'highlight', raw: match[0], text: match[1] };
        },
        renderer(token) {
          return `<mark>${esc((token as unknown as { text: string }).text)}</mark>`;
        },
      },
    ],
    renderer: {
      code(token: Tokens.Code) {
        if (token.lang?.trim() === 'budget') return '<div class="budget-embed"></div>';
        return `<pre><code class="language-${esc(token.lang ?? '')}">${esc(token.text)}</code></pre>`;
      },
    },
  });
  return m;
}

export function renderMarkdown(md: string, exists: Resolver): string {
  const html = createMarked(exists).parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}

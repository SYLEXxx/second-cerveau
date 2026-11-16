// Liens wiki ([[Titre]], [[Titre|alias]], ![[Titre]]) et étiquettes (#tag), façon Obsidian.

export interface WikiLink {
  target: string;
  alias?: string;
  embed: boolean;
}

/** Retire les blocs de code pour ne pas y chercher de liens ni d'étiquettes. */
export function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?(```|$)/g, '').replace(/`[^`\n]*`/g, '');
}

const LINK_RE = /(!?)\[\[([^\[\]\n|#]+)(?:#[^\[\]\n|]*)?(?:\|([^\[\]\n]*))?\]\]/g;

export function parseLinks(md: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const m of stripCode(md).matchAll(LINK_RE)) {
    out.push({ target: m[2].trim(), alias: m[3]?.trim() || undefined, embed: m[1] === '!' });
  }
  return out;
}

// Une étiquette commence en début de ligne ou après un espace, et contient au moins une lettre.
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_\-/]*\p{L}[\p{L}\p{N}_\-/]*)/gu;

export function parseTags(md: string): string[] {
  const set = new Set<string>();
  // Les titres markdown (« # Titre ») n'ont pas de lettre collée au #, ils ne matchent donc pas.
  for (const m of stripCode(md).matchAll(TAG_RE)) set.add(m[2].toLowerCase());
  return [...set];
}

export const normTitle = (t: string): string => t.trim().toLowerCase();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Réécrit les liens vers `oldTitle` pour pointer vers `newTitle` (renommage d'une page). */
export function renameLinks(md: string, oldTitle: string, newTitle: string): string {
  const re = new RegExp(`(!?)\\[\\[\\s*${escapeRe(oldTitle.trim())}\\s*((?:#[^\\[\\]\\n|]*)?(?:\\|[^\\[\\]\\n]*)?)\\]\\]`, 'gi');
  return md.replace(re, (_m, bang: string, rest: string) => `${bang}[[${newTitle}${rest}]]`);
}

/** Texte lisible pour un aperçu : sans la syntaxe markdown la plus visible. */
export function plainText(md: string): string {
  return md
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/!?\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(#{1,6}|>|[-*+]( \[[ xX]\])?|\d+\.)\s+/gm, '')
    .replace(/\*\*|__|==|`/g, '');
}

/** Extrait de texte autour de la première mention, pour la liste des rétroliens. */
export function snippetAround(md: string, needle: string, radius = 60): string {
  const i = md.toLowerCase().indexOf(needle.toLowerCase());
  const start = i < 0 ? 0 : Math.max(0, i - radius);
  const end = i < 0 ? Math.min(md.length, radius * 2) : Math.min(md.length, i + needle.length + radius);
  return (start > 0 ? '…' : '') + plainText(md.slice(start, end)).replace(/\s+/g, ' ').trim() + (end < md.length ? '…' : '');
}

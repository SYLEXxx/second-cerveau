import { strToU8, zipSync } from 'fflate';
import type { Page, VaultState } from './types';
import { children, displayTitle, isDbRow } from './vault';
import { formatValue } from './db';
import { createPage } from './vault';

// Export vers un dossier de fichiers .md compatible Obsidian, et import de fichiers .md.

const safeName = (t: string) => t.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim().slice(0, 120) || 'Sans titre';

/** Front-matter YAML avec les propriétés d'une ligne de base. */
function frontMatter(s: VaultState, p: Page): string {
  if (!isDbRow(s, p)) return '';
  const db = s.pages[p.parentId!];
  const lines = db.schema!.props
    .map((prop) => {
      const v = p.props[prop.id];
      if (v == null || v === '') return null;
      if (Array.isArray(v)) return `${prop.name}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      if (prop.type === 'number' || prop.type === 'checkbox') return `${prop.name}: ${v}`;
      return `${prop.name}: ${JSON.stringify(prop.type === 'date' ? v : formatValue(prop, v))}`;
    })
    .filter(Boolean);
  return lines.length ? `---\n${lines.join('\n')}\n---\n\n` : '';
}

export function vaultToFiles(s: VaultState): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (parentId: string | null, dir: string) => {
    const used = new Set<string>();
    for (const p of children(s, parentId)) {
      let name = safeName(displayTitle(p));
      while (used.has(name.toLowerCase())) name += ' (2)';
      used.add(name.toLowerCase());
      let body = frontMatter(s, p) + p.content;
      if (p.kind === 'database') {
        // Une base devient un dossier : une note d'index + une note par ligne.
        const db = p.schema!;
        const head = `| Nom | ${db.props.map((x) => x.name).join(' | ')} |\n|${' --- |'.repeat(db.props.length + 1)}\n`;
        const rowsMd = children(s, p.id)
          .map((r) => `| [[${displayTitle(r)}]] | ${db.props.map((x) => formatValue(x, r.props[x.id]).replace(/\|/g, '/')).join(' | ')} |`)
          .join('\n');
        body = `${p.content}\n\n${head}${rowsMd}\n`;
      }
      const hasKids = children(s, p.id).length > 0;
      files[hasKids ? `${dir}${name}/${name}.md` : `${dir}${name}.md`] = body;
      if (hasKids) walk(p.id, `${dir}${name}/`);
    }
  };
  walk(null, '');
  return files;
}

export function vaultToZip(s: VaultState): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, text] of Object.entries(vaultToFiles(s))) entries[`Second cerveau/${path}`] = strToU8(text);
  return zipSync(entries, { level: 6 });
}

/** Importe des notes markdown : le nom du fichier devient le titre. */
export function importMarkdown(s: VaultState, files: Array<{ name: string; text: string }>, parentId: string | null = null): Page[] {
  return files.map((f) => {
    const title = f.name.replace(/\.(md|markdown|txt)$/i, '');
    // Le front-matter est conservé tel quel dans le contenu.
    return createPage(s, { title, parentId, content: f.text.replace(/\r\n/g, '\n') });
  });
}

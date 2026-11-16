import type { Page, PropDef, PropType } from '../core/types';
import { PROP_TYPES, addProp, changePropType, ensureOption, formatValue, optionColor, propIcon, removeProp } from '../core/db';
import type { VaultStore } from '../core/store';
import { COLORS } from '../core/ids';
import { CHIP, chip, el, esc } from './dom';
import { btnGhost, btnPrimary, confirmSheet, inputClass, openMenu, openSheet, promptText } from './sheet';

// Propriétés des bases : affichage d'une valeur et feuilles d'édition selon le type.

export function valueHtml(prop: PropDef, v: Page['props'][string] | undefined): string {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
  switch (prop.type) {
    case 'select':
      return chip(optionColor(prop, String(v)), String(v));
    case 'multi':
      return (Array.isArray(v) ? v : [String(v)]).map((x) => chip(optionColor(prop, x), x)).join(' ');
    case 'checkbox':
      return v ? '<i class="fa-solid fa-square-check text-violet-600 text-lg"></i>' : '';
    case 'url':
      return `<span class="text-violet-600 underline truncate">${esc(String(v).replace(/^https?:\/\//, ''))}</span>`;
    default:
      return esc(formatValue(prop, v));
  }
}

/** Ouvre l'éditeur d'une valeur de propriété pour une ligne de base. */
export function editValue(store: VaultStore, row: Page, prop: PropDef): void {
  const cur = row.props[prop.id];
  const set = (v: Page['props'][string]) =>
    store.update(() => {
      row.props[prop.id] = v;
      row.updatedAt = Date.now();
    });

  if (prop.type === 'checkbox') return set(!cur);

  if (prop.type === 'select' || prop.type === 'multi') {
    const multi = prop.type === 'multi';
    let selected = new Set<string>(cur == null ? [] : Array.isArray(cur) ? cur : [String(cur)]);
    const body = el(`<div class="pb-2">
      <div class="opts flex flex-wrap gap-2 mb-4"></div>
      <form class="flex gap-2"><input class="${inputClass} flex-1" placeholder="Nouvelle option…"><button class="${btnGhost}">Ajouter</button></form>
      ${multi ? `<div class="flex justify-end mt-3"><button class="${btnPrimary}" data-ok>OK</button></div>` : ''}
    </div>`);
    const draw = () => {
      body.querySelector('.opts')!.innerHTML =
        (prop.options ?? [])
          .map((o) => `<button data-opt="${esc(o.name)}" class="rounded-lg ${selected.has(o.name) ? 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-slate-800' : ''}">${chip(o.color, o.name)}</button>`)
          .join('') || '<p class="text-sm text-slate-400">Aucune option : ajoutez-en une.</p>';
    };
    draw();
    const commit = () => set(multi ? [...selected] : ([...selected][0] ?? null));
    const sheet = openSheet({ title: prop.name, body, onClose: () => multi && commit() });
    body.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]');
      if (b) {
        const name = b.dataset.opt!;
        if (multi) {
          if (selected.has(name)) selected.delete(name);
          else selected.add(name);
          draw();
        } else {
          selected = new Set(selected.has(name) ? [] : [name]);
          commit();
          sheet.close();
        }
      }
      if ((e.target as HTMLElement).closest('[data-ok]')) sheet.close();
    });
    body.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = body.querySelector('input')!;
      const name = input.value.trim();
      if (!name) return;
      store.update(() => void ensureOption(prop, name), true);
      input.value = '';
      if (multi) {
        selected.add(name);
        draw();
      } else {
        selected = new Set([name]);
        commit();
        sheet.close();
      }
    });
    return;
  }

  if (prop.type === 'date') {
    const body = el(`<form class="space-y-3 pb-2"><input type="date" class="${inputClass}" value="${esc(cur ?? '')}">
      <div class="flex justify-between gap-2"><button type="button" class="${btnGhost}" data-clear>Effacer</button><button class="${btnPrimary}">OK</button></div></form>`);
    const sheet = openSheet({ title: prop.name, body });
    const input = body.querySelector('input')!;
    body.addEventListener('submit', (e) => {
      e.preventDefault();
      set(input.value || null);
      sheet.close();
    });
    body.querySelector('[data-clear]')!.addEventListener('click', () => {
      set(null);
      sheet.close();
    });
    return;
  }

  void promptText(prop.name, cur == null ? '' : String(cur), {
    type: prop.type === 'number' ? 'number' : prop.type === 'url' ? 'url' : 'text',
    multiline: prop.type === 'text',
    placeholder: prop.type === 'url' ? 'https://…' : '',
  }).then((v) => {
    if (v == null) return;
    if (prop.type === 'number') set(v.trim() === '' ? null : Number(v.replace(',', '.')));
    else set(v.trim() || null);
  });
}

function pickType(current?: PropType): Promise<PropType | null> {
  return new Promise((resolve) => {
    let picked: PropType | null = null;
    const body = el(`<div class="grid grid-cols-2 gap-2 pb-2">${PROP_TYPES.map(
      (t) => `<button data-t="${t.type}" class="flex items-center gap-2 p-3 rounded-xl border ${t.type === current ? 'border-violet-500' : 'border-slate-200 dark:border-slate-700'}"><i class="fa-solid ${t.icon} text-slate-400 w-4"></i>${t.label}</button>`,
    ).join('')}</div>`);
    const sheet = openSheet({ title: 'Type de propriété', body, onClose: () => resolve(picked) });
    body.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-t]');
      if (!b) return;
      picked = b.dataset.t as PropType;
      sheet.close();
    });
  });
}

export async function newProp(store: VaultStore, db: Page): Promise<void> {
  const type = await pickType();
  if (!type) return;
  const name = await promptText('Nom de la propriété', PROP_TYPES.find((t) => t.type === type)!.label);
  if (name == null) return;
  store.update(() => void addProp(db.schema!, name, type));
}

/** Menu d'une propriété : renommer, changer le type, gérer les options, supprimer. */
export function propMenu(store: VaultStore, db: Page, prop: PropDef): void {
  openMenu(prop.name, [
    {
      label: 'Renommer',
      icon: 'fa-pen',
      run: async () => {
        const n = await promptText('Renommer la propriété', prop.name);
        if (n?.trim()) store.update(() => void (prop.name = n.trim()));
      },
    },
    {
      label: 'Changer le type',
      icon: propIcon(prop.type),
      hint: PROP_TYPES.find((t) => t.type === prop.type)?.label,
      run: async () => {
        const t = await pickType(prop.type);
        if (t && t !== prop.type) store.update((s) => changePropType(s, db, prop, t));
      },
    },
    ...(prop.type === 'select' || prop.type === 'multi' ? [{ label: 'Gérer les options', icon: 'fa-palette', run: () => optionsSheet(store, db, prop) }] : []),
    {
      label: 'Supprimer la propriété',
      icon: 'fa-trash',
      danger: true,
      run: async () => {
        if (await confirmSheet(`Supprimer « ${prop.name} » et ses valeurs dans toutes les lignes ?`, 'Supprimer')) store.update((s) => removeProp(s, db, prop.id));
      },
    },
  ]);
}

function optionsSheet(store: VaultStore, db: Page, prop: PropDef): void {
  const body = el(`<div class="pb-2 space-y-2"></div>`);
  const draw = () => {
    body.innerHTML = (prop.options ?? [])
      .map(
        (o, i) => `<div class="flex items-center gap-2">
        <button data-color="${i}" class="w-8 h-8 rounded-lg ${CHIP[o.color]}" aria-label="Couleur"><i class="fa-solid fa-palette text-xs"></i></button>
        <span class="flex-1">${chip(o.color, o.name)}</span>
        <button data-up="${i}" class="icon-btn !w-8 !h-8" aria-label="Monter"><i class="fa-solid fa-arrow-up text-xs"></i></button>
        <button data-ren="${i}" class="icon-btn !w-8 !h-8" aria-label="Renommer"><i class="fa-solid fa-pen text-xs"></i></button>
        <button data-del="${i}" class="icon-btn !w-8 !h-8 !text-rose-500" aria-label="Supprimer"><i class="fa-solid fa-trash text-xs"></i></button>
      </div>`,
      )
      .join('') || '<p class="text-sm text-slate-400">Aucune option.</p>';
  };
  draw();
  openSheet({ title: `Options de « ${prop.name} »`, body, onClose: () => store.update(() => {}) });
  body.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t) return;
    const opts = prop.options!;
    const rows = Object.values(store.get().pages).filter((p) => p.parentId === db.id);
    if (t.dataset.color) {
      const o = opts[Number(t.dataset.color)];
      o.color = COLORS[(COLORS.indexOf(o.color) + 1) % COLORS.length];
    } else if (t.dataset.up) {
      const i = Number(t.dataset.up);
      if (i > 0) [opts[i - 1], opts[i]] = [opts[i], opts[i - 1]];
    } else if (t.dataset.ren) {
      const o = opts[Number(t.dataset.ren)];
      const n = await promptText("Renommer l'option", o.name);
      if (!n?.trim()) return;
      const old = o.name;
      o.name = n.trim();
      for (const r of rows) {
        const v = r.props[prop.id];
        if (v === old) r.props[prop.id] = o.name;
        else if (Array.isArray(v)) r.props[prop.id] = v.map((x) => (x === old ? o.name : x));
      }
    } else if (t.dataset.del) {
      const [o] = opts.splice(Number(t.dataset.del), 1);
      for (const r of rows) {
        const v = r.props[prop.id];
        if (v === o.name) r.props[prop.id] = null;
        else if (Array.isArray(v)) r.props[prop.id] = v.filter((x) => x !== o.name);
      }
    }
    store.update(() => {}, true);
    draw();
  });
}

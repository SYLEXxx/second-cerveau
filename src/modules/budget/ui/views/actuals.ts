import { computeActualsOverview, rollingMonths, type ConsumptionLevel } from '../../domain/actuals';
import { categorize, EXPENSE_CATEGORIES, learnCategory } from '../../domain/categorize';
import { parseBankCsv } from '../../domain/csv';
import { MONTH_NAMES } from '../../domain/defaults';
import { escapeHtml, formatCurrency, formatCurrencyCents, formatDate, todayIso } from '../../domain/format';
import { totalsForMonth } from '../../domain/months';
import { settlement } from '../../domain/couple';
import { isFilterActive, knownSubcategories, lastYearSameMonth, matchesFilter, parseTags, tagTotals } from '../../domain/insights';
import type { ActualExpense, AttachmentRef, BudgetState, ExpenseCategory, Payer } from '../../domain/types';
import { pickFile, removeAttachment, showAttachment, storeAttachment } from '../attachments';
import type { UiState, View } from '../context';
import { confirmDialog, showToast } from '../dialogs';
import { byId, on, setText } from '../dom';

const BAR_COLOR: Record<ConsumptionLevel, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  over: 'bg-rose-500',
};

const categoryOptions = (selected: string) =>
  EXPENSE_CATEGORIES.map((c) => `<option value="${c.value}"${c.value === selected ? ' selected' : ''}>${c.label}</option>`).join('');

/** Dépense en cours de modification dans le formulaire (null = ajout), et son mois. */
let editingId: number | null = null;
let editingMonth: number | null = null;
/** L'utilisateur a choisi la catégorie lui-même : on ne la devine plus. */
let categoryTouched = false;
/** Pièces jointes du formulaire (déjà rangées sur le disque) et celles d'origine en modification. */
let pending: AttachmentRef[] = [];
let original: AttachmentRef[] = [];

const fileIcon = (a: AttachmentRef) => (a.type === 'application/pdf' ? 'fa-file-pdf' : a.type.startsWith('image/') ? 'fa-file-image' : 'fa-file');

const tagChip = (t: string) => `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[10px] text-slate-500">#${escapeHtml(t)}</span>`;

const filterRows = (s: BudgetState, ui: UiState) => {
  const months = ui.filterAllMonths ? rollingMonths(new Date().getMonth()) : [ui.selectedActualMonth];
  return months.flatMap((month) => (s.actualExpenses[month] ?? []).map((tx) => ({ month, tx })))
    .filter(({ tx }) => matchesFilter(tx, ui.filter));
};

export const actualsView: View = {
  mount(ctx) {
    const { store, platform, ui } = ctx;

    const dateInput = byId<HTMLInputElement>('input-actual-date');
    const labelEl = byId<HTMLInputElement>('input-actual-label');
    const amountEl = byId<HTMLInputElement>('input-actual-amount');
    const catEl = byId<HTMLSelectElement>('input-actual-cat');
    const subcatEl = byId<HTMLInputElement>('input-actual-subcat');
    const tagsEl = byId<HTMLInputElement>('input-actual-tags');
    const paidByEl = byId<HTMLSelectElement>('input-actual-paidby');
    if (dateInput) dateInput.value = todayIso();

    const renderPending = () => {
      const box = byId('actual-pending-attachments');
      if (!box) return;
      box.innerHTML = pending.map((a) => `
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[11px]">
          <button type="button" data-att="${a.id}" class="btn-view-pending flex items-center gap-1 hover:text-brand-600"><i class="fa-solid ${fileIcon(a)}"></i> ${escapeHtml(a.name)}</button>
          <button type="button" data-att="${a.id}" title="Retirer" class="btn-drop-pending text-slate-400 hover:text-rose-500"><i class="fa-solid fa-xmark"></i></button>
        </span>`).join('');
    };

    const resetForm = (discard = true) => {
      // Les fichiers joints puis abandonnés ne restent pas sur le disque.
      if (discard) for (const a of pending) if (!original.some((o) => o.id === a.id)) void removeAttachment(ctx, a);
      editingId = null;
      editingMonth = null;
      categoryTouched = false;
      pending = [];
      original = [];
      if (labelEl) labelEl.value = '';
      if (amountEl) amountEl.value = '';
      if (catEl) catEl.value = 'Divers';
      if (subcatEl) subcatEl.value = '';
      if (tagsEl) tagsEl.value = '';
      if (paidByEl) paidByEl.value = 'A';
      if (dateInput) dateInput.value = todayIso();
      setText('actual-form-title', 'Ajouter une Dépense');
      byId('btn-cancel-actual-edit')?.classList.add('hidden');
      const submit = byId('btn-submit-actual');
      if (submit) submit.innerHTML = '<i class="fa-solid fa-plus"></i> Enregistrer';
      renderPending();
    };

    byId('actuals-month-tabs')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-month]');
      if (!btn) return;
      ui.selectedActualMonth = Number(btn.dataset.month);
      resetForm();
      store.refresh();
    });

    // Catégorie devinée pendant la saisie du libellé.
    catEl?.addEventListener('change', () => { categoryTouched = true; store.refresh(); });
    labelEl?.addEventListener('input', () => {
      if (!categoryTouched && catEl) catEl.value = categorize(labelEl.value, store.get().categoryRules);
    });

    on('btn-actual-attach', 'click', async () => {
      const file = await pickFile();
      if (!file) return;
      try {
        pending.push(await storeAttachment(ctx, file));
        renderPending();
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Fichier illisible', false);
      }
    });

    byId('actual-pending-attachments')?.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const view = el.closest<HTMLElement>('.btn-view-pending');
      const drop = el.closest<HTMLElement>('.btn-drop-pending');
      const id = (view ?? drop)?.dataset.att;
      const ref = pending.find((a) => a.id === id);
      if (!ref) return;
      if (view) void showAttachment(ctx, ref);
      else {
        pending = pending.filter((a) => a.id !== id);
        if (!original.some((o) => o.id === id)) void removeAttachment(ctx, ref);
        renderPending();
      }
    });

    on('form-add-actual', 'submit', (e) => {
      e.preventDefault();
      const label = labelEl?.value.trim();
      const amount = parseFloat(amountEl?.value ?? '') || 0;
      const category = (catEl?.value ?? 'Divers') as ExpenseCategory;
      if (!label || amount <= 0) return;
      const couple = store.get().couple.enabled;
      const tx: Omit<ActualExpense, 'id'> = {
        date: dateInput?.value || todayIso(),
        label,
        amount,
        category,
        subcategory: subcatEl?.value.trim() || undefined,
        tags: parseTags(tagsEl?.value ?? ''),
        attachments: [...pending],
        paidBy: couple ? ((paidByEl?.value as Payer) || 'A') : undefined,
      };
      if (!tx.tags?.length) delete tx.tags;
      if (!tx.attachments?.length) delete tx.attachments;
      const month = editingMonth ?? ui.selectedActualMonth;
      const wasEditing = editingId !== null;
      // Pièces retirées pendant la modification : supprimées du disque à l'enregistrement.
      for (const o of original) if (!pending.some((a) => a.id === o.id)) void removeAttachment(ctx, o);
      store.update((s) => {
        if (editingId !== null) {
          const list = s.actualExpenses[month];
          const i = list.findIndex((t) => t.id === editingId);
          if (i >= 0) {
            if (list[i].category !== category) learnCategory(s, label, category);
            list[i] = { id: list[i].id, ...tx };
          }
        } else {
          s.actualExpenses[month].push({ id: Date.now(), ...tx });
        }
      });
      resetForm(false);
      showToast(wasEditing ? 'Dépense modifiée !' : 'Dépense réelle ajoutée !');
    });

    on('btn-cancel-actual-edit', 'click', () => resetForm());

    on('csv-upload-btn', 'click', async () => {
      try {
        const text = await platform.openTextFile({ name: 'Relevé bancaire CSV', extensions: ['csv'] });
        if (text == null) return;
        const rows = parseBankCsv(text, store.get().categoryRules);
        store.update((s) => s.actualExpenses[ui.selectedActualMonth].push(...rows));
        const sorted = rows.filter((r) => r.category !== 'Divers').length;
        showToast(`${rows.length} transaction(s) importée(s), dont ${sorted} classée(s) automatiquement`);
      } catch {
        showToast('Erreur lors de la lecture du fichier CSV', false);
      }
    });

    const findTx = (el: HTMLElement) => {
      const month = Number(el.dataset.month);
      const id = Number(el.dataset.id);
      return { month, id, tx: store.get().actualExpenses[month]?.find((t) => t.id === id) };
    };

    const tbody = byId('actuals-table-body');
    tbody?.addEventListener('click', async (e) => {
      const el = e.target as HTMLElement;
      const del = el.closest<HTMLElement>('.btn-del-tx');
      if (del) {
        const { month, id, tx } = findTx(del);
        if (!tx) return;
        if (tx.attachments?.length && !(await confirmDialog(`Supprimer « ${tx.label} » et ses ${tx.attachments.length} pièce(s) jointe(s) ?`))) return;
        if (id === editingId) resetForm();
        for (const a of tx.attachments ?? []) void removeAttachment(ctx, a);
        store.update((s) => {
          s.actualExpenses[month] = s.actualExpenses[month].filter((t) => t.id !== id);
        });
        return;
      }
      const view = el.closest<HTMLElement>('.btn-view-att');
      if (view) {
        const { tx } = findTx(view);
        const ref = tx?.attachments?.find((a) => a.id === view.dataset.att);
        if (ref) void showAttachment(ctx, ref);
        return;
      }
      const attach = el.closest<HTMLElement>('.btn-attach-tx');
      if (attach) {
        const { month, id } = findTx(attach);
        const file = await pickFile();
        if (!file) return;
        try {
          const ref = await storeAttachment(ctx, file);
          store.update((s) => {
            const t = s.actualExpenses[month].find((x) => x.id === id);
            if (t) t.attachments = [...(t.attachments ?? []), ref];
          });
          showToast('Pièce jointe ajoutée');
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Fichier illisible', false);
        }
        return;
      }
      const tagBtn = el.closest<HTMLElement>('[data-tag]');
      if (tagBtn) {
        ui.filter = { ...ui.filter, tag: tagBtn.dataset.tag };
        store.refresh();
        return;
      }
      const edit = el.closest<HTMLElement>('.btn-edit-tx');
      if (edit) {
        const { month, tx } = findTx(edit);
        if (!tx) return;
        resetForm();
        editingId = tx.id;
        editingMonth = month;
        categoryTouched = true;
        pending = [...(tx.attachments ?? [])];
        original = [...pending];
        if (dateInput) dateInput.value = tx.date;
        if (labelEl) labelEl.value = tx.label;
        if (amountEl) amountEl.value = String(tx.amount);
        if (catEl) catEl.value = String(tx.category);
        if (subcatEl) subcatEl.value = tx.subcategory ?? '';
        if (tagsEl) tagsEl.value = (tx.tags ?? []).join(', ');
        if (paidByEl) paidByEl.value = tx.paidBy ?? 'A';
        renderPending();
        setText('actual-form-title', month === ui.selectedActualMonth ? 'Modifier la dépense' : `Modifier la dépense (${MONTH_NAMES[month]})`);
        byId('btn-cancel-actual-edit')?.classList.remove('hidden');
        const submit = byId('btn-submit-actual');
        if (submit) submit.innerHTML = '<i class="fa-solid fa-check"></i> Mettre à jour';
        byId('form-add-actual')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        labelEl?.focus();
        store.refresh();
      }
    });

    // Changement de catégorie directement dans le tableau : la correction est retenue.
    tbody?.addEventListener('change', (e) => {
      const select = (e.target as HTMLElement).closest<HTMLSelectElement>('.sel-cat-tx');
      if (!select) return;
      const id = Number(select.dataset.id);
      const month = Number(select.dataset.month);
      const category = select.value as ExpenseCategory;
      let others = 0;
      store.update((s) => {
        const tx = s.actualExpenses[month].find((t) => t.id === id);
        if (!tx) return;
        tx.category = category;
        others = learnCategory(s, tx.label, category);
      });
      showToast(others ? `Catégorie retenue, ${others} autre(s) dépense(s) reclassée(s)` : 'Catégorie retenue pour les prochains imports');
    });

    // Recherche et filtres.
    const num = (id: string) => {
      const v = byId<HTMLInputElement>(id)?.value ?? '';
      return v === '' ? undefined : parseFloat(v);
    };
    const readFilter = () => {
      ui.filter = {
        text: byId<HTMLInputElement>('filter-text')?.value.trim() || undefined,
        category: byId<HTMLSelectElement>('filter-category')?.value || undefined,
        tag: byId<HTMLSelectElement>('filter-tag')?.value || undefined,
        min: num('filter-min'),
        max: num('filter-max'),
      };
      ui.filterAllMonths = !!byId<HTMLInputElement>('filter-all-months')?.checked;
      store.refresh();
    };
    for (const id of ['filter-text', 'filter-min', 'filter-max']) byId(id)?.addEventListener('input', readFilter);
    for (const id of ['filter-category', 'filter-tag', 'filter-all-months']) byId(id)?.addEventListener('change', readFilter);
    on('filter-reset', 'click', () => {
      ui.filter = {};
      ui.filterAllMonths = false;
      for (const id of ['filter-text', 'filter-min', 'filter-max']) { const el = byId<HTMLInputElement>(id); if (el) el.value = ''; }
      store.refresh();
    });
    byId('tag-chips')?.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-tag]');
      if (!chip) return;
      ui.filter = { ...ui.filter, tag: ui.filter.tag === chip.dataset.tag ? undefined : chip.dataset.tag };
      store.refresh();
    });
  },

  render(s, _t, { ui }) {
    const month = ui.selectedActualMonth;
    const list: ActualExpense[] = s.actualExpenses[month] ?? [];
    const couple = s.couple.enabled;

    const nav = byId('actuals-month-tabs');
    if (nav) {
      nav.innerHTML = MONTH_NAMES.map((m, idx) => `
        <button data-month="${idx}" class="px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition ${
          idx === month ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
        }">${m}</button>`).join('');
    }

    // Le prévu tient compte du budget propre à ce mois.
    const o = computeActualsOverview(totalsForMonth(s, month), list);
    setText('actuals-month-title', MONTH_NAMES[month]);
    setText('actuals-planned-total', formatCurrency(o.planned));
    setText('actuals-real-total', formatCurrencyCents(o.real));

    const ly = lastYearSameMonth(s, month);
    const lyEl = byId('actuals-last-year');
    if (lyEl) {
      if (!ly) lyEl.textContent = '';
      else {
        const d = o.real - ly.total;
        const pct = ly.total > 0 ? Math.round((d / ly.total) * 100) : 0;
        lyEl.innerHTML = `${MONTH_NAMES[month]} dernier : ${formatCurrency(ly.total)} <span class="font-semibold ${d > 0 ? 'text-rose-600' : 'text-emerald-600'}">(${d > 0 ? '+' : ''}${pct} %)</span>`;
        lyEl.title = `D'après « ${ly.archiveTitle} »`;
      }
    }

    const badge = byId('actuals-diff-badge');
    const amount = byId('actuals-diff-amount');
    const under = o.diff >= 0;
    if (badge) {
      badge.className = `text-xs px-2 py-0.5 rounded-full font-bold ${under ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`;
      badge.textContent = under ? 'Sous budget' : 'Dépassement';
    }
    if (amount) {
      amount.className = `text-xl font-bold mt-1 ${under ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
      amount.textContent = under ? `+ ${formatCurrency(o.diff)}` : formatCurrency(o.diff);
    }

    setText('actuals-progress-pct', `${o.pct}%`);
    const bar = byId('actuals-progress-bar');
    if (bar) {
      bar.style.width = `${o.pct}%`;
      bar.className = `${BAR_COLOR[o.level]} h-2.5 rounded-full transition-all duration-300`;
    }

    const cats = byId('actuals-categories-bars');
    if (cats) {
      cats.innerHTML = o.categories.map((c) => {
        const prev = ly?.byCategory[c.name];
        return `
        <div class="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div class="flex justify-between items-center text-xs mb-1 font-semibold">
            <span>${c.name}</span>
            <span>${formatCurrency(c.spent)} / ${formatCurrency(c.planned)} (${c.pct}%)</span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div class="${BAR_COLOR[c.level]} h-2 rounded-full transition-all duration-300" style="width: ${c.pct}%"></div>
          </div>
          ${prev !== undefined ? `<div class="text-[10px] text-slate-400 mt-1">L'an dernier : ${formatCurrency(prev)}</div>` : ''}
        </div>`;
      }).join('');
    }

    // Budget à deux.
    byId('couple-settlement')?.classList.toggle('hidden', !couple || !list.length);
    byId('paid-by-wrap')?.classList.toggle('hidden', !couple);
    byId('th-paid-by')?.classList.toggle('hidden', !couple);
    const paidBy = byId<HTMLSelectElement>('input-actual-paidby');
    if (paidBy) {
      const v = paidBy.value || 'A';
      paidBy.innerHTML = `<option value="A">${escapeHtml(s.couple.nameA)}</option><option value="B">${escapeHtml(s.couple.nameB)}</option>`;
      paidBy.value = v;
    }
    if (couple && list.length) {
      const st = settlement(s, list);
      setText('couple-settlement-detail', `${s.couple.nameA} a payé ${formatCurrencyCents(st.paidA)} (sa part : ${formatCurrencyCents(st.dueA)}) · ${s.couple.nameB} a payé ${formatCurrencyCents(st.paidB)} (sa part : ${formatCurrencyCents(st.dueB)})`);
      setText('couple-settlement-result', Math.abs(st.balance) < 0.01 ? 'Les comptes sont équilibrés'
        : st.balance > 0 ? `${s.couple.nameB} doit ${formatCurrencyCents(st.balance)} à ${s.couple.nameA}` : `${s.couple.nameA} doit ${formatCurrencyCents(-st.balance)} à ${s.couple.nameB}`);
    }

    // Suggestions de saisie.
    const catEl = byId<HTMLSelectElement>('input-actual-cat');
    const subList = byId('subcat-suggestions');
    if (subList) subList.innerHTML = knownSubcategories(s, catEl?.value ?? 'Divers').map((x) => `<option value="${escapeHtml(x)}">`).join('');
    const tags = tagTotals(s);
    const tagList = byId('tag-suggestions');
    if (tagList) tagList.innerHTML = tags.map((t) => `<option value="${escapeHtml(t.tag)}">`).join('');

    // Filtres.
    const f = ui.filter;
    const fCat = byId<HTMLSelectElement>('filter-category');
    if (fCat) {
      fCat.innerHTML = `<option value="">Toutes</option>${EXPENSE_CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}`;
      fCat.value = f.category ?? '';
    }
    const fTag = byId<HTMLSelectElement>('filter-tag');
    if (fTag) {
      fTag.innerHTML = `<option value="">Toutes</option>${tags.map((t) => `<option value="${escapeHtml(t.tag)}">${escapeHtml(t.tag)}</option>`).join('')}`;
      fTag.value = f.tag ?? '';
    }
    const all = byId<HTMLInputElement>('filter-all-months');
    if (all) all.checked = ui.filterAllMonths;
    const active = isFilterActive(f) || ui.filterAllMonths;
    byId('filter-reset')?.classList.toggle('hidden', !active);
    const chips = byId('tag-chips');
    if (chips) {
      chips.innerHTML = tags.slice(0, 8).map((t) => `
        <button data-tag="${escapeHtml(t.tag)}" class="px-2 py-1 rounded-lg border text-[11px] transition ${f.tag === t.tag ? 'bg-rose-600 border-rose-600 text-white' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-rose-400'}">#${escapeHtml(t.tag)} <b>${formatCurrency(t.total)}</b></button>`).join('');
    }

    const rows = filterRows(s, ui);
    const total = rows.reduce((a, r) => a + r.tx.amount, 0);
    setText('filter-summary', active ? `${rows.length} dépense(s) trouvée(s) · ${formatCurrencyCents(total)}` : `${rows.length} dépense(s) en ${MONTH_NAMES[month].toLowerCase()} · ${formatCurrencyCents(total)}`);

    const tbody = byId('actuals-table-body');
    if (!tbody) return;
    const cols = couple ? 6 : 5;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${cols}" class="p-4 text-center text-xs text-slate-400 italic">${active ? 'Aucune dépense ne correspond à la recherche.' : 'Aucune dépense saisie pour ce mois. Ajoutez-en une ci-dessus ou importez un relevé bancaire CSV.'}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(({ month: m, tx }) => `
      <tr class="${tx.id === editingId ? 'bg-rose-50 dark:bg-rose-950/30' : ''}">
        <td class="p-3 text-xs text-slate-500 whitespace-nowrap">${escapeHtml(formatDate(tx.date || '-'))}${ui.filterAllMonths ? `<div class="text-[10px] text-slate-400">${MONTH_NAMES[m]}</div>` : ''}</td>
        <td class="p-3">
          <div class="font-semibold text-slate-800 dark:text-slate-100">${escapeHtml(tx.label)}</div>
          ${tx.subcategory || tx.tags?.length || tx.attachments?.length ? `<div class="flex flex-wrap items-center gap-1 mt-1">
            ${tx.subcategory ? `<span class="text-[10px] text-slate-500">${escapeHtml(tx.subcategory)}</span>` : ''}
            ${(tx.tags ?? []).map((t) => `<button data-tag="${escapeHtml(t)}" class="hover:opacity-70">${tagChip(t)}</button>`).join('')}
            ${(tx.attachments ?? []).map((a) => `<button data-id="${tx.id}" data-month="${m}" data-att="${a.id}" title="${escapeHtml(a.name)}" class="btn-view-att text-brand-600 hover:text-brand-800 text-xs"><i class="fa-solid ${fileIcon(a)}"></i></button>`).join('')}
          </div>` : ''}
        </td>
        <td class="p-3">
          <select data-id="${tx.id}" data-month="${m}" class="sel-cat-tx px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-300 dark:hover:border-slate-500 cursor-pointer">
            ${categoryOptions(String(tx.category))}
          </select>
        </td>
        <td class="p-3 text-right font-bold text-rose-600 whitespace-nowrap">${formatCurrencyCents(tx.amount)}</td>
        ${couple ? `<td class="p-3 text-xs">${escapeHtml(tx.paidBy === 'B' ? s.couple.nameB : s.couple.nameA)}</td>` : ''}
        <td class="p-3 text-center whitespace-nowrap">
          <button data-id="${tx.id}" data-month="${m}" title="Joindre un fichier" class="btn-attach-tx text-slate-400 hover:text-brand-600 p-1">
            <i class="fa-solid fa-paperclip text-xs"></i>
          </button>
          <button data-id="${tx.id}" data-month="${m}" title="Modifier" class="btn-edit-tx text-slate-400 hover:text-brand-600 p-1">
            <i class="fa-solid fa-pen text-xs"></i>
          </button>
          <button data-id="${tx.id}" data-month="${m}" title="Supprimer" class="btn-del-tx text-rose-500 hover:text-rose-700 p-1">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </td>
      </tr>`).join('');
  },
};

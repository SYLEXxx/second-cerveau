import { INVEST_CATEGORIES } from '../../domain/defaults';
import { escapeHtml, formatCurrency, formatCurrencyCents } from '../../domain/format';
import { initKey } from '../../domain/invest';
import type { Account, AccountKind } from '../../domain/types';
import { ACCOUNT_KINDS, computeNetWorth, expectedInvestValue } from '../../domain/wealth';
import { axes, renderChart } from '../charts';
import type { View } from '../context';
import { confirmDialog, formDialog, promptAmount, showToast } from '../dialogs';
import { byId, on, setText } from '../dom';

const KIND_ICON: Record<AccountKind, string> = {
  courant: 'fa-credit-card text-brand-600',
  epargne: 'fa-piggy-bank text-emerald-500',
  joint: 'fa-user-group text-amber-500',
  autre: 'fa-wallet text-slate-500',
};

const kindLabel = (k: AccountKind) => ACCOUNT_KINDS.find((x) => x.value === k)?.label ?? k;
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
};

async function editAccount(a?: Account) {
  return formDialog({
    title: a ? 'Modifier le compte' : 'Nouveau compte',
    icon: 'fa-building-columns',
    submitLabel: a ? 'Enregistrer' : 'Ajouter le compte',
    fields: [
      { key: 'name', label: 'Nom', type: 'text', value: a?.name ?? '', placeholder: 'ex: Compte courant, Livret A...', required: true },
      { key: 'kind', label: 'Type', type: 'select', value: a?.kind ?? 'courant', options: ACCOUNT_KINDS.map((k) => ({ ...k })) },
      { key: 'balance', label: 'Solde actuel (€)', type: 'number', value: a?.balance ?? null, required: true, hint: 'Un solde négatif correspond à un découvert.' },
    ],
  });
}

export const wealthView: View = {
  mount({ store }) {
    on('btn-add-account', 'click', async () => {
      const v = await editAccount();
      if (!v) return;
      store.update((s) => s.accounts.push({
        id: Date.now(), name: String(v.name), kind: v.kind as AccountKind, balance: Number(v.balance) || 0, updatedAt: new Date().toISOString(),
      }));
      showToast('Compte ajouté !');
    });

    byId('accounts-list')?.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const account = store.get().accounts.find((a) => a.id === id);
      if (!account) return;
      if (btn.classList.contains('btn-del-account')) {
        if (!(await confirmDialog(`Supprimer le compte « ${account.name} » ?`))) return;
        store.update((s) => { s.accounts = s.accounts.filter((a) => a.id !== id); });
      } else if (btn.classList.contains('btn-edit-account')) {
        const v = await editAccount(account);
        if (!v) return;
        store.update((s) => {
          const a = s.accounts.find((x) => x.id === id);
          if (!a) return;
          const balance = Number(v.balance) || 0;
          if (balance !== a.balance) a.updatedAt = new Date().toISOString();
          Object.assign(a, { name: String(v.name), kind: v.kind as AccountKind, balance });
        });
      } else if (btn.classList.contains('btn-balance-account')) {
        const balance = await promptAmount(`Solde de « ${account.name} »`, 'Solde affiché par votre banque aujourd\'hui (€)', String(account.balance));
        if (balance === null) return;
        store.update((s) => {
          const a = s.accounts.find((x) => x.id === id);
          if (a) Object.assign(a, { balance, updatedAt: new Date().toISOString() });
        });
        showToast('Solde mis à jour');
      }
    });

    byId('invest-real-body')?.addEventListener('change', (e) => {
      const input = (e.target as HTMLElement).closest<HTMLInputElement>('.inp-invest-real');
      if (!input) return;
      const id = input.dataset.cat!;
      store.update((s) => {
        if (input.value === '') delete s.investValues[id];
        else s.investValues[id] = { value: parseFloat(input.value) || 0, date: new Date().toISOString() };
      });
    });
  },

  render(s) {
    const nw = computeNetWorth(s);
    setText('nw-total', formatCurrency(nw.total));
    setText('nw-accounts', formatCurrency(nw.accounts));
    setText('nw-investments', formatCurrency(nw.investments));
    setText('nw-debts', nw.debts ? `- ${formatCurrency(nw.debts)}` : formatCurrency(0));

    const hist = s.netWorthHistory;
    const prev = hist.length > 1 ? hist[hist.length - 2] : null;
    const diff = prev ? Math.round(nw.total) - prev.value : null;
    setText('nw-trend', diff === null ? 'Premier mois suivi' : `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} depuis ${monthLabel(prev!.month)}`);

    const list = byId('accounts-list');
    if (list) {
      list.innerHTML = s.accounts.length === 0
        ? `<p class="text-xs text-slate-400 italic p-4 text-center bg-slate-50 dark:bg-slate-700/20 rounded-xl">Aucun compte. Ajoutez votre compte courant et vos livrets pour suivre votre valeur nette et le solde prévu dans le calendrier.</p>`
        : s.accounts.map((a) => `
          <div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700">
            <i class="fa-solid ${KIND_ICON[a.kind]} w-5 text-center"></i>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold truncate">${escapeHtml(a.name)}</div>
              <div class="text-[11px] text-slate-500">${kindLabel(a.kind)} · mis à jour le ${new Date(a.updatedAt).toLocaleDateString('fr-FR')}</div>
            </div>
            <button data-id="${a.id}" title="Mettre à jour le solde" class="btn-balance-account text-sm font-bold ${a.balance < 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'} hover:underline">${formatCurrencyCents(a.balance)}</button>
            <button data-id="${a.id}" title="Modifier" class="btn-edit-account text-slate-400 hover:text-brand-600 p-1"><i class="fa-solid fa-pen text-xs"></i></button>
            <button data-id="${a.id}" title="Supprimer" class="btn-del-account text-slate-400 hover:text-rose-500 p-1"><i class="fa-solid fa-trash-can text-xs"></i></button>
          </div>`).join('');
    }

    renderChart('chart-networth', {
      type: 'line',
      data: {
        labels: hist.map((p) => monthLabel(p.month)),
        datasets: [{
          label: 'Valeur nette',
          data: hist.map((p) => p.value),
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2,132,199,0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axes() },
    });
    byId('nw-history-hint')?.classList.toggle('hidden', hist.length > 1);

    const body = byId('invest-real-body');
    if (body && !body.contains(document.activeElement)) {
      body.innerHTML = INVEST_CATEGORIES.map((c) => {
        const expected = expectedInvestValue(s, c.id);
        const real = s.investValues[c.id];
        const gap = real ? real.value - expected : null;
        const pct = gap !== null && expected > 0 ? ` (${gap >= 0 ? '+' : ''}${((gap / expected) * 100).toFixed(1).replace('.', ',')} %)` : '';
        return `
          <tr>
            <td class="p-3 font-semibold"><span class="inline-block w-2.5 h-2.5 rounded-full mr-2" style="background:${c.color}"></span>${c.label}</td>
            <td class="p-3 text-right text-slate-500">${formatCurrency(s[initKey(c.id)])}</td>
            <td class="p-3 text-right">${formatCurrency(expected)}</td>
            <td class="p-3 text-right">
              <input type="number" step="any" data-cat="${c.id}" value="${real?.value ?? ''}" placeholder="à saisir" class="inp-invest-real w-28 p-1.5 text-right bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg font-bold">
              ${real ? `<div class="text-[10px] text-slate-400 mt-0.5">au ${new Date(real.date).toLocaleDateString('fr-FR')}</div>` : ''}
            </td>
            <td class="p-3 text-right font-semibold ${gap === null ? 'text-slate-400' : gap >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${gap === null ? '-' : `${gap >= 0 ? '+' : ''}${formatCurrency(gap)}${pct}`}</td>
          </tr>`;
      }).join('');
    }
  },
};

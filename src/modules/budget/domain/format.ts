const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const formatCurrency = (val: number | undefined | null) => currency.format(val || 0);

const currencyCents = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Montant au centime près, pour les dépenses réelles (relevés bancaires). */
export const formatCurrencyCents = (val: number | undefined | null) => currencyCents.format(val || 0);

export const escapeHtml = (text: unknown) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const camelToKebab = (s: string) => s.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();

/** « 2026-10-19 » → « 19/10/2026 » ; laisse tel quel ce qui n'est pas une date ISO. */
export const formatDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

export const todayIso = (now: Date = new Date()) => now.toISOString().split('T')[0];

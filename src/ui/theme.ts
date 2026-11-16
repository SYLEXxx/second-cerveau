// Thème partagé avec le module budget (même préférence que MonBudgetPro).
const KEY = 'monbudgetpro_pref_theme';
export type ThemePref = 'light' | 'dark' | 'auto';

export function getTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(pref: ThemePref = getTheme()): void {
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f172a' : '#f8fafc');
}

export function setTheme(pref: ThemePref): void {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* préférence non retenue */
  }
  applyTheme(pref);
}

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

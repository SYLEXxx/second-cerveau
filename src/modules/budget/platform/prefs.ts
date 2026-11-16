// Préférences locales (localStorage) : partagées par les deux plateformes.
const PREFIX = 'monbudgetpro_pref_';

export function getPref(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* stockage indisponible : la préférence n'est simplement pas retenue */
  }
}

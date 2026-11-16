import { migrate } from './domain/migrations';
import { createDefaultState } from './domain/defaults';
import type { BudgetState } from './domain/types';
import type { Platform } from './platform/platform';
import { deriveKey, encryptText, isEncrypted, type VaultKey } from './domain/vault';

type Listener = (state: BudgetState) => void;
/** Ouvre un fichier chiffré (demande le mot de passe) ; renvoie le texte et la clé. */
export type Unlocker = (raw: string) => Promise<{ text: string; vault: VaultKey }>;
/** Calcul dérivé appliqué après chaque modification (historique de la valeur nette...). */
type Hook = (draft: BudgetState) => void;

const SAVE_DELAY_MS = 300;

/**
 * Source unique de vérité : l'interface lit l'état ici et le modifie
 * uniquement via update()/replace(). Chaque changement notifie les vues et
 * déclenche une sauvegarde automatique (regroupée pour ne pas écrire le
 * fichier à chaque mouvement de curseur).
 */
export class Store {
  private state: BudgetState;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private hooks: Hook[] = [];
  /** Clé de chiffrement quand un mot de passe protège les données. */
  private vault: VaultKey | null = null;

  private constructor(private platform: Platform, initial: BudgetState) {
    this.state = initial;
  }

  static async load(platform: Platform, unlock: Unlocker): Promise<Store> {
    let initial = createDefaultState();
    let found = false;
    let vault: VaultKey | null = null;
    const raw = await platform.loadState().catch(() => null);
    if (raw && isEncrypted(raw)) {
      // Pas de repli sur les données par défaut : elles écraseraient le fichier chiffré.
      const opened = await unlock(raw);
      initial = migrate(JSON.parse(opened.text));
      vault = opened.vault;
      found = true;
    } else if (raw) {
      try {
        initial = migrate(JSON.parse(raw));
        found = true;
      } catch (e) {
        console.warn('Sauvegarde illisible, données par défaut utilisées', e);
      }
    }
    const store = new Store(platform, initial);
    store.vault = vault;
    // Premier lancement : le fichier de données existe dès l'ouverture.
    if (!found) await store.flush();
    return store;
  }

  get(): BudgetState {
    return this.state;
  }

  update(mutator: (draft: BudgetState) => void): void {
    mutator(this.state);
    this.hooks.forEach((h) => h(this.state));
    this.changed();
  }

  replace(next: BudgetState): void {
    this.state = next;
    this.hooks.forEach((h) => h(this.state));
    this.changed();
  }

  addHook(hook: Hook): void {
    this.hooks.push(hook);
  }

  get isProtected(): boolean {
    return this.vault !== null;
  }

  get vaultKey(): VaultKey | null {
    return this.vault;
  }

  /** Protège les données par un mot de passe (null = retire la protection) et réécrit le fichier. */
  async setPassword(password: string | null): Promise<VaultKey | null> {
    this.vault = password ? await deriveKey(password) : null;
    await this.flush();
    return this.vault;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Notifie les vues sans modifier les données (changement de thème, d'onglet...). */
  refresh(): void {
    this.listeners.forEach((fn) => fn(this.state));
  }

  toJson(pretty = false): string {
    return JSON.stringify(this.state, null, pretty ? 2 : undefined);
  }

  async flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    try {
      const json = this.toJson();
      await this.platform.saveState(this.vault ? await encryptText(this.vault, json) : json);
    } catch (e) {
      console.error('Échec de la sauvegarde', e);
    }
  }

  private changed(): void {
    this.refresh();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }
}

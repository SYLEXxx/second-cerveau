import type { VaultState } from './types';
import { saveVault } from './storage';

type Listener = (s: VaultState) => void;

const SAVE_DELAY_MS = 400;

/** Source unique de vérité du coffre, avec sauvegarde automatique regroupée. */
export class VaultStore {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private state: VaultState, private persist: (s: VaultState) => Promise<void> = saveVault) {}

  get(): VaultState {
    return this.state;
  }

  /** Modifie l'état ; `silent` évite de redessiner l'écran (saisie en cours dans l'éditeur). */
  update(fn: (s: VaultState) => void, silent = false): void {
    fn(this.state);
    if (!silent) this.listeners.forEach((l) => l(this.state));
    this.schedule();
  }

  replace(next: VaultState): void {
    this.state = next;
    this.listeners.forEach((l) => l(this.state));
    this.schedule();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    try {
      await this.persist(this.state);
    } catch (e) {
      console.error('Échec de la sauvegarde', e);
    }
  }
}

// Tout ce qui dépend de l'environnement d'exécution (application de bureau
// Tauri ou simple navigateur pour le développement) passe par cette interface.
// Le reste du code n'appelle jamais Tauri directement.

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface Platform {
  readonly isDesktop: boolean;
  /** Contenu JSON de la sauvegarde principale, ou null au premier lancement. */
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<void>;
  /** Propose d'enregistrer un fichier ; renvoie false si l'utilisateur annule. */
  saveTextFile(defaultName: string, contents: string, filter: FileFilter): Promise<boolean>;
  /** Comme saveTextFile, pour un fichier binaire (classeur Excel...). */
  saveBinaryFile(defaultName: string, bytes: Uint8Array, filter: FileFilter): Promise<boolean>;
  /** Pièces jointes (tickets, factures), rangées à côté des données. */
  putAttachment(id: string, bytes: Uint8Array): Promise<void>;
  getAttachment(id: string): Promise<Uint8Array | null>;
  deleteAttachment(id: string): Promise<void>;
  /** Fait choisir un fichier et renvoie son contenu ; null si annulé. */
  openTextFile(filter: FileFilter): Promise<string | null>;
  /** Préférences d'affichage (thème...), hors des données budgétaires. */
  getPref(key: string): string | null;
  setPref(key: string, value: string): void;
  /** Exécute `fn` (dernière sauvegarde) avant la fermeture de la fenêtre. */
  onBeforeExit(fn: () => Promise<void>): void;
}

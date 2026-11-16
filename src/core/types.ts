import type { InkData } from './ink';

// Modèle de données du second cerveau.
// Tout est une « page » (comme Notion) : une note markdown, une base de données
// (kind = 'database', avec un schéma de propriétés) ou une ligne de base
// (page dont le parent est une base, avec des valeurs de propriétés).

export type PropType = 'text' | 'number' | 'select' | 'multi' | 'date' | 'checkbox' | 'url';

export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

export interface PropDef {
  id: string;
  name: string;
  type: PropType;
  options?: SelectOption[];
}

export type ViewType = 'table' | 'board' | 'list';

export interface DbView {
  id: string;
  name: string;
  type: ViewType;
  /** Propriété « sélection » qui fait les colonnes du tableau kanban. */
  groupBy?: string;
  sort?: { prop: string; dir: 'asc' | 'desc' };
  /** Filtre texte rapide sur le titre et les propriétés. */
  query?: string;
}

export interface DbSchema {
  props: PropDef[];
  views: DbView[];
  activeView: string;
}

export type PropValue = string | number | boolean | string[] | null;

export type PageKind = 'page' | 'database' | 'canvas';


export interface Page {
  id: string;
  kind: PageKind;
  title: string;
  icon: string;
  parentId: string | null;
  /** Contenu markdown (pour une base : sa description). */
  content: string;
  /** Valeurs de propriétés quand la page est une ligne de base (clé = id de propriété). */
  props: Record<string, PropValue>;
  schema?: DbSchema;
  /** Tableau blanc manuscrit (kind = 'canvas'). */
  ink?: InkData;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  /** Date de mise à la corbeille ; absente = page active. */
  trashedAt?: number;
}

export interface VaultState {
  version: 1;
  pages: Record<string, Page>;
  /** Ordre d'affichage des pages racines et des sous-pages (par parent). */
  order: Record<string, string[]>;
}

export const ROOT = '__root__';

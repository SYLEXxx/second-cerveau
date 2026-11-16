# Second cerveau

Application mobile de prise de notes qui mélange **Notion** (pages imbriquées, bases de données
avec vues tableau / kanban / liste) et **Obsidian** (markdown, `[[liens wiki]]`, rétroliens,
étiquettes, graphe), avec **MonBudgetPro** intégré comme module Budget.

Tout fonctionne hors ligne et les données restent sur le téléphone.

## Fonctionnalités

**Notes (Obsidian)**
- Markdown : titres, listes, cases à cocher (cochables en lecture), citations, code, tableaux, `==surlignage==`.
- `[[Liens wiki]]` et `[[Page|alias]]` ; un lien vers une page inexistante la crée au toucher.
- `![[Page]]` intègre une page ou une base dans une autre.
- Rétroliens en bas de chaque page ; renommer une page met à jour tous les liens.
- Étiquettes `#idée`, `#lecture/livres` ; encadrés `> [!note]`, `> [!tip]`, `> [!warning]`.
- Note du jour (rangée sous « Journal »), graphe interactif (pincer, glisser, toucher).
- Export de toutes les notes en `.md` (zip compatible Obsidian) et import de fichiers `.md`.

**Pages et bases (Notion)**
- Pages et sous-pages à l'infini, icônes emoji, favoris, corbeille avec restauration.
- Commandes `/` dans l'éditeur (titres, tâches, encadrés, tableau, sous-page, base, résumé du budget).
- Bases de données : propriétés Texte, Nombre, Sélection, Multi-sélection, Date, Case à cocher, Lien ;
  vues Tableau, Kanban (regroupé par une sélection) et Liste ; filtre, tri, export CSV.
  Chaque ligne est une page avec son propre contenu.

**Budget (MonBudgetPro 0.5.0)**
- Le module complet est repris : résumé, 12 mois, calendrier, budget mensuel, abonnements,
  dépenses réelles (import CSV bancaire), scénarios, comptes, investissements, projets et dettes,
  archives, mot de passe, export Excel.
- Résumé du mois sur l'accueil, bouton « Dépense » pour une saisie rapide,
  et bloc ` ```budget ` à insérer dans n'importe quelle note.
- Les sauvegardes `.json` de MonBudgetPro sur ordinateur se chargent telles quelles
  (Budget > bouton « charger » en haut).

## Installer sur le téléphone

### Android : l'application (.apk)

L'APK se construit automatiquement sur GitHub (pas besoin d'Android Studio) :

1. Créez un dépôt GitHub (privé de préférence) et envoyez-y ce dossier.
2. Onglet **Actions** > **Application Android** : l'exécution démarre à chaque envoi sur `main`
   (ou « Run workflow »). Après ~5 minutes, téléchargez `second-cerveau-apk` en bas de la page.
3. Sur le téléphone, ouvrez le fichier `app-debug.apk` et autorisez l'installation
   depuis cette source.

Avec Android Studio installé, `npm run android` ouvre le projet, prêt à lancer sur un téléphone branché.

### Version web installable (Android et iPhone)

1. Dans le dépôt GitHub : **Settings > Pages > Source : GitHub Actions**.
   Le workflow « Version web » publie l'application à chaque envoi.
2. Ouvrez l'adresse affichée sur le téléphone, puis **Ajouter à l'écran d'accueil**
   (menu ⋮ sur Chrome, bouton Partager sur Safari). L'application fonctionne ensuite hors ligne.

### iPhone (application native)

Le projet est prêt pour Capacitor iOS : sur un Mac avec Xcode,
`npm i @capacitor/ios && npx cap add ios && npx cap open ios`.

## Développer

Prérequis : Node.js 20 ou plus.

```bash
npm install
npm run dev            # http://localhost:5173 (et sur le réseau local pour tester au téléphone)
npm test               # 61 tests : notes, bases, graphe + tests d'origine du budget
npm run build          # version web (dist/) avec service worker hors ligne
npm run build:preview  # un seul fichier HTML autonome (dist-single/)
npm run apk            # APK de débogage (nécessite le SDK Android)
```

## Choix techniques

- **Même stack que MonBudgetPro** : Vite + TypeScript sans framework + Tailwind 3.
  Le code du budget est repris sans réécriture (`src/modules/budget`), avec ses tests.
- **Capacitor** au lieu de Tauri pour le mobile : Tauri Mobile demande Rust + NDK et a moins
  de modules prêts pour le téléphone ; Capacitor emballe directement l'application web
  et fournit le partage de fichiers, le bouton retour Android, etc.
- **Stockage local** : notes dans IndexedDB (avec copie de secours de la version précédente),
  budget dans le même stockage que la version web de MonBudgetPro.
  Pas de synchronisation pour l'instant : utilisez Réglages > Exporter une sauvegarde.

## Structure

```
src/
  core/           modèle et logique pure (pages, liens, bases, graphe, export) - testée
  ui/             écrans (accueil, pages, page/éditeur, base, recherche, graphe, réglages)
  modules/budget/ MonBudgetPro 0.5.0 (domain/, ui/, store) + adaptation mobile (shell.html, index.ts, widget.ts)
  platform/       fichiers : téléchargement (web) ou feuille de partage (Android/iOS)
tests/            tests des notes (core/) et tests d'origine du budget (budget/)
android/          projet Android généré par Capacitor
```

## Limites connues (v0.1)

- Pas de synchronisation entre appareils (export/import manuel).
- L'éditeur est en markdown (comme Obsidian), pas en blocs glissables comme Notion.
- Le rapport imprimable du budget (« Enregistrer en PDF ») ne fonctionne pas dans l'application Android ;
  l'export Excel fonctionne.

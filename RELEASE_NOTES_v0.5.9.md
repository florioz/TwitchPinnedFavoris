# Twitch Favorites Sidebar v0.5.9

## English

This release focuses on sidebar polish: streamer-card-only animations, stronger animation styles, a full visible-card preview, and new group layout options for dense sidebars.

### Sidebar Animations

- Added configurable streamer card animations in the favorites manager.
- Animation previews now run across every visible streamer card instead of only the first few entries.
- Fixed a visual issue where compact-mode transitions could make whole groups or the sidebar feel like they were moving.
- The "Screen fly-in" animation now uses a ghost card that flies into place while the real streamer row stays stable.
- Made animation styles more distinct: stronger slide, pop, glow, bounce, spin, fly-in, and glitch effects.
- Hovering the sidebar no longer triggers accidental streamer animations.

### Group Layouts

- Added a new "Group layout" setting for sidebar group presentation.
- Added "Dense row" for smaller group headers.
- Added "Vertical label" to turn group names into compact side rails and recover vertical space.
- The group layout setting now applies immediately, not only after automatic compact mode marks a group.
- Fixed inline indentation that could make the vertical label style appear unchanged.

### Preferences And Sync

- New animation and group-layout preferences are stored with profiles, backups, and Google Drive sync.
- Existing profiles receive safe defaults automatically.
- Extension, Firefox build files, and mobile version metadata were updated to v0.5.9.

## Francais

Cette version affine la sidebar : animations limitees aux cartes streamer, styles d'animation plus marques, test sur toutes les cartes visibles et nouveaux modes de presentation des groupes pour les sidebars denses.

### Animations Sidebar

- Ajout d'animations configurables pour les cartes streamer dans la gestion des favoris.
- Le bouton de test anime maintenant toutes les cartes streamer visibles au lieu des premieres entrees seulement.
- Correction d'un rendu ou les transitions du compact pouvaient donner l'impression que des groupes entiers ou toute la sidebar bougeaient.
- L'animation "Traversee ecran" utilise maintenant une carte fantome qui arrive dans la sidebar pendant que la vraie ligne reste stable.
- Les styles d'animation sont plus distincts : slide, pop, halo, rebond, vrille, traversee ecran et glitch sont plus visibles.
- Le survol de la sidebar ne declenche plus d'animations accidentelles.

### Presentation Des Groupes

- Ajout d'un reglage "Presentation des groupes" dans l'apparence.
- Ajout du mode "Ligne dense" pour reduire la hauteur des headers de groupes.
- Ajout du mode "Libelle vertical" pour transformer les noms de groupes en rails lateraux compacts.
- Le changement de presentation s'applique maintenant directement, pas seulement quand le compact automatique marque un groupe.
- Correction des indentations inline qui pouvaient rendre le mode vertical presque invisible.

### Preferences Et Synchronisation

- Les nouveaux reglages d'animations et de presentation des groupes sont sauvegardes avec les profils, backups et la synchronisation Google Drive.
- Les profils existants recoivent des valeurs par defaut propres automatiquement.
- L'extension, les fichiers Firefox et les metadonnees mobiles passent en v0.5.9.

## Verification

- `npm run check`
- `npm run sync:firefox`
- `node --check src/contentScripts/features/sidebarRenderer.js`
- `node --check src/contentScripts/features/favoritesOverlay.js`
- `node --check src/contentScripts/features/favoritesStore.js`
- `node --check src/contentScripts/main.js`
- `node --check firefox/src/contentScripts/features/sidebarRenderer.js`

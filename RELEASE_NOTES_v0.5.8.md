# Twitch Favorites Sidebar v0.5.8

## English

This release improves sidebar density and visual control with a smarter automatic compact mode and a new avatar-only streamer style.

### Smart Sidebar Compact Mode

- Added an optional automatic compact mode in the favorites manager.
- The sidebar now compacts the largest visible groups first instead of changing every streamer row at once.
- Groups can now mix different densities in the same sidebar, preserving the user's normal style wherever there is enough room.
- Added a second fallback level for very large groups: avatar-only rows.
- Fixed compact mode oscillation by measuring available sidebar height more reliably.
- Collapsed and small groups are left untouched whenever possible.

### Streamer Appearance

- Added a configurable "Auto compact style" selector.
- Added the "Ultimate compact" streamer style as a normal selectable style.
- Ultimate compact displays streamer avatars in a dense grid.
- Removed the custom hover tooltip from ultimate compact mode because Twitch/browser information is already available.
- Hardened compact rendering so creative styles such as cards, neon, and background avatars do not break automatic compaction.

### Preferences And Sync

- New compact mode preferences are saved with profiles, backups, and Google Drive sync.
- Existing profiles get safe defaults automatically.
- Firefox build files were synchronized.

## Francais

Cette version ameliore la densite de la sidebar et le controle visuel avec un compact automatique plus intelligent et un nouveau style de streamer en avatars seuls.

### Compact Automatique Intelligent

- Ajout d'une option de compact automatique dans la gestion des favoris.
- La sidebar compacte maintenant les plus gros groupes visibles en premier au lieu de changer toute la sidebar d'un coup.
- Plusieurs densites peuvent cohabiter dans la meme sidebar, pour garder le style normal de l'utilisateur partout ou il reste assez de place.
- Ajout d'un second niveau de secours pour les tres gros groupes : affichage en avatars uniquement.
- Correction de l'oscillation entre le style normal et compact avec une mesure plus fiable de la hauteur disponible.
- Les groupes petits ou replies restent inchanges autant que possible.

### Apparence Des Streamers

- Ajout d'un selecteur "Style compact auto".
- Ajout du style "Compact ultime" comme style normal selectionnable.
- Le compact ultime affiche les streamers sous forme de grille d'avatars dense.
- Retrait de l'infobulle custom du compact ultime, car les infos sont deja accessibles autrement.
- Renforcement du rendu compact pour eviter que les styles creatifs comme carte, neon ou avatar en fond cassent la compaction automatique.

### Preferences Et Synchronisation

- Les nouveaux reglages de compact sont sauvegardes avec les profils, backups et la synchronisation Google Drive.
- Les profils existants recoivent des valeurs par defaut propres automatiquement.
- Les fichiers Firefox ont ete synchronises.

## Verification

- `npm run check`
- `npm run sync:firefox`
- `node --check src/contentScripts/features/sidebarRenderer.js`
- `node --check src/contentScripts/features/favoritesOverlay.js`
- `node --check src/contentScripts/features/favoritesStore.js`
- `node --check src/contentScripts/main.js`
- `node --check firefox/src/contentScripts/features/sidebarRenderer.js`

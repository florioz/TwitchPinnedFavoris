Twitch Favorites Sidebar
========================

Twitch Favorites Sidebar is a browser extension and companion mobile app for people who follow many Twitch streamers and want a cleaner way to organize live channels, VODs, and moderation context.

The extension rebuilds the Twitch followed-channels sidebar with custom pinned favorites, nested groups, live filters, profile sync, VOD planning, and chat/moderation tools. The mobile app focuses on the same core library of groups, streamers, profiles, and VODs in a phone-friendly interface.

Current release: v0.5.9

## English

### What It Does

- Pin Twitch streamers into your own favorites list, including channels you do not follow on Twitch.
- Organize streamers into custom groups and subgroups, then reorder them quickly.
- Show live-only favorites with viewer counts, game/category labels, and stream titles.
- Filter favorites by Twitch category, so a streamer can appear only when they are live in specific games or RP servers.
- Manage multiple favorite profiles, useful for different communities, projects, or shared follow lists.
- Sync profiles through Google Drive to move your setup between computers and the mobile app.
- Open a VOD planning page that shows available VODs by day, streamer, group, views, duration, start time, and end time.
- Inspect a VOD with an analysis panel that groups related clips and highlights without losing your place in the list.
- Display recent chat messages in viewer cards with message color, emotes, 7TV support, and broader badge detection.
- Display a draggable moderation history panel for bans, temporary bans, timeouts, and deleted messages.
- Show update indicators on the extension and mobile app when a new GitHub release is available.

### Browser Extension

The extension runs on Twitch and adds:

- a top navigation shortcut to the favorites manager;
- a top navigation shortcut to the VOD planner;
- a Twitch channel favorite button;
- a rebuilt favorites sidebar with live status;
- a floating live panel available outside Twitch;
- profile import/export and Google Drive sync;
- chat history and moderation history tools;
- update notifications and release awareness.

Chrome, Edge, Brave, Opera and other Chromium browsers use the root `manifest.json`. Firefox uses the generated `firefox/` folder.

### Mobile App

The mobile app provides a compact companion experience:

- profile-aware favorites and groups;
- live-only filtering;
- collapsible groups;
- streamer refresh controls;
- VOD list with search, group filters, sort controls, streamer icons, and VOD details;
- VOD highlight/clip analysis;
- Google Drive sync using a mobile OAuth client;
- update notification banner for new releases.

The APK is built from the Capacitor project in `mobile/` and `android/`.

### Release Timeline

#### v0.5.9

- Added streamer-card-only sidebar animations with stronger visual styles.
- The animation preview now tests every visible streamer card.
- Fixed animation behavior so groups and the full sidebar no longer appear to move.
- Added group layout options: Classic, Dense row, and Vertical label.
- Made group layout changes apply immediately and sync with profiles/backups.

#### v0.5.8

- Added smart automatic sidebar compaction that targets the largest visible groups first.
- Added per-group compact levels so normal, compact, and avatar-only groups can coexist.
- Added the selectable Ultimate compact streamer style.
- Added an Auto compact style selector in the favorites manager.
- Improved compact-mode stability and Firefox build synchronization.

#### v0.5.4

- Improved moderation history ordering to match normal chat reading: oldest at the top, newest at the bottom.
- Reduced duplicate moderation entries when Twitch marks several older messages after one ban.
- Improved temporary ban labels with duration when Twitch exposes it, and a clear unknown-duration label when it does not.
- Improved chat history ordering and scroll behavior.
- Expanded chat badge detection for Twitch/extension-modified DOM structures.
- Improved Twitch and 7TV emote rendering in captured chat history.
- Blocked Twitch player shortcuts while typing in the favorites manager.
- Preserved search input focus while the favorites manager re-renders.
- Silenced the expected Chrome side-panel user-gesture fallback error while keeping real side-panel errors visible.

#### v0.5.3

- Removed demo content from the mobile app.
- Added full mobile favorite profile management: switch, create, rename, and delete profiles.
- Cleaned live/VOD caches when changing profiles.

#### v0.5.2

- Improved mobile Google Drive authentication using a device-compatible OAuth flow.
- Added mobile profile synchronization through Drive.

#### v0.5.1

- Improved the mobile app layout and VOD experience.
- Added stronger separation between Groups and VODs on mobile.

#### v0.5.0

- Added Google Drive sync for extension profiles.
- Added update notifications and GitHub release checks.
- Added major mobile app foundations with groups, VODs, filters, and APK builds.

#### v0.4.0

- Added the VOD planning page.
- Added VOD filters, day navigation, sorting, start/end/duration display, and VOD analysis panels.
- Added clip/highlight extraction for VOD inspection.

#### v0.3.0

- Refactored the extension into clearer feature modules.
- Improved sidebar rendering, top navigation, overlays, and state management.

#### v0.2.0

- Stabilized group management.
- Added category/subcategory movement and root-level group reordering.
- Improved drag and drop behavior for larger groups.

### Installation

#### Chrome / Edge / Brave / Opera

1. Download the Chrome ZIP from the latest GitHub release.
2. Extract it.
3. Open `chrome://extensions`.
4. Enable Developer mode.
5. Click Load unpacked.
6. Select the extracted folder.

#### Firefox

1. Download the Firefox ZIP from the latest GitHub release.
2. Extract it.
3. Open `about:debugging#/runtime/this-firefox`.
4. Click Load Temporary Add-on.
5. Select `manifest.json` inside the extracted Firefox folder.

#### Android

1. Download the APK from the latest GitHub release.
2. Install it on your Android device.
3. If Android blocks the install, allow installs from your browser or file manager.
4. Configure Google Drive sync in the app if you want profile synchronization.

## Francais

### Ce Que Fait Le Projet

Twitch Favorites Sidebar est une extension navigateur et une application mobile companion pour organiser proprement beaucoup de streamers Twitch, leurs groupes, leurs lives, leurs VODs et certains outils de moderation/chat.

L'extension reconstruit la barre laterale des chaines suivies avec tes propres favoris epingles, des groupes, des sous-groupes, des filtres live, des profils, une synchronisation Drive, une page VODs et des outils d'historique chat/moderation. L'application mobile reprend les fonctions importantes dans une interface adaptee au telephone.

### Extension Navigateur

L'extension ajoute :

- un bouton dans la navigation Twitch pour ouvrir la gestion des favoris ;
- un bouton pour ouvrir la page VODs ;
- un bouton sur les chaines Twitch pour ajouter ou retirer un streamer ;
- une sidebar personnalisee avec les lives, viewers, jeux et titres ;
- des groupes et sous-groupes repliables ;
- des profils de favoris ;
- l'import/export et la synchronisation Google Drive ;
- une page VODs avec filtres, tri, jours precedents/suivants et analyse ;
- un historique de chat dans les cartes viewers ;
- un historique de moderation deplacable ;
- des notifications de mise a jour.

### Application Mobile

L'application mobile permet de retrouver :

- les profils de favoris ;
- les groupes et streamers ;
- le filtre des streamers en live ;
- les groupes repliables ;
- l'actualisation des lives ;
- les VODs avec recherche, filtres, tri et icone du streamer ;
- l'analyse des VODs avec clips et temps forts ;
- la synchronisation Google Drive ;
- une notification quand une nouvelle version est disponible.

### Chronologie Des Versions

#### v0.5.9

- Ajout d'animations limitees aux cartes streamer avec des styles plus visibles.
- Le test d'animation s'applique maintenant a toutes les cartes streamer visibles.
- Correction du rendu pour eviter que les groupes ou toute la sidebar donnent l'impression de bouger.
- Ajout des presentations de groupes : Classique, Ligne dense et Libelle vertical.
- Les changements de presentation s'appliquent directement et se synchronisent avec les profils/backups.

#### v0.5.8

- Ajout du compact automatique intelligent qui cible les plus gros groupes visibles en premier.
- Ajout de niveaux de compact par groupe pour melanger les styles normal, compact et avatars seuls.
- Ajout du style selectionnable Compact ultime.
- Ajout du selecteur Style compact auto dans la gestion des favoris.
- Stabilisation du mode compact et synchronisation des fichiers Firefox.

#### v0.5.4

- L'historique de moderation se lit maintenant comme l'historique du chat : anciens elements en haut, recents en bas.
- Reduction des doublons quand Twitch marque plusieurs anciens messages apres un seul ban.
- Meilleur affichage des bans temporaires avec duree quand Twitch la fournit, ou mention duree inconnue sinon.
- Meilleur ordre et scroll dans l'historique du chat.
- Detection plus large des badges chat.
- Meilleur rendu des emotes Twitch et 7TV dans l'historique capture.
- Desactivation des raccourcis du lecteur Twitch pendant la saisie dans la gestion des favoris.
- Conservation du focus dans la recherche pendant le rendu du panneau.
- Nettoyage d'une erreur console attendue liee au side panel Chrome.

#### v0.5.3

- Suppression des donnees de demonstration de l'application mobile.
- Ajout de la gestion complete des profils sur mobile : changer, creer, renommer et supprimer.
- Nettoyage des caches live/VOD au changement de profil.

#### v0.5.2

- Amelioration de l'authentification Google Drive mobile.
- Synchronisation des profils mobile via Drive.

#### v0.5.1

- Amelioration de l'interface mobile.
- Separation plus claire entre Groupes et VODs.

#### v0.5.0

- Ajout de la synchronisation Google Drive pour les profils de l'extension.
- Ajout des notifications de mise a jour.
- Ajout des bases de l'application mobile avec groupes, VODs, filtres et APK.

#### v0.4.0

- Ajout de la page Planning VODs.
- Ajout des filtres, du tri, de la navigation par jour, des heures de debut/fin et de l'analyse VOD.
- Ajout des clips et temps forts associes aux VODs.

#### v0.3.0

- Refactor de l'extension en modules plus lisibles.
- Amelioration du rendu sidebar, navigation, overlays et gestion d'etat.

#### v0.2.0

- Stabilisation de la gestion des groupes.
- Deplacement des categories, sous-categories et retour a la racine.
- Amelioration du drag and drop pour les gros groupes.

### Installation

#### Chrome / Edge / Brave / Opera

1. Telecharge le ZIP Chrome depuis la derniere release GitHub.
2. Decompresse le fichier.
3. Ouvre `chrome://extensions`.
4. Active le mode developpeur.
5. Clique sur Charger l'extension non empaquetee.
6. Selectionne le dossier extrait.

#### Firefox

1. Telecharge le ZIP Firefox depuis la derniere release GitHub.
2. Decompresse le fichier.
3. Ouvre `about:debugging#/runtime/this-firefox`.
4. Clique sur Charger un module complementaire temporaire.
5. Selectionne le `manifest.json` du dossier Firefox extrait.

#### Android

1. Telecharge l'APK depuis la derniere release GitHub.
2. Installe-le sur ton telephone Android.
3. Si Android bloque l'installation, autorise les installations depuis ton navigateur ou gestionnaire de fichiers.
4. Configure Google Drive dans l'application si tu veux synchroniser tes profils.

## Development

```bash
npm install
npm run check
npm run sync:firefox
```

Mobile preview:

```bash
npm run mobile:serve
```

Android debug APK:

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

# Twitch Favorites Sidebar v0.6.5

## English

This release fixes automatic sidebar compaction with large favorite libraries and improves the Android application live view.

### Sidebar fixes

- Auto compact now remeasures the sidebar immediately after crossing its release threshold.
- Groups containing a single streamer can now reach the maximum avatar-only compact level.
- Collapsing categories restores full streamer cards automatically when enough vertical space becomes available.
- Added regression tests for resizing, single-streamer groups, and restoring normal cards.

### Mobile application

- The favorites screen now shows live streamers by default.
- The live-only preference is remembered between launches.
- Streamers can be sorted by viewer count, name, or Twitch category.
- Sort direction and selected sorting mode are remembered.
- Added a loading state while Twitch live data is being retrieved.

### Builds

- Includes a Chrome Web Store ZIP and an Android debug APK.

## Francais

Cette version corrige le compact automatique de la sidebar avec beaucoup de favoris et améliore la vue des lives dans l'application Android.

### Corrections de la sidebar

- Le compact automatique remesure maintenant la sidebar immédiatement après le franchissement de son seuil de sortie.
- Les groupes contenant un seul streamer peuvent désormais atteindre le niveau compact maximal avec avatars uniquement.
- Replier des catégories restaure automatiquement les cartes complètes lorsque la hauteur disponible devient suffisante.
- Ajout de tests de non-régression pour le redimensionnement, les groupes d'un streamer et le retour aux cartes normales.

### Application mobile

- L'écran des favoris affiche maintenant les streamers en live par défaut.
- Le filtre des lives est mémorisé entre les lancements.
- Les streamers peuvent être triés par nombre de spectateurs, nom ou catégorie Twitch.
- Le mode de tri et son ordre sont mémorisés.
- Ajout d'un état de chargement pendant la récupération des données Twitch.

### Builds

- Cette release contient le ZIP Chrome Web Store et un APK Android debug.

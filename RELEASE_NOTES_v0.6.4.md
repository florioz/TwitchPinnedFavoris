# Twitch Favorites Sidebar v0.6.4

## English

This release improves the sidebar experience, live tracking reliability, localization, and favorite management.

### Highlights

- Added a redesigned appearance wizard with a compact, sequential radial menu for groups, streamers, and sidebar surfaces.
- Added clearer advanced appearance settings, contextual descriptions, animation previews, and persistent expanded sections.
- Added automatic responsive compact mode when the Twitch window becomes too small, with proper restoration when space returns.
- Improved the side panel with scrolling, a close button, faster refresh behavior, and responsive streamer cards.
- Favorites now keep following Twitch accounts through login/name changes by using the stable Twitch user ID.
- Reduced duplicate live notifications, including during legacy favorite migration and Twitch login changes.
- Added favorite profile import/export alongside global backup and Google Drive synchronization.
- Connected French and English localization across the manifest, side panel, VOD interface, and update-facing screens.
- Improved profile controls, backup tools, Google Drive layout, VOD presentation, and general settings clarity.

### Reliability

- Refactored the side panel into smaller lifecycle, view, rendering, messaging, and snapshot modules.
- Added and expanded automated coverage for panel rendering, responsive layout, localization, Twitch identity migration, and live notification deduplication.
- Chrome and Firefox sources are synchronized and validated.

### Store Build

- A new Chrome Web Store ZIP is attached to this release and is ready for upload.

## Francais

Cette version améliore l'expérience de la sidebar, la fiabilité du suivi des lives, les traductions et la gestion des favoris.

### Nouveautés principales

- Nouvelle interface d'apparence avec un menu radial compact et séquentiel pour les groupes, les streamers et la surface de la sidebar.
- Réglages avancés plus clairs avec descriptions contextuelles, aperçu des animations et sections qui restent ouvertes.
- Passage automatique en mode compact lorsque la fenêtre Twitch manque de place, puis retour correct au style normal quand elle est agrandie.
- Side panel amélioré avec défilement, bouton de fermeture, rafraîchissement plus rapide et cartes responsives.
- Les favoris continuent maintenant de suivre un compte Twitch après un changement de pseudo grâce à l'identifiant Twitch stable.
- Réduction des notifications de live en double, y compris pendant la migration des anciens favoris et les changements de pseudo.
- Import et export d'un profil de favoris en complément du backup global et de la synchronisation Google Drive.
- Raccordement des traductions françaises et anglaises dans le manifeste, le side panel, l'interface VOD et les écrans liés aux mises à jour.
- Amélioration de la disposition des profils, backups, outils Google Drive, VODs et réglages généraux.

### Fiabilité

- Refactor du side panel en modules dédiés au cycle de vie, à la vue, au rendu, aux messages et aux snapshots.
- Tests ajoutés ou renforcés pour le responsive, les traductions, la migration d'identité Twitch, le rendu du panel et les notifications sans doublon.
- Sources Chrome et Firefox synchronisées et validées.

### Build Store

- Un nouveau ZIP Chrome Web Store est joint à cette release et prêt à être envoyé sur le Store.

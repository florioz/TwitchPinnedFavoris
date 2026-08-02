# Twitch Favorites Sidebar v0.6.9

## Français

Cette version fiabilise la sauvegarde des actions dans la gestion des favoris, améliore le compactage des longues sidebars et modernise profondément l’architecture interne de l’extension.

### Favoris et persistance

- Les ajouts de favoris restent enregistrés lors de l’ouverture immédiate de leur gestion.
- Les changements de catégories, filtres et options ne sont plus annulés en fermant puis en rouvrant le menu.
- Les écritures concurrentes sont sérialisées et protégées par une révision d’état.
- Les mises à jour d’identité Twitch fusionnent désormais uniquement les champs concernés sans écraser les actions récentes.

### Sidebar et compact automatique

- Nouveau compactage spécifique pour les groupes contenant un seul streamer.
- Présentation unifiée avec groupe, avatar, pseudo et spectateurs sur une ligne lisible.
- Suppression des superpositions et décorations héritées qui déformaient les cartes compactes.
- Restauration automatique des cartes normales lorsque suffisamment de place redevient disponible.

### Architecture et robustesse

- Extraction du moteur de compactage automatique hors du renderer.
- Centralisation des styles d’apparence, couleurs et signatures de rendu.
- Séparation de la résolution des emotes 7TV et du suivi de modération.
- Extraction de la gestion des profils, des arbres de catégories et des sauvegardes.
- Validation des préférences importées par un normaliseur dédié.
- Simplification du cycle de vie des fonctionnalités du chat et du lecteur.

### Validation

- 95 tests automatisés réussis.
- Sources Chrome et Firefox synchronisées.
- ZIP Chrome Web Store et APK Android inclus.

## English

This release makes favorite-management actions reliably persistent, improves automatic compaction for long sidebars, and substantially modernizes the extension's internal architecture.

### Favorites and persistence

- Newly added favorites remain saved when favorite management is opened immediately.
- Category, filter, and option changes are no longer reverted after closing and reopening the menu.
- Concurrent writes are serialized and protected by state revisions.
- Twitch identity updates now merge only identity fields without overwriting recent user actions.

### Sidebar and automatic compaction

- Dedicated compact layout for groups containing a single streamer.
- Unified row showing the group, avatar, streamer name, and viewer count clearly.
- Removed inherited overlays and decorations that distorted compact cards.
- Normal cards return automatically when enough vertical space becomes available.

### Architecture and reliability

- Automatic compaction engine extracted from the sidebar renderer.
- Shared appearance, color, and render-signature utilities.
- 7TV emote resolution separated from chat moderation tracking.
- Profile state, category trees, and backup normalization extracted into dedicated modules.
- Imported preferences validated through a dedicated schema-based normalizer.
- Simplified lifecycle management for chat and player enhancements.

### Validation

- 95 automated tests passing.
- Chrome and Firefox sources synchronized.
- Chrome Web Store ZIP and Android APK included.

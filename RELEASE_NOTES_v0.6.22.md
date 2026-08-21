# Twitch Favorites Sidebar v0.6.22

## Français

Cette version ajoute un navigateur d’émotes 7TV et BetterTTV directement dans le chat Twitch.

### Nouveautés

- Nouveau bouton de recherche d’émotes placé à côté des contrôles natifs du chat.
- Recherche instantanée parmi les émotes disponibles sur la chaîne.
- Filtres pour afficher toutes les émotes, uniquement celles de 7TV ou uniquement celles de BetterTTV.
- Insertion directe de l’émote sélectionnée dans la zone de saisie Twitch avec son aperçu natif.
- Panneau déplaçable depuis son en-tête et maintenu automatiquement dans les limites de l’écran.
- Liste scrollable avec chargement progressif pour les chaînes disposant de nombreux emotes.
- Option activable dans la gestion des streamers uniquement lorsque l’affichage 7TV ou BetterTTV est actif.

### Améliorations

- Alignement du nouveau bouton sur les dimensions et la disposition des contrôles Twitch.
- Positionnement du panneau calculé après son rendu pour qu’il s’ouvre correctement au-dessus du chat.
- Événements de la grille mutualisés afin de conserver de bonnes performances avec plusieurs centaines d’émotes.
- Séparation du modèle, de l’interface et des styles du navigateur d’émotes pour faciliter sa maintenance.
- Les changements du bouton n’entraînent plus de rechargement réseau inutile des catalogues.

### Qualité

- Sources Chromium et Firefox synchronisées.
- 315 tests automatisés réussis.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This release adds a 7TV and BetterTTV emote browser directly to Twitch chat.

### New features

- New emote search button aligned with Twitch’s native chat controls.
- Instant search through emotes available on the current channel.
- Filters for all emotes, 7TV only, or BetterTTV only.
- Direct insertion of the selected emote into Twitch’s message editor with native preview support.
- Draggable panel that remains within the visible viewport.
- Scrollable list with progressive rendering for channels with large emote catalogs.
- The option is available only when 7TV or BetterTTV emote display is enabled.

### Improvements

- Button sizing and alignment now match Twitch controls.
- Panel positioning is calculated after rendering so it opens correctly above the chat input.
- Delegated grid events keep the picker efficient with hundreds of emotes.
- Picker model, interface, and styles are separated for easier maintenance.
- Toggling the picker no longer triggers unnecessary catalog network reloads.

### Quality

- Chromium and Firefox sources synchronized.
- 315 automated tests passing.
- Chrome Web Store ZIP, Firefox ZIP, and Android APK included.

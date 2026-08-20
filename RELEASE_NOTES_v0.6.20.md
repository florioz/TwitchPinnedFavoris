# Twitch Favorites Sidebar v0.6.20

## Français

Cette version améliore la navigation dans les favoris, les outils du chat et l’intégration de la sidebar sous Firefox.

### Favoris et espaces partagés

- Recherche améliorée dans la gestion des streamers avec autocomplétion des favoris existants.
- Sélection d’un résultat qui ouvre directement son groupe et met sa carte en évidence.
- Bouton d’invitation à un espace partagé mieux intégré aux actions natives des cartes Twitch.
- Positionnement plus stable des actions personnalisées lorsque Twitch réorganise ses panneaux.

### Chat et modération

- Nouveau bouton de copie complète d’un message, visible uniquement au survol comme l’action de réponse Twitch.
- Navigation depuis l’historique de modération vers le message correspondant, sans modifier le DOM géré par Twitch.
- Le bouton de l’historique reste attaché aux contrôles du chat et ne déborde plus dans le lecteur.
- Une réponse citant un message supprimé n’est plus enregistrée à tort comme un nouveau message sanctionné.
- La restauration des véritables messages supprimés reste indépendante de ce filtrage.

### Firefox et qualité

- Sidebar Firefox disponible en dehors de Twitch grâce à un panneau global dédié.
- Architecture du lanceur de panneau et génération du manifeste Firefox simplifiées.
- Synchronisation Chromium/Firefox renforcée par des contrôles automatisés.
- 310 tests automatisés couvrent notamment les réponses, suppressions, cartes Twitch et recherches de favoris.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This release improves favorite navigation, chat tools and Firefox sidebar integration.

### Favorites and shared spaces

- Improved streamer search with autocomplete for existing favorites.
- Selecting a result opens its group, scrolls to its card and highlights it.
- Shared-space invitations are better integrated into native Twitch viewer-card actions.
- Custom actions remain stable when Twitch rearranges its panels.

### Chat and moderation

- New full-message copy action shown only on hover, matching Twitch’s reply interaction.
- Moderation history can navigate back to the related chat message without mutating Twitch-owned DOM.
- The moderation-history button stays attached to chat controls instead of drifting into the player.
- Replies quoting a deleted message are no longer incorrectly recorded as newly moderated messages.
- Actual deleted-message restoration remains independent from this history filter.

### Firefox and quality

- Firefox sidebar is available outside Twitch through a dedicated global panel.
- Simplified Firefox panel launcher architecture and manifest generation.
- Stronger automated Chromium/Firefox synchronization checks.
- 310 automated tests cover replies, deletions, Twitch cards and favorite search behavior.
- Chrome Web Store ZIP, Firefox ZIP and Android APK included.

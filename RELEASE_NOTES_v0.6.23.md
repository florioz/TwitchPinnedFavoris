# Twitch Favorites Sidebar v0.6.23

## Français

Cette version corrective empêche le bouton Favoris d’apparaître dans les panneaux Twitch ouverts depuis les pages globales.

### Correctifs

- La page `/drops/inventory` n’est plus interprétée comme la chaîne d’un streamer nommé « drops ».
- Le bouton Favoris n’apparaît plus sur l’étoile des notifications Twitch dans l’inventaire des drops.
- Les pages globales comme l’annuaire, les réglages, les abonnements, le portefeuille et la recherche sont explicitement exclues des routes de chaîne.
- Le bouton éventuellement présent est immédiatement retiré lors du passage d’une chaîne vers une page globale.

### Améliorations techniques

- La détection des routes de chaîne est isolée dans un module dédié et testé.
- L’observateur DOM ne recherche plus de point d’ancrage sur les pages qui ne correspondent pas à une chaîne.
- Réduction du travail effectué lors de l’ouverture des panneaux globaux Twitch.

### Qualité

- Sources Chromium et Firefox synchronisées.
- 318 tests automatisés réussis.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This corrective release prevents the Favorites button from appearing inside Twitch panels opened from global pages.

### Fixes

- `/drops/inventory` is no longer interpreted as a streamer channel named “drops”.
- The Favorites button no longer appears on Twitch notification stars in the Drops inventory.
- Global routes such as Directory, Settings, Subscriptions, Wallet, and Search are explicitly excluded from channel detection.
- Any existing Favorites button is removed immediately when navigating from a channel to a global page.

### Technical improvements

- Channel route detection is isolated in a dedicated, tested module.
- The DOM observer no longer searches for mounting anchors outside channel pages.
- Less work is performed when Twitch global panels open or update.

### Quality

- Chromium and Firefox sources synchronized.
- 318 automated tests passing.
- Chrome Web Store ZIP, Firefox ZIP, and Android APK included.

# Twitch Favorites Sidebar v0.6.6

## English

This release reduces periodic performance spikes when several Twitch streams are open at the same time.

### Performance

- Live status requests are now processed two at a time instead of five simultaneously.
- A short pause is inserted between request batches to distribute background work over time.
- Periodic sidebar updates are coalesced and scheduled during browser idle time.
- Each Twitch tab uses a slightly different update delay so several tabs no longer rebuild their sidebars simultaneously.
- Hidden tabs wait longer before rendering live-data updates, preserving resources for the visible stream.
- User interactions, resizing, and appearance changes remain immediate.

### Validation

- Added automated coverage for paced concurrent Twitch work.
- Includes synchronized Chrome and Firefox sources, a Chrome Web Store ZIP, and an Android debug APK.

## Francais

Cette version réduit les pics de ralentissement périodiques lorsque plusieurs streams Twitch sont ouverts en même temps.

### Performances

- Les statuts live sont maintenant récupérés deux par deux au lieu de cinq simultanément.
- Une courte pause est ajoutée entre les lots afin de répartir le travail en arrière-plan.
- Les mises à jour périodiques de la sidebar sont regroupées et exécutées pendant un temps libre du navigateur.
- Chaque onglet Twitch utilise un léger décalage différent afin de ne plus reconstruire toutes les sidebars au même moment.
- Les onglets masqués attendent davantage avant leur rendu afin de préserver les ressources du stream visible.
- Les interactions utilisateur, le redimensionnement et les changements d'apparence restent immédiats.

### Validation

- Ajout d'un test automatisé pour le traitement progressif des requêtes Twitch.
- Sources Chrome et Firefox synchronisées, ZIP Chrome Web Store et APK Android debug inclus.

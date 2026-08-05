# Twitch Favorites Sidebar v0.6.14

## Français

Cette version intègre les favoris à la scrollbar native de Twitch et stabilise le compactage automatique.

### Sidebar Twitch

- Les groupes de favoris, « Pour vous » et « Chaînes suivies » partagent désormais le même défilement natif.
- Le compactage automatique mesure le véritable viewport de la sidebar Twitch.
- Les groupes contenant un seul streamer restent isolés et ne passent plus derrière les groupes suivants.
- Suppression du mécanisme qui pouvait forcer le retour du scroll vers le haut.
- Prise en charge du layout Twitch actuel avec des fallbacks pour les anciens layouts.

### Historique de modération

- Conservation de la détection complète des messages supprimés, timeouts et bannissements permanents de v0.6.12.
- Nettoyage d'une traduction française dupliquée sans changement de comportement.

### Architecture et validation

- Nouveau module dédié au ciblage du DOM et du viewport de la sidebar Twitch.
- Renderer allégé et découplé des sélecteurs Twitch.
- 167 tests automatisés réussis.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This release integrates favorites into Twitch's native scrollbar and stabilizes automatic compact mode.

### Twitch sidebar

- Favorite groups, “For You,” and “Followed Channels” now share the same native scrolling area.
- Automatic compact mode measures the actual Twitch sidebar viewport.
- Single-streamer groups remain isolated and no longer slip behind following groups.
- Removed the mechanism that could force scrolling back to the top.
- Supports Twitch's current layout with fallbacks for older layouts.

### Moderation history

- Preserves the complete deleted-message, timeout, and permanent-ban detection from v0.6.12.
- Removes a duplicated French translation without changing behavior.

### Architecture and validation

- Added a dedicated Twitch sidebar DOM and viewport adapter.
- The renderer is smaller and decoupled from Twitch selectors.
- 167 automated tests passing.
- Chrome Web Store ZIP, Firefox ZIP, and Android APK included.

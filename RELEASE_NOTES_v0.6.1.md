# Twitch Favorites Sidebar v0.6.1

## English

This release focuses on responsiveness and polish after the move to the Chrome side panel.

### Improvements

- The Chrome side panel now opens faster by rendering the last cached live snapshot immediately.
- Twitch live data refreshes in the background after the panel opens, so the UI no longer waits on network requests.
- Sidebar rendering now skips unchanged updates, reducing CPU work when multiple Twitch windows are open.
- The sidebar DOM observer now avoids deep Twitch page observation, reducing work caused by chat and player mutations.
- Auto-compact layout measurements now run only when the visible group structure changes.
- Streamer entry animations now run only when streamers actually appear or disappear.
- Hidden/background tabs no longer run sidebar entry animations.
- The already-favorited channel button now matches Twitch's dark button style with a white star.
- Extension icons were refreshed for Chrome and Firefox builds.

### Notes

- If you still notice small player freezes with several Twitch windows open, the next optimization target is incremental row updates for viewer-count-only changes.

## Francais

Cette version se concentre sur la reactivite et la finition apres le passage au side panel Chrome.

### Ameliorations

- Le side panel Chrome s'ouvre plus vite en affichant immediatement le dernier cache des lives.
- Les donnees Twitch se rafraichissent ensuite en arriere-plan, sans bloquer l'affichage.
- La sidebar evite maintenant les rendus inutiles quand les donnees visibles n'ont pas change.
- L'observer de la sidebar ne surveille plus toute la page Twitch en profondeur, ce qui reduit le travail cause par le chat et le lecteur.
- Les mesures du compact automatique ne se lancent plus que lorsque la structure visible des groupes change.
- Les animations des streamers ne se lancent plus que lorsqu'un streamer apparait ou disparait vraiment.
- Les onglets masques n'executent plus les animations de cartes streamer.
- Le bouton d'une chaine deja en favori utilise maintenant un style sombre proche de Twitch avec une etoile blanche.
- Les icones de l'extension ont ete mises a jour pour les builds Chrome et Firefox.

### Notes

- Si tu observes encore de petits ralentissements avec plusieurs fenetres Twitch, la prochaine optimisation sera de mettre a jour uniquement les lignes dont les viewers changent.

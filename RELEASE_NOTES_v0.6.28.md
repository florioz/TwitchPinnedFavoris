# Twitch Favorites Sidebar v0.6.28

18 octobre 2026 / October 18, 2026. Changes since v0.6.27.

## Français

- Actualisation des favoris live accélérée : requêtes Twitch regroupées par lots de 20, avec deux lots simultanés. Les anciens statuts périmés restent exclus.
- Moins de reconstructions de la sidebar lors des sauvegardes et du survol. Les streamers ne sont déplacés que si leur ordre change.
- Historique du chat : prise en charge du catalogue BTTV global et de la chaîne, y compris les émoticônes partagées et les noms contenant de la ponctuation.
- Meilleure capture des images d'émoticônes Twitch imbriquées et chargement des catalogues après changement de chaîne.

## English

- Faster live favorites refresh: Twitch requests are grouped into batches of 20, with two batches in parallel. Stale live status remains excluded.
- Fewer sidebar rebuilds during state saves and hover. Entries move only when their order changes.
- Chat history now loads global, channel and shared BTTV emotes, including names containing punctuation.
- Improved capture of nested Twitch emote images and catalog loading after channel navigation.

## Distributions

Chrome and Firefox ZIP packages; Android companion development APK (assembleDebug). These fixes primarily affect the browser extension. Startup latency still depends on Twitch and network conditions.

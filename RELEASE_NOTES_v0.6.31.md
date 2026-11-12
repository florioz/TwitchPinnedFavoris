# Twitch Favorites Sidebar v0.6.31

12 novembre 2026 / November 12, 2026. Changes since v0.6.30.

## Français

- Aperçu agrandi des émoticônes dans l’infobulle existante, avec leur nom et leur source.
- Sidebar : courte tolérance pour les statuts live déjà affichés lorsque le rafraîchissement tarde, afin de limiter les vidages temporaires. Les confirmations hors ligne restent appliquées immédiatement ; les anciens caches au démarrage restent exclus.
- Recherche : bouton d’effacement dans une zone fixe à droite, sans chevauchement du texte ni du bouton Twitch.
- Suppression de l’espace vide laissé par la recherche repliée ; accès au clavier et affichage sur écran tactile conservés.

- Mise à jour des dépendances de construction pour corriger les alertes npm glob/minimatch.

## English

- Enlarged emote preview in the existing tooltip, alongside the emote name and provider.
- Sidebar: a short grace period for already displayed live status reduces temporary empty lists during delayed refreshes. Confirmed offline status still applies immediately; stale startup caches remain excluded.
- Search: a dedicated clear-button area on the right prevents text overlap and avoids the Twitch collapse control.
- Collapsed search no longer leaves an empty row; keyboard access and touch-screen visibility are preserved.

- Updated build dependencies to address npm glob/minimatch advisories.

## Distributions

Chrome and Firefox ZIP packages; Android companion development APK (`assembleDebug`). The changes above affect the browser extension. No new database migration in this version. Realtime shared chat still requires migration 020 introduced in v0.6.30 if it has not been applied.

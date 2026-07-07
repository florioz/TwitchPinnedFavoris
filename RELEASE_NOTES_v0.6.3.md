# Twitch Favorites Sidebar v0.6.3

## English

This release fixes the Google Drive sync configuration for the Chrome Web Store extension ID.

### Fixes

- Updated the Chrome extension OAuth client ID used by `manifest.json`.
- Updated the Web OAuth fallback client used by the Google Drive sync fallback flow.
- The OAuth setup now matches the Chrome Web Store extension ID `jiokdnooejojbhnpbnhdnjgoflfjdkna`.
- Improved Drive debug output with the extension ID, Chrome OAuth client, Web OAuth client, and redirect URI.
- Improved Google OAuth error messages with the Web client ID and redirect URI used during fallback auth.

### Store Build

- A new Chrome Web Store ZIP is available in this release and should be uploaded to the Chrome Web Store developer dashboard.

## Francais

Cette version corrige la configuration Google Drive pour l'ID de l'extension publiee sur le Chrome Web Store.

### Corrections

- Mise a jour du client OAuth Extension Chrome utilise par `manifest.json`.
- Mise a jour du client OAuth Web utilise par le fallback de synchronisation Google Drive.
- La configuration OAuth correspond maintenant a l'ID Chrome Web Store `jiokdnooejojbhnpbnhdnjgoflfjdkna`.
- Ajout d'un debug Drive plus clair avec l'ID extension, le client OAuth Chrome, le client OAuth Web et l'URI de redirection.
- Les erreurs OAuth Google indiquent maintenant le client Web et l'URI de redirection utilises par le fallback.

### Build Store

- Un nouveau ZIP Chrome Web Store est disponible dans cette release et doit etre envoye dans le tableau de bord Chrome Web Store.

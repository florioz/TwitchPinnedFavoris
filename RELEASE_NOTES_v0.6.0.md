# Twitch Favorites Sidebar v0.6.0

This release prepares the extension for a cleaner Chrome Web Store submission and improves performance when several Twitch tabs are open.

## Highlights

- Global favorites access now uses the native Chrome side panel.
- The extension no longer requests broad `http://*/*` or `https://*/*` host permissions.
- Added Chrome Web Store preparation files:
  - `PRIVACY.md`
  - `CHROME_STORE_LISTING.md`
  - `npm run build:chrome`
- Added a Chrome Store ZIP guard that refuses broad host permissions or unused `scripting` permission.
- Improved live-status performance with centralized background snapshots and limited concurrent Twitch requests.
- Reduced redundant content-script polling when cached live data is already available.
- Batched sidebar, chat, moderation, and channel-button DOM work to reduce micro-lag.
- Silenced expected temporary 7TV fetch failures without breaking Twitch/7TV emote rendering.
- Escaped dynamic Twitch data in panel/toast HTML rendering.

## Chrome Store Readiness

- Global favorites access is now handled by `sidePanel`.
- Twitch page integration remains limited to Twitch pages.
- Host permissions are limited to Twitch, Twitch GraphQL, Google APIs, GitHub releases, and optional 7TV resources.
- A store-ready package is generated with:

```bash
npm run build:chrome
```

The resulting ZIP is:

```text
dist/TwitchFavoritesSidebar-chrome-store.zip
```

## French / Francais

Cette version prepare l'extension pour une publication plus propre sur le Chrome Web Store et ameliore les performances quand plusieurs onglets Twitch sont ouverts.

- L'acces global aux favoris passe maintenant par le side panel natif Chrome.
- Les permissions globales `http://*/*` et `https://*/*` ont ete supprimees.
- Ajout d'une politique de confidentialite, d'une fiche Chrome Store brouillon et d'un script de build Chrome propre.
- Optimisation des refresh live avec snapshots centralises en background et requetes Twitch limitees en parallele.
- Reduction du travail des observers sidebar/chat/moderation pour limiter les micro-lags.
- Securisation du rendu HTML des panels et notifications.

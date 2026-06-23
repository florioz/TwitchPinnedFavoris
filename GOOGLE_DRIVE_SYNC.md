# Google Drive Sync

La synchronisation Drive stocke un fichier JSON dans `appDataFolder`, un espace caché de Google Drive réservé à l'application.

## Extension Chrome / Brave

1. Crée un projet dans Google Cloud Console.
2. Active l'API Google Drive.
3. Crée un OAuth Client ID de type **Chrome Extension**.
4. Utilise l'ID de l'extension chargée dans `chrome://extensions`.
5. Remplace dans `manifest.json` :
   ```json
   "client_id": "000000000000-replacewithgoogleoauthclientid.apps.googleusercontent.com"
   ```
6. Recharge l'extension.

Scope utilisé :
`https://www.googleapis.com/auth/drive.appdata`

## App mobile

L'app mobile utilise le flux "device code". Crée un OAuth Client ID compatible appareil/TV ou application installée, puis remplace dans `mobile/app.js` :

```js
const GOOGLE_DRIVE_CLIENT_ID = 'REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';
```

Le fichier synchronisé est le même que celui de l'extension :
`twitch-favorites-sidebar-profiles.json`

# Google Drive Sync

La synchronisation Drive stocke un fichier JSON dans `appDataFolder`, un espace cache de Google Drive reserve a l'application.

Le fichier synchronise est le meme pour l'extension et l'app mobile :

```text
twitch-favorites-sidebar-profiles.json
```

Scope utilise :

```text
https://www.googleapis.com/auth/drive.appdata
```

## Extension Chrome

Chrome utilise `chrome.identity.getAuthToken`.

Dans Google Cloud :

1. Active l'API Google Drive.
2. Cree un OAuth Client ID de type `Extension Chrome`.
3. Utilise l'ID de l'extension chargee dans `chrome://extensions`.
4. Mets le Client ID dans `manifest.json`, section `oauth2.client_id`.

## Extension Brave

Brave peut refuser `chrome.identity.getAuthToken`, donc l'extension utilise `launchWebAuthFlow`.

Dans Google Cloud :

1. Cree un OAuth Client ID de type `Application Web`.
2. Ajoute cette URI dans `URI de redirection autorises` :

```text
https://mmnhheeeelmdqgpoiekfkifqdmaomacam.chromiumapp.org/
```

3. Configure le Client ID Web :

```powershell
npm run configure:web-oauth -- "TON_CLIENT_ID_WEB.apps.googleusercontent.com"
npm run sync:firefox
```

## App mobile

L'app mobile utilise le flux Google `device code`. Le Client ID Web de Brave ne fonctionne pas pour ce flux.

Dans Google Cloud :

1. Cree un OAuth Client ID de type `TVs and Limited Input devices`.
2. Copie le Client ID.
3. Configure l'app mobile :

```powershell
npm run configure:mobile-oauth -- "TON_CLIENT_ID_TV.apps.googleusercontent.com"
```

Si tu utilises le Client ID Web de Brave dans l'app mobile, Google renvoie :

```text
invalid_client: Only clients of type 'TVs and Limited Input devices' can use the OAuth 2.0 flow for TV and Limited-Input Device Applications.
```

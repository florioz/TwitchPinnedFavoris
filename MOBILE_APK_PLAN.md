# Version mobile APK

Branche: `mobile/apk-prototype`

Cette branche pose une base mobile separee de l'extension navigateur.

## Objectif

- Afficher les groupes et les streamers favoris.
- Filtrer par groupe et recherche.
- Afficher les VODs disponibles par jour, limitees a 60 jours.
- Rester compatible avec l'export backup JSON de l'extension.

## Prototype actuel

Le prototype est dans `mobile/`.

- `mobile/index.html`: ecran mobile principal.
- `mobile/styles.css`: UI mobile responsive.
- `mobile/app.js`: lecture backup, groupes, streamers et VODs Twitch.
- `mobile/manifest.webmanifest`: base PWA reutilisable pour un wrapper APK.

Pour tester rapidement dans un navigateur:

```powershell
cd D:\Documents\0-Florian\projet\TwitchPinnedFavoris-main
npx serve mobile
```

Ou ouvre `mobile/index.html` directement pour tester l'import backup et l'interface.

## Chemin APK conseille

La suite logique est d'emballer `mobile/` avec Capacitor:

```powershell
npm install --save-dev @capacitor/cli @capacitor/core @capacitor/android
npx cap init TwitchFavoritesMobile com.florioz.twitchfavorites
npx cap add android
npx cap sync android
npx cap open android
```

Avant de publier, il faudra choisir comment synchroniser les favoris:

- import manuel du backup JSON, deja disponible;
- export/import depuis un fichier local Android;
- plus tard, sync cloud ou GitHub Gist si tu veux retrouver les memes groupes sur plusieurs appareils.

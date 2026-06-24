# Twitch Favorites Sidebar v0.5.2

## Corrections

- Correction de la synchronisation Google Drive sur l'app mobile avec un Client ID et un Client secret OAuth `TVs and Limited Input devices`.
- Ajout d'un fichier local `mobile/oauth-config.js` ignore par Git pour eviter de publier le secret OAuth dans le depot.
- Ajout du selecteur de profils favoris dans l'app mobile.
- Conservation et normalisation des profils importes depuis l'extension ou Google Drive.

## Mobile

- Le build Android embarque la configuration OAuth locale quand `npm run configure:mobile-oauth` a ete lance avant le build.
- Ajout de `mobile/oauth-config.example.js` pour documenter le format attendu.

## Verification

- `npm run check`

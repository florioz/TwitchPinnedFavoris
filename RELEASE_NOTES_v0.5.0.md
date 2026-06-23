# Twitch Favorites Sidebar v0.5.0

## Nouveautes

- Ajout d'une synchronisation Google Drive plus fiable pour les profils/favoris.
- Support Brave via `launchWebAuthFlow` et Client ID OAuth Web dedie.
- Ajout d'un script de configuration OAuth Web :
  `npm run configure:web-oauth`.
- Ajout d'un script de configuration OAuth mobile :
  `npm run configure:mobile-oauth`.
- Ajout d'une documentation claire pour les 3 clients OAuth Google :
  Chrome Extension, Brave Web, et mobile TV/Limited Input.

## App mobile

- Version mobile alignee sur les dernieres ameliorations de l'extension.
- Groupes pliables/depliables.
- Filtre "en live seulement".
- Rafraichissement manuel des lives.
- Vue VOD mobile avec filtres, tri, icone streamer et detail VOD.
- Analyse VOD mobile avec timeline, clips/temps forts et fermeture au second clic.
- Preparation de la sync Drive mobile via flux device code.
- Nouvel APK debug inclus dans la release.

## Planning VODs

- Affichage plus lisible des cartes VOD : debut, duree et fin.
- Le panneau d'analyse VOD s'ouvre sous la VOD selectionnee.
- Un second clic sur la VOD referme l'analyse.
- Interface plus compacte et plus lisible pour les longues listes de VODs.

## Correctifs

- Correction du flux Drive sur Brave : les actions Envoyer/Recuperer reutilisent le token Web au lieu de relancer le mauvais flux Chrome.
- Correction de l'affichage de l'URI de redirection Brave pour aider au diagnostic OAuth.
- Nettoyage du fallback Firebase/offscreen qui etait bloque par la CSP Manifest V3.
- Suppression de la permission `offscreen` devenue inutile.
- Suppression des dependances Firebase/esbuild inutilisees.

## Technique

- Refactor cible du service worker Drive.
- Build Firefox simplifie.
- `npm run check` couvre les nouveaux scripts de configuration OAuth.

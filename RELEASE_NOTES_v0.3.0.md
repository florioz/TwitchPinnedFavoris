# Twitch Favorites Sidebar v0.3.0

## Nouveautes

- Ajout du planning VODs accessible depuis Twitch via le bouton de l'extension.
- Nouvelle page VODs avec recherche, filtre par groupe, navigation jour precedent/suivant et selecteur de date limite aux 60 derniers jours.
- Tri du planning par heure, nom de streamer, vues, duree, nombre de VODs et ordre inverse.
- Affichage uniquement des streamers ayant au moins une VOD sur le jour selectionne.
- Ajout du panneau d'analyse VOD avec resume, timeline, clips associes et liens vers Twitch.
- Recuperation des clips associes aux VODs pour aider a retrouver les temps forts d'un stream.

## Organisation des favoris

- Refonte du deplacement des groupes et sous-groupes dans le gestionnaire.
- Possibilite de remonter un sous-groupe au niveau racine.
- Meilleur comportement lors du deplacement de gros groupes avec beaucoup de streamers.
- Ajout d'actions haut/bas pour organiser les groupes plus rapidement.
- Ajout d'un diagnostic dans la fiche favori pour comprendre pourquoi un streamer apparait ou non dans la sidebar.

## Historique chat et moderation

- Ajout d'un historique de chat compact dans les fiches viewers, avec rendu proche du chat Twitch.
- Historique de chat repliable/depliable pour ne pas alourdir la fiche viewer.
- Ajout d'un panneau d'historique moderation pour bans, timeouts et messages supprimes.
- Amelioration de la detection des durees de timeout quand Twitch expose l'information dans le DOM.
- Augmentation de la capacite de l'historique moderation pour les gros lives.
- Separation des options historique chat et historique moderation dans les preferences.

## Corrections

- Ouverture de la page VODs via le background script pour eviter les blocages navigateur du type `ERR_BLOCKED_BY_CLIENT`.
- Conservation des streamers visibles quand une requete live Twitch echoue temporairement.
- Normalisation des logins pour eviter les problemes de casse entre favoris et donnees live.
- Detection de secours de l'etat live depuis la page Twitch courante.
- Suppression du warning `extension context invalidated` remonte comme erreur par le navigateur.
- Corrections de mise en page des controles du planning VODs.
- Corrections du tri du planning VODs et de l'ordre d'apparition des streamers.

## Notes

- Les filtres de categorie Twitch des favoris continuent de s'appliquer a la sidebar : un streamer live peut etre masque si sa categorie actuelle ne correspond pas au filtre configure.
- Les durees de timeout ne peuvent etre affichees que si Twitch expose cette information au moment ou l'extension capture l'action.
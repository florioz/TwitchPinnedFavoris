# Twitch Favorites Sidebar v0.2.0

## Nouveautes

- Ajout d'un bouton "Planning VODs" dans la barre du haut de Twitch.
- Nouvelle page de planning VODs avec affichage chronologique par jour.
- Filtrage du planning par groupe de favoris.
- Recherche par streamer, titre de VOD ou categorie Twitch.
- Navigation rapide entre les jours precedent/suivant.
- Selecteur de date limite aux 60 derniers jours, pour correspondre a la duree de conservation habituelle des VODs Twitch.
- Tri du planning par heure, nom du streamer, nombre de vues, duree des VODs ou nombre de VODs.
- Affichage uniquement des streamers qui ont au moins une VOD visible sur le jour selectionne.

## Ameliorations des groupes et favoris

- Stabilisation du drag and drop des groupes et sous-groupes.
- Possibilite de remonter un sous-groupe au niveau racine.
- Meilleur comportement lors du deplacement de gros groupes contenant beaucoup de streamers.
- Ajout d'actions de deplacement haut/bas pour organiser les groupes plus vite.
- Ajout d'un diagnostic dans la fiche favori pour comprendre pourquoi un streamer apparait ou non dans la sidebar.

## Corrections

- Ouverture de la page VODs via le background script pour eviter les blocages navigateur du type `ERR_BLOCKED_BY_CLIENT`.
- Conservation des streamers visibles quand une requete live Twitch echoue temporairement.
- Normalisation des logins pour eviter les problemes de casse entre favoris et donnees live.
- Detection de secours de l'etat live depuis la page Twitch courante.
- Suppression du warning `extension context invalidated` remonte comme erreur par le navigateur.
- Corrections de mise en page des controles du planning VODs.

## Notes

- Cette version reste sur la branche `feature/vod-planning`.
- Les filtres de categorie Twitch des favoris continuent de s'appliquer a la sidebar : un streamer live peut etre masque si sa categorie actuelle ne correspond pas au filtre configure.

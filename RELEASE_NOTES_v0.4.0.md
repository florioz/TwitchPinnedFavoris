# Twitch Favorites Sidebar v0.4.0

## Refactor et stabilite

- Separation du content script principal en modules par fonctionnalite : store favoris, top nav, sidebar, bouton chaine, panneau de gestion, historique chat/moderation, notifications, watcher de navigation et controleur de features.
- `main.js` devient un bootstrap plus lisible, ce qui rend les bugs plus faciles a localiser.
- Ajout de `npm run check` pour verifier la syntaxe de tous les scripts JavaScript Chrome et Firefox.
- Ajout de `npm run sync:firefox` pour resynchroniser les sources communes vers le dossier Firefox.
- Nettoyage des artefacts suivis inutiles et mise a jour du `.gitignore` pour `dist/`, backups et fichiers temporaires.

## Corrections

- Correction de l'injection des boutons en haut de Twitch apres le nettoyage des logs de debug.
- Correction de la dependance manquante des suggestions de categories Twitch dans le panneau de gestion des favoris.
- Suppression des logs de debug restes en production dans la top nav et la sidebar.
- Realignement des fichiers Firefox sur les sources principales pour eviter les divergences entre builds.

## Page VODs

- Affichage d'une progression pendant le chargement des VODs, par exemple `12/49 streamers analyses`.
- Boutons jour precedent/suivant et sens du tri plus compacts et lisibles.
- Polish des libelles francais visibles dans la page VODs et le panel overlay.

## Notes

- Les permissions du manifest n'ont pas ete reduites dans cette version afin de conserver le comportement actuel des panneaux et notifications overlay.
- Les zips Chrome et Firefox de cette release incluent maintenant les modules `src/contentScripts/features/*` issus du refactor.
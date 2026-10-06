# Fiabilité Twitch — audit, corrections et validation

> Rapport historique du 27 septembre. Pour la préparation et la validation de la version 0.6.26 du 6 octobre 2026, consulter `RELEASE_NOTES_v0.6.26.md`. Les statuts de publication et nombres de tests ci-dessous décrivent uniquement l'audit initial.

Date : 27 septembre 2026. Version du projet conservée : 0.6.25.

## Statut

Implémentation et validations automatisées réalisées. Les critères nécessitant le vrai lecteur Twitch restent à valider en navigateur : ce rapport ne constitue pas une validation de production. Aucun commit, tag, déploiement Supabase ou publication de release n'a été effectué.

Le navigateur intégré a été initialisé, mais sa découverte retourne une liste vide. Le module de pilotage est déjà installé ; aucune dépendance npm supplémentaire n'est nécessaire pour résoudre cette connexion. L'activation/connexion du navigateur dans l'application doit être réalisée côté utilisateur avant les essais interactifs.

## Audit et causes racines

Les constats ci-dessous proviennent du code et des tests ; les conditions exactes des incidents historiques n'ont pas pu être reproduites sur Twitch dans cette session.

| Sujet | Constat | Correction et limite |
| --- | --- | --- |
| Timeline VOD | La page affichait des cartes, sans représentation graphique commune. Le filtrage par date de début excluait les streams commencés la veille. | Bandes horaires par streamer, chevauchements, zoom, sélection et infobulles. Intersections avec la journée locale, y compris changement d'heure. Données limitées aux archives disponibles, pas aux lives sans VOD. |
| Anti-sursaut | Capture Web Audio sans vérifier le type de source ; les médias distants sans CORS peuvent devenir silencieux. | Les clips et sources non compatibles restent en lecture native. Aucun changement forcé du volume ou du mute utilisateur. |
| Volume maîtrisé | Même moteur que l'anti-sursaut ; fermeture du contexte d'un élément capturé puis réutilisé et capture possible avant reprise du contexte audio. | Graphe réutilisé par élément, sortie directe au détachement, pas de capture tant que le contexte n'est pas actif, remise à zéro des mesures au changement de média. |
| Réponses Twitch | Dépendance au texte/markup localisé, identité et conteneur de chat susceptibles de devenir obsolètes ; déduplication attachée uniquement au DOM. | Métadonnées publiques de réponse via un pont page, recontrôle du conteneur et de l'identité, IDs de messages dédupliqués, options son/visuel indépendantes et déverrouillage audio sur interaction. |
| Preview | La fermeture reposait sur les événements de sortie alors que Twitch peut retirer l'ancre ou changer de page ; certains délais n'étaient pas suivis. | Surveillance de l'ancre, navigation, visibilité et hover ; nettoyage des timers ; croix et Échap ; suppression de la réouverture sur le même hover après fermeture manuelle. |
| Faux live dans la sidebar | La présence d'un lecteur ou d'un chat suffisait à fabriquer un état live et une date de début. | Le DOM peut uniquement enrichir un live récemment confirmé, jamais créer la preuve de live. Conservation de la date de confirmation, refus des données échouées/expirées et contrôle de la chaîne courante. |
| Recovery lecteur | Chemins manuel/auto divergents et manipulation du menu qualité ; actions différées, sans preuve de récupération effective. | Une procédure commune, tentative native puis redémarrage de source par les capacités du lecteur, confirmation et observation de progression, annulation et limites explicites. |

## Ordre d'implémentation

1. Audit des modules de page, store, audio, chat, preview, VOD, recovery et de leur chargement.
2. Suppression de l'inférence de live non fondée et correction du cycle de vie des previews.
3. Consolidation du moteur audio existant et création du pont de capacités du lecteur.
4. Unification du recovery manuel/automatique/interne, avec tests temporels déterministes.
5. Correction du cycle de vie et de la déduplication du chat.
6. Timeline VOD légère, tests de géométrie et de rendu DOM.
7. Synchronisation Firefox, contrôles complets et builds.

## Architecture et principaux fichiers

### Audio

`src/contentScripts/features/playerAudioEngine.js` reste l'unique propriétaire du graphe de traitement. `streamEnhancements.js` assure l'observation du média et les contrôles utilisateur. Les deux protections partagent le même moteur et ne s'écrivent pas mutuellement dans `video.volume` ou `video.muted`.

Les sources non compatibles ne sont pas envoyées dans Web Audio. Si Twitch réutilise un élément déjà capturé pour un clip, une demande interne passe par le même gestionnaire de récupération. Le pont vérifie la disponibilité de `attachHTMLVideoElement` avant de rattacher un élément neuf au lecteur, en préservant mute et volume. Cette branche dépend des capacités internes de Twitch : sa disponibilité réelle doit encore être vérifiée. Les demandes de restauration audio sont limitées à trois par élément avec espacement croissant.

Ce choix signifie que les réglages restent activés, mais que la compression et la normalisation ne sont pas appliquées aux clips incompatibles : priorité au son natif, sans prétendre contourner la restriction CORS du navigateur.

### Recovery

`src/contentScripts/features/playerRecovery.js` centralise les demandes. `playerRecoveryPolicy.js` fournit sélecteurs et limitation. `src/contentScripts/page/playerBridge.js`, déclaré en monde MAIN dans le manifeste, vérifie localement les capacités des ancêtres React du lecteur ; aucune exploration globale de l'application.

- Reprise/bouton natif de réessai quand pertinent, puis demande de redémarrage de source.
- Pas de changement artificiel de qualité, ni de `location.reload()`.
- Vérification de la progression réelle ; après redémarrage, confirmation du pont également requise. Cas pause manuelle : média prêt et état pause préservé.
- Une opération en cours à la fois, cooldown de 8 secondes, maximum de trois tentatives par minute et arrêt automatique après trois échecs consécutifs ; backoff de 16, 32 puis 64 secondes.
- Annulation sur navigation/dispose et invalidation quand le lecteur est remplacé. Les opérations expirées ne peuvent pas effacer l'identifiant d'une nouvelle demande.
- Détection de blocage après 20 secondes sans progression sur une timeline live ; exclusions des routes clips/VOD, onglets masqués et marqueurs reconnus d'offline/publicité/content gate.
- Les erreurs explicites sont traitées séparément des stalls ; la reconnaissance de la pause volontaire dans un état d'erreur doit encore être testée sur Twitch.
- Délai de 3,5 secondes pour l'appel de source du pont et observations bornées côté gestionnaire. Une promesse Twitch ne peut pas être annulée de force, mais ses résultats devenus obsolètes ne déclenchent plus de seek/pause tardifs.
- Logs via `TFRPerformance.debug`, uniquement quand les logs de performance/debug sont activés.

Si les capacités attendues de Twitch ne sont pas présentes, le redémarrage est signalé en debug comme échoué ; aucune recharge globale surprise n'est utilisée en dernier recours.

### Chat, preview et timeline

- `streamEnhancements.js` : suivi de l'identité et du conteneur, métadonnées de réponse, déduplication bornée à 1 000 IDs et son/visuel indépendants.
- `page/playerBridge.js` : partage seulement du destinataire public, du login courant et de l'ID du message. Aucun jeton de session transmis.
- `toastAudio.js` : déverrouillage sur interaction et résultat négatif si le contexte reste suspendu ; le navigateur conserve ses règles d'autoplay.
- `liveHoverPreview.js`, `styles/sidebar.css`, `contentI18nMessages.js` : fermeture, lifecycle et libellés FR/EN.
- `panel/vodTimeline.js` : calcul pur des intervalles et rendu DOM sans dépendance graphique ; une ligne par streamer, voies supplémentaires si ses archives se chevauchent.
- `panel/vods.js`, `vods.html`, `styles/vods.css` : intégration aux filtres et à l'inspecteur existants, zoom ×1/×2/×4, défilement et libellés persistants.
- `main.js` : enrichissement des métadonnées live uniquement sur une preuve récente.
- `firefox/` : copie générée par le script de synchronisation, pas une seconde implémentation.

## Tests et builds exécutés

Validation finale :

| Commande | Résultat |
| --- | --- |
| `npm run sync:firefox` | Réussite |
| `npm run validate` → `npm test` | 436 tests réussis, 0 échec, 0 ignoré |
| `npm run validate` → `npm run check` | Syntaxe de 131 fichiers JavaScript vérifiée |
| `npm run validate` → `npm run check:firefox-sync` | Copie Firefox identique aux sources |
| `npm run validate` → `npm run check:supabase` | Setup cohérent avec les 19 migrations, aucune migration ajoutée |
| `npm run build:chrome` | ZIP généré |
| `npm run build:firefox` | ZIP généré |
| `npm run build:android` | BUILD SUCCESSFUL, APK debug généré ; avertissement Gradle `flatDir` non bloquant |

Le projet ne fournit pas de commande distincte de lint ni de typecheck. Le contrôle JavaScript existant a été utilisé, sans le présenter comme une analyse de types.

Tests ciblés exécutés durant l'implémentation : `playerAudioEngine.test.cjs`, `playerRecovery.test.cjs`, `playerBridge.test.cjs`, `streamEnhancements.test.cjs`, `liveHoverPreview.test.cjs`, `pageLiveEvidence.test.cjs`, `vodTimeline.test.cjs` et `toastAudio.test.cjs`. Ils couvrent notamment clips avec chaque combinaison audio, mute/unmute, réutilisation de graphe, reconnexion/déduplication, fermetures et hover rapide, transitions live/offline, navigation, backoff, destruction du lecteur et changement d'heure. Le rendu DOM de 100 streamers est testé, mais pas son apparence dans un véritable navigateur.

Les paquets locaux ont été régénérés dans `dist/`, avec les noms existants en 0.6.25. Ils ne constituent pas une nouvelle version publiée : ne pas confondre ces builds de travail avec les archives déjà distribuées.

## Étude FrankerFaceZ

Sources primaires consultées : [adaptation Twitch du lecteur](https://raw.githubusercontent.com/FrankerFaceZ/FrankerFaceZ/master/src/sites/twitch-twilight/modules/player.jsx) et [module lecteur partagé](https://raw.githubusercontent.com/FrankerFaceZ/FrankerFaceZ/master/src/sites/shared/player.jsx).

Retenu : identification des capacités du lecteur/PlayerSource, redémarrage de source avec conservation de position, prudence sur les sources audio et rattachement d'un élément média neuf lorsque nécessaire. Non repris : infrastructure globale de hooks/arbres React, changements de qualité, personnalisation générale du lecteur. Aucune dépendance ni portion de code FFZ n'a été incorporée ; l'implémentation locale est spécifique au projet. Les protections anti-boucle et les tests ajoutés sont propres à cette implémentation, pas une promesse de comportement identique à FFZ.

## Vérifications manuelles restantes — avant publication

1. Charger le build de travail dans Chrome puis Firefox et confirmer que le pont MAIN voit les capacités attendues du lecteur Twitch actuel.
2. Clips avec anti-sursaut seul, normalisation seule, puis les deux ; mute/unmute ; transitions live → clip → live avec et sans réutilisation du même élément vidéo. Vérifier son audible et conservation du réglage utilisateur.
3. Avec un deuxième compte, envoyer une véritable réponse native Twitch sans mention écrite : surlignage et un seul son, puis reconnexion/chat remonté/changement de chaîne. Tester aussi avant et après la première interaction autorisant l'audio.
4. Preview image et vidéo : hover rapide, entrée dans la preview, sortie, retrait de l'ancre, navigation SPA, croix, Échap et hover suivant.
5. Visiter une chaîne offline, attendre le rafraîchissement API, tester les transitions live/offline et navigation rapide ; aucune présence live fabriquée à partir du chat ou d'une rediffusion.
6. Lecteur sain, pause volontaire, erreurs réelles, réseau interrompu puis rétabli, publicité, streamer passant offline, arrière-plan prolongé et remplacement du lecteur pendant la récupération. Observer les logs debug, les limites et l'absence de rechargement de page.
7. Timeline sur petite fenêtre et écran large, beaucoup de streamers, VOD chevauchant minuit, journée de changement d'heure, zoom, clavier et ouverture de l'inspecteur. Confirmer les données réelles et l'avertissement de couverture des seules archives.
8. Coexistence avec FFZ/BTTV/7TV : plusieurs extensions peuvent aussi modifier le lecteur et doivent être vérifiées en conditions réelles.

Ces essais restent nécessaires : les mocks n'émulent ni le moteur multimédia/CORS, ni l'arbre React réel de Twitch, ni ses publicités ou restrictions d'autoplay.

## Revue complémentaire du 28 septembre 2026

Six défauts corrigés avec sept tests de régression initialement en échec : réouverture après fermeture depuis la preview, mesure AudioWorklet périmée après changement de média, deux faux succès de récupération liés à la pause, seek/pause tardifs après remplacement de vidéo, récupération native poursuivie sur une autre vidéo, et commandes du son de mentions désactivées avec le surlignage.

Validation : 443 tests réussis, 131 fichiers JavaScript vérifiés, Firefox synchronisé, setup Supabase cohérent avec 19 migrations. Builds Chrome et Firefox régénérés en 0.6.25 ; pas de nouvelle release ni de build APK dans cette revue. Les corrections restent à recharger et à vérifier sur Twitch réel. Le niveau audio « — dB » observé précédemment reste non expliqué ; la correction de mesure périmée ne constitue pas une résolution de ce symptôme.

L’utilisateur confirme désormais une session connectée et un planning VOD fonctionnel dans Brave et dans le navigateur intégré. Le blocage navigateur décrit au début du rapport est historique.

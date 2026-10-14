# Architecture de l’extension

## Ordre de chargement

Les scripts de `manifest.json` suivent leurs dépendances : outils purs, stockage, fonctionnalités, vues, contrôleurs, bootstrap puis scripts du panneau. Un module expose une API figée sur `window.TFR…`; `main.js` injecte ensuite les dépendances et ne contient plus le cycle de vie de l’application.

## Responsabilités principales

- `main.js` : configuration, traductions historiques et composition des modules.
- `appBootstrap.js` : création, démarrage et destruction des fonctionnalités.
- `favoritesStore.js` : état, persistance et mutations métier.
- `driveOAuthConfig.mjs` : sélection automatique du flux OAuth Drive selon l’identifiant DEV ou Store de l’extension.
- `driveWebOAuth.mjs` : création et validation du flux OAuth Web Google Drive, indépendamment du service worker.
- `driveBackupClient.mjs` : requêtes de sauvegarde Google Drive et compatibilité avec l’ancien espace `appDataFolder`.
- `usagePresenceRemote.mjs` et `usagePresence.js` : heartbeat anonyme, déduplication par installation et affichage du compteur communautaire.
- `supabasePublicClient.mjs` : transport RPC public unique pour les fonctionnalités Supabase anonymes, sans jeton utilisateur.
- `supabaseAuthenticatedClient.mjs` : transport Supabase authentifié, renouvellement unique après `401` et erreurs normalisées.
- Les fabriques injectées dans `appBootstrap.js` retournent toutes un constructeur. Le bootstrap valide l’ensemble de ces contrats avant de créer le store ou de démarrer une fonctionnalité.
- `sharedWorkspaceIntegrity.js` : invariants locaux et réparation ciblée des contaminations entre profils et espaces partagés.
- `favoriteVisibilityTools.js` : règle unique de visibilité des favoris live, partagée entre Twitch et le panneau latéral.
- `preferenceSanitizers.js` : validation pure des préférences utilisateur.
- `favoritesOverlay.js` : coordination de la fenêtre de gestion.
- `favoriteCategoryFilter*`, `featureSettingsConfig` et `backupTools` : sous-domaines de l’overlay.
- `sidebarRenderer.js` : coordination du rendu Twitch.
- `autoCompactEngine.js`, `sidebarSignatures.js` et `liveHoverPreview.js` : comportements autonomes de la sidebar.
- `chatModeration.js` : coordination des historiques du chat et de modération.
- `chatDomTools.js` et `moderationDurationTools.js` : recherche DOM et parsing testables indépendamment.

## Modules transversaux

- `groupGameFilter.js` : composant repliable du filtre de jeux d'un groupe. Adapte le contrôleur de filtre existant aux écritures de groupe et conserve son état d'ouverture pendant les nouveaux rendus.
- `categoryColorPicker.js` : sélecteur de couleurs réutilisable. Prévisualise la sélection et délègue l'enregistrement aux callbacks fournis par l'overlay.
- `panel/vodClient.js` : requêtes Twitch des archives et clips, pagination, normalisation et erreurs réseau. Le transport est injectable pour les tests ; ce module ne lit ni le DOM ni le stockage utilisateur.
- `panel/vods.js` : état et coordination de la page VOD, filtres, sélection, rendu Planning/Chronologie et inspecteur. Fournit au client la limite historique et l'avatar de remplacement.
- `panel/vodTimeline.js` : calcul des périodes et des positions, rendu des pistes et sélection d'un instant de lecture.

Les trois composants extraits exposent une fabrique `create`. Les dépendances sont explicites : aucun de ces composants ne reçoit l'overlay complet. Les nouveaux scripts doivent être chargés avant leur consommateur, dans le manifeste pour les composants Twitch et dans `vods.html` pour le client VOD.

- `sharedSpaceChat.js` gère l’état du chat partagé; `sharedSpaceChatView.js` rend exclusivement son interface.
- `colorTools.js` centralise les conversions et la génération pure des couleurs de groupes.
- `eventEmitter.js` fournit des abonnements isolés pour l’état, le chat et la modération.
- `projectPaths.js` centralise les ressources Chrome/Firefox et découvre automatiquement le JavaScript.
- `packageTools.js` centralise la copie, la validation du manifeste et la création des archives.
- `supabaseSetup.js` génère `supabase/setup.sql` depuis les migrations numérotées.

## Commandes de validation

- `npm run validate` exécute tous les tests et contrôles sans reconstruire les paquets.
- `npm run package:all` synchronise les fichiers générés avant de construire Chrome, Firefox et Android.

## Styles

`sidebar.css` et `overlay.css` restent des points d’entrée uniques afin de préserver explicitement l’ordre de cascade. Les nouvelles règles doivent être regroupées par composant et utiliser les préfixes `tfr-`; une extraction en feuille séparée n’est justifiée que lorsqu’un composant possède aussi son propre module JavaScript et peut être chargé indépendamment.

## Règles d’évolution

1. Préférer une fonction pure testée lorsqu’une règle ne dépend ni du DOM ni du stockage.
2. Laisser les écritures d’état dans `FavoritesStore` et les écritures DOM dans les vues.
3. Ne pas déplacer ou conserver de nœuds DOM appartenant à React/Twitch.
4. Ajouter tout nouveau script avant son consommateur dans le manifeste.
5. Exécuter les tests, la vérification JavaScript et la synchronisation Firefox avant chaque release.


## Audio, emotes et moderation (apres 0.6.26)

- `playerAudioEngine.js` possede le graphe Web Audio, les mesures, la normalisation et la calibration. Il ne construit pas d'interface et n'ecrit pas les preferences.
- `playerAudioControls.js` gere le panneau, le cycle de vie du lecteur et la calibration declenchee par le volume Twitch. La mesure reste active en arriere-plan ; seuls les indicateurs visuels attendent une page visible.
- `thirdPartyChatEmotes.js` charge les catalogues 7TV/BTTV et rend les emotes des lives et VOD. Les utilitaires de parcours du chat sont injectes par `streamEnhancements.js`, sans lui transmettre le controleur complet.
- `twitchChatEvents.js` possede la connexion IRC en lecture seule, le parsing, les messages et les sanctions de la chaine courante. Changer de chaine ou arreter le dernier abonnement efface cet etat. Le DOM ne constitue jamais une preuve de moderation.
- `chatModeration.js` consomme ces evenements et presente les historiques. Les helpers DOM servent uniquement a identifier et afficher les messages, pas a deduire une sanction.

Les manifestes Chrome et Firefox chargent les nouveaux modules avant `streamEnhancements.js`. Les tests d'architecture verifient cet ordre. Les anciennes preferences sauvegardees restent compatibles.

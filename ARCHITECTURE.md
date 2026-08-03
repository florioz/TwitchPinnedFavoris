# Architecture de l’extension

## Ordre de chargement

Les scripts de `manifest.json` suivent leurs dépendances : outils purs, stockage, fonctionnalités, vues, contrôleurs, bootstrap puis scripts du panneau. Un module expose une API figée sur `window.TFR…`; `main.js` injecte ensuite les dépendances et ne contient plus le cycle de vie de l’application.

## Responsabilités principales

- `main.js` : configuration, traductions historiques et composition des modules.
- `appBootstrap.js` : création, démarrage et destruction des fonctionnalités.
- `favoritesStore.js` : état, persistance et mutations métier.
- `preferenceSanitizers.js` : validation pure des préférences utilisateur.
- `favoritesOverlay.js` : coordination de la fenêtre de gestion.
- `favoriteCategoryFilter*`, `featureSettingsConfig` et `backupTools` : sous-domaines de l’overlay.
- `sidebarRenderer.js` : coordination du rendu Twitch.
- `autoCompactEngine.js`, `sidebarSignatures.js` et `liveHoverPreview.js` : comportements autonomes de la sidebar.
- `chatModeration.js` : coordination des historiques du chat et de modération.
- `chatDomTools.js` et `moderationDurationTools.js` : recherche DOM et parsing testables indépendamment.

## Styles

`sidebar.css` et `overlay.css` restent des points d’entrée uniques afin de préserver explicitement l’ordre de cascade. Les nouvelles règles doivent être regroupées par composant et utiliser les préfixes `tfr-`; une extraction en feuille séparée n’est justifiée que lorsqu’un composant possède aussi son propre module JavaScript et peut être chargé indépendamment.

## Règles d’évolution

1. Préférer une fonction pure testée lorsqu’une règle ne dépend ni du DOM ni du stockage.
2. Laisser les écritures d’état dans `FavoritesStore` et les écritures DOM dans les vues.
3. Ne pas déplacer ou conserver de nœuds DOM appartenant à React/Twitch.
4. Ajouter tout nouveau script avant son consommateur dans le manifeste.
5. Exécuter les tests, la vérification JavaScript et la synchronisation Firefox avant chaque release.

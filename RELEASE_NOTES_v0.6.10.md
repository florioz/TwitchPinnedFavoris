# Twitch Favorites Sidebar v0.6.10

## Français

Cette version améliore la lisibilité des messages supprimés dans le chat et termine une importante passe de fiabilisation de l’architecture interne.

### Messages supprimés

- Le contenu sauvegardé d’un message supprimé reste désormais à son emplacement d’origine.
- Le message est affiché en gris et légèrement atténué afin que son état soit immédiatement compréhensible.
- L’ancien bloc dupliqué affiché sous le message a été supprimé.
- Le rendu empêche les restaurations en doublon et se nettoie correctement lorsque l’option est désactivée.

### Interface et favoris

- Gestion de l’apparence et des filtres de catégories découpée en modules plus faciles à maintenir.
- Cycle de vie de l’application et validation des préférences isolés et testés.
- Mutations de catégories sécurisées, notamment face aux arbres de groupes incomplets ou cycliques.

### Chat et modération

- Outils DOM et parsing des durées de modération séparés du contrôleur principal.
- Rendu des messages supprimés extrait dans un module dédié.
- Nettoyage de plusieurs anciennes implémentations devenues inutiles.

### Validation

- 152 tests automatisés réussis.
- 94 fichiers JavaScript vérifiés.
- Sources Chrome et Firefox synchronisées.
- ZIP Chrome Web Store et APK Android inclus.

## English

This release improves deleted-message readability in chat and completes a substantial internal architecture and reliability pass.

### Deleted messages

- Saved deleted-message content now remains in its original chat position.
- Deleted messages are greyed and slightly faded so their state is immediately clear.
- The old duplicate block displayed below the original message has been removed.
- Rendering prevents duplicate restoration and cleans up correctly when the option is disabled.

### Interface and favorites

- Appearance management and category filters are split into smaller maintainable modules.
- Application lifecycle and preference validation are isolated and tested.
- Category mutations are safer, including protection against incomplete or cyclic group trees.

### Chat and moderation

- DOM helpers and moderation-duration parsing are separated from the main controller.
- Deleted-message rendering now lives in a dedicated module.
- Several obsolete implementations have been removed.

### Validation

- 152 automated tests passing.
- 94 JavaScript files checked.
- Chrome and Firefox sources synchronized.
- Chrome Web Store ZIP and Android APK included.

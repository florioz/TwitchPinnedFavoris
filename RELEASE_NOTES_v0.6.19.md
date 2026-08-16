# Twitch Favorites Sidebar v0.6.19

## Français

Cette version améliore la lecture et la saisie du chat Twitch, avec une intégration plus complète des émotes 7TV et BetterTTV.

### Émotes et saisie du chat

- Autocomplétion facultative des émotes 7TV et BetterTTV avec `Tab` et `Maj + Tab`.
- Aperçu visuel mis à jour à chaque émote parcourue.
- Remplacement exact du préfixe saisi, sans duplication ni saut de ligne.
- Intégration avec l’éditeur Slate de Twitch pour conserver correctement le curseur.
- Tooltips plus rapides et plus lisibles avec le nom et le fournisseur de l’émote.

### Messages et réponses

- Les réponses Twitch adressées directement à l’utilisateur déclenchent désormais le même surlignage et le même son qu’une mention.
- Restauration plus fiable du contenu des messages supprimés dans leur emplacement d’origine.
- Messages supprimés affichés en gris et en italique avec un indicateur unique, sans dupliquer le texte.

### Qualité

- Normalisation 7TV et BetterTTV isolée dans un module dédié.
- Pont React/Slate séparé du contrôleur d’autocomplétion.
- Observateurs d’images actifs uniquement lorsque la fonctionnalité est utilisée.
- 290 tests automatisés réussis.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This release improves Twitch chat reading and input, with deeper 7TV and BetterTTV emote integration.

### Emotes and chat input

- Optional 7TV and BetterTTV emote completion with `Tab` and `Shift + Tab`.
- Visual preview updates for every cycled emote.
- Exact typed-prefix replacement without duplication or unwanted line breaks.
- Twitch Slate editor integration keeps text and cursor state consistent.
- Faster, clearer tooltips showing the emote name and provider.

### Messages and replies

- Direct Twitch replies now trigger the same highlight and sound as mentions.
- More reliable restoration of deleted message content in its original location.
- Deleted messages appear gray and italic with one marker and no duplicated text.

### Quality

- 7TV and BetterTTV normalization moved to a dedicated module.
- React/Slate bridge separated from the autocomplete controller.
- Image observers run only while the feature is in use.
- 290 automated tests passing.
- Chrome Web Store ZIP, Firefox ZIP and Android APK included.

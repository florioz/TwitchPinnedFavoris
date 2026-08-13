# Twitch Favorites Sidebar v0.6.16

## Français

Cette version améliore le lecteur, le chat et le side panel, et ajoute la récupération automatique optionnelle des bonus de points de chaîne.

### Lecteur et audio

- Nouveau réglage de volume maîtrisé qui mesure le niveau du stream et atténue uniquement les passages dépassant la cible choisie.
- Moteur Web Audio isolé et testé, avec mesure du niveau et de la réduction appliquée.
- Calibration possible à partir du niveau actuellement mesuré.
- Le bouton d’historique de modération reste masqué sur les rediffusions Twitch.

### Twitch et side panel

- Nouvelle option pour réclamer automatiquement les coffres de points de chaîne.
- Le bouton d’actualisation du side panel force réellement la mise à jour et affiche un retour visuel pour les actions manuelles.
- Les actualisations automatiques restent silencieuses en arrière-plan.
- Correction d’une boucle de ResizeObserver dans le side panel.

### Chat et stabilité

- Meilleure conservation du bas du chat lors de l’affichage des réponses complètes.
- Réglages de padding et de niveau audio mutualisés et simplifiés.
- Refactor des contrôleurs audio et des composants de réglage.
- 214 tests automatisés réussis.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This release improves the player, chat and side panel, and adds optional automatic channel point bonus claiming.

### Player and audio

- New controlled-volume setting that measures stream level and only attenuates passages above the selected target.
- Isolated and tested Web Audio engine with measured level and applied reduction readouts.
- The current measured level can be used for calibration.
- The moderation history button remains hidden on Twitch replays.

### Twitch and side panel

- New option to automatically claim channel point bonus chests.
- The side-panel refresh button now forces an update and provides visual feedback for manual actions.
- Automatic background refreshes remain silent.
- Fixed a ResizeObserver loop in the side panel.

### Chat and stability

- Improved bottom-position preservation when full replies are displayed.
- Shared and simplified padding and audio-level controls.
- Refactored audio controllers and settings components.
- 214 automated tests passing.
- Chrome Web Store ZIP, Firefox ZIP and Android APK included.

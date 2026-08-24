# Twitch Favorites Sidebar v0.6.24

## Français

Cette version enrichit les espaces partagés, améliore la récupération du lecteur Twitch et renforce la fiabilité générale de l’extension.

### Espaces partagés et communauté

- Ajout d’une discussion dédiée à chaque espace partagé avec réponses, réactions, modification, suppression, signalement et blocage.
- La discussion peut être agrandie tout en restant limitée à la taille de l’overlay de l’extension.
- Ajout de badges communautaires dans le chat Twitch pour permettre aux utilisateurs de l’extension de se reconnaître.
- Ajout d’un retour visuel pendant le passage entre les profils personnels et les espaces partagés.
- Correction d’une fuite d’état qui pouvait afficher les favoris personnels et un compteur incorrect dans un espace partagé vide.
- Les couleurs aléatoires peuvent désormais être appliquées à un groupe précis.

### Lecteur et navigation

- Ajout d’un bouton configurable pour réinitialiser uniquement le lecteur, sans recharger toute la page Twitch.
- Récupération automatique améliorée lorsque le lecteur reste bloqué, y compris pour les erreurs 1000, 2000, 3000, 4000 et les pannes sans code exploitable.
- Ajout de protections contre les relances en boucle et les chargements infinis.
- Le titre complet d’un live est maintenant visible au survol dans les fenêtres de prévisualisation.
- Les commandes du lecteur liées au son et à la réinitialisation respectent désormais réellement leurs options d’affichage.

### Utilisation active et confidentialité

- Ajout d’un compteur anonyme des installations actives de l’extension.
- Le compteur utilise un identifiant local aléatoire haché et une présence temporaire, sans collecter l’identité Twitch ni l’historique de navigation.
- Une option permet de désactiver cette mesure et de retirer immédiatement la présence enregistrée.

### Connexion et synchronisation

- Sélection automatique de la configuration Google Drive adaptée à l’extension de développement ou à la version officielle du store.
- Centralisation des clients OAuth et Supabase afin d’éviter les initialisations incohérentes.
- Ajout d’un fichier Supabase complet pour les nouvelles installations, tout en conservant les migrations incrémentales.

### Qualité

- Architecture interne simplifiée avec un gestionnaire d’événements partagé et des contrôleurs mieux isolés.
- Sources Chromium et Firefox synchronisées.
- Suite automatisée complète validée avant publication.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

### Mise à jour Supabase

- Pour une installation existante en v0.6.23, appliquez les migrations `015` à `019` dans l’ordre.
- Pour une nouvelle installation, utilisez directement `supabase/setup.sql`.

## English

This release expands shared spaces, improves Twitch player recovery, and strengthens the extension’s overall reliability.

### Shared spaces and community

- Added a dedicated discussion to each shared space with replies, reactions, editing, deletion, reporting, and blocking.
- The discussion can be expanded while remaining constrained to the extension overlay.
- Added community badges in Twitch chat so extension users can recognize one another.
- Added visual feedback while switching between personal profiles and shared spaces.
- Fixed state leakage that could show personal favorites and an incorrect count inside an empty shared space.
- Random colors can now be applied to an individual group.

### Player and navigation

- Added a configurable button that resets only the player without reloading the entire Twitch page.
- Improved automatic recovery when the player becomes stuck, including errors 1000, 2000, 3000, 4000 and failures without a usable error code.
- Added safeguards against recovery loops and infinite loading.
- Full stream titles are now available on hover in live preview windows.
- Player sound and reset controls now correctly honor their visibility options.

### Active usage and privacy

- Added an anonymous counter for currently active extension installations.
- It uses a hashed random local identifier and short-lived presence, without collecting Twitch identity or browsing history.
- Users can opt out and immediately remove their recorded presence.

### Sign-in and synchronization

- Google Drive configuration is now selected automatically for either the development extension or the official store build.
- OAuth and Supabase clients are centralized to prevent inconsistent initialization.
- Added a complete Supabase setup file for new installations while keeping incremental migrations available.

### Quality

- Simplified the internal architecture with a shared event manager and better-isolated controllers.
- Chromium and Firefox sources synchronized.
- Full automated suite validated before publication.
- Chrome Web Store ZIP, Firefox ZIP, and Android APK included.

### Supabase upgrade

- Existing v0.6.23 installations should apply migrations `015` through `019` in order.
- New installations can use `supabase/setup.sql` directly.

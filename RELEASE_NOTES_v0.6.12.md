# Twitch Favorites Sidebar v0.6.12

## Français

Cette version fiabilise fortement l’historique de modération et ajoute un véritable paquet Firefox.

### Modération Twitch

- Détection des lignes existantes transformées par Twitch, et pas uniquement des nouveaux nœuds.
- Conservation du pseudo et du message original avant leur remplacement par « Message supprimé ».
- Distinction entre suppression simple, timeout et bannissement permanent.
- Détection des timeouts par marqueur explicite ou par suppression groupée des messages d’un même utilisateur.
- Association fiable lorsque le panneau de sanction arrive avant ou après la ligne supprimée.
- Durées de timeout issues du compte à rebours arrondies à la minute supérieure.
- Prise en charge du marqueur Firefox/Twitch `banned-user-message` pour les bans permanents.
- Le délai de demande de débannissement n’est plus confondu avec une durée de timeout.
- Réduction des faux positifs causés par les annonces, les boutons de modération et les mots « ban » ou « mute » dans une conversation.

### Firefox

- Nouvelle commande de build Firefox dédiée.
- Manifeste Firefox avec identifiant Gecko, script d’arrière-plan compatible et `sidebar_action`.
- ZIP Firefox validé par `web-ext lint`.

### Validation

- 163 tests automatisés réussis.
- Sources Chrome et Firefox synchronisées.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This release significantly improves moderation-history reliability and adds a proper Firefox package.

### Twitch moderation

- Detects existing chat lines transformed by Twitch, not only newly inserted nodes.
- Preserves the original username and message before Twitch replaces the content with a deletion notice.
- Distinguishes individual deletions, timeouts, and permanent bans.
- Detects timeouts from explicit markers or grouped deletion of one user’s messages.
- Reliably correlates sanctions whether the status panel or deleted line appears first.
- Rounds Twitch timeout countdowns up to the next full minute.
- Supports Twitch’s `banned-user-message` marker for permanent bans.
- Unban-request delays are no longer mistaken for timeout durations.
- Reduces false positives from announcements, moderation controls, and conversational uses of “ban” or “mute”.

### Firefox

- Added a dedicated Firefox build command.
- Firefox-specific manifest with a Gecko ID, compatible background script, and `sidebar_action`.
- Firefox ZIP validated with `web-ext lint`.

### Validation

- 163 automated tests passing.
- Chrome and Firefox sources synchronized.
- Chrome Web Store ZIP, Firefox ZIP, and Android APK included.

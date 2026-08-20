# Twitch Favorites Sidebar v0.6.21

## Français

Cette version corrective restaure le comportement stable des messages supprimés dans le chat Twitch.

### Correctif

- Retrait du filtrage expérimental qui tentait de différencier une réponse supprimée d’une réponse citant un message supprimé.
- Correction des messages supprimés qui pouvaient rester sous forme de texte natif « message supprimé par un modérateur ».
- Suppression d’un comportement pouvant répéter plusieurs fois le même message supprimé dans le chat.
- Retour au moteur de restauration éprouvé utilisé avant ce changement.
- Aucun changement sur les autres nouveautés de la version 0.6.20.

### Qualité

- Sources Chromium et Firefox synchronisées.
- 306 tests automatisés réussis.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This corrective release restores the stable deleted-message behavior in Twitch chat.

### Fix

- Removed the experimental filter that attempted to distinguish a deleted reply from a reply quoting a deleted message.
- Fixed deleted messages remaining as Twitch’s native “message deleted by a moderator” placeholder.
- Removed behavior that could repeat the same deleted message several times in chat.
- Restored the proven deleted-message engine used before this change.
- All other version 0.6.20 improvements remain unchanged.

### Quality

- Chromium and Firefox sources synchronized.
- 306 automated tests passing.
- Chrome Web Store ZIP, Firefox ZIP and Android APK included.

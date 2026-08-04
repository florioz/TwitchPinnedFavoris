# Twitch Favorites Sidebar v0.6.11

## Français

Cette version corrige deux boucles de mutations DOM susceptibles de ralentir ou de bloquer complètement Twitch.

### Stabilité du chat

- Le nettoyage des messages supprimés est désormais strictement idempotent.
- Une ligne normale ne reçoit plus d’écriture de classe inutile à chaque mutation du chat.
- Correction d’une boucle pouvant vider visuellement le chat et bloquer le thread principal du navigateur.

### Historique des utilisateurs

- L’historique ajouté aux fiches utilisateurs ignore maintenant ses propres mutations DOM.
- La reconstruction de l’historique ne peut plus se relancer automatiquement toutes les 50 ms.
- Les véritables changements de la fiche Twitch continuent d’être détectés normalement.

### Validation

- 153 tests automatisés réussis.
- Sources Chrome et Firefox synchronisées.
- ZIP Chrome Web Store et APK Android inclus.

## English

This release fixes two DOM mutation feedback loops that could slow down or completely freeze Twitch.

### Chat stability

- Deleted-message cleanup is now strictly idempotent.
- Normal chat lines no longer receive unnecessary class writes on every chat mutation.
- Fixed a loop that could visually empty chat and block the browser main thread.

### Viewer history

- History added to Twitch viewer cards now ignores its own DOM mutations.
- Rebuilding the history can no longer schedule another rebuild every 50 ms.
- Genuine Twitch viewer-card changes are still detected normally.

### Validation

- 153 automated tests passing.
- Chrome and Firefox sources synchronized.
- Chrome Web Store ZIP and Android APK included.

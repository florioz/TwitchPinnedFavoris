# Twitch Favorites Sidebar v0.5.7

## English

Live-start notifications now support sound alerts, including custom imported sounds.

### Notification Sounds

- Added an option to play a sound when a favorite streamer starts a live stream.
- Added five built-in sound presets: Soft, Chime, Arcade, Pulse, and Short Alert.
- Added a volume slider and a test button in the favorites manager.
- Added custom sound import for MP3, WAV, OGG, and WebM audio files up to 1 MB.
- Added a remove button for custom sounds.

### Multi-Tab Behavior

- Fixed duplicate notification sounds when multiple Twitch tabs are open.
- Toasts can still appear on active Twitch pages, but only one tab plays the sound.
- The active Twitch tab in the current window is preferred for audio playback.

### Sync And Compatibility

- Sound settings and custom sounds are stored in preferences, so they are included in profiles, backups, and Google Drive sync.
- Firefox build files were synchronized.

## Francais

Les notifications de debut de live peuvent maintenant jouer un son, y compris un son personnalise importe.

### Sons De Notification

- Ajout d'une option pour jouer un son quand un streamer favori lance son live.
- Ajout de cinq sons integres : Doux, Carillon, Arcade, Pulse et Alerte courte.
- Ajout d'un reglage de volume et d'un bouton de test dans la gestion des favoris.
- Ajout de l'import de son personnalise pour les fichiers MP3, WAV, OGG et WebM jusqu'a 1 Mo.
- Ajout d'un bouton pour retirer le son personnalise.

### Comportement Multi-Onglets

- Correction des sons de notification en double quand plusieurs onglets Twitch sont ouverts.
- Les notifications visuelles peuvent toujours apparaitre sur les pages Twitch actives, mais un seul onglet joue le son.
- L'onglet Twitch actif de la fenetre courante est prioritaire pour jouer l'audio.

### Synchronisation Et Compatibilite

- Les reglages de son et le son personnalise sont sauvegardes dans les preferences, donc inclus dans les profils, backups et la sync Google Drive.
- Les fichiers Firefox ont ete synchronises.

## Verification

- `npm run check`
- `npm run sync:firefox`
- `node --check src/background/serviceWorker.js`
- `node --check src/contentScripts/overlayPanel.js`
- `node --check firefox/src/background/serviceWorker.js`
- `node --check firefox/src/contentScripts/overlayPanel.js`

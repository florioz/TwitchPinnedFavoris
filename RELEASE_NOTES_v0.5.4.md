# Twitch Favorites Sidebar v0.5.4

## English

This release focuses on polish, readability, and day-to-day comfort in the chat, moderation, favorites manager, and mobile companion experience.

### Chat And Moderation

- Chat history now reads in the same direction as Twitch chat: oldest messages at the top, newest messages at the bottom.
- Moderation history now follows the same reading direction.
- Ban events are deduplicated when Twitch marks several older messages after one moderation action.
- Temporary ban labels now show the duration when Twitch exposes it.
- Temporary bans without an available duration are shown as unknown duration instead of silently hiding the missing data.
- Badge detection in captured chat history has been expanded for current Twitch DOM structures and extension-modified chat lines.
- Twitch and 7TV emotes are rendered more reliably in captured chat history.

### Favorites Manager

- Twitch player shortcuts are blocked while typing inside the favorites manager, preventing accidental pause/fullscreen actions.
- The search input keeps focus while the panel re-renders, so typing no longer requires clicking the input after every character.
- The Twitch category filter input in streamer details also keeps focus during updates.

### Browser Stability

- The expected Chrome side-panel user-gesture fallback error is now silenced.
- Real side-panel errors are still logged.
- Firefox build assets were synchronized.

### Mobile And Documentation

- Mobile version bumped to v0.5.4.
- Android debug APK version bumped to versionCode 9.
- README rewritten professionally in English and French.
- README now documents the browser extension, mobile app, installation flow, and project timeline.

## Francais

Cette version se concentre sur la finition, la lisibilite et le confort d'utilisation au quotidien dans le chat, l'historique moderation, la gestion des favoris et l'application mobile.

### Chat Et Moderation

- L'historique du chat se lit maintenant comme le chat Twitch : anciens messages en haut, messages recents en bas.
- L'historique de moderation suit le meme sens de lecture.
- Les bans sont dedupliques quand Twitch marque plusieurs anciens messages apres une seule action de moderation.
- Les bans temporaires affichent leur duree quand Twitch la fournit.
- Les bans temporaires sans duree disponible indiquent clairement que la duree est inconnue.
- La detection des badges dans l'historique chat est plus large et mieux adaptee au DOM Twitch actuel.
- Les emotes Twitch et 7TV sont mieux rendues dans l'historique capture.

### Gestion Des Favoris

- Les raccourcis du lecteur Twitch sont bloques pendant la saisie dans la gestion des favoris.
- La barre de recherche garde le focus pendant le rendu du panneau.
- Le champ de filtre categorie Twitch dans le detail d'un streamer garde aussi le focus.

### Stabilite Navigateur

- L'erreur console attendue du side panel Chrome liee au geste utilisateur est maintenant masquee.
- Les vraies erreurs side panel restent visibles.
- Les fichiers Firefox ont ete synchronises.

### Mobile Et Documentation

- Version mobile passee en v0.5.4.
- APK Android debug passe en versionCode 9.
- README reecrit proprement en anglais et en francais.
- Le README explique maintenant l'extension, l'application mobile, l'installation et la chronologie du projet.

## Verification

- `npm run check`
- `npm run sync:firefox`

# Chrome Web Store Listing Draft

## English

### Short description

Organize Twitch favorites with live groups, VOD planning, profiles, Google Drive sync, and sidebar tools.

### Detailed description

Twitch Favorites Sidebar gives heavy Twitch users a cleaner way to organize channels, live streams, VODs, and profiles.

Main features:

- Pin Twitch streamers into custom favorite profiles.
- Organize streamers into groups and nested subgroups.
- View live channels with viewer counts, Twitch category, and stream title.
- Use a global Chrome side panel to access favorites from any website.
- Manage favorites directly on Twitch with a channel favorite button and management panel.
- Customize sidebar appearance, colors, compact modes, and animations.
- Open a VOD planning page with day navigation, sorting, search, group filters, start/end time, and duration.
- Inspect VODs with clips and timeline highlights.
- Optionally sync profiles with Google Drive.
- Optionally show live-start notifications and notification sounds.
- Optionally show local chat and moderation history tools on Twitch.

The extension stores your favorites and preferences locally. Google Drive sync is optional and only used when you connect your Google account.

### Permissions justification

- `storage`: stores favorites, groups, profiles, settings, notification preferences, and local cache.
- `alarms`: refreshes live status and update checks periodically.
- `tabs`: opens Twitch channel/VOD pages and sends notifications to the right Twitch tab.
- `sidePanel`: displays the global favorites panel from any website.
- `identity`: enables optional Google Drive sync.
- `https://www.twitch.tv/*`, `https://twitch.tv/*`: integrates with Twitch pages and opens Twitch channels.
- `https://gql.twitch.tv/*`: reads Twitch live status, channels, VODs, and clips.
- `https://www.googleapis.com/*`: optional Google Drive sync.
- `https://api.github.com/*`: checks for new GitHub releases.
- `https://7tv.io/*`, `https://cdn.7tv.app/*`: optional 7TV emote metadata and images for chat history rendering.

## Francais

### Description courte

Organise tes favoris Twitch avec groupes live, planning VODs, profils, sync Drive et outils sidebar.

### Description detaillee

Twitch Favorites Sidebar aide les utilisateurs Twitch qui suivent beaucoup de streamers a mieux organiser leurs chaines, lives, VODs et profils.

Fonctionnalites principales :

- Epingler des streamers Twitch dans des profils de favoris personnalises.
- Organiser les streamers en groupes et sous-groupes.
- Voir les chaines en live avec viewers, categorie Twitch et titre du stream.
- Acceder aux favoris depuis n'importe quel site grace au side panel Chrome.
- Gerer les favoris directement sur Twitch avec un bouton sur les chaines et un panneau de gestion.
- Personnaliser l'apparence de la sidebar, les couleurs, les modes compacts et les animations.
- Ouvrir une page VODs avec navigation par jour, tri, recherche, filtres par groupe, heure de debut/fin et duree.
- Analyser les VODs avec clips et temps forts.
- Synchroniser les profils avec Google Drive de facon optionnelle.
- Afficher des notifications et sons quand un streamer demarre un live.
- Utiliser des outils locaux d'historique chat/moderation sur Twitch.

Les favoris et preferences sont stockes localement. La synchronisation Google Drive est optionnelle et utilisee uniquement apres connexion Google.

### Justification des permissions

- `storage` : stocke favoris, groupes, profils, options, notifications et cache local.
- `alarms` : actualise periodiquement les lives et les mises a jour.
- `tabs` : ouvre les pages Twitch/VODs et envoie les notifications au bon onglet Twitch.
- `sidePanel` : affiche le panneau global des favoris depuis n'importe quel site.
- `identity` : permet la synchronisation Google Drive optionnelle.
- `https://www.twitch.tv/*`, `https://twitch.tv/*` : integration aux pages Twitch et ouverture des chaines.
- `https://gql.twitch.tv/*` : recuperation des lives, chaines, VODs et clips.
- `https://www.googleapis.com/*` : synchronisation Google Drive optionnelle.
- `https://api.github.com/*` : verification des nouvelles releases GitHub.
- `https://7tv.io/*`, `https://cdn.7tv.app/*` : emotes 7TV optionnelles pour l'historique du chat.

# Twitch Favorites Sidebar v0.6.17

## Français

Cette version introduit les espaces de favoris partagés, améliore les performances entre profils et renforce la récupération du lecteur Twitch.

### Espaces partagés

- Connexion Twitch via Supabase pour créer, rejoindre et synchroniser des espaces partagés.
- Invitations par pseudo Twitch ou code, avec boîte de réception intégrée.
- Gestion des membres et des rôles propriétaire, éditeur et lecteur.
- Synchronisation automatique progressive, protection par révision et détection des conflits.
- Suppression ou départ d’un espace correctement répercuté chez les membres.
- Import initial depuis un profil local ou un fichier JSON lors de la création.
- Export contrôlable par le propriétaire de l’espace.

### Profils et sidebar

- Passage immédiat entre profils personnels et espaces partagés.
- Cache live conservé par profil pour éviter une attente réseau au retour sur une grande liste.
- Correction des compteurs et de la copie des favoris lors de la création d’un espace.
- Plusieurs améliorations de stabilité et de rendu de la sidebar.

### Lecteur Twitch

- Nouvelle option de récupération automatique du lecteur en cas d’erreur média ou de blocage durable.
- Seul le lecteur est relancé : la page, le chat et la sidebar restent intacts.
- Limitation des tentatives pour éviter les boucles de relance.

### Qualité

- Architecture des espaces partagés, du cache live et de la récupération du lecteur modularisée.
- 243 tests automatisés réussis.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This release introduces shared favorite spaces, improves profile switching performance, and adds Twitch player recovery.

### Shared spaces

- Twitch authentication through Supabase to create, join, and synchronize shared spaces.
- Invitations by Twitch username or code, with an integrated invitation inbox.
- Member management with owner, editor, and viewer roles.
- Progressive automatic synchronization with revision and conflict protection.
- Deleted or left spaces are correctly reconciled for every member.
- Initial import from a local profile or JSON file during space creation.
- Space owners can control member exports.

### Profiles and sidebar

- Immediate switching between personal profiles and shared spaces.
- Live data is preserved per profile to avoid network delays when returning to a large list.
- Fixed favorite counts and profile copying during shared-space creation.
- Multiple sidebar stability and rendering improvements.

### Twitch player

- New optional automatic recovery for media errors and prolonged player stalls.
- Only the player is restarted; the page, chat, and sidebar remain untouched.
- Recovery attempts are rate-limited to prevent retry loops.

### Quality

- Modularized shared spaces, live cache, and player recovery architecture.
- 243 automated tests passing.
- Chrome Web Store ZIP, Firefox ZIP, and Android APK included.

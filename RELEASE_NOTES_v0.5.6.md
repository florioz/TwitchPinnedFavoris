# Twitch Favorites Sidebar v0.5.6

## English

This release polishes sidebar customization and makes Google Drive sync less intrusive.

### Sidebar Comfort

- Added an option to show or hide the live favorites panel from the favorites manager.
- Removed the old clickable chevron from the live favorites header so the panel state is controlled from settings instead of being toggled accidentally.
- Kept the live favorites count visible as a simple header above the groups.
- Reduced the favorites manager backdrop opacity and removed the blur so style changes can be previewed without closing the manager.

### Appearance Controls

- Added previous and next buttons next to the group style selector.
- Added previous and next buttons next to the streamer style selector.
- Added previous and next buttons next to the sidebar surface style selector.
- Kept the dropdowns available for direct style selection.

### Google Drive Sync

- Drive sync now tries to reuse the cached Google token before opening the Google login flow.
- The web auth fallback no longer forces account selection and consent on every sync attempt.
- If the cached token is missing or expired, the extension still opens Google automatically to reconnect.

### Update Notifications

- The update banner now extracts useful changelog highlights instead of showing only the release title.
- Firefox build files were synchronized.

## Francais

Cette version affine la personnalisation de la sidebar et rend la synchronisation Google Drive moins intrusive.

### Confort Sidebar

- Ajout d'une option pour afficher ou masquer le panneau des favoris en live depuis la gestion des favoris.
- Suppression de l'ancien chevron cliquable du titre des favoris en live, pour eviter les changements accidentels.
- Le nombre total de favoris en live reste visible dans un titre simple au-dessus des groupes.
- Reduction de l'opacite du fond de la gestion des favoris et suppression du flou, pour voir les changements de style sans fermer le panneau.

### Reglages D'apparence

- Ajout de boutons precedent et suivant pour naviguer entre les styles de groupes.
- Ajout de boutons precedent et suivant pour naviguer entre les styles de streamers.
- Ajout de boutons precedent et suivant pour naviguer entre les styles de surface de sidebar.
- Les listes deroulantes restent disponibles pour choisir directement un style.

### Synchronisation Google Drive

- La synchronisation Drive essaie maintenant de reutiliser le token Google en cache avant d'ouvrir la connexion Google.
- Le fallback web ne force plus le choix du compte et le consentement a chaque tentative de sync.
- Si le token est absent ou expire, l'extension relance quand meme Google automatiquement pour reconnecter le compte.

### Notifications De Mise A Jour

- La notification de mise a jour extrait maintenant les vrais points importants du changelog au lieu d'afficher seulement le titre.
- Les fichiers Firefox ont ete synchronises.

## Verification

- `npm run check`
- `npm run sync:firefox`
- `node --check src/background/serviceWorker.js`
- `node --check firefox/src/background/serviceWorker.js`

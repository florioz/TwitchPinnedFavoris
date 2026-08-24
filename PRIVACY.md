# Privacy Policy / Politique de confidentialite

Last updated: August 25, 2026

## English

Twitch Favorites Sidebar is designed to keep your Twitch organization data under your control.

### Data stored by the extension

The extension stores the following data locally in your browser:

- favorite Twitch channels and custom profiles;
- group and subgroup organization;
- visual preferences, notification settings, and sidebar settings;
- cached live status used to reduce repeated Twitch requests;
- optional recent chat and moderation history captured from the Twitch page.

### Google Drive sync

If you enable Google Drive sync, the extension uploads and downloads a backup file containing your favorites, profiles, groups, and preferences. The extension requests the `drive.file` scope, which allows it to create and access files it owns or files you explicitly use with the extension.

Google Drive sync is optional. If you do not connect Google Drive, your data stays local to your browser.

### External services

The extension contacts these services only for extension features:

- Twitch and Twitch GraphQL: live status, streamer metadata, VODs, and clips.
- Google APIs: optional Google Drive sync.
- GitHub API: update checks.
- 7TV: optional emote metadata for chat history rendering.
- Supabase: shared spaces, community chat, and the anonymous active-installation counter.

### Anonymous active-installation counter

When enabled, the extension sends a heartbeat every 60 seconds while a Twitch tab is visible. The server receives only a SHA-256 fingerprint derived from a random identifier stored locally, the extension version, the extension environment, and the last activity time. It does not receive a Twitch username or browsing history for this counter.

The counter treats an installation as active for two minutes. Presence rows older than seven days are automatically removed. Participation can be disabled from the global backup and privacy section; disabling it immediately removes the installation fingerprint from the counter.

### Data sharing

This project does not sell personal data and does not include advertising trackers. The anonymous counter described above is limited to measuring currently active extension installations.

### Data removal

You can remove local extension data by deleting profiles inside the extension, clearing the extension storage from your browser, or uninstalling the extension. You can remove synced backups directly from your Google Drive. Disabling the anonymous counter removes its server-side installation fingerprint immediately.

### Contact

For support or privacy questions, open an issue on GitHub:

https://github.com/florioz/TwitchPinnedFavoris/issues

## Francais

Twitch Favorites Sidebar est concu pour garder tes donnees d'organisation Twitch sous ton controle.

### Donnees stockees par l'extension

L'extension stocke localement dans ton navigateur :

- les chaines Twitch favorites et les profils personnalises ;
- l'organisation des groupes et sous-groupes ;
- les preferences visuelles, notifications et options de sidebar ;
- un cache de statut live pour reduire les requetes Twitch repetees ;
- l'historique recent du chat et de moderation si ces options sont activees.

### Synchronisation Google Drive

Si tu actives la synchronisation Google Drive, l'extension envoie et recupere un fichier de sauvegarde contenant tes favoris, profils, groupes et preferences. L'extension demande le scope `drive.file`, qui lui permet de creer et d'acceder aux fichiers qu'elle possede ou que tu utilises explicitement avec elle.

La synchronisation Google Drive est optionnelle. Sans connexion Google Drive, les donnees restent locales au navigateur.

### Services externes

L'extension contacte ces services uniquement pour ses fonctionnalites :

- Twitch et Twitch GraphQL : statuts live, donnees streamers, VODs et clips.
- Google APIs : synchronisation Google Drive optionnelle.
- GitHub API : verification des mises a jour.
- 7TV : donnees d'emotes optionnelles pour l'historique du chat.
- Supabase : espaces partages, chat communautaire et compteur anonyme d'installations actives.

### Compteur anonyme d'installations actives

Lorsque cette option est activee, l'extension envoie un signal toutes les 60 secondes pendant qu'un onglet Twitch est visible. Le serveur recoit uniquement une empreinte SHA-256 derivee d'un identifiant aleatoire conserve localement, la version et l'environnement de l'extension, ainsi que la derniere heure d'activite. Aucun pseudo Twitch ni historique de navigation n'est transmis pour ce compteur.

Une installation est consideree active pendant deux minutes. Les presences datant de plus de sept jours sont automatiquement supprimees. La participation peut etre desactivee dans la section de sauvegarde globale et confidentialite ; la desactivation supprime immediatement l'empreinte du compteur.

### Partage de donnees

Le projet ne vend pas de donnees personnelles et n'integre pas de trackers publicitaires. Le compteur anonyme decrit ci-dessus sert uniquement a mesurer les installations actuellement actives.

### Suppression des donnees

Tu peux supprimer les donnees locales en supprimant les profils dans l'extension, en vidant le stockage de l'extension depuis le navigateur, ou en desinstallant l'extension. Les sauvegardes synchronisees peuvent etre supprimees directement depuis Google Drive. Desactiver le compteur anonyme supprime immediatement son empreinte cote serveur.

### Contact

Pour le support ou les questions de confidentialite, ouvre une issue sur GitHub :

https://github.com/florioz/TwitchPinnedFavoris/issues

# Twitch Favorites Sidebar v0.5.5

## English

This release adds better control over live-start toast notifications.

### Notifications

- Added a setting to enable or disable live-start on-screen notifications.
- Added configurable toast placement:
  - top left,
  - top center,
  - top right,
  - bottom left,
  - bottom center,
  - bottom right.
- Added a close button on each toast so it can be dismissed immediately.
- Added a hidden debug button in the Drive developer panel to test toast placement without waiting for a real live event.
- Test notifications can be displayed even when live-start notifications are disabled, making layout testing easier.

### Sync And Compatibility

- Notification settings are saved in the profile preferences.
- Notification settings are included in backup import/export and Drive sync.
- Firefox build files were synchronized.

## Francais

Cette version ajoute plus de controle sur les notifications affichees quand un streamer lance son live.

### Notifications

- Ajout d'une option pour activer ou desactiver les notifications visuelles de debut de live.
- Ajout du placement configurable des notifications :
  - haut gauche,
  - haut centre,
  - haut droite,
  - bas gauche,
  - bas centre,
  - bas droite.
- Ajout d'une croix sur chaque notification pour la fermer immediatement.
- Ajout d'un bouton cache dans le panneau debug Drive pour tester une notification sans attendre un vrai live.
- Les notifications de test peuvent s'afficher meme si les notifications de live sont desactivees, pour faciliter le reglage de l'interface.

### Synchronisation Et Compatibilite

- Les preferences de notification sont sauvegardees dans le profil.
- Les preferences de notification sont incluses dans les backups, imports et la sync Drive.
- Les fichiers Firefox ont ete synchronises.

## Verification

- `npm run check`
- `npm run sync:firefox`
- `npx cap sync android`
- Android debug APK build

# Twitch Favorites Sidebar v0.6.15

## Français

Cette version améliore les fonctions du chat et ajoute une protection optionnelle contre les brusques écarts de volume.

### Lecteur audio

- Nouveau bouton Anti-sursaut près du volume du lecteur Twitch.
- Compression dynamique optionnelle avec trois intensités : Douce, Équilibrée et Forte.
- État clairement identifiable selon le code visuel Twitch : violet plein lorsqu’il est actif, contour violet lorsqu’il est inactif.
- Réglages persistants, exportables avec les profils et automatiquement rattachés quand Twitch recrée le lecteur.

### Chat

- Les mentions utilisent désormais le marqueur natif de Twitch lorsque le login du compte n’est pas exposé.
- Le surlignage et le son de mention ne sont déclenchés qu’une fois par message.
- Les messages supprimés conservent leur contenu original et apparaissent grisés dans leur ligne d’origine.
- Le diagnostic de performances conserve les mesures sans polluer la console par défaut.

### Architecture et validation

- Refactor des traitements du chat, du stockage, de la sidebar et des fonctionnalités multiplateformes.
- 205 tests automatisés réussis.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This release improves chat features and adds optional protection against abrupt stream volume changes.

### Audio player

- New Volume Protection button next to Twitch's volume control.
- Optional dynamic compression with Soft, Balanced and Strong presets.
- Clear Twitch-style state: solid purple when enabled and a purple outline when disabled.
- Persistent settings exported with profiles and automatically reattached when Twitch recreates the player.

### Chat

- Mentions now use Twitch's native recipient marker when the account login is unavailable.
- Mention highlighting and sound trigger only once per message.
- Deleted messages retain their original content and are grayed out in their original line.
- Performance diagnostics retain measurements without logging console warnings by default.

### Architecture and validation

- Refactored chat processing, storage, sidebar and cross-platform feature boundaries.
- 205 automated tests passing.
- Chrome Web Store ZIP, Firefox ZIP and Android APK included.

# Twitch Favorites Sidebar v0.6.13

## Français

Cette version corrige l'affichage des groupes isolés dans le compactage automatique de la sidebar.

### Compactage automatique

- Les groupes contenant un seul streamer restent visibles et ne passent plus derrière les groupes suivants.
- L'ancrage automatique du défilement du navigateur est désactivé dans la sidebar afin d'éviter les déplacements inattendus pendant un recalcul.
- Lorsque l'utilisateur se trouve en haut de la sidebar, cette position est conservée durant les changements de niveau de compactage.
- Le positionnement et l'isolation visuelle des lignes compactes ont été renforcés.

### Validation

- 163 tests automatisés réussis.
- Sources Chrome et Firefox synchronisées.
- ZIP Chrome Web Store, ZIP Firefox et APK Android inclus.

## English

This release fixes isolated group rendering in the sidebar's automatic compact mode.

### Automatic compact mode

- Groups containing a single streamer remain visible and no longer slip behind following groups.
- Native browser scroll anchoring is disabled in the sidebar to prevent unexpected movement during layout recalculation.
- When the user is at the top of the sidebar, that position is preserved while compact levels change.
- Compact rows now use stronger positioning and visual isolation rules.

### Validation

- 163 automated tests passing.
- Chrome and Firefox sources synchronized.
- Chrome Web Store ZIP, Firefox ZIP, and Android APK included.

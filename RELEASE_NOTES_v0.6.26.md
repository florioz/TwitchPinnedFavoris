# Twitch Favorites Sidebar v0.6.26

Validation locale du 6 octobre 2026 : pipeline `npm run package:all` réussi, 465 tests réussis, 134 fichiers JavaScript vérifiés, sources Firefox synchronisées et 19 migrations Supabase cohérentes. ZIP Chrome/Firefox vérifiés ; APK Android de développement (`assembleDebug`) généré. Les tests automatisés ne remplacent pas une validation de tous les parcours sur Twitch.

## Français

### Nouveautés

- Planning VOD par défaut et vue Chronologie séparée, sur 1, 7, 30 ou 60 jours, selon les archives encore disponibles sur Twitch.
- Zoom, couleurs des groupes, curseur horaire commun et ouverture d'une VOD au moment sélectionné.
- Chargement paginé des archives, prise en charge des passages à minuit et des chevauchements.
- Filtre de jeux commun aux membres actuels et futurs d'un groupe, accessible derrière le bouton « Filtre de jeux ». Il prend la priorité sur les filtres individuels sans les effacer ; les sous-groupes conservent leurs propres règles.

### Correctifs

- Relance du lecteur améliorée, commune au bouton manuel et à la récupération automatique activée dans les options ; limitation des tentatives et contrôle de la reprise réelle.
- Restauration différée de la position des VOD après une relance et meilleure gestion des changements de lecteur.
- Corrections audio lors de la réutilisation des vidéos ; maintien de la lecture native pour les sources incompatibles avec le traitement audio.
- Notifications de mentions et réponses plus fiables, déduplication et son indépendant du surlignage.
- Aperçu des lives maintenu au survol malgré la reconstruction de la sidebar, fermeture par Échap et croix compacte.
- Boutons Favoris et Planning séparés du conteneur Prime/Luna pour éviter son infobulle.
- Suppression de l'aide technique Supabase dans l'écran de connexion des espaces partagés.
- Détection des lives fondée sur une confirmation récente plutôt que sur la seule présence d'un lecteur.

### Maintenance

- Client réseau VOD/clips, filtre de groupe et sélecteur de couleurs extraits en composants indépendants.
- Sources Chrome et Firefox synchronisées ; tests automatisés complétés.
- Les deux mois d'archives dépendent de leur disponibilité sur Twitch. Les API internes du lecteur restent susceptibles d'évoluer.
- L'APK compagnon est reconstruit avec la nouvelle version ; les changements d'interface décrits ci-dessus concernent l'extension navigateur.

## English

### New features

- Default VOD Schedule view and separate Timeline covering 1, 7, 30 or 60 days of available Twitch archives.
- Zoom, group colors, shared time cursor and playback at the selected VOD position.
- Paginated archives with overnight and overlapping stream support.
- Group game filters apply to current and future direct members. The collapsible “Game filter” controls override individual filters without deleting them; subgroups retain their own rules.

### Fixes

- Improved player restart shared by manual refresh and optional automatic recovery, with retry limits and actual playback verification.
- Delayed VOD position restoration and safer player replacement handling.
- Audio fixes for reused video elements and native playback for unsupported audio-processing sources.
- More reliable reply and mention notifications, deduplication and sound independent of highlighting.
- Hover previews survive sidebar rebuilds, with Escape dismissal and a compact close button.
- Favorites and VOD buttons sit outside the Prime/Luna tooltip wrapper.
- Removed Supabase setup details from shared-space sign-in.
- Live status requires recent confirmation rather than the presence of player markup alone.

### Maintenance

- Extracted the VOD/clip network client, group game filter and color picker into independent components.
- Synchronized Chrome/Firefox sources and expanded automated tests.
- Archive availability depends on Twitch retention. Internal player APIs may change.
- The companion APK is rebuilt with the new version; the interface changes above apply to the browser extension.

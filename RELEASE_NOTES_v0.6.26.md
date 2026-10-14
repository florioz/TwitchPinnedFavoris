# Twitch Favorites Sidebar v0.6.26

Release du 14 octobre 2026, depuis v0.6.25. Distributions Chrome/Firefox et APK Android de développement (`assembleDebug`).

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


### Audio et chat

- Volume maîtrisé : amplification progressive des passages faibles et atténuation des passages forts. Le volume Twitch prend le son actuel comme référence après un réglage, sans slider supplémentaire. Silence et mise en sourdine ne recalibrent pas la référence.
- Traitement audio maintenu lorsque la page est masquée ; meilleure prise en charge des lecteurs utilisant MediaSourceHandle.
- Modération fondée sur les événements Twitch, sans déduire les sanctions de l'apparence du chat. Les réponses citant un utilisateur sanctionné ne sont plus confondues avec ses messages.
- Historique limité à la chaîne ouverte, bouton restauré et dernier message reçu associé à la sanction. Affichage des timeouts avec durée et des bans définitifs ; la sanction la plus récente sert de motif.
- Les messages et sanctions antérieurs à la connexion ne sont pas récupérés rétroactivement.
- Émoticônes 7TV/BTTV dans les chats VOD : chargement du catalogue du propriétaire et prise en charge du conteneur replay.
- Le champ de saisie réserve la place des boutons d'émoticônes pour éviter de masquer le texte.
- Favoris live périmés retirés du cache au redémarrage, avec actualisation immédiate.
- Modules audio et émoticônes séparés, nettoyage des anciennes heuristiques de modération et traductions françaises/anglaises mises à jour.

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

### Audio and chat

- Managed volume now boosts quiet passages and reduces loud ones. Adjusting Twitch volume captures the current audio level as the reference, without an additional slider. Silence and mute do not recalibrate it.
- Audio processing stays active on hidden pages; improved support for MediaSourceHandle players.
- Moderation uses Twitch events rather than chat appearance. Replies quoting sanctioned users are no longer mistaken for their deleted messages.
- Channel-scoped moderation history, restored history button and last received message linked to each sanction. Timeout durations and permanent bans are distinguished; the latest sanction supplies the reason.
- Messages and sanctions from before the connection are not recovered retrospectively.
- 7TV/BTTV rendering in VOD chat loads the video owner's catalog and recognizes replay message containers.
- Chat input reserves space for emote buttons so they no longer cover the text.
- Stale live favorites are removed from startup cache and refreshed immediately.
- Separate audio and emote modules, removed obsolete moderation heuristics and updated French/English descriptions.

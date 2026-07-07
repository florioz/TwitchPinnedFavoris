(() => {
  const STORAGE_KEY = 'tfr_state';
  const LIVE_CACHE_KEY = 'tfr_live_cache';
  const DEFAULT_STATE = {
    activeProfileId: 'default',
    profiles: {},
    favorites: {},
    categories: [],
    preferences: {
      sortMode: 'viewersDesc',
      uncategorizedCollapsed: false,
      liveFavoritesEnabled: true,
      liveFavoritesCollapsed: false,
      recentLiveEnabled: false,
      recentLiveThresholdMinutes: 10,
      recentLiveCollapsed: false,
      hideCollapsedGroupsUntilHover: false,
      autoCompactSidebarEnabled: false,
      categoryColorOpacity: 7,
      categoryColorGradient: 62,
      categoryColorStyle: 'gradient',
      streamerItemStyle: 'default',
      autoCompactStreamerStyle: 'compact',
      autoCompactGroupStyle: 'default',
      sidebarAnimationStyle: 'soft',
      sidebarSurfaceStyle: 'default',
      sidebarSurfaceColor: '',
      specialCategoryColors: {},
      toastDurationSeconds: 6,
      toastEnabled: true,
      toastPosition: 'top-right',
      toastSoundEnabled: false,
      toastSoundVolume: 35,
      toastSoundId: 'soft',
      toastCustomSoundName: '',
      toastCustomSoundDataUrl: '',
      chatHistoryEnabled: true,
      moderationHistoryEnabled: true
    }
  };

  const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const extensionApi = globalThis.chrome ?? globalThis.browser;
  const sendExtensionMessage = (payload) =>
    new Promise((resolve) => {
      if (!extensionApi?.runtime?.sendMessage) {
        return resolve(null);
      }
      try {
        extensionApi.runtime.sendMessage(payload, (response) => {
          const error = extensionApi.runtime.lastError;
          if (error) {
            const message = String(error?.message || '').toLowerCase();
            if (message.includes('extension context invalidated') || message.includes('context invalidated')) {
              return resolve(null);
            }
            console.warn('[TFR] message error', error);
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('extension context invalidated') || message.includes('context invalidated')) {
          return resolve(null);
        }
        console.warn('[TFR] message exception', error);
        resolve(null);
      }
    });
  const STREAM_STATE_QUERY = `
    query ($login: String!) {
      user(login: $login) {
        id
        login
        displayName
        profileImageURL(width: 70)
        stream {
          id
          type
          viewersCount
          game {
            name
          }
          title
          createdAt
        }
      }
    }
  `;
  const CATEGORY_SUGGESTIONS_QUERY = `
    query CategorySuggestions($query: String!, $first: Int!) {
      searchCategories(query: $query, first: $first) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
  const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';
  const UPDATE_STORAGE_KEY = 'tfr_update_state';
  const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
  const UPDATE_REPO_API_URL = 'https://api.github.com/repos/florioz/TwitchPinnedFavoris/releases/latest';
  const UPDATE_REPO_URL = 'https://github.com/florioz/TwitchPinnedFavoris';
  const MAX_TIMEOUT_SECONDS = 14 * 24 * 60 * 60;

  const I18N_MESSAGES = {
    fr: {
      'sidebar.live.header': 'Favoris en live',
      'sidebar.live.headerWithCount': 'Favoris en live ({count})',
      'sidebar.live.empty': 'Aucun favori en direct pour le moment.',
      'sidebar.live.unavailable': 'Favori indisponible',
      'sidebar.viewerCount': '{count} spectateurs',
      'sidebar.button': 'Favoris',
      'manager.title': 'Gestion des favoris',
      'profiles.label': 'Profil de favoris',
      'profiles.defaultName': 'Mes favoris',
      'profiles.new': 'Nouveau profil',
      'profiles.rename': 'Renommer le profil',
      'profiles.delete': 'Supprimer le profil',
      'profiles.promptNew': 'Nom du nouveau profil',
      'profiles.promptRename': 'Nouveau nom du profil',
      'profiles.confirmDelete': 'Supprimer le profil "{name}" ?',
      'recent.toggle': 'Activer la section \u00ab D\u00e9but de live \u00bb',
      'recent.maxDurationLabel': 'Dur\u00e9e maximale :',
      'recent.maxDurationUnit': 'minutes',
      'recent.hint': 'Affiche les streamers qui viennent de lancer leur live pendant une dur\u00e9e limit\u00e9e.',
      'recent.sectionTitle': 'D\u00e9but de live',
      'toast.settings.title': 'Notifications instantan\u00e9es',
      'toast.settings.enabled': 'Afficher les notifications de live',
      'toast.settings.durationLabel': 'Dur\u00e9e d\'affichage :',
      'toast.settings.durationUnit': 'secondes',
      'toast.settings.positionLabel': 'Position :',
      'toast.settings.position.top-left': 'Haut gauche',
      'toast.settings.position.top-center': 'Haut centre',
      'toast.settings.position.top-right': 'Haut droite',
      'toast.settings.position.bottom-left': 'Bas gauche',
      'toast.settings.position.bottom-center': 'Bas centre',
      'toast.settings.position.bottom-right': 'Bas droite',
      'toast.settings.soundEnabled': 'Jouer un son au debut du live',
      'toast.settings.soundLabel': 'Son :',
      'toast.settings.sound.soft': 'Doux',
      'toast.settings.sound.chime': 'Carillon',
      'toast.settings.sound.arcade': 'Arcade',
      'toast.settings.sound.pulse': 'Pulse',
      'toast.settings.sound.alert': 'Alerte courte',
      'toast.settings.sound.custom': 'Son personnalise',
      'toast.settings.volumeLabel': 'Volume :',
      'toast.settings.testSound': 'Tester le son',
      'toast.settings.importSound': 'Importer un son',
      'toast.settings.removeSound': 'Retirer',
      'toast.settings.customSoundEmpty': 'Aucun son personnalise importe.',
      'toast.settings.customSoundLimit': 'MP3, WAV ou OGG. Taille max : 1 Mo.',
      'toast.settings.customSoundTooLarge': 'Le fichier est trop lourd. Limite : 1 Mo.',
      'toast.settings.customSoundInvalid': 'Format audio non supporte.',
      'toast.settings.hint': 'Contr\u00f4le l\'affichage, la dur\u00e9e et l\'emplacement des alertes de nouveau live.',
      'categoryAppearance.title': 'Apparence des groupes',
      'categoryAppearance.opacity': 'Opacit\u00e9 du fond',
      'categoryAppearance.gradient': 'Port\u00e9e / intensit\u00e9',
      'categoryAppearance.style': 'Style',
      'categoryAppearance.style.gradient': 'D\u00e9grad\u00e9',
      'categoryAppearance.style.solid': 'Fond uni',
      'categoryAppearance.style.stripe': 'Bande couleur',
      'categoryAppearance.style.glow': 'Halo',
      'categoryAppearance.style.glass': 'Verre',
      'categoryAppearance.style.outline': 'Liser\u00e9',
      'categoryAppearance.style.minimal': 'Minimal',
      'categoryAppearance.style.dot': 'Pastille',
      'categoryAppearance.style.rail': 'Rail gauche',
      'categoryAppearance.style.double': 'Double liser\u00e9',
      'categoryAppearance.style.soft-card': 'Carte douce',
      'categoryAppearance.style.soft-neon': 'Neon doux',
      'categoryAppearance.style.ribbon': 'Ruban',
      'categoryAppearance.style.count-badge': 'Badge compteur',
      'categoryAppearance.style.ink': 'Encre',
      'categoryAppearance.style.compact': 'Compact color\u00e9',
      'categoryAppearance.style.parent-accent': 'Parent accent',
      'categoryAppearance.special': 'Groupes sp\u00e9ciaux',
      'categoryAppearance.special.recent': 'D\u00e9but de live',
      'categoryAppearance.special.uncategorized': 'Sans cat\u00e9gorie',
      'categoryAppearance.hint': 'Ajuste le fond color\u00e9 des groupes dans la sidebar sans modifier les couleurs choisies.',
      'streamerAppearance.title': 'Apparence des streamers',
      'streamerAppearance.style': 'Style',
      'streamerAppearance.autoCompactStyle': 'Style compact auto',
      'streamerAppearance.autoCompactGroupStyle': 'Pr\u00e9sentation des groupes',
      'streamerAppearance.animationStyle': 'Animation sidebar',
      'streamerAppearance.animationPreview': 'Tester l animation',
      'streamerAppearance.style.default': 'Classique',
      'streamerAppearance.style.compact': 'Compact',
      'streamerAppearance.style.card': 'Carte',
      'streamerAppearance.style.soft-card': 'Carte douce',
      'streamerAppearance.style.outline': 'Liser\u00e9',
      'streamerAppearance.style.left-line': 'Ligne gauche',
      'streamerAppearance.style.avatar-ring': 'Avatar cercl\u00e9',
      'streamerAppearance.style.avatar-square': 'Avatar carr\u00e9',
      'streamerAppearance.style.neon': 'Neon',
      'streamerAppearance.style.viewer-badge': 'Badge viewers',
      'streamerAppearance.style.game-focus': 'Jeu en avant',
      'streamerAppearance.style.title-focus': 'Titre en avant',
      'streamerAppearance.style.glass': 'Verre',
      'streamerAppearance.style.minimal': 'Minimal',
      'streamerAppearance.style.avatar-grid': 'Compact ultime',
      'streamerAppearance.groupStyle.default': 'Classique',
      'streamerAppearance.groupStyle.dense': 'Ligne dense',
      'streamerAppearance.groupStyle.vertical': 'Libellé vertical',
      'streamerAppearance.animation.none': 'Aucune',
      'streamerAppearance.animation.soft': 'Fondu doux',
      'streamerAppearance.animation.slide': 'Glissement',
      'streamerAppearance.animation.pop': 'Pop',
      'streamerAppearance.animation.glow': 'Halo',
      'streamerAppearance.animation.fly': 'Traversee ecran',
      'streamerAppearance.animation.bounce': 'Rebond',
      'streamerAppearance.animation.spin': 'Vrille',
      'streamerAppearance.animation.glitch': 'Glitch',
      'streamerAppearance.hint': 'Change le rendu normal des streamers, le style compact automatique, puis bascule en avatars seuls si la sidebar reste trop longue.',
      'sidebarSurface.title': 'Surface de la sidebar',
      'sidebarSurface.style': 'Style',
      'sidebarSurface.style.default': 'Twitch classique',
      'sidebarSurface.style.full': 'Plein espace',
      'sidebarSurface.style.panel': 'Panneau sombre',
      'sidebarSurface.style.glow': 'Halo coloré',
      'sidebarSurface.style.rail': 'Rail compact',
      'sidebarSurface.style.connected': 'Groupes connectés',
      'sidebarSurface.style.layers': 'Couches',
      'sidebarSurface.style.canvas': 'Toile sombre',
      'sidebarSurface.style.edge': 'Bord à bord',
      'sidebarSurface.style.spectrum': 'Spectre',
      'sidebarSurface.style.pulse': 'Pulse',
      'sidebarSurface.style.poster': 'Affiche colorée',
      'sidebarSurface.style.arcade': 'Arcade',
      'sidebarSurface.color': 'Couleur surface',
      'sidebarSurface.hint': 'Ajuste le fond, les marges et la couleur autour des favoris en live.',
      'styleStepper.previous': 'Style pr\u00e9c\u00e9dent',
      'styleStepper.next': 'Style suivant',
      'available.title': 'Favoris disponibles',
      'available.subtitle': 'Glissez une pastille vers une cat\u00e9gorie \u00e0 droite pour organiser vos favoris.',
      'available.emptyFiltered': 'Aucun favori disponible ne correspond.',
      'available.emptyAll': 'Tous les favoris sont d\u00e9j\u00e0 rang\u00e9s.',
      'search.placeholder': 'Rechercher un streamer...',
      'sort.viewersDesc': 'Trier par spectateurs (desc.)',
      'sort.alphabetical': 'Trier A -> Z',
      'sort.recent': 'Trier par ajout r\u00e9cent',
      'categories.panel.title': 'Cat\u00e9gories',
      'categories.panel.new': 'Nouvelle cat\u00e9gorie',
      'categories.panel.empty': 'Cr\u00e9ez votre premi\u00e8re cat\u00e9gorie pour commencer.',
      'categories.defaultName': 'Favoris',
      'categories.toggle.expand': 'Afficher',
      'categories.toggle.collapse': 'Masquer',
      'categories.toggle.expandAlt': 'D\u00e9velopper',
      'categories.toggle.collapseAlt': 'R\u00e9duire',
      'categories.sub.addShort': 'Sous-cat.',
      'categories.addSub': 'Ajouter une sous-cat\u00e9gorie',
      'categories.color.label': 'Couleur',
      'categories.color.none': 'Aucune couleur',
      'categories.color.openPalette': 'Ouvrir la palette de couleur',
      'categories.color.pickFromWheel': 'Choisir une couleur dans la roue',
      'categories.color.apply': 'Appliquer',
      'categories.color.clear': 'Retirer la couleur',
      'categories.color.randomize': 'Couleurs al\u00e9atoires',
      'common.rename': 'Renommer',
      'common.delete': 'Supprimer',
      'categories.dropzone.emptyFiltered': 'Aucun favori ne correspond.',
      'categories.dropzone.empty': 'Glissez un favori ici',
      'backup.export': 'Exporter le backup',
      'backup.importing': 'Import en cours...',
      'backup.import': 'Importer un backup',
      'backup.pasteJson': 'Coller un JSON',
      'backup.exportError': 'Impossible de g\u00e9n\u00e9rer le backup. Consultez la console pour plus de d\u00e9tails.',
      'backup.importInvalidFile': 'Le fichier ne contient pas un JSON de backup valide.',
      'backup.importReadError': 'Lecture du fichier impossible. Essayez un autre fichier JSON.',
      'backup.importInvalidText': 'Le contenu fourni n\'est pas un JSON de backup valide.',
      'backup.importFailed': 'Import impossible. R\u00e9essayez.',
      'backup.importSuccess': 'Backup import\u00e9 avec succ\u00e8s !',
      'drive.title': 'Sync Google Drive',
      'drive.connect': 'Continuer avec Google',
      'drive.reconnect': 'Reconnecter Google',
      'drive.connecting': 'Connexion Google...',
      'drive.push': 'Envoyer vers Drive',
      'drive.pull': 'R\u00e9cup\u00e9rer depuis Drive',
      'drive.signOut': 'D\u00e9connexion Google',
      'drive.syncing': 'Synchronisation...',
      'drive.readyToConnect': 'Connectez votre compte Google pour activer la synchronisation des profils.',
      'drive.connected': 'Compte Google connect\u00e9. Vous pouvez envoyer ou r\u00e9cup\u00e9rer vos profils.',
      'drive.notConfigured': 'Connexion Google indisponible dans cette build. Une fois le Client ID configur\u00e9 dans la release, ce bouton ouvrira directement le choix du compte Google.',
      'drive.setupTitle': 'Assistant de configuration',
      'drive.setupStep1': 'Cr\u00e9er un identifiant OAuth Chrome Extension dans Google Cloud.',
      'drive.setupStep2': 'Autoriser le scope Google Drive appdata et l\u2019ID de cette extension.',
      'drive.setupStep3': 'Renseigner le Client ID dans manifest.json puis recharger l\u2019extension.',
      'drive.debug.testNotification': 'Tester une notification',
      'drive.debug.testSent': 'Notification de test envoy\u00e9e.',
      'drive.debug.testFailed': 'Impossible d\u2019envoyer la notification de test.',
      'drive.pushSuccess': 'Profils envoy\u00e9s sur Google Drive.',
      'drive.pullSuccess': 'Profils r\u00e9cup\u00e9r\u00e9s depuis Google Drive.',
      'drive.failed': 'Sync Drive impossible : {message}',
      'drive.confirmPull': 'R\u00e9cup\u00e9rer depuis Drive remplacera les profils locaux. Continuer ?',
      'categories.header': 'Cat\u00e9gories',
      'categories.add': 'Ajouter une cat\u00e9gorie',
      'categories.empty': 'Aucune cat\u00e9gorie pour le moment.',
      'categories.noneName': 'Sans cat\u00e9gorie',
      'categories.assignHint': 'Attribuez une cat\u00e9gorie via la liste des favoris ci-dessous.',
      'categories.assignPlaceholder': 'Assigner un favori...',
      'categories.assign': 'Assigner',
      'categories.assignEmpty': 'Aucun favori assign\u00e9 pour le moment.',
      'details.category.title': 'Cat\u00e9gorie dans l\'extension',
      'details.category.noneAvailable': 'Aucune cat\u00e9gorie disponible',
      'details.category.hint': 'Cr\u00e9ez une cat\u00e9gorie dans la colonne de gauche pour l\'assigner.',
      'details.filter.title': 'Filtre de cat\u00e9gorie Twitch',
      'details.filter.toggle': 'Afficher seulement lorsque le streamer est sur ces cat\u00e9gories',
      'details.filter.emptyEnabled': 'Aucune cat\u00e9gorie s\u00e9lectionn\u00e9e.',
      'details.filter.emptyDisabled': 'Activez le filtre pour ajouter des cat\u00e9gories.',
      'details.filter.placeholder': 'Ajouter une cat\u00e9gorie Twitch (ex : Just Chatting)',
      'details.filter.add': 'Ajouter',
      'details.filter.currentCategory': 'Cat\u00e9gorie actuelle : {game}',
      'details.filter.currentCategoryUnavailable': 'Cat\u00e9gorie actuelle indisponible',
      'details.filter.offline': 'Actuellement hors ligne',
      'details.filter.remove': 'Retirer {category}',
      'details.status.liveSince': 'En direct depuis {minutes} min sur {game} avec {viewers} spectateurs.',
      'details.status.recentHighlight': 'Appara\u00eet dans la section \u00ab D\u00e9but de live \u00bb (limite : {minutes} min).',
      'details.status.live': 'En direct sur {game} avec {viewers} spectateurs.',
      'details.status.offline': 'Ce streamer n\'est pas en direct pour le moment.',
      'details.status.unknownCategory': 'cat\u00e9gorie inconnue',
      'details.recentHighlight.toggle': 'Mettre en avant dans D\u00e9but de live',
      'common.close': 'Fermer',
      'favorites.configure': 'Param\u00e9trer {name}',
      'favorites.settingsTooltip': 'Param\u00e8tres du streamer',
      'details.panelTitle': 'Param\u00e8tres pour {name}',
      'details.panelClose': 'Fermer les param\u00e8tres de {name}',
      'common.closeAction': 'Fermer',
      'prompts.newCategory': 'Nom de la cat\u00e9gorie',
      'prompts.newSubcategory': 'Nom de la sous-cat\u00e9gorie',
      'prompts.renameCategory': 'Nouveau nom de cat\u00e9gorie',
      'prompts.pasteJson': 'Collez ici le contenu JSON du backup :',
      'prompts.newCategoryAlt': 'Nom de la nouvelle cat\u00e9gorie',
      'prompts.newSubcategoryAlt': 'Nom de la nouvelle sous-cat\u00e9gorie',
      'confirms.deleteWithName': 'Supprimer \"{name}\" ?',
      'confirms.import': 'Importer ce backup remplacera vos favoris actuels. Continuer ?',
      'confirms.deleteKeepFavorites': 'Supprimer cette cat\u00e9gorie ? Les favoris resteront enregistr\u00e9s.',
      'details.closeLink': 'Fermer',
      'history.title': 'Historique du chat',
      'history.empty': 'Aucun message r\u00e9cent pour ce compte.',
      'moderation.history.button': 'Historique mod\u00e9ration',
      'moderation.history.title': 'Historique mod\u00e9ration',
      'moderation.history.empty': 'Aucun bannissement ou timeout r\u00e9cent.',
      'moderation.history.action.ban': 'Bannissement',
      'moderation.history.action.banPermanent': 'Ban d\u00e9finitif',
      'moderation.history.action.timeout': 'Ban temporaire de {duration}',
      'moderation.history.action.timeoutShort': 'Ban temporaire',
      'moderation.history.action.timeoutUnknown': 'Ban temporaire (dur\u00e9e inconnue)',
        'moderation.history.action.deletion': 'Message supprimé',
      'moderation.history.action.deletion': 'Message supprim\u00e9',
      'moderation.history.meta.by': 'par {moderator}',
      'moderation.history.meta.at': '\u00e0 {time}',
      'moderation.history.lastMessage.none': 'Aucun message enregistr\u00e9.',
      'settings.chatHistory.toggle': 'Messages sur les fiches viewers',
      'settings.chatHistory.description': 'Affiche les derniers messages captur\u00e9s dans la carte d\u2019un viewer.',
      'settings.moderation.toggle': 'Bouton historique mod\u00e9ration',
      'settings.moderation.description': 'Ajoute un bouton dans le chat pour consulter les bans, timeouts et messages supprim\u00e9s.',
      'settings.collapsedGroups.toggle': 'Masquer les groupes repli\u00e9s hors survol',
      'settings.collapsedGroups.description': 'La sidebar reste compacte et les groupes masqu\u00e9s r\u00e9apparaissent quand la souris passe dessus.',
      'settings.autoCompactSidebar.toggle': 'Activer le compact automatique',
      'settings.autoCompactSidebar.description': 'Densifie progressivement la sidebar quand les favoris prennent trop de hauteur.',
      'settings.liveSidebar.toggle': 'Afficher le panneau des favoris en live',
      'settings.liveSidebar.description': 'Ajoute ou retire la section des favoris en live dans la sidebar Twitch.',
      'recent.badgeLabel': 'D\u00e9but de live',
      'recent.badgeShort': 'Live'
    },
    en: {
      'sidebar.live.header': 'Live favorites',
      'sidebar.live.headerWithCount': 'Live favorites ({count})',
      'sidebar.live.empty': 'No favorites are live right now.',
      'sidebar.live.unavailable': 'Favorite unavailable',
      'sidebar.viewerCount': '{count} viewers',
      'sidebar.button': 'Favorites',
      'manager.title': 'Favorites manager',
      'profiles.label': 'Favorites profile',
      'profiles.defaultName': 'My favorites',
      'profiles.new': 'New profile',
      'profiles.rename': 'Rename profile',
      'profiles.delete': 'Delete profile',
      'profiles.promptNew': 'New profile name',
      'profiles.promptRename': 'New profile name',
      'profiles.confirmDelete': 'Delete profile "{name}"?',
      'recent.toggle': 'Enable the "Recently live" section',
      'recent.maxDurationLabel': 'Maximum duration:',
      'recent.maxDurationUnit': 'minutes',
      'recent.hint': 'Shows streamers who just went live for a limited time.',
      'recent.sectionTitle': 'Recently live',
      'toast.settings.title': 'Instant notifications',
      'toast.settings.enabled': 'Show live-start notifications',
      'toast.settings.durationLabel': 'Display duration:',
      'toast.settings.durationUnit': 'seconds',
      'toast.settings.positionLabel': 'Position:',
      'toast.settings.position.top-left': 'Top left',
      'toast.settings.position.top-center': 'Top center',
      'toast.settings.position.top-right': 'Top right',
      'toast.settings.position.bottom-left': 'Bottom left',
      'toast.settings.position.bottom-center': 'Bottom center',
      'toast.settings.position.bottom-right': 'Bottom right',
      'toast.settings.soundEnabled': 'Play a sound when a stream starts',
      'toast.settings.soundLabel': 'Sound:',
      'toast.settings.sound.soft': 'Soft',
      'toast.settings.sound.chime': 'Chime',
      'toast.settings.sound.arcade': 'Arcade',
      'toast.settings.sound.pulse': 'Pulse',
      'toast.settings.sound.alert': 'Short alert',
      'toast.settings.sound.custom': 'Custom sound',
      'toast.settings.volumeLabel': 'Volume:',
      'toast.settings.testSound': 'Test sound',
      'toast.settings.importSound': 'Import sound',
      'toast.settings.removeSound': 'Remove',
      'toast.settings.customSoundEmpty': 'No custom sound imported.',
      'toast.settings.customSoundLimit': 'MP3, WAV, or OGG. Max size: 1 MB.',
      'toast.settings.customSoundTooLarge': 'The file is too large. Limit: 1 MB.',
      'toast.settings.customSoundInvalid': 'Unsupported audio format.',
      'toast.settings.hint': 'Controls visibility, duration, and screen position for live-start alerts.',
      'categoryAppearance.title': 'Group appearance',
      'categoryAppearance.opacity': 'Background opacity',
      'categoryAppearance.gradient': 'Range / intensity',
      'categoryAppearance.style': 'Style',
      'categoryAppearance.style.gradient': 'Gradient',
      'categoryAppearance.style.solid': 'Solid fill',
      'categoryAppearance.style.stripe': 'Color stripe',
      'categoryAppearance.style.glow': 'Glow',
      'categoryAppearance.style.glass': 'Glass',
      'categoryAppearance.style.outline': 'Outline',
      'categoryAppearance.style.minimal': 'Minimal',
      'categoryAppearance.style.dot': 'Dot',
      'categoryAppearance.style.rail': 'Left rail',
      'categoryAppearance.style.double': 'Double outline',
      'categoryAppearance.style.soft-card': 'Soft card',
      'categoryAppearance.style.soft-neon': 'Soft neon',
      'categoryAppearance.style.ribbon': 'Ribbon',
      'categoryAppearance.style.count-badge': 'Colored count badge',
      'categoryAppearance.style.ink': 'Ink',
      'categoryAppearance.style.compact': 'Colored compact',
      'categoryAppearance.style.parent-accent': 'Parent accent',
      'categoryAppearance.special': 'Special groups',
      'categoryAppearance.special.recent': 'Recently live',
      'categoryAppearance.special.uncategorized': 'Uncategorized',
      'categoryAppearance.hint': 'Adjusts colored group backgrounds in the sidebar without changing selected colors.',
      'streamerAppearance.title': 'Streamer appearance',
      'streamerAppearance.style': 'Style',
      'streamerAppearance.autoCompactStyle': 'Auto compact style',
      'streamerAppearance.autoCompactGroupStyle': 'Group layout',
      'streamerAppearance.animationStyle': 'Sidebar animation',
      'streamerAppearance.animationPreview': 'Test animation',
      'streamerAppearance.style.default': 'Classic',
      'streamerAppearance.style.compact': 'Compact',
      'streamerAppearance.style.card': 'Card',
      'streamerAppearance.style.soft-card': 'Soft card',
      'streamerAppearance.style.outline': 'Outline',
      'streamerAppearance.style.left-line': 'Left line',
      'streamerAppearance.style.avatar-ring': 'Avatar ring',
      'streamerAppearance.style.avatar-square': 'Square avatar',
      'streamerAppearance.style.neon': 'Neon',
      'streamerAppearance.style.viewer-badge': 'Viewer badge',
      'streamerAppearance.style.game-focus': 'Game focus',
      'streamerAppearance.style.title-focus': 'Title focus',
      'streamerAppearance.style.glass': 'Glass',
      'streamerAppearance.style.minimal': 'Minimal',
      'streamerAppearance.style.avatar-grid': 'Ultimate compact',
      'streamerAppearance.groupStyle.default': 'Classic',
      'streamerAppearance.groupStyle.dense': 'Dense row',
      'streamerAppearance.groupStyle.vertical': 'Vertical label',
      'streamerAppearance.animation.none': 'None',
      'streamerAppearance.animation.soft': 'Soft fade',
      'streamerAppearance.animation.slide': 'Slide',
      'streamerAppearance.animation.pop': 'Pop',
      'streamerAppearance.animation.glow': 'Glow',
      'streamerAppearance.animation.fly': 'Screen fly-in',
      'streamerAppearance.animation.bounce': 'Bounce',
      'streamerAppearance.animation.spin': 'Spin',
      'streamerAppearance.animation.glitch': 'Glitch',
      'streamerAppearance.hint': 'Changes normal streamer rows, the automatic compact style, then falls back to avatars only if the sidebar is still too long.',
      'sidebarSurface.title': 'Sidebar surface',
      'sidebarSurface.style': 'Style',
      'sidebarSurface.style.default': 'Classic Twitch',
      'sidebarSurface.style.full': 'Full width',
      'sidebarSurface.style.panel': 'Dark panel',
      'sidebarSurface.style.glow': 'Colored glow',
      'sidebarSurface.style.rail': 'Compact rail',
      'sidebarSurface.style.connected': 'Connected groups',
      'sidebarSurface.style.layers': 'Layers',
      'sidebarSurface.style.canvas': 'Dark canvas',
      'sidebarSurface.style.edge': 'Edge to edge',
      'sidebarSurface.style.spectrum': 'Spectrum',
      'sidebarSurface.style.pulse': 'Pulse',
      'sidebarSurface.style.poster': 'Color poster',
      'sidebarSurface.style.arcade': 'Arcade',
      'sidebarSurface.color': 'Surface color',
      'sidebarSurface.hint': 'Adjusts the background, spacing, and color around live favorites.',
      'styleStepper.previous': 'Previous style',
      'styleStepper.next': 'Next style',
      'available.title': 'Available favorites',
      'available.subtitle': 'Drag a chip onto a category on the right to organise your favorites.',
      'available.emptyFiltered': 'No available favorites match.',
      'available.emptyAll': 'All favorites are already organised.',
      'search.placeholder': 'Search for a streamer...',
      'sort.viewersDesc': 'Sort by viewers (desc.)',
      'sort.alphabetical': 'Sort A -> Z',
      'sort.recent': 'Sort by recently added',
      'categories.panel.title': 'Catégories',
      'categories.panel.new': 'New category',
      'categories.panel.empty': 'Create your first category to get started.',
      'categories.defaultName': 'Favorites',
      'categories.toggle.expand': 'Show',
      'categories.toggle.collapse': 'Hide',
      'categories.toggle.expandAlt': 'Expand',
      'categories.toggle.collapseAlt': 'Collapse',
      'categories.sub.addShort': 'Sub-cat.',
      'categories.addSub': 'Add a subcategory',
      'categories.color.label': 'Color',
      'categories.color.none': 'No color',
      'categories.color.openPalette': 'Open color palette',
      'categories.color.pickFromWheel': 'Pick a color from the wheel',
      'categories.color.apply': 'Apply',
      'categories.color.clear': 'Remove color',
      'categories.color.randomize': 'Random colors',
      'common.rename': 'Rename',
      'common.delete': 'Delete',
      'categories.dropzone.emptyFiltered': 'No favorite matches.',
      'categories.dropzone.empty': 'Drag a favorite here',
      'backup.export': 'Export backup',
      'backup.importing': 'Import in progress...',
      'backup.import': 'Import a backup',
      'backup.pasteJson': 'Paste JSON',
      'backup.exportError': 'Unable to generate the backup. Check the console for details.',
      'backup.importInvalidFile': 'The file does not contain a valid backup JSON.',
      'backup.importReadError': 'Unable to read the file. Try a different JSON file.',
      'backup.importInvalidText': 'The provided content is not a valid backup JSON.',
      'backup.importFailed': 'Import failed. Please try again.',
      'backup.importSuccess': 'Backup imported successfully!',
      'drive.title': 'Google Drive sync',
      'drive.connect': 'Continue with Google',
      'drive.reconnect': 'Reconnect Google',
      'drive.connecting': 'Connecting Google...',
      'drive.push': 'Send to Drive',
      'drive.pull': 'Pull from Drive',
      'drive.signOut': 'Google sign out',
      'drive.syncing': 'Syncing...',
      'drive.readyToConnect': 'Connect your Google account to enable profile sync.',
      'drive.connected': 'Google account connected. You can send or pull your profiles.',
      'drive.notConfigured': 'Google connection unavailable in this build. Once the Client ID is configured in the release, this button will open the Google account chooser directly.',
      'drive.setupTitle': 'Setup assistant',
      'drive.setupStep1': 'Create a Chrome Extension OAuth client in Google Cloud.',
      'drive.setupStep2': 'Allow the Google Drive appdata scope and this extension ID.',
      'drive.setupStep3': 'Set the Client ID in manifest.json, then reload the extension.',
      'drive.debug.testNotification': 'Test notification',
      'drive.debug.testSent': 'Test notification sent.',
      'drive.debug.testFailed': 'Could not send test notification.',
      'drive.pushSuccess': 'Profiles sent to Google Drive.',
      'drive.pullSuccess': 'Profiles pulled from Google Drive.',
      'drive.failed': 'Drive sync failed: {message}',
      'drive.confirmPull': 'Pulling from Drive will replace local profiles. Continue?',
      'categories.header': 'Catégories',
      'categories.add': 'Add a category',
      'categories.empty': 'No categories yet.',
      'categories.noneName': 'No category',
      'categories.assignHint': 'Assign a category using the favorites list below.',
      'categories.assignPlaceholder': 'Assign a favorite...',
      'categories.assign': 'Assign',
      'categories.assignEmpty': 'No favorites assigned yet.',
      'details.category.title': 'Extension category',
      'details.category.noneAvailable': 'No category available',
      'details.category.hint': 'Create a category in the left column to assign it.',
      'details.filter.title': 'Twitch category filter',
      'details.filter.toggle': 'Show only when the streamer is in these categories',
      'details.filter.emptyEnabled': 'No category selected.',
      'details.filter.emptyDisabled': 'Enable the filter to add categories.',
      'details.filter.placeholder': 'Add a Twitch category (e.g., Just Chatting)',
      'details.filter.add': 'Add',
      'details.filter.currentCategory': 'Current category: {game}',
      'details.filter.currentCategoryUnavailable': 'Current category unavailable',
      'details.filter.offline': 'Currently offline',
      'details.filter.remove': 'Remove {category}',
      'details.status.liveSince': 'Live for {minutes} min in {game} with {viewers} viewers.',
      'details.status.recentHighlight': 'Shown in the "Recently live" section (limit: {minutes} min).',
      'details.status.live': 'Live in {game} with {viewers} viewers.',
      'details.status.offline': 'This streamer is currently offline.',
      'details.status.unknownCategory': 'unknown category',
      'details.recentHighlight.toggle': 'Highlight in Recently live',
      'common.close': 'Close',
      'favorites.configure': 'Configure {name}',
      'favorites.settingsTooltip': 'Streamer settings',
      'details.panelTitle': 'Settings for {name}',
      'details.panelClose': 'Close settings for {name}',
      'common.closeAction': 'Close',
      'prompts.newCategory': 'Name of the category',
      'prompts.newSubcategory': 'Name of the subcategory',
      'prompts.renameCategory': 'New category name',
      'prompts.pasteJson': 'Paste the JSON backup content here:',
      'prompts.newCategoryAlt': 'Name of the new category',
      'prompts.newSubcategoryAlt': 'Name of the new subcategory',
      'confirms.deleteWithName': 'Delete "{name}"?',
      'confirms.import': 'Importing this backup will replace your current favorites. Continue?',
      'confirms.deleteKeepFavorites': 'Delete this category? Favorites will stay saved.',
      'details.closeLink': 'Close',
      'history.title': 'Chat history',
      'history.empty': 'No recent messages for this account.',
      'moderation.history.button': 'Moderation history',
      'moderation.history.title': 'Moderation history',
      'moderation.history.empty': 'No recent bans or timeouts.',
      'moderation.history.action.ban': 'Ban',
      'moderation.history.action.banPermanent': 'Permanent ban',
      'moderation.history.action.timeout': 'Temporary ban for {duration}',
      'moderation.history.action.timeoutShort': 'Temporary ban',
      'moderation.history.action.timeoutUnknown': 'Temporary ban (unknown duration)',
      'moderation.history.action.deletion': 'Message deleted',
      'moderation.history.meta.by': 'by {moderator}',
      'moderation.history.meta.at': 'at {time}',
      'moderation.history.lastMessage.none': 'No message captured.',
      'settings.chatHistory.toggle': 'Viewer-card chat messages',
      'settings.chatHistory.description': 'Shows captured recent messages inside viewer cards.',
      'settings.moderation.toggle': 'Moderation history button',
      'settings.moderation.description': 'Adds a chat button for bans, timeouts, and deleted messages.',
      'settings.collapsedGroups.toggle': 'Hide collapsed groups until hover',
      'settings.collapsedGroups.description': 'Keeps the sidebar compact and reveals hidden groups when the mouse hovers it.',
      'settings.autoCompactSidebar.toggle': 'Enable automatic compact mode',
      'settings.autoCompactSidebar.description': 'Progressively densifies the sidebar when favorites take too much vertical space.',
      'settings.liveSidebar.toggle': 'Show live favorites panel',
      'settings.liveSidebar.description': 'Adds or removes the live favorites section in the Twitch sidebar.',
      'recent.badgeLabel': 'Recently live',
      'recent.badgeShort': 'Live'
    }
  };

  const I18N_PLURAL_MESSAGES = {
    fr: {
      'categories.uncategorizedMeta': {
        one: '{count} favori sans cat\u00e9gorie',
        other: '{count} favoris sans cat\u00e9gorie'
      },
      'categories.totalMeta': {
        one: '{count} favori',
        other: '{count} favoris'
      }
    },
    en: {
      'categories.uncategorizedMeta': {
        one: '{count} favorite without category',
        other: '{count} favorites without category'
      },
      'categories.totalMeta': {
        one: '{count} favorite',
        other: '{count} favorites'
      }
    }
  };

  const detectLocale = () => {
    const languages = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (const lang of languages) {
      if (!lang || typeof lang !== 'string') continue;
      const normalized = lang.toLowerCase();
      if (normalized.startsWith('fr')) return 'fr';
      if (normalized.startsWith('en')) return 'en';
    }
    return 'en';
  };

  const CURRENT_LOCALE = detectLocale();
  const FALLBACK_LOCALE = 'en';
  const PLURAL_RULES = new Intl.PluralRules(CURRENT_LOCALE === 'fr' ? 'fr' : 'en');

  const formatTemplate = (template, params = {}) => {
    if (typeof template !== 'string') return '';
    return template.replace(/\{(\w+)\}/g, (_, token) => {
      if (Object.prototype.hasOwnProperty.call(params, token)) {
        return params[token];
      }
      return '';
    });
  };

  const getMessage = (key) => {
    const localeMessages = I18N_MESSAGES[CURRENT_LOCALE] || {};
    if (Object.prototype.hasOwnProperty.call(localeMessages, key)) {
      return localeMessages[key];
    }
    const fallbackMessages = I18N_MESSAGES[FALLBACK_LOCALE] || {};
    if (Object.prototype.hasOwnProperty.call(fallbackMessages, key)) {
      return fallbackMessages[key];
    }
    return null;
  };

  const getPluralMessage = (key, count) => {
    const localeMessages = I18N_PLURAL_MESSAGES[CURRENT_LOCALE] || {};
    const fallbackMessages = I18N_PLURAL_MESSAGES[FALLBACK_LOCALE] || {};
    const selectTemplate = (messages) => {
      if (!messages || !Object.prototype.hasOwnProperty.call(messages, key)) return null;
      const entry = messages[key];
      if (!entry || typeof entry !== 'object') return null;
      const rule = PLURAL_RULES.select(count);
      return entry[rule] || entry.other || entry.one || null;
    };
    return selectTemplate(localeMessages) || selectTemplate(fallbackMessages);
  };

  const t = (key, params = {}) => {
    const message = getMessage(key);
    if (message !== null) {
      if (typeof message === 'object') {
        const count = Number(params.count ?? 0);
        const template = getPluralMessage(key, count);
        if (template) {
          return formatTemplate(template, params);
        }
        return formatTemplate('', params);
      }
      return formatTemplate(message, params);
    }
    const count = Number(params.count ?? 0);
    const fallbackPlural = getPluralMessage(key, count);
    if (fallbackPlural) {
      return formatTemplate(fallbackPlural, params);
    }
    return formatTemplate(key, params);
  };

  const RESERVED_PATHS = new Set([
    '', 'directory', 'p', 'jobs', 'downloads', 'friends', 'messages', 'settings',
    'logout', 'signup', 'products', 'store', 'turbo', 'videos', 'search'
  ]);

  const CHANGE_KIND = { STATE: 'state', LIVE: 'live' };
  const POLL_INTERVAL_MS = 60000;
  const LOCATION_CHECK_INTERVAL = 500;

  const deepCopy = (value) => (value ? JSON.parse(JSON.stringify(value)) : value);

  const fetchCategorySuggestions = async (term, limit = 10) => {
    const trimmed = (term || '').trim();
    if (!trimmed) {
      return [];
    }
    try {
      const response = await fetch(TWITCH_GRAPHQL_ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: CATEGORY_SUGGESTIONS_QUERY,
          variables: { query: trimmed, first: limit }
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const edges = payload?.data?.searchCategories?.edges;
      if (!Array.isArray(edges)) {
        return [];
      }
      return edges
        .map((edge) => edge?.node?.name)
        .filter((name) => typeof name === 'string' && name.trim());
    } catch (error) {
      console.error('[TFR] Failed to fetch category suggestions', term, error);
      return [];
    }
  };

  const formatViewers = (count) => {
    if (!count || Number.isNaN(count)) return '0';
    if (count < 1000) return `${count}`;
    if (count < 1000000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  };

  const formatDurationClock = (seconds) => {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) {
      return '';
    }
    const totalSeconds = Math.round(value);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const formatModerationDurationLabel = (seconds) => {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) {
      return '';
    }
    const totalSeconds = Math.round(value);
    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    }
    const minutes = Math.round(totalSeconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return `${hours} h`;
    }
    const days = Math.round(hours / 24);
    return `${days} j`;
  };
  const formatModerationTimestamp = (timestamp) => {
    if (!Number.isFinite(timestamp)) {
      return '';
    }
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) {
      return '';
    }
    const now = new Date();
    const isSameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    try {
      const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (isSameDay) {
        return time;
      }
      const day = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `${day} ${time}`;
    } catch {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      if (isSameDay) {
        return `${hours}:${minutes}`;
      }
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${month}/${day} ${hours}:${minutes}`;
    }
  };

  const normalizeCategoryName = (value) => {
    if (!value) return '';
    let output = String(value).trim().toLocaleLowerCase();
    if (typeof output.normalize === 'function') {
      output = output.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return output;
  };

  const sanitizeCategoryList = (values) => {
    if (!Array.isArray(values)) {
      return [];
    }
    const seen = new Set();
    const sanitized = [];
    values.forEach((value) => {
      if (typeof value !== 'string') return;
      const raw = value.trim();
      if (!raw) return;
      const key = normalizeCategoryName(raw);
      if (!key || seen.has(key)) return;
      seen.add(key);
      sanitized.push(raw);
    });
    return sanitized;
  };

  const shouldDisplayFavorite = (favoriteEntry, liveEntry) => {
    if (!liveEntry || !liveEntry.isLive) {
      return false;
    }
    const filter = favoriteEntry?.categoryFilter;
    if (!filter || !filter.enabled) {
      return true;
    }
    const categories = Array.isArray(filter.categories)
      ? filter.categories
      : typeof filter.category === 'string'
      ? [filter.category]
      : [];
    if (!categories.length) {
      return true;
    }
    const requiredSet = new Set();
    categories.forEach((category) => {
      const normalized = normalizeCategoryName(category);
      if (normalized) {
        requiredSet.add(normalized);
      }
    });
    if (!requiredSet.size) {
      return true;
    }
    const currentCategory = normalizeCategoryName(liveEntry.game);
    if (!currentCategory) {
      return Boolean(liveEntry.fetchFailed || liveEntry.inferredFromPage);
    }
    return requiredSet.has(currentCategory);
  };

  const getLiveDataEntry = (liveData, favOrLogin) => {
    const login = typeof favOrLogin === 'string' ? favOrLogin : favOrLogin?.login;
    const normalized = String(login || '').toLowerCase();
    return normalized ? liveData?.[normalized] || liveData?.[login] || null : null;
  };

  const getSidebarVisibilityInfo = (favoriteEntry, liveEntry) => {
    if (!favoriteEntry) {
      return { visible: false, reason: 'Favori introuvable.' };
    }
    if (!liveEntry) {
      return { visible: false, reason: 'Pas de donnée live reçue pour ce streamer.' };
    }
    if (!liveEntry.isLive) {
      return { visible: false, reason: 'Le streamer est considéré hors-ligne par les données actuelles.' };
    }
    const filter = favoriteEntry.categoryFilter;
    if (!filter || !filter.enabled) {
      return { visible: true, reason: 'Visible dans la sidebar : aucun filtre Twitch actif.' };
    }
    const categories = Array.isArray(filter.categories)
      ? filter.categories
      : typeof filter.category === 'string'
      ? [filter.category]
      : [];
    if (!categories.length) {
      return { visible: true, reason: 'Visible dans la sidebar : filtre actif mais vide.' };
    }
    const currentCategory = normalizeCategoryName(liveEntry.game);
    if (!currentCategory) {
      if (liveEntry.fetchFailed || liveEntry.inferredFromPage) {
        return { visible: true, reason: 'Visible dans la sidebar : catégorie Twitch inconnue, mais live détecté.' };
      }
      return { visible: false, reason: 'Caché : catégorie Twitch actuelle inconnue.' };
    }
    const requiredSet = new Set(categories.map((category) => normalizeCategoryName(category)).filter(Boolean));
    if (requiredSet.has(currentCategory)) {
      return { visible: true, reason: `Visible dans la sidebar : catégorie Twitch "${liveEntry.game}" acceptée.` };
    }
    return { visible: false, reason: `Caché : catégorie Twitch "${liveEntry.game}" hors filtre.` };
  };

  const getChannelFromLocation = (locationLike = window.location) => {
    const raw = (locationLike.pathname || '').split('/').filter(Boolean);
    if (!raw.length) return null;
    const candidate = raw[0].toLowerCase();
    return RESERVED_PATHS.has(candidate) ? null : candidate;
  };

  const getFirstText = (selectors) => {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const text = node?.textContent?.trim();
      if (text) {
        return text;
      }
    }
    return '';
  };

  const parseViewerText = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return 0;
    }
    const match = normalized.match(/(\d+(?:[\s.,]\d+)?)(\s*[km])?/i);
    if (!match) {
      return 0;
    }
    const numeric = Number(match[1].replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    const suffix = (match[2] || '').trim().toLowerCase();
    if (suffix === 'k') {
      return Math.round(numeric * 1000);
    }
    if (suffix === 'm') {
      return Math.round(numeric * 1000000);
    }
    return Math.round(numeric);
  };

  const inferCurrentPageLiveData = (login, fallback = {}) => {
    const normalized = String(login || '').toLowerCase();
    if (!normalized || getChannelFromLocation(window.location) !== normalized) {
      return null;
    }
    const hasOfflineMarker = Boolean(
      document.querySelector(
        '[data-a-target="offline-channel-main-content"], [data-test-selector="offline-channel-main-content"], [data-a-target="channel-offline-status"]'
      )
    );
    if (hasOfflineMarker) {
      return null;
    }
    const hasLiveMarker = Boolean(
      document.querySelector(
        '[data-a-target="animated-channel-viewers-count"], [data-a-target="channel-viewers-count"], [data-a-target="stream-title"], [data-a-target="video-player"], .video-player__container'
      )
    );
    const pageText = document.body?.innerText || '';
    const hasLiveText = /\bLIVE\b|Bienvenue sur le chat de|spectateurs?/i.test(pageText);
    if (!hasLiveMarker && !hasLiveText) {
      return null;
    }
    const title = getFirstText([
      '[data-a-target="stream-title"]',
      '[data-test-selector="stream-title"]',
      'h1[data-a-target]'
    ]);
    const game = getFirstText([
      '[data-a-target="stream-game-link"]',
      '[data-test-selector="stream-game-link"]',
      'a[href^="/directory/category/"]'
    ]);
    const viewerText = getFirstText([
      '[data-a-target="animated-channel-viewers-count"]',
      '[data-a-target="channel-viewers-count"]',
      '[data-test-selector="animated-channel-viewers-count"]'
    ]);
    return {
      login: normalized,
      displayName: fallback.displayName || fallback.display_name || normalized,
      avatarUrl: fallback.avatarUrl || fallback.profileImageURL || DEFAULT_AVATAR,
      isLive: true,
      viewers: parseViewerText(viewerText) || Number(fallback.viewers) || 0,
      title: title || fallback.title || '',
      game: game || fallback.game || '',
      startedAt: fallback.startedAt || new Date().toISOString(),
      fetchFailed: Boolean(fallback.fetchFailed),
      inferredFromPage: true
    };
  };

  const createOfflineLiveData = (login, fallback = {}) => ({
    login: String(fallback.login || login || '').toLowerCase(),
    displayName: fallback.displayName || fallback.display_name || login,
    avatarUrl: fallback.avatarUrl || fallback.profileImageURL || DEFAULT_AVATAR,
    isLive: false,
    viewers: 0,
    title: '',
    game: '',
    startedAt: null
  });

  const createLiveDataFallback = (login, fallback = {}) => {
    const offline = createOfflineLiveData(login, fallback);
    if (fallback && fallback.isLive) {
      return {
        ...offline,
        ...fallback,
        login: String(fallback.login || login || '').toLowerCase(),
        displayName: fallback.displayName || offline.displayName,
        avatarUrl: fallback.avatarUrl || offline.avatarUrl,
        fetchFailed: true
      };
    }
    return { ...offline, fetchFailed: true };
  };

  const fetchStreamerLiveData = async (login, fallback = {}) => {
    if (!login) return null;
    const fallbackLiveData = createLiveDataFallback(login, fallback);
    const backgroundResponse = await sendExtensionMessage({ type: 'TFR_FETCH_LIVE_DATA', login, fallback: fallbackLiveData });
    if (backgroundResponse?.ok && backgroundResponse.liveData) {
      return {
        ...fallbackLiveData,
        ...backgroundResponse.liveData,
        login: String(backgroundResponse.liveData.login || fallbackLiveData.login || login).toLowerCase(),
        fetchFailed: Boolean(backgroundResponse.liveData.fetchFailed)
      };
    }
    try {
      const response = await fetch(TWITCH_GRAPHQL_ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: STREAM_STATE_QUERY, variables: { login } })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const data = Array.isArray(payload) ? payload[0]?.data : payload?.data;
      const user = data?.user;
      if (!user) {
        return fallbackLiveData;
      }
      const stream = user.stream;
      return {
        login: String(user.login || login).toLowerCase(),
        displayName: user.displayName || user.login || login,
        avatarUrl: user.profileImageURL || fallbackLiveData.avatarUrl || DEFAULT_AVATAR,
        isLive: Boolean(stream),
        viewers: stream?.viewersCount || 0,
        title: stream?.title || '',
        game: stream?.game?.name || '',
        startedAt: stream?.createdAt || null,
        fetchFailed: false
      };
    } catch (error) {
      console.debug('[TFR] Live data temporarily unavailable', login, error);
      return fallbackLiveData;
    }
  };

  const FavoritesStore = window.TFRFavoritesStore?.create?.({
    DEFAULT_STATE,
    STORAGE_KEY,
    LIVE_CACHE_KEY,
    CHANGE_KIND,
    POLL_INTERVAL_MS,
    DEFAULT_AVATAR,
    deepCopy,
    t,
    sanitizeCategoryList,
    sendExtensionMessage,
    fetchStreamerLiveData,
    getLiveDataEntry,
    inferCurrentPageLiveData,
    shouldDisplayFavorite
  });
  if (!FavoritesStore) {
    throw new Error('[TFR] favorites store module is missing');
  }
  const LocationWatcher = window.TFRLocationWatcher?.create?.({
    LOCATION_CHECK_INTERVAL
  });
  if (!LocationWatcher) {
    throw new Error('[TFR] location watcher module is missing');
  }
  const chatModerationFeatures = window.TFRChatModeration?.create?.({
    t,
    formatModerationDurationLabel,
    formatModerationTimestamp,
    MAX_TIMEOUT_SECONDS
  });
  if (!chatModerationFeatures) {
    throw new Error('[TFR] Chat/moderation feature module is missing');
  }
  const {
    ChatHistoryTracker,
    ModerationActionTracker,
    ModerationHistoryUI,
    ViewerCardHistoryRenderer
  } = chatModerationFeatures;
  const UpdateNotifier = window.TFRUpdateNotifier?.create?.({
    UPDATE_STORAGE_KEY,
    UPDATE_REPO_API_URL,
    UPDATE_REPO_URL,
    UPDATE_CHECK_INTERVAL_MS
  });
  if (!UpdateNotifier) {
    throw new Error('[TFR] update notifier module is missing');
  }
  const SidebarRenderer = window.TFRSidebarRenderer?.create?.({
    DEFAULT_AVATAR,
    t,
    formatViewers,
    shouldDisplayFavorite,
    getLiveDataEntry
  });
  if (!SidebarRenderer) {
    throw new Error('[TFR] sidebar renderer module is missing');
  }
  const ChannelFavoriteButton = window.TFRChannelFavoriteButton?.create?.({
    t,
    LocationWatcher,
    getChannelFromLocation
  });
  if (!ChannelFavoriteButton) {
    throw new Error('[TFR] channel favorite button module is missing');
  }
  const FavoritesOverlay = window.TFRFavoritesOverlay?.create?.({
    DEFAULT_AVATAR,
    t,
    formatViewers,
    getLiveDataEntry,
    getSidebarVisibilityInfo,
    normalizeCategoryName,
    fetchCategorySuggestions
  });
  if (!FavoritesOverlay) {
    throw new Error('[TFR] favorites overlay module is missing');
  }
  const TopNavManager = window.TFRTopNav?.create?.({
    t,
    sendExtensionMessage,
    extensionApi
  });
  if (!TopNavManager) {
    throw new Error('[TFR] top navigation module is missing');
  }
  const FeatureController = window.TFRFeatureController?.create?.({
    CHANGE_KIND,
    ChatHistoryTracker,
    ViewerCardHistoryRenderer,
    ModerationActionTracker,
    ModerationHistoryUI
  });
  if (!FeatureController) {
    throw new Error('[TFR] feature controller module is missing');
  }
const bootstrap = async () => {
    const store = new FavoritesStore();
    await store.init();

    const featureController = new FeatureController(store);
    featureController.init();

    const sidebar = new SidebarRenderer(store);
    sidebar.init();

    const funnelButton = new ChannelFavoriteButton(store);
    funnelButton.init();

    const favoritesOverlay = new FavoritesOverlay(store);
    const topNav = new TopNavManager(favoritesOverlay);
    topNav.init();

    const updateNotifier = new UpdateNotifier();
    updateNotifier.init();

    window.addEventListener('focus', () => store.refreshLiveData());
    window.addEventListener('beforeunload', () => {
      [sidebar, funnelButton, favoritesOverlay, topNav, featureController, updateNotifier].forEach((instance) => {
        try {
          instance?.dispose?.();
        } catch (error) {
          console.warn('[TFR] dispose error', error);
        }
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();

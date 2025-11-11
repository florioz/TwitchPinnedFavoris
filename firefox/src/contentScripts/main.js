(() => {
  const STORAGE_KEY = 'tfr_state';
  const DEFAULT_STATE = {
    favorites: {},
    categories: [],
    preferences: {
      sortMode: 'viewersDesc',
      uncategorizedCollapsed: false,
      liveFavoritesCollapsed: false,
      recentLiveEnabled: false,
      recentLiveThresholdMinutes: 10,
      recentLiveCollapsed: false,
      toastDurationSeconds: 6,
      chatHistoryEnabled: true,
      moderationHistoryEnabled: true
    }
  };

  const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
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
      'sidebar.live.collapsedNotice': 'Favoris masqu\u00e9s. Cliquez sur le titre pour les afficher.',
      'sidebar.live.unavailable': 'Favori indisponible',
      'sidebar.viewerCount': '{count} spectateurs',
      'sidebar.button': 'Favoris',
      'manager.title': 'Gestion des favoris',
      'recent.toggle': 'Activer la section \u00ab D\u00e9but de live \u00bb',
      'recent.maxDurationLabel': 'Dur\u00e9e maximale :',
      'recent.maxDurationUnit': 'minutes',
      'recent.hint': 'Affiche les streamers qui viennent de lancer leur live pendant une dur\u00e9e limit\u00e9e.',
      'recent.sectionTitle': 'D\u00e9but de live',
      'toast.settings.title': 'Notifications instantan\u00e9es',
      'toast.settings.durationLabel': 'Dur\u00e9e d\'affichage :',
      'toast.settings.durationUnit': 'secondes',
      'toast.settings.hint': 'Contr\u00f4le combien de temps les alertes en pop-up restent visibles.',
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
        'moderation.history.action.deletion': 'Message supprimé',
      'moderation.history.action.deletion': 'Message supprim\u00e9',
      'moderation.history.meta.by': 'par {moderator}',
      'moderation.history.meta.at': '\u00e0 {time}',
      'moderation.history.lastMessage.none': 'Aucun message enregistr\u00e9.',
      'settings.chatHistory.toggle': 'Activer l\'historique du chat',
      'settings.moderation.toggle': 'Activer l\'historique de mod\u00e9ration',
      'recent.badgeLabel': 'D\u00e9but de live',
      'recent.badgeShort': 'Live'
    },
    en: {
      'sidebar.live.header': 'Live favorites',
      'sidebar.live.headerWithCount': 'Live favorites ({count})',
      'sidebar.live.empty': 'No favorites are live right now.',
      'sidebar.live.collapsedNotice': 'Favorites hidden. Click the title to show them.',
      'sidebar.live.unavailable': 'Favorite unavailable',
      'sidebar.viewerCount': '{count} viewers',
      'sidebar.button': 'Favorites',
      'manager.title': 'Favorites manager',
      'recent.toggle': 'Enable the "Recently live" section',
      'recent.maxDurationLabel': 'Maximum duration:',
      'recent.maxDurationUnit': 'minutes',
      'recent.hint': 'Shows streamers who just went live for a limited time.',
      'recent.sectionTitle': 'Recently live',
      'toast.settings.title': 'Instant notifications',
      'toast.settings.durationLabel': 'Display duration:',
      'toast.settings.durationUnit': 'seconds',
      'toast.settings.hint': 'Controls how long the in-page toasts remain visible.',
      'available.title': 'Available favorites',
      'available.subtitle': 'Drag a chip onto a category on the right to organise your favorites.',
      'available.emptyFiltered': 'No available favorites match.',
      'available.emptyAll': 'All favorites are already organised.',
      'search.placeholder': 'Search for a streamer...',
      'sort.viewersDesc': 'Sort by viewers (desc.)',
      'sort.alphabetical': 'Sort A -> Z',
      'sort.recent': 'Sort by recently added',
      'categories.panel.title': 'Categories',
      'categories.panel.new': 'New category',
      'categories.panel.empty': 'Create your first category to get started.',
      'categories.defaultName': 'Favorites',
      'categories.toggle.expand': 'Show',
      'categories.toggle.collapse': 'Hide',
      'categories.toggle.expandAlt': 'Expand',
      'categories.toggle.collapseAlt': 'Collapse',
      'categories.sub.addShort': 'Sub-cat.',
      'categories.addSub': 'Add a subcategory',
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
      'categories.header': 'Categories',
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
        'moderation.history.action.deletion': 'Message deleted',
      'moderation.history.action.deletion': 'Message deleted',
      'moderation.history.meta.by': 'by {moderator}',
      'moderation.history.meta.at': 'at {time}',
      'moderation.history.lastMessage.none': 'No message captured.',
      'settings.chatHistory.toggle': 'Enable chat history',
      'settings.moderation.toggle': 'Enable moderation history',
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
      return false;
    }
    return requiredSet.has(currentCategory);
  };

  const getChannelFromLocation = (locationLike = window.location) => {
    const raw = (locationLike.pathname || '').split('/').filter(Boolean);
    if (!raw.length) return null;
    const candidate = raw[0].toLowerCase();
    return RESERVED_PATHS.has(candidate) ? null : candidate;
  };

  const fetchStreamerLiveData = async (login) => {
    if (!login) return null;
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
        return {
          login,
          displayName: login,
          avatarUrl: DEFAULT_AVATAR,
          isLive: false,
          viewers: 0,
          title: '',
          game: '',
          startedAt: null
        };
      }
      const stream = user.stream;
      return {
        login: user.login || login,
        displayName: user.displayName || user.login || login,
        avatarUrl: user.profileImageURL || DEFAULT_AVATAR,
        isLive: Boolean(stream),
        viewers: stream?.viewersCount || 0,
        title: stream?.title || '',
        game: stream?.game?.name || '',
        startedAt: stream?.createdAt || null
      };
    } catch (error) {
      console.error('[TFR] Failed to fetch live data', login, error);
      return {
        login,
        displayName: login,
        avatarUrl: DEFAULT_AVATAR,
        isLive: false,
        viewers: 0,
        title: '',
        game: '',
        startedAt: null
      };
    }
  };

  class EventEmitter {
    constructor() {
      this.listeners = new Set();
    }
    subscribe(callback) {
      this.listeners.add(callback);
      return () => this.listeners.delete(callback);
    }
    emit(payload) {
      this.listeners.forEach((cb) => {
        try {
          cb(payload);
        } catch (error) {
          console.error('[TFR] Listener error', error);
        }
      });
    }
  }

  class FavoritesStore {
    constructor() {
      this.state = deepCopy(DEFAULT_STATE);
      this.liveData = {};
      this.emitter = new EventEmitter();
      this.pollTimer = null;
      this.isRefreshing = false;

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
          const nextValue = changes[STORAGE_KEY]?.newValue;
          if (nextValue) {
            this.state = deepCopy({ ...DEFAULT_STATE, ...nextValue });
            this.ensureStateIntegrity();
            this.emitter.emit({ kind: CHANGE_KIND.STATE, state: this.getSnapshot() });
          }
        }
      });
    }

    async init() {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      if (stored && stored[STORAGE_KEY]) {
        this.state = deepCopy({ ...DEFAULT_STATE, ...stored[STORAGE_KEY] });
      } else {
        const initialCategory = {
          id: `cat_${Date.now()}`,
          name: t('categories.defaultName'),
          collapsed: false,
          sortOrder: Date.now()
        };
        this.state.categories = [initialCategory];
        await this.persistState();
      }
      this.ensureStateIntegrity();
      this.emitter.emit({ kind: CHANGE_KIND.STATE, state: this.getSnapshot() });
      await this.refreshLiveData();
      this.startPolling();
    }

    ensureStateIntegrity() {
      if (!Array.isArray(this.state.categories)) {
        this.state.categories = [];
      }
      if (!this.state.preferences) {
        this.state.preferences = {
          sortMode: 'viewersDesc',
          uncategorizedCollapsed: false,
          liveFavoritesCollapsed: false,
          recentLiveEnabled: false,
          recentLiveThresholdMinutes: 10,
          recentLiveCollapsed: false,
          toastDurationSeconds: 6,
          chatHistoryEnabled: true,
          moderationHistoryEnabled: true
        };
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'sortMode')) {
        this.state.preferences.sortMode = 'viewersDesc';
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'uncategorizedCollapsed')) {
        this.state.preferences.uncategorizedCollapsed = false;
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'liveFavoritesCollapsed')) {
        this.state.preferences.liveFavoritesCollapsed = false;
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'recentLiveEnabled')) {
        this.state.preferences.recentLiveEnabled = false;
      } else {
        this.state.preferences.recentLiveEnabled = Boolean(this.state.preferences.recentLiveEnabled);
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'recentLiveThresholdMinutes')) {
        this.state.preferences.recentLiveThresholdMinutes = 10;
      } else {
        const parsed = Number(this.state.preferences.recentLiveThresholdMinutes);
        const sanitized = Number.isFinite(parsed) ? Math.max(1, Math.min(120, Math.round(parsed))) : 10;
        this.state.preferences.recentLiveThresholdMinutes = sanitized;
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'recentLiveCollapsed')) {
        this.state.preferences.recentLiveCollapsed = false;
      } else {
        this.state.preferences.recentLiveCollapsed = Boolean(this.state.preferences.recentLiveCollapsed);
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'toastDurationSeconds')) {
        this.state.preferences.toastDurationSeconds = 6;
      } else {
        const parsed = Number(this.state.preferences.toastDurationSeconds);
        const sanitized = Number.isFinite(parsed) ? Math.max(2, Math.min(60, Math.round(parsed))) : 6;
        this.state.preferences.toastDurationSeconds = sanitized;
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'chatHistoryEnabled')) {
        this.state.preferences.chatHistoryEnabled = true;
      } else {
        this.state.preferences.chatHistoryEnabled = Boolean(this.state.preferences.chatHistoryEnabled);
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'moderationHistoryEnabled')) {
        this.state.preferences.moderationHistoryEnabled = true;
      } else {
        this.state.preferences.moderationHistoryEnabled = Boolean(this.state.preferences.moderationHistoryEnabled);
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'toastDurationSeconds')) {
        this.state.preferences.toastDurationSeconds = 6;
      } else {
        const parsed = Number(this.state.preferences.toastDurationSeconds);
        const sanitized = Number.isFinite(parsed) ? Math.max(2, Math.min(60, Math.round(parsed))) : 6;
        this.state.preferences.toastDurationSeconds = sanitized;
      }
      const categoryIdMap = new Map();
      this.state.categories.forEach((category, index) => {
        if (!category || typeof category !== 'object') {
          this.state.categories[index] = {
            id: `cat_${Date.now()}_${index}`,
            name: t('categories.defaultName'),
            collapsed: false,
            sortOrder: Date.now() + index,
            parentId: null
          };
          category = this.state.categories[index];
        }
        if (typeof category.id !== 'string' || !category.id.trim()) {
          category.id = `cat_${Date.now()}_${index}`;
        }
        if (typeof category.name !== 'string' || !category.name.trim()) {
          category.name = t('categories.defaultName');
        }
        if (typeof category.collapsed !== 'boolean') {
          category.collapsed = false;
        }
        if (typeof category.sortOrder !== 'number') {
          category.sortOrder = Date.now() + index;
        }
        if (typeof category.parentId !== 'string' || !category.parentId.trim()) {
          category.parentId = null;
        }
        categoryIdMap.set(category.id, category);
      });
      this.state.categories.forEach((category) => {
        if (!category.parentId) {
          category.parentId = null;
          return;
        }
        if (!categoryIdMap.has(category.parentId) || category.parentId === category.id) {
          category.parentId = null;
          return;
        }
        const visited = new Set([category.id]);
        let current = category.parentId;
        while (current) {
          if (visited.has(current)) {
            category.parentId = null;
            break;
          }
          visited.add(current);
          const parent = categoryIdMap.get(current);
          if (!parent || !parent.parentId) {
            break;
          }
          current = parent.parentId;
        }
      });
      if (!this.state.categories.length) {
        this.state.categories.push({
          id: `cat_${Date.now()}`,
          name: t('categories.defaultName'),
          collapsed: false,
          sortOrder: Date.now(),
          parentId: null
        });
      }
      Object.entries(this.state.favorites).forEach(([login, fav]) => {
        if (!fav) {
          return;
        }
        if (Array.isArray(fav.categories)) {
          fav.categories = fav.categories.map((id) => (typeof id === 'string' ? id : null)).filter(Boolean);
          if (fav.categories.length > 1) {
            fav.categories = [fav.categories[0]];
          }
          if (!fav.categories.length) {
            delete fav.categories;
          }
        } else if (typeof fav.categories === 'string' && fav.categories) {
          fav.categories = [fav.categories];
        } else if (fav.categories != null) {
          delete fav.categories;
        }
        if (!fav.categoryFilter || typeof fav.categoryFilter !== 'object') {
          fav.categoryFilter = { enabled: false, categories: [] };
        } else {
          let categories = [];
          if (Array.isArray(fav.categoryFilter.categories)) {
            categories = sanitizeCategoryList(fav.categoryFilter.categories);
          } else if (typeof fav.categoryFilter.category === 'string') {
            categories = sanitizeCategoryList([fav.categoryFilter.category]);
          }
          const enabled = Boolean(fav.categoryFilter.enabled);
          fav.categoryFilter = {
            enabled,
            categories
          };
        }
        if (!Number.isFinite(fav.filterMatchSince) || fav.filterMatchSince < 0) {
          fav.filterMatchSince = 0;
        }
        if (typeof fav.recentHighlightEnabled !== 'boolean') {
          fav.recentHighlightEnabled = true;
        }
      });
    }

    startPolling() {
      this.stopPolling();
      this.pollTimer = setInterval(() => {
        this.refreshLiveData();
      }, POLL_INTERVAL_MS);
    }

    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }

    getSnapshot() {
      return deepCopy(this.state);
    }

    getState() {
      return this.state;
    }

    getLiveData() {
      return { ...this.liveData };
    }

    subscribe(callback) {
      return this.emitter.subscribe(callback);
    }

    async persistState() {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.state });
    }

  async updateState(mutator, emit = true) {
    const draft = deepCopy(this.state);
    mutator(draft);
    this.state = draft;
    this.ensureStateIntegrity();
    await this.persistState();
    if (emit) {
      this.emitter.emit({ kind: CHANGE_KIND.STATE, state: this.getSnapshot() });
    }
  }

  getBackupData() {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      favorites: deepCopy(this.state.favorites),
      categories: deepCopy(this.state.categories),
      preferences: deepCopy(this.state.preferences)
    };
  }

  async restoreFromBackup(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Backup invalide');
    }
    const safeFavorites = {};
    const sourceFavorites = payload.favorites && typeof payload.favorites === 'object' ? payload.favorites : {};
    Object.entries(sourceFavorites).forEach(([login, raw]) => {
      if (!login || typeof login !== 'string' || !raw || typeof raw !== 'object') {
        return;
      }
      const normalized = login.toLowerCase();
      const entry = {
        login: normalized,
        displayName: typeof raw.displayName === 'string' && raw.displayName ? raw.displayName : normalized,
        avatarUrl: typeof raw.avatarUrl === 'string' && raw.avatarUrl ? raw.avatarUrl : DEFAULT_AVATAR,
        categories: Array.isArray(raw.categories)
          ? raw.categories.filter((id) => typeof id === 'string' && id)
          : [],
        addedAt: typeof raw.addedAt === 'number' ? raw.addedAt : Date.now(),
        filterMatchSince: typeof raw.filterMatchSince === 'number' ? raw.filterMatchSince : 0,
        recentHighlightEnabled:
          typeof raw.recentHighlightEnabled === 'boolean'
            ? raw.recentHighlightEnabled
            : true
      };
      if (!entry.categories.length && typeof raw.category === 'string' && raw.category) {
        entry.categories = [raw.category];
      }
      const rawFilter = raw.categoryFilter && typeof raw.categoryFilter === 'object' ? raw.categoryFilter : null;
      let categoryFilter = { enabled: false, categories: [] };
      if (rawFilter) {
        let categories = [];
        if (Array.isArray(rawFilter.categories)) {
          categories = sanitizeCategoryList(rawFilter.categories);
        } else if (typeof rawFilter.category === 'string') {
          categories = sanitizeCategoryList([rawFilter.category]);
        }
        categoryFilter = { enabled: Boolean(rawFilter.enabled), categories };
      } else if (typeof raw.requiredCategory === 'string' && raw.requiredCategory.trim()) {
        categoryFilter = { enabled: true, categories: sanitizeCategoryList([raw.requiredCategory]) };
      }
      entry.categoryFilter = categoryFilter;
      safeFavorites[normalized] = entry;
    });

    const safeCategories = [];
    const sourceCategories = Array.isArray(payload.categories) ? payload.categories : [];
    const idUsage = new Set();
    sourceCategories.forEach((raw, index) => {
      if (!raw || typeof raw !== 'object') {
        return;
      }
      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `cat_${Date.now()}_${index}`;
      const baseId = id;
      let dedupe = 1;
      while (idUsage.has(id)) {
        id = `${baseId}_${dedupe++}`;
      }
      idUsage.add(id);
      const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `Cat\u00e9gorie ${index + 1}`;
      const sortOrder = typeof raw.sortOrder === 'number' ? raw.sortOrder : Date.now() + index;
      const collapsed = typeof raw.collapsed === 'boolean' ? raw.collapsed : false;
      const parentId = typeof raw.parentId === 'string' && raw.parentId.trim() ? raw.parentId.trim() : null;
      safeCategories.push({ id, name, sortOrder, collapsed, parentId });
    });

    const safePreferences = {};
    if (payload.preferences && typeof payload.preferences === 'object') {
      if (typeof payload.preferences.sortMode === 'string') {
        safePreferences.sortMode = payload.preferences.sortMode;
      }
      if (typeof payload.preferences.uncategorizedCollapsed === 'boolean') {
        safePreferences.uncategorizedCollapsed = payload.preferences.uncategorizedCollapsed;
      }
      if (typeof payload.preferences.liveFavoritesCollapsed === 'boolean') {
        safePreferences.liveFavoritesCollapsed = payload.preferences.liveFavoritesCollapsed;
      }
      if (typeof payload.preferences.recentLiveEnabled === 'boolean') {
        safePreferences.recentLiveEnabled = payload.preferences.recentLiveEnabled;
      }
      if (typeof payload.preferences.recentLiveCollapsed === 'boolean') {
        safePreferences.recentLiveCollapsed = payload.preferences.recentLiveCollapsed;
      }
      if (payload.preferences.recentLiveThresholdMinutes != null) {
        const parsed = Number(payload.preferences.recentLiveThresholdMinutes);
        if (Number.isFinite(parsed)) {
          safePreferences.recentLiveThresholdMinutes = Math.max(1, Math.min(120, Math.round(parsed)));
        }
      }
      if (payload.preferences.toastDurationSeconds != null) {
        const parsed = Number(payload.preferences.toastDurationSeconds);
        if (Number.isFinite(parsed)) {
          safePreferences.toastDurationSeconds = Math.max(2, Math.min(60, Math.round(parsed)));
        }
      }
      if (typeof payload.preferences.chatHistoryEnabled === 'boolean') {
        safePreferences.chatHistoryEnabled = payload.preferences.chatHistoryEnabled;
      }
      if (typeof payload.preferences.moderationHistoryEnabled === 'boolean') {
        safePreferences.moderationHistoryEnabled = payload.preferences.moderationHistoryEnabled;
      }
      if (payload.preferences.toastDurationSeconds != null) {
        const parsed = Number(payload.preferences.toastDurationSeconds);
        if (Number.isFinite(parsed)) {
          safePreferences.toastDurationSeconds = Math.max(2, Math.min(60, Math.round(parsed)));
        }
      }
    }

    await this.updateState((draft) => {
      draft.favorites = safeFavorites;
      draft.categories = safeCategories;
      draft.preferences = { ...draft.preferences, ...safePreferences };
    });
    this.liveData = {};
    await this.refreshLiveData();
  }

    getCategoriesTree() {
      const nodes = this.state.categories.map((category) => ({
        id: category.id,
        name: category.name,
        collapsed: Boolean(category.collapsed),
        sortOrder: typeof category.sortOrder === 'number' ? category.sortOrder : 0,
        parentId: category.parentId || null,
        children: []
      }));
      const nodeMap = new Map();
      nodes.forEach((node) => nodeMap.set(node.id, node));
      const roots = [];
      nodes.forEach((node) => {
        if (node.parentId && nodeMap.has(node.parentId) && node.parentId !== node.id) {
          nodeMap.get(node.parentId).children.push(node);
        } else {
          node.parentId = null;
          roots.push(node);
        }
      });
      const sortRecursive = (list) => {
        list.sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
          }
          return a.name.localeCompare(b.name, 'fr');
        });
        list.forEach((child) => sortRecursive(child.children));
      };
      sortRecursive(roots);
      return roots;
    }

    async addFavorite(login) {
      const normalized = login?.toLowerCase();
      if (!normalized || this.state.favorites[normalized]) return;
      const live = await fetchStreamerLiveData(normalized);
    const favoriteEntry = {
      login: normalized,
      displayName: live?.displayName || normalized,
      avatarUrl: live?.avatarUrl || DEFAULT_AVATAR,
      categories: [],
      addedAt: Date.now(),
      categoryFilter: { enabled: false, categories: [] },
      filterMatchSince: 0,
      recentHighlightEnabled: true
    };
      await this.updateState((draft) => {
        draft.favorites[normalized] = favoriteEntry;
      });
      if (live) {
        this.liveData[normalized] = live;
        this.emitter.emit({ kind: CHANGE_KIND.LIVE, liveData: this.getLiveData() });
      }
    }

    async removeFavorite(login) {
      const normalized = login?.toLowerCase();
      if (!normalized || !this.state.favorites[normalized]) return;
      await this.updateState((draft) => {
        delete draft.favorites[normalized];
      });
      delete this.liveData[normalized];
      this.emitter.emit({ kind: CHANGE_KIND.LIVE, liveData: this.getLiveData() });
    }

    async setFavoriteCategory(login, categoryId) {
      const normalized = login?.toLowerCase();
      if (!normalized || !this.state.favorites[normalized]) {
        return;
      }
      let target = categoryId ? String(categoryId) : null;
      if (target && !this.state.categories.some((cat) => cat.id === target)) {
        target = null;
      }
      const currentFav = this.state.favorites[normalized];
      const currentCategory = Array.isArray(currentFav?.categories) && currentFav.categories.length ? currentFav.categories[0] : null;
      if ((currentCategory || null) === (target || null)) {
        return;
      }
      await this.updateState((draft) => {
        const fav = draft.favorites[normalized];
        if (!fav) {
          return;
        }
        if (target) {
          fav.categories = [target];
        } else if (fav.categories) {
          delete fav.categories;
        }
      });
    }

    async clearFavoriteCategory(login) {
      await this.setFavoriteCategory(login, null);
    }

    async setFavoriteCategoryFilter(login, payload = {}) {
      const normalized = login?.toLowerCase();
      if (!normalized || !this.state.favorites[normalized]) {
        return;
      }
      await this.updateState((draft) => {
        const fav = draft.favorites[normalized];
        if (!fav) {
          return;
        }
        const currentFilter =
          fav.categoryFilter && typeof fav.categoryFilter === 'object'
            ? fav.categoryFilter
            : { enabled: false, categories: [] };
        let categories = Array.isArray(currentFilter.categories) ? currentFilter.categories : [];
        if (Array.isArray(payload.categories)) {
          categories = sanitizeCategoryList(payload.categories);
        } else if (typeof payload.category === 'string') {
          categories = sanitizeCategoryList([payload.category]);
        } else {
          categories = sanitizeCategoryList(categories);
        }
        const enabled =
          payload.enabled === undefined || payload.enabled === null
            ? Boolean(currentFilter.enabled)
            : Boolean(payload.enabled);
        fav.categoryFilter = {
          enabled,
          categories
        };
        fav.filterMatchSince = 0;
      });
    }

    async toggleCategoryAssignment(login, categoryId, assign) {
      if (assign) {
        await this.setFavoriteCategory(login, categoryId);
      } else {
        await this.clearFavoriteCategory(login);
      }
    }

    async createCategory(name, parentId = null) {
      const trimmed = (name || '').trim();
      if (!trimmed) return null;
      let parent = typeof parentId === 'string' && parentId.trim() ? parentId.trim() : null;
      if (parent && !this.state.categories.some((cat) => cat.id === parent)) {
        parent = null;
      }
      const id = `cat_${Date.now()}`;
      await this.updateState((draft) => {
        draft.categories.push({
          id,
          name: trimmed,
          collapsed: false,
          sortOrder: Date.now(),
          parentId: parent
        });
      });
      return id;
    }

    async renameCategory(categoryId, nextName) {
      const trimmed = (nextName || '').trim();
      if (!trimmed) return;
      await this.updateState((draft) => {
        const category = draft.categories.find((cat) => cat.id === categoryId);
        if (category) category.name = trimmed;
      });
    }

    async removeCategory(categoryId) {
      await this.updateState((draft) => {
        const target = draft.categories.find((cat) => cat.id === categoryId);
        const parentId = target?.parentId || null;
        draft.categories = draft.categories.filter((cat) => cat.id !== categoryId);
        draft.categories.forEach((cat) => {
          if (cat.parentId === categoryId) {
            cat.parentId = parentId;
          }
        });
        Object.values(draft.favorites).forEach((fav) => {
          if (Array.isArray(fav.categories)) {
            fav.categories = fav.categories.filter((id) => id && id !== categoryId);
            if (!fav.categories.length) {
              delete fav.categories;
            }
          }
        });
      });
    }

    async toggleCategoryCollapse(categoryId) {
      await this.updateState((draft) => {
        const category = draft.categories.find((cat) => cat.id === categoryId);
        if (category) category.collapsed = !category.collapsed;
      });
    }

    async setUncategorizedCollapsed(nextValue) {
      const desired = Boolean(nextValue);
      if (this.state.preferences.uncategorizedCollapsed === desired) return;
      await this.updateState((draft) => {
        draft.preferences.uncategorizedCollapsed = desired;
      });
    }

    async toggleLiveFavoritesCollapsed() {
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.liveFavoritesCollapsed = !Boolean(prefs.liveFavoritesCollapsed);
      });
    }

    async setRecentLiveEnabled(enabled) {
      if (Boolean(this.state.preferences?.recentLiveEnabled) === Boolean(enabled)) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.recentLiveEnabled = Boolean(enabled);
      });
    }

    async setRecentLiveThreshold(minutes) {
      const numeric = Number(minutes);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const sanitized = Math.max(1, Math.min(120, Math.round(numeric)));
      if (Math.round(Number(this.state.preferences?.recentLiveThresholdMinutes)) === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.recentLiveThresholdMinutes = sanitized;
      });
    }

    async setChatHistoryEnabled(enabled) {
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.chatHistoryEnabled = Boolean(enabled);
      });
    }

    async setModerationHistoryEnabled(enabled) {
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.moderationHistoryEnabled = Boolean(enabled);
      });
    }

    async setFavoriteRecentHighlight(login, enabled) {
      const normalized = login?.toLowerCase();
      if (!normalized || !this.state.favorites[normalized]) {
        return;
      }
      await this.updateState((draft) => {
        const fav = draft.favorites[normalized];
        if (fav) {
          fav.recentHighlightEnabled = Boolean(enabled);
        }
      });
    }

    async setToastDuration(seconds) {
      const numeric = Number(seconds);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const sanitized = Math.max(2, Math.min(60, Math.round(numeric)));
      if (Math.round(Number(this.state.preferences?.toastDurationSeconds)) === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.toastDurationSeconds = sanitized;
      });
    }

    async toggleRecentLiveCollapsed() {
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.recentLiveCollapsed = !Boolean(prefs.recentLiveCollapsed);
      });
    }

    async setSortMode(mode) {
      if (!mode || this.state.preferences.sortMode === mode) return;
      await this.updateState((draft) => {
        draft.preferences.sortMode = mode;
      });
    }

    async refreshLiveData() {
      if (this.isRefreshing) return;
      this.isRefreshing = true;
      try {
        const favorites = Object.keys(this.state.favorites);
        if (!favorites.length) {
          this.liveData = {};
          this.emitter.emit({ kind: CHANGE_KIND.LIVE, liveData: this.getLiveData() });
          return;
        }
        const now = Date.now();
        const updates = await Promise.all(favorites.map((login) => fetchStreamerLiveData(login)));
        const nextLive = {};
        const favoriteUpdates = {};
        updates.forEach((entry) => {
          if (!entry || !entry.login) return;
          const normalized = entry.login.toLowerCase();
          nextLive[normalized] = entry;
          const stored = this.state.favorites[normalized];
          if (stored) {
            const nextDisplay = entry.displayName || stored.displayName;
            const nextAvatar = entry.avatarUrl || stored.avatarUrl;
            if (stored.displayName !== nextDisplay || stored.avatarUrl !== nextAvatar) {
              favoriteUpdates[normalized] = {
                ...stored,
                displayName: nextDisplay,
                avatarUrl: nextAvatar
              };
            }
          }
        });
        Object.entries(this.state.favorites).forEach(([login, stored]) => {
          if (!stored) {
            return;
          }
          const normalized = login.toLowerCase();
          const live = nextLive[normalized];
          const filterActive =
            Boolean(stored?.categoryFilter?.enabled) &&
            Array.isArray(stored.categoryFilter?.categories) &&
            stored.categoryFilter.categories.length > 0;
          if (!filterActive) {
            if (stored.filterMatchSince) {
              const existing = favoriteUpdates[normalized];
              if (existing) {
                favoriteUpdates[normalized] = { ...existing, filterMatchSince: 0 };
              } else {
                favoriteUpdates[normalized] = { ...stored, filterMatchSince: 0 };
              }
            }
            return;
          }
          const matches = shouldDisplayFavorite(stored, live);
          const previousSince =
            Number.isFinite(stored.filterMatchSince) && stored.filterMatchSince > 0 ? stored.filterMatchSince : 0;
          let nextSince = previousSince;
          if (matches) {
            if (!previousSince) {
              nextSince = now;
            }
          } else if (previousSince) {
            nextSince = 0;
          }
          if (nextSince !== previousSince) {
            const existing = favoriteUpdates[normalized];
            if (existing) {
              favoriteUpdates[normalized] = { ...existing, filterMatchSince: nextSince };
            } else {
              favoriteUpdates[normalized] = { ...stored, filterMatchSince: nextSince };
            }
          } else if (favoriteUpdates[normalized] && favoriteUpdates[normalized].filterMatchSince === undefined) {
            favoriteUpdates[normalized] = { ...favoriteUpdates[normalized], filterMatchSince: previousSince };
          }
        });
        this.liveData = nextLive;
        if (Object.keys(favoriteUpdates).length) {
          await this.updateState((draft) => {
            Object.entries(favoriteUpdates).forEach(([login, value]) => {
              draft.favorites[login] = value;
            });
          }, false);
          this.emitter.emit({ kind: CHANGE_KIND.STATE, state: this.getSnapshot() });
        }
        this.emitter.emit({ kind: CHANGE_KIND.LIVE, liveData: this.getLiveData() });
      } finally {
        this.isRefreshing = false;
      }
    }
  }

  class LocationWatcher {
    constructor(callback) {
      this.callback = callback;
      this.timer = null;
      this.lastHref = window.location.href;
    }
    start() {
      this.stop();
      this.timer = setInterval(() => {
        if (window.location.href !== this.lastHref) {
          this.lastHref = window.location.href;
          this.callback(window.location.href);
        }
      }, LOCATION_CHECK_INTERVAL);
    }
    stop() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }

  class ChatHistoryTracker {
    constructor() {
      this.history = new Map();
      this.maxEntriesPerUser = 50;
      this.chatObserver = null;
      this.chatContainer = null;
      this.retryTimer = null;
      this.listeners = new Set();
      this.containerCheckTimer = null;
    }

    normalizeLogin(login) {
      if (!login) return '';
      return String(login).trim().replace(/^@/, '').toLowerCase();
    }

    init() {
      this.observeChat(true);
      if (!this.containerCheckTimer) {
        this.containerCheckTimer = setInterval(() => {
          if (!this.chatContainer || !this.chatContainer.isConnected) {
            this.observeChat(true);
          }
        }, 5000);
      }
    }

    dispose() {
      this.chatObserver?.disconnect();
      this.chatObserver = null;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      if (this.containerCheckTimer) {
        clearInterval(this.containerCheckTimer);
        this.containerCheckTimer = null;
      }
      this.history.clear();
      this.listeners.clear();
    }

    subscribe(listener) {
      if (typeof listener !== 'function') {
        return () => {};
      }
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(login) {
      const normalized = this.normalizeLogin(login);
      const snapshot = this.getHistory(normalized);
      this.listeners.forEach((listener) => {
        try {
          listener(normalized, snapshot);
        } catch (error) {
          console.error('[TFR] chat history listener failed', error);
        }
      });
    }

    getHistory(login) {
      const normalized = this.normalizeLogin(login);
      const entries = this.history.get(normalized);
      return entries ? entries.slice() : [];
    }

    findMessagesContainer() {
      const selectors = [
        '[data-a-target="chat-history-scrollable-area"]',
        '[data-test-selector="chat-scrollable-area__message-container"]',
        '.chat-scrollable-area__message-container',
        '[data-a-target="chat-messages"]',
        '[role="log"][aria-live="polite"]'
      ];
      for (const selector of selectors) {
        try {
          const container = document.querySelector(selector);
          if (container) {
            return container;
          }
        } catch (error) {
          console.error('[TFR] chat container selector error', selector, error);
        }
      }
      return null;
    }

    observeChat(force = false) {
      if (!force && this.chatContainer?.isConnected) {
        return;
      }
      this.chatObserver?.disconnect();
      this.chatObserver = null;
      const container = this.findMessagesContainer();
      if (!container) {
        if (!this.retryTimer) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.observeChat(true);
          }, 1500);
        }
        return;
      }
      this.chatContainer = container;
      this.chatObserver = new MutationObserver((mutations) => this.handleMutations(mutations));
      this.chatObserver.observe(container, { childList: true, subtree: true });
      this.captureExistingMessages(container);
    }

    captureExistingMessages(container) {
      const nodes = container.querySelectorAll('[data-a-target="chat-line-message"], .chat-line__message');
      nodes.forEach((node) => this.captureMessage(node));
    }

    handleMutations(mutations) {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }
          this.scanNode(node);
        });
      });
    }

    scanNode(node) {
      if (node.matches('[data-a-target="chat-line-message"], .chat-line__message')) {
        this.captureMessage(node);
      }
      const descendants = node.querySelectorAll?.('[data-a-target="chat-line-message"], .chat-line__message');
      if (descendants && descendants.length) {
        descendants.forEach((child) => this.captureMessage(child));
      }
    }

    captureMessage(messageElement) {
      if (!messageElement || messageElement.dataset?.tfrChatTracked === 'true') {
        return;
      }
      const login = this.extractLogin(messageElement);
      if (!login) {
        messageElement.dataset.tfrChatTracked = 'true';
        return;
      }
      const text = this.extractMessageText(messageElement);
      if (!text) {
        messageElement.dataset.tfrChatTracked = 'true';
        return;
      }
      const normalized = this.normalizeLogin(login);
      if (!normalized) {
        messageElement.dataset.tfrChatTracked = 'true';
        return;
      }
      const displayName = this.extractDisplayName(messageElement) || login;
      const timestamp = this.extractTimestamp(messageElement) || Date.now();
      const entry = {
        login: normalized,
        displayName,
        text,
        timestamp
      };
      const existing = this.history.get(normalized) || [];
      existing.push(entry);
      if (existing.length > 1) {
        existing.sort((a, b) => a.timestamp - b.timestamp);
      }
      if (existing.length > this.maxEntriesPerUser) {
        existing.splice(0, existing.length - this.maxEntriesPerUser);
      }
      this.history.set(normalized, existing);
      messageElement.dataset.tfrChatTracked = 'true';
      this.emit(normalized);
    }

    extractLogin(messageElement) {
      const dataset = messageElement.dataset || {};
      const candidates = [
        dataset.userName,
        dataset.username,
        dataset.user,
        dataset.sender,
        dataset.name,
        dataset.login,
        dataset.userLogin,
        dataset.aUser,
        messageElement.getAttribute('data-user'),
        messageElement.getAttribute('data-username'),
        messageElement.getAttribute('data-sender')
      ];
      for (const value of candidates) {
        if (value && value.trim()) {
          return value.trim();
        }
      }
      const usernameNode =
        messageElement.querySelector('[data-a-target="chat-message-username"]') ||
        messageElement.querySelector('[data-test-selector="chat-message-username"]') ||
        messageElement.querySelector('[data-a-target="chat-author-link"]');
      if (usernameNode && usernameNode.textContent) {
        return usernameNode.textContent.trim().replace(/^@/, '');
      }
      return '';
    }

    extractDisplayName(messageElement) {
      const dataset = messageElement.dataset || {};
      if (dataset.userDisplayName) {
        return dataset.userDisplayName;
      }
      const usernameNode =
        messageElement.querySelector('[data-a-target="chat-message-username"]') ||
        messageElement.querySelector('[data-test-selector="chat-message-username"]') ||
        messageElement.querySelector('[data-a-target="chat-author-link"]');
      return usernameNode?.textContent?.trim().replace(/^@/, '') || '';
    }

    extractMessageText(messageElement) {
      const textContainer =
        messageElement.querySelector('[data-a-target="chat-message-text"]') ||
        messageElement.querySelector('[data-test-selector="chat-line-message-body"]') ||
        messageElement.querySelector('.text-fragment')?.parentElement;
      if (!textContainer) {
        return '';
      }
      const tokens = [];
      const pushToken = (value) => {
        if (!value) return;
        const normalized = String(value).replace(/\s+/g, ' ').trim();
        if (normalized) {
          tokens.push(normalized);
        }
      };
      const collect = (node) => {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
          pushToken(node.textContent);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }
        const element = node;
        const dataset = element.dataset || {};
        const plain =
          element.getAttribute('data-plain-text') ||
          dataset.plainText ||
          dataset.text ||
          dataset.plaintext;
        const aria = element.getAttribute('aria-label');
        const title = element.getAttribute('title');
        const alt = element.getAttribute('alt');
        const dataTarget = (dataset.aTarget || '').toLowerCase();
        const classList = element.classList || {};
        const isEmote =
          element.tagName === 'IMG' ||
          classList.contains('chat-image__emoji') ||
          classList.contains('emoji') ||
          /emote/.test(dataTarget) ||
          dataset.emoteId ||
          dataset.emoteName;
        if (isEmote) {
          pushToken(plain || alt || aria || title || element.textContent);
          return;
        }
        if (plain || aria || title || alt) {
          pushToken(plain || aria || title || alt);
        }
        if (element.childNodes && element.childNodes.length) {
          element.childNodes.forEach((child) => collect(child));
        }
      };
      collect(textContainer);
      if (!tokens.length) {
        return textContainer.textContent?.replace(/\s+/g, ' ').trim() || '';
      }
      return tokens.join(' ').replace(/\s+/g, ' ').trim();
    }

    extractTimestamp(messageElement) {
      const dataset = messageElement.dataset || {};
      const numericCandidates = [
        dataset.timestamp,
        dataset.time,
        dataset.timeMs,
        dataset.ts,
        dataset.msgTime
      ];
      for (const candidate of numericCandidates) {
        if (!candidate) continue;
        const parsed = Number(candidate);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
      const timeSelectors = [
        'time',
        '[data-a-target="chat-message-timestamp"]',
        '.chat-line__timestamp',
        'span[data-test-selector="chat-message-timestamp"]'
      ];
      for (const selector of timeSelectors) {
        const timeElement = messageElement.querySelector(selector);
        if (!timeElement) {
          continue;
        }
        const datetime = timeElement.getAttribute('datetime') || timeElement.getAttribute('data-datetime');
        if (datetime) {
          const parsed = Date.parse(datetime);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }
        const aria = timeElement.getAttribute?.('aria-label');
        const parsedFromAria = this.parseTimeText(aria);
        if (Number.isFinite(parsedFromAria)) {
          return parsedFromAria;
        }
        const textContent = timeElement.textContent;
        const parsedFromText = this.parseTimeText(textContent);
        if (Number.isFinite(parsedFromText)) {
          return parsedFromText;
        }
      }
      const title = messageElement.getAttribute('title');
      const parsedFromTitle = this.parseTimeText(title);
      if (Number.isFinite(parsedFromTitle)) {
        return parsedFromTitle;
      }
      return null;
    }

    parseTimeText(value) {
      if (!value || typeof value !== 'string') {
        return null;
      }
      const normalized = value.trim();
      if (!normalized) return null;
      const hoursMatch = normalized.match(/(\d{1,2})[:hH\.](\d{2})(?:[:\.:](\d{2}))?\s*(am|pm)?/i);
      if (!hoursMatch) {
        return null;
      }
      let hours = Number(hoursMatch[1]);
      const minutes = Number(hoursMatch[2]);
      const seconds = hoursMatch[3] ? Number(hoursMatch[3]) : 0;
      const suffix = hoursMatch[4] ? hoursMatch[4].toLowerCase() : null;
      if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return null;
      }
      if (suffix === 'pm' && hours < 12) {
        hours += 12;
      } else if (suffix === 'am' && hours === 12) {
        hours = 0;
      }
      const now = new Date();
      now.setHours(hours, minutes, seconds, 0);
      return now.getTime();
    }
  }

  const CHAT_MESSAGE_SELECTOR =
    '[data-a-target="chat-line-message"], [data-test-selector="chat-line-message"], [data-a-target="chat-line-user-notice"], .chat-line__message, .chat-line__status';

  class ModerationActionTracker {
    constructor(historyTracker) {
      this.historyTracker = historyTracker;
      this.actions = [];
      this.maxActions = 200;
      this.observer = null;
      this.container = null;
      this.retryTimer = null;
      this.listeners = new Set();
      this.containerCheckTimer = null;
      this.mutationFrame = null;
      this.messageSelector = CHAT_MESSAGE_SELECTOR;
      this.actionKeys = new Set();
      this.recentActionCache = new Map();
    }

    init() {
      this.observeChat(true);
      if (!this.containerCheckTimer) {
        this.containerCheckTimer = setInterval(() => {
          if (!this.container || !this.container.isConnected) {
            this.observeChat(true);
          }
        }, 5000);
      }
    }

    dispose() {
      this.observer?.disconnect();
      this.observer = null;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      if (this.containerCheckTimer) {
        clearInterval(this.containerCheckTimer);
        this.containerCheckTimer = null;
      }
      if (this.mutationFrame) {
        cancelAnimationFrame(this.mutationFrame);
        this.mutationFrame = null;
      }
      this.container = null;
      this.actions = [];
      this.actionKeys.clear();
      this.listeners.clear();
    }

    subscribe(listener) {
      if (typeof listener !== 'function') {
        return () => {};
      }
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit() {
      const snapshot = this.getActions();
      this.listeners.forEach((listener) => {
        try {
          listener(snapshot);
        } catch (error) {
          console.error('[TFR] moderation tracker listener failed', error);
        }
      });
    }

    getActions() {
      return this.actions.slice();
    }

    observeChat(force = false) {
      if (!force && this.container?.isConnected) {
        return;
      }
      this.observer?.disconnect();
      this.observer = null;
      let container = null;
      if (this.historyTracker?.chatContainer?.isConnected) {
        container = this.historyTracker.chatContainer;
      } else if (typeof this.historyTracker?.findMessagesContainer === 'function') {
        try {
          container = this.historyTracker.findMessagesContainer();
        } catch (error) {
          console.error('[TFR] moderation tracker container error', error);
          container = null;
        }
      }
      if (!container) {
        if (!this.retryTimer) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.observeChat(true);
          }, 1500);
        }
        return;
      }
      this.container = container;
      this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
      this.observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
      this.captureExisting(container);
    }

    captureExisting(container) {
      const nodes = container.querySelectorAll(this.messageSelector);
      nodes.forEach((node) => this.captureAction(node));
    }

    handleMutations(mutations) {
      if (this.mutationFrame) {
        cancelAnimationFrame(this.mutationFrame);
      }
      this.mutationFrame = requestAnimationFrame(() => {
        this.mutationFrame = null;
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => this.scanNode(node));
          } else if (mutation.type === 'attributes' || mutation.type === 'characterData') {
            this.collectMessageElements(mutation.target).forEach((element) => this.captureAction(element));
          }
        });
      });
    }

    collectMessageElements(node) {
      const selector = this.messageSelector;
      const elements = [];
      const seen = new Set();
      const add = (element) => {
        if (element instanceof HTMLElement && !seen.has(element)) {
          seen.add(element);
          elements.push(element);
        }
      };
      if (!node) {
        return elements;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node;
        if (element.matches?.(selector)) {
          add(element);
        }
        element.querySelectorAll?.(selector)?.forEach((child) => add(child));
      } else if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent) {
          const root = parent.closest(selector);
          if (root) {
            add(root);
          }
        }
      }
      return elements;
    }

    scanNode(node) {
      this.collectMessageElements(node).forEach((element) => this.captureAction(element));
    }

    captureAction(element) {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const textContent = this.extractText(element);
      const dataset = element.dataset || {};
      if (dataset.tfrModerationTracked === 'true') {
        return;
      }
      const action = this.extractAction(element, textContent);
      if (!action || !action.login) {
        return;
      }
      dataset.tfrModerationTracked = 'true';
      const normalized = this.historyTracker?.normalizeLogin?.(action.login) || '';
      if (!normalized) {
        return;
      }
      const history = typeof this.historyTracker?.getHistory === 'function' ? this.historyTracker.getHistory(normalized) : [];
      const lastMessage = history.length ? history[history.length - 1] : null;
      const offenseMessage =
        action.message ||
        this.extractOriginalMessage(element, textContent) ||
        lastMessage?.text ||
        null;
      const entry = {
        id: `${action.type}-${normalized}-${action.timestamp}`,
        login: normalized,
        displayName: action.displayName || lastMessage?.displayName || normalized,
        type: action.type,
        duration: Number.isFinite(action.duration) ? action.duration : null,
        isPermanent: Boolean(action.isPermanent),
        moderator: action.moderator || null,
        timestamp: action.timestamp,
        rawMessage: action.rawMessage,
        lastMessage: lastMessage?.text || null,
        offenseMessage: offenseMessage,
        lastMessageTimestamp: lastMessage?.timestamp || null
      };
      this.addAction(entry);
    }

    addAction(entry) {
      if (!entry || !entry.id) {
        return;
      }
      const key = `${entry.type || 'unknown'}:${entry.login || ''}`;
      const cached = this.recentActionCache.get(key);
      const nowTs = Number(entry.timestamp) || Date.now();
      if (cached) {
        const age = Math.abs(nowTs - cached.timestamp);
        if (age < 60000) {
          const target = cached.entry;
          let updated = false;
          if (
            Number.isFinite(entry.duration) &&
            (!Number.isFinite(target.duration) || entry.duration > target.duration)
          ) {
            target.duration = entry.duration;
            updated = true;
          }
          if (!target.offenseMessage && entry.offenseMessage) {
            target.offenseMessage = entry.offenseMessage;
            updated = true;
          }
          if (updated) {
            this.emit();
          }
          return;
        }
        if (age > 10 * 60 * 1000) {
          this.recentActionCache.delete(key);
        }
      }
      if (this.actionKeys.has(entry.id)) {
        return;
      }
      this.actionKeys.add(entry.id);
      this.actions.push(entry);
      this.recentActionCache.set(key, { timestamp: nowTs, entry });
      if (this.actions.length > this.maxActions) {
        const removed = this.actions.splice(0, this.actions.length - this.maxActions);
        removed.forEach((item) => {
          if (item?.id) {
            this.actionKeys.delete(item.id);
          }
        });
      }
      this.emit();
    }

    extractAction(element, rawText) {
      const dataset = element.dataset || {};
      const timestamp =
        (typeof this.historyTracker?.extractTimestamp === 'function' && this.historyTracker.extractTimestamp(element)) ||
        Date.now();
      const simplified = this.normalizeText(rawText);
      if (simplified && (simplified.includes('debann') || simplified.includes('unban'))) {
        return null;
      }
      const datasetNumericCandidates = [];
      const datasetTextHints = [];
      const addCandidate = (value, unitHint = null) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return;
        }
        if (unitHint) {
          datasetNumericCandidates.push({ value: numeric, unit: unitHint });
        } else {
          datasetNumericCandidates.push(numeric);
        }
      };
      const collectFromJson = (node, keyPath = '') => {
        if (node === null || node === undefined) {
          return;
        }
        if (typeof node === 'number') {
          const unit = /ms/i.test(keyPath) ? 'ms' : null;
          addCandidate(node, unit);
          return;
        }
        if (typeof node === 'string') {
          const trimmed = node.trim();
          if (!trimmed) return;
          datasetTextHints.push(trimmed);
          const numeric = Number(trimmed);
          if (Number.isFinite(numeric) && numeric > 0) {
            const unit = /ms/i.test(keyPath) ? 'ms' : null;
            addCandidate(numeric, unit);
          }
          return;
        }
        if (Array.isArray(node)) {
          node.forEach((child) => collectFromJson(child, keyPath));
          return;
        }
        if (typeof node === 'object') {
          Object.entries(node).forEach(([childKey, childValue]) => {
            const nextKey = keyPath ? `${keyPath}.${childKey}` : childKey;
            collectFromJson(childValue, nextKey);
          });
        }
      };

      Object.entries(dataset).forEach(([key, value]) => {
        if (typeof value === 'number') {
          const unit = /ms/i.test(key) ? 'ms' : null;
          addCandidate(value, unit);
        } else if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) return;
          const numeric = Number(trimmed);
          if (Number.isFinite(numeric) && numeric > 0) {
            const unit = /ms/i.test(key) ? 'ms' : null;
            addCandidate(numeric, unit);
          } else {
            datasetTextHints.push(trimmed);
            if (
              (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
              (trimmed.startsWith('[') && trimmed.endsWith(']'))
            ) {
              try {
                collectFromJson(JSON.parse(trimmed), key);
              } catch {
                // ignore invalid JSON strings
              }
            }
          }
        }
      });

      const elementInnerText = this.normalizeText(element.innerText || '');
      const analysisParts = [simplified, elementInnerText, ...datasetTextHints];
      let analysisText = analysisParts.filter(Boolean).join(' ') || '';
      const loginCandidate =
        this.pickFirst([
          dataset.targetUser,
          dataset.targetUserLogin,
          dataset.targetUsername,
          dataset.target,
          dataset.user,
          dataset.username,
          dataset.userName,
          dataset.login,
          dataset.userLogin,
          dataset.aUser,
          dataset.aUserLogin,
          dataset.moderationEventTarget,
          dataset.modTarget,
          element.getAttribute?.('data-target-user'),
          element.getAttribute?.('data-target'),
          element.getAttribute?.('data-username'),
          element.getAttribute?.('data-user'),
          element.getAttribute?.('data-user-login'),
          element.getAttribute?.('data-sender')
        ]) ||
        (typeof this.historyTracker?.extractLogin === 'function'
          ? this.historyTracker.extractLogin(element)
          : '') ||
        this.extractLoginFromText(analysisText);
      let login = this.sanitizeLogin(loginCandidate);
      if (!login) {
        return null;
      }
      const moderatorCandidate =
        this.pickFirst([
          dataset.createdBy,
          dataset.moderator,
          dataset.sourceModerator,
          dataset.moderationEventSource,
          dataset.mod,
          element.getAttribute?.('data-moderator'),
          element.getAttribute?.('data-created-by')
        ]) || this.extractModeratorFromText(analysisText);
      const moderator = this.sanitizeLogin(moderatorCandidate);
      const displayName =
        this.pickFirst([
          dataset.targetDisplayName,
          dataset.displayName,
          dataset.userDisplayName,
          dataset.targetUserDisplayName
        ]) || null;
      let type = null;
      let durationSeconds =
        this.parseDurationCandidates([
          dataset.durationSeconds,
          dataset.duration,
          dataset.durationSec,
          dataset.durationInSeconds,
          dataset.lengthSeconds,
          dataset.length,
          dataset.timeoutDuration,
          dataset.timeoutDurationSeconds,
          dataset.timeoutDurationSec,
          dataset.timeoutLength,
          dataset.timeoutLengthSeconds,
          dataset.timeoutSeconds,
          dataset.timeout,
          dataset.muteDuration,
          dataset.silenceDuration,
          dataset.banDuration,
          dataset.banDurationSeconds,
          dataset.banDurationSec,
          dataset.timeToUnban,
          dataset.durationMs ? { value: dataset.durationMs, unit: 'ms' } : null,
          dataset.timeoutDurationMs ? { value: dataset.timeoutDurationMs, unit: 'ms' } : null,
          dataset.banDurationMs ? { value: dataset.banDurationMs, unit: 'ms' } : null,
          { value: element.getAttribute?.('data-duration') },
          { value: element.getAttribute?.('data-duration-seconds') },
          { value: element.getAttribute?.('data-timeout-duration') },
          { value: element.getAttribute?.('data-timeout-seconds') },
          { value: element.getAttribute?.('data-duration-ms'), unit: 'ms' },
          { value: element.getAttribute?.('data-timeout-duration-ms'), unit: 'ms' }
        ].concat(datasetNumericCandidates)) || null;

      const attributeHints = [
        dataset.moderationActionType,
        dataset.modAction,
        dataset.action,
        dataset.type,
        dataset.messageType,
        dataset.commandName,
        dataset.noticeType,
        dataset.eventType,
        dataset.category,
        element.getAttribute?.('data-a-target'),
        element.getAttribute?.('data-test-selector'),
        element.getAttribute?.('class'),
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('role')
      ];
      const childHintNodes = Array.from(
        element.querySelectorAll('[data-mod-action],[data-moderation-action-type],[data-test-selector],[data-a-target]')
      );
      childHintNodes.forEach((node) => {
        const nodeDataset = node.dataset || {};
        Object.entries(nodeDataset).forEach(([datasetKey, datasetValue]) => {
          attributeHints.push(datasetValue);
          if (typeof datasetValue === 'number') {
            const unit = /ms/i.test(datasetKey) ? 'ms' : null;
            addCandidate(datasetValue, unit);
          } else if (typeof datasetValue === 'string') {
            const trimmed = datasetValue.trim();
            if (!trimmed) return;
            datasetTextHints.push(trimmed);
            const numeric = Number(trimmed);
            if (Number.isFinite(numeric) && numeric > 0) {
              const unit = /ms/i.test(datasetKey) ? 'ms' : null;
              addCandidate(numeric, unit);
            } else if (
              (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
              (trimmed.startsWith('[') && trimmed.endsWith(']'))
            ) {
              try {
                collectFromJson(JSON.parse(trimmed), datasetKey);
              } catch {
                // ignore invalid JSON
              }
            }
          }
        });
        attributeHints.push(node.getAttribute?.('data-a-target'));
        attributeHints.push(node.getAttribute?.('data-test-selector'));
        attributeHints.push(node.getAttribute?.('aria-label'));
        attributeHints.push(node.className);
      });
      analysisText = this.normalizeText([analysisText, ...datasetTextHints].filter(Boolean).join(' ')) || analysisText;
      const attributeHintSource = attributeHints
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.toLowerCase())
        .join(' ');
      const actionHint = attributeHintSource ? this.normalizeText(attributeHintSource) : '';
      const hasActionHint = Boolean(actionHint);

      if (hasActionHint && /(announcement|annonce|announce|shoutout)/.test(actionHint)) {
        return null;
      }

      if (!type && hasActionHint) {
        if (/(ban permanent|perma|ban def|permanent ban)/.test(actionHint)) {
          type = 'ban';
        } else if (/(timeout|temporaire|tempo|silence|mute|timed out|masque)/.test(actionHint)) {
          type = 'timeout';
        } else if (/ban/.test(actionHint)) {
          type = 'ban';
        }
      }

      const appendedBanMatch = analysisText.match(/^\s*(?<user>[@\w-]+).*?\((?:banni|ban|banned|perma)\)/);
      if (!type && appendedBanMatch) {
        const candidate = this.sanitizeLogin(appendedBanMatch.groups?.user || login);
        if (candidate) {
          login = candidate;
          type = 'ban';
        }
      }

      const appendedTimeoutMatch = analysisText.match(
        /^\s*(?<user>[@\w-]+).*?\((?:tempo|timeout|timed\s*out|masque|mute|supprime|deleted|efface)\)/
      );
      if (!type && appendedTimeoutMatch) {
        const candidate = this.sanitizeLogin(appendedTimeoutMatch.groups?.user || login);
        if (candidate) {
          login = candidate;
          type = 'timeout';
        }
        if (!Number.isFinite(durationSeconds)) {
          durationSeconds = this.extractDurationFromText(analysisText);
        }
      }

      const deletionResult = this.detectDeletionAction(element, analysisText);
      if (deletionResult) {
        if (!type) {
          type = deletionResult.type;
        }
        if (!Number.isFinite(durationSeconds) && Number.isFinite(deletionResult.duration)) {
          durationSeconds = deletionResult.duration;
        }
      }

      if (!type) {
        const banMatch = analysisText.match(/^\s*(?<user>[^\s]+)\s+(?:a\s+ete|has|was)\s+(?:ete\s+)?bann/i);
        if (banMatch) {
          const user = this.sanitizeLogin(banMatch.groups?.user || login);
          if (user) {
            login = user;
            type = 'ban';
          }
        }
      }

      if (!type) {
        const timeoutMatch = analysisText.match(
          /^\s*(?<user>[^\s]+)\s+(?:a\s+ete\s+reduit\s+au\s+silence|a\s+ete\s+tempo|a\s+ete\s+mute|a\s+ete\s+temporaire|has\s+been\s+timed\s+out|was\s+timed\s+out|ban\s+temporaire)\s*(?:pour|pendant|for|de)?\s*(?<duration>\d+)?\s*(?<unit>seconde|secondes|seconds?|minute|minutes?|hour|hours?|heure|heures?|day|days?|jour|jours?|week|weeks?|semaine|semaines)?/
        );
        if (timeoutMatch) {
          const user = this.sanitizeLogin(timeoutMatch.groups?.user || login);
          if (user) {
            login = user;
            type = 'timeout';
          }
          if (!Number.isFinite(durationSeconds)) {
            durationSeconds = this.convertDuration(timeoutMatch.groups?.duration, timeoutMatch.groups?.unit);
          }
        }
      }

      if (!type) {
        return null;
      }

      const textDurationCandidates = [
        this.extractDurationFromText(analysisText),
        this.extractDurationFromText(rawText),
        this.extractDurationFromText(elementInnerText),
        this.extractDurationFromText(element.getAttribute?.('aria-label')),
        this.extractDurationFromText(element.getAttribute?.('data-duration-label')),
        ...datasetTextHints.map((value) => this.extractDurationFromText(value))
      ].filter((value) => Number.isFinite(value) && value > 0);
      if (textDurationCandidates.length) {
        const maxTextDuration = Math.max(...textDurationCandidates);
        if (!Number.isFinite(durationSeconds) || maxTextDuration > durationSeconds * 1.5 || (maxTextDuration >= 60 && durationSeconds < 60)) {
          durationSeconds = maxTextDuration;
        }
      }
      if (!Number.isFinite(durationSeconds)) {
        durationSeconds = this.extractDurationFromText(analysisText);
      }
      if (!Number.isFinite(durationSeconds)) {
        durationSeconds = this.extractDurationFromText(rawText);
      }
      if (Number.isFinite(durationSeconds) && durationSeconds > MAX_TIMEOUT_SECONDS) {
        durationSeconds = null;
      }
      const message = this.extractOriginalMessage(element, rawText);
      const isPermanent =
        type === 'ban'
          ? this.shouldTreatAsPermanentBan(
              dataset,
              simplified,
              Number.isFinite(durationSeconds) ? durationSeconds : null,
              actionHint
            )
          : false;
      return {
        type,
        login,
        duration: Number.isFinite(durationSeconds) ? durationSeconds : null,
        isPermanent,
        displayName,
        moderator: moderator || null,
        timestamp,
        rawMessage: rawText,
        message
      };
    }

    detectDeletionAction(element, simplifiedText) {
      if (!element) {
        return null;
      }
      const dataset = element.dataset || {};
      const deletionNode =
        element.querySelector(
          '[data-a-target="deleted-message"], [data-test-selector="chat-line-message-deleted"], [data-test-selector="chat-deleted-message"], span[data-a-target="deleted-message"]'
        ) || null;
      const appendedTextBan = simplifiedText
        ? /\((?:banni|ban|permaban|perma|ban\s*def|ban\s*d[eé]finitif)\)/.test(simplifiedText)
        : false;
      const appendedTextTimeout = simplifiedText
        ? /\((?:tempo|timeout|timed\s*out|silence|mute|masque|efface|deleted)\)/.test(simplifiedText)
        : false;
      const appendedTextIndicator = appendedTextBan || appendedTextTimeout;
      const deletionText = this.normalizeText(deletionNode?.textContent || '');
      const actionValue = typeof dataset.action === 'string' ? dataset.action.toLowerCase() : '';
      const modActionValue = typeof dataset.modAction === 'string' ? dataset.modAction.toLowerCase() : '';
      const datasetHints = [
        dataset.moderationActionType,
        dataset.modAction,
        dataset.action,
        dataset.type,
        dataset.messageType,
        dataset.noticeType,
        dataset.category,
        dataset.subtype,
        dataset.commandName
      ]
        .map((value) => (typeof value === 'string' ? this.normalizeText(value) : ''))
        .filter(Boolean);
      const indicatorParts = [deletionText, ...datasetHints];
      const indicatorText = indicatorParts.join(' ').trim();
      const BAN_PATTERN = /\b(banni?|perma|permaban|ban\s*def|ban\s*permanent|ban\s*perma|ban\s*d[eé]finitif|definitif|permanent|ban)\b/;
      const TIMEOUT_PATTERN = /\b(timeout|temps?o|tempo|timed\s*out|silence|mute|masque|suspendu)\b/;
      const indicatesBan = indicatorText ? BAN_PATTERN.test(indicatorText) || /ban/.test(actionValue) : /ban/.test(actionValue);
      const indicatesTimeout = indicatorText ? TIMEOUT_PATTERN.test(indicatorText) || /timeout|tempo/.test(actionValue) : /timeout|tempo/.test(actionValue);
      const hasDeletedFlag =
        this.isTruthy(dataset.deleted) ||
        this.isTruthy(dataset.deletedMessage) ||
        this.isTruthy(dataset.deletedMsg) ||
        this.isTruthy(dataset.deletedBy) ||
        this.isTruthy(dataset.isDeleted) ||
        (modActionValue && /(ban|timeout|delete|remove|block|silence|mute)/.test(modActionValue)) ||
        (actionValue && /(ban|timeout|delete|remove|block|silence|mute)/.test(actionValue));
      const classIndicator =
        element.classList?.contains('chat-line__message--deleted') ||
        element.classList?.contains('is-deleted') ||
        element.classList?.contains('chat-line__message--warning');
      const appendedIndicator = /\((?:banni|ban|timeout|tempo|supprime|deleted|masque|mute)\)/.test(this.normalizeText(deletionNode?.textContent || ''));
      const hasStrongIndicator =
        hasDeletedFlag || classIndicator || Boolean(deletionNode) || appendedIndicator || appendedTextIndicator || indicatesBan || indicatesTimeout;
      if (!hasStrongIndicator) {
        return null;
      }
      let type = null;
      if (indicatesBan || appendedTextBan) {
        type = 'ban';
      } else if (indicatesTimeout || appendedTextTimeout) {
        type = 'timeout';
      }
      const durationSource = [indicatorText, this.normalizeText(actionValue), this.normalizeText(modActionValue), simplifiedText]
        .filter(Boolean)
        .join(' ');
      const duration = this.extractDurationFromText(durationSource);
      if (!type && Number.isFinite(duration)) {
        type = 'timeout';
      }
      return type
        ? {
            type,
            duration: Number.isFinite(duration) ? duration : null
          }
        : null;
    }

    parseDurationCandidates(values) {
      if (!Array.isArray(values)) {
        return null;
      }
      for (const entry of values) {
        if (entry === null || entry === undefined || entry === '') {
          continue;
        }
        if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
          const parsed = this.parseDurationValue(entry.value, entry.unit);
          if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
          }
          continue;
        }
        const parsed = this.parseDurationValue(entry);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return null;
    }

    parseDurationValue(value, unitHint = null) {
      if (value === undefined || value === null || value === '') {
        return null;
      }
      if (typeof value === 'number') {
        return this.normalizeDurationNumber(value, unitHint);
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }
        if (unitHint === 'ms') {
          const numeric = Number(trimmed);
          if (Number.isFinite(numeric)) {
            return this.normalizeDurationNumber(numeric, 'ms');
          }
        }
        if (/^\d+$/.test(trimmed)) {
          return this.normalizeDurationNumber(Number(trimmed), unitHint);
        }
        const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (colonMatch) {
          const hours = colonMatch[3] ? Number(colonMatch[1]) : 0;
          const minutes = colonMatch[3] ? Number(colonMatch[2]) : Number(colonMatch[1]);
          const seconds = colonMatch[3] ? Number(colonMatch[3]) : Number(colonMatch[2]);
          if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
            return hours * 3600 + minutes * 60 + seconds;
          }
        }
        const isoMatch = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
        if (isoMatch) {
          const hours = Number(isoMatch[1] || 0);
          const minutes = Number(isoMatch[2] || 0);
          const seconds = Number(isoMatch[3] || 0);
          if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
            return hours * 3600 + minutes * 60 + seconds;
          }
        }
        const numeric = Number(trimmed.replace(',', '.'));
        if (Number.isFinite(numeric)) {
          const normalized = this.normalizeDurationNumber(numeric, unitHint);
          if (Number.isFinite(normalized)) {
            return normalized;
          }
        }
        const extracted = this.extractDurationFromText(trimmed);
        if (Number.isFinite(extracted)) {
          return extracted;
        }
      }
      return null;
    }

    normalizeDurationNumber(value, unitHint = null) {
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }
      if (unitHint === 'ms') {
        return Math.round(value / 1000);
      }
      if (value > 0 && value < 1) {
        return null;
      }
      return Math.round(value);
    }

    shouldTreatAsPermanentBan(dataset, simplified, durationSeconds, actionHint) {
      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        return false;
      }
      const hints = [
        dataset?.isPermanent,
        dataset?.permanent,
        dataset?.permaban,
        dataset?.banType,
        dataset?.moderationActionType,
        dataset?.modAction,
        dataset?.action,
        actionHint
      ];
      for (const hint of hints) {
        if (hint === undefined || hint === null || hint === '') continue;
        if (typeof hint === 'boolean') {
          if (hint) return true;
          continue;
        }
        if (typeof hint === 'string') {
          const normalized = hint.toLowerCase();
          if (/(perma|permanent|indef|definitif|definitive|forever)/.test(normalized)) {
            return true;
          }
        }
      }
      if (typeof simplified === 'string' && /(perma|permanent|indef|definitif|definitive|forever)/.test(simplified)) {
        return true;
      }
      return true;
    }

    extractOriginalMessage(element, rawText) {
      const dataset = element?.dataset || {};
      const candidate = this.pickFirst([
        dataset.originalMessage,
        dataset.originalMessageBody,
        dataset.deletedMessage,
        dataset.deletedMsg,
        dataset.moderationMessage,
        dataset.message,
        dataset.msg,
        dataset.messageBody,
        dataset.body,
        dataset.content,
        dataset.rawMessage,
        dataset.plainText,
        dataset.plaintext,
        dataset.messagePlainText,
        element?.getAttribute?.('data-original-message'),
        element?.getAttribute?.('data-deleted-message'),
        element?.getAttribute?.('data-message'),
        element?.getAttribute?.('data-msg'),
        element?.getAttribute?.('data-plain-text')
      ]);
      let message = candidate || '';
      if (!message) {
        const aria = element?.getAttribute?.('aria-label');
        if (aria) {
          message = aria;
        }
      }
      if (!message) {
        const title = element?.getAttribute?.('title');
        if (title) {
          message = title;
        }
      }
      if (!message && typeof this.historyTracker?.extractMessageText === 'function') {
        try {
          message = this.historyTracker.extractMessageText(element) || '';
        } catch {
          message = '';
        }
      }
      if (!message && rawText) {
        message = rawText;
      }
      return this.cleanModerationMessage(message);
    }

    cleanModerationMessage(value) {
      if (!value || typeof value !== 'string') {
        return '';
      }
      let cleaned = value;
      const removalPatterns = [
        /\s*\((?:efface|effac[eÃ©]|supprime|supprim[eÃ©]|deleted|timeout|timed out|tempo|hidden|masqu[eÃ©]|ban(?:ne)?|banni|mod[eÃ©]r[Ã©e])[^)]*\)\s*$/i,
        /(?:message\s+supprim[eÃ©]\s+par.*)$/i,
        /^(?:\*+|\u2022|\-)+\s*/i
      ];
      removalPatterns.forEach((pattern) => {
        cleaned = cleaned.replace(pattern, '').trim();
      });
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      return cleaned;
    }

    extractText(element) {
      if (!element) return '';
      const text = element.textContent || '';
      return text.replace(/\s+/g, ' ').trim();
    }

    normalizeText(value) {
      if (!value) return '';
      let normalized = value;
      try {
        normalized = value.normalize('NFKC');
      } catch {
        normalized = value;
      }
      normalized = normalized.toLowerCase().replace(/\s+/g, ' ');
      try {
        normalized = normalized.normalize('NFD');
      } catch {
        // ignore normalization issues
      }
      normalized = normalized.replace(/[\u0300-\u036f]/g, '');
      return normalized.trim();
    }

    pickFirst(values) {
      if (!Array.isArray(values)) return null;
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      return null;
    }

    sanitizeLogin(value) {
      if (!value || typeof value !== 'string') {
        return '';
      }
      let cleaned = value.trim().replace(/^@/, '');
      cleaned = cleaned.replace(/^[^a-z0-9_]+/i, '');
      cleaned = cleaned.replace(/[^a-z0-9_]+$/i, '');
      cleaned = cleaned.toLowerCase();
      if (!cleaned) {
        return '';
      }
      if (!/^[a-z0-9_]+$/.test(cleaned)) {
        return '';
      }
      if (!/[a-z_]/.test(cleaned)) {
        return '';
      }
      return cleaned;
    }

    extractLoginFromText(text) {
      if (!text || typeof text !== 'string') return '';
      const tokens = text.split(/\s+/);
      for (const rawToken of tokens) {
        if (!rawToken) continue;
        const trimmed = rawToken.replace(/^[^a-z0-9@_]+/i, '').replace(/[^a-z0-9@_]+$/i, '');
        const candidate = this.sanitizeLogin(trimmed);
        if (candidate) {
          return candidate;
        }
      }
      return '';
    }

    extractModeratorFromText(text) {
      if (!text) return null;
      const modMatch = text.match(/\b(?:by|par)\s+(@?[^\s\.\)]+)/i);
      if (modMatch && modMatch[1]) {
        const sanitized = this.sanitizeLogin(modMatch[1]);
        if (!sanitized) {
          return null;
        }
        if (['un', 'une', 'le', 'la', 'an', 'a', 'moderateur', 'moderator'].includes(sanitized)) {
          return null;
        }
        return sanitized;
      }
      return null;
    }

    extractDurationFromText(text) {
      if (!text) {
        return null;
      }
      const normalizedText = String(text)
        .replace(/[,]+/g, '.')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalizedText) {
        return null;
      }
      const colonMatch = normalizedText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (colonMatch) {
        const hasHours = Boolean(colonMatch[3]);
        const hours = hasHours ? Number(colonMatch[1]) : 0;
        const minutes = hasHours ? Number(colonMatch[2]) : Number(colonMatch[1]);
        const seconds = hasHours ? Number(colonMatch[3]) : Number(colonMatch[2]);
        if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
          return hours * 3600 + minutes * 60 + seconds;
        }
      }
      const durationMatch = normalizedText.match(
        /(\d+(?:\.\d+)?)\s*(seconde|secondes|seconds?|sec|secs|min|minutes?|mn|heure|heures?|hour|hours?|hr|hrs|day|days?|jour|jours?|d|week|weeks?|semaine|semaines?|w|millisecondes?|milliseconds?|ms)/i
      );
      if (durationMatch) {
        return this.convertDuration(durationMatch[1], durationMatch[2]);
      }
      const compactMatch = normalizedText.match(/(\d+(?:\.\d+)?)(s|sec|m|min|h|hr|d|w)/i);
      if (compactMatch) {
        return this.convertDuration(compactMatch[1], compactMatch[2]);
      }
      return null;
    }

    isTruthy(value) {
      if (value === undefined || value === null) {
        return false;
      }
      const normalized = String(value).trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      return !['0', 'false', 'no', 'non', 'off', 'null', 'undefined'].includes(normalized);
    }

    convertDuration(value, unit) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
      }
      const normalizedUnit = (unit || '').toLowerCase();
      switch (normalizedUnit) {
        case 'minute':
        case 'minutes':
        case 'min':
        case 'mins':
        case 'mn':
        case 'm':
          return numeric * 60;
        case 'hour':
        case 'hours':
        case 'heure':
        case 'heures':
        case 'hr':
        case 'hrs':
        case 'h':
          return numeric * 3600;
        case 'day':
        case 'days':
        case 'jour':
        case 'jours':
        case 'd':
          return numeric * 86400;
        case 'week':
        case 'weeks':
        case 'semaine':
        case 'semaines':
        case 'w':
          return numeric * 604800;
        case 'seconde':
        case 'secondes':
        case 'second':
        case 'seconds':
        case 'sec':
        case 'secs':
        case 's':
          return numeric;
        case 'millisecond':
        case 'milliseconds':
        case 'milliseconde':
        case 'millisecondes':
        case 'ms':
          return numeric / 1000;
        default:
          return numeric;
      }
    }
  }

  class ModerationHistoryUI {
    constructor(tracker) {
      this.tracker = tracker;
      this.button = null;
      this.panel = null;
      this.panelContent = null;
      this.unsubscribe = null;
      this.containerObserver = null;
      this.latestActions = [];
      this.isOpen = false;
      this.mountFrame = null;
      this.seenActionIds = new Set();
      this.hasUnread = false;
      this.handleDocumentClick = this.handleDocumentClick.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleResize = this.handleResize.bind(this);
    }

    init() {
      if (this.tracker && typeof this.tracker.subscribe === 'function') {
        this.unsubscribe = this.tracker.subscribe((actions) => this.handleActionsUpdate(actions));
        if (typeof this.tracker.getActions === 'function') {
          this.handleActionsUpdate(this.tracker.getActions());
        }
      }
      this.observeControls();
      this.scheduleMount();
    }

    dispose() {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.containerObserver?.disconnect();
      this.containerObserver = null;
      if (this.mountFrame) {
        cancelAnimationFrame(this.mountFrame);
        this.mountFrame = null;
      }
      this.closePanel(true);
      if (this.button?.parentElement) {
        this.button.parentElement.removeChild(this.button);
      }
      this.button = null;
      this.panel = null;
      this.panelContent = null;
      this.latestActions = [];
      this.seenActionIds.clear();
      this.hasUnread = false;
    }

    observeControls() {
      this.containerObserver?.disconnect();
      this.containerObserver = new MutationObserver(() => this.scheduleMount());
      this.containerObserver.observe(document.body, { childList: true, subtree: true });
    }

    scheduleMount() {
      if (this.mountFrame) {
        cancelAnimationFrame(this.mountFrame);
      }
      this.mountFrame = requestAnimationFrame(() => {
        this.mountFrame = null;
        this.mountButton();
      });
    }

    mountButton() {
      const container = this.findControlsContainer();
      const button = this.ensureButton();
      if (!container) {
        if (button?.parentElement) {
          button.parentElement.removeChild(button);
        }
        return;
      }
      if (!container.contains(button)) {
        container.appendChild(button);
      }
    }

    findControlsContainer() {
      const selectors = [
        '[data-a-target="chat-input-buttons-container"]',
        '[data-test-selector="chat-input-buttons-container"]',
        '.chat-input__buttons-container',
        '.chat-input__buttonsWrapper',
        '.chat-input__buttons',
        '.chat-input__toolbar',
        '.chat-input__right-column',
        '[data-a-target="chat-input"] [data-a-target="chat-input-buttons-container"]',
        '[data-test-selector="chat-input"] [data-test-selector="chat-input-buttons-container"]'
      ];
      for (const selector of selectors) {
        try {
          const candidate = document.querySelector(selector);
          if (candidate instanceof HTMLElement) {
            return candidate;
          }
        } catch {
          // ignore selector errors on dynamic DOM updates
        }
      }
      const anchors = [
        'button[data-a-target="chat-settings"]',
        'button[data-a-target="chat-settings-button"]',
        'button[data-test-selector="chat-settings-button"]',
        'button[data-a-target="chat-room-settings"]',
        'button[data-a-target="chat-slow-mode-toggle"]',
        'button[data-test-selector="chat-slow-mode-toggle"]',
        'button[aria-label*="Settings"]'
      ];
      for (const selector of anchors) {
        try {
          const anchor = document.querySelector(selector);
          if (anchor instanceof HTMLElement) {
            const parent = anchor.parentElement;
            if (parent instanceof HTMLElement) {
              return parent;
            }
          }
        } catch {
          // ignore anchor lookup errors
        }
      }
      return null;
    }

    ensureButton() {
      if (this.button) {
        return this.button;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tfr-chat-action-button tfr-mod-history-button';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      const label = t('moderation.history.button');
      button.setAttribute('aria-label', label);
      button.title = label;
      button.innerHTML =
        '<svg class="tfr-chat-action-button__icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 6h14v2H5zM5 11h14v2H5zM5 16h14v2H5z"></path><circle cx="7" cy="7" r="1.2"></circle><circle cx="7" cy="12" r="1.2"></circle><circle cx="7" cy="17" r="1.2"></circle></svg>';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.togglePanel();
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.togglePanel();
        }
      });
      this.button = button;
      this.updateButtonState();
      return button;
    }

    handleActionsUpdate(actions) {
      this.latestActions = Array.isArray(actions) ? actions.slice() : [];
      const unread = this.latestActions.some((entry) => entry?.id && !this.seenActionIds.has(entry.id));
      this.hasUnread = unread;
      if (this.isOpen) {
        this.renderPanel();
        this.positionPanel();
        this.markAllSeen();
      } else {
        this.updateButtonState();
      }
    }

    updateButtonState() {
      if (!this.button) return;
      this.button.classList.toggle('has-data', this.hasUnread);
      if (!this.hasUnread && !this.isOpen) {
        this.button.classList.remove('is-active');
      }
    }

    togglePanel() {
      if (this.isOpen) {
        this.closePanel();
      } else {
        this.openPanel();
      }
    }

    ensurePanel() {
      if (this.panel) {
        return this.panel;
      }
      const panel = document.createElement('div');
      panel.className = 'tfr-mod-history-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'false');
      panel.setAttribute('aria-label', t('moderation.history.title'));
      panel.tabIndex = -1;

      const header = document.createElement('div');
      header.className = 'tfr-mod-history-panel__header';

      const title = document.createElement('span');
      title.className = 'tfr-mod-history-panel__title';
      title.textContent = t('moderation.history.title');
      header.appendChild(title);

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'tfr-mod-history-panel__close';
      closeButton.setAttribute('aria-label', t('common.closeAction'));
      closeButton.innerHTML = '&times;';
      closeButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.closePanel();
      });
      header.appendChild(closeButton);

      panel.appendChild(header);

      const content = document.createElement('div');
      content.className = 'tfr-mod-history-panel__content';
      panel.appendChild(content);

      this.panel = panel;
      this.panelContent = content;
      return panel;
    }

    openPanel() {
      if (!this.button) {
        return;
      }
      const panel = this.ensurePanel();
      if (!document.body.contains(panel)) {
        document.body.appendChild(panel);
      }
      panel.style.visibility = 'hidden';
      panel.classList.remove('is-visible');
      this.renderPanel();
      this.positionPanel();
      panel.style.visibility = '';
      requestAnimationFrame(() => panel.classList.add('is-visible'));
      this.isOpen = true;
      this.button.classList.add('is-active');
      this.button.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', this.handleDocumentClick, true);
      document.addEventListener('keydown', this.handleKeydown, true);
      window.addEventListener('resize', this.handleResize);
      try {
        panel.focus({ preventScroll: true });
      } catch {
        panel.focus();
      }
      this.markAllSeen();
    }

    closePanel(force = false) {
      if (!this.isOpen && !force) {
        return;
      }
      const panel = this.panel;
      if (panel?.parentElement) {
        panel.classList.remove('is-visible');
        panel.parentElement.removeChild(panel);
      }
      this.isOpen = false;
      if (this.button) {
        this.button.classList.remove('is-active');
        this.button.setAttribute('aria-expanded', 'false');
      }
      document.removeEventListener('mousedown', this.handleDocumentClick, true);
      document.removeEventListener('keydown', this.handleKeydown, true);
      window.removeEventListener('resize', this.handleResize);
      this.updateButtonState();
    }

    renderPanel() {
      const content = this.panelContent;
      if (!content) {
        return;
      }
      content.innerHTML = '';
      const actions = Array.isArray(this.latestActions) ? this.latestActions : [];
      if (!actions.length) {
        const empty = document.createElement('p');
        empty.className = 'tfr-mod-history-panel__empty';
        empty.textContent = t('moderation.history.empty');
        content.appendChild(empty);
        return;
      }
      const list = document.createElement('ul');
      list.className = 'tfr-mod-history-list';
      const entries = actions.slice(-50).reverse();
      entries.forEach((entry) => {
        const info = this.getEntryInfo(entry);
        const item = document.createElement('li');
        item.className = 'tfr-mod-history-entry';
        const time = document.createElement('time');
        time.className = 'tfr-mod-history-entry__time';
        const date = new Date(entry.timestamp);
        time.dateTime = date.toISOString();
        time.textContent = info.timeLabel || '';
        item.appendChild(time);

        const body = document.createElement('div');
        body.className = 'tfr-mod-history-entry__body';
        item.appendChild(body);

        const offenseMessage = (entry.offenseMessage || '').trim();
        const lastMessage = (entry.lastMessage || '').trim();
        const line = document.createElement('div');
        line.className = 'tfr-mod-history-entry__line';

        const name = document.createElement('span');
        name.className = 'tfr-mod-history-entry__author';
        const loginLabel = entry.login || '';
        const displayLabel = entry.displayName || '';
        let combinedLabel = loginLabel;
        if (displayLabel && displayLabel.toLowerCase() !== loginLabel.toLowerCase()) {
          combinedLabel = `${displayLabel} (${loginLabel})`;
        }
        if (combinedLabel) {
          name.textContent = `${combinedLabel} :`;
          line.appendChild(name);
          body.appendChild(line);
        }

        const message = document.createElement('div');
        message.className = 'tfr-mod-history-entry__message';
        const messageToDisplay = offenseMessage || lastMessage;
        if (messageToDisplay) {
          message.textContent = this.truncate(messageToDisplay, 320);
        } else {
          message.textContent = t('moderation.history.lastMessage.none');
          message.classList.add('is-empty');
        }
        body.appendChild(message);

        if (info.metaLabel) {
          const meta = document.createElement('div');
          meta.className = 'tfr-mod-history-entry__meta';
          meta.textContent = info.metaLabel;
          body.appendChild(meta);
        }

        list.appendChild(item);
      });
      content.appendChild(list);
    }

    getEntryInfo(entry) {
      const durationValue = Number(entry?.duration);
      const hasDuration = Number.isFinite(durationValue) && durationValue > 0;
      const durationLabel = hasDuration ? formatDurationClock(durationValue) : '';
      let actionLabel = '';
      if (entry.type === 'ban') {
        if (entry.isPermanent) {
          actionLabel = t('moderation.history.action.banPermanent');
        } else if (durationLabel) {
          actionLabel = t('moderation.history.action.timeout', { duration: durationLabel });
        } else {
          actionLabel = t('moderation.history.action.ban');
        }
      } else if (entry.type === 'timeout') {
        actionLabel = durationLabel
          ? t('moderation.history.action.timeout', { duration: durationLabel })
          : t('moderation.history.action.timeoutShort');
      } else {
        actionLabel = t('moderation.history.action.deletion');
      }
      const moderatorLabel = entry.moderator ? t('moderation.history.meta.by', { moderator: entry.moderator }) : '';
      const timeLabel = formatModerationTimestamp(entry.timestamp) || '';
      const metaParts = [];
      if (actionLabel) {
        metaParts.push(actionLabel);
      }
      if (moderatorLabel) {
        metaParts.push(moderatorLabel);
      }
      const metaLabel = metaParts.join(' - ');
      return { actionLabel, moderatorLabel, timeLabel, metaLabel };
    }

    markAllSeen() {
      let changed = false;
      this.latestActions.forEach((entry) => {
        if (entry?.id && !this.seenActionIds.has(entry.id)) {
          this.seenActionIds.add(entry.id);
          changed = true;
        }
      });
      if (this.seenActionIds.size > 500) {
        const ids = Array.from(this.seenActionIds);
        const toRemove = ids.slice(0, ids.length - 500);
        toRemove.forEach((id) => this.seenActionIds.delete(id));
      }
      if (changed || this.hasUnread) {
        this.hasUnread = false;
        this.updateButtonState();
      }
    }

    truncate(value, maxLength) {
      if (!value) {
        return '';
      }
      if (!Number.isFinite(maxLength) || maxLength <= 0 || value.length <= maxLength) {
        return value;
      }
      return `${value.slice(0, maxLength - 3)}...`;
    }

    handleDocumentClick(event) {
      const target = event.target;
      if (this.panel?.contains(target) || this.button?.contains(target)) {
        return;
      }
      this.closePanel();
    }

    handleKeydown(event) {
      if (event.key === 'Escape') {
        this.closePanel();
      }
    }

    handleResize() {
      if (this.isOpen) {
        this.positionPanel();
      }
    }

    positionPanel() {
      if (!this.panel || !this.button) {
        return;
      }
      const rect = this.button.getBoundingClientRect();
      const panel = this.panel;
      const maxHeight = Math.min(420, window.innerHeight - 24);
      panel.style.maxHeight = `${Math.max(220, maxHeight)}px`;
      panel.style.visibility = 'hidden';
      const panelRect = panel.getBoundingClientRect();
      let top = rect.top - panelRect.height - 8;
      if (top < 12) {
        top = rect.bottom + 8;
      }
      let left = rect.right - panelRect.width;
      if (left < 12) {
        left = 12;
      }
      const overflowRight = left + panelRect.width - window.innerWidth + 12;
      if (overflowRight > 0) {
        left -= overflowRight;
      }
      if (left < 12) {
        left = 12;
      }
      panel.style.top = `${Math.round(top)}px`;
      panel.style.left = `${Math.round(left)}px`;
      panel.style.visibility = '';
    }
  }

  class ViewerCardHistoryRenderer {
    constructor(tracker) {
      this.tracker = tracker;
      this.cardObserver = null;
      this.cardObserverTarget = null;
      this.currentCard = null;
      this.activeLogin = null;
      this.unsubscribe = null;
      this.maxDisplayed = 30;
      this.pollTimer = null;
      this.handlePotentialCardOpen = this.handlePotentialCardOpen.bind(this);
      this.rendering = false;
    }

    init() {
      document.addEventListener('click', this.handlePotentialCardOpen, true);
      document.addEventListener('keydown', this.handlePotentialCardOpen, true);
      this.unsubscribe = this.tracker.subscribe((login) => {
        if (this.activeLogin === login) {
          this.renderHistory();
        }
      });
      this.scheduleSync(0);
    }

    dispose() {
      document.removeEventListener('click', this.handlePotentialCardOpen, true);
      document.removeEventListener('keydown', this.handlePotentialCardOpen, true);
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      this.disposeCardObserver();
      this.unsubscribe?.();
      this.currentCard = null;
      this.activeLogin = null;
      this.rendering = false;
    }

    handlePotentialCardOpen(event) {
      if (event.type === 'keydown') {
        const key = event.key;
        if (key !== 'Enter' && key !== ' ') {
          return;
        }
      }
      this.scheduleSync(120);
    }

    scheduleSync(delay = 100) {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
      }
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null;
        this.syncCard();
      }, delay);
    }

    disposeCardObserver() {
      if (this.cardObserver) {
        this.cardObserver.disconnect();
        this.cardObserver = null;
        this.cardObserverTarget = null;
      }
    }

    observeCard(card) {
      if (this.cardObserverTarget === card) {
        return;
      }
      this.disposeCardObserver();
      this.cardObserverTarget = card;
      this.cardObserver = new MutationObserver(() => {
        if (this.rendering) {
          return;
        }
        if (!card.isConnected) {
          this.disposeCardObserver();
          this.currentCard = null;
          this.activeLogin = null;
          return;
        }
        this.scheduleSync(50);
      });
      this.cardObserver.observe(card, { childList: true, subtree: true, attributes: true });
    }

    getViewerRoots() {
      const roots = new Set([document]);
      const hostSelectors = [
        '[data-a-target="viewer-card-layer"]',
        '[data-test-selector="viewer-card-layer"]',
        '[data-a-target="popover-content"]',
        '[data-test-selector="popover-content"]',
        'tw-popover',
        'tw-dialog',
        'tw-overlay',
        'body > div[class*="viewer-card"]',
        'div[class*="viewer-card-layer"]'
      ];
      hostSelectors.forEach((selector) => {
        try {
          document.querySelectorAll(selector).forEach((host) => {
            roots.add(host);
            if (host.shadowRoot) {
              roots.add(host.shadowRoot);
            }
          });
        } catch {
          // ignore selector issues
        }
      });
      return Array.from(roots);
    }

    collectRelatedRoots(element) {
      const roots = new Set();
      let current = element;
      while (current && current !== document) {
        roots.add(current);
        if (current.shadowRoot) {
          roots.add(current.shadowRoot);
        }
        const parent = current.parentNode || current.host || null;
        if (parent instanceof ShadowRoot) {
          roots.add(parent);
          current = parent.host;
        } else {
          current = parent;
        }
      }
      roots.add(document);
      return Array.from(roots);
    }

    querySelectors(roots, selectors) {
      for (const root of roots) {
        if (!root) continue;
        for (const selector of selectors) {
          try {
            const found = root.querySelector?.(selector);
            if (found) {
              return found;
            }
          } catch {
            // ignore selector issues
          }
        }
      }
      return null;
    }

    findViewerCard() {
      const selectors = [
        '[data-a-target="viewer-card"]',
        '[data-test-selector="viewer-card"]',
        '[data-test-selector*="viewer-card"]',
        '.viewer-card',
        'aside.viewer-card',
        'div.viewer-card',
        'div[class*="viewer-card"]'
      ];
      for (const selector of selectors) {
        try {
          const direct = document.querySelector(selector);
          if (direct && this.isValidViewerCardElement(direct)) {
            return direct;
          }
        } catch {
          // ignore query errors
        }
      }
      const roots = this.getViewerRoots();
      const card = this.querySelectors(roots, selectors);
      return this.isValidViewerCardElement(card) ? card : null;
    }

    syncCard() {
      const card = this.findViewerCard();
      if (!card || !this.isValidViewerCardElement(card)) {
        this.disposeCardObserver();
        this.currentCard = null;
        this.activeLogin = null;
        return;
      }
      if (this.currentCard !== card) {
        this.currentCard = card;
        this.observeCard(card);
      }
      const login = this.extractLoginFromCard(card);
      if (!login) {
        this.activeLogin = null;
        return;
      }
      const normalized = this.tracker.normalizeLogin(login);
      if (normalized !== this.activeLogin) {
        this.activeLogin = normalized;
      }
      this.renderHistory();
    }

    extractLoginFromCard(card) {
      if (!card) return '';
      const dataset = card.dataset || {};
      const candidates = [
        dataset.username,
        dataset.user,
        dataset.login,
        dataset.userLogin
      ];
      for (const value of candidates) {
        if (value && value.trim()) {
          return value.trim();
        }
      }
      const nameSelectors = [
        '[data-a-target="viewer-card-user-name"]',
        '[data-test-selector="viewer-card-user-name"]',
        '[data-a-target="viewer-card-channel-link"]',
        'a[data-a-target="viewer-card-channel-link"]',
        'a[data-test-selector="viewer-card-channel-link"]',
        '[data-a-target="viewer-card"] header a[href^="/"]',
        'header a[href^="/"]'
      ];
      const element = this.querySelectors(this.collectRelatedRoots(card), nameSelectors);
      if (element && element.textContent) {
        return element.textContent.trim().replace(/^@/, '');
      }
      const link = this.querySelectors(this.collectRelatedRoots(card), ['a[href^="/"]']);
      if (link) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/([^/?#]+)/);
        if (match && match[1]) {
          return match[1];
        }
      }
      return '';
    }

    renderHistory() {
      if (!this.currentCard || !this.currentCard.isConnected || !this.activeLogin) {
        return;
      }
      this.rendering = true;
      const roots = this.collectRelatedRoots(this.currentCard);
      const host =
        this.querySelectors(roots, [
          '[data-test-selector="viewer-card-modal-body"]',
          '[data-test-selector="viewer-card-body"]',
          '[data-a-target="viewer-card-body"]',
          '.viewer-card__body',
          '.viewer-card-body'
        ]) || this.currentCard;
      if (!this.isValidViewerCardHost(host)) {
        this.rendering = false;
        return;
      }
      this.removeNativeRecentMessages(host);
      const history = this.tracker.getHistory(this.activeLogin);
      let container = host.querySelector('#tfr-viewer-history');
      const previousList = container?.querySelector('.tfr-viewer-history__list') || null;
      let previousScrollTop = 0;
      let previousScrollHeight = 0;
      let previousClientHeight = 0;
      if (previousList) {
        previousScrollTop = previousList.scrollTop;
        previousScrollHeight = previousList.scrollHeight;
        previousClientHeight = previousList.clientHeight;
      }
      if (!container) {
        container = document.createElement('div');
        container.id = 'tfr-viewer-history';
        container.className = 'tfr-viewer-history';
        host.appendChild(container);
      } else {
        container.innerHTML = '';
      }
      const title = document.createElement('h4');
      title.className = 'tfr-viewer-history__title';
      title.textContent = t('history.title');
      container.appendChild(title);
      if (!history.length) {
        this.rendering = false;
        return;
      }
      const list = document.createElement('ul');
      list.className = 'tfr-viewer-history__list';
      const entries = history.slice(-this.maxDisplayed);
      entries.forEach((entry) => {
        const item = document.createElement('li');
        item.className = 'tfr-viewer-history__item';
        const time = document.createElement('time');
        time.className = 'tfr-viewer-history__time';
        const date = new Date(entry.timestamp);
        time.dateTime = date.toISOString();
        try {
          time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
          time.textContent = `${date.getHours().toString().padStart(2, '0')}:${date
            .getMinutes()
            .toString()
            .padStart(2, '0')}`;
        }
        const message = document.createElement('span');
        message.className = 'tfr-viewer-history__message';
        message.textContent = entry.text;
        item.appendChild(time);
        item.appendChild(message);
        list.appendChild(item);
      });
      container.appendChild(list);
      const shouldStickToBottom =
        !previousList ||
        previousScrollHeight <= previousClientHeight + 1 ||
        previousScrollTop + previousClientHeight >= previousScrollHeight - 4;
      requestAnimationFrame(() => {
        if (shouldStickToBottom) {
          list.scrollTop = list.scrollHeight;
        } else if (previousScrollHeight) {
          const delta = list.scrollHeight - previousScrollHeight;
          list.scrollTop = Math.max(0, previousScrollTop + delta);
        }
        this.rendering = false;
      });
    }

    removeNativeRecentMessages(host) {
      if (!(host instanceof HTMLElement)) {
        return;
      }
      const selectors = [
        '[data-test-selector="recent-messages"]',
        '[data-test-selector="viewer-card-recent-messages"]',
        '[data-test-selector="viewer-card-recent-message"]',
        '[data-test-selector="viewer-card-recent-messages-header"]',
        '[data-test-selector="recent-messages-header"]',
        '.recent-messages',
        '.viewer-card__recent-messages',
        '.viewer-card__recent-message',
        '.viewer-card__recent-messages-header',
        '.viewer-card__recent-messages-container'
      ];
      selectors.forEach((selector) => {
        host.querySelectorAll(selector).forEach((node) => {
          if (!node) return;
          const removable =
            node.closest('[data-test-selector*="recent-messages"]') ||
            node.closest('.viewer-card__recent-messages-container') ||
            node.closest('section[data-test-selector*="recent"]') ||
            node;
          if (removable && removable !== host && removable.parentElement) {
            removable.parentElement.removeChild(removable);
          }
        });
      });
    }

    isValidViewerCardHost(element) {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const disqualify = [
        '[data-test-selector="whispers"]',
        '[data-test-selector="whispers-thread"]',
        '[data-test-selector="whisper-thread"]',
        '[data-test-selector="chat-whispers"]',
        '[data-a-target="whisper-thread"]',
        '.whispers-thread',
        '.whisper-thread',
        '.whispers'
      ];
      for (const selector of disqualify) {
        if (element.matches(selector) || element.closest(selector)) {
          return false;
        }
      }
      return true;
    }

    isValidViewerCardElement(element) {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      if (!this.isValidViewerCardHost(element)) {
        return false;
      }
      const dataset = element.dataset || {};
      if (dataset.aTarget === 'viewer-card' || dataset.testSelector === 'viewer-card') {
        return true;
      }
      if (element.matches('[data-a-target="viewer-card"], [data-test-selector="viewer-card"]')) {
        return true;
      }
      const layer = element.closest('[data-a-target="viewer-card-layer"], [data-test-selector="viewer-card-layer"]');
      if (layer) {
        return true;
      }
      if (element.classList.contains('viewer-card') || element.className.includes('viewer-card')) {
        const hasUserName = element.querySelector(
          '[data-a-target="viewer-card-user-name"], [data-test-selector="viewer-card-user-name"], [data-a-target="viewer-card-channel-link"]'
        );
        if (hasUserName) {
          return true;
        }
      }
      return false;
    }
  }

  class UpdateNotifier {
    constructor() {
      this.storageKey = UPDATE_STORAGE_KEY;
      this.apiUrl = UPDATE_REPO_API_URL;
      this.repoUrl = UPDATE_REPO_URL;
      this.checkInterval = UPDATE_CHECK_INTERVAL_MS;
      this.currentVersion = chrome.runtime?.getManifest?.().version || '0.0.0';
      this.banner = null;
    }

    async init() {
      if (!chrome?.storage?.local || typeof fetch !== 'function') {
        return;
      }
      try {
        await this.checkForUpdates();
      } catch (error) {
        console.warn('[TFR] update notifier init failed', error);
      }
    }

    async getState() {
      try {
        const stored = await chrome.storage.local.get(this.storageKey);
        const value = stored?.[this.storageKey];
        return value && typeof value === 'object' ? value : {};
      } catch (error) {
        console.warn('[TFR] update state read failed', error);
        return {};
      }
    }

    async setState(partial) {
      const state = await this.getState();
      const next = { ...state, ...partial };
      await chrome.storage.local.set({ [this.storageKey]: next });
      return next;
    }

    normalizeVersion(version) {
      return String(version || '')
        .trim()
        .replace(/^v/i, '');
    }

    parseVersion(version) {
      const cleaned = this.normalizeVersion(version);
      if (!cleaned) return [0];
      return cleaned.split('.').map((part) => {
        const match = String(part).match(/\d+/);
        return match ? Number(match[0]) : 0;
      });
    }

    isVersionNewer(remote, local) {
      const rParts = this.parseVersion(remote);
      const lParts = this.parseVersion(local);
      const length = Math.max(rParts.length, lParts.length);
      for (let i = 0; i < length; i += 1) {
        const r = rParts[i] ?? 0;
        const l = lParts[i] ?? 0;
        if (r > l) return true;
        if (r < l) return false;
      }
      return false;
    }

    canShowVersion(version, state, now = Date.now()) {
      if (!this.isVersionNewer(version, this.currentVersion)) {
        return false;
      }
      if (state.dismissedVersion === version) {
        return false;
      }
      if (state.snoozeUntil && now < state.snoozeUntil) {
        return false;
      }
      return true;
    }

    async checkForUpdates() {
      const now = Date.now();
      const state = await this.getState();
      if (state.latestVersion && this.canShowVersion(state.latestVersion, state, now)) {
        this.showBanner(state.latestVersion, state.releaseUrl, state.releaseNotes);
      }
      if (state.lastCheck && now - state.lastCheck < this.checkInterval) {
        return;
      }
      try {
        const response = await fetch(this.apiUrl, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-cache'
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const remoteVersion = this.normalizeVersion(payload?.tag_name || payload?.name);
        if (!remoteVersion) {
          await this.setState({ lastCheck: now });
          return;
        }
        const releaseUrl = payload?.html_url || this.repoUrl;
        const releaseNotes = (payload?.body || '').trim();
        const previousVersion = state.latestVersion;
        const nextState = {
          ...state,
          lastCheck: now,
          latestVersion: remoteVersion,
          releaseUrl,
          releaseNotes
        };
        if (previousVersion !== remoteVersion) {
          nextState.dismissedVersion = null;
          nextState.snoozeUntil = null;
        }
        await chrome.storage.local.set({ [this.storageKey]: nextState });
        if (this.canShowVersion(remoteVersion, nextState, now)) {
          this.showBanner(remoteVersion, releaseUrl, releaseNotes);
        } else if (this.banner) {
          this.removeBanner();
        }
      } catch (error) {
        console.warn('[TFR] update check failed', error);
      }
    }

    removeBanner() {
      if (this.banner?.parentElement) {
        this.banner.parentElement.removeChild(this.banner);
      }
      this.banner = null;
    }

    async dismissVersion(version) {
      await this.setState({ dismissedVersion: version, snoozeUntil: null });
      this.removeBanner();
    }

    async snooze(hours = 6) {
      const until = Date.now() + hours * 60 * 60 * 1000;
      await this.setState({ snoozeUntil: until });
      this.removeBanner();
    }

    showBanner(version, url, notes) {
      if (this.banner || !document?.body) {
        return;
      }
      const banner = document.createElement('aside');
      banner.className = 'tfr-update-banner';

      const header = document.createElement('div');
      header.className = 'tfr-update-banner__header';

      const title = document.createElement('p');
      title.className = 'tfr-update-banner__title';
      title.textContent = 'Nouvelle mise a jour disponible';
      header.appendChild(title);

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'tfr-update-banner__close';
      closeButton.setAttribute('aria-label', 'Fermer la notification de mise a jour');
      closeButton.textContent = 'X';
      closeButton.addEventListener('click', () => this.snooze());
      header.appendChild(closeButton);

      const body = document.createElement('p');
      body.className = 'tfr-update-banner__body';
      const summaryLine = (notes || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length);
      const description = summaryLine ? `Notes : ${summaryLine}` : 'Consultez GitHub pour telecharger la derniere version.';
      body.textContent = `Version ${version} est disponible. ${description}`;

      const actions = document.createElement('div');
      actions.className = 'tfr-update-banner__actions';

      const primary = document.createElement('button');
      primary.type = 'button';
      primary.className = 'tfr-update-banner__button tfr-update-banner__button--primary';
      primary.textContent = 'Ouvrir GitHub';
      primary.addEventListener('click', () => {
        try {
          window.open(url || this.repoUrl, '_blank', 'noopener');
        } catch {
          window.location.href = url || this.repoUrl;
        } finally {
          this.dismissVersion(version);
        }
      });

      const later = document.createElement('button');
      later.type = 'button';
      later.className = 'tfr-update-banner__button tfr-update-banner__button--ghost';
      later.textContent = 'Plus tard';
      later.addEventListener('click', () => this.snooze());

      actions.appendChild(primary);
      actions.appendChild(later);

      banner.appendChild(header);
      banner.appendChild(body);
      banner.appendChild(actions);

      document.body.appendChild(banner);
      this.banner = banner;
    }
  }

  class SidebarRenderer {
    constructor(store) {
      this.store = store;
      this.container = null;
      this.sideNavObserver = null;
      this.unsubscribe = null;
    }

    init() {
      this.unsubscribe = this.store.subscribe(() => this.render());
      this.observeSideNav();
      this.render();
    }

    dispose() {
      this.unsubscribe?.();
      this.sideNavObserver?.disconnect();
    }

    observeSideNav() {
      this.sideNavObserver?.disconnect();
      this.sideNavObserver = new MutationObserver(() => {
        this.ensureContainer();
      });
      this.sideNavObserver.observe(document.body, { childList: true, subtree: true });
      this.ensureContainer();
    }

    getNav() {
      return (
        document.querySelector('nav[data-a-target="side-nav"]') ||
        document.querySelector('nav[data-test-selector="side-nav"]') ||
        document.querySelector('div.side-nav') ||
        document.querySelector('[data-test-selector="side-nav"]')
      );
    }

    getSection(nav) {
      if (!nav) return null;
      const selectors = [
        'section[data-test-selector="followed-side-nav-section"]',
        'section[data-a-target="side-nav-section"]',
        'section[aria-label="Followed Channels"]',
        'section[aria-label="Chaines suivies"]',
        'section[data-test-selector="side-nav-section"]'
      ];
      for (const selector of selectors) {
        const candidate = nav.querySelector(selector);
        if (candidate) return candidate;
      }
      return nav.querySelector('section') || nav;
    }

    getList(section) {
      if (!section) return null;
      const selectors = [
        '[data-test-selector="followed-side-nav-section__items"]',
        '[data-test-selector="side-nav-section__items"]',
        '.side-nav-section__items',
        '[role="list"]',
        'ul',
        '.simplebar-content > div',
        '[data-simplebar] > div'
      ];
      for (const selector of selectors) {
        const candidate = section.querySelector(selector);
        if (candidate) return candidate;
      }
      return section;
    }

    getModernPinnedHost() {
      const candidates = Array.from(document.querySelectorAll('div.Layout-sc-1xcs6mc-0.gDDWxy'));
      for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement)) continue;
        const sideNav = candidate.closest(
          '.side-nav, [data-test-selector="side-nav"], nav[data-a-target="side-nav"], nav[data-test-selector="side-nav"]'
        );
        if (!sideNav) continue;
        return candidate;
      }
      return null;
    }

    getModernInsertionTarget(wrapper) {
      if (!(wrapper instanceof HTMLElement)) {
        return null;
      }
      const selectors = [
        '[data-test-selector="side-nav"] [data-test-selector="followed-side-nav-section__items"]',
        '[data-test-selector="side-nav"] [data-test-selector="side-nav-section__items"]',
        '[data-test-selector="side-nav"] [role="list"]',
        '[data-test-selector="side-nav"] nav',
        '[data-test-selector="side-nav"]',
        '.side-nav__new [data-test-selector="side-nav-section__items"]',
        '.side-nav__new [role="list"]',
        '.side-nav__new',
        '.scrollable-area__content',
        '.simplebar-content > div',
        '[role="list"]'
      ];
      for (const selector of selectors) {
        try {
          const candidate = wrapper.querySelector(selector);
          if (candidate instanceof HTMLElement && !candidate.closest('#tfr-favorites-root')) {
            return candidate;
          }
        } catch (error) {
          // ignore invalid selectors on dynamic DOM
        }
      }
      return wrapper;
    }

    ensureContainer() {
      const modernWrapper = this.getModernPinnedHost();
      let targetParent = null;
      let needsListItem = false;

      if (modernWrapper) {
        targetParent = this.getModernInsertionTarget(modernWrapper);
        if (!targetParent) {
          this.container = null;
          return;
        }
        if (modernWrapper instanceof HTMLElement) {
          modernWrapper.style.pointerEvents = 'auto';
        }
        if (targetParent instanceof HTMLElement && targetParent !== modernWrapper) {
          targetParent.style.pointerEvents = 'auto';
        }
      } else {
        const nav = this.getNav();
        if (!nav) {
          this.container = null;
          return;
        }
        const section = this.getSection(nav);
        const list = this.getList(section);
        if (!list) {
          this.container = null;
          return;
        }
        nav.style.pointerEvents = 'auto';
        if (section && section !== nav) section.style.pointerEvents = 'auto';
        if (list && list !== nav && list !== section) list.style.pointerEvents = 'auto';
        targetParent = list;
        needsListItem = list.tagName === 'UL' || list.getAttribute('role') === 'list';
      }

      if (!(targetParent instanceof HTMLElement)) {
        this.container = null;
        return;
      }

      if (
        !needsListItem &&
        (targetParent.tagName === 'UL' ||
          targetParent.tagName === 'OL' ||
          targetParent.getAttribute('role') === 'list')
      ) {
        needsListItem = true;
      }

      const desiredTag = needsListItem ? 'li' : 'div';
      const candidates = Array.from(document.querySelectorAll('#tfr-favorites-root'));
      let container =
        candidates.find((node) => node.parentElement === targetParent) ||
        candidates.find((node) => node.tagName.toLowerCase() === desiredTag) ||
        candidates[0] ||
        null;

      if (container && container.tagName.toLowerCase() !== desiredTag) {
        const replacement = document.createElement(desiredTag);
        replacement.id = 'tfr-favorites-root';
        replacement.className = 'tfr-favorites-root';
        while (container.firstChild) {
          replacement.appendChild(container.firstChild);
        }
        container.replaceWith(replacement);
        container = replacement;
      }

      if (!container) {
        container = document.createElement(desiredTag);
        container.id = 'tfr-favorites-root';
        container.className = 'tfr-favorites-root';
      }

      if (container.parentElement !== targetParent) {
        targetParent.insertBefore(container, targetParent.firstChild || null);
      }

      container.className = 'tfr-favorites-root';
      if (needsListItem) {
        container.classList.add('tfr-favorites-root--list-item', 'side-nav-card');
      } else {
        container.classList.remove('tfr-favorites-root--list-item', 'side-nav-card');
      }

      if (modernWrapper) {
        container.classList.add('tfr-favorites-root--modern');
      } else {
        container.classList.remove('tfr-favorites-root--modern');
      }

      container.style.pointerEvents = 'auto';

      document.querySelectorAll('#tfr-favorites-root').forEach((node) => {
        if (node !== container) {
          node.remove();
        }
      });

      this.container = container;
    }

    collectGroups(state, liveData) {
      const sortMode = state.preferences?.sortMode || 'viewersDesc';
      const categoryTree = this.store.getCategoriesTree();
      const validCategoryIds = new Set();
      const collectIds = (nodes) => {
        nodes.forEach((node) => {
          validCategoryIds.add(node.id);
          if (node.children && node.children.length) {
            collectIds(node.children);
          }
        });
      };
      collectIds(categoryTree);
      const favorites = Object.values(state.favorites);
      const assignments = new Map();
      const uncategorized = [];
      favorites.forEach((fav) => {
        const categoryId = Array.isArray(fav.categories) && fav.categories.length ? fav.categories[0] : null;
        if (!categoryId || !validCategoryIds.has(categoryId)) {
          uncategorized.push(fav);
          return;
        }
        if (!assignments.has(categoryId)) {
          assignments.set(categoryId, []);
        }
        assignments.get(categoryId).push(fav);
      });
      const comparator = (a, b) => {
        if (sortMode === 'alphabetical') return a.displayName.localeCompare(b.displayName, 'fr');
        if (sortMode === 'recent') return (b.addedAt || 0) - (a.addedAt || 0);
        const viewersA = liveData[a.login]?.viewers || 0;
        const viewersB = liveData[b.login]?.viewers || 0;
        if (viewersB !== viewersA) return viewersB - viewersA;
        return a.displayName.localeCompare(b.displayName, 'fr');
      };
      const buildNode = (node) => {
        const children = node.children.map((child) => buildNode(child)).filter(Boolean);
        const rawEntries = assignments.get(node.id) || [];
        const entries = rawEntries
          .filter((fav) => shouldDisplayFavorite(fav, liveData[fav.login]))
          .sort(comparator);
        const totalEntries = entries.length + children.reduce((sum, child) => sum + child.totalEntries, 0);
        if (!totalEntries) {
          return null;
        }
        return {
          id: node.id,
          name: node.name,
          collapsed: node.collapsed,
          parentId: node.parentId,
          entries,
          children,
          totalEntries
        };
      };
      const groups = [];
      categoryTree.forEach((root) => {
        const built = buildNode(root);
        if (built) {
          groups.push(built);
        }
      });
      const preferences = state.preferences || {};
      if (preferences.recentLiveEnabled) {
        const thresholdMinutes = Number(preferences.recentLiveThresholdMinutes);
        const sanitizedMinutes = Number.isFinite(thresholdMinutes) ? Math.max(1, Math.min(120, Math.round(thresholdMinutes))) : 10;
        const thresholdMs = sanitizedMinutes * 60000;
        const now = Date.now();
        const recentEntries = favorites
          .filter((fav) => fav.recentHighlightEnabled !== false)
          .filter((fav) => shouldDisplayFavorite(fav, liveData[fav.login]))
          .filter((fav) => {
            const live = liveData[fav.login];
            if (!live?.isLive) {
              return false;
            }
            const startedAt = live.startedAt ? Date.parse(live.startedAt) : NaN;
            const filterMatchSince = Number.isFinite(fav.filterMatchSince) && fav.filterMatchSince > 0 ? fav.filterMatchSince : 0;
            let referenceTimestamp = Number.isFinite(startedAt) ? startedAt : NaN;
            if (filterMatchSince) {
              if (!Number.isFinite(referenceTimestamp) || filterMatchSince > referenceTimestamp) {
                referenceTimestamp = filterMatchSince;
              }
            }
            if (!Number.isFinite(referenceTimestamp)) {
              return false;
            }
            const diff = now - referenceTimestamp;
            return diff >= 0 && diff <= thresholdMs;
          })
          .sort(comparator);
        if (recentEntries.length) {
          groups.unshift({
            id: 'recentLive',
            name: t('recent.sectionTitle'),
            collapsed: Boolean(preferences.recentLiveCollapsed),
            parentId: null,
            entries: recentEntries,
            children: [],
            totalEntries: recentEntries.length,
            isRecentLive: true
          });
        }
      }
      const uncategorizedEntries = uncategorized
        .filter((fav) => shouldDisplayFavorite(fav, liveData[fav.login]))
        .sort(comparator);
      if (uncategorizedEntries.length) {
        groups.push({
          id: 'uncategorized',
          name: 'Sans cat\u00e9gorie',
          collapsed: Boolean(state.preferences?.uncategorizedCollapsed),
          entries: uncategorizedEntries,
          children: [],
          totalEntries: uncategorizedEntries.length,
          isUncategorized: true
        });
      }
      return groups;
    }

    createFavoriteEntry(fav, liveData) {
      const live = liveData[fav.login];
      const anchor = document.createElement('a');
      anchor.className = 'tfr-favorite-entry';
      anchor.classList.add('side-nav-card__link', 'tw-link');
      anchor.href = `https://www.twitch.tv/${fav.login}`;
      anchor.target = '_self';
      anchor.rel = 'noopener noreferrer';
      if (live?.title) {
        anchor.title = live.title;
      } else if (live?.displayName) {
        anchor.title = live.displayName;
      } else {
        anchor.title = fav.displayName;
      }

      const avatar = document.createElement('img');
      avatar.className = 'tfr-favorite-entry__avatar';
      avatar.src = (live && live.avatarUrl) || fav.avatarUrl || DEFAULT_AVATAR;
      avatar.alt = fav.displayName;

      const info = document.createElement('div');
      info.className = 'tfr-favorite-entry__info';
      const nameLine = document.createElement('span');
      nameLine.className = 'tfr-favorite-entry__name';
      nameLine.textContent = live?.displayName || fav.displayName;
      const categoryLine = document.createElement('span');
      categoryLine.className = 'tfr-favorite-entry__category';
      categoryLine.textContent = live?.game || '';
      const viewerLine = document.createElement('span');
      viewerLine.className = 'tfr-favorite-entry__viewers';
      viewerLine.textContent = t('sidebar.viewerCount', { count: formatViewers(live?.viewers || 0) });
      info.appendChild(nameLine);
      if (categoryLine.textContent) {
        info.appendChild(categoryLine);
      }
      info.appendChild(viewerLine);
      anchor.appendChild(avatar);
      anchor.appendChild(info);
      return anchor;
    }

    render() {
      if (!this.container || !document.body.contains(this.container)) {
        this.ensureContainer();
        if (!this.container) return;
      }

      const state = this.store.getState();
      const liveData = this.store.getLiveData();
    const groups = this.collectGroups(state, liveData);
    const totalLive = groups.reduce((sum, group) => sum + group.totalEntries, 0);
    const isCollapsed = Boolean(state.preferences?.liveFavoritesCollapsed);

      if (!window.__tfrRenderLogged) {
        console.log('[TFR] rendering favorites sidebar');
        window.__tfrRenderLogged = true;
      }
      this.container.innerHTML = '';
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'tfr-nav-header';
    if (isCollapsed) header.classList.add('is-collapsed');
    header.textContent = totalLive
      ? t('sidebar.live.headerWithCount', { count: totalLive })
      : t('sidebar.live.header');
    header.setAttribute('aria-expanded', String(!isCollapsed));
    header.addEventListener('click', () => this.store.toggleLiveFavoritesCollapsed());
    this.container.appendChild(header);

    if (!totalLive) {
      const empty = document.createElement('div');
      empty.className = 'tfr-empty';
      empty.textContent = t('sidebar.live.empty');
      this.container.appendChild(empty);
      return;
    }

    if (isCollapsed) {
      const collapsedNotice = document.createElement('div');
      collapsedNotice.className = 'tfr-empty';
      collapsedNotice.textContent = t('sidebar.live.collapsedNotice');
      this.container.appendChild(collapsedNotice);
      return;
    }

    const renderGroup = (group, depth = 0) => {
      const block = document.createElement('div');
      block.className = 'tfr-category-block';
      block.dataset.depth = String(depth);
      if (group.collapsed) block.classList.add('is-collapsed');
      if (group.isRecentLive) block.classList.add('tfr-category-block--recent');

      const headerRow = document.createElement('button');
      headerRow.type = 'button';
      headerRow.className = 'tfr-category-header';
      if (group.isRecentLive) headerRow.classList.add('tfr-category-header--recent');
      headerRow.style.paddingLeft = `${12 + depth * 16}px`;
      const label = document.createElement('span');
      label.className = 'tfr-category-header-label';
      const chevron = document.createElement('span');
      chevron.className = 'tfr-chevron';
      chevron.textContent = '>';
      chevron.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.textContent = group.name;
      const count = document.createElement('span');
      count.className = 'tfr-category-count';
      count.textContent = `${group.totalEntries}`;
      label.appendChild(chevron);
      label.appendChild(name);
      headerRow.appendChild(label);
      headerRow.appendChild(count);
      headerRow.setAttribute('aria-expanded', String(!group.collapsed));
      headerRow.addEventListener('click', () => {
        if (group.isRecentLive) {
          this.store.toggleRecentLiveCollapsed();
        } else if (group.isUncategorized) {
          this.store.setUncategorizedCollapsed(!group.collapsed);
        } else {
          this.store.toggleCategoryCollapse(group.id);
        }
      });

      block.appendChild(headerRow);
      if (group.entries.length) {
        const list = document.createElement('div');
        list.className = 'tfr-category-list';
        list.style.paddingLeft = `${depth * 16}px`;
        group.entries.forEach((fav) => {
          list.appendChild(this.createFavoriteEntry(fav, liveData));
        });
        block.appendChild(list);
      }
      if (group.children && group.children.length) {
        const childContainer = document.createElement('div');
        childContainer.className = 'tfr-subcategory-container';
        group.children.forEach((child) => {
          const childBlock = renderGroup(child, depth + 1);
          if (childBlock) {
            childContainer.appendChild(childBlock);
          }
        });
        block.appendChild(childContainer);
      }
      return block;
    };

    groups.forEach((group) => {
      const block = renderGroup(group, 0);
      if (block) {
        this.container.appendChild(block);
      }
    });
    }
  }

  class ChannelFavoriteButton {
    constructor(store) {
      this.store = store;
      this.button = null;
      this.currentLogin = null;
      this.unsubscribe = null;
      this.domObserver = null;
      this.locationWatcher = new LocationWatcher(() => this.handleLocationChange());
    }

    init() {
      this.unsubscribe = this.store.subscribe(() => this.updateButtonAppearance());
      this.observeDom();
      this.locationWatcher.start();
      this.handleLocationChange();
    }

    dispose() {
      this.unsubscribe?.();
      this.domObserver?.disconnect();
      this.locationWatcher.stop();
    }

    observeDom() {
      this.domObserver?.disconnect();
      this.domObserver = new MutationObserver(() => {
        this.tryMountButton();
      });
      this.domObserver.observe(document.body, { childList: true, subtree: true });
      this.tryMountButton();
    }

    handleLocationChange() {
      this.currentLogin = getChannelFromLocation(window.location);
      this.updateButtonAppearance();
      this.tryMountButton();
    }

    findAnchor() {
      const selectors = [
        '[data-a-target="player-overlay-notifications-toggle-button"]',
        '[data-a-target="player-notifications-toggle-button"]',
        '[data-a-target="notifications-toggle-button"]',
        '[data-a-target="stream-notifications-toggle-button"]',
        '[data-a-target="player-control-notifications-button"]',
        '[data-test-selector="player-notifications-button"]',
        '[data-test-selector="player-overlay-notifications-button"]',
        '[data-test-selector="notifications-button"]'
      ];
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node && !node.closest('nav')) {
          return node;
        }
      }
      const buttons = Array.from(document.querySelectorAll('button[aria-label]'));
      const primary = buttons.find((btn) => {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        return label.includes('notification') && !btn.closest('nav');
      });
      if (primary) {
        return primary;
      }
      const containerSelectors = [
        '[data-test-selector="player-overlay-channel-status"]',
        '[data-test-selector="channel-info-bar"]',
        '[data-test-selector="player-overlay-follow-button"]',
        '[data-test-selector="player-actions"]'
      ];
      for (const selector of containerSelectors) {
        const container = document.querySelector(selector);
        if (!container) continue;
        const candidate = container.querySelector('button');
        if (candidate && !candidate.closest('nav')) {
          return candidate;
        }
      }
      return null;
    }

    ensureButton() {
      if (this.button) return this.button;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tfr-inline-button';
      button.style.marginLeft = '8px';
      button.style.marginTop = '0';
      button.style.alignSelf = 'center';
      button.style.pointerEvents = 'auto';
      button.textContent = '';
      button.innerHTML = '<svg class="tfr-inline-button__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.46 13.97 5.82 21z"></path></svg>';
      const stopHoverPropagation = (event) => {
        event.stopPropagation();
      };
      ['pointerenter', 'pointerover', 'mouseenter', 'mouseover', 'mouseleave', 'pointerleave'].forEach((eventName) => {
        button.addEventListener(eventName, stopHoverPropagation, true);
      });
      button.addEventListener('click', async () => {
        if (!this.currentLogin) return;
        const normalized = this.currentLogin.toLowerCase();
        const isFavorite = Boolean(this.store.getState().favorites[normalized]);
        button.disabled = true;
        try {
          if (isFavorite) await this.store.removeFavorite(normalized);
          else await this.store.addFavorite(normalized);
        } finally {
          button.disabled = false;
          this.updateButtonAppearance();
        }
      });
      this.button = button;
      return button;
    }

    tryMountButton() {
      if (!this.currentLogin) {
        this.removeButton();
        return;
      }
      const anchor = this.findAnchor();
      if (!anchor || !anchor.parentElement) {
        this.removeButton();
        return;
      }
      const button = this.ensureButton();
      if (anchor.parentElement.contains(button)) return;
      anchor.parentElement.appendChild(button);
      this.updateButtonAppearance();
    }

    removeButton() {
      if (this.button?.parentElement) {
        this.button.parentElement.removeChild(this.button);
      }
    }

    updateButtonAppearance() {
      const button = this.button;
      if (!button) return;
      if (!this.currentLogin) {
        button.disabled = true;
        button.classList.remove('is-remove');
        button.textContent = t('sidebar.live.unavailable');
        return;
      }
      const normalized = this.currentLogin.toLowerCase();
      const isFavorite = Boolean(this.store.getState().favorites[normalized]);
      button.disabled = false;
        if (isFavorite) {
          button.classList.add('is-remove');
          button.innerHTML = '<svg class="tfr-inline-button__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.46 13.97 5.82 21z"></path></svg>';
        } else {
          button.classList.remove('is-remove');
          button.innerHTML = '<svg class="tfr-inline-button__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.46 13.97 5.82 21z"></path></svg>';
        }
    }
  }


class FavoritesOverlay {
  constructor(store) {
    this.store = store;
    this.root = null;
    this.isOpen = false;
    this.openListeners = new Set();
    this.closeListeners = new Set();
    this.searchTerm = '';
    this.sortMode = this.store.getState().preferences?.sortMode || 'viewersDesc';
    this.backupInput = null;
    this.isImportingBackup = false;
    this.draggedLogin = null;
    this.activeFavoriteLogin = null;
    this.categorySuggestionCache = new Map();
    this.unsubscribe = this.store.subscribe(() => {
      if (this.isOpen) {
        this.render();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  ensureRoot() {
    if (this.root) {
      return;
    }
    const backdrop = document.createElement('div');
    backdrop.className = 'tfr-overlay-backdrop';
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        this.close();
      }
    });
    const panel = document.createElement('div');
    panel.className = 'tfr-overlay-panel';
    const header = document.createElement('div');
    header.className = 'tfr-overlay-header';
    const title = document.createElement('h2');
    title.className = 'tfr-overlay-title';
    title.textContent = t('manager.title');
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'tfr-overlay-close';
    closeButton.setAttribute('aria-label', t('common.closeAction'));
    closeButton.textContent = '\u00D7';
    closeButton.addEventListener('click', () => this.close());
    header.appendChild(title);
    header.appendChild(closeButton);
    const content = document.createElement('div');
    content.className = 'tfr-overlay-content';
    panel.appendChild(header);
    panel.appendChild(content);
    backdrop.appendChild(panel);
    this.root = backdrop;
  }

  open() {
    this.ensureRoot();
    if (!this.root) {
      return;
    }
    let didOpen = false;
    if (!this.isOpen) {
      document.body.appendChild(this.root);
      this.isOpen = true;
      didOpen = true;
    }
    const state = this.store.getState();
    this.sortMode = state.preferences?.sortMode || 'viewersDesc';
    this.render();
    if (didOpen) {
      this.openListeners.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.error('[TFR] Overlay open listener error', error);
        }
      });
    }
  }


  close() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.root?.remove();
    this.backupInput = null;
    this.draggedLogin = null;
    this.activeFavoriteLogin = null;
    this.closeListeners.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[TFR] Overlay close listener error', error);
      }
    });
  }

  onOpen(callback) {
    this.openListeners.add(callback);
    return () => this.openListeners.delete(callback);
  }

  onClose(callback) {
    this.closeListeners.add(callback);
    return () => this.closeListeners.delete(callback);
  }


  render() {
    if (!this.root) {
      return;
    }
    const state = this.store.getState();
    const liveData = this.store.getLiveData();
    this.sortMode = state.preferences?.sortMode || this.sortMode;

    const content = this.root.querySelector('.tfr-overlay-content');
    const previousScrollTop = content.scrollTop;
    const previousScrollLeft = content.scrollLeft;
    content.innerHTML = '';

    const controls = document.createElement('div');
    controls.className = 'tfr-manager-controls';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = t('search.placeholder');
    searchInput.value = this.searchTerm;
    searchInput.addEventListener('input', (event) => {
      this.searchTerm = event.target.value;
      this.render();
    });
    const sortSelect = document.createElement('select');
    [
      { value: 'viewersDesc', label: t('sort.viewersDesc') },
      { value: 'alphabetical', label: t('sort.alphabetical') },
      { value: 'recent', label: t('sort.recent') }
    ].forEach(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      sortSelect.appendChild(option);
    });
    sortSelect.value = this.sortMode;
    sortSelect.addEventListener('change', async (event) => {
      const value = event.target.value;
      this.sortMode = value;
      await this.store.setSortMode(value);
      this.render();
    });
    controls.appendChild(searchInput);
    controls.appendChild(sortSelect);
    controls.appendChild(this.renderBackupControls());
    content.appendChild(controls);

    const recentSettings = this.renderRecentLiveSettings(state);
    if (recentSettings) {
      content.appendChild(recentSettings);
    }

    const toastSettings = this.renderToastSettings(state);
    if (toastSettings) {
      content.appendChild(toastSettings);
    }

    const featureToggles = this.renderFeatureToggles(state);
    if (featureToggles) {
      content.appendChild(featureToggles);
    }

    const board = this.renderBoard(state, liveData);
    content.appendChild(board);

    this.renderFavoriteDetailsPanel(state, liveData);
    requestAnimationFrame(() => {
      if (!content.isConnected) {
        return;
      }
      if (content.scrollTop !== previousScrollTop) {
        content.scrollTop = previousScrollTop;
      }
      if (content.scrollLeft !== previousScrollLeft) {
        content.scrollLeft = previousScrollLeft;
      }
    });
  }

  renderRecentLiveSettings(state) {
    const prefs = state.preferences || {};
    const wrapper = document.createElement('section');
    wrapper.className = 'tfr-recent-live-settings';

    const rawThreshold = Number(prefs.recentLiveThresholdMinutes);
    const currentThreshold = Number.isFinite(rawThreshold)
      ? Math.max(1, Math.min(120, Math.round(rawThreshold)))
      : 10;

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'tfr-recent-live-toggle';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'tfr-recent-live-toggle__input';
    toggle.checked = Boolean(prefs.recentLiveEnabled);
    const toggleId = 'tfr-recent-live-toggle';
    toggle.id = toggleId;
    toggleLabel.setAttribute('for', toggleId);
    const toggleText = document.createElement('span');
    toggleText.textContent = t('recent.toggle');
    toggleLabel.appendChild(toggle);
    toggleLabel.appendChild(toggleText);
    wrapper.appendChild(toggleLabel);

    const thresholdWrapper = document.createElement('div');
    thresholdWrapper.className = 'tfr-recent-live-threshold';
    const thresholdLabel = document.createElement('label');
    thresholdLabel.textContent = t('recent.maxDurationLabel');
    thresholdWrapper.appendChild(thresholdLabel);
    const thresholdInput = document.createElement('input');
    thresholdInput.type = 'number';
    thresholdInput.min = '1';
    thresholdInput.max = '120';
    thresholdInput.value = String(currentThreshold);
    thresholdInput.className = 'tfr-recent-live-threshold__input';
    thresholdInput.disabled = !toggle.checked;
    const thresholdInputId = 'tfr-recent-live-threshold';
    thresholdInput.id = thresholdInputId;
    thresholdLabel.setAttribute('for', thresholdInputId);
    thresholdWrapper.appendChild(thresholdInput);
    const thresholdSuffix = document.createElement('span');
    thresholdSuffix.textContent = t('recent.maxDurationUnit');
    thresholdWrapper.appendChild(thresholdSuffix);
    wrapper.appendChild(thresholdWrapper);

    const hint = document.createElement('p');
    hint.className = 'tfr-recent-live-hint';
    hint.textContent = t('recent.hint');
    wrapper.appendChild(hint);

    toggle.addEventListener('change', async (event) => {
      const enabled = event.target.checked;
      thresholdInput.disabled = !enabled;
      await this.store.setRecentLiveEnabled(enabled);
      this.render();
    });

    thresholdInput.addEventListener('change', async (event) => {
      const parsed = Number(event.target.value);
      if (!Number.isFinite(parsed)) {
        event.target.value = String(currentThreshold);
        return;
      }
      const sanitized = Math.max(1, Math.min(120, Math.round(parsed)));
      event.target.value = String(sanitized);
      await this.store.setRecentLiveThreshold(sanitized);
      this.render();
    });

    return wrapper;
  }

  renderToastSettings(state) {
    const prefs = state.preferences || {};
    const wrapper = document.createElement('section');
    wrapper.className = 'tfr-toast-settings';

    const title = document.createElement('h3');
    title.className = 'tfr-toast-settings__title';
    title.textContent = t('toast.settings.title');
    wrapper.appendChild(title);

    const controls = document.createElement('div');
    controls.className = 'tfr-toast-settings__controls';
    const label = document.createElement('label');
    label.textContent = t('toast.settings.durationLabel');
    controls.appendChild(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '2';
    input.max = '60';
    const current = Number.isFinite(Number(prefs.toastDurationSeconds))
      ? Math.max(2, Math.min(60, Math.round(Number(prefs.toastDurationSeconds))))
      : 6;
    input.value = String(current);
    input.className = 'tfr-toast-settings__input';
    const inputId = 'tfr-toast-settings-duration';
    input.id = inputId;
    label.setAttribute('for', inputId);
    controls.appendChild(input);

    const unit = document.createElement('span');
    unit.textContent = t('toast.settings.durationUnit');
    controls.appendChild(unit);

    wrapper.appendChild(controls);

    const hint = document.createElement('p');
    hint.className = 'tfr-toast-settings__hint';
    hint.textContent = t('toast.settings.hint');
    wrapper.appendChild(hint);

    input.addEventListener('change', async (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) {
        event.target.value = String(current);
        return;
      }
      const sanitized = Math.max(2, Math.min(60, Math.round(value)));
      event.target.value = String(sanitized);
      await this.store.setToastDuration(sanitized);
      this.render();
    });

    return wrapper;
  }

  renderFeatureToggles(state) {
    const prefs = state.preferences || {};
    const wrapper = document.createElement('section');
    wrapper.className = 'tfr-feature-toggles';

    const toggles = [
      {
        key: 'chatHistoryEnabled',
        label: t('settings.chatHistory.toggle'),
        handler: async (checked) => {
          await this.store.setChatHistoryEnabled(checked);
          this.render();
        }
      },
      {
        key: 'moderationHistoryEnabled',
        label: t('settings.moderation.toggle'),
        handler: async (checked) => {
          await this.store.setModerationHistoryEnabled(checked);
          this.render();
        }
      }
    ];

    toggles.forEach((toggleConfig) => {
      const item = document.createElement('label');
      item.className = 'tfr-feature-toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = prefs[toggleConfig.key] !== false;
      input.className = 'tfr-feature-toggle__input';
      item.appendChild(input);
      const text = document.createElement('span');
      text.textContent = toggleConfig.label;
      item.appendChild(text);
      input.addEventListener('change', (event) => {
        toggleConfig.handler(Boolean(event.target.checked));
      });
      wrapper.appendChild(item);
    });

    return wrapper;
  }

  async getCategorySuggestions(term) {
    const normalized = normalizeCategoryName(term);
    if (!normalized || normalized.length < 2) {
      return [];
    }
    if (this.categorySuggestionCache.has(normalized)) {
      return this.categorySuggestionCache.get(normalized);
    }
    const results = await fetchCategorySuggestions(term, 20);
    const unique = [];
    const seen = new Set();
    results.forEach((name) => {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      const key = normalizeCategoryName(trimmed);
      if (!trimmed || !key || seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push(trimmed);
    });
    this.categorySuggestionCache.set(normalized, unique);
    return unique;
  }

  renderBoard(state, liveData) {
    const board = document.createElement('div');
    board.className = 'tfr-board';
    const term = this.searchTerm.trim().toLowerCase();
    board.appendChild(this.renderFreeFavoritesColumn(state, liveData, term));
    board.appendChild(this.renderCategoriesColumn(state, liveData, term));
    return board;
  }

  renderFreeFavoritesColumn(state, liveData, term) {
    const column = document.createElement('section');
    column.className = 'tfr-board-column tfr-board-column--free';
    const sticky = document.createElement('div');
    sticky.className = 'tfr-free-sticky';
    column.appendChild(sticky);

    const title = document.createElement('h3');
    title.className = 'tfr-board-title';
    title.textContent = t('available.title');
    sticky.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'tfr-board-subtitle';
    subtitle.textContent = t('available.subtitle');
    sticky.appendChild(subtitle);

    const grid = document.createElement('div');
    grid.className = 'tfr-free-grid';

    const freeFavorites = Object.values(state.favorites)
      .filter((fav) => {
        const categoryId = Array.isArray(fav.categories) && fav.categories.length ? fav.categories[0] : null;
        if (categoryId) {
          return false;
        }
        if (!term) {
          return true;
        }
        const label = (fav.displayName || fav.login || '').toLowerCase();
        return label.includes(term);
      })
      .sort((a, b) => (a.displayName || a.login).localeCompare(b.displayName || b.login, 'fr'));

    if (!freeFavorites.length) {
      const empty = document.createElement('div');
      empty.className = 'tfr-empty-state';
      empty.textContent = term ? t('available.emptyFiltered') : t('available.emptyAll');
      grid.appendChild(empty);
    } else {
      freeFavorites.forEach((fav) => {
        const chip = this.createFavoriteChip(fav, liveData);
        grid.appendChild(chip);
      });
    }

    sticky.appendChild(grid);
    this.enableUncategorizedDrop(grid);
    return column;
  }

  createFavoriteChip(fav, liveData) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tfr-free-avatar';
    button.title = fav.displayName || fav.login;

    const img = document.createElement('img');
    img.src = (liveData[fav.login]?.avatarUrl) || fav.avatarUrl || DEFAULT_AVATAR;
    img.alt = '';
    button.appendChild(img);

    const label = document.createElement('span');
    label.className = 'tfr-visually-hidden';
    label.textContent = fav.displayName || fav.login;
    button.appendChild(label);

    this.makeFavoriteDraggable(button, fav.login);
    return button;
  }

  renderCategoriesColumn(state, liveData, term) {
    const column = document.createElement('section');
    column.className = 'tfr-board-column tfr-board-column--categories';

    const header = document.createElement('div');
    header.className = 'tfr-board-header';

    const title = document.createElement('h3');
    title.className = 'tfr-board-title';
    title.textContent = t('categories.panel.title');
    header.appendChild(title);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'tfr-chip-action';
    addButton.textContent = t('categories.panel.new');
    addButton.addEventListener('click', async () => {
      const name = window.prompt(t('prompts.newCategory'));
      if (!name) return;
      await this.store.createCategory(name);
      this.render();
    });
    header.appendChild(addButton);

    column.appendChild(header);

    const categoriesTree = this.store.getCategoriesTree();

    const categoryIdSet = new Set();
    const collectIds = (nodes) => {
      nodes.forEach((node) => {
        categoryIdSet.add(node.id);
        if (node.children && node.children.length) {
          collectIds(node.children);
        }
      });
    };
    collectIds(categoriesTree);

    const assignmentsMap = new Map();
    Object.values(state.favorites).forEach((fav) => {
      const categoryId = Array.isArray(fav.categories) && fav.categories.length ? fav.categories[0] : null;
      if (!categoryId || !categoryIdSet.has(categoryId)) {
        return;
      }
      if (!assignmentsMap.has(categoryId)) {
        assignmentsMap.set(categoryId, []);
      }
      assignmentsMap.get(categoryId).push(fav);
    });

    const aggregatedCounts = new Map();
    const computeTotals = (node) => {
      const direct = assignmentsMap.get(node.id)?.length || 0;
      const childTotal = (node.children || []).reduce((sum, child) => sum + computeTotals(child), 0);
      const total = direct + childTotal;
      aggregatedCounts.set(node.id, total);
      return total;
    };
    categoriesTree.forEach((node) => computeTotals(node));

    const cards = document.createElement('div');
    cards.className = 'tfr-category-cards';
    if (!categoriesTree.length) {
      const empty = document.createElement('div');
      empty.className = 'tfr-empty-state';
      empty.textContent = t('categories.panel.empty');
      cards.appendChild(empty);
    } else {
      categoriesTree.forEach((node) => {
        const card = this.buildCategoryCard(node, assignmentsMap, aggregatedCounts, liveData, term, 0);
        cards.appendChild(card);
      });
    }

    column.appendChild(cards);
    return column;
  }

  buildCategoryCard(node, assignmentsMap, aggregatedCounts, liveData, term, depth) {
    const card = document.createElement('div');
    card.className = 'tfr-category-card';
    card.dataset.categoryId = node.id;
    card.style.setProperty('--card-depth', String(depth));
    if (node.collapsed) {
      card.classList.add('is-collapsed');
    }

    const header = document.createElement('div');
    header.className = 'tfr-category-card__header';

    const title = document.createElement('div');
    title.className = 'tfr-category-card__title';
    title.textContent = node.name;
    header.appendChild(title);

    const count = document.createElement('span');
    count.className = 'tfr-category-card__count';
    count.textContent = `${aggregatedCounts.get(node.id) || 0}`;
    header.appendChild(count);

    const actions = document.createElement('div');
    actions.className = 'tfr-category-card__actions';

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'tfr-chip-action';
    collapseBtn.textContent = node.collapsed ? t('categories.toggle.expand') : t('categories.toggle.collapse');
    collapseBtn.addEventListener('click', async () => {
      await this.store.toggleCategoryCollapse(node.id);
      this.render();
    });
    actions.appendChild(collapseBtn);

    const addSubBtn = document.createElement('button');
    addSubBtn.type = 'button';
    addSubBtn.className = 'tfr-chip-action';
    addSubBtn.textContent = t('categories.sub.addShort');
    addSubBtn.addEventListener('click', async () => {
      const name = window.prompt(t('prompts.newSubcategory'), `${node.name} ${node.children.length + 1}`);
      if (!name) return;
      await this.store.createCategory(name, node.id);
      this.render();
    });
    actions.appendChild(addSubBtn);

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'tfr-chip-action';
    renameBtn.textContent = t('common.rename');
    renameBtn.addEventListener('click', async () => {
      const name = window.prompt(t('prompts.renameCategory'), node.name);
      if (!name) return;
      await this.store.renameCategory(node.id, name);
      this.render();
    });
    actions.appendChild(renameBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'tfr-chip-action tfr-chip-action--danger';
    deleteBtn.textContent = t('common.delete');
    deleteBtn.addEventListener('click', async () => {
      const confirmed = window.confirm(t('confirms.deleteWithName', { name: node.name }));
      if (!confirmed) return;
      await this.store.removeCategory(node.id);
      this.render();
    });
    actions.appendChild(deleteBtn);

    header.appendChild(actions);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'tfr-category-card__body';
    if (node.collapsed) {
      body.classList.add('is-hidden');
    }
    card.appendChild(body);

    const favoritesGrid = document.createElement('div');
    favoritesGrid.className = 'tfr-category-card__grid';
    const assigned = (assignmentsMap.get(node.id) || []).slice().sort((a, b) =>
      (a.displayName || a.login).localeCompare(b.displayName || b.login, 'fr')
    );
    const filtered = term
      ? assigned.filter((fav) => (fav.displayName || fav.login || '').toLowerCase().includes(term))
      : assigned;
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'tfr-category-card__empty';
      empty.textContent = term ? t('categories.dropzone.emptyFiltered') : t('categories.dropzone.empty');
      favoritesGrid.appendChild(empty);
    } else {
      filtered.forEach((fav) => {
        const square = this.createFavoriteSquare(fav, liveData);
        favoritesGrid.appendChild(square);
      });
    }
    body.appendChild(favoritesGrid);

    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'tfr-category-card__children';
    if (Array.isArray(node.children) && node.children.length) {
      node.children.forEach((child) => {
        const childCard = this.buildCategoryCard(child, assignmentsMap, aggregatedCounts, liveData, term, depth + 1);
        childrenWrap.appendChild(childCard);
      });
    }
    body.appendChild(childrenWrap);

    this.setupCategoryDropTarget(card, node.id);
    this.setupCategoryDropTarget(favoritesGrid, node.id);
    return card;
  }

  createFavoriteSquare(fav, liveData) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tfr-category-square';
    button.title = t('favorites.configure', { name: fav.displayName || fav.login });

    const avatar = document.createElement('img');
    avatar.className = 'tfr-category-square__avatar';
    avatar.src = (liveData[fav.login]?.avatarUrl) || fav.avatarUrl || DEFAULT_AVATAR;
    avatar.alt = '';
    button.appendChild(avatar);
    if (fav.recentHighlightEnabled !== false) {
      button.classList.add('tfr-category-square--recent');
      const badge = document.createElement('span');
      badge.className = 'tfr-category-square__badge';
      badge.textContent = t('recent.badgeShort');
      button.appendChild(badge);
    }

    const label = document.createElement('span');
    label.className = 'tfr-visually-hidden';
    label.textContent = fav.displayName || fav.login;
    button.appendChild(label);

    this.makeFavoriteDraggable(button, fav.login);
    if (this.activeFavoriteLogin === fav.login?.toLowerCase()) {
      button.classList.add('is-active');
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (this.draggedLogin) {
        return;
      }
      this.openFavoriteDetails(fav.login);
    });
    return button;
  }

  makeFavoriteDraggable(element, login) {
    element.draggable = true;
    element.dataset.login = login;
    element.addEventListener('dragstart', (event) => {
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', login);
        event.dataTransfer.effectAllowed = 'move';
      }
      element.classList.add('is-dragging');
      this.draggedLogin = login;
    });
    element.addEventListener('dragend', () => {
      element.classList.remove('is-dragging');
      this.draggedLogin = null;
    });
  }

  renderBackupControls() {
    const wrapper = document.createElement('div');
    wrapper.className = 'tfr-backup-controls';

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'tfr-button';
    exportButton.textContent = t('backup.export');
    exportButton.addEventListener('click', () => this.handleExportBackup());

    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'tfr-button tfr-button--ghost';
    importButton.textContent = this.isImportingBackup ? t('backup.importing') : t('backup.import');
    importButton.disabled = this.isImportingBackup;

    const importFileInput = document.createElement('input');
    importFileInput.type = 'file';
    importFileInput.accept = 'application/json';
    importFileInput.className = 'tfr-backup-file-input';
    importFileInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) {
        this.importBackupFromFile(file);
      }
    });
    importButton.addEventListener('click', () => {
      if (!this.isImportingBackup) {
        importFileInput.click();
      }
    });

    const pasteButton = document.createElement('button');
    pasteButton.type = 'button';
    pasteButton.className = 'tfr-button tfr-button--ghost';
    pasteButton.textContent = t('backup.pasteJson');
    pasteButton.addEventListener('click', () => this.importBackupFromText());

    wrapper.appendChild(exportButton);
    wrapper.appendChild(importButton);
    wrapper.appendChild(pasteButton);
    wrapper.appendChild(importFileInput);
    this.backupInput = importFileInput;
    return wrapper;
  }

  async handleExportBackup() {
    try {
      const payload = this.store.getBackupData();
      const serialized = JSON.stringify(payload, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `twitch-favoris-backup-${timestamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('[TFR] Export backup error', error);
      window.alert(t('backup.exportError'));
    }
  }

  async importBackupFromFile(file) {
    this.isImportingBackup = true;
    try {
      const content = await file.text();
      await this.applyBackupContent(content);
    } catch (error) {
      console.error('[TFR] Backup file import error', error);
      const message =
        error?.message === 'JSON invalide' || error?.message === 'Contenu vide'
          ? t('backup.importInvalidFile')
          : t('backup.importReadError');
      window.alert(message);
    } finally {
      this.isImportingBackup = false;
      if (this.isOpen) {
        this.render();
      }
    }
  }

  async importBackupFromText() {
    const input = window.prompt(t('prompts.pasteJson'));
    const trimmed = typeof input === 'string' ? input.trim() : '';
    if (!trimmed) {
      return;
    }
    this.isImportingBackup = true;
    try {
      await this.applyBackupContent(trimmed);
    } catch (error) {
      console.error('[TFR] Backup paste error', error);
      const message =
        error?.message === 'JSON invalide' || error?.message === 'Contenu vide'
          ? t('backup.importInvalidText')
          : t('backup.importFailed');
      window.alert(message);
    } finally {
      this.isImportingBackup = false;
      if (this.isOpen) {
        this.render();
      }
    }
  }

  async applyBackupContent(rawText) {
    const normalizedText = typeof rawText === 'string' ? rawText.trim() : '';
    if (!normalizedText) {
      throw new Error('Contenu vide');
    }
    let parsed = null;
    try {
      parsed = JSON.parse(normalizedText);
    } catch (error) {
      throw new Error('JSON invalide');
    }
    const confirmed = window.confirm(t('confirms.import'));
    if (!confirmed) {
      return;
    }
    await this.store.restoreFromBackup(parsed);
    window.alert(t('backup.importSuccess'));
  }

  renderCategories(content, state) {
    const categoriesSection = document.createElement('section');
    categoriesSection.className = 'tfr-categories-section';

    const header = document.createElement('div');
    header.className = 'tfr-categories-header';
    header.textContent = t('categories.header');

    const addCategory = document.createElement('button');
    addCategory.type = 'button';
    addCategory.className = 'tfr-button';
    addCategory.textContent = t('categories.add');
    addCategory.addEventListener('click', async () => {
      const name = window.prompt(t('prompts.newCategoryAlt'));
      if (!name) {
        return;
      }
      await this.store.createCategory(name);
      this.render();
    });

    const list = document.createElement('div');
    list.className = 'tfr-category-list';
    const favoritesArray = Object.values(state.favorites);

    const categoriesTree = this.store.getCategoriesTree();
    const categoryIdSet = new Set();
    const collectIds = (nodes) => {
      nodes.forEach((node) => {
        categoryIdSet.add(node.id);
        if (node.children && node.children.length) {
          collectIds(node.children);
        }
      });
    };
    collectIds(categoriesTree);
    const assignmentsMap = new Map();
    const uncategorizedFavorites = [];
    Object.values(state.favorites).forEach((fav) => {
      const categoryId = Array.isArray(fav.categories) && fav.categories.length ? fav.categories[0] : null;
      if (categoryId && categoryIdSet.has(categoryId)) {
        if (!assignmentsMap.has(categoryId)) {
          assignmentsMap.set(categoryId, []);
        }
        assignmentsMap.get(categoryId).push(fav);
      } else {
        uncategorizedFavorites.push(fav);
      }
    });
    const aggregatedCounts = new Map();
    const computeTotals = (node) => {
      const direct = assignmentsMap.get(node.id)?.length || 0;
      const childTotal = (node.children || []).reduce((sum, child) => sum + computeTotals(child), 0);
      const total = direct + childTotal;
      aggregatedCounts.set(node.id, total);
      return total;
    };
    categoriesTree.forEach((node) => computeTotals(node));
    if (!categoriesTree.length) {
      const empty = document.createElement('div');
      empty.className = 'tfr-empty-state';
      empty.textContent = t('categories.empty');
      list.appendChild(empty);
    } else {
      categoriesTree.forEach((category) => {
        this.appendCategoryListItem(list, category, 0, assignmentsMap, aggregatedCounts, favoritesArray);
      });
      if (uncategorizedFavorites.length) {
        const uncategorizedItem = document.createElement('div');
        uncategorizedItem.className = 'tfr-category-item tfr-category-item--uncategorized';
        const title = document.createElement('div');
        title.className = 'tfr-category-item-title';
        const name = document.createElement('span');
        name.textContent = t('categories.noneName');
        const meta = document.createElement('span');
        meta.className = 'tfr-category-meta';
        meta.textContent = t('categories.uncategorizedMeta', { count: uncategorizedFavorites.length });
        title.appendChild(name);
        title.appendChild(meta);

        const chips = document.createElement('div');
        chips.className = 'tfr-category-assigned';
        uncategorizedFavorites.forEach((fav) => {
          const chip = document.createElement('span');
          chip.className = 'tfr-category-chip';
          const chipAvatar = document.createElement('img');
          chipAvatar.className = 'tfr-category-chip-avatar';
          chipAvatar.src = fav.avatarUrl || DEFAULT_AVATAR;
          chipAvatar.alt = '';
          const chipLabel = document.createElement('span');
          chipLabel.textContent = fav.displayName || fav.login;
          chip.appendChild(chipAvatar);
          chip.appendChild(chipLabel);
          chips.appendChild(chip);
        });

        const hint = document.createElement('div');
        hint.className = 'tfr-category-assigned tfr-category-assigned--empty';
        hint.textContent = t('categories.assignHint');
        uncategorizedItem.appendChild(chips);
        uncategorizedItem.appendChild(hint);
        this.enableUncategorizedDrop(uncategorizedItem);
        list.appendChild(uncategorizedItem);
      }
    }

    categoriesSection.appendChild(header);
    categoriesSection.appendChild(addCategory);
    categoriesSection.appendChild(list);
    content.appendChild(categoriesSection);
  }

  appendCategoryListItem(container, category, depth, assignmentsMap, aggregatedCounts, favoritesArray) {
    const item = document.createElement('div');
    item.className = 'tfr-category-item';
    item.dataset.depth = String(depth);
    item.style.marginLeft = `${depth * 16}px`;

    const title = document.createElement('div');
    title.className = 'tfr-category-item-title';
    const name = document.createElement('span');
    const indent = depth > 1 ? '  '.repeat(depth - 1) : '';
    const bullet = depth ? '- ' : '';
    name.textContent = `${indent}${bullet}${category.name}`;
    const meta = document.createElement('span');
    meta.className = 'tfr-category-meta';
    const totalCount = aggregatedCounts.get(category.id) || 0;
    meta.textContent = t('categories.totalMeta', { count: totalCount });
    title.appendChild(name);
    title.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'tfr-category-item-actions';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tfr-button tfr-button--ghost';
    toggle.textContent = category.collapsed ? t('categories.toggle.expandAlt') : t('categories.toggle.collapseAlt');
    toggle.addEventListener('click', async () => {
      await this.store.toggleCategoryCollapse(category.id);
      this.render();
    });

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'tfr-button tfr-button--ghost';
    rename.textContent = t('common.rename');
    rename.addEventListener('click', async () => {
      const next = window.prompt(t('prompts.renameCategory'), category.name);
      if (!next) {
        return;
      }
      await this.store.renameCategory(category.id, next);
      this.render();
    });

    const addSub = document.createElement('button');
    addSub.type = 'button';
    addSub.className = 'tfr-button tfr-button--ghost';
    addSub.textContent = t('categories.addSub');
    addSub.addEventListener('click', async () => {
      const nameValue = window.prompt(t('prompts.newSubcategoryAlt'));
      if (!nameValue) {
        return;
      }
      await this.store.createCategory(nameValue, category.id);
      this.render();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tfr-button tfr-button--danger';
    remove.textContent = t('common.delete');
    remove.addEventListener('click', async () => {
      const confirmed = window.confirm(t('confirms.deleteKeepFavorites'));
      if (!confirmed) {
        return;
      }
      await this.store.removeCategory(category.id);
      this.render();
    });

    actions.appendChild(toggle);
    actions.appendChild(rename);
    actions.appendChild(addSub);
    actions.appendChild(remove);
    const headerRow = document.createElement('div');
    headerRow.className = 'tfr-category-item-header';
    headerRow.appendChild(title);
    headerRow.appendChild(actions);
    item.appendChild(headerRow);

    
    
    container.appendChild(item);

    const directAssignments = assignmentsMap.get(category.id) || [];
    if (directAssignments.length) {
      const chips = document.createElement('div');
      chips.className = 'tfr-category-assigned';
      directAssignments.forEach((fav) => {
        const chipButton = document.createElement('button');
        chipButton.type = 'button';
        chipButton.className = 'tfr-category-chip-btn';
        chipButton.title = t('favorites.settingsTooltip');
        chipButton.dataset.login = fav.login;
        const chipAvatar = document.createElement('img');
        chipAvatar.className = 'tfr-category-chip-btn__avatar';
        chipAvatar.src = fav.avatarUrl || DEFAULT_AVATAR;
        chipAvatar.alt = '';
        const chipLabel = document.createElement('span');
        chipLabel.textContent = fav.displayName || fav.login;
        chipButton.appendChild(chipAvatar);
        chipButton.appendChild(chipLabel);
        chipButton.addEventListener('click', () => this.openFavoriteDetails(fav.login));
        chipButton.addEventListener('dragstart', (event) => event.preventDefault());
        if (this.activeFavoriteLogin === fav.login?.toLowerCase()) {
          chipButton.classList.add('is-active');
        }
        chips.appendChild(chipButton);
      });
      item.appendChild(chips);
    } else if (!category.children || !category.children.length) {
      const empty = document.createElement('div');
      empty.className = 'tfr-category-assigned tfr-category-assigned--empty';
      empty.textContent = t('categories.assignEmpty');
      item.appendChild(empty);
    }

    const assignableFavorites = favoritesArray.filter((fav) => {
      const current = Array.isArray(fav.categories) && fav.categories.length ? fav.categories[0] : null;
      return current !== category.id;
    });
    if (assignableFavorites.length) {
      const assignWrap = document.createElement('div');
      assignWrap.className = 'tfr-category-assign';

      const assignSelect = document.createElement('select');
      assignSelect.className = 'tfr-category-assign-select';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = t('categories.assignPlaceholder');
      assignSelect.appendChild(placeholder);
      assignableFavorites
        .sort((a, b) => (a.displayName || a.login).localeCompare(b.displayName || b.login, 'fr'))
        .forEach((fav) => {
          const option = document.createElement('option');
          option.value = fav.login;
          const current = Array.isArray(fav.categories) && fav.categories.length ? fav.categories[0] : null;
          const suffix = current ? ` (actuellement: ${this.findCategoryName(current)})` : '';
        option.textContent = (fav.displayName || fav.login) + suffix;
        assignSelect.appendChild(option);
      });

      const assignButton = document.createElement('button');
      assignButton.type = 'button';
      assignButton.className = 'tfr-button tfr-button--ghost';
      assignButton.textContent = t('categories.assign');
      assignButton.disabled = true;
      assignSelect.addEventListener('change', () => {
        assignButton.disabled = assignSelect.value === '';
      });
      assignButton.addEventListener('click', async () => {
        const selected = assignSelect.value;
        if (!selected) return;
        await this.store.setFavoriteCategory(selected, category.id);
        assignSelect.value = '';
        assignButton.disabled = true;
        this.render();
      });

      assignWrap.appendChild(assignSelect);
      assignWrap.appendChild(assignButton);
      item.appendChild(assignWrap);
    }

    this.setupCategoryDropTarget(item, category.id);

    if (Array.isArray(category.children) && category.children.length) {
      category.children.forEach((child) =>
        this.appendCategoryListItem(container, child, depth + 1, assignmentsMap, aggregatedCounts, favoritesArray)
      );
    }
  }

  setupCategoryDropTarget(element, categoryId) {
    const highlight = () => element.classList.add('is-drop-target');
    const removeHighlight = () => element.classList.remove('is-drop-target');
    const canHandle = (event) => {
      const types = event.dataTransfer?.types;
      return types && (types.includes('text/plain') || types.includes('Text'));
    };
    element.addEventListener('dragover', (event) => {
      if (!canHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      highlight();
    });
    element.addEventListener('dragenter', (event) => {
      if (!canHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      highlight();
    });
    element.addEventListener('dragleave', (event) => {
      if (!element.contains(event.relatedTarget)) {
        removeHighlight();
      }
    });
    element.addEventListener('drop', async (event) => {
      if (!canHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      removeHighlight();
      const login = event.dataTransfer?.getData('text/plain') || this.draggedLogin || '';
      if (!login) return;
      const fav = this.store.getState().favorites?.[login];
      const current = Array.isArray(fav?.categories) && fav.categories.length ? fav.categories[0] : null;
      if (current === categoryId) {
        return;
      }
      try {
        await this.store.setFavoriteCategory(login, categoryId);
      } finally {
        this.draggedLogin = null;
        this.render();
      }
    });
  }

  enableUncategorizedDrop(element) {
    const highlight = () => element.classList.add('is-drop-target');
    const removeHighlight = () => element.classList.remove('is-drop-target');
    const canHandle = (event) => {
      const types = event.dataTransfer?.types;
      return types && (types.includes('text/plain') || types.includes('Text'));
    };
    element.addEventListener('dragover', (event) => {
      if (!canHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      highlight();
    });
    element.addEventListener('dragenter', (event) => {
      if (!canHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      highlight();
    });
    element.addEventListener('dragleave', (event) => {
      if (!element.contains(event.relatedTarget)) {
        removeHighlight();
      }
    });
    element.addEventListener('drop', async (event) => {
      if (!canHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      removeHighlight();
      const login = event.dataTransfer?.getData('text/plain') || this.draggedLogin || '';
      if (!login) return;
      try {
        await this.store.clearFavoriteCategory(login);
      } finally {
        this.draggedLogin = null;
        this.render();
      }
    });
  }

  openFavoriteDetails(login) {
    if (!login) {
      return;
    }
    const normalized = login.toLowerCase();
    if (this.activeFavoriteLogin === normalized) {
      this.closeFavoriteDetails();
      return;
    }
    this.activeFavoriteLogin = normalized;
    this.render();
  }

  closeFavoriteDetails() {
    if (!this.activeFavoriteLogin) {
      return;
    }
    this.activeFavoriteLogin = null;
    this.render();
  }

  findCategoryName(categoryId) {
    if (!categoryId) {
      return 'Sans cat\u00e9gorie';
    }
    const stack = [...this.store.getCategoriesTree()];
    while (stack.length) {
      const node = stack.pop();
      if (node.id === categoryId) {
        return node.name;
      }
      if (node.children && node.children.length) {
        stack.push(...node.children);
      }
    }
    return 'Sans cat\u00e9gorie';
  }

  renderFavoriteDetailsPanel(state, liveData) {
    const panelContainer = this.root?.querySelector('.tfr-overlay-panel');
    panelContainer?.querySelector('.tfr-favorite-details')?.remove();
    if (panelContainer) {
      panelContainer.classList.remove('tfr-overlay-panel--with-details');
    }
    const login = this.activeFavoriteLogin;
    if (!panelContainer || !login) {
      return;
    }
    const favorite = state.favorites?.[login];
    if (!favorite) {
      this.activeFavoriteLogin = null;
      return;
    }
    const categoryTree = this.store.getCategoriesTree();
    const flatCategories = [];
    const flattenForSelect = (nodes, depth = 0) => {
      nodes.forEach((node) => {
        flatCategories.push({ id: node.id, name: node.name, depth });
        if (node.children && node.children.length) {
          flattenForSelect(node.children, depth + 1);
        }
      });
    };
    flattenForSelect(categoryTree);
    const knownCategoriesSet = new Set();
    Object.values(liveData).forEach((live) => {
      if (live?.game) {
        const trimmed = typeof live.game === 'string' ? live.game.trim() : '';
        if (trimmed) {
          knownCategoriesSet.add(trimmed);
        }
      }
    });
    Object.values(state.favorites).forEach((fav) => {
      const filterCategories = Array.isArray(fav.categoryFilter?.categories) ? fav.categoryFilter.categories : [];
      filterCategories.forEach((category) => {
        const trimmed = typeof category === 'string' ? category.trim() : '';
        if (trimmed) {
          knownCategoriesSet.add(trimmed);
        }
      });
    });
    const knownCategories = Array.from(knownCategoriesSet).sort((a, b) => a.localeCompare(b, 'fr'));
    const detailsPanel = this.renderFavoriteDetails(state, liveData, flatCategories, knownCategories);
    if (detailsPanel) {
      panelContainer.appendChild(detailsPanel);
      panelContainer.classList.add('tfr-overlay-panel--with-details');
    }
  }

  renderFavoriteDetails(state, liveData, flatCategories, knownCategories) {
    const login = this.activeFavoriteLogin;
    if (!login) {
      return null;
    }
    const favorite = state.favorites?.[login];
    if (!favorite) {
      this.activeFavoriteLogin = null;
      return null;
    }
    const live = liveData[login];
    const prefs = state.preferences || {};
    const filterCategories = Array.isArray(favorite.categoryFilter?.categories)
      ? favorite.categoryFilter.categories
      : [];
    const panel = document.createElement('aside');
    panel.className = 'tfr-favorite-details';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('details.panelTitle', { name: favorite.displayName }));
    panel.tabIndex = -1;
    requestAnimationFrame(() => {
      try {
        panel.focus();
      } catch {
        // ignore focus errors
      }
    });

    const header = document.createElement('div');
    header.className = 'tfr-favorite-details__header';
    const headerInfo = document.createElement('div');
    headerInfo.className = 'tfr-favorite-details__header-info';
    const avatar = document.createElement('img');
    avatar.className = 'tfr-favorite-details__avatar';
    avatar.src = live?.avatarUrl || favorite.avatarUrl || DEFAULT_AVATAR;
    avatar.alt = favorite.displayName;
    headerInfo.appendChild(avatar);
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'tfr-favorite-details__title-wrapper';
    const title = document.createElement('h3');
    title.className = 'tfr-favorite-details__title';
    title.textContent = favorite.displayName;
    const subtitle = document.createElement('span');
    subtitle.className = 'tfr-favorite-details__subtitle';
    subtitle.textContent = `@${favorite.login}`;
    titleWrapper.appendChild(title);
    titleWrapper.appendChild(subtitle);
    headerInfo.appendChild(titleWrapper);
    header.appendChild(headerInfo);
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'tfr-favorite-details__close';
    closeButton.setAttribute('aria-label', t('details.panelClose', { name: favorite.displayName }));
    closeButton.textContent = '\u00D7';
    closeButton.addEventListener('click', () => this.closeFavoriteDetails());
    header.appendChild(closeButton);
    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'tfr-favorite-details__body';
    panel.appendChild(body);

    const categorySection = document.createElement('section');
    categorySection.className = 'tfr-details-section';
    const categoryTitle = document.createElement('h4');
    categoryTitle.className = 'tfr-details-section__title';
    categoryTitle.textContent = t('details.category.title');
    categorySection.appendChild(categoryTitle);
    const categorySelect = document.createElement('select');
    categorySelect.className = 'tfr-category-select tfr-category-select--wide';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = flatCategories.length ? t('categories.noneName') : t('details.category.noneAvailable');
    categorySelect.appendChild(placeholderOption);
    flatCategories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      const prefix = category.depth ? `${'  '.repeat(category.depth)}- ` : '';
      option.textContent = `${prefix}${category.name}`;
      categorySelect.appendChild(option);
    });
    const currentCategory =
      Array.isArray(favorite.categories) && favorite.categories.length ? favorite.categories[0] : '';
    categorySelect.value = currentCategory || '';
    categorySelect.disabled = !flatCategories.length;
    categorySelect.addEventListener('change', async (event) => {
      const value = event.target.value;
      await this.store.setFavoriteCategory(favorite.login, value || null);
      this.render();
    });
    categorySection.appendChild(categorySelect);
    if (!flatCategories.length) {
      const categoryHint = document.createElement('p');
      categoryHint.className = 'tfr-details-hint';
      categoryHint.textContent = t('details.category.hint');
      categorySection.appendChild(categoryHint);
    }
    body.appendChild(categorySection);

    const filterSection = document.createElement('section');
    filterSection.className = 'tfr-details-section';
    const filterTitle = document.createElement('h4');
    filterTitle.className = 'tfr-details-section__title';
    filterTitle.textContent = t('details.filter.title');
    filterSection.appendChild(filterTitle);
    const filterContainer = document.createElement('div');
    filterContainer.className = 'tfr-category-filter';
    const filterToggleId = `tfr-detail-filter-${favorite.login}`;
    const filterToggleLabel = document.createElement('label');
    filterToggleLabel.className = 'tfr-category-filter__toggle';
    filterToggleLabel.setAttribute('for', filterToggleId);
    const filterToggle = document.createElement('input');
    filterToggle.type = 'checkbox';
    filterToggle.id = filterToggleId;
    filterToggle.className = 'tfr-category-filter__checkbox';
    filterToggle.checked = Boolean(favorite.categoryFilter?.enabled);
    const filterToggleText = document.createElement('span');
    filterToggleText.textContent = t('details.filter.toggle');
    filterToggleLabel.appendChild(filterToggle);
    filterToggleLabel.appendChild(filterToggleText);
    filterContainer.appendChild(filterToggleLabel);
    const listWrapper = document.createElement('div');
    listWrapper.className = 'tfr-category-filter__list';
    if (!filterCategories.length) {
      const empty = document.createElement('span');
      empty.className = 'tfr-category-filter__empty';
      empty.textContent = filterToggle.checked ? t('details.filter.emptyEnabled') : t('details.filter.emptyDisabled');
      listWrapper.appendChild(empty);
    } else {
      filterCategories.forEach((category) => {
        const chip = document.createElement('span');
        chip.className = 'tfr-category-filter__chip';
        chip.textContent = category;
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'tfr-category-filter__remove';
        removeButton.setAttribute('aria-label', t('details.filter.remove', { category }));
        removeButton.textContent = '\u00D7';
        removeButton.addEventListener('click', async () => {
          const latestCategories =
            this.store.getState().favorites?.[favorite.login]?.categoryFilter?.categories;
          const source = Array.isArray(latestCategories) ? latestCategories : filterCategories;
          const next = source.filter(
            (value) => normalizeCategoryName(value) !== normalizeCategoryName(category)
          );
          await this.store.setFavoriteCategoryFilter(favorite.login, {
            categories: next,
            enabled: next.length ? filterToggle.checked : false
          });
          this.render();
        });
        chip.appendChild(removeButton);
        listWrapper.appendChild(chip);
      });
    }
    filterContainer.appendChild(listWrapper);
    const inputRow = document.createElement('div');
    inputRow.className = 'tfr-category-filter__input-row';
    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.className = 'tfr-category-filter__input';
    filterInput.placeholder = t('details.filter.placeholder');
    filterInput.value = '';
    filterInput.autocomplete = 'off';
    filterInput.spellcheck = false;
    const datalistId = `${filterToggleId}-list`;
    filterInput.setAttribute('list', datalistId);
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'tfr-category-filter__add';
    addButton.textContent = t('details.filter.add');
    inputRow.appendChild(filterInput);
    inputRow.appendChild(addButton);
    const datalist = document.createElement('datalist');
    datalist.id = datalistId;
    knownCategories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      datalist.appendChild(option);
    });
    filterContainer.appendChild(inputRow);
    filterContainer.appendChild(datalist);
    const suggestions = document.createElement('div');
    suggestions.className = 'tfr-category-filter__suggestions';
    filterContainer.appendChild(suggestions);
    const liveCategoryInfo = document.createElement('small');
    liveCategoryInfo.className = 'tfr-category-filter__hint';
    if (live?.isLive) {
      liveCategoryInfo.textContent = live?.game
        ? t('details.filter.currentCategory', { game: live.game })
        : t('details.filter.currentCategoryUnavailable');
    } else {
      liveCategoryInfo.textContent = t('details.filter.offline');
    }
    filterContainer.appendChild(liveCategoryInfo);
    const applyToggleState = (enabled) => {
      filterInput.disabled = !enabled;
      addButton.disabled = !enabled;
    };
    applyToggleState(filterToggle.checked);
    const normalizedKnownCategories = knownCategories.map((name) => ({
      raw: name,
      normalized: normalizeCategoryName(name)
    }));
    const clearSuggestions = () => {
      suggestions.innerHTML = '';
      suggestions.classList.remove('is-visible');
    };
    const getCurrentCategories = () => {
      const latestCategories =
        this.store.getState().favorites?.[favorite.login]?.categoryFilter?.categories;
      return Array.isArray(latestCategories) ? latestCategories : filterCategories;
    };
    let suggestionToken = 0;
    const updateSuggestions = async () => {
      const typedRaw = filterInput.value;
      const normalizedTerm = normalizeCategoryName(typedRaw);
      const currentToken = ++suggestionToken;
      suggestions.innerHTML = '';
      suggestions.classList.remove('is-visible');
      if (!normalizedTerm) {
        return;
      }
      const current = getCurrentCategories();
      const normalizedCurrent = new Set(
        current.map((entry) => normalizeCategoryName(entry)).filter(Boolean)
      );
      const candidateMap = new Map();
      const remoteNames = await this.getCategorySuggestions(typedRaw);
      if (currentToken !== suggestionToken) {
        return;
      }
      remoteNames.forEach((name) => {
        const normalized = normalizeCategoryName(name);
        if (normalized && !candidateMap.has(normalized)) {
          candidateMap.set(normalized, name);
        }
      });
      normalizedKnownCategories.forEach(({ raw, normalized }) => {
        if (normalized && !candidateMap.has(normalized)) {
          candidateMap.set(normalized, raw);
        }
      });
      const matches = [];
      candidateMap.forEach((raw, normalized) => {
        if (!normalizedCurrent.has(normalized) && normalized.includes(normalizedTerm)) {
          matches.push(raw);
        }
      });
      if (!matches.length) {
        return;
      }
      matches.slice(0, 8).forEach((name) => {
        const suggestion = document.createElement('button');
        suggestion.type = 'button';
        suggestion.className = 'tfr-category-suggestion';
        suggestion.textContent = name;
        suggestion.addEventListener('mousedown', (event) => {
          event.preventDefault();
          addCategory(name);
        });
        suggestions.appendChild(suggestion);
      });
      suggestions.classList.add('is-visible');
    };
    filterToggle.addEventListener('change', async (event) => {
      const enabled = event.target.checked;
      applyToggleState(enabled);
      if (!enabled) {
        clearSuggestions();
      } else {
        updateSuggestions();
      }
      const payloadCategories = getCurrentCategories();
      await this.store.setFavoriteCategoryFilter(favorite.login, {
        enabled,
        categories: Array.isArray(payloadCategories) ? [...payloadCategories] : []
      });
      this.render();
    });
    const addCategory = async (rawValue) => {
      const value = (typeof rawValue === 'string' ? rawValue : filterInput.value).trim();
      if (!value) {
        filterInput.value = '';
        clearSuggestions();
        return;
      }
      const current = getCurrentCategories();
      const exists = current.some(
        (entry) => normalizeCategoryName(entry) === normalizeCategoryName(value)
      );
      if (exists) {
        filterInput.value = '';
        clearSuggestions();
        return;
      }
      const next = [...current, value];
      await this.store.setFavoriteCategoryFilter(favorite.login, {
        categories: next,
        enabled: true
      });
      filterToggle.checked = true;
      applyToggleState(true);
      filterInput.value = '';
      clearSuggestions();
      this.render();
    };
    addButton.addEventListener('click', () => addCategory());
    filterInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addCategory();
      }
    });
    filterInput.addEventListener('input', () => {
      updateSuggestions();
    });
    filterInput.addEventListener('focus', () => {
      updateSuggestions();
    });
    filterInput.addEventListener('blur', () => {
      setTimeout(clearSuggestions, 120);
    });
    filterSection.appendChild(filterContainer);

    const highlightToggle = document.createElement('label');
    highlightToggle.className = 'tfr-details-toggle';
    const highlightInput = document.createElement('input');
    highlightInput.type = 'checkbox';
    highlightInput.className = 'tfr-details-toggle__input';
    highlightInput.checked = favorite.recentHighlightEnabled !== false;
    highlightInput.addEventListener('change', async (event) => {
      await this.store.setFavoriteRecentHighlight(favorite.login, Boolean(event.target.checked));
      this.render();
    });
    const highlightLabel = document.createElement('span');
    highlightLabel.textContent = t('details.recentHighlight.toggle');
    highlightToggle.appendChild(highlightInput);
    highlightToggle.appendChild(highlightLabel);
    filterSection.appendChild(highlightToggle);

    body.appendChild(filterSection);

    const infoSection = document.createElement('section');
    infoSection.className = 'tfr-details-section tfr-details-section--info';
    const statusLine = document.createElement('p');
    statusLine.className = 'tfr-details-info';
    let highlightLine = null;
    if (live?.isLive) {
      const now = Date.now();
      const viewers = formatViewers(live.viewers || 0);
      const startedAtValue = live.startedAt ? Date.parse(live.startedAt) : NaN;
      const gameLabel = live.game || t('details.status.unknownCategory');
      if (Number.isFinite(startedAtValue)) {
        const elapsedMinutes = Math.max(0, Math.floor((now - startedAtValue) / 60000));
        statusLine.textContent = t('details.status.liveSince', {
          minutes: elapsedMinutes,
          game: gameLabel,
          viewers
        });
      } else {
        statusLine.textContent = t('details.status.live', { game: gameLabel, viewers });
      }
      const matchSince = Number.isFinite(favorite.filterMatchSince) && favorite.filterMatchSince > 0 ? favorite.filterMatchSince : 0;
      let recentReference = Number.isFinite(startedAtValue) ? startedAtValue : NaN;
      if (matchSince) {
        if (!Number.isFinite(recentReference) || matchSince > recentReference) {
          recentReference = matchSince;
        }
      }
      if (prefs.recentLiveEnabled && Number.isFinite(recentReference)) {
        const thresholdMinutes = Number.isFinite(Number(prefs.recentLiveThresholdMinutes))
          ? Math.max(1, Math.min(120, Math.round(Number(prefs.recentLiveThresholdMinutes))))
          : 10;
        const recentMinutes = Math.max(0, Math.floor((now - recentReference) / 60000));
        if (recentMinutes <= thresholdMinutes) {
          highlightLine = document.createElement('p');
          highlightLine.className = 'tfr-details-info tfr-details-info--highlight';
          highlightLine.textContent = t('details.status.recentHighlight', { minutes: thresholdMinutes });
        }
      }
    } else {
      statusLine.textContent = t('details.status.offline');
    }
    infoSection.appendChild(statusLine);
    if (highlightLine) {
      infoSection.appendChild(highlightLine);
    }
    const closeLink = document.createElement('button');
    closeLink.type = 'button';
    closeLink.className = 'tfr-details-close';
    closeLink.textContent = t('details.closeLink');
    closeLink.setAttribute('aria-label', t('common.closeAction'));
    closeLink.addEventListener('click', () => this.closeFavoriteDetails());
    infoSection.appendChild(closeLink);
    body.appendChild(infoSection);

    return panel;
  }

  destroy() {
    this.unsubscribe?.();
    this.close();
  }
}


  class TopNavManager {
  constructor(overlay) {
    this.overlay = overlay;
    this.button = null;
    this.observer = null;
    this.retryTimer = null;
    this.overlayListeners = [];
    this.pendingInjection = false;
    this.injectFrame = null;
    this.slot = null;
    this.bodyReadyFrame = null;
  }

  log(event, detail) {
    try {
      if (detail !== undefined) {
        console.log('[TFR] TopNav', event, detail);
      } else {
        console.log('[TFR] TopNav', event);
      }
    } catch (error) {
      console.error('[TFR] TopNav log error', error);
    }
  }

  init() {
    this.log('init');
    this.injectButton();
    if (!this.overlayListeners.length) {
      const onOpenUnsub = this.overlay.onOpen(() => this.setButtonActive(true));
      const onCloseUnsub = this.overlay.onClose(() => this.setButtonActive(false));
      [onOpenUnsub, onCloseUnsub].forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') {
          this.overlayListeners.push(unsubscribe);
        }
      });
    }
    this.setButtonActive(this.overlay.isOpen);
    this.observeDomMutations();
  }

  dispose() {
    this.log('dispose');
    this.observer?.disconnect();
    this.observer = null;
    if (this.injectFrame !== null) {
      cancelAnimationFrame(this.injectFrame);
      this.injectFrame = null;
    }
    if (this.bodyReadyFrame !== null) {
      cancelAnimationFrame(this.bodyReadyFrame);
      this.bodyReadyFrame = null;
    }
    this.pendingInjection = false;
    this.overlayListeners.forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.overlayListeners = [];
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.slot?.parentElement) {
      this.slot.parentElement.removeChild(this.slot);
    }
    this.slot = null;
    this.button = null;
  }

  scheduleRetry() {
    if (this.retryTimer) {
      return;
    }
    this.log('scheduleRetry');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.scheduleInjection();
    }, 500);
  }

  scheduleInjection() {
    if (this.pendingInjection) {
      return;
    }
    this.pendingInjection = true;
    if (this.injectFrame !== null) {
      cancelAnimationFrame(this.injectFrame);
    }
    this.injectFrame = requestAnimationFrame(() => {
      this.injectFrame = null;
      this.pendingInjection = false;
      this.injectButton();
    });
  }

  observeDomMutations() {
    const target = document.body || document.documentElement;
    if (!target) {
      if (this.bodyReadyFrame !== null) {
        cancelAnimationFrame(this.bodyReadyFrame);
      }
      this.bodyReadyFrame = requestAnimationFrame(() => {
        this.bodyReadyFrame = null;
        this.observeDomMutations();
      });
      this.log('wait-body');
      return;
    }
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => this.scheduleInjection());
    this.observer.observe(target, { childList: true, subtree: true });
  }

  ensureSlot(anchor) {
    if (!this.slot) {
      const tag = anchor?.parentElement?.tagName === 'SPAN' ? 'span' : 'div';
      this.slot = document.createElement(tag);
      this.slot.dataset.tfrTopnavSlot = 'true';
      this.slot.className = 'tfr-topnav-slot';
      this.slot.style.pointerEvents = 'auto';
      this.slot.style.display = 'inline-flex';
      this.slot.style.alignItems = 'center';
      this.slot.style.justifyContent = 'center';
      this.slot.style.position = 'relative';
      const stopHoverPropagation = (event) => {
        event.stopPropagation();
      };
      ['pointerenter', 'pointerover', 'mouseenter', 'mouseover', 'mouseleave', 'pointerleave'].forEach((eventName) => {
        this.slot.addEventListener(eventName, stopHoverPropagation, true);
      });
    }
    return this.slot;
  }

  isUsableParent(node) {
    if (!(node instanceof HTMLElement) || !node.isConnected) {
      return false;
    }
    const style = window.getComputedStyle(node);
    if (!style) {
      return false;
    }
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    if (parseFloat(style.opacity || '1') === 0) {
      return false;
    }
    if (node.offsetWidth === 0 && node.offsetHeight === 0 && style.position !== 'fixed' && style.position !== 'absolute') {
      return false;
    }
    return true;
  }

  findMountPoint() {
    const anchorSelectors = [
      '[data-a-target="top-nav-prime-link"]',
      '[data-a-target="prime-offers-icon"]',
      'button[data-a-target="prime-offers-icon"]',
      'button[data-target="prime-offers-icon"]',
      '[data-test-selector="prime-offers-icon"]',
      'button[aria-label="Offres Prime"]',
      'button[aria-label="Prime Offers"]',
      'a[aria-label="Offres Prime"]',
      'a[aria-label="Prime Offers"]'
    ];
    const containerSelectors = [
      '[data-test-selector="top-nav-bar-icon-buttons"]',
      '[data-test-selector="top-nav-bar__icon-menu"]',
      '[data-test-selector="top-nav-bar__icons"]',
      '[data-test-selector="top-nav"]',
      '[data-a-target="top-nav"]',
      '[data-test-selector="top-nav-bar-prime"]',
      '.Layout-sc-1xcs6mc-0.bZYcrx',
      'header div[role="menubar"]',
      'header [data-test-selector="tw-top-nav"]',
      'header nav'
    ];

    const findAnchorInParent = (parent) => {
      for (const selector of anchorSelectors) {
        try {
          const candidate = parent.querySelector(selector);
          if (candidate) {
            return candidate;
          }
        } catch (error) {
          this.log('selector-error', { selector, error: String(error) });
        }
      }
      return (
        Array.from(parent.querySelectorAll('[data-a-target],[data-target],button,a'))
          .find((node) => node !== this.button) || null
      );
    };

    const findUsableParent = (element) => {
      let current = element?.parentElement;
      while (current && !this.isUsableParent(current)) {
        current = current.parentElement;
      }
      if (current) {
        return current;
      }
      const root = element?.getRootNode?.();
      if (root?.host && this.isUsableParent(root.host)) {
        return root.host;
      }
      return null;
    };

    for (const selector of containerSelectors) {
      let parent = null;
      try {
        parent = document.querySelector(selector);
      } catch (error) {
        this.log('selector-error', { selector, error: String(error) });
        continue;
      }
      if (!parent || !this.isUsableParent(parent)) {
        continue;
      }
      this.log('mount-point', {
        strategy: 'container',
        selector,
        anchorTag: null,
        hasReference: false
      });
      return { parent, reference: null, anchor: null };
    }

    for (const selector of anchorSelectors) {
      let anchor = null;
      try {
        anchor = document.querySelector(selector);
      } catch (error) {
        this.log('selector-error', { selector, error: String(error) });
        continue;
      }
      if (!anchor) {
        continue;
      }
      const parent = findUsableParent(anchor);
      if (!parent) {
        continue;
      }
      const reference = anchor.nextElementSibling;
      this.log('mount-point', {
        strategy: 'direct',
        selector,
        anchorTag: anchor.tagName,
        hasReference: Boolean(reference)
      });
      return { parent, reference, anchor };
    }

    this.log('mount-point-missing');
    return null;
  }


  ensureButton() {
    if (this.button) {
      return this.button;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.tfrTopnavButton = 'true';
    button.dataset.aTarget = 'top-nav-favorites-button';
    button.className = 'tfr-topnav-action tfr-topnav-action--icon';
    button.style.pointerEvents = 'auto';
    button.style.display = 'inline-flex';
    button.style.flex = '0 0 auto';
    button.style.position = 'relative';
    button.style.zIndex = '1';
    button.tabIndex = 0;
    button.setAttribute('aria-label', t('sidebar.button'));
    button.setAttribute('aria-pressed', 'false');
    button.title = t('sidebar.button');
    button.innerHTML = '<svg class="tfr-topnav-action__icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2c-2.761 0-5 2.239-5 5 0 3.727 3.533 8.275 4.63 9.513a.5.5 0 0 0 .74 0C13.467 15.275 17 10.727 17 7c0-2.761-2.239-5-5-5z" fill="currentColor"></path><path d="M12 5.2l.985 1.996 2.203.32-1.594 1.554.376 2.194L12 9.8l-1.97 1.464.376-2.194-1.594-1.554 2.203-.32z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2"></path></svg>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.overlay.isOpen) {
        this.overlay.close();
      } else {
        this.overlay.open();
      }
    });
    this.button = button;
    this.log('button-created');
    return button;
  }

  syncWithAnchor(anchor, parent) {
    const button = this.ensureButton();
    if (!button) {
      return null;
    }
    const slot = this.ensureSlot(anchor);
    if (!slot.contains(button)) {
      slot.innerHTML = '';
      slot.appendChild(button);
    }
    let source = anchor;
    if (!source && parent) {
      source = Array.from(parent.querySelectorAll('button, a')).find((node) => node !== button);
    }
    const isActive = button.classList.contains('is-active');
    button.classList.add('tfr-topnav-action', 'tfr-topnav-action--icon');
    slot.classList.add('tfr-topnav-slot');
    if (isActive) {
      button.classList.add('is-active');
    } else {
      button.classList.remove('is-active');
    }
    if (!source) {
      slot.style.margin = '0 6px';
      slot.style.width = '';
      slot.style.height = '';
      button.style.width = '32px';
      button.style.height = '32px';
      button.style.margin = '0';
      this.log('sync-anchor-missing');
      return slot;
    }
    const style = source ? window.getComputedStyle(source) : null;
    const parseMargin = (value, fallback) => {
      if (!value || value === 'auto') return fallback;
      const numeric = parseFloat(value);
      if (!Number.isFinite(numeric) || Math.abs(numeric) < 1) return fallback;
      return value;
    };
    const marginTop = style?.marginTop || '0';
    const marginBottom = style?.marginBottom || '0';
    const marginLeft = parseMargin(style?.marginLeft, '6px');
    const marginRight = parseMargin(style?.marginRight, '6px');
    slot.style.margin = `${marginTop} ${marginRight} ${marginBottom} ${marginLeft}`;
    let width = '';
    if (style?.width && style.width !== 'auto') {
      width = style.width;
    } else if (source?.offsetWidth) {
      width = `${source.offsetWidth}px`;
    }
    if (width) {
      slot.style.width = width;
      button.style.width = width;
    } else {
      slot.style.width = '';
      button.style.width = '32px';
    }
    let height = '';
    if (style?.height && style.height !== 'auto') {
      height = style.height;
    } else if (source?.offsetHeight) {
      height = `${source.offsetHeight}px`;
    }
    if (height) {
      slot.style.height = height;
      button.style.height = height;
    } else {
      slot.style.height = '';
      button.style.height = '32px';
    }
    button.style.margin = '0';
    this.log('sync-anchor', { sourceTag: source?.tagName });
    return slot;
  }

  setButtonActive(isActive) {
    const button = this.ensureButton();
    if (!button) {
      return;
    }
    button.classList.add('tfr-topnav-action', 'tfr-topnav-action--icon');
    button.classList.toggle('is-active', Boolean(isActive));
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }

  injectButton() {
    let mountInfo = null;
    try {
      mountInfo = this.findMountPoint();
    } catch (error) {
      this.log('find-mount-error', error);
      return;
    }
    const button = this.ensureButton();
    if (!button) {
      this.log('button-missing');
      return;
    }
    if (!mountInfo) {
      this.log('mount-missing');
      this.scheduleRetry();
      return;
    }
    const { parent, reference, anchor } = mountInfo;
    if (!parent) {
      this.log('mount-no-parent');
      this.scheduleRetry();
      return;
    }
    try {
      const slot = this.syncWithAnchor(anchor, parent);
      if (!slot) {
        this.log('slot-missing');
        this.scheduleRetry();
        return;
      }
      if (!slot.contains(button)) {
        slot.innerHTML = '';
        slot.appendChild(button);
      }
      let insertionParent = parent;
      let insertionReference = reference;
      const anchorParent = anchor?.parentElement || null;
      const anchorGrand = anchorParent?.parentElement || null;
      if (anchorParent && this.isUsableParent(anchorParent) && anchorParent !== parent) {
        insertionParent = anchorParent;
        insertionReference = anchor || null;
      }
      if (anchorGrand && this.isUsableParent(anchorGrand) && anchorGrand !== parent && anchorGrand !== insertionParent) {
        insertionParent = anchorGrand;
        insertionReference = anchorParent || anchor || null;
      }
      if (anchor && anchor.parentElement === insertionParent) {
        insertionReference = anchor;
      } else if (anchorParent && anchorParent.parentElement === insertionParent) {
        insertionReference = anchorParent;
      }
      if (!insertionReference) {
        // Force the slot before existing actions so the button renders on the left.
        insertionReference = Array.from(insertionParent.children).find((child) => child !== slot) || null;
      }
      if (insertionReference === slot) {
        insertionReference = slot.nextElementSibling;
      }
      if (slot.parentElement !== insertionParent) {
        if (insertionReference) {
          insertionParent.insertBefore(slot, insertionReference);
          this.log('slot-insert-before', { parentTag: insertionParent.tagName });
        } else {
          insertionParent.appendChild(slot);
          this.log('slot-append', { parentTag: insertionParent.tagName });
        }
      } else if (insertionReference && slot.nextElementSibling !== insertionReference) {
        insertionParent.insertBefore(slot, insertionReference);
        this.log('slot-reposition', { parentTag: insertionParent.tagName });
      } else {
        this.log('slot-already-mounted');
      }
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
    } catch (error) {
      this.log('inject-error', error);
      this.scheduleRetry();
    }
  }

}



class FeatureController {
  constructor(store) {
    this.store = store;
    this.chatHistory = null;
    this.viewerCardHistory = null;
    this.moderationTracker = null;
    this.moderationHistoryUI = null;
    this.unsubscribe = null;
  }

  init() {
    this.applyPreferences(this.store.getState().preferences || {});
    this.unsubscribe = this.store.subscribe((event) => {
      if (event?.kind === CHANGE_KIND.STATE && event.state?.preferences) {
        this.applyPreferences(event.state.preferences);
      }
    });
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.teardownModeration();
    this.teardownChatHistory();
  }

  applyPreferences(prefs) {
    const wantsChatHistory = prefs.chatHistoryEnabled !== false;
    if (wantsChatHistory) {
      this.ensureChatHistory();
    } else {
      this.teardownModeration();
      this.teardownChatHistory();
    }
    const wantsModeration = wantsChatHistory && prefs.moderationHistoryEnabled !== false;
    if (wantsModeration) {
      this.ensureModerationFeatures();
    } else {
      this.teardownModeration();
    }
  }

  ensureChatHistory() {
    if (this.chatHistory) {
      return;
    }
    this.chatHistory = new ChatHistoryTracker();
    this.chatHistory.init();
    this.viewerCardHistory = new ViewerCardHistoryRenderer(this.chatHistory);
    this.viewerCardHistory.init();
  }

  teardownChatHistory() {
    this.viewerCardHistory?.dispose();
    this.viewerCardHistory = null;
    this.chatHistory?.dispose();
    this.chatHistory = null;
  }

  ensureModerationFeatures() {
    if (this.moderationTracker || !this.chatHistory) {
      if (this.moderationTracker && !this.moderationHistoryUI) {
        this.moderationHistoryUI = new ModerationHistoryUI(this.moderationTracker);
        this.moderationHistoryUI.init();
      }
      return;
    }
    this.moderationTracker = new ModerationActionTracker(this.chatHistory);
    this.moderationTracker.init();
    this.moderationHistoryUI = new ModerationHistoryUI(this.moderationTracker);
    this.moderationHistoryUI.init();
  }

  teardownModeration() {
    this.moderationHistoryUI?.dispose();
    this.moderationHistoryUI = null;
    this.moderationTracker?.dispose();
    this.moderationTracker = null;
  }
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

    const overlay = new FavoritesOverlay(store);
    const topNav = new TopNavManager(overlay);
    topNav.init();

    const updateNotifier = new UpdateNotifier();
    updateNotifier.init();

    window.addEventListener('focus', () => store.refreshLiveData());
    window.addEventListener('beforeunload', () => {
      sidebar.dispose();
      funnelButton.dispose();
      overlay.dispose();
      topNav.dispose();
      featureController.dispose();
      updateNotifier.dispose();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();










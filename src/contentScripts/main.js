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
      'settings.chatHistory.toggle': 'Messages sur les fiches viewers',
      'settings.chatHistory.description': 'Affiche les derniers messages captur\u00e9s dans la carte d\u2019un viewer.',
      'settings.moderation.toggle': 'Bouton historique mod\u00e9ration',
      'settings.moderation.description': 'Ajoute un bouton dans le chat pour consulter les bans, timeouts et messages supprim\u00e9s.',
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
      'settings.chatHistory.toggle': 'Viewer-card chat messages',
      'settings.chatHistory.description': 'Shows captured recent messages inside viewer cards.',
      'settings.moderation.toggle': 'Moderation history button',
      'settings.moderation.description': 'Adds a chat button for bans, timeouts, and deleted messages.',
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
    CHANGE_KIND,
    POLL_INTERVAL_MS,
    DEFAULT_AVATAR,
    deepCopy,
    t,
    sanitizeCategoryList,
    fetchStreamerLiveData,
    getLiveDataEntry,
    inferCurrentPageLiveData,
    shouldDisplayFavorite
  });
  if (!FavoritesStore) {
    throw new Error('[TFR] favorites store module is missing');
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
    this.draggedCategoryStartX = 0;
    this.selectedFavorites = new Set();
    this.activeFavoriteLogin = null;
    this.categorySuggestionCache = new Map();
    this.unsubscribe = this.store.subscribe(() => {
      if (this.isOpen) {
        this.render();
      }
    });
    this.handleEscapeKeydown = (event) => {
      if (event.key === 'Escape' && this.isOpen) {
        this.close();
      }
    };
    document.addEventListener('keydown', this.handleEscapeKeydown);
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
    this.draggedCategoryStartX = 0;
    this.selectedFavorites.clear();
    this.activeFavoriteLogin = null;
    this.closeListeners.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[TFR] Overlay close listener error', error);
      }
    });
  }

  dispose() {
    this.close();
    this.unsubscribe?.();
    this.unsubscribe = null;
    document.removeEventListener('keydown', this.handleEscapeKeydown);
    this.openListeners.clear();
    this.closeListeners.clear();
    this.categorySuggestionCache.clear();
    this.root = null;
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
        description: t('settings.chatHistory.description'),
        handler: async (checked) => {
          await this.store.setChatHistoryEnabled(checked);
          this.render();
        }
      },
      {
        key: 'moderationHistoryEnabled',
        label: t('settings.moderation.toggle'),
        description: t('settings.moderation.description'),
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
      const body = document.createElement('span');
      body.className = 'tfr-feature-toggle__body';
      const label = document.createElement('strong');
      label.textContent = toggleConfig.label;
      const description = document.createElement('small');
      description.textContent = toggleConfig.description;
      body.appendChild(label);
      body.appendChild(description);
      item.appendChild(body);
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

  openChannel(login) {
    const extensionApi = globalThis.chrome ?? globalThis.browser;
    if (extensionApi?.runtime?.sendMessage) {
      try {
        extensionApi.runtime.sendMessage({ type: 'TFR_OPEN_CHANNEL_TAB', login });
      } catch (error) {
        window.open(`https://www.twitch.tv/${login}`, '_blank', 'noopener');
      }
    } else {
      window.open(`https://www.twitch.tv/${login}`, '_blank', 'noopener');
    }
  }

  createFavoriteChip(fav, liveData) {
    const normalizedLogin = fav.login?.toLowerCase();
    const wrapper = document.createElement('div');
    wrapper.className = 'tfr-free-chip';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tfr-free-avatar';
    button.title = fav.displayName || fav.login;
    if (normalizedLogin && this.selectedFavorites.has(normalizedLogin)) {
      button.classList.add('is-selected');
    }

    const img = document.createElement('img');
    img.src = getLiveDataEntry(liveData, fav)?.avatarUrl || fav.avatarUrl || DEFAULT_AVATAR;
    img.alt = '';
    button.appendChild(img);

    const label = document.createElement('span');
    label.className = 'tfr-visually-hidden';
    label.textContent = fav.displayName || fav.login;
    button.appendChild(label);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!normalizedLogin) {
        return;
      }
      const isSelected = this.selectedFavorites.has(normalizedLogin);
      if (event.ctrlKey || event.metaKey) {
        if (isSelected) {
          this.selectedFavorites.delete(normalizedLogin);
        } else {
          this.selectedFavorites.add(normalizedLogin);
        }
        this.render();
        return;
      }
      if (!isSelected || this.selectedFavorites.size > 1) {
        this.selectedFavorites.clear();
        this.selectedFavorites.add(normalizedLogin);
        this.render();
      }
      this.openChannel(fav.login);
    });

    this.makeFavoriteDraggable(button, fav.login);
    wrapper.appendChild(button);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'tfr-free-chip__remove';
    removeButton.title = 'Retirer des favoris';
    removeButton.textContent = '×';
    removeButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.store.removeFavorite(fav.login);
      this.render();
    });
    wrapper.appendChild(removeButton);

    return wrapper;
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
    const rootDropZone = document.createElement('div');
    rootDropZone.className = 'tfr-category-root-dropzone';
    rootDropZone.textContent = 'Déposer ici pour remettre au niveau racine';
    this.setupCategoryDropTarget(rootDropZone, null);

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

    this.setupCategoryDropTarget(cards, null);
    column.appendChild(rootDropZone);
    column.appendChild(cards);
    return column;
  }

  buildCategoryCard(node, assignmentsMap, aggregatedCounts, liveData, term, depth) {
    const card = document.createElement('div');
    card.className = 'tfr-category-card';
    card.dataset.categoryId = node.id;
    card.dataset.depth = String(depth);
    card.style.setProperty('--card-depth', String(depth));
    card.draggable = true;
    card.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', node.id);
        event.dataTransfer.setData('application/json', JSON.stringify({ categoryId: node.id }));
        event.dataTransfer.effectAllowed = 'move';
      }
      card.classList.add('is-dragging');
      this.draggedCategoryId = node.id;
      this.draggedCategoryStartX = event.clientX || 0;
    });
    card.addEventListener('dragend', (event) => {
      event.stopPropagation();
      card.classList.remove('is-dragging');
      this.draggedCategoryId = null;
      this.draggedCategoryStartX = 0;
    });
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

    const moveUpBtn = document.createElement('button');
    moveUpBtn.type = 'button';
    moveUpBtn.className = 'tfr-chip-action';
    moveUpBtn.textContent = '↑';
    moveUpBtn.title = 'Déplacer vers le haut';
    moveUpBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.store.moveCategoryUp(node.id);
      this.render();
    });
    actions.appendChild(moveUpBtn);

    const moveDownBtn = document.createElement('button');
    moveDownBtn.type = 'button';
    moveDownBtn.className = 'tfr-chip-action';
    moveDownBtn.textContent = '↓';
    moveDownBtn.title = 'Déplacer vers le bas';
    moveDownBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.store.moveCategoryDown(node.id);
      this.render();
    });
    actions.appendChild(moveDownBtn);

    if (depth > 0) {
      const outdentBtn = document.createElement('button');
      outdentBtn.type = 'button';
      outdentBtn.className = 'tfr-chip-action';
      outdentBtn.textContent = '←';
      outdentBtn.title = 'Remonter d’un niveau';
      outdentBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await this.store.outdentCategory(node.id);
        this.render();
      });
      actions.appendChild(outdentBtn);
    }

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
    const normalizedLogin = fav.login?.toLowerCase();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tfr-category-square';
    button.title = t('favorites.configure', { name: fav.displayName || fav.login });
    if (normalizedLogin && this.selectedFavorites.has(normalizedLogin)) {
      button.classList.add('is-selected');
    }

    const avatar = document.createElement('img');
    avatar.className = 'tfr-category-square__avatar';
    avatar.src = getLiveDataEntry(liveData, fav)?.avatarUrl || fav.avatarUrl || DEFAULT_AVATAR;
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
    if (this.activeFavoriteLogin === normalizedLogin) {
      button.classList.add('is-active');
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!normalizedLogin) {
        return;
      }
      const isSelected = this.selectedFavorites.has(normalizedLogin);
      if (event.ctrlKey || event.metaKey) {
        if (isSelected) {
          this.selectedFavorites.delete(normalizedLogin);
        } else {
          this.selectedFavorites.add(normalizedLogin);
        }
        this.render();
        return;
      }
      if (!isSelected || this.selectedFavorites.size > 1) {
        this.selectedFavorites.clear();
        this.selectedFavorites.add(normalizedLogin);
        this.render();
      }
      if (this.draggedLogin) {
        return;
      }
      this.openFavoriteDetails(fav.login);
    });
    return button;
  }

  parseDraggedLogins(event) {
    const data = [];
    const rawJson = event.dataTransfer?.getData('application/json');
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && Array.isArray(parsed.logins)) {
          parsed.logins.forEach((login) => {
            if (typeof login === 'string' && login.trim()) {
              data.push(login.toLowerCase());
            }
          });
        }
      } catch {
        // ignore
      }
    }
    if (!data.length) {
      const rawText = event.dataTransfer?.getData('text/plain') || '';
      rawText.split(',').forEach((login) => {
        const trimmed = String(login).trim();
        if (trimmed) {
          data.push(trimmed.toLowerCase());
        }
      });
    }
    if (!data.length && Array.isArray(this.draggedLogin)) {
      this.draggedLogin.forEach((login) => {
        if (typeof login === 'string' && login.trim()) {
          data.push(login.toLowerCase());
        }
      });
    }
    return Array.from(new Set(data));
  }

  parseDraggedCategoryId(event) {
    const rawJson = event.dataTransfer?.getData('application/json');
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed.categoryId === 'string' && parsed.categoryId.trim()) {
          return parsed.categoryId;
        }
        if (parsed && Array.isArray(parsed.logins)) {
          return null;
        }
      } catch {
        // ignore
      }
    }
    if (typeof this.draggedCategoryId === 'string' && this.draggedCategoryId.trim()) {
      return this.draggedCategoryId;
    }
    return null;
  }

  getCategoryDropPlacement(event, element) {
    const isCategoryTarget =
      element?.classList?.contains('tfr-category-item') || element?.classList?.contains('tfr-category-card');
    if (!isCategoryTarget) {
      return 'inside';
    }
    const depth = Number(element.dataset?.depth || 0);
    const elementRect = element.getBoundingClientRect();
    if (depth > 0 && this.draggedCategoryStartX && event.clientX <= this.draggedCategoryStartX - 24) {
      return 'out';
    }
    if (depth > 0 && event.clientX <= elementRect.left + 32) {
      return 'root';
    }
    const header =
      element.querySelector?.('.tfr-category-item-header') || element.querySelector?.('.tfr-category-card__header');
    const rect = (header || element).getBoundingClientRect();
    if (!rect.height) {
      return 'inside';
    }
    const offsetY = event.clientY - rect.top;
    if (offsetY < 0 || offsetY > rect.height) {
      return 'inside';
    }
    if (offsetY < rect.height * 0.3) {
      return 'before';
    }
    if (offsetY > rect.height * 0.7) {
      return 'after';
    }
    return 'inside';
  }

  setCategoryDropIndicator(element, placement) {
    element.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-inside', 'is-drop-root', 'is-drop-out');
    if (placement === 'before') {
      element.classList.add('is-drop-before');
    } else if (placement === 'after') {
      element.classList.add('is-drop-after');
    } else if (placement === 'root') {
      element.classList.add('is-drop-root');
    } else if (placement === 'out') {
      element.classList.add('is-drop-out');
    } else {
      element.classList.add('is-drop-inside');
    }
  }

  clearCategoryDropIndicator(element) {
    element.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after', 'is-drop-inside', 'is-drop-root', 'is-drop-out');
  }

  makeFavoriteDraggable(element, login) {
    element.draggable = true;
    element.dataset.login = login;
    element.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      const normalized = login?.toLowerCase();
      let selected = [];
      if (normalized && this.selectedFavorites.has(normalized) && this.selectedFavorites.size > 1) {
        selected = Array.from(this.selectedFavorites);
      } else if (normalized) {
        selected = [normalized];
      }
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', selected[0] || normalized || '');
        event.dataTransfer.setData('application/json', JSON.stringify({ logins: selected }));
        event.dataTransfer.effectAllowed = 'move';
      }
      element.classList.add('is-dragging');
      this.draggedLogin = selected.length ? selected : normalized ? [normalized] : null;
    });
    element.addEventListener('dragend', (event) => {
      event.stopPropagation();
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

    const dragHint = document.createElement('div');
    dragHint.className = 'tfr-category-help';
    dragHint.textContent = 'Glissez une catégorie sur l’en-tête d’un groupe pour la réordonner, au centre pour en faire une sous-catégorie, ou dans la zone racine pour la remonter.';

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
    const rootDropZone = document.createElement('div');
    rootDropZone.className = 'tfr-category-root-dropzone';
    rootDropZone.textContent = 'Déposer ici pour remettre au niveau racine';
    this.setupCategoryDropTarget(rootDropZone, null);
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
        uncategorizedItem.appendChild(title);

        const chips = document.createElement('div');
        chips.className = 'tfr-category-assigned';
        uncategorizedFavorites.forEach((fav) => {
        const chipWrapper = document.createElement('div');
        chipWrapper.className = 'tfr-category-chip-wrapper';

        const chipButton = document.createElement('button');
        chipButton.type = 'button';
        chipButton.className = 'tfr-category-chip-btn';
        chipButton.title = fav.displayName || fav.login;
        chipButton.addEventListener('click', () => {
          this.openChannel(fav.login);
        });

        const chipAvatar = document.createElement('img');
        chipAvatar.className = 'tfr-category-chip-btn__avatar';
        chipAvatar.src = fav.avatarUrl || DEFAULT_AVATAR;
        chipAvatar.alt = '';
        const chipLabel = document.createElement('span');
        chipLabel.textContent = fav.displayName || fav.login;
        chipButton.appendChild(chipAvatar);
        chipButton.appendChild(chipLabel);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'tfr-category-chip-remove';
        removeButton.title = 'Retirer des favoris';
        removeButton.textContent = '×';
        removeButton.addEventListener('click', async (event) => {
          event.stopPropagation();
          await this.store.removeFavorite(fav.login);
          this.render();
        });

        chipWrapper.appendChild(chipButton);
        chipWrapper.appendChild(removeButton);
        chips.appendChild(chipWrapper);
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

  this.setupCategoryDropTarget(list, null);
    categoriesSection.appendChild(header);
    categoriesSection.appendChild(dragHint);
    categoriesSection.appendChild(addCategory);
    categoriesSection.appendChild(rootDropZone);
    categoriesSection.appendChild(list);
    content.appendChild(categoriesSection);
  }

  appendCategoryListItem(container, category, depth, assignmentsMap, aggregatedCounts, favoritesArray) {
    const item = document.createElement('div');
    item.className = 'tfr-category-item';
    item.dataset.depth = String(depth);
    item.style.marginLeft = `${depth * 16}px`;
    item.draggable = true;
    item.dataset.categoryId = category.id;
    item.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', category.id);
        event.dataTransfer.setData('application/json', JSON.stringify({ categoryId: category.id }));
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setDragImage(item, 0, 0);
      }
      item.classList.add('is-dragging');
      this.draggedCategoryId = category.id;
      this.draggedCategoryStartX = event.clientX || 0;
    });
    item.addEventListener('dragend', (event) => {
      event.stopPropagation();
      item.classList.remove('is-dragging');
      this.draggedCategoryId = null;
      this.draggedCategoryStartX = 0;
    });

    const title = document.createElement('div');
    title.className = 'tfr-category-item-title';
    const name = document.createElement('span');
    const indentText = depth > 1 ? '  '.repeat(depth - 1) : '';
    const bullet = depth ? '- ' : '';
    name.textContent = `${indentText}${bullet}${category.name}`;
    const meta = document.createElement('span');
    meta.className = 'tfr-category-meta';
    const totalCount = aggregatedCounts.get(category.id) || 0;
    meta.textContent = t('categories.totalMeta', { count: totalCount });
    title.appendChild(name);
    title.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'tfr-category-item-actions';

    const moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'tfr-button tfr-button--ghost';
    moveUp.textContent = '↑';
    moveUp.title = 'Déplacer vers le haut';
    moveUp.addEventListener('click', async () => {
      await this.store.moveCategoryUp(category.id);
      this.render();
    });

    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'tfr-button tfr-button--ghost';
    moveDown.textContent = '↓';
    moveDown.title = 'Déplacer vers le bas';
    moveDown.addEventListener('click', async () => {
      await this.store.moveCategoryDown(category.id);
      this.render();
    });

    const indent = document.createElement('button');
    indent.type = 'button';
    indent.className = 'tfr-button tfr-button--ghost';
    indent.textContent = '→';
    indent.title = 'Déplacer dans une sous-catégorie';
    indent.addEventListener('click', async () => {
      await this.store.indentCategory(category.id);
      this.render();
    });

    const outdent = document.createElement('button');
    outdent.type = 'button';
    outdent.className = 'tfr-button tfr-button--ghost';
    outdent.textContent = '←';
    outdent.title = 'Remonter de niveau';
    outdent.addEventListener('click', async () => {
      await this.store.outdentCategory(category.id);
      this.render();
    });

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

    actions.appendChild(moveUp);
    actions.appendChild(moveDown);
    actions.appendChild(indent);
    actions.appendChild(outdent);
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

  setupCategoryDropTarget(element, targetCategoryId) {
    const highlight = (event) => {
      element.classList.add('is-drop-target');
      const draggedCategoryId = this.parseDraggedCategoryId(event);
      if (draggedCategoryId && draggedCategoryId !== targetCategoryId) {
        this.setCategoryDropIndicator(element, this.getCategoryDropPlacement(event, element));
      }
    };
    const removeHighlight = () => this.clearCategoryDropIndicator(element);
    const canHandle = (event) => {
      const types = event.dataTransfer?.types;
      if (!types) return false;
      const available = Array.from(types);
      return available.includes('application/json') || available.includes('text/plain') || available.includes('Text');
    };
    element.addEventListener('dragover', (event) => {
      if (!canHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      highlight(event);
    });
    element.addEventListener('dragenter', (event) => {
      if (!canHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      highlight(event);
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

      const draggedCategoryId = this.parseDraggedCategoryId(event);
      if (draggedCategoryId) {
        const placement = targetCategoryId ? this.getCategoryDropPlacement(event, element) : 'root';
        if (draggedCategoryId !== targetCategoryId || placement === 'root' || placement === 'out') {
          await this.store.moveCategory(draggedCategoryId, targetCategoryId || null, placement);
          this.draggedCategoryId = null;
          this.render();
          return;
        }
      }

      const logins = this.parseDraggedLogins(event);
      if (!logins.length) return;
      try {
        if (targetCategoryId) {
          await Promise.all(logins.map((login) => this.store.setFavoriteCategory(login, targetCategoryId)));
        }
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
      if (!types) return false;
      const available = Array.from(types);
      return available.includes('application/json') || available.includes('text/plain') || available.includes('Text');
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
      const logins = this.parseDraggedLogins(event);
      if (!logins.length) return;
      try {
        await Promise.all(logins.map((login) => this.store.clearFavoriteCategory(login)));
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
    const live = getLiveDataEntry(liveData, login);
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
    const visibilityInfo = getSidebarVisibilityInfo(favorite, live);
    const visibilityLine = document.createElement('p');
    visibilityLine.className = visibilityInfo.visible
      ? 'tfr-details-info tfr-details-info--highlight'
      : 'tfr-details-info tfr-details-info--warning';
    visibilityLine.textContent = visibilityInfo.reason;
    infoSection.appendChild(visibilityLine);
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


  const TopNavManager = window.TFRTopNav?.create?.({
    t,
    sendExtensionMessage,
    extensionApi
  });
  if (!TopNavManager) {
    throw new Error('[TFR] top navigation module is missing');
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
    const wantsViewerChatHistory = prefs.chatHistoryEnabled !== false;
    const wantsModeration = prefs.moderationHistoryEnabled !== false;
    const needsMessageTracker = wantsViewerChatHistory || wantsModeration;

    if (needsMessageTracker) {
      this.ensureChatHistory();
    } else {
      this.teardownModeration();
      this.teardownChatHistory();
      return;
    }

    if (wantsViewerChatHistory) {
      this.ensureViewerCardHistory();
    } else {
      this.teardownViewerCardHistory();
    }

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
  }

  ensureViewerCardHistory() {
    if (this.viewerCardHistory || !this.chatHistory) {
      return;
    }
    this.viewerCardHistory = new ViewerCardHistoryRenderer(this.chatHistory);
    this.viewerCardHistory.init();
  }

  teardownViewerCardHistory() {
    this.viewerCardHistory?.dispose();
    this.viewerCardHistory = null;
  }

  teardownChatHistory() {
    this.teardownViewerCardHistory();
    this.chatHistory?.dispose();
    this.chatHistory = null;
  }

  ensureModerationFeatures() {
    if (!this.chatHistory) {
      this.ensureChatHistory();
    }
    if (this.moderationTracker) {
      if (!this.moderationHistoryUI) {
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

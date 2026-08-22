
(() => {
  const STORAGE_KEY = 'tfr_state';
  const LIVE_CACHE_KEY = 'tfr_live_cache';
  const DEFAULT_STATE = {
    revision: 0,
    activeProfileId: 'default',
    profiles: {},
    workspaceMode: 'personal',
    personalWorkspaceSnapshot: null,
    activeSharedSpaceId: '',
    sharedSpaces: {},
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
      moderationHistoryEnabled: true,
      sevenTvEmotesEnabled: false,
      betterTtvEmotesEnabled: false,
      chatEmoteAutocompleteEnabled: false,
      chatEmotePickerEnabled: false,
      playerLatencyEnabled: false,
      playerRecoveryEnabled: false,
      autoClaimChannelPointsEnabled: false,
      playerAudioCompressorEnabled: false,
      playerAudioCompressorPreset: 'balanced',
      playerVolumeNormalizerEnabled: false,
      playerVolumeTargetDb: -16,
      playerVolumeMaxReductionDb: -24,
      onboardingTutorialVersion: 0,
      onboardingTutorialStep: 0,
      onboardingTutorialDismissed: false,
      chatFontEnabled: false,
      chatFontFamily: 'system',
      chatCustomFontName: '',
      chatCustomFontDataUrl: '',
      chatNoPaddingEnabled: false,
      chatPaddingPx: 0,
      chatMentionHighlightEnabled: false,
      chatMentionHighlightColor: '#9147ff',
      chatMentionSoundEnabled: false,
      chatMentionSoundId: 'soft',
      showDeletedMessagesEnabled: false,
      showFullRepliesEnabled: false,
      liveHoverPreviewEnabled: false,
      liveHoverPreviewMode: 'image'
    }
  };

  const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const extensionApi = globalThis.browser ?? globalThis.chrome;
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
    query ($login: String, $userId: ID) {
      user(login: $login, id: $userId) {
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

  const { messages: I18N_MESSAGES, pluralMessages: I18N_PLURAL_MESSAGES } = window.TFRContentI18nMessages;

  const { t } = globalThis.__TFR_I18N__.createTranslator({
    messages: I18N_MESSAGES,
    pluralMessages: I18N_PLURAL_MESSAGES,
    navigator
  });

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

  const getChannelFromLocation = window.TFRChannelLocation?.getChannelFromLocation;
  if (!getChannelFromLocation) throw new Error('[TFR] channel location module is missing');

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
    const hasLiveChat = Boolean(
      document.querySelector(
        '[data-a-target="chat-input"], [data-a-target="chat-send-button"], [data-test-selector="chat-scrollable-area__message-container"]'
      )
    );
    if (!hasLiveMarker && !hasLiveChat) {
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
      userId: String(fallback.userId || ''),
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
    userId: String(fallback.userId || fallback.id || ''),
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
    const lastConfirmedAt = Number(fallback?.lastConfirmedAt || 0);
    const isRecentlyConfirmed = Number.isFinite(lastConfirmedAt)
      && lastConfirmedAt > 0
      && Date.now() - lastConfirmedAt <= 5 * 60 * 1000;
    if (fallback && fallback.isLive && isRecentlyConfirmed) {
      return {
        ...offline,
        ...fallback,
        userId: String(fallback.userId || fallback.id || offline.userId || ''),
        login: String(fallback.login || login || '').toLowerCase(),
        displayName: fallback.displayName || offline.displayName,
        avatarUrl: fallback.avatarUrl || offline.avatarUrl,
        lastConfirmedAt,
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
        body: JSON.stringify({
          query: STREAM_STATE_QUERY,
          variables: fallback?.userId
            ? { login: null, userId: String(fallback.userId) }
            : { login, userId: null }
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const data = Array.isArray(payload) ? payload[0]?.data : payload?.data;
      const user = data?.user;
      if (!user) {
        return {
          ...createOfflineLiveData(login, fallback),
          fetchFailed: false,
          userNotFound: true,
          lastConfirmedAt: Date.now()
        };
      }
      const stream = user.stream;
      return {
        userId: String(user.id || fallbackLiveData.userId || ''),
        login: String(user.login || login).toLowerCase(),
        displayName: user.displayName || user.login || login,
        avatarUrl: user.profileImageURL || fallbackLiveData.avatarUrl || DEFAULT_AVATAR,
        isLive: Boolean(stream),
        viewers: stream?.viewersCount || 0,
        title: stream?.title || '',
        game: stream?.game?.name || '',
        startedAt: stream?.createdAt || null,
        lastConfirmedAt: Date.now(),
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
  const NoopEnhancement = class {
    init() {}
    configure() {}
    dispose() {}
  };
  let streamEnhancements = null;
  try {
    streamEnhancements = window.TFRStreamEnhancements?.create?.({
      t,
      audioWorkletModuleUrl: extensionApi?.runtime?.getURL?.(
        'src/contentScripts/worklets/audioLevelProcessor.js'
      ) || ''
    }) || null;
  } catch (error) {
    console.error('[TFR] stream enhancements unavailable', error);
  }
  const ThirdPartyChatEmotes = streamEnhancements?.ThirdPartyChatEmotes || NoopEnhancement;
  const PlayerLatencyIndicator = streamEnhancements?.PlayerLatencyIndicator || NoopEnhancement;
  const PlayerRecovery = window.TFRPlayerRecovery?.PlayerRecovery || NoopEnhancement;
  const AutoClaimChannelPoints = streamEnhancements?.AutoClaimChannelPoints || NoopEnhancement;
  const PlayerAudioCompressor = streamEnhancements?.PlayerAudioCompressor || NoopEnhancement;
  const ChatFontManager = streamEnhancements?.ChatFontManager || NoopEnhancement;
  const ChatPaddingManager = streamEnhancements?.ChatPaddingManager || NoopEnhancement;
  const ChatMentionHighlighter = streamEnhancements?.ChatMentionHighlighter || NoopEnhancement;
  const DeletedMessageViewer = streamEnhancements?.DeletedMessageViewer || NoopEnhancement;
  const ReplyExpansionTracker = streamEnhancements?.ReplyExpansionTracker || NoopEnhancement;
  const ChatMessageCopyAction = streamEnhancements?.ChatMessageCopyAction || NoopEnhancement;
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
  const ViewerCardSharedInvite = window.TFRViewerCardSharedInvite?.create?.({ t });
  if (!ViewerCardSharedInvite) {
    throw new Error('[TFR] viewer card shared invite module is missing');
  }
  const OnboardingTutorial = window.TFROnboardingTutorial?.create?.({ t });
  if (!OnboardingTutorial) {
    throw new Error('[TFR] onboarding tutorial module is missing');
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
    ModerationHistoryUI,
    ThirdPartyChatEmotes,
    PlayerLatencyIndicator,
    PlayerRecovery,
    AutoClaimChannelPoints,
    PlayerAudioCompressor,
    ChatFontManager,
    ChatPaddingManager,
    ChatMentionHighlighter,
    DeletedMessageViewer,
    ReplyExpansionTracker,
    ChatMessageCopyAction
  });
  if (!FeatureController) {
    throw new Error('[TFR] feature controller module is missing');
  }
  const app = window.TFRAppBootstrap?.create?.({
    FavoritesStore, FeatureController, SidebarRenderer, ChannelFavoriteButton,
    FavoritesOverlay, TopNavManager, UpdateNotifier, ViewerCardSharedInvite,
    OnboardingTutorial
  });
  if (!app) throw new Error('[TFR] application bootstrap module is missing');
  const bootstrap = () => app.start();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();

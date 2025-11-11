const extensionApi = globalThis.chrome ?? globalThis.browser;

const actionApi = extensionApi.action ?? extensionApi.browserAction ?? null;
const STORAGE_KEY = 'tfr_state';
const LIVE_CACHE_KEY = 'tfr_live_cache';
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
    toastDurationSeconds: 6
  }
};

const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';
const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const STREAM_STATE_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      login
      displayName
      profileImageURL(width: 300)
      stream {
        id
        title
        viewersCount
        createdAt
        game {
          id
          name
        }
      }
    }
  }
`;

const POLL_ALARM = 'tfr_live_poll';
const POLL_INTERVAL_MINUTES = 2;
const LIVE_CACHE_TTL = 60 * 1000;
const MAX_NOTIFICATIONS = 2;
const BADGE_COLOR = '#9147ff';

const overlayTabs = new Set();
let standaloneWindowId = null;
const SIDE_PANEL_PATH = 'panel/sidepanel.html';
const STANDALONE_PANEL_PATH = 'panel/standalone.html';
const POPUP_PANEL_PATH = 'panel/popup.html';
const popupTabs = new Set();

let liveCache = null;
let liveCacheTimestamp = 0;
let refreshPromise = null;

const sendMessageToTab = (tabId, payload) =>
  new Promise((resolve) => {
    if (!extensionApi.tabs?.sendMessage) {
      resolve({ ok: false, reason: 'unavailable' });
      return;
    }
    extensionApi.tabs.sendMessage(tabId, payload, (response) => {
      const lastError = extensionApi.runtime?.lastError;
      if (lastError) {
        const message = lastError.message || '';
        if (message.includes('No tab') || message.includes('Receiving end does not exist')) {
          overlayTabs.delete(tabId);
          resolve({ ok: false, reason: 'no_receiver', message });
          return;
        }
        resolve({ ok: false, reason: 'unknown', message });
        return;
      }
      resolve({ ok: true, response });
    });
  });

const setSidePanelBehavior = () => {
  try {
    extensionApi.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });
  } catch (error) {
    console.warn('[TFR] unable to set side panel behavior', error);
  }
};

const openSidePanel = async (tabId) => {
  if (!extensionApi.sidePanel?.setOptions || !extensionApi.sidePanel?.open) {
    return false;
  }
  try {
    await extensionApi.sidePanel.setOptions({
      tabId,
      path: SIDE_PANEL_PATH,
      enabled: true
    });
    await extensionApi.sidePanel.open({ tabId });
    return true;
  } catch (error) {
    console.error('[TFR] side panel open failed', error);
    return false;
  }
};

const isRestrictedUrl = (url = '') => {
  if (!url) return true;
  const normalized = url.toLowerCase();
  return (
    normalized.startsWith('chrome://') ||
    normalized.startsWith('edge://') ||
    normalized.startsWith('about:') ||
    normalized.startsWith('chrome-extension://') ||
    normalized.startsWith('https://chrome.google.com/webstore')
  );
};

const enablePopupForTab = async (tabId) => {
  if (!extensionApi.action?.setPopup) {
    return false;
  }
  try {
    await extensionApi.action.setPopup({ tabId, popup: POPUP_PANEL_PATH });
    popupTabs.add(tabId);
    return true;
  } catch (error) {
    console.error('[TFR] unable to set popup', error);
    popupTabs.delete(tabId);
    return false;
  }
};

const disablePopupForTab = async (tabId) => {
  if (!popupTabs.has(tabId) || !extensionApi.action?.setPopup) {
    return;
  }
  try {
    await extensionApi.action.setPopup({ tabId, popup: '' });
  } catch (error) {
    console.warn('[TFR] unable to clear popup', error);
  }
  popupTabs.delete(tabId);
};

const openPopupPanel = async (tabId) => {
  const enabled = await enablePopupForTab(tabId);
  if (!enabled) {
    return false;
  }
  if (extensionApi.action?.openPopup) {
    try {
      await extensionApi.action.openPopup();
      return true;
    } catch (error) {
      console.warn('[TFR] action.openPopup failed', error);
    }
  }
  return false;
};

const openStandalonePanel = async () => {
  if (!extensionApi?.runtime?.getURL) {
    return;
  }
  const panelUrl = extensionApi.runtime.getURL(STANDALONE_PANEL_PATH);
  try {
    if (standaloneWindowId && extensionApi.windows?.update) {
      await extensionApi.windows.update(standaloneWindowId, { focused: true });
      return;
    }
    if (extensionApi.windows?.create) {
      const created = await extensionApi.windows.create({
        url: panelUrl,
        type: 'popup',
        width: 320,
        height: 640
      });
      standaloneWindowId = created?.id || null;
      return;
    }
  } catch (error) {
    console.error('[TFR] standalone panel failed', error);
    standaloneWindowId = null;
  }
  if (extensionApi.tabs?.create) {
    extensionApi.tabs.create({ url: panelUrl });
  }
};

const openPrimaryPanel = async (tabId) => {
  if (!Number.isInteger(tabId)) {
    await openStandalonePanel();
    return;
  }
  const popupOpened = await openPopupPanel(tabId);
  if (popupOpened) {
    return;
  }
  const sidePanelOpened = tabId ? await openSidePanel(tabId) : false;
  if (sidePanelOpened) {
    return;
  }
  await openStandalonePanel();
};

const broadcastOverlayState = (snapshot) => {
  overlayTabs.forEach((tabId) => sendMessageToTab(tabId, { type: 'TFR_STATE_PUSH', ...snapshot }));
};

const broadcastOverlayToast = (entries) => {
  if (!entries?.length) return;
  overlayTabs.forEach((tabId) => sendMessageToTab(tabId, { type: 'TFR_OVERLAY_TOAST', entries }));
};

const normalizeCategoryName = (value) => {
  if (!value) return '';
  let output = String(value).trim().toLocaleLowerCase();
  if (typeof output.normalize === 'function') {
    output = output.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return output;
};

const cloneData = (value) => {
  try {
    return JSON.parse(JSON.stringify(value ?? {}));
  } catch (error) {
    console.warn('[TFR] failed to clone data', error);
    return {};
  }
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

const fetchStreamerLiveData = async (login) => {
  if (!login) {
    return null;
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
    console.error('[TFR] Background live fetch failed', login, error);
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

const seedDefaultStateIfNeeded = async () => {
  try {
    const stored = await extensionApi.storage.local.get(STORAGE_KEY);
    if (!stored || !stored[STORAGE_KEY]) {
      const initialCategory = {
        id: `cat_${Date.now()}`,
        name: 'Favoris',
        collapsed: false,
        sortOrder: Date.now()
      };
      await extensionApi.storage.local.set({
        [STORAGE_KEY]: {
          ...DEFAULT_STATE,
          categories: [initialCategory]
        }
      });
    }
  } catch (error) {
    console.error('[TFR] failed to seed default state', error);
  }
};

const updateBadge = async (count) => {
  if (!actionApi?.setBadgeText) {
    return;
  }
  try {
    if (actionApi.setBadgeBackgroundColor) {
      await actionApi.setBadgeBackgroundColor({ color: BADGE_COLOR });
    }
    await actionApi.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : '' });
  } catch (error) {
    console.warn('[TFR] unable to update badge text', error);
  }
};

const notifyNewLives = (entries) => {
  const eligible = entries.filter(({ fav }) => fav?.recentHighlightEnabled !== false);
  if (!eligible.length) {
    return;
  }
  const toastEntries = eligible.slice(0, MAX_NOTIFICATIONS).map(({ fav, live }) => ({
    fav: {
      login: fav.login,
      displayName: fav.displayName,
      avatarUrl: fav.avatarUrl
    },
    live: {
      login: live.login,
      displayName: live.displayName,
      avatarUrl: live.avatarUrl,
      viewers: live.viewers,
      game: live.game,
      title: live.title
    }
  }));
  broadcastOverlayToast(toastEntries);
};

const evaluateLiveStatus = async (reason = 'manual') => {
  const now = Date.now();
  const stored = await extensionApi.storage.local.get([STORAGE_KEY, LIVE_CACHE_KEY]);
  const state = stored?.[STORAGE_KEY] && typeof stored[STORAGE_KEY] === 'object' ? stored[STORAGE_KEY] : DEFAULT_STATE;
  const favorites = state.favorites || {};
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const logins = Object.keys(favorites);
  const previousLiveData = stored?.[LIVE_CACHE_KEY] && typeof stored[LIVE_CACHE_KEY] === 'object' ? stored[LIVE_CACHE_KEY] : {};

  const liveData = {};
  if (logins.length) {
    const results = await Promise.allSettled(logins.map((login) => fetchStreamerLiveData(login)));
    results.forEach((result, index) => {
      const login = logins[index];
      if (result.status === 'fulfilled' && result.value) {
        liveData[login] = result.value;
      } else {
        const fallbackFavorite = favorites[login];
        liveData[login] = {
          login,
          displayName: fallbackFavorite?.displayName || login,
          avatarUrl: fallbackFavorite?.avatarUrl || DEFAULT_AVATAR,
          isLive: false,
          viewers: 0,
          title: '',
          game: '',
          startedAt: null
        };
      }
    });
  }

  await extensionApi.storage.local.set({
    [LIVE_CACHE_KEY]: liveData,
    tfr_lastLiveUpdate: now
  });

  const currentlyLive = [];
  const newlyLive = [];
  logins.forEach((login) => {
    const fav = favorites[login];
    const live = liveData[login];
    if (!fav || !live) return;
    const matchesFilter = shouldDisplayFavorite(fav, live);
    const isLive = Boolean(live.isLive && matchesFilter);
    if (isLive) {
      currentlyLive.push({ fav, live });
    }
    const previouslyLive = Boolean(previousLiveData?.[login]?.isLive && shouldDisplayFavorite(fav, previousLiveData[login]));
    if (isLive && fav.recentHighlightEnabled !== false && !previouslyLive && !['install', 'startup'].includes(reason)) {
      newlyLive.push({ fav, live });
    }
  });

  await updateBadge(currentlyLive.length);
  if (newlyLive.length) {
    notifyNewLives(newlyLive);
  }

  const snapshot = {
    favorites: cloneData(favorites),
    categories: cloneData(categories),
    preferences: cloneData(state.preferences || DEFAULT_STATE.preferences),
    liveData: cloneData(liveData),
    timestamp: now
  };

  liveCache = snapshot;
  liveCacheTimestamp = now;
  broadcastOverlayState(snapshot);
  return snapshot;
};

const ensureLiveSnapshot = async (forceRefresh = false) => {
  if (!forceRefresh && liveCache && Date.now() - liveCacheTimestamp < LIVE_CACHE_TTL) {
    return liveCache;
  }
  if (!refreshPromise) {
    refreshPromise = evaluateLiveStatus('popup')
      .catch((error) => {
        console.error('[TFR] failed to refresh live snapshot', error);
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

const scheduleAlarm = () => {
  extensionApi.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MINUTES });
};

extensionApi.runtime.onInstalled.addListener(async () => {
  await seedDefaultStateIfNeeded();
  scheduleAlarm();
  setSidePanelBehavior();
  await evaluateLiveStatus('install');
});

extensionApi.runtime.onStartup.addListener(async () => {
  scheduleAlarm();
  setSidePanelBehavior();
  await evaluateLiveStatus('startup');
});

if (actionApi?.onClicked) {
  actionApi.onClicked.addListener((tab) => {
    openPrimaryPanel(tab?.id ?? null);
  });
}

if (extensionApi.tabs?.onRemoved) {
  extensionApi.tabs.onRemoved.addListener((tabId) => {
    overlayTabs.delete(tabId);
    popupTabs.delete(tabId);
  });
}

if (extensionApi.tabs?.onUpdated) {
  extensionApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!popupTabs.has(tabId)) {
      return;
    }
    if (!changeInfo.url && changeInfo.status !== 'complete') {
      return;
    }
    const url = changeInfo.url || tab?.url || '';
    if (!url) {
      return;
    }
    if (!isRestrictedUrl(url)) {
      disablePopupForTab(tabId);
    }
  });
}

if (extensionApi.windows?.onRemoved) {
  extensionApi.windows.onRemoved.addListener((windowId) => {
    if (windowId === standaloneWindowId) {
      standaloneWindowId = null;
    }
  });
}

extensionApi.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === POLL_ALARM) {
    evaluateLiveStatus('alarm');
  }
});

extensionApi.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
    evaluateLiveStatus('favorites-change');
  }
});

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'TFR_GET_POPUP_STATE') {
    if (sender?.tab?.id) {
      overlayTabs.add(sender.tab.id);
    }
    ensureLiveSnapshot(Boolean(message.forceRefresh))
      .then((snapshot) => {
        sendResponse({
          favorites: snapshot?.favorites || {},
          categories: snapshot?.categories || [],
          preferences: snapshot?.preferences || {},
          liveData: snapshot?.liveData || {},
          timestamp: snapshot?.timestamp || Date.now()
        });
      })
      .catch((error) => {
        sendResponse({ error: true, message: error?.message || 'unknown error' });
      });
    return true;
  } else if (message?.type === 'TFR_OPEN_CHANNEL_TAB') {
    if (message.login && extensionApi.tabs?.create) {
      extensionApi.tabs.create({ url: `https://www.twitch.tv/${message.login}` });
    }
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

const extensionApi = globalThis.chrome ?? globalThis.browser;

const actionApi = extensionApi.action ?? extensionApi.browserAction ?? null;
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
const DRIVE_BACKUP_FILE_NAME = 'twitch-favorites-sidebar-profiles.json';
const DRIVE_FILE_SPACE = 'drive';
const DRIVE_LEGACY_APPDATA_SPACE = 'appDataFolder';
const DRIVE_SYNC_STATE_KEY = 'tfr_drive_sync_state';
const WEB_AUTH_DRIVE_TOKEN_KEY = 'tfr_web_auth_drive_token';
const DRIVE_AUTH_MODE_KEY = 'tfr_drive_auth_mode';
const WEB_AUTH_CLIENT_ID = '242719267292-idbv4ualavd40nl8rsq4ea2pj0cii1r1.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
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
const UPDATE_ALARM = 'tfr_update_check';
const POLL_INTERVAL_MINUTES = 2;
const LIVE_CACHE_TTL = 60 * 1000;
const MAX_NOTIFICATIONS = 2;
const BADGE_COLOR = '#9147ff';
const UPDATE_BADGE_COLOR = '#ef4444';
const UPDATE_STORAGE_KEY = 'tfr_update_state';
const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const UPDATE_REPO_API_URL = 'https://api.github.com/repos/florioz/TwitchPinnedFavoris/releases/latest';
const UPDATE_REPO_URL = 'https://github.com/florioz/TwitchPinnedFavoris';

const overlayTabs = new Set();
const SIDE_PANEL_PATH = 'panel/sidepanel.html';

let liveCache = null;
let liveCacheTimestamp = 0;
let refreshPromise = null;
let liveBadgeCount = 0;
let updateBadgeAvailable = false;

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

const isSidePanelGestureError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('user gesture') || message.includes('may only be called in response');
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
    if (!isSidePanelGestureError(error)) {
      console.error('[TFR] side panel open failed', error);
    }
    return false;
  }
};

const openInjectedPanel = async (tabId) => {
  if (!Number.isInteger(tabId)) {
    return false;
  }
  const result = await sendMessageToTab(tabId, { type: 'TFR_TOGGLE_PANEL' });
  return Boolean(result?.ok);
};

const openPrimaryPanel = async (tabId) => {
  if (!Number.isInteger(tabId)) {
    return;
  }
  const injectedOpened = await openInjectedPanel(tabId);
  if (injectedOpened) {
    return;
  }
  const sidePanelOpened = tabId ? await openSidePanel(tabId) : false;
  if (sidePanelOpened) {
    return;
  }
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

const isDriveConfigured = () => {
  const manifest = extensionApi.runtime?.getManifest?.() || {};
  const clientId = manifest.oauth2?.client_id || '';
  return Boolean(extensionApi.identity?.getAuthToken && clientId && !clientId.includes('replacewithgoogleoauthclientid'));
};

const isWebAuthFlowAvailable = () => Boolean(extensionApi.identity?.launchWebAuthFlow && extensionApi.identity?.getRedirectURL);

const getWebAuthClientId = () => WEB_AUTH_CLIENT_ID.trim();

const getWebAuthRedirectUri = () => {
  if (!extensionApi.identity?.getRedirectURL) {
    return '';
  }
  return extensionApi.identity.getRedirectURL();
};

const getGoogleToken = (interactive = false) =>
  new Promise((resolve, reject) => {
    if (!isDriveConfigured()) {
      reject(new Error('Google Drive sync is not configured. Replace oauth2.client_id in manifest.json.'));
      return;
    }
    extensionApi.identity.getAuthToken({ interactive }, (result) => {
      const error = extensionApi.runtime?.lastError;
      if (error) {
        reject(new Error(error.message || 'Google authentication failed'));
        return;
      }
      const token = typeof result === 'string' ? result : result?.token;
      if (!token) {
        reject(new Error('Google authentication returned no token'));
        return;
      }
      resolve(token);
    });
  });

const getStoredWebAuthDriveToken = async () => {
  const stored = await extensionApi.storage.local.get(WEB_AUTH_DRIVE_TOKEN_KEY);
  const token = stored?.[WEB_AUTH_DRIVE_TOKEN_KEY];
  if (!token?.accessToken || Date.now() >= Number(token.expiresAt || 0) - 60_000) {
    return null;
  }
  return token;
};

const saveWebAuthDriveToken = async (token) => {
  await extensionApi.storage.local.set({ [WEB_AUTH_DRIVE_TOKEN_KEY]: token });
  return token;
};

const clearWebAuthDriveToken = async () => {
  await extensionApi.storage.local.remove(WEB_AUTH_DRIVE_TOKEN_KEY);
};

const getDriveAuthMode = async () => {
  const stored = await extensionApi.storage.local.get(DRIVE_AUTH_MODE_KEY);
  return stored?.[DRIVE_AUTH_MODE_KEY] || '';
};

const setDriveAuthMode = async (mode) => {
  await extensionApi.storage.local.set({ [DRIVE_AUTH_MODE_KEY]: mode });
};

const clearDriveAuthMode = async () => {
  await extensionApi.storage.local.remove(DRIVE_AUTH_MODE_KEY);
};

const parseHashParams = (url) => {
  const hash = new URL(url).hash.replace(/^#/, '');
  return new URLSearchParams(hash);
};

const getWebAuthDriveToken = async (interactive = false) => {
  const stored = await getStoredWebAuthDriveToken();
  if (stored?.accessToken) {
    await setDriveAuthMode('web');
    return stored.accessToken;
  }
  if (!interactive) {
    throw new Error('Google Drive token expired. Reconnect Google.');
  }
  if (!extensionApi.identity?.launchWebAuthFlow || !extensionApi.identity?.getRedirectURL) {
    throw new Error('Browser OAuth flow is not available.');
  }
  const clientId = getWebAuthClientId();
  if (!clientId) {
    throw new Error('Brave OAuth fallback is not configured. Create a Web application OAuth Client ID and set WEB_AUTH_CLIENT_ID in src/background/serviceWorker.js.');
  }
  const redirectUri = getWebAuthRedirectUri();
  console.info('[TFR] Google web auth redirect URI', redirectUri);
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', DRIVE_SCOPE);
  authUrl.searchParams.set('prompt', 'select_account consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');

  const redirectUrl = await new Promise((resolve, reject) => {
    extensionApi.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, (resultUrl) => {
      const error = extensionApi.runtime?.lastError;
      if (error) {
        reject(new Error(`${error.message || 'Google web auth failed'} Redirect URI: ${redirectUri}`));
        return;
      }
      if (!resultUrl) {
        reject(new Error('Google web auth returned no redirect URL'));
        return;
      }
      resolve(resultUrl);
    });
  });
  const params = parseHashParams(redirectUrl);
  const accessToken = params.get('access_token');
  if (!accessToken) {
    throw new Error(params.get('error_description') || params.get('error') || 'Google web auth returned no token');
  }
  const expiresIn = Number(params.get('expires_in')) || 3600;
  await saveWebAuthDriveToken({
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000
  });
  await setDriveAuthMode('web');
  return accessToken;
};

const getDriveToken = async (interactive = false) => {
  const authMode = await getDriveAuthMode();
  if (authMode === 'web') {
    return getWebAuthDriveToken(interactive);
  }

  const webToken = await getStoredWebAuthDriveToken();
  if (webToken?.accessToken) {
    await setDriveAuthMode('web');
    return webToken.accessToken;
  }

  try {
    const token = await getGoogleToken(interactive);
    await setDriveAuthMode('chrome');
    return token;
  } catch (error) {
    if (!interactive) {
      throw error;
    }
    console.warn('[TFR] chrome.identity.getAuthToken failed, falling back to launchWebAuthFlow', error);
    return getWebAuthDriveToken(true);
  }
};

const revokeGoogleToken = async () => {
  let revoked = false;
  const token = await getGoogleToken(false).catch(() => null);
  if (token && extensionApi.identity?.removeCachedAuthToken) {
    await new Promise((resolve) => {
      extensionApi.identity.removeCachedAuthToken({ token }, resolve);
    });
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(token)}`).catch(() => null);
    revoked = true;
  }
  await clearWebAuthDriveToken();
  await clearDriveAuthMode();
  return revoked;
};

const driveFetch = async (token, url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`Google Drive ${response.status}${message ? `: ${message.slice(0, 180)}` : ''}`);
  }
  return response;
};

const findDriveBackupFileInSpace = async (token, space = DRIVE_FILE_SPACE) => {
  const query = encodeURIComponent(`name='${DRIVE_BACKUP_FILE_NAME}' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?spaces=${space}&q=${query}&fields=files(id,name,modifiedTime,size)`;
  const response = await driveFetch(token, url);
  const payload = await response.json();
  return Array.isArray(payload.files) && payload.files.length ? payload.files[0] : null;
};

const findDriveBackupFile = async (token) => findDriveBackupFileInSpace(token, DRIVE_FILE_SPACE);

const findLegacyAppDataBackupFile = async (token) => {
  try {
    return await findDriveBackupFileInSpace(token, DRIVE_LEGACY_APPDATA_SPACE);
  } catch (error) {
    console.warn('[TFR] legacy Drive appData lookup skipped', error);
    return null;
  }
};

const createDriveMultipartBody = (metadata, jsonPayload) => {
  const boundary = `tfr_drive_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(jsonPayload),
    `--${boundary}--`
  ].join('\r\n');
  return { boundary, body };
};

const saveDriveSyncState = async (patch = {}) => {
  const previous = await extensionApi.storage.local.get(DRIVE_SYNC_STATE_KEY);
  const current = previous?.[DRIVE_SYNC_STATE_KEY] && typeof previous[DRIVE_SYNC_STATE_KEY] === 'object'
    ? previous[DRIVE_SYNC_STATE_KEY]
    : {};
  const next = { ...current, ...patch, updatedAt: Date.now() };
  await extensionApi.storage.local.set({ [DRIVE_SYNC_STATE_KEY]: next });
  return next;
};

const getDriveSyncStatus = async () => {
  const stored = await extensionApi.storage.local.get(DRIVE_SYNC_STATE_KEY);
  const chromeIdentityConfigured = isDriveConfigured();
  const webAuthAvailable = isWebAuthFlowAvailable() && Boolean(getWebAuthClientId());
  return {
    configured: chromeIdentityConfigured || webAuthAvailable,
    chromeIdentityConfigured,
    webAuthAvailable,
    webAuthRedirectUri: getWebAuthRedirectUri(),
    authMode: await getDriveAuthMode(),
    ...(stored?.[DRIVE_SYNC_STATE_KEY] || {})
  };
};

const connectGoogleDrive = async () => {
  const token = await getDriveToken(true);
  const syncState = await saveDriveSyncState({
    connectedAt: Date.now(),
    lastError: ''
  });
  return {
    ok: true,
    tokenAvailable: Boolean(token),
    syncState
  };
};

const pushBackupToDrive = async (backupPayload) => {
  const token = await getDriveToken(true);
  const existing = await findDriveBackupFile(token);
  const payload = {
    ...backupPayload,
    driveSyncedAt: new Date().toISOString()
  };
  const metadata = { name: DRIVE_BACKUP_FILE_NAME };
  const { boundary, body } = createDriveMultipartBody(metadata, payload);
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const response = await driveFetch(token, url, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
  const file = await response.json();
  const syncState = await saveDriveSyncState({
    connectedAt: Date.now(),
    lastPushAt: Date.now(),
    fileId: file.id || existing?.id || null,
    lastError: ''
  });
  return { ok: true, file, syncState };
};

const pullBackupFromDrive = async () => {
  const token = await getDriveToken(true);
  const file = await findDriveBackupFile(token) || await findLegacyAppDataBackupFile(token);
  if (!file?.id) {
    throw new Error('No Drive backup found yet.');
  }
  const response = await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
  const payload = await response.json();
  const syncState = await saveDriveSyncState({
    connectedAt: Date.now(),
    lastPullAt: Date.now(),
    fileId: file.id,
    remoteModifiedTime: file.modifiedTime || '',
    lastError: ''
  });
  return { ok: true, payload, file, syncState };
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
  if (!login) {
    return null;
  }
  const fallbackLiveData = createLiveDataFallback(login, fallback);
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
    console.debug('[TFR] Background live data temporarily unavailable', login, error);
    return fallbackLiveData;
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

const normalizeVersion = (version) =>
  String(version || '')
    .trim()
    .replace(/^v/i, '');

const parseVersion = (version) => {
  const cleaned = normalizeVersion(version);
  if (!cleaned) return [0];
  return cleaned.split('.').map((part) => {
    const match = String(part).match(/\d+/);
    return match ? Number(match[0]) : 0;
  });
};

const isVersionNewer = (remote, local) => {
  const remoteParts = parseVersion(remote);
  const localParts = parseVersion(local);
  const length = Math.max(remoteParts.length, localParts.length);
  for (let index = 0; index < length; index += 1) {
    const remoteValue = remoteParts[index] ?? 0;
    const localValue = localParts[index] ?? 0;
    if (remoteValue > localValue) return true;
    if (remoteValue < localValue) return false;
  }
  return false;
};

const canShowUpdateBadge = (state = {}, now = Date.now()) => {
  const currentVersion = extensionApi.runtime?.getManifest?.().version || '0.0.0';
  const latestVersion = normalizeVersion(state.latestVersion);
  if (!latestVersion || !isVersionNewer(latestVersion, currentVersion)) {
    return false;
  }
  if (state.dismissedVersion === latestVersion) {
    return false;
  }
  if (state.snoozeUntil && now < state.snoozeUntil) {
    return false;
  }
  return true;
};

const refreshBadgeFromUpdateState = async () => {
  const stored = await extensionApi.storage.local.get(UPDATE_STORAGE_KEY).catch(() => ({}));
  const updateState = stored?.[UPDATE_STORAGE_KEY] || {};
  updateBadgeAvailable = canShowUpdateBadge(updateState);
  await updateBadge(liveBadgeCount);
};

const checkForExtensionUpdate = async (force = false) => {
  const now = Date.now();
  const stored = await extensionApi.storage.local.get(UPDATE_STORAGE_KEY).catch(() => ({}));
  const state = stored?.[UPDATE_STORAGE_KEY] && typeof stored[UPDATE_STORAGE_KEY] === 'object'
    ? stored[UPDATE_STORAGE_KEY]
    : {};
  if (!force && state.lastCheck && now - state.lastCheck < UPDATE_CHECK_INTERVAL_MS) {
    updateBadgeAvailable = canShowUpdateBadge(state, now);
    await updateBadge(liveBadgeCount);
    return state;
  }
  try {
    const response = await fetch(UPDATE_REPO_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-cache'
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const remoteVersion = normalizeVersion(payload?.tag_name || payload?.name);
    const nextState = {
      ...state,
      lastCheck: now,
      latestVersion: remoteVersion,
      releaseUrl: payload?.html_url || UPDATE_REPO_URL,
      releaseNotes: (payload?.body || '').trim()
    };
    if (state.latestVersion !== remoteVersion) {
      nextState.dismissedVersion = null;
      nextState.snoozeUntil = null;
    }
    await extensionApi.storage.local.set({ [UPDATE_STORAGE_KEY]: nextState });
    updateBadgeAvailable = canShowUpdateBadge(nextState, now);
    await updateBadge(liveBadgeCount);
    return nextState;
  } catch (error) {
    console.warn('[TFR] background update check failed', error);
    updateBadgeAvailable = canShowUpdateBadge(state, now);
    await updateBadge(liveBadgeCount);
    return state;
  }
};

const updateBadge = async (count = liveBadgeCount) => {
  if (!actionApi?.setBadgeText) {
    return;
  }
  try {
    liveBadgeCount = Number(count) || 0;
    if (updateBadgeAvailable) {
      if (actionApi.setBadgeBackgroundColor) {
        await actionApi.setBadgeBackgroundColor({ color: UPDATE_BADGE_COLOR });
      }
      await actionApi.setBadgeText({ text: '!' });
      await actionApi.setTitle?.({ title: 'Nouvelle mise a jour disponible' });
      return;
    }
    if (actionApi.setBadgeBackgroundColor) {
      await actionApi.setBadgeBackgroundColor({ color: BADGE_COLOR });
    }
    await actionApi.setBadgeText({ text: liveBadgeCount > 0 ? String(Math.min(liveBadgeCount, 99)) : '' });
    await actionApi.setTitle?.({ title: 'Afficher les favoris Twitch' });
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
    const results = await Promise.allSettled(logins.map((login) => fetchStreamerLiveData(login, {
      ...favorites[login],
      ...(previousLiveData[login] || {})
    })));
    results.forEach((result, index) => {
      const login = logins[index];
      if (result.status === 'fulfilled' && result.value) {
        liveData[login] = result.value;
      } else {
        liveData[login] = createOfflineLiveData(login, favorites[login]);
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
  extensionApi.alarms.create(UPDATE_ALARM, { periodInMinutes: Math.max(60, UPDATE_CHECK_INTERVAL_MS / 60_000) });
};

extensionApi.runtime.onInstalled.addListener(async () => {
  await seedDefaultStateIfNeeded();
  scheduleAlarm();
  setSidePanelBehavior();
  await checkForExtensionUpdate(true);
  await evaluateLiveStatus('install');
});

extensionApi.runtime.onStartup.addListener(async () => {
  scheduleAlarm();
  setSidePanelBehavior();
  await checkForExtensionUpdate(false);
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
  });
}

extensionApi.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === POLL_ALARM) {
    evaluateLiveStatus('alarm');
  } else if (alarm?.name === UPDATE_ALARM) {
    checkForExtensionUpdate(false);
  }
});

extensionApi.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
    evaluateLiveStatus('favorites-change');
  }
  if (areaName === 'local' && Object.prototype.hasOwnProperty.call(changes, UPDATE_STORAGE_KEY)) {
    refreshBadgeFromUpdateState();
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
  } else if (message?.type === 'TFR_FETCH_LIVE_DATA') {
    if (message.login) {
      fetchStreamerLiveData(message.login, message.fallback)
        .then((liveData) => sendResponse({ ok: true, liveData }))
        .catch((error) => {
          console.error('[TFR] Fetch live data message failed', message.login, error);
          sendResponse({ ok: false, error: true, message: error?.message || 'fetch failed' });
        });
    } else {
      sendResponse({ ok: false, error: true, message: 'missing login' });
    }
    return true;
  } else if (message?.type === 'TFR_OPEN_CHANNEL_TAB') {
    if (message.login && extensionApi.tabs?.create) {
      extensionApi.tabs.create({ url: `https://www.twitch.tv/${message.login}` });
    }
    sendResponse({ ok: true });
    return true;
  } else if (message?.type === 'TFR_OPEN_VODS_PAGE') {
    const url = extensionApi.runtime?.getURL?.('panel/vods.html');
    if (url && extensionApi.tabs?.create) {
      extensionApi.tabs.create({ url });
    }
    sendResponse({ ok: Boolean(url) });
    return true;
  } else if (message?.type === 'TFR_DRIVE_SYNC_STATUS') {
    getDriveSyncStatus()
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({ ok: false, message: error?.message || 'Drive status failed' }));
    return true;
  } else if (message?.type === 'TFR_DRIVE_CONNECT') {
    connectGoogleDrive()
      .then((result) => sendResponse(result))
      .catch(async (error) => {
        const syncState = await saveDriveSyncState({ lastError: error?.message || 'Google connection failed' }).catch(() => ({}));
        sendResponse({ ok: false, message: error?.message || 'Google connection failed', syncState });
      });
    return true;
  } else if (message?.type === 'TFR_DRIVE_PUSH') {
    pushBackupToDrive(message.backup)
      .then((result) => sendResponse(result))
      .catch(async (error) => {
        const syncState = await saveDriveSyncState({ lastError: error?.message || 'Drive push failed' }).catch(() => ({}));
        sendResponse({ ok: false, message: error?.message || 'Drive push failed', syncState });
      });
    return true;
  } else if (message?.type === 'TFR_DRIVE_PULL') {
    pullBackupFromDrive()
      .then((result) => sendResponse(result))
      .catch(async (error) => {
        const syncState = await saveDriveSyncState({ lastError: error?.message || 'Drive pull failed' }).catch(() => ({}));
        sendResponse({ ok: false, message: error?.message || 'Drive pull failed', syncState });
      });
    return true;
  } else if (message?.type === 'TFR_DRIVE_SIGN_OUT') {
    revokeGoogleToken()
      .then(async (revoked) => {
        const syncState = await saveDriveSyncState({ connectedAt: null, lastError: '' }).catch(() => ({}));
        sendResponse({ ok: true, revoked, syncState });
      })
      .catch((error) => sendResponse({ ok: false, message: error?.message || 'Google sign out failed' }));
    return true;
  } else if (message?.type === 'TFR_CHECK_EXTENSION_UPDATE') {
    checkForExtensionUpdate(Boolean(message.force))
      .then((state) => sendResponse({ ok: true, state, badgeAvailable: updateBadgeAvailable }))
      .catch((error) => sendResponse({ ok: false, message: error?.message || 'Update check failed' }));
    return true;
  }
  return false;
});

(() => {
  const STORAGE_KEY = 'tfm_state';
  const UPDATE_STATE_KEY = 'tfm_update_state';
  const MOBILE_APP_VERSION = '0.4.0';
  const UPDATE_REPO_API_URL = 'https://api.github.com/repos/florioz/TwitchPinnedFavoris/releases/latest';
  const UPDATE_REPO_URL = 'https://github.com/florioz/TwitchPinnedFavoris';
  const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
  const GOOGLE_DRIVE_CLIENT_ID = '000000000000-replacewithgoogleoauthclientid.apps.googleusercontent.com';
  const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const GOOGLE_DEVICE_CODE_ENDPOINT = 'https://oauth2.googleapis.com/device/code';
  const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
  const DRIVE_BACKUP_FILE_NAME = 'twitch-favorites-sidebar-profiles.json';
  const DRIVE_APPDATA_SPACE = 'appDataFolder';
  const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MAX_DAY_OFFSET = 60;
  const VIDEO_LIMIT = 40;
  const CLIP_PAGE_LIMIT = 100;
  const CLIP_MAX_PAGES = 4;

  const LIVE_QUERY = `
    query TfmChannelLive($login: String!) {
      user(login: $login) {
        id
        login
        displayName
        profileImageURL(width: 96)
        stream {
          id
          title
          viewersCount
          createdAt
          game { name }
        }
      }
    }
  `;

  const VODS_QUERY = `
    query TfmChannelVideos($login: String!, $limit: Int!) {
      user(login: $login) {
        id
        login
        displayName
        profileImageURL(width: 96)
        videos(first: $limit, type: ARCHIVE) {
          edges {
            node {
              id
              title
              createdAt
              publishedAt
              lengthSeconds
              viewCount
              previewThumbnailURL(width: 320, height: 180)
              game { name }
            }
          }
        }
      }
    }
  `;

  const CLIPS_QUERY = `
    query TfmChannelClips($login: String!, $limit: Int!, $period: ClipsPeriod!, $cursor: Cursor) {
      user(login: $login) {
        clips(first: $limit, after: $cursor, criteria: { period: $period }) {
          pageInfo { hasNextPage }
          edges {
            cursor
            node {
              id
              slug
              title
              url
              createdAt
              durationSeconds
              viewCount
              thumbnailURL(width: 320, height: 180)
              curator {
                login
                displayName
              }
              video {
                id
              }
            }
          }
        }
      }
    }
  `;

  const state = {
    favorites: {},
    categories: [],
    profiles: {},
    activeProfileId: 'default',
    liveByLogin: new Map(),
    videosByLogin: new Map(),
    clipsByVideoId: new Map(),
    activeView: 'favorites',
    selectedCategoryId: 'all',
    selectedVodCategoryId: 'all',
    selectedDay: startOfDay(Date.now()),
    searchTerm: '',
    vodSearchTerm: '',
    liveOnly: false,
    collapsedCategoryIds: new Set(),
    vodSortKey: 'time',
    vodSortDirection: 'asc',
    selectedVideoId: '',
    isLoading: false,
    isLiveLoading: false,
    clipsLoadingVideoId: '',
    clipsError: '',
    lastVodErrors: [],
    googleDriveToken: null,
    isDriveSyncing: false
  };

  const elements = {
    setupCard: document.getElementById('setupCard'),
    backupInput: document.getElementById('backupInput'),
    demoButton: document.getElementById('demoButton'),
    importStatus: document.getElementById('importStatus'),
    clearDataButton: document.getElementById('clearDataButton'),
    refreshButton: document.getElementById('refreshButton'),
    updateBanner: document.getElementById('updateBanner'),
    updateTitle: document.getElementById('updateTitle'),
    updateDescription: document.getElementById('updateDescription'),
    updateLink: document.getElementById('updateLink'),
    updateDismissButton: document.getElementById('updateDismissButton'),
    driveStatus: document.getElementById('driveStatus'),
    drivePullButton: document.getElementById('drivePullButton'),
    drivePushButton: document.getElementById('drivePushButton'),
    driveSignOutButton: document.getElementById('driveSignOutButton'),
    searchInput: document.getElementById('searchInput'),
    groupSelect: document.getElementById('groupSelect'),
    liveOnlyInput: document.getElementById('liveOnlyInput'),
    vodSearchInput: document.getElementById('vodSearchInput'),
    vodGroupSelect: document.getElementById('vodGroupSelect'),
    vodSortSelect: document.getElementById('vodSortSelect'),
    vodSortDirectionButton: document.getElementById('vodSortDirectionButton'),
    tabs: Array.from(document.querySelectorAll('.tfm-tab')),
    favoritesView: document.getElementById('favoritesView'),
    favoritesList: document.getElementById('favoritesList'),
    vodsView: document.getElementById('vodsView'),
    previousDayButton: document.getElementById('previousDayButton'),
    nextDayButton: document.getElementById('nextDayButton'),
    dayInput: document.getElementById('dayInput'),
    vodSummary: document.getElementById('vodSummary'),
    vodList: document.getElementById('vodList'),
    vodDetail: document.getElementById('vodDetail')
  };

  function startOfDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function formatDateValue(timestamp) {
    const date = new Date(timestamp);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function parseDateValue(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return startOfDay(Date.now());
    return startOfDay(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  function clampDay(timestamp) {
    const today = startOfDay(Date.now());
    const oldest = today - MAX_DAY_OFFSET * DAY_MS;
    return Math.min(today, Math.max(oldest, startOfDay(timestamp)));
  }

  function formatDuration(seconds = 0) {
    const safe = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    return hours ? `${hours}h${String(minutes).padStart(2, '0')}` : `${minutes || 1} min`;
  }

  function getClipPeriodForVideo(video) {
    const startedAt = new Date(video?.createdAt || 0).getTime();
    const ageMs = Date.now() - startedAt;
    if (!Number.isFinite(ageMs) || ageMs < 0) return 'LAST_DAY';
    if (ageMs <= DAY_MS) return 'LAST_DAY';
    if (ageMs <= 7 * DAY_MS) return 'LAST_WEEK';
    if (ageMs <= 30 * DAY_MS) return 'LAST_MONTH';
    return 'ALL_TIME';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function normalizeVersion(version) {
    return String(version || '').trim().replace(/^v/i, '');
  }

  function parseVersion(version) {
    const cleaned = normalizeVersion(version);
    if (!cleaned) return [0];
    return cleaned.split('.').map((part) => {
      const match = String(part).match(/\d+/);
      return match ? Number(match[0]) : 0;
    });
  }

  function isVersionNewer(remote, local) {
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
  }

  function getUpdateState() {
    try {
      const value = JSON.parse(localStorage.getItem(UPDATE_STATE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function setUpdateState(patch) {
    const next = { ...getUpdateState(), ...patch };
    localStorage.setItem(UPDATE_STATE_KEY, JSON.stringify(next));
    return next;
  }

  function canShowUpdate(version, updateState = getUpdateState(), now = Date.now()) {
    const normalized = normalizeVersion(version);
    if (!normalized || !isVersionNewer(normalized, MOBILE_APP_VERSION)) return false;
    if (updateState.dismissedVersion === normalized) return false;
    if (updateState.snoozeUntil && now < updateState.snoozeUntil) return false;
    return true;
  }

  function showUpdateBanner(version, url, notes) {
    if (!elements.updateBanner) return;
    elements.updateTitle.textContent = `Version ${version} disponible`;
    const summary = String(notes || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    elements.updateDescription.textContent = summary || 'Télécharge la dernière version depuis GitHub.';
    elements.updateLink.href = url || UPDATE_REPO_URL;
    elements.updateBanner.hidden = false;
  }

  function hideUpdateBanner() {
    if (elements.updateBanner) {
      elements.updateBanner.hidden = true;
    }
  }

  async function checkForUpdates(force = false) {
    const now = Date.now();
    const updateState = getUpdateState();
    if (updateState.latestVersion && canShowUpdate(updateState.latestVersion, updateState, now)) {
      showUpdateBanner(updateState.latestVersion, updateState.releaseUrl, updateState.releaseNotes);
    }
    if (!force && updateState.lastCheck && now - updateState.lastCheck < UPDATE_CHECK_INTERVAL_MS) {
      return;
    }
    try {
      const response = await fetch(UPDATE_REPO_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-cache'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const remoteVersion = normalizeVersion(payload?.tag_name || payload?.name);
      const nextState = setUpdateState({
        lastCheck: now,
        latestVersion: remoteVersion,
        releaseUrl: payload?.html_url || UPDATE_REPO_URL,
        releaseNotes: (payload?.body || '').trim(),
        dismissedVersion: updateState.latestVersion !== remoteVersion ? null : updateState.dismissedVersion,
        snoozeUntil: updateState.latestVersion !== remoteVersion ? null : updateState.snoozeUntil
      });
      if (canShowUpdate(remoteVersion, nextState, now)) {
        showUpdateBanner(remoteVersion, nextState.releaseUrl, nextState.releaseNotes);
      } else {
        hideUpdateBanner();
      }
    } catch (error) {
      console.warn('[TFM] update check failed', error);
    }
  }

  function readLocalState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.favorites = stored.favorites && typeof stored.favorites === 'object' ? stored.favorites : {};
      state.categories = Array.isArray(stored.categories) ? stored.categories : [];
      state.profiles = stored.profiles && typeof stored.profiles === 'object' ? stored.profiles : {};
      state.activeProfileId = typeof stored.activeProfileId === 'string' && stored.activeProfileId ? stored.activeProfileId : 'default';
      state.googleDriveToken = stored.googleDriveToken || null;
    } catch {
      state.favorites = {};
      state.categories = [];
      state.profiles = {};
      state.activeProfileId = 'default';
      state.googleDriveToken = null;
    }
  }

  function persistLocalState() {
    syncActiveProfile();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      favorites: state.favorites,
      categories: state.categories,
      profiles: state.profiles,
      activeProfileId: state.activeProfileId,
      googleDriveToken: state.googleDriveToken || null
    }));
  }

  function setImportStatus(message, isError = false) {
    elements.importStatus.textContent = message || '';
    elements.importStatus.classList.toggle('is-error', Boolean(isError));
  }

  function isDriveConfigured() {
    return Boolean(GOOGLE_DRIVE_CLIENT_ID && !GOOGLE_DRIVE_CLIENT_ID.includes('replacewithgoogleoauthclientid'));
  }

  function setDriveStatus(message, isError = false) {
    if (!elements.driveStatus) return;
    elements.driveStatus.textContent = message || '';
    elements.driveStatus.classList.toggle('is-error', Boolean(isError));
  }

  function setDriveButtonsDisabled(disabled) {
    [elements.drivePullButton, elements.drivePushButton, elements.driveSignOutButton].forEach((button) => {
      if (button) button.disabled = Boolean(disabled);
    });
  }

  async function requestDriveDeviceCode() {
    const body = new URLSearchParams({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPE
    });
    const response = await fetch(GOOGLE_DEVICE_CODE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!response.ok) throw new Error(`Google OAuth ${response.status}`);
    return response.json();
  }

  async function pollDriveToken(deviceCode, intervalSeconds = 5, expiresIn = 900) {
    const startedAt = Date.now();
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    while (Date.now() - startedAt < expiresIn * 1000) {
      await wait(Math.max(1, intervalSeconds) * 1000);
      const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_DRIVE_CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.access_token) {
        return {
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token || '',
          expiresAt: Date.now() + (Number(payload.expires_in) || 3600) * 1000
        };
      }
      if (payload.error === 'authorization_pending') continue;
      if (payload.error === 'slow_down') {
        intervalSeconds += 2;
        continue;
      }
      throw new Error(payload.error_description || payload.error || 'Google OAuth refused');
    }
    throw new Error('Connexion Google expirée.');
  }

  async function refreshDriveTokenIfNeeded() {
    const token = state.googleDriveToken;
    if (!token?.refreshToken || Date.now() < Number(token.expiresAt || 0) - 60_000) {
      return token;
    }
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_DRIVE_CLIENT_ID,
        refresh_token: token.refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.access_token) {
      state.googleDriveToken = null;
      persistLocalState();
      throw new Error(payload.error_description || payload.error || 'Session Google expirée.');
    }
    state.googleDriveToken = {
      ...token,
      accessToken: payload.access_token,
      expiresAt: Date.now() + (Number(payload.expires_in) || 3600) * 1000
    };
    persistLocalState();
    return state.googleDriveToken;
  }

  async function ensureDriveToken() {
    if (!isDriveConfigured()) {
      throw new Error('Client ID Google non configuré.');
    }
    const existing = await refreshDriveTokenIfNeeded();
    if (existing?.accessToken) return existing.accessToken;
    const device = await requestDriveDeviceCode();
    setDriveStatus(`Ouvre ${device.verification_url || device.verification_uri} et entre le code ${device.user_code}`);
    const token = await pollDriveToken(device.device_code, device.interval, device.expires_in);
    state.googleDriveToken = token;
    persistLocalState();
    return token.accessToken;
  }

  async function driveFetch(url, options = {}) {
    const accessToken = await ensureDriveToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(`Drive ${response.status}${message ? `: ${message.slice(0, 120)}` : ''}`);
    }
    return response;
  }

  async function findDriveBackupFile() {
    const query = encodeURIComponent(`name='${DRIVE_BACKUP_FILE_NAME}' and '${DRIVE_APPDATA_SPACE}' in parents and trashed=false`);
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?spaces=${DRIVE_APPDATA_SPACE}&q=${query}&fields=files(id,name,modifiedTime)`);
    const payload = await response.json();
    return Array.isArray(payload.files) && payload.files.length ? payload.files[0] : null;
  }

  function createDriveMultipartBody(metadata, jsonPayload) {
    const boundary = `tfm_drive_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
  }

  async function pushBackupToDrive() {
    state.isDriveSyncing = true;
    setDriveButtonsDisabled(true);
    setDriveStatus('Envoi vers Google Drive...');
    try {
      const existing = await findDriveBackupFile();
      const metadata = existing
        ? { name: DRIVE_BACKUP_FILE_NAME }
        : { name: DRIVE_BACKUP_FILE_NAME, parents: [DRIVE_APPDATA_SPACE] };
      const { boundary, body } = createDriveMultipartBody(metadata, getBackupData());
      const url = existing
        ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      await driveFetch(url, {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      });
      setDriveStatus('Profils envoyés sur Google Drive.');
    } catch (error) {
      setDriveStatus(`Sync Drive impossible : ${error?.message || 'erreur inconnue'}`, true);
    } finally {
      state.isDriveSyncing = false;
      setDriveButtonsDisabled(false);
    }
  }

  async function pullBackupFromDrive() {
    const confirmed = window.confirm('Récupérer depuis Drive remplacera les profils locaux. Continuer ?');
    if (!confirmed) return;
    state.isDriveSyncing = true;
    setDriveButtonsDisabled(true);
    setDriveStatus('Récupération depuis Google Drive...');
    try {
      const file = await findDriveBackupFile();
      if (!file?.id) throw new Error('Aucun backup Drive trouvé.');
      const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
      normalizeBackup(await response.json());
      setDriveStatus('Profils récupérés depuis Google Drive.');
      render();
      refreshLiveData();
    } catch (error) {
      setDriveStatus(`Sync Drive impossible : ${error?.message || 'erreur inconnue'}`, true);
    } finally {
      state.isDriveSyncing = false;
      setDriveButtonsDisabled(false);
    }
  }

  function signOutDrive() {
    state.googleDriveToken = null;
    persistLocalState();
    setDriveStatus(isDriveConfigured() ? 'Compte Google déconnecté.' : 'Configure le Client ID Google pour activer la sync.');
  }

  function loadDemoData() {
    normalizeBackup({
      categories: [
        { id: 'demo_fr', name: 'Streamers FR', sortOrder: 1000 },
        { id: 'demo_rp', name: 'RP / GTA', sortOrder: 2000 }
      ],
      favorites: {
        zerator: {
          login: 'zerator',
          displayName: 'ZeratoR',
          avatarUrl: DEFAULT_AVATAR,
          categories: ['demo_fr']
        },
        ponce: {
          login: 'ponce',
          displayName: 'Ponce',
          avatarUrl: DEFAULT_AVATAR,
          categories: ['demo_fr']
        },
        jl_tomy: {
          login: 'jl_tomy',
          displayName: 'JLTomy',
          avatarUrl: DEFAULT_AVATAR,
          categories: ['demo_rp']
        }
      }
    });
    state.videosByLogin.clear();
    state.clipsByVideoId.clear();
    state.selectedVideoId = '';
    setImportStatus('Mode demo charge. Tu peux tester les groupes et les VODs.');
  }

  function clearData() {
    state.favorites = {};
    state.categories = [];
    state.liveByLogin.clear();
    state.videosByLogin.clear();
    state.clipsByVideoId.clear();
    state.selectedCategoryId = 'all';
    state.selectedVodCategoryId = 'all';
    state.selectedVideoId = '';
    state.collapsedCategoryIds.clear();
    localStorage.removeItem(STORAGE_KEY);
    setImportStatus('');
    render();
  }

  function normalizeBackup(payload = {}) {
    const profileId = typeof payload.activeProfileId === 'string' && payload.activeProfileId ? payload.activeProfileId : 'default';
    const profile = payload.profiles?.[profileId] && typeof payload.profiles[profileId] === 'object' ? payload.profiles[profileId] : null;
    const favorites = profile?.favorites && typeof profile.favorites === 'object'
      ? profile.favorites
      : payload.favorites && typeof payload.favorites === 'object'
      ? payload.favorites
      : {};
    const categories = Array.isArray(profile?.categories)
      ? profile.categories
      : Array.isArray(payload.categories)
      ? payload.categories
      : [];
    state.profiles = payload.profiles && typeof payload.profiles === 'object' ? payload.profiles : {};
    state.activeProfileId = profileId;
    state.favorites = Object.fromEntries(
      Object.entries(favorites)
        .map(([login, favorite]) => {
          const normalized = String(favorite?.login || login || '').toLowerCase();
          if (!normalized) return null;
          return [normalized, {
            login: normalized,
            displayName: favorite?.displayName || normalized,
            avatarUrl: favorite?.avatarUrl || DEFAULT_AVATAR,
            categories: Array.isArray(favorite?.categories) ? favorite.categories : [],
            categoryFilter: favorite?.categoryFilter || { enabled: false, categories: [] }
          }];
        })
        .filter(Boolean)
    );
    state.categories = categories
      .filter((category) => category && typeof category.id === 'string')
      .map((category, index) => ({
        id: category.id,
        name: typeof category.name === 'string' && category.name.trim() ? category.name.trim() : `Groupe ${index + 1}`,
        parentId: typeof category.parentId === 'string' && category.parentId.trim() ? category.parentId : null,
        sortOrder: Number.isFinite(category.sortOrder) ? category.sortOrder : index * 1000
      }));
    state.selectedCategoryId = 'all';
    state.selectedVodCategoryId = 'all';
    state.collapsedCategoryIds.clear();
    persistLocalState();
  }

  function syncActiveProfile() {
    const id = state.activeProfileId || 'default';
    const current = state.profiles[id] || {};
    state.profiles[id] = {
      ...current,
      id,
      name: current.name || 'Mobile',
      favorites: state.favorites,
      categories: state.categories,
      updatedAt: Date.now()
    };
  }

  function getBackupData() {
    syncActiveProfile();
    return {
      version: 2,
      generatedAt: new Date().toISOString(),
      activeProfileId: state.activeProfileId,
      profiles: state.profiles,
      favorites: state.favorites,
      categories: state.categories,
      preferences: {}
    };
  }

  function getCategoryTree() {
    const nodes = state.categories.map((category) => ({ ...category, children: [] }));
    const byId = new Map(nodes.map((category) => [category.id, category]));
    const roots = [];
    nodes.forEach((category) => {
      if (category.parentId && byId.has(category.parentId)) {
        byId.get(category.parentId).children.push(category);
      } else {
        category.parentId = null;
        roots.push(category);
      }
    });
    const sortNodes = (items) => {
      items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, 'fr'));
      items.forEach((item) => sortNodes(item.children));
    };
    sortNodes(roots);
    return roots;
  }

  function flattenCategories(nodes = getCategoryTree(), depth = 0, output = []) {
    nodes.forEach((node) => {
      output.push({ ...node, depth });
      flattenCategories(node.children, depth + 1, output);
    });
    return output;
  }

  function collectDescendantIds(categoryId) {
    const result = new Set();
    const visit = (nodes) => {
      nodes.forEach((node) => {
        if (node.id === categoryId || result.has(node.parentId)) {
          result.add(node.id);
        }
        visit(node.children || []);
      });
    };
    visit(getCategoryTree());
    return result;
  }

  function getVisibleFavorites(categoryId = state.selectedCategoryId, termValue = state.searchTerm, liveFilter = true) {
    const term = termValue.trim().toLowerCase();
    const allowed = categoryId === 'all' ? null : collectDescendantIds(categoryId);
    return Object.values(state.favorites)
      .filter((favorite) => {
        if (allowed && !favorite.categories?.some((id) => allowed.has(id))) return false;
        if (liveFilter && state.liveOnly && !state.liveByLogin.get(favorite.login)?.isLive) return false;
        if (!term) return true;
        return (
          favorite.displayName.toLowerCase().includes(term) ||
          favorite.login.toLowerCase().includes(term) ||
          getCategoryNames(favorite).some((name) => name.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }));
  }

  function getCategoryNames(favorite) {
    const byId = new Map(state.categories.map((category) => [category.id, category.name]));
    return (favorite.categories || []).map((id) => byId.get(id)).filter(Boolean);
  }

  async function fetchChannelVods(login) {
    const response = await fetch(TWITCH_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: VODS_QUERY,
        variables: { login, limit: VIDEO_LIMIT }
      })
    });
    if (!response.ok) throw new Error(`Twitch ${response.status}`);
    const payload = await response.json();
    const user = payload?.data?.user;
    if (!user) return null;
    return {
      login: user.login || login,
      displayName: user.displayName || login,
      avatarUrl: user.profileImageURL || state.favorites[login]?.avatarUrl || DEFAULT_AVATAR,
      videos: (user.videos?.edges || [])
        .map((edge) => edge?.node)
        .filter(Boolean)
        .map((video) => ({
          id: video.id,
          title: video.title || 'VOD Twitch',
          createdAt: video.createdAt || video.publishedAt,
          lengthSeconds: Number(video.lengthSeconds) || 0,
          viewCount: Number(video.viewCount) || 0,
          thumbnailUrl: video.previewThumbnailURL || '',
          game: video.game?.name || '',
          url: `https://www.twitch.tv/videos/${video.id}`
        }))
        .filter((video) => video.id && video.createdAt)
    };
  }

  async function fetchChannelLive(login) {
    const response = await fetch(TWITCH_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: LIVE_QUERY,
        variables: { login }
      })
    });
    if (!response.ok) throw new Error(`Twitch ${response.status}`);
    const payload = await response.json();
    const user = payload?.data?.user;
    if (!user) return null;
    const stream = user.stream;
    return {
      login: user.login || login,
      displayName: user.displayName || state.favorites[login]?.displayName || login,
      avatarUrl: user.profileImageURL || state.favorites[login]?.avatarUrl || DEFAULT_AVATAR,
      isLive: Boolean(stream),
      title: stream?.title || '',
      game: stream?.game?.name || '',
      viewers: Number(stream?.viewersCount) || 0,
      startedAt: stream?.createdAt || ''
    };
  }

  async function fetchVideoClipsPage(channel, period, cursor = null) {
    const response = await fetch(TWITCH_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: CLIPS_QUERY,
        variables: {
          login: channel.login,
          limit: CLIP_PAGE_LIMIT,
          period,
          cursor
        }
      })
    });
    if (!response.ok) throw new Error(`Twitch clips ${response.status}`);
    const payload = await response.json();
    if (Array.isArray(payload?.errors) && payload.errors.length) {
      throw new Error(payload.errors[0]?.message || 'Twitch clips query failed');
    }
    return payload?.data?.user?.clips || { edges: [], pageInfo: { hasNextPage: false } };
  }

  async function fetchVideoClips(channel, video) {
    if (!channel?.login || !video?.id || !video.createdAt) return [];
    const startedAt = new Date(video.createdAt);
    const endedAt = new Date(startedAt.getTime() + Math.max(1, video.lengthSeconds || 1) * 1000);
    const period = getClipPeriodForVideo(video);
    const edges = [];
    let cursor = null;
    for (let page = 0; page < CLIP_MAX_PAGES; page += 1) {
      const pageData = await fetchVideoClipsPage(channel, period, cursor);
      const pageEdges = Array.isArray(pageData?.edges) ? pageData.edges : [];
      edges.push(...pageEdges);
      const nextCursor = pageEdges[pageEdges.length - 1]?.cursor || null;
      if (!pageData?.pageInfo?.hasNextPage || !nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return edges
      .map((edge) => edge?.node)
      .filter(Boolean)
      .filter((clip) => {
        const clipVideoId = clip.video?.id ? String(clip.video.id) : '';
        if (clipVideoId) return clipVideoId === String(video.id);
        const createdAt = new Date(clip.createdAt || 0).getTime();
        return Number.isFinite(createdAt) && createdAt >= startedAt.getTime() && createdAt <= endedAt.getTime();
      })
      .filter((clip, index, clips) => {
        const key = clip.id || clip.slug;
        return key && clips.findIndex((candidate) => (candidate.id || candidate.slug) === key) === index;
      })
      .map((clip) => {
        const createdAt = clip.createdAt || '';
        const offsetSeconds = createdAt
          ? Math.max(0, Math.round((new Date(createdAt).getTime() - startedAt.getTime()) / 1000))
          : 0;
        return {
          id: clip.id || clip.slug,
          slug: clip.slug || clip.id,
          title: clip.title || 'Clip Twitch',
          url: clip.url || (clip.slug ? `https://clips.twitch.tv/${clip.slug}` : ''),
          createdAt,
          offsetSeconds,
          durationSeconds: Number(clip.durationSeconds) || 0,
          viewCount: Number(clip.viewCount) || 0,
          thumbnailUrl: clip.thumbnailURL || '',
          curator: clip.curator?.displayName || clip.curator?.login || ''
        };
      })
      .sort((a, b) => a.offsetSeconds - b.offsetSeconds || b.viewCount - a.viewCount);
  }

  async function refreshLiveData() {
    const favorites = Object.values(state.favorites);
    if (!favorites.length || state.isLiveLoading) return;
    state.isLiveLoading = true;
    renderFavorites();
    const results = await Promise.allSettled(favorites.map((favorite) => fetchChannelLive(favorite.login)));
    results.forEach((result) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const live = result.value;
      const login = live.login.toLowerCase();
      state.liveByLogin.set(login, live);
      const favorite = state.favorites[login];
      if (favorite) {
        favorite.displayName = live.displayName || favorite.displayName;
        favorite.avatarUrl = live.avatarUrl || favorite.avatarUrl;
      }
    });
    state.isLiveLoading = false;
    persistLocalState();
    renderFavorites();
  }

  async function refreshVods() {
    const favorites = getVisibleFavorites(state.selectedVodCategoryId, '', false);
    if (!favorites.length) {
      state.videosByLogin.clear();
      state.lastVodErrors = [];
      renderVods();
      return;
    }
    state.isLoading = true;
    state.lastVodErrors = [];
    renderVods();
    const results = await Promise.allSettled(favorites.map((favorite) => fetchChannelVods(favorite.login)));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        state.videosByLogin.set(result.value.login.toLowerCase(), result.value);
      } else if (result.status === 'rejected') {
        state.lastVodErrors.push({
          login: favorites[index]?.login || 'unknown',
          message: result.reason?.message || 'Erreur Twitch'
        });
      }
    });
    state.isLoading = false;
    ensureDayHasContent();
    renderVods();
  }

  function ensureDayHasContent() {
    if (getVisibleVideos().length) return;
    const days = [];
    getVisibleFavorites(state.selectedVodCategoryId, '', false).forEach((favorite) => {
      const channel = state.videosByLogin.get(favorite.login);
      channel?.videos.forEach((video) => days.push(startOfDay(video.createdAt)));
    });
    if (days.length) {
      state.selectedDay = Math.max(...days);
    }
  }

  function getVodMetric(entry) {
    if (state.vodSortKey === 'views') return Number(entry.video.viewCount) || 0;
    if (state.vodSortKey === 'duration') return Number(entry.video.lengthSeconds) || 0;
    if (state.vodSortKey === 'name') return entry.channel.displayName || entry.channel.login || '';
    return new Date(entry.video.createdAt).getTime();
  }

  function getVisibleVideos() {
    const dayStart = Number(state.selectedDay);
    const dayEnd = dayStart + DAY_MS;
    const term = state.vodSearchTerm.trim().toLowerCase();
    return getVisibleFavorites(state.selectedVodCategoryId, '', false)
      .flatMap((favorite) => {
        const channel = state.videosByLogin.get(favorite.login);
        if (!channel) return [];
        return channel.videos
          .filter((video) => {
            const startedAt = new Date(video.createdAt).getTime();
            if (startedAt < dayStart || startedAt >= dayEnd) return false;
            if (!term) return true;
            return (
              video.title.toLowerCase().includes(term) ||
              video.game.toLowerCase().includes(term) ||
              channel.displayName.toLowerCase().includes(term) ||
              channel.login.toLowerCase().includes(term)
            );
          })
          .map((video) => ({ channel, video }));
      })
      .sort((a, b) => {
        const direction = state.vodSortDirection === 'asc' ? 1 : -1;
        const aMetric = getVodMetric(a);
        const bMetric = getVodMetric(b);
        if (typeof aMetric === 'string' || typeof bMetric === 'string') {
          return String(aMetric).localeCompare(String(bMetric), 'fr', { sensitivity: 'base' }) * direction;
        }
        return ((aMetric || 0) - (bMetric || 0)) * direction;
      });
  }

  function findVideoContext(videoId) {
    if (!videoId) return null;
    for (const channel of state.videosByLogin.values()) {
      const video = channel.videos.find((item) => item.id === videoId);
      if (video) return { channel, video };
    }
    return null;
  }

  async function selectVideo(videoId) {
    const context = findVideoContext(videoId);
    if (!context) return;
    if (state.selectedVideoId === videoId) {
      closeVodDetail();
      return;
    }
    state.selectedVideoId = videoId;
    state.clipsError = '';
    renderVods();
    elements.vodList.querySelector('.tfm-vod-detail')?.scrollIntoView({ block: 'nearest' });
    if (state.clipsByVideoId.has(videoId)) return;
    state.clipsLoadingVideoId = videoId;
    renderVods();
    try {
      const clips = await fetchVideoClips(context.channel, context.video);
      state.clipsByVideoId.set(videoId, clips);
    } catch (error) {
      state.clipsByVideoId.set(videoId, []);
      state.clipsError = `Impossible de charger les clips: ${error?.message || 'erreur Twitch'}`;
    } finally {
      if (state.clipsLoadingVideoId === videoId) {
        state.clipsLoadingVideoId = '';
      }
      renderVods();
    }
  }

  function closeVodDetail() {
    state.selectedVideoId = '';
    state.clipsError = '';
    renderVods();
  }

  function renderFilters() {
    const hasFavorites = Object.keys(state.favorites).length > 0;
    elements.setupCard.hidden = hasFavorites;
    elements.clearDataButton.hidden = !hasFavorites;
    if (!isDriveConfigured()) {
      setDriveStatus('Configure le Client ID Google pour activer la sync.', true);
      setDriveButtonsDisabled(true);
    } else if (!state.isDriveSyncing && !elements.driveStatus.textContent) {
      setDriveStatus(state.googleDriveToken?.accessToken ? 'Google Drive prêt.' : 'Connexion Google requise au premier usage.');
      setDriveButtonsDisabled(false);
    }
    const selected = state.selectedCategoryId;
    const selectedVod = state.selectedVodCategoryId;
    const groupOptions = document.createDocumentFragment();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Tous les groupes';
    groupOptions.appendChild(allOption);
    flattenCategories().forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = `${category.depth ? '  '.repeat(category.depth) + '- ' : ''}${category.name}`;
      groupOptions.appendChild(option);
    });
    elements.groupSelect.innerHTML = '';
    elements.groupSelect.appendChild(groupOptions.cloneNode(true));
    elements.groupSelect.value = selected;
    elements.vodGroupSelect.innerHTML = '';
    elements.vodGroupSelect.appendChild(groupOptions.cloneNode(true));
    elements.vodGroupSelect.value = selectedVod;
    elements.liveOnlyInput.checked = state.liveOnly;
    elements.vodSortSelect.value = state.vodSortKey;
    elements.vodSortDirectionButton.textContent = state.vodSortDirection === 'asc' ? 'Croissant' : 'Descendant';

    const today = startOfDay(Date.now());
    const oldest = today - MAX_DAY_OFFSET * DAY_MS;
    elements.dayInput.min = formatDateValue(oldest);
    elements.dayInput.max = formatDateValue(today);
    elements.dayInput.value = formatDateValue(state.selectedDay);
    elements.previousDayButton.disabled = state.selectedDay <= oldest;
    elements.nextDayButton.disabled = state.selectedDay >= today;
  }

  function renderFavorites() {
    elements.refreshButton.disabled = state.isLiveLoading;
    if (state.activeView === 'favorites') {
      elements.refreshButton.textContent = state.isLiveLoading ? 'Actualisation...' : 'Actualiser les lives';
    }
    const favorites = getVisibleFavorites();
    if (!favorites.length) {
      elements.favoritesList.innerHTML = '<p class="tfm-empty">Aucun streamer a afficher.</p>';
      return;
    }
    const byCategory = new Map();
    const uncategorized = [];
    favorites.forEach((favorite) => {
      const categoryId = favorite.categories?.[0];
      if (!categoryId) {
        uncategorized.push(favorite);
        return;
      }
      if (!byCategory.has(categoryId)) byCategory.set(categoryId, []);
      byCategory.get(categoryId).push(favorite);
    });
    const cards = flattenCategories()
      .map((category) => renderCategoryCard(category, byCategory.get(category.id) || [], category.id))
      .filter(Boolean);
    if (uncategorized.length) {
      cards.unshift(renderCategoryCard({ name: 'Sans groupe' }, uncategorized, 'uncategorized'));
    }
    elements.favoritesList.innerHTML = cards.join('') || '<p class="tfm-empty">Aucun streamer dans ce groupe.</p>';
  }

  function renderCategoryCard(category, favorites, categoryId) {
    if (!favorites.length && state.selectedCategoryId !== 'all') return '';
    if (!favorites.length) return '';
    const isCollapsed = state.collapsedCategoryIds.has(categoryId);
    return `
      <article class="tfm-card">
        <header class="tfm-card__header">
          <button class="tfm-collapse-button" type="button" data-category-id="${escapeHtml(categoryId)}" aria-expanded="${String(!isCollapsed)}">
            <span>${isCollapsed ? '+' : '-'}</span>
            <h2>${escapeHtml(category.name)}</h2>
          </button>
          <span class="tfm-count">${favorites.length}</span>
        </header>
        <div class="tfm-streamers" ${isCollapsed ? 'hidden' : ''}>
          ${favorites.map(renderStreamer).join('')}
        </div>
      </article>
    `;
  }

  function renderStreamer(favorite) {
    const liveLabel = favorite.categoryFilter?.enabled ? '<small>Filtre Twitch actif</small>' : '';
    const live = state.liveByLogin.get(favorite.login);
    const liveStatus = live?.isLive
      ? `<small class="tfm-live">LIVE - ${Number(live.viewers || 0).toLocaleString('fr-FR')} viewers${live.game ? ` - ${escapeHtml(live.game)}` : ''}</small>`
      : '<small>Hors ligne</small>';
    return `
      <a class="tfm-streamer" href="https://www.twitch.tv/${escapeHtml(favorite.login)}" target="_blank" rel="noopener noreferrer">
        <img src="${escapeHtml(favorite.avatarUrl || DEFAULT_AVATAR)}" alt="" />
        <span>
          <strong>${escapeHtml(favorite.displayName || favorite.login)}</strong>
          <small>@${escapeHtml(favorite.login)}</small>
          ${liveStatus}
          ${liveLabel}
        </span>
      </a>
    `;
  }

  function renderVods() {
    const videos = getVisibleVideos();
    if (state.activeView === 'vods') {
      elements.refreshButton.disabled = state.isLoading;
      elements.refreshButton.textContent = state.isLoading ? 'Chargement...' : 'Actualiser les VODs';
    }
    if (state.isLoading) {
      elements.vodSummary.textContent = 'Chargement des VODs Twitch...';
    } else {
      const errorText = state.lastVodErrors.length ? ` - ${state.lastVodErrors.length} erreur${state.lastVodErrors.length > 1 ? 's' : ''} Twitch` : '';
      elements.vodSummary.textContent = `${videos.length} VOD${videos.length > 1 ? 's' : ''}${errorText}`;
    }
    elements.vodList.innerHTML = videos.length
      ? videos.map((entry) => {
        const detail = state.selectedVideoId === entry.video.id ? renderVodDetail(entry.channel, entry.video) : '';
        return `${renderVod(entry)}${detail}`;
      }).join('')
      : '<p class="tfm-empty">Aucune VOD pour ce jour et ce groupe.</p>';
    elements.vodDetail.hidden = true;
    elements.vodDetail.innerHTML = '';
  }

  function renderVod({ channel, video }) {
    const startedAt = new Date(video.createdAt);
    const endedAt = new Date(startedAt.getTime() + Math.max(0, Number(video.lengthSeconds) || 0) * 1000);
    const startTime = startedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const endTime = endedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const selectedClass = state.selectedVideoId === video.id ? ' is-selected' : '';
    return `
      <article class="tfm-vod${selectedClass}" role="button" tabindex="0" data-video-id="${escapeHtml(video.id)}">
        <span class="tfm-vod-time tfm-vod-time--start">
          <small>D&eacute;but</small>
          <strong>${escapeHtml(startTime)}</strong>
        </span>
        <div class="tfm-vod-media">
          <img class="tfm-vod-thumb" src="${escapeHtml(video.thumbnailUrl || channel.avatarUrl || DEFAULT_AVATAR)}" alt="" />
          <img class="tfm-vod-avatar" src="${escapeHtml(channel.avatarUrl || DEFAULT_AVATAR)}" alt="" />
        </div>
        <span class="tfm-vod-time tfm-vod-time--duration">
          <small>Dur&eacute;e</small>
          <strong>${escapeHtml(formatDuration(video.lengthSeconds))}</strong>
        </span>
        <span class="tfm-vod-body">
          <strong>${escapeHtml(video.title)}</strong>
          <small>${escapeHtml(channel.displayName)}</small>
          <small>${Number(video.viewCount || 0).toLocaleString('fr-FR')} vues${video.game ? ` - ${escapeHtml(video.game)}` : ''}</small>
        </span>
        <span class="tfm-vod-time tfm-vod-time--end">
          <small>Fin</small>
          <strong>${escapeHtml(endTime)}</strong>
        </span>
      </article>
    `;
  }

  function renderVodDetail(channel, video) {
    const clips = state.clipsByVideoId.get(video.id) || [];
    const isLoading = state.clipsLoadingVideoId === video.id;
    const duration = Math.max(1, Number(video.lengthSeconds) || 1);
    const topClips = [...clips].sort((a, b) => b.viewCount - a.viewCount || a.offsetSeconds - b.offsetSeconds).slice(0, 12);
    const markerClips = topClips.slice().sort((a, b) => a.offsetSeconds - b.offsetSeconds);
    return `
      <section class="tfm-vod-detail" data-video-id="${escapeHtml(video.id)}">
      <header class="tfm-detail-header">
        <div>
          <p>Analyse VOD</p>
          <h3>${escapeHtml(video.title)}</h3>
          <span>${escapeHtml(channel.displayName)} - ${escapeHtml(formatDuration(video.lengthSeconds))}</span>
        </div>
        <button class="tfm-icon-button" type="button" data-close-vod-detail aria-label="Fermer">x</button>
      </header>
      <div class="tfm-detail-actions">
        <a class="tfm-button tfm-button--primary" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">Ouvrir Twitch</a>
        <span>${Number(video.viewCount || 0).toLocaleString('fr-FR')} vues</span>
      </div>
      <div class="tfm-detail-timeline" aria-label="Timeline des clips">
        <div class="tfm-detail-timeline__bar"></div>
        ${markerClips.map((clip) => {
          const left = Math.min(100, Math.max(0, (clip.offsetSeconds / duration) * 100));
          return `<a class="tfm-detail-marker" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener noreferrer" style="left:${left}%" title="${escapeHtml(`${formatDuration(clip.offsetSeconds)} - ${clip.title}`)}"></a>`;
        }).join('')}
      </div>
      <div class="tfm-detail-labels">
        <span>0:00</span>
        <span>${clips.length} clip${clips.length > 1 ? 's' : ''}</span>
        <span>${escapeHtml(formatDuration(duration))}</span>
      </div>
      ${state.clipsError ? `<p class="tfm-detail-notice">${escapeHtml(state.clipsError)}</p>` : ''}
      <div class="tfm-clip-list">
        ${isLoading ? '<p class="tfm-empty">Chargement des temps forts...</p>' : ''}
        ${!isLoading && topClips.length
          ? topClips.map((clip) => `
            <a class="tfm-clip" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener noreferrer">
              ${clip.thumbnailUrl ? `<img src="${escapeHtml(clip.thumbnailUrl)}" alt="" />` : ''}
              <span>
                <strong>${escapeHtml(clip.title)}</strong>
                <small>${escapeHtml(formatDuration(clip.offsetSeconds))} - ${Number(clip.viewCount || 0).toLocaleString('fr-FR')} vues${clip.curator ? ` - ${escapeHtml(clip.curator)}` : ''}</small>
              </span>
            </a>
          `).join('')
          : ''}
        ${!isLoading && !topClips.length ? '<p class="tfm-empty">Aucun temps fort associe trouve pour cette VOD.</p>' : ''}
      </div>
      </section>
    `;
  }

  function setView(view) {
    state.activeView = view;
    elements.tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === view));
    elements.favoritesView.hidden = view !== 'favorites';
    elements.vodsView.hidden = view !== 'vods';
    elements.refreshButton.hidden = false;
    elements.refreshButton.disabled = view === 'vods' ? state.isLoading : state.isLiveLoading;
    elements.refreshButton.textContent = view === 'vods'
      ? (state.isLoading ? 'Chargement...' : 'Actualiser les VODs')
      : (state.isLiveLoading ? 'Actualisation...' : 'Actualiser les lives');
    if (view === 'vods' && !state.videosByLogin.size) {
      refreshVods();
    }
  }

  function render() {
    renderFilters();
    renderFavorites();
    renderVods();
  }

  function bindEvents() {
    elements.tabs.forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
    elements.searchInput.addEventListener('input', (event) => {
      state.searchTerm = event.target.value || '';
      renderFavorites();
      renderVods();
    });
    elements.groupSelect.addEventListener('change', (event) => {
      state.selectedCategoryId = event.target.value || 'all';
      render();
    });
    elements.liveOnlyInput.addEventListener('change', (event) => {
      state.liveOnly = Boolean(event.target.checked);
      if (state.liveOnly && !state.liveByLogin.size) {
        refreshLiveData();
      }
      renderFilters();
      renderFavorites();
    });
    elements.favoritesList.addEventListener('click', (event) => {
      const button = event.target.closest('.tfm-collapse-button');
      if (!button) return;
      const categoryId = button.dataset.categoryId;
      if (!categoryId) return;
      if (state.collapsedCategoryIds.has(categoryId)) {
        state.collapsedCategoryIds.delete(categoryId);
      } else {
        state.collapsedCategoryIds.add(categoryId);
      }
      renderFavorites();
    });
    elements.vodSearchInput.addEventListener('input', (event) => {
      state.vodSearchTerm = event.target.value || '';
      state.selectedVideoId = '';
      renderVods();
    });
    elements.vodGroupSelect.addEventListener('change', (event) => {
      state.selectedVodCategoryId = event.target.value || 'all';
      state.selectedVideoId = '';
      ensureDayHasContent();
      renderFilters();
      renderVods();
    });
    elements.vodSortSelect.addEventListener('change', (event) => {
      state.vodSortKey = event.target.value || 'time';
      renderFilters();
      renderVods();
    });
    elements.vodSortDirectionButton.addEventListener('click', () => {
      state.vodSortDirection = state.vodSortDirection === 'asc' ? 'desc' : 'asc';
      renderFilters();
      renderVods();
    });
    elements.vodList.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-vod-detail]')) {
        closeVodDetail();
        return;
      }
      const card = event.target.closest('.tfm-vod');
      if (!card) return;
      selectVideo(card.dataset.videoId);
    });
    elements.vodList.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest('.tfm-vod');
      if (!card) return;
      event.preventDefault();
      selectVideo(card.dataset.videoId);
    });
    elements.refreshButton.addEventListener('click', () => {
      if (state.activeView === 'vods') {
        refreshVods();
        return;
      }
      refreshLiveData();
    });
    elements.updateDismissButton?.addEventListener('click', () => {
      const updateState = getUpdateState();
      if (updateState.latestVersion) {
        setUpdateState({
          dismissedVersion: normalizeVersion(updateState.latestVersion),
          snoozeUntil: null
        });
      }
      hideUpdateBanner();
    });
    elements.demoButton.addEventListener('click', () => {
      loadDemoData();
      render();
      refreshLiveData();
    });
    elements.clearDataButton.addEventListener('click', clearData);
    elements.drivePullButton?.addEventListener('click', pullBackupFromDrive);
    elements.drivePushButton?.addEventListener('click', pushBackupToDrive);
    elements.driveSignOutButton?.addEventListener('click', signOutDrive);
    elements.previousDayButton.addEventListener('click', () => {
      state.selectedDay = clampDay(state.selectedDay - DAY_MS);
      state.selectedVideoId = '';
      renderFilters();
      renderVods();
    });
    elements.nextDayButton.addEventListener('click', () => {
      state.selectedDay = clampDay(state.selectedDay + DAY_MS);
      state.selectedVideoId = '';
      renderFilters();
      renderVods();
    });
    elements.dayInput.addEventListener('change', (event) => {
      state.selectedDay = clampDay(parseDateValue(event.target.value));
      state.selectedVideoId = '';
      renderFilters();
      renderVods();
    });
    elements.backupInput.addEventListener('change', async (event) => {
      const [file] = event.target.files || [];
      if (!file) return;
      try {
        normalizeBackup(JSON.parse(await file.text()));
        state.liveByLogin.clear();
        state.videosByLogin.clear();
        state.clipsByVideoId.clear();
        state.selectedVideoId = '';
        setImportStatus('Backup importe. Les groupes et streamers sont prets.');
        render();
        refreshLiveData();
      } catch (error) {
        setImportStatus(`Import impossible: ${error?.message || 'JSON invalide'}`, true);
      }
    });
  }

  readLocalState();
  bindEvents();
  render();
  setView(state.activeView);
  refreshLiveData();
  checkForUpdates(false);
})();

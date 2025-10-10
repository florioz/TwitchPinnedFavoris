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
      recentLiveCollapsed: false
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
  const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';

  const RESERVED_PATHS = new Set([
    '', 'directory', 'p', 'jobs', 'downloads', 'friends', 'messages', 'settings',
    'logout', 'signup', 'products', 'store', 'turbo', 'videos', 'search'
  ]);

  const CHANGE_KIND = { STATE: 'state', LIVE: 'live' };
  const POLL_INTERVAL_MS = 60000;
  const LOCATION_CHECK_INTERVAL = 500;

  const deepCopy = (value) => (value ? JSON.parse(JSON.stringify(value)) : value);

  const formatViewers = (count) => {
    if (!count || Number.isNaN(count)) return '0';
    if (count < 1000) return `${count}`;
    if (count < 1000000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
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
          name: 'Favoris',
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
          recentLiveCollapsed: false
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
      const categoryIdMap = new Map();
      this.state.categories.forEach((category, index) => {
        if (!category || typeof category !== 'object') {
          this.state.categories[index] = {
            id: `cat_${Date.now()}_${index}`,
            name: 'Favoris',
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
          category.name = 'Favoris';
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
          name: 'Favoris',
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
        addedAt: typeof raw.addedAt === 'number' ? raw.addedAt : Date.now()
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
        categoryFilter: { enabled: false, categories: [] }
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

    ensureContainer() {
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
      section.style.pointerEvents = 'auto';
      list.style.pointerEvents = 'auto';

      const needsListItem = list.tagName === 'UL' || list.getAttribute('role') === 'list';
      const existingNodes = Array.from(list.querySelectorAll('#tfr-favorites-root'));
      let container = existingNodes.shift() || null;
      existingNodes.forEach((node) => node.remove());
      if (!container) {
        container = document.createElement(needsListItem ? 'li' : 'div');
        console.log('[TFR] created favorites container', container);        container.id = 'tfr-favorites-root';
        container.className = 'tfr-favorites-root';
        if (needsListItem) container.classList.add('tfr-favorites-root--list-item', 'side-nav-card');
        list.insertBefore(container, list.firstChild || null);
      } else if (container.parentElement !== list) {
        list.insertBefore(container, list.firstChild || null);
      }
      container.style.pointerEvents = 'auto';
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
          .filter((fav) => shouldDisplayFavorite(fav, liveData[fav.login]))
          .filter((fav) => {
            const live = liveData[fav.login];
            if (!live?.isLive) {
              return false;
            }
            const startedAt = live.startedAt ? Date.parse(live.startedAt) : NaN;
            if (!Number.isFinite(startedAt)) {
              return false;
            }
            const diff = now - startedAt;
            return diff >= 0 && diff <= thresholdMs;
          })
          .sort(comparator);
        if (recentEntries.length) {
          groups.unshift({
            id: 'recentLive',
            name: 'D\u00e9but de live',
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
      viewerLine.textContent = `${formatViewers(live?.viewers || 0)} spectateurs`;
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
    header.textContent = totalLive ? `Favoris en live (${totalLive})` : 'Favoris en live';
    header.setAttribute('aria-expanded', String(!isCollapsed));
    header.addEventListener('click', () => this.store.toggleLiveFavoritesCollapsed());
    this.container.appendChild(header);

    if (!totalLive) {
      const empty = document.createElement('div');
      empty.className = 'tfr-empty';
      empty.textContent = 'Aucun favori en direct pour le moment.';
      this.container.appendChild(empty);
      return;
    }

    if (isCollapsed) {
      const collapsedNotice = document.createElement('div');
      collapsedNotice.className = 'tfr-empty';
      collapsedNotice.textContent = 'Favoris masqu\u00E9s. Cliquez sur le titre pour les afficher.';
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
        button.textContent = 'Favori indisponible';
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
    title.textContent = 'Gestion des favoris';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'tfr-overlay-close';
    closeButton.setAttribute('aria-label', 'Fermer');
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
    content.innerHTML = '';

    const controls = document.createElement('div');
    controls.className = 'tfr-manager-controls';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Rechercher un streamer...';
    searchInput.value = this.searchTerm;
    searchInput.addEventListener('input', (event) => {
      this.searchTerm = event.target.value;
      this.render();
    });
    const sortSelect = document.createElement('select');
    sortSelect.innerHTML = `
      <option value="viewersDesc">Trier par viewers (desc.)</option>
      <option value="alphabetical">Trier A -> Z</option>
      <option value="recent">Trier par ajout rAcent</option>
    `;
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

    const board = this.renderBoard(state, liveData);
    content.appendChild(board);

    this.renderFavoriteDetailsPanel(state, liveData);
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
    toggleText.textContent = 'Activer la section \u00ab D\u00e9but de live \u00bb';
    toggleLabel.appendChild(toggle);
    toggleLabel.appendChild(toggleText);
    wrapper.appendChild(toggleLabel);

    const thresholdWrapper = document.createElement('div');
    thresholdWrapper.className = 'tfr-recent-live-threshold';
    const thresholdLabel = document.createElement('label');
    thresholdLabel.textContent = 'Dur\u00e9e maximale :';
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
    thresholdSuffix.textContent = 'minutes';
    thresholdWrapper.appendChild(thresholdSuffix);
    wrapper.appendChild(thresholdWrapper);

    const hint = document.createElement('p');
    hint.className = 'tfr-recent-live-hint';
    hint.textContent = 'Affiche les streamers qui viennent de lancer leur live pendant une dur\u00e9e limit\u00e9e.';
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

    const title = document.createElement('h3');
    title.className = 'tfr-board-title';
    title.textContent = 'Favoris disponibles';
    column.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'tfr-board-subtitle';
    subtitle.textContent = 'Glissez une pastille vers une categorie a droite pour organiser vos favoris.';
    column.appendChild(subtitle);

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
      empty.textContent = term ? 'Aucun favori disponible ne correspond.' : 'Tous les favoris sont deja ranges.';
      grid.appendChild(empty);
    } else {
      freeFavorites.forEach((fav) => {
        const chip = this.createFavoriteChip(fav, liveData);
        grid.appendChild(chip);
      });
    }

    column.appendChild(grid);
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
    title.textContent = 'Categories';
    header.appendChild(title);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'tfr-chip-action';
    addButton.textContent = 'Nouvelle categorie';
    addButton.addEventListener('click', async () => {
      const name = window.prompt('Nom de la categorie');
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
      empty.textContent = 'Creez votre premiere categorie pour commencer.';
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
    collapseBtn.textContent = node.collapsed ? 'Afficher' : 'Masquer';
    collapseBtn.addEventListener('click', async () => {
      await this.store.toggleCategoryCollapse(node.id);
      this.render();
    });
    actions.appendChild(collapseBtn);

    const addSubBtn = document.createElement('button');
    addSubBtn.type = 'button';
    addSubBtn.className = 'tfr-chip-action';
    addSubBtn.textContent = 'Sous-cat.';
    addSubBtn.addEventListener('click', async () => {
      const name = window.prompt('Nom de la sous-categorie', `${node.name} ${node.children.length + 1}`);
      if (!name) return;
      await this.store.createCategory(name, node.id);
      this.render();
    });
    actions.appendChild(addSubBtn);

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'tfr-chip-action';
    renameBtn.textContent = 'Renommer';
    renameBtn.addEventListener('click', async () => {
      const name = window.prompt('Nouveau nom de categorie', node.name);
      if (!name) return;
      await this.store.renameCategory(node.id, name);
      this.render();
    });
    actions.appendChild(renameBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'tfr-chip-action tfr-chip-action--danger';
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.addEventListener('click', async () => {
      const confirmed = window.confirm(`Supprimer "${node.name}" ?`);
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
      empty.textContent = term ? 'Aucun favori ne correspond.' : 'Glissez un favori ici';
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
    button.title = `Param\u00e9trer ${fav.displayName || fav.login}`;

    const avatar = document.createElement('img');
    avatar.className = 'tfr-category-square__avatar';
    avatar.src = (liveData[fav.login]?.avatarUrl) || fav.avatarUrl || DEFAULT_AVATAR;
    avatar.alt = '';
    button.appendChild(avatar);

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
    exportButton.textContent = 'Exporter le backup';
    exportButton.addEventListener('click', () => this.handleExportBackup());

    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'tfr-button tfr-button--ghost';
    importButton.textContent = this.isImportingBackup ? 'Import en cours...' : 'Importer un backup';
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
    pasteButton.textContent = 'Coller un JSON';
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
      window.alert('Impossible de gAnArer le backup. Consultez la console pour plus de dAtails.');
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
          ? 'Le fichier ne contient pas un JSON de backup valide.'
          : 'Lecture du fichier impossible. Essayez un autre fichier JSON.';
      window.alert(message);
    } finally {
      this.isImportingBackup = false;
      if (this.isOpen) {
        this.render();
      }
    }
  }

  async importBackupFromText() {
    const input = window.prompt('Collez ici le contenu JSON du backup :');
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
          ? 'Le contenu fourni naTMest pas un JSON de backup valide.'
          : 'Import impossible. RAessayez.';
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
    const confirmed = window.confirm('Importer ce backup remplacera vos favoris actuels. Continuer ?');
    if (!confirmed) {
      return;
    }
    await this.store.restoreFromBackup(parsed);
    window.alert('Backup importe avec succes !');
  }

  renderCategories(content, state) {
    const categoriesSection = document.createElement('section');
    categoriesSection.className = 'tfr-categories-section';

    const header = document.createElement('div');
    header.className = 'tfr-categories-header';
    header.textContent = 'Cat\u00e9gories';

    const addCategory = document.createElement('button');
    addCategory.type = 'button';
    addCategory.className = 'tfr-button';
    addCategory.textContent = 'Ajouter une cat\u00e9gorie';
    addCategory.addEventListener('click', async () => {
      const name = window.prompt('Nom de la nouvelle cat\u00e9gorie');
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
      empty.textContent = 'Aucune cat\u00e9gorie pour le moment.';
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
        name.textContent = 'Sans cat\u00e9gorie';
        const meta = document.createElement('span');
        meta.className = 'tfr-category-meta';
        meta.textContent = `${uncategorizedFavorites.length} favori${uncategorizedFavorites.length > 1 ? 's' : ''} sans cat\u00e9gorie`;
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
        hint.textContent = 'Attribuez une cat\u00e9gorie via la liste des favoris ci-dessous.';
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
    meta.textContent = `${totalCount} favori${totalCount > 1 ? 's' : ''}`;
    title.appendChild(name);
    title.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'tfr-category-item-actions';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tfr-button tfr-button--ghost';
    toggle.textContent = category.collapsed ? 'D\u00e9velopper' : 'R\u00e9duire';
    toggle.addEventListener('click', async () => {
      await this.store.toggleCategoryCollapse(category.id);
      this.render();
    });

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'tfr-button tfr-button--ghost';
    rename.textContent = 'Renommer';
    rename.addEventListener('click', async () => {
      const next = window.prompt('Nouveau nom de cat\u00e9gorie', category.name);
      if (!next) {
        return;
      }
      await this.store.renameCategory(category.id, next);
      this.render();
    });

    const addSub = document.createElement('button');
    addSub.type = 'button';
    addSub.className = 'tfr-button tfr-button--ghost';
    addSub.textContent = 'Ajouter une sous-cat\u00e9gorie';
    addSub.addEventListener('click', async () => {
      const nameValue = window.prompt('Nom de la nouvelle sous-cat\u00e9gorie');
      if (!nameValue) {
        return;
      }
      await this.store.createCategory(nameValue, category.id);
      this.render();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tfr-button tfr-button--danger';
    remove.textContent = 'Supprimer';
    remove.addEventListener('click', async () => {
      const confirmed = window.confirm('Supprimer cette cat\u00e9gorie ? Les favoris resteront enregistr\u00e9s.');
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
        chipButton.title = 'Param\u00e8tres du streamer';
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
      empty.textContent = 'Aucun favori assign\u00e9 pour le moment.';
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
      placeholder.textContent = 'Assigner un favori...';
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
      assignButton.textContent = 'Assigner';
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
    panel.setAttribute('aria-label', `Param\u00e8tres pour ${favorite.displayName}`);
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
    closeButton.setAttribute('aria-label', `Fermer les param\u00e8tres de ${favorite.displayName}`);
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
    categoryTitle.textContent = 'Cat\u00e9gorie dans l\'extension';
    categorySection.appendChild(categoryTitle);
    const categorySelect = document.createElement('select');
    categorySelect.className = 'tfr-category-select tfr-category-select--wide';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = flatCategories.length ? 'Sans cat\u00e9gorie' : 'Aucune cat\u00e9gorie disponible';
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
      categoryHint.textContent = 'Cr\u00e9ez une cat\u00e9gorie dans la colonne de gauche pour l\'assigner.';
      categorySection.appendChild(categoryHint);
    }
    body.appendChild(categorySection);

    const filterSection = document.createElement('section');
    filterSection.className = 'tfr-details-section';
    const filterTitle = document.createElement('h4');
    filterTitle.className = 'tfr-details-section__title';
    filterTitle.textContent = 'Filtre de cat\u00e9gorie Twitch';
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
    filterToggleText.textContent = 'Afficher seulement lorsque le streamer est sur ces cat\u00e9gories';
    filterToggleLabel.appendChild(filterToggle);
    filterToggleLabel.appendChild(filterToggleText);
    filterContainer.appendChild(filterToggleLabel);
    const listWrapper = document.createElement('div');
    listWrapper.className = 'tfr-category-filter__list';
    if (!filterCategories.length) {
      const empty = document.createElement('span');
      empty.className = 'tfr-category-filter__empty';
      empty.textContent = filterToggle.checked
        ? 'Aucune cat\u00e9gorie s\u00e9lectionn\u00e9e.'
        : 'Activez le filtre pour ajouter des cat\u00e9gories.';
      listWrapper.appendChild(empty);
    } else {
      filterCategories.forEach((category) => {
        const chip = document.createElement('span');
        chip.className = 'tfr-category-filter__chip';
        chip.textContent = category;
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'tfr-category-filter__remove';
        removeButton.setAttribute('aria-label', `Retirer ${category}`);
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
    filterInput.placeholder = 'Ajouter une cat\u00e9gorie Twitch (ex : Just Chatting)';
    filterInput.value = '';
    filterInput.autocomplete = 'off';
    filterInput.spellcheck = false;
    const datalistId = `${filterToggleId}-list`;
    filterInput.setAttribute('list', datalistId);
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'tfr-category-filter__add';
    addButton.textContent = 'Ajouter';
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
    const liveCategoryInfo = document.createElement('small');
    liveCategoryInfo.className = 'tfr-category-filter__hint';
    if (live?.isLive) {
      liveCategoryInfo.textContent = live?.game
        ? `Cat\u00e9gorie actuelle : ${live.game}`
        : 'Cat\u00e9gorie actuelle indisponible';
    } else {
      liveCategoryInfo.textContent = 'Actuellement hors ligne';
    }
    filterContainer.appendChild(liveCategoryInfo);
    const applyToggleState = (enabled) => {
      filterInput.disabled = !enabled;
      addButton.disabled = !enabled;
    };
    applyToggleState(filterToggle.checked);
    filterToggle.addEventListener('change', async (event) => {
      const enabled = event.target.checked;
      applyToggleState(enabled);
      const latestCategories =
        this.store.getState().favorites?.[favorite.login]?.categoryFilter?.categories;
      const payloadCategories = Array.isArray(latestCategories) ? latestCategories : filterCategories;
      await this.store.setFavoriteCategoryFilter(favorite.login, {
        enabled,
        categories: Array.isArray(payloadCategories) ? [...payloadCategories] : []
      });
      this.render();
    });
    const addCategory = async () => {
      const value = filterInput.value.trim();
      if (!value) {
        filterInput.value = '';
        return;
      }
      const latestCategories =
        this.store.getState().favorites?.[favorite.login]?.categoryFilter?.categories;
      const current = Array.isArray(latestCategories) ? latestCategories : filterCategories;
      const exists = current.some(
        (entry) => normalizeCategoryName(entry) === normalizeCategoryName(value)
      );
      if (exists) {
        filterInput.value = '';
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
      this.render();
    };
    addButton.addEventListener('click', addCategory);
    filterInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addCategory();
      }
    });
    filterSection.appendChild(filterContainer);
    body.appendChild(filterSection);

    const infoSection = document.createElement('section');
    infoSection.className = 'tfr-details-section tfr-details-section--info';
    const statusLine = document.createElement('p');
    statusLine.className = 'tfr-details-info';
    let highlightLine = null;
    if (live?.isLive) {
      const viewers = formatViewers(live.viewers || 0);
      const startedAtValue = live.startedAt ? Date.parse(live.startedAt) : NaN;
      if (Number.isFinite(startedAtValue)) {
        const elapsedMinutes = Math.max(0, Math.floor((Date.now() - startedAtValue) / 60000));
        const gameLabel = live.game || 'cat\u00e9gorie inconnue';
        statusLine.textContent = `En direct depuis ${elapsedMinutes} min sur ${gameLabel} avec ${viewers} spectateurs.`;
        if (prefs.recentLiveEnabled) {
          const thresholdMinutes = Number.isFinite(Number(prefs.recentLiveThresholdMinutes))
            ? Math.max(1, Math.min(120, Math.round(Number(prefs.recentLiveThresholdMinutes))))
            : 10;
          if (elapsedMinutes <= thresholdMinutes) {
            highlightLine = document.createElement('p');
            highlightLine.className = 'tfr-details-info tfr-details-info--highlight';
            highlightLine.textContent = `Appara\u00eet dans la section \u00ab D\u00e9but de live \u00bb (limite : ${thresholdMinutes} min).`;
          }
        }
      } else {
        statusLine.textContent = `En direct sur ${live.game || 'cat\u00e9gorie inconnue'} avec ${viewers} spectateurs.`;
      }
    } else {
      statusLine.textContent = 'Ce streamer n\'est pas en direct pour le moment.';
    }
    infoSection.appendChild(statusLine);
    if (highlightLine) {
      infoSection.appendChild(highlightLine);
    }
    const closeLink = document.createElement('button');
    closeLink.type = 'button';
    closeLink.className = 'tfr-details-close';
    closeLink.textContent = 'Fermer';
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
    this.observer = new MutationObserver(() => this.scheduleInjection());
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  dispose() {
    this.log('dispose');
    this.observer?.disconnect();
    if (this.injectFrame !== null) {
      cancelAnimationFrame(this.injectFrame);
      this.injectFrame = null;
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
    button.setAttribute('aria-label', 'Favoris');
    button.setAttribute('aria-pressed', 'false');
    button.title = 'Favoris';
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
        insertionReference = anchor?.nextElementSibling || null;
      }
      if (anchorGrand && this.isUsableParent(anchorGrand) && anchorGrand !== parent && anchorGrand !== insertionParent) {
        insertionReference = anchorParent?.nextElementSibling || null;
        insertionParent = anchorGrand;
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



  const bootstrap = async () => {
    const store = new FavoritesStore();
    await store.init();

    const sidebar = new SidebarRenderer(store);
    sidebar.init();

    const funnelButton = new ChannelFavoriteButton(store);
    funnelButton.init();

    const overlay = new FavoritesOverlay(store);
    const topNav = new TopNavManager(overlay);
    topNav.init();

    window.addEventListener('focus', () => store.refreshLiveData());
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();












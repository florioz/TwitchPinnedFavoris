(() => {
  const STORAGE_KEY = 'tfr_state';
  const DEFAULT_STATE = {
    favorites: {},
    categories: [],
    preferences: {
      sortMode: 'viewersDesc',
      uncategorizedCollapsed: false,
      liveFavoritesCollapsed: false
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
          game: ''
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
        game: stream?.game?.name || ''
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
        game: ''
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
        this.state.preferences = { sortMode: 'viewersDesc', uncategorizedCollapsed: false };
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
        addedAt: Date.now()
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
        const entries = rawEntries.filter((fav) => liveData[fav.login]?.isLive).sort(comparator);
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
      const uncategorizedEntries = uncategorized
        .filter((fav) => liveData[fav.login]?.isLive)
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

      const avatar = document.createElement('img');
      avatar.className = 'tfr-favorite-entry__avatar';
      avatar.src = (live && live.avatarUrl) || fav.avatarUrl || DEFAULT_AVATAR;
      avatar.alt = fav.displayName;

      const info = document.createElement('div');
      info.className = 'tfr-favorite-entry__info';
      const nameLine = document.createElement('span');
      nameLine.className = 'tfr-favorite-entry__name';
      nameLine.textContent = live?.displayName || fav.displayName;
      const viewerLine = document.createElement('span');
      viewerLine.className = 'tfr-favorite-entry__viewers';
      viewerLine.textContent = `${formatViewers(live?.viewers || 0)} spectateurs`;
      info.appendChild(nameLine);
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

      const headerRow = document.createElement('button');
      headerRow.type = 'button';
      headerRow.className = 'tfr-category-header';
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
        if (group.isUncategorized) {
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
      button.textContent = 'Ajouter aux favoris';
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
        button.textContent = 'Retirer des favoris';
        button.classList.add('is-remove');
      } else {
        button.textContent = 'Ajouter aux favoris';
        button.classList.remove('is-remove');
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

    const board = this.renderBoard(state, liveData);
    content.appendChild(board);
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
        const square = this.createFavoriteSquare(fav, liveData, term);
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

  createFavoriteSquare(fav, liveData, term) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tfr-category-square';
    button.title = `Retirer ${fav.displayName || fav.login} de cette categorie`;

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
    button.addEventListener('click', async () => {
      await this.store.clearFavoriteCategory(fav.login);
      this.render();
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
        chipButton.title = 'Retirer de cette cat\u00e9gorie';
        const chipAvatar = document.createElement('img');
        chipAvatar.className = 'tfr-category-chip-btn__avatar';
        chipAvatar.src = fav.avatarUrl || DEFAULT_AVATAR;
        chipAvatar.alt = '';
        const chipLabel = document.createElement('span');
        chipLabel.textContent = fav.displayName || fav.login;
        chipButton.appendChild(chipAvatar);
        chipButton.appendChild(chipLabel);
        chipButton.addEventListener('click', async () => {
          await this.store.clearFavoriteCategory(fav.login);
          this.render();
        });
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

  renderFavorites(content, state, liveData) {
    const favoritesSection = document.createElement('section');
    favoritesSection.className = 'tfr-favorites-section';

    const header = document.createElement('div');
    header.className = 'tfr-favorites-header';
    header.textContent = 'Favoris';
    favoritesSection.appendChild(header);

    const list = document.createElement('div');
    list.className = 'tfr-favorites-list';

    const allFavorites = Object.values(state.favorites);
    const term = this.searchTerm.trim().toLowerCase();
    const filtered = allFavorites.filter((fav) => {
      if (!term) return true;
      return fav.login.toLowerCase().includes(term) || (fav.displayName || '').toLowerCase().includes(term);
    });

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
    const sorters = {
      viewersDesc: (a, b) => {
        const av = liveData[a.login]?.viewers || 0;
        const bv = liveData[b.login]?.viewers || 0;
        if (bv !== av) return bv - av;
        return a.displayName.localeCompare(b.displayName, 'fr');
      },
      alphabetical: (a, b) => a.displayName.localeCompare(b.displayName, 'fr'),
      recent: (a, b) => (b.addedAt || 0) - (a.addedAt || 0)
    };
    filtered.sort(sorters[this.sortMode] || sorters.viewersDesc);

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'tfr-empty-state';
      empty.textContent = term ? 'Aucun favori ne correspond a la recherche.' : 'Ajoutez vos streamers favoris pour les gerer ici.';
      list.appendChild(empty);
    } else {
      filtered.forEach((fav) => {
        const live = liveData[fav.login];

        const row = document.createElement('div');
        row.className = 'tfr-favorite-row';
        row.draggable = true;
        row.dataset.login = fav.login;
        row.addEventListener('dragstart', (event) => {
          if (event.dataTransfer) {
            event.dataTransfer.setData('text/plain', fav.login);
            event.dataTransfer.effectAllowed = 'move';
          }
          row.classList.add('is-dragging');
          this.draggedLogin = fav.login;
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('is-dragging');
          this.draggedLogin = null;
        });

        const info = document.createElement('div');
        info.className = 'tfr-favorite-row__info';
        const avatar = document.createElement('img');
        avatar.className = 'tfr-favorite-row__avatar';
        avatar.src = (live && live.avatarUrl) || fav.avatarUrl || DEFAULT_AVATAR;
        avatar.alt = fav.displayName;
        const textWrapper = document.createElement('div');
        textWrapper.className = 'tfr-favorite-row__text';
        const name = document.createElement('span');
        name.className = 'tfr-favorite-row__name';
        name.textContent = fav.displayName;
        const meta = document.createElement('span');
        meta.className = 'tfr-favorite-row__meta';
        if (live?.isLive) {
          meta.classList.add('is-live');
          meta.textContent = `En live \u00e0 ${formatViewers(live.viewers)} spectateurs`;
        } else {
          meta.textContent = 'Hors ligne';
        }
        textWrapper.appendChild(name);
        textWrapper.appendChild(meta);
        info.appendChild(avatar);
        info.appendChild(textWrapper);

        const categoriesWrap = document.createElement('div');
        categoriesWrap.className = 'tfr-favorite-row__categories';
        const categorySelect = document.createElement('select');
        categorySelect.className = 'tfr-category-select';
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
        const currentCategory = Array.isArray(fav.categories) && fav.categories.length ? fav.categories[0] : '';
        categorySelect.value = currentCategory || '';
        categorySelect.disabled = !flatCategories.length;
        categorySelect.addEventListener('change', async (event) => {
          const value = event.target.value;
          await this.store.setFavoriteCategory(fav.login, value || null);
          this.render();
        });
        categoriesWrap.appendChild(categorySelect);
        if (!flatCategories.length) {
          const hint = document.createElement('span');
          hint.className = 'tfr-empty-state';
          hint.textContent = 'Cr\u00e9ez une cat\u00e9gorie pour organiser ce favori.';
          categoriesWrap.appendChild(hint);
        }

        const actions = document.createElement('div');
        actions.className = 'tfr-favorite-row__actions';
        const visit = document.createElement('a');
        visit.href = `https://www.twitch.tv/${fav.login}`;
        visit.target = '_blank';
        visit.rel = 'noopener noreferrer';
        visit.className = 'tfr-button tfr-button--ghost';
        visit.textContent = 'Ouvrir';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'tfr-button tfr-button--danger';
        remove.textContent = 'Supprimer';
        remove.addEventListener('click', async () => {
          const confirmed = window.confirm(`Retirer ${fav.displayName} des favoris ?`);
          if (!confirmed) {
            return;
          }
          await this.store.removeFavorite(fav.login);
          this.render();
        });

        actions.appendChild(visit);
        actions.appendChild(remove);

        row.appendChild(info);
        row.appendChild(categoriesWrap);
        row.appendChild(actions);
        list.appendChild(row);
      });
    }

    favoritesSection.appendChild(list);
    content.appendChild(favoritesSection);
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
      const anchor = findAnchorInParent(parent);
      const reference = anchor ? anchor.nextElementSibling : null;
      this.log('mount-point', {
        strategy: 'container',
        selector,
        anchorTag: anchor?.tagName,
        hasReference: Boolean(reference)
      });
      return { parent, reference, anchor };
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
    button.innerHTML = '<svg class="tfr-topnav-action__icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.46 13.97 5.82 21z"></path></svg>';
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
      slot.style.margin = '';
      slot.style.width = '';
      slot.style.height = '';
      button.style.width = '';
      button.style.height = '';
      button.style.margin = '0';
      this.log('sync-anchor-missing');
      return slot;
    }
    const style = window.getComputedStyle(source);
    if (style) {
      slot.style.margin = style.margin;
      if (style.width && style.width !== 'auto') {
        slot.style.width = style.width;
        button.style.width = '100%';
      } else {
        slot.style.width = '';
        button.style.width = '';
      }
      if (style.height && style.height !== 'auto') {
        slot.style.height = style.height;
        button.style.height = '100%';
      } else {
        slot.style.height = '';
        button.style.height = '';
      }
      button.style.margin = '0';
    }
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







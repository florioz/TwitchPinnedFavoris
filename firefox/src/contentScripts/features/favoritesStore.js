(() => {
  const createFavoritesStore = ({
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
  }) => {
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
      const normalizedFavorites = {};
      Object.entries(this.state.favorites).forEach(([login, fav]) => {
        if (!fav) {
          return;
        }
        const normalizedLogin = String(fav.login || login || '').toLowerCase();
        if (!normalizedLogin) {
          return;
        }
        fav.login = normalizedLogin;
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
        normalizedFavorites[normalizedLogin] = fav;
      });
      this.state.favorites = normalizedFavorites;
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
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: this.state });
      } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('extension context invalidated') || message.includes('context invalidated')) {
          return;
        }
        console.error('[TFR] Failed to persist state', error);
      }
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
      const live = await fetchStreamerLiveData(normalized, this.store.getState().favorites[normalized]);
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

    applyCurrentPageLiveData(login) {
      const normalized = String(login || '').toLowerCase();
      if (!normalized || !this.state.favorites[normalized]) {
        return false;
      }
      const pageLive = inferCurrentPageLiveData(normalized, {
        ...this.state.favorites[normalized],
        ...(getLiveDataEntry(this.liveData, normalized) || {})
      });
      if (!pageLive) {
        return false;
      }
      this.liveData[normalized] = pageLive;
      this.emitter.emit({ kind: CHANGE_KIND.LIVE, liveData: this.getLiveData() });
      return true;
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

    async moveCategoryUp(categoryId) {
      await this.updateState((draft) => {
        const target = draft.categories.find((cat) => cat.id === categoryId);
        if (!target) return;
        const siblings = draft.categories
          .filter((cat) => cat.parentId === target.parentId)
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            return a.name.localeCompare(b.name, 'fr');
          });
        const index = siblings.findIndex((cat) => cat.id === categoryId);
        if (index <= 0) return;
        const previous = siblings[index - 1];
        const temp = target.sortOrder;
        target.sortOrder = previous.sortOrder;
        previous.sortOrder = temp;
      });
    }

    async moveCategoryDown(categoryId) {
      await this.updateState((draft) => {
        const target = draft.categories.find((cat) => cat.id === categoryId);
        if (!target) return;
        const siblings = draft.categories
          .filter((cat) => cat.parentId === target.parentId)
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            return a.name.localeCompare(b.name, 'fr');
          });
        const index = siblings.findIndex((cat) => cat.id === categoryId);
        if (index < 0 || index === siblings.length - 1) return;
        const next = siblings[index + 1];
        const temp = target.sortOrder;
        target.sortOrder = next.sortOrder;
        next.sortOrder = temp;
      });
    }

    async indentCategory(categoryId) {
      await this.updateState((draft) => {
        const target = draft.categories.find((cat) => cat.id === categoryId);
        if (!target) return;
        const siblings = draft.categories
          .filter((cat) => cat.parentId === target.parentId)
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            return a.name.localeCompare(b.name, 'fr');
          });
        const index = siblings.findIndex((cat) => cat.id === categoryId);
        if (index <= 0) return;
        const newParent = siblings[index - 1];
        if (!newParent || newParent.id === target.id) return;
        const isDescendant = (candidateId, childId) => {
          let current = candidateId;
          while (current) {
            if (current === childId) return true;
            const next = draft.categories.find((cat) => cat.id === current);
            current = next?.parentId || null;
          }
          return false;
        };
        if (isDescendant(newParent.id, target.id)) return;
        target.parentId = newParent.id;
        target.sortOrder = Date.now();
      });
    }

    async outdentCategory(categoryId) {
      await this.updateState((draft) => {
        const target = draft.categories.find((cat) => cat.id === categoryId);
        if (!target) return;
        if (!target.parentId) return;
        const parent = draft.categories.find((cat) => cat.id === target.parentId);
        const previousParentId = target.parentId;
        const nextParentId = parent?.parentId || null;
        const siblings = draft.categories
          .filter((cat) => (cat.parentId || null) === (nextParentId || null) && cat.id !== target.id)
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            return a.name.localeCompare(b.name, 'fr');
          });
        const parentIndex = siblings.findIndex((cat) => cat.id === parent?.id);
        target.parentId = nextParentId;
        siblings.splice(parentIndex >= 0 ? parentIndex + 1 : siblings.length, 0, target);
        siblings.forEach((cat, index) => {
          cat.sortOrder = (index + 1) * 1000;
        });
        draft.categories
          .filter((cat) => (cat.parentId || null) === (previousParentId || null))
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            return a.name.localeCompare(b.name, 'fr');
          })
          .forEach((cat, index) => {
            cat.sortOrder = (index + 1) * 1000;
          });
      });
    }

    async setCategoryParent(categoryId, parentId) {
      await this.updateState((draft) => {
        const target = draft.categories.find((cat) => cat.id === categoryId);
        if (!target) return;
        if (parentId === target.id) return;
        const isDescendant = (candidateId, childId) => {
          let current = candidateId;
          while (current) {
            if (current === childId) return true;
            const next = draft.categories.find((cat) => cat.id === current);
            current = next?.parentId || null;
          }
          return false;
        };
        if (parentId && isDescendant(parentId, target.id)) return;
        target.parentId = parentId || null;
        target.sortOrder = Date.now();
      });
    }

    async moveCategory(categoryId, targetCategoryId = null, placement = 'inside') {
      await this.updateState((draft) => {
        const target = draft.categories.find((cat) => cat.id === categoryId);
        if (!target) return;
        const reference = targetCategoryId
          ? draft.categories.find((cat) => cat.id === targetCategoryId)
          : null;
        if (targetCategoryId && !reference) return;
        if (reference?.id === target.id && placement !== 'root') return;

        const isDescendant = (candidateId, childId) => {
          let current = candidateId;
          while (current) {
            if (current === childId) return true;
            const next = draft.categories.find((cat) => cat.id === current);
            current = next?.parentId || null;
          }
          return false;
        };

        if (reference && placement !== 'root' && isDescendant(reference.id, target.id)) return;

        const normalizeSiblings = (parentId) => {
          draft.categories
            .filter((cat) => (cat.parentId || null) === (parentId || null))
            .sort((a, b) => {
              if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
              return a.name.localeCompare(b.name, 'fr');
            })
            .forEach((cat, index) => {
              cat.sortOrder = (index + 1) * 1000;
            });
        };

        const insertAmongSiblings = (parentId, referenceId, insertAfter) => {
          const siblings = draft.categories
            .filter((cat) => (cat.parentId || null) === (parentId || null) && cat.id !== target.id)
            .sort((a, b) => {
              if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
              return a.name.localeCompare(b.name, 'fr');
            });
          const referenceIndex = siblings.findIndex((cat) => cat.id === referenceId);
          if (referenceIndex < 0) return false;
          siblings.splice(referenceIndex + (insertAfter ? 1 : 0), 0, target);
          target.parentId = parentId || null;
          siblings.forEach((cat, index) => {
            cat.sortOrder = (index + 1) * 1000;
          });
          return true;
        };

        const previousParentId = target.parentId || null;
        if (placement === 'out') {
          if (!previousParentId) return;
          const parent = draft.categories.find((cat) => cat.id === previousParentId);
          const nextParentId = parent?.parentId || null;
          if (parent) {
            insertAmongSiblings(nextParentId, parent.id, true);
            normalizeSiblings(previousParentId);
          } else {
            target.parentId = null;
            normalizeSiblings(previousParentId);
            const rootSiblings = draft.categories.filter((cat) => !cat.parentId);
            target.sortOrder = (rootSiblings.length + 1) * 1000;
          }
          return;
        }
        if (placement === 'before' || placement === 'after') {
          const parentId = reference?.parentId || null;
          if (!insertAmongSiblings(parentId, reference.id, placement === 'after')) return;
          if (previousParentId !== parentId) normalizeSiblings(previousParentId);
          return;
        }

        const nextParentId = placement === 'root' ? null : reference?.id || null;
        if (nextParentId && isDescendant(nextParentId, target.id)) return;
        target.parentId = nextParentId;
        normalizeSiblings(previousParentId);
        const siblings = draft.categories.filter((cat) => (cat.parentId || null) === (nextParentId || null));
        target.sortOrder = (siblings.length + 1) * 1000;
      });
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
        const updates = await Promise.all(favorites.map((login) => {
          const previousLive = getLiveDataEntry(this.liveData, login);
          return fetchStreamerLiveData(login, {
            ...this.state.favorites[login],
            ...(previousLive || {})
          });
        }));
        const nextLive = {};
        const favoriteUpdates = {};
        updates.forEach((entry, index) => {
          const requestedLogin = favorites[index];
          const pageLive = inferCurrentPageLiveData(requestedLogin, {
            ...this.state.favorites[requestedLogin],
            ...(this.liveData[requestedLogin] || {}),
            ...(entry || {})
          });
          if (pageLive && (!entry?.isLive || entry.fetchFailed || !entry.game)) {
            entry = {
              ...pageLive,
              ...(entry || {}),
              viewers: Number(entry?.viewers) || pageLive.viewers,
              title: entry?.title || pageLive.title,
              game: entry?.game || pageLive.game,
              inferredFromPage: true
            };
          }
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


    return FavoritesStore;
  };

  window.TFRFavoritesStore = {
    create: createFavoritesStore
  };
})();
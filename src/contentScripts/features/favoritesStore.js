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

  const LEGACY_CATEGORY_COLORS = {
    purple: '#9147ff',
    blue: '#4a80ff',
    cyan: '#23bed2',
    green: '#3eb973',
    yellow: '#d8b56d',
    orange: '#ff8f4e',
    red: '#ff4f69',
    pink: '#ec60be'
  };

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
          sortOrder: Date.now(),
          color: ''
        };
        this.state.categories = [initialCategory];
        await this.persistState();
      }
      this.ensureStateIntegrity();
      this.emitter.emit({ kind: CHANGE_KIND.STATE, state: this.getSnapshot() });
      await this.refreshLiveData();
      this.startPolling();
    }

    createProfileSnapshot(profile = {}) {
      const now = Date.now();
      return {
        id: typeof profile.id === 'string' && profile.id.trim() ? profile.id.trim() : 'default',
        name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : t('profiles.defaultName'),
        favorites: deepCopy(profile.favorites && typeof profile.favorites === 'object' ? profile.favorites : {}),
        categories: deepCopy(Array.isArray(profile.categories) ? profile.categories : []),
        preferences: deepCopy(profile.preferences && typeof profile.preferences === 'object' ? profile.preferences : this.state.preferences || DEFAULT_STATE.preferences),
        createdAt: Number.isFinite(profile.createdAt) ? profile.createdAt : now,
        updatedAt: Number.isFinite(profile.updatedAt) ? profile.updatedAt : now
      };
    }

    syncActiveProfile(target = this.state) {
      const activeId = typeof target.activeProfileId === 'string' && target.activeProfileId.trim()
        ? target.activeProfileId
        : 'default';
      const profiles = target.profiles && typeof target.profiles === 'object' ? target.profiles : {};
      const current = profiles[activeId] || {};
      profiles[activeId] = this.createProfileSnapshot({
        ...current,
        id: activeId,
        favorites: target.favorites || {},
        categories: target.categories || [],
        preferences: target.preferences || {},
        updatedAt: Date.now()
      });
      target.profiles = profiles;
      target.activeProfileId = activeId;
    }

    applyProfileToRoot(target, profileId) {
      const profile = target.profiles?.[profileId];
      if (!profile) {
        return false;
      }
      target.activeProfileId = profileId;
      target.favorites = deepCopy(profile.favorites || {});
      target.categories = deepCopy(Array.isArray(profile.categories) ? profile.categories : []);
      target.preferences = {
        ...deepCopy(DEFAULT_STATE.preferences),
        ...deepCopy(profile.preferences || {})
      };
      return true;
    }

    ensureStateIntegrity() {
      if (!this.state.profiles || typeof this.state.profiles !== 'object') {
        this.state.profiles = {};
      }
      if (typeof this.state.activeProfileId !== 'string' || !this.state.activeProfileId.trim()) {
        this.state.activeProfileId = 'default';
      }
      if (!Array.isArray(this.state.categories)) {
        this.state.categories = [];
      }
      if (!this.state.preferences) {
        this.state.preferences = {
          sortMode: 'viewersDesc',
          uncategorizedCollapsed: false,
          liveFavoritesEnabled: true,
          liveFavoritesCollapsed: false,
          recentLiveEnabled: false,
          recentLiveThresholdMinutes: 10,
          recentLiveCollapsed: false,
          hideCollapsedGroupsUntilHover: false,
          categoryColorOpacity: 7,
          categoryColorGradient: 62,
          categoryColorStyle: 'gradient',
          streamerItemStyle: 'default',
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
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'liveFavoritesEnabled')) {
        this.state.preferences.liveFavoritesEnabled = !Boolean(this.state.preferences.liveFavoritesCollapsed);
      } else {
        this.state.preferences.liveFavoritesEnabled = Boolean(this.state.preferences.liveFavoritesEnabled);
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
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'hideCollapsedGroupsUntilHover')) {
        this.state.preferences.hideCollapsedGroupsUntilHover = false;
      } else {
        this.state.preferences.hideCollapsedGroupsUntilHover = Boolean(this.state.preferences.hideCollapsedGroupsUntilHover);
      }
      this.state.preferences.categoryColorOpacity = this.sanitizeCategoryColorOpacity(
        this.state.preferences.categoryColorOpacity
      );
      this.state.preferences.categoryColorGradient = this.sanitizeCategoryColorGradient(
        this.state.preferences.categoryColorGradient
      );
      this.state.preferences.categoryColorStyle = this.sanitizeCategoryColorStyle(
        this.state.preferences.categoryColorStyle
      );
      this.state.preferences.streamerItemStyle = this.sanitizeStreamerItemStyle(
        this.state.preferences.streamerItemStyle
      );
      this.state.preferences.sidebarSurfaceStyle = this.sanitizeSidebarSurfaceStyle(
        this.state.preferences.sidebarSurfaceStyle
      );
      this.state.preferences.sidebarSurfaceColor = this.sanitizeCategoryColor(
        this.state.preferences.sidebarSurfaceColor
      );
      this.state.preferences.specialCategoryColors = this.sanitizeSpecialCategoryColors(
        this.state.preferences.specialCategoryColors
      );
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'toastDurationSeconds')) {
        this.state.preferences.toastDurationSeconds = 6;
      } else {
        const parsed = Number(this.state.preferences.toastDurationSeconds);
        const sanitized = Number.isFinite(parsed) ? Math.max(2, Math.min(60, Math.round(parsed))) : 6;
        this.state.preferences.toastDurationSeconds = sanitized;
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'toastEnabled')) {
        this.state.preferences.toastEnabled = true;
      } else {
        this.state.preferences.toastEnabled = Boolean(this.state.preferences.toastEnabled);
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'toastPosition')) {
        this.state.preferences.toastPosition = 'top-right';
      } else {
        this.state.preferences.toastPosition = this.sanitizeToastPosition(this.state.preferences.toastPosition);
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'toastSoundEnabled')) {
        this.state.preferences.toastSoundEnabled = false;
      } else {
        this.state.preferences.toastSoundEnabled = Boolean(this.state.preferences.toastSoundEnabled);
      }
      this.state.preferences.toastSoundVolume = this.sanitizeToastSoundVolume(
        this.state.preferences.toastSoundVolume
      );
      this.state.preferences.toastSoundId = this.sanitizeToastSoundId(
        this.state.preferences.toastSoundId
      );
      this.state.preferences.toastCustomSoundName = this.sanitizeToastCustomSoundName(
        this.state.preferences.toastCustomSoundName
      );
      this.state.preferences.toastCustomSoundDataUrl = this.sanitizeToastCustomSoundDataUrl(
        this.state.preferences.toastCustomSoundDataUrl
      );
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
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'toastEnabled')) {
        this.state.preferences.toastEnabled = true;
      } else {
        this.state.preferences.toastEnabled = Boolean(this.state.preferences.toastEnabled);
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'toastPosition')) {
        this.state.preferences.toastPosition = 'top-right';
      } else {
        this.state.preferences.toastPosition = this.sanitizeToastPosition(this.state.preferences.toastPosition);
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'toastSoundEnabled')) {
        this.state.preferences.toastSoundEnabled = false;
      } else {
        this.state.preferences.toastSoundEnabled = Boolean(this.state.preferences.toastSoundEnabled);
      }
      this.state.preferences.toastSoundVolume = this.sanitizeToastSoundVolume(
        this.state.preferences.toastSoundVolume
      );
      this.state.preferences.toastSoundId = this.sanitizeToastSoundId(
        this.state.preferences.toastSoundId
      );
      this.state.preferences.toastCustomSoundName = this.sanitizeToastCustomSoundName(
        this.state.preferences.toastCustomSoundName
      );
      this.state.preferences.toastCustomSoundDataUrl = this.sanitizeToastCustomSoundDataUrl(
        this.state.preferences.toastCustomSoundDataUrl
      );
      const categoryIdMap = new Map();
      this.state.categories.forEach((category, index) => {
        if (!category || typeof category !== 'object') {
          this.state.categories[index] = {
            id: `cat_${Date.now()}_${index}`,
            name: t('categories.defaultName'),
            collapsed: false,
            sortOrder: Date.now() + index,
            parentId: null,
            color: ''
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
        category.color = this.sanitizeCategoryColor(category.color);
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
          parentId: null,
          color: ''
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
      this.syncActiveProfile(this.state);
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
        this.syncActiveProfile(this.state);
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
    this.syncActiveProfile(this.state);
    return {
      version: 2,
      generatedAt: new Date().toISOString(),
      activeProfileId: this.state.activeProfileId,
      profiles: deepCopy(this.state.profiles),
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
      const color = this.sanitizeCategoryColor(raw.color);
      safeCategories.push({ id, name, sortOrder, collapsed, parentId, color });
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
      if (typeof payload.preferences.liveFavoritesEnabled === 'boolean') {
        safePreferences.liveFavoritesEnabled = payload.preferences.liveFavoritesEnabled;
      }
      if (typeof payload.preferences.recentLiveEnabled === 'boolean') {
        safePreferences.recentLiveEnabled = payload.preferences.recentLiveEnabled;
      }
      if (typeof payload.preferences.recentLiveCollapsed === 'boolean') {
        safePreferences.recentLiveCollapsed = payload.preferences.recentLiveCollapsed;
      }
      if (typeof payload.preferences.hideCollapsedGroupsUntilHover === 'boolean') {
        safePreferences.hideCollapsedGroupsUntilHover = payload.preferences.hideCollapsedGroupsUntilHover;
      }
      if (payload.preferences.categoryColorOpacity != null) {
        safePreferences.categoryColorOpacity = this.sanitizeCategoryColorOpacity(payload.preferences.categoryColorOpacity);
      }
      if (payload.preferences.categoryColorGradient != null) {
        safePreferences.categoryColorGradient = this.sanitizeCategoryColorGradient(payload.preferences.categoryColorGradient);
      }
      if (typeof payload.preferences.categoryColorStyle === 'string') {
        safePreferences.categoryColorStyle = this.sanitizeCategoryColorStyle(payload.preferences.categoryColorStyle);
      }
      if (typeof payload.preferences.streamerItemStyle === 'string') {
        safePreferences.streamerItemStyle = this.sanitizeStreamerItemStyle(payload.preferences.streamerItemStyle);
      }
      if (typeof payload.preferences.sidebarSurfaceStyle === 'string') {
        safePreferences.sidebarSurfaceStyle = this.sanitizeSidebarSurfaceStyle(payload.preferences.sidebarSurfaceStyle);
      }
      if (typeof payload.preferences.sidebarSurfaceColor === 'string') {
        safePreferences.sidebarSurfaceColor = this.sanitizeCategoryColor(payload.preferences.sidebarSurfaceColor);
      }
      if (payload.preferences.specialCategoryColors && typeof payload.preferences.specialCategoryColors === 'object') {
        safePreferences.specialCategoryColors = this.sanitizeSpecialCategoryColors(payload.preferences.specialCategoryColors);
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
      if (typeof payload.preferences.toastEnabled === 'boolean') {
        safePreferences.toastEnabled = payload.preferences.toastEnabled;
      }
      if (typeof payload.preferences.toastPosition === 'string') {
        safePreferences.toastPosition = this.sanitizeToastPosition(payload.preferences.toastPosition);
      }
      if (typeof payload.preferences.toastSoundEnabled === 'boolean') {
        safePreferences.toastSoundEnabled = payload.preferences.toastSoundEnabled;
      }
      if (payload.preferences.toastSoundVolume != null) {
        safePreferences.toastSoundVolume = this.sanitizeToastSoundVolume(payload.preferences.toastSoundVolume);
      }
      if (typeof payload.preferences.toastSoundId === 'string') {
        safePreferences.toastSoundId = this.sanitizeToastSoundId(payload.preferences.toastSoundId);
      }
      if (typeof payload.preferences.toastCustomSoundName === 'string') {
        safePreferences.toastCustomSoundName = this.sanitizeToastCustomSoundName(payload.preferences.toastCustomSoundName);
      }
      if (typeof payload.preferences.toastCustomSoundDataUrl === 'string') {
        safePreferences.toastCustomSoundDataUrl = this.sanitizeToastCustomSoundDataUrl(payload.preferences.toastCustomSoundDataUrl);
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
      if (typeof payload.preferences.toastEnabled === 'boolean') {
        safePreferences.toastEnabled = payload.preferences.toastEnabled;
      }
      if (typeof payload.preferences.toastPosition === 'string') {
        safePreferences.toastPosition = this.sanitizeToastPosition(payload.preferences.toastPosition);
      }
      if (typeof payload.preferences.toastSoundEnabled === 'boolean') {
        safePreferences.toastSoundEnabled = payload.preferences.toastSoundEnabled;
      }
      if (payload.preferences.toastSoundVolume != null) {
        safePreferences.toastSoundVolume = this.sanitizeToastSoundVolume(payload.preferences.toastSoundVolume);
      }
      if (typeof payload.preferences.toastSoundId === 'string') {
        safePreferences.toastSoundId = this.sanitizeToastSoundId(payload.preferences.toastSoundId);
      }
      if (typeof payload.preferences.toastCustomSoundName === 'string') {
        safePreferences.toastCustomSoundName = this.sanitizeToastCustomSoundName(payload.preferences.toastCustomSoundName);
      }
      if (typeof payload.preferences.toastCustomSoundDataUrl === 'string') {
        safePreferences.toastCustomSoundDataUrl = this.sanitizeToastCustomSoundDataUrl(payload.preferences.toastCustomSoundDataUrl);
      }
    }

    await this.updateState((draft) => {
      draft.favorites = safeFavorites;
      draft.categories = safeCategories;
      draft.preferences = { ...draft.preferences, ...safePreferences };
      if (payload.profiles && typeof payload.profiles === 'object') {
        draft.profiles = {};
        Object.entries(payload.profiles).forEach(([id, profile]) => {
          if (!id || !profile || typeof profile !== 'object') return;
          draft.profiles[id] = this.createProfileSnapshot({ ...profile, id });
        });
      }
      draft.activeProfileId = typeof payload.activeProfileId === 'string' && payload.activeProfileId
        ? payload.activeProfileId
        : draft.activeProfileId;
      if (draft.profiles?.[draft.activeProfileId]) {
        this.applyProfileToRoot(draft, draft.activeProfileId);
      }
    });
    this.liveData = {};
    await this.refreshLiveData();
  }

    getProfiles() {
      this.syncActiveProfile(this.state);
      return Object.values(this.state.profiles || {})
        .map((profile) => ({
          id: profile.id,
          name: profile.name,
          count: Object.keys(profile.favorites || {}).length
        }))
        .sort((a, b) => {
          if (a.id === this.state.activeProfileId) return -1;
          if (b.id === this.state.activeProfileId) return 1;
          return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
        });
    }

    async createProfile(name) {
      const label = String(name || '').trim();
      if (!label) return;
      const id = `profile_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      await this.updateState((draft) => {
        this.syncActiveProfile(draft);
        draft.profiles[id] = this.createProfileSnapshot({
          id,
          name: label,
          favorites: {},
          categories: [],
          preferences: draft.preferences
        });
        this.applyProfileToRoot(draft, id);
      });
      this.liveData = {};
      await this.refreshLiveData();
    }

    async switchProfile(profileId) {
      const id = String(profileId || '').trim();
      if (!id || id === this.state.activeProfileId || !this.state.profiles?.[id]) return;
      await this.updateState((draft) => {
        this.syncActiveProfile(draft);
        this.applyProfileToRoot(draft, id);
      });
      this.liveData = {};
      await this.refreshLiveData();
    }

    async renameProfile(profileId, name) {
      const id = String(profileId || '').trim();
      const label = String(name || '').trim();
      if (!id || !label || !this.state.profiles?.[id]) return;
      await this.updateState((draft) => {
        this.syncActiveProfile(draft);
        draft.profiles[id].name = label;
        draft.profiles[id].updatedAt = Date.now();
      });
    }

    async deleteProfile(profileId) {
      const id = String(profileId || '').trim();
      const profiles = this.state.profiles || {};
      if (!id || !profiles[id] || Object.keys(profiles).length <= 1) return;
      const nextId = Object.keys(profiles).find((candidate) => candidate !== id);
      await this.updateState((draft) => {
        this.syncActiveProfile(draft);
        delete draft.profiles[id];
        if (draft.activeProfileId === id && nextId) {
          this.applyProfileToRoot(draft, nextId);
        }
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
        color: this.sanitizeCategoryColor(category.color),
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
      const live = await fetchStreamerLiveData(normalized, this.state.favorites[normalized] || {});
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
          parentId: parent,
          color: ''
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

    sanitizeCategoryColor(color) {
      const normalized = typeof color === 'string' ? color.trim().toLowerCase() : '';
      if (!normalized) {
        return '';
      }
      if (LEGACY_CATEGORY_COLORS[normalized]) {
        return LEGACY_CATEGORY_COLORS[normalized];
      }
      const shortHex = normalized.match(/^#([0-9a-f]{3})$/i);
      if (shortHex) {
        return `#${shortHex[1].split('').map((part) => part + part).join('')}`.toLowerCase();
      }
      return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : '';
    }

    async setCategoryColor(categoryId, color) {
      const sanitized = this.sanitizeCategoryColor(color);
      await this.updateState((draft) => {
        const category = draft.categories.find((cat) => cat.id === categoryId);
        if (category) {
          category.color = sanitized;
        }
      });
    }

    hslToHex(hue, saturation, lightness) {
      const s = Math.max(0, Math.min(1, saturation));
      const l = Math.max(0, Math.min(1, lightness));
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
      const m = l - c / 2;
      let r = 0;
      let g = 0;
      let b = 0;
      if (hue < 60) {
        r = c;
        g = x;
      } else if (hue < 120) {
        r = x;
        g = c;
      } else if (hue < 180) {
        g = c;
        b = x;
      } else if (hue < 240) {
        g = x;
        b = c;
      } else if (hue < 300) {
        r = x;
        b = c;
      } else {
        r = c;
        b = x;
      }
      return `#${[r, g, b]
        .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0'))
        .join('')}`;
    }

    async randomizeCategoryColors() {
      const offset = Math.floor(Math.random() * 360);
      await this.updateState((draft) => {
        draft.categories.forEach((category, index) => {
          const hue = (offset + index * 137.508) % 360;
          category.color = this.hslToHex(hue, 0.72, 0.58);
        });
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

    async setLiveFavoritesEnabled(enabled) {
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.liveFavoritesEnabled = Boolean(enabled);
        prefs.liveFavoritesCollapsed = !Boolean(enabled);
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

    async setHideCollapsedGroupsUntilHover(enabled) {
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.hideCollapsedGroupsUntilHover = Boolean(enabled);
      });
    }

    sanitizeCategoryColorOpacity(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, Math.min(30, Math.round(parsed))) : 7;
    }

    sanitizeCategoryColorGradient(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 62;
    }

    sanitizeCategoryColorStyle(value) {
      const allowed = new Set([
        'gradient',
        'solid',
        'stripe',
        'glow',
        'glass',
        'outline',
        'minimal',
        'dot',
        'rail',
        'double',
        'soft-card',
        'soft-neon',
        'ribbon',
        'count-badge',
        'ink',
        'compact',
        'parent-accent'
      ]);
      return allowed.has(value) ? value : 'gradient';
    }

    sanitizeStreamerItemStyle(value) {
      const allowed = new Set([
        'default',
        'compact',
        'card',
        'soft-card',
        'outline',
        'left-line',
        'avatar-ring',
        'avatar-square',
        'neon',
        'viewer-badge',
        'game-focus',
        'title-focus',
        'glass',
        'minimal'
      ]);
      return allowed.has(value) ? value : 'default';
    }

    sanitizeSidebarSurfaceStyle(value) {
      const allowed = new Set([
        'default',
        'full',
        'panel',
        'glow',
        'rail',
        'connected',
        'layers',
        'canvas',
        'edge',
        'spectrum',
        'pulse',
        'poster',
        'arcade'
      ]);
      return allowed.has(value) ? value : 'default';
    }

    sanitizeSpecialCategoryColors(colors = {}) {
      const source = colors && typeof colors === 'object' ? colors : {};
      return {
        recentLive: this.sanitizeCategoryColor(source.recentLive),
        uncategorized: this.sanitizeCategoryColor(source.uncategorized)
      };
    }

    async setCategoryColorOpacity(value) {
      const sanitized = this.sanitizeCategoryColorOpacity(value);
      if (this.sanitizeCategoryColorOpacity(this.state.preferences?.categoryColorOpacity) === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.categoryColorOpacity = sanitized;
      });
    }

    async setCategoryColorGradient(value) {
      const sanitized = this.sanitizeCategoryColorGradient(value);
      if (this.sanitizeCategoryColorGradient(this.state.preferences?.categoryColorGradient) === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.categoryColorGradient = sanitized;
      });
    }

    async setCategoryColorStyle(value) {
      const sanitized = this.sanitizeCategoryColorStyle(value);
      if (this.sanitizeCategoryColorStyle(this.state.preferences?.categoryColorStyle) === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.categoryColorStyle = sanitized;
      });
    }

    async setStreamerItemStyle(value) {
      const sanitized = this.sanitizeStreamerItemStyle(value);
      if (this.sanitizeStreamerItemStyle(this.state.preferences?.streamerItemStyle) === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.streamerItemStyle = sanitized;
      });
    }

    async setSidebarSurfaceStyle(value) {
      const sanitized = this.sanitizeSidebarSurfaceStyle(value);
      if (this.sanitizeSidebarSurfaceStyle(this.state.preferences?.sidebarSurfaceStyle) === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.sidebarSurfaceStyle = sanitized;
      });
    }

    async setSidebarSurfaceColor(color) {
      const sanitized = this.sanitizeCategoryColor(color);
      if (this.sanitizeCategoryColor(this.state.preferences?.sidebarSurfaceColor) === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.sidebarSurfaceColor = sanitized;
      });
    }

    async setSpecialCategoryColor(key, color) {
      if (!['recentLive', 'uncategorized'].includes(key)) {
        return;
      }
      const sanitized = this.sanitizeCategoryColor(color);
      const current = this.sanitizeSpecialCategoryColors(this.state.preferences?.specialCategoryColors)[key];
      if (current === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        const specialColors = this.sanitizeSpecialCategoryColors(prefs.specialCategoryColors);
        specialColors[key] = sanitized;
        prefs.specialCategoryColors = specialColors;
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

    sanitizeToastPosition(position) {
      const allowed = new Set([
        'top-left',
        'top-center',
        'top-right',
        'bottom-left',
        'bottom-center',
        'bottom-right'
      ]);
      return allowed.has(position) ? position : 'top-right';
    }

    sanitizeToastSoundId(soundId) {
      const allowed = new Set(['soft', 'chime', 'arcade', 'pulse', 'alert', 'custom']);
      return allowed.has(soundId) ? soundId : 'soft';
    }

    sanitizeToastSoundVolume(volume) {
      const numeric = Number(volume);
      return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 35;
    }

    sanitizeToastCustomSoundName(name) {
      return typeof name === 'string' ? name.trim().slice(0, 120) : '';
    }

    sanitizeToastCustomSoundDataUrl(dataUrl) {
      if (typeof dataUrl !== 'string') {
        return '';
      }
      const trimmed = dataUrl.trim();
      if (!/^data:audio\/(?:mpeg|mp3|wav|x-wav|wave|ogg|webm);base64,/i.test(trimmed)) {
        return '';
      }
      return trimmed.length <= 1_500_000 ? trimmed : '';
    }

    async setToastEnabled(enabled) {
      const next = Boolean(enabled);
      if (Boolean(this.state.preferences?.toastEnabled) === next) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.toastEnabled = next;
      });
    }

    async setToastPosition(position) {
      const sanitized = this.sanitizeToastPosition(position);
      if ((this.state.preferences?.toastPosition || 'top-right') === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.toastPosition = sanitized;
      });
    }

    async setToastSoundEnabled(enabled) {
      const next = Boolean(enabled);
      if (Boolean(this.state.preferences?.toastSoundEnabled) === next) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.toastSoundEnabled = next;
      });
    }

    async setToastSound(soundId) {
      const sanitized = this.sanitizeToastSoundId(soundId);
      if ((this.state.preferences?.toastSoundId || 'soft') === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.toastSoundId = sanitized;
      });
    }

    async setToastSoundVolume(volume) {
      const sanitized = this.sanitizeToastSoundVolume(volume);
      if (this.sanitizeToastSoundVolume(this.state.preferences?.toastSoundVolume) === sanitized) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.toastSoundVolume = sanitized;
      });
    }

    async setToastCustomSound({ name = '', dataUrl = '' } = {}) {
      const safeName = this.sanitizeToastCustomSoundName(name);
      const safeDataUrl = this.sanitizeToastCustomSoundDataUrl(dataUrl);
      if (!safeDataUrl) {
        return;
      }
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.toastCustomSoundName = safeName || 'Son personnalise';
        prefs.toastCustomSoundDataUrl = safeDataUrl;
        prefs.toastSoundId = 'custom';
      });
    }

    async clearToastCustomSound() {
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.toastCustomSoundName = '';
        prefs.toastCustomSoundDataUrl = '';
        if (prefs.toastSoundId === 'custom') {
          prefs.toastSoundId = 'soft';
        }
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

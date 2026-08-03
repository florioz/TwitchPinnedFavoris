(() => {
  const createFavoritesStore = ({
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
  }) => {
  const CHAT_MENTION_SOUND_IDS = new Set(['soft', 'chime', 'arcade', 'pulse', 'alert']);
  const CHAT_FONT_FAMILIES = new Set(['system', 'arial', 'verdana', 'georgia', 'monospace', 'custom']);
  const CATEGORY_COLOR_STYLES = new Set([
    'gradient', 'solid', 'stripe', 'glow', 'glass', 'outline', 'minimal', 'dot', 'rail',
    'double', 'soft-card', 'soft-neon', 'ribbon', 'count-badge', 'ink', 'compact', 'parent-accent'
  ]);
  const TOAST_POSITIONS = new Set([
    'top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'
  ]);
  const TOAST_SOUND_IDS = new Set([...CHAT_MENTION_SOUND_IDS, 'custom']);

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
      this.profileTools = window.TFRProfileStateTools.create({
        deepCopy,
        defaultPreferences: DEFAULT_STATE.preferences,
        getDefaultName: () => t('profiles.defaultName')
      });
      this.backupNormalizer = window.TFRBackupNormalizer.create({
        defaultAvatar: DEFAULT_AVATAR,
        sanitizeCategoryList,
        sanitizeColor: (color) => this.sanitizeCategoryColor(color)
      });
      this.normalizeBackupPreferences = window.TFRBackupPreferenceNormalizer.create({
        categoryColorOpacity: (value) => this.sanitizeCategoryColorOpacity(value),
        categoryColorGradient: (value) => this.sanitizeCategoryColorGradient(value),
        categoryColorStyle: (value) => this.sanitizeCategoryColorStyle(value),
        streamerItemStyle: (value) => this.sanitizeStreamerItemStyle(value),
        autoCompactGroupStyle: (value) => this.sanitizeAutoCompactGroupStyle(value),
        sidebarAnimationStyle: (value) => this.sanitizeSidebarAnimationStyle(value),
        sidebarSurfaceStyle: (value) => this.sanitizeSidebarSurfaceStyle(value),
        categoryColor: (value) => this.sanitizeCategoryColor(value),
        specialCategoryColors: (value) => this.sanitizeSpecialCategoryColors(value),
        toastPosition: (value) => this.sanitizeToastPosition(value),
        toastSoundVolume: (value) => this.sanitizeToastSoundVolume(value),
        toastSoundId: (value) => this.sanitizeToastSoundId(value),
        toastCustomSoundName: (value) => this.sanitizeToastCustomSoundName(value),
        toastCustomSoundDataUrl: (value) => this.sanitizeToastCustomSoundDataUrl(value),
        chatFontFamily: (value) => this.sanitizeChatFontFamily(value),
        chatCustomFontDataUrl: (value) => this.sanitizeChatCustomFontDataUrl(value),
        chatMentionHighlightColor: (value) => this.sanitizeChatMentionColor(value),
        chatMentionSoundId: (value) => this.sanitizeChatMentionSoundId(value),
        liveHoverPreviewMode: (value) => this.sanitizeLiveHoverPreviewMode(value)
      });
      this.liveData = {};
      this.emitter = new EventEmitter();
      this.pollTimer = null;
      this.isRefreshing = false;
      this.lastLiveRefreshAt = 0;
      this.lastLiveStorageAt = 0;
      this.stateMutationQueue = Promise.resolve();
      this.liveRefreshCooldownMs = Math.max(15_000, Math.min(60_000, Math.floor(POLL_INTERVAL_MS / 2)));

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
          const nextValue = changes[STORAGE_KEY]?.newValue;
          if (nextValue) {
            const incomingRevision = Number(nextValue.revision || 0);
            const currentRevision = Number(this.state.revision || 0);
            if (incomingRevision < currentRevision) return;
            this.state = deepCopy({ ...DEFAULT_STATE, ...nextValue });
            this.ensureStateIntegrity();
            this.emitter.emit({ kind: CHANGE_KIND.STATE, state: this.getSnapshot() });
          }
        }
        if (LIVE_CACHE_KEY && Object.prototype.hasOwnProperty.call(changes, LIVE_CACHE_KEY)) {
          const nextLive = changes[LIVE_CACHE_KEY]?.newValue;
          if (nextLive && typeof nextLive === 'object') {
            this.liveData = { ...nextLive };
            this.lastLiveStorageAt = Date.now();
            this.emitter.emit({ kind: CHANGE_KIND.LIVE, liveData: this.getLiveData() });
          }
        }
      });
    }

    async init() {
      const stored = await chrome.storage.local.get(LIVE_CACHE_KEY ? [STORAGE_KEY, LIVE_CACHE_KEY] : STORAGE_KEY);
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
      if (LIVE_CACHE_KEY && stored?.[LIVE_CACHE_KEY] && typeof stored[LIVE_CACHE_KEY] === 'object') {
        this.liveData = { ...stored[LIVE_CACHE_KEY] };
        this.lastLiveStorageAt = Date.now();
      }
      this.ensureStateIntegrity();
      this.emitter.emit({ kind: CHANGE_KIND.STATE, state: this.getSnapshot() });
      if (Object.keys(this.liveData).length) {
        this.emitter.emit({ kind: CHANGE_KIND.LIVE, liveData: this.getLiveData() });
      } else {
        await this.refreshLiveData();
      }
      this.startPolling();
    }

    createProfileSnapshot(profile = {}) {
      return this.profileTools.createSnapshot(profile, this.state.preferences);
    }

    syncActiveProfile(target = this.state) {
      this.profileTools.syncActive(target);
    }

    applyProfileToRoot(target, profileId) {
      return this.profileTools.applyToRoot(target, profileId);
    }

    normalizeBooleanPreference(key, fallback = false, strict = false) {
      const preferences = this.state.preferences;
      const hasValue = Object.prototype.hasOwnProperty.call(preferences, key);
      preferences[key] = hasValue
        ? (strict ? preferences[key] === true : Boolean(preferences[key]))
        : Boolean(fallback);
    }

    normalizeBooleanPreferences(definitions, strict = false) {
      Object.entries(definitions).forEach(([key, fallback]) => {
        this.normalizeBooleanPreference(key, fallback, strict);
      });
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
        this.state.preferences = deepCopy(DEFAULT_STATE.preferences || {});
      }
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'sortMode')) {
        this.state.preferences.sortMode = 'viewersDesc';
      }
      this.normalizeBooleanPreferences({
        uncategorizedCollapsed: false,
        liveFavoritesCollapsed: false
      });
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'liveFavoritesEnabled')) {
        this.state.preferences.liveFavoritesEnabled = !Boolean(this.state.preferences.liveFavoritesCollapsed);
      } else {
        this.state.preferences.liveFavoritesEnabled = Boolean(this.state.preferences.liveFavoritesEnabled);
      }
      this.normalizeBooleanPreference('recentLiveEnabled', false);
      this.state.preferences.recentLiveThresholdMinutes = this.sanitizeRecentLiveThreshold(
        this.state.preferences.recentLiveThresholdMinutes
      );
      this.normalizeBooleanPreferences({
        recentLiveCollapsed: false,
        hideCollapsedGroupsUntilHover: false,
        autoCompactSidebarEnabled: false
      });
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
      this.state.preferences.autoCompactStreamerStyle = this.sanitizeStreamerItemStyle(
        this.state.preferences.autoCompactStreamerStyle || 'compact'
      );
      this.state.preferences.autoCompactGroupStyle = this.sanitizeAutoCompactGroupStyle(
        this.state.preferences.autoCompactGroupStyle
      );
      this.state.preferences.sidebarAnimationStyle = this.sanitizeSidebarAnimationStyle(
        this.state.preferences.sidebarAnimationStyle
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
      this.state.preferences.toastDurationSeconds = this.sanitizeToastDuration(
        this.state.preferences.toastDurationSeconds
      );
      this.normalizeBooleanPreference('toastEnabled', true);
      if (!Object.prototype.hasOwnProperty.call(this.state.preferences, 'toastPosition')) {
        this.state.preferences.toastPosition = 'top-right';
      } else {
        this.state.preferences.toastPosition = this.sanitizeToastPosition(this.state.preferences.toastPosition);
      }
      this.normalizeBooleanPreference('toastSoundEnabled', false);
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
      this.normalizeBooleanPreferences({ chatHistoryEnabled: true, moderationHistoryEnabled: true });
      this.normalizeBooleanPreferences({
        sevenTvEmotesEnabled: false,
        betterTtvEmotesEnabled: false,
        playerLatencyEnabled: false,
        chatFontEnabled: false,
        chatNoPaddingEnabled: false,
        chatMentionHighlightEnabled: false,
        chatMentionSoundEnabled: false,
        showDeletedMessagesEnabled: false,
        showFullRepliesEnabled: false,
        liveHoverPreviewEnabled: false
      }, true);
      this.state.preferences.chatPaddingPx = this.sanitizeChatPaddingPx(
        this.state.preferences.chatPaddingPx
      );
      this.state.preferences.chatFontFamily = this.sanitizeChatFontFamily(this.state.preferences.chatFontFamily);
      this.state.preferences.chatCustomFontName = String(this.state.preferences.chatCustomFontName || '').slice(0, 160);
      this.state.preferences.chatCustomFontDataUrl = this.sanitizeChatCustomFontDataUrl(this.state.preferences.chatCustomFontDataUrl);
      this.state.preferences.chatMentionHighlightColor = this.sanitizeChatMentionColor(
        this.state.preferences.chatMentionHighlightColor
      );
      this.state.preferences.chatMentionSoundId = this.sanitizeChatMentionSoundId(
        this.state.preferences.chatMentionSoundId
      );
      this.state.preferences.liveHoverPreviewMode = this.sanitizeLiveHoverPreviewMode(
        this.state.preferences.liveHoverPreviewMode
      );
      Object.entries(DEFAULT_STATE.preferences || {}).forEach(([key, defaultValue]) => {
        if (!Object.prototype.hasOwnProperty.call(this.state.preferences, key)) {
          this.state.preferences[key] = deepCopy(defaultValue);
        }
      });
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
        fav.userId = String(fav.userId || fav.id || '');
        delete fav.id;
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
        const staleAfterMs = Math.max(POLL_INTERVAL_MS * 2, 120_000);
        if (!this.lastLiveStorageAt || Date.now() - this.lastLiveStorageAt > staleAfterMs) {
          this.refreshLiveData();
        }
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
      const operation = this.stateMutationQueue.then(async () => {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        const persisted = stored?.[STORAGE_KEY];
        if (persisted) {
          this.state = deepCopy({ ...DEFAULT_STATE, ...persisted });
          this.ensureStateIntegrity();
        }
        const draft = deepCopy(this.state);
        mutator(draft);
        draft.revision = Math.max(Number(this.state.revision || 0), Number(draft.revision || 0)) + 1;
        this.state = draft;
        this.ensureStateIntegrity();
        await this.persistState();
        if (emit) this.emitter.emit({ kind: CHANGE_KIND.STATE, state: this.getSnapshot() });
      });
      this.stateMutationQueue = operation.catch(() => {});
      return operation;
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

  getActiveProfileExportData() {
    this.syncActiveProfile(this.state);
    const activeId = this.state.activeProfileId;
    const profile = this.state.profiles?.[activeId];
    if (!profile) {
      throw new Error('Profil introuvable');
    }
    return {
      type: 'tfr-profile',
      version: 1,
      generatedAt: new Date().toISOString(),
      profile: deepCopy(profile)
    };
  }

  async importProfile(payload = {}) {
    const source = payload?.type === 'tfr-profile' ? payload.profile : payload?.profile || payload;
    if (!source || typeof source !== 'object') {
      throw new Error('Profil invalide');
    }
    const label = typeof source.name === 'string' && source.name.trim()
      ? source.name.trim()
      : t('profiles.defaultName');
    const id = `profile_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    await this.updateState((draft) => {
      this.syncActiveProfile(draft);
      draft.profiles[id] = this.createProfileSnapshot({
        ...source,
        id,
        name: label,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      this.applyProfileToRoot(draft, id);
    });
    this.liveData = {};
    await this.refreshLiveData();
    return id;
  }

  async restoreFromBackup(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Backup invalide');
    }
    const safeFavorites = this.backupNormalizer.favorites(payload.favorites);
    const safeCategories = this.backupNormalizer.categories(payload.categories);

    const safePreferences = this.normalizeBackupPreferences(payload.preferences);

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
      return window.TFRCategoryTreeTools.build(
        this.state.categories,
        (color) => this.sanitizeCategoryColor(color)
      );
    }

    async addFavorite(login) {
      const normalized = login?.toLowerCase();
      if (!normalized || this.state.favorites[normalized]) return;
      const live = await fetchStreamerLiveData(normalized, this.state.favorites[normalized] || {});
    const favoriteEntry = {
      userId: String(live?.userId || ''),
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

    async migrateFavoriteLogin(previousLogin, requestedLogin) {
      const previous = String(previousLogin || '').trim().toLowerCase();
      const requested = String(requestedLogin || '').trim().replace(/^@/, '').toLowerCase();
      const favorite = this.state.favorites[previous];
      if (!favorite || !requested) return { ok: false, reason: 'invalid' };
      if (requested !== previous && this.state.favorites[requested]) return { ok: false, reason: 'duplicate' };

      const live = await fetchStreamerLiveData(requested, {});
      const resolved = String(live?.login || requested).toLowerCase();
      if (!live || live.fetchFailed || live.userNotFound || !live.userId) {
        return { ok: false, reason: live?.userNotFound ? 'notFound' : 'unavailable' };
      }
      if (resolved !== previous && this.state.favorites[resolved]) return { ok: false, reason: 'duplicate' };

      const migratedFavorite = {
        ...favorite,
        userId: String(live.userId),
        login: resolved,
        displayName: live.displayName || favorite.displayName || resolved,
        avatarUrl: live.avatarUrl || favorite.avatarUrl || DEFAULT_AVATAR,
        accountLookupFailures: 0,
        accountStatus: ''
      };
      await this.updateState((draft) => {
        delete draft.favorites[previous];
        draft.favorites[resolved] = migratedFavorite;
      });
      delete this.liveData[previous];
      this.liveData[resolved] = live;
      this.emitter.emit({ kind: CHANGE_KIND.LIVE, liveData: this.getLiveData() });
      return { ok: true, login: resolved };
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

    async setBooleanPreference(key, enabled) {
      const next = Boolean(enabled);
      const preferences = this.state.preferences || {};
      if (Object.prototype.hasOwnProperty.call(preferences, key) && Boolean(preferences[key]) === next) {
        return false;
      }
      await this.updateState((draft) => {
        (draft.preferences || (draft.preferences = {}))[key] = next;
      });
      return true;
    }

    async setSanitizedPreference(key, value, sanitizer = (candidate) => candidate, options = {}) {
      const next = sanitizer.call(this, value);
      const stored = this.state.preferences?.[key] ?? options.currentFallback;
      const current = options.normalizeCurrent ? sanitizer.call(this, stored) : stored;
      if (Object.is(current, next)) return next;
      await this.updateState((draft) => {
        (draft.preferences || (draft.preferences = {}))[key] = next;
      });
      return next;
    }

    async setRecentLiveEnabled(enabled) {
      await this.setBooleanPreference('recentLiveEnabled', enabled);
    }

    sanitizeBoundedInteger(value, minimum, maximum, fallback) {
      const parsed = Number(value);
      return Number.isFinite(parsed)
        ? Math.max(minimum, Math.min(maximum, Math.round(parsed)))
        : fallback;
    }

    sanitizeRecentLiveThreshold(value) {
      return this.sanitizeBoundedInteger(value, 1, 120, 10);
    }

    async setRecentLiveThreshold(minutes) {
      if (!Number.isFinite(Number(minutes))) return;
      return this.setSanitizedPreference(
        'recentLiveThresholdMinutes', minutes, this.sanitizeRecentLiveThreshold, { normalizeCurrent: true }
      );
    }

    async setChatHistoryEnabled(enabled) {
      await this.setBooleanPreference('chatHistoryEnabled', enabled);
    }

    async setModerationHistoryEnabled(enabled) {
      await this.setBooleanPreference('moderationHistoryEnabled', enabled);
    }

    async setSevenTvEmotesEnabled(enabled) {
      await this.setBooleanPreference('sevenTvEmotesEnabled', enabled);
    }

    async setBetterTtvEmotesEnabled(enabled) {
      await this.setBooleanPreference('betterTtvEmotesEnabled', enabled);
    }

    async setPlayerLatencyEnabled(enabled) {
      await this.setBooleanPreference('playerLatencyEnabled', enabled);
    }

    async setChatFontEnabled(enabled) {
      await this.setBooleanPreference('chatFontEnabled', enabled);
    }

    async setChatFontFamily(font) {
      return this.setSanitizedPreference('chatFontFamily', font, this.sanitizeChatFontFamily);
    }

    async setChatCustomFont({ name, dataUrl }) {
      const safeDataUrl = this.sanitizeChatCustomFontDataUrl(dataUrl);
      if (!safeDataUrl) return false;
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.chatCustomFontName = String(name || '').slice(0, 160);
        prefs.chatCustomFontDataUrl = safeDataUrl;
        prefs.chatFontFamily = 'custom';
        prefs.chatFontEnabled = true;
      });
      return true;
    }

    async clearChatCustomFont() {
      await this.updateState((draft) => {
        const prefs = draft.preferences || (draft.preferences = {});
        prefs.chatCustomFontName = '';
        prefs.chatCustomFontDataUrl = '';
        if (prefs.chatFontFamily === 'custom') prefs.chatFontFamily = 'system';
      });
    }

    async setShowDeletedMessagesEnabled(enabled) {
      await this.setBooleanPreference('showDeletedMessagesEnabled', enabled);
    }

    async setChatNoPaddingEnabled(enabled) {
      await this.setBooleanPreference('chatNoPaddingEnabled', enabled);
    }

    sanitizeChatPaddingPx(value) {
      return this.sanitizeBoundedInteger(value, 0, 20, 0);
    }

    async setChatPaddingPx(value) {
      return this.setSanitizedPreference('chatPaddingPx', value, this.sanitizeChatPaddingPx);
    }

    sanitizeChatMentionColor(color) {
      return this.sanitizeCategoryColor(color) || '#9147ff';
    }

    sanitizeChatMentionSoundId(soundId) {
      return CHAT_MENTION_SOUND_IDS.has(soundId) ? soundId : 'soft';
    }

    async setChatMentionHighlightEnabled(enabled) {
      await this.setBooleanPreference('chatMentionHighlightEnabled', enabled);
    }

    async setChatMentionHighlightColor(color) {
      return this.setSanitizedPreference('chatMentionHighlightColor', color, this.sanitizeChatMentionColor);
    }

    async setChatMentionSoundEnabled(enabled) {
      await this.setBooleanPreference('chatMentionSoundEnabled', enabled);
    }

    async setChatMentionSoundId(soundId) {
      return this.setSanitizedPreference('chatMentionSoundId', soundId, this.sanitizeChatMentionSoundId);
    }

    async setShowFullRepliesEnabled(enabled) {
      await this.setBooleanPreference('showFullRepliesEnabled', enabled);
    }

    async setLiveHoverPreviewEnabled(enabled) {
      await this.setBooleanPreference('liveHoverPreviewEnabled', enabled);
    }

    sanitizeLiveHoverPreviewMode(mode) {
      return mode === 'video' ? 'video' : 'image';
    }

    async setLiveHoverPreviewMode(mode) {
      return this.setSanitizedPreference('liveHoverPreviewMode', mode, this.sanitizeLiveHoverPreviewMode);
    }

    sanitizeChatFontFamily(font) {
      return CHAT_FONT_FAMILIES.has(font) ? font : 'system';
    }

    sanitizeChatCustomFontDataUrl(dataUrl) {
      const value = typeof dataUrl === 'string' ? dataUrl.trim() : '';
      if (!/^data:(font\/|application\/(?:font|octet-stream))/.test(value)) return '';
      return value.length <= 4_200_000 ? value : '';
    }

    async setHideCollapsedGroupsUntilHover(enabled) {
      await this.setBooleanPreference('hideCollapsedGroupsUntilHover', enabled);
    }

    async setAutoCompactSidebarEnabled(enabled) {
      await this.setBooleanPreference('autoCompactSidebarEnabled', enabled);
    }

    sanitizeCategoryColorOpacity(value) {
      return this.sanitizeBoundedInteger(value, 0, 30, 7);
    }

    sanitizeCategoryColorGradient(value) {
      return this.sanitizeBoundedInteger(value, 0, 100, 62);
    }

    sanitizeCategoryColorStyle(value) {
      return CATEGORY_COLOR_STYLES.has(value) ? value : 'gradient';
    }

    sanitizeStreamerItemStyle(value) {
      return window.TFRAppearancePreferences.sanitizeStreamerItemStyle(value);
    }

    sanitizeSidebarSurfaceStyle(value) {
      return window.TFRAppearancePreferences.sanitizeSidebarSurfaceStyle(value);
    }

    sanitizeAutoCompactGroupStyle(value) {
      return window.TFRAppearancePreferences.sanitizeAutoCompactGroupStyle(value);
    }

    sanitizeSidebarAnimationStyle(value) {
      return window.TFRAppearancePreferences.sanitizeSidebarAnimationStyle(value);
    }

    sanitizeSpecialCategoryColors(colors = {}) {
      const source = colors && typeof colors === 'object' ? colors : {};
      return {
        recentLive: this.sanitizeCategoryColor(source.recentLive),
        uncategorized: this.sanitizeCategoryColor(source.uncategorized)
      };
    }

    async setCategoryColorOpacity(value) {
      return this.setSanitizedPreference(
        'categoryColorOpacity', value, this.sanitizeCategoryColorOpacity, { normalizeCurrent: true }
      );
    }

    async setCategoryColorGradient(value) {
      return this.setSanitizedPreference(
        'categoryColorGradient', value, this.sanitizeCategoryColorGradient, { normalizeCurrent: true }
      );
    }

    async setCategoryColorStyle(value) {
      return this.setSanitizedPreference(
        'categoryColorStyle', value, this.sanitizeCategoryColorStyle, { normalizeCurrent: true }
      );
    }

    async setStreamerItemStyle(value) {
      return this.setSanitizedPreference(
        'streamerItemStyle', value, this.sanitizeStreamerItemStyle, { normalizeCurrent: true }
      );
    }

    async setAutoCompactStreamerStyle(value) {
      return this.setSanitizedPreference(
        'autoCompactStreamerStyle', value, this.sanitizeStreamerItemStyle,
        { normalizeCurrent: true, currentFallback: 'compact' }
      );
    }

    async setAutoCompactGroupStyle(value) {
      return this.setSanitizedPreference(
        'autoCompactGroupStyle', value, this.sanitizeAutoCompactGroupStyle, { normalizeCurrent: true }
      );
    }

    async setSidebarAnimationStyle(value) {
      return this.setSanitizedPreference(
        'sidebarAnimationStyle', value, this.sanitizeSidebarAnimationStyle, { normalizeCurrent: true }
      );
    }

    async setSidebarSurfaceStyle(value) {
      return this.setSanitizedPreference(
        'sidebarSurfaceStyle', value, this.sanitizeSidebarSurfaceStyle, { normalizeCurrent: true }
      );
    }

    async setSidebarSurfaceColor(color) {
      return this.setSanitizedPreference(
        'sidebarSurfaceColor', color, this.sanitizeCategoryColor, { normalizeCurrent: true }
      );
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
      if (!Number.isFinite(Number(seconds))) return;
      return this.setSanitizedPreference(
        'toastDurationSeconds', seconds, this.sanitizeToastDuration, { normalizeCurrent: true }
      );
    }

    sanitizeToastDuration(value) {
      return this.sanitizeBoundedInteger(value, 2, 60, 6);
    }

    sanitizeToastPosition(position) {
      return TOAST_POSITIONS.has(position) ? position : 'top-right';
    }

    sanitizeToastSoundId(soundId) {
      return TOAST_SOUND_IDS.has(soundId) ? soundId : 'soft';
    }

    sanitizeToastSoundVolume(volume) {
      return this.sanitizeBoundedInteger(volume, 0, 100, 35);
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
      await this.setBooleanPreference('toastEnabled', enabled);
    }

    async setToastPosition(position) {
      return this.setSanitizedPreference(
        'toastPosition', position, this.sanitizeToastPosition,
        { normalizeCurrent: true, currentFallback: 'top-right' }
      );
    }

    async setToastSoundEnabled(enabled) {
      await this.setBooleanPreference('toastSoundEnabled', enabled);
    }

    async setToastSound(soundId) {
      return this.setSanitizedPreference(
        'toastSoundId', soundId, this.sanitizeToastSoundId,
        { normalizeCurrent: true, currentFallback: 'soft' }
      );
    }

    async setToastSoundVolume(volume) {
      return this.setSanitizedPreference(
        'toastSoundVolume', volume, this.sanitizeToastSoundVolume, { normalizeCurrent: true }
      );
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

    async fetchBackgroundLiveSnapshot(forceRefresh = false) {
      if (typeof sendExtensionMessage !== 'function') {
        return null;
      }
      const response = await sendExtensionMessage({
        type: 'TFR_GET_LIVE_SNAPSHOT',
        forceRefresh: Boolean(forceRefresh)
      });
      if (!response || response.error) {
        return null;
      }
      return response;
    }

    async refreshLiveData(options = {}) {
      if (this.isRefreshing) return;
      if (document.visibilityState === 'hidden' && !options.forceRefresh) return;
      const forceRefresh = Boolean(options.forceRefresh);
      const now = Date.now();
      if (!forceRefresh && this.lastLiveRefreshAt && now - this.lastLiveRefreshAt < this.liveRefreshCooldownMs) {
        return;
      }
      this.isRefreshing = true;
      try {
        const favorites = Object.keys(this.state.favorites);
        if (!favorites.length) {
          this.liveData = {};
          this.emitter.emit({ kind: CHANGE_KIND.LIVE, liveData: this.getLiveData() });
          return;
        }
        this.lastLiveRefreshAt = now;
        const snapshot = await this.fetchBackgroundLiveSnapshot(forceRefresh);
        if (snapshot?.timestamp) {
          this.lastLiveStorageAt = Number(snapshot.timestamp) || Date.now();
        }
        const snapshotLiveData = snapshot?.liveData && typeof snapshot.liveData === 'object' ? snapshot.liveData : null;
        const updates = snapshotLiveData
          ? favorites.map((login) => snapshotLiveData[login] || snapshotLiveData[login.toLowerCase()])
          : await Promise.all(favorites.map((login) => {
              const previousLive = getLiveDataEntry(this.liveData, login);
              return fetchStreamerLiveData(login, {
                ...this.state.favorites[login],
                ...(previousLive || {})
              });
            }));
        const nextLive = {};
        const favoriteUpdates = {};
        const favoriteRenames = new Map();
        const mergeStartedAt = window.TFRPerformance?.now?.();
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
          const stored = this.state.favorites[requestedLogin];
          if (stored) {
            const nextUserId = String(entry.userId || stored.userId || '');
            const nextDisplay = entry.displayName || stored.displayName;
            const nextAvatar = entry.avatarUrl || stored.avatarUrl;
            if (normalized !== requestedLogin) {
              favoriteRenames.set(requestedLogin, normalized);
            }
            if (
              normalized !== requestedLogin
              || stored.userId !== nextUserId
              || stored.displayName !== nextDisplay
              || stored.avatarUrl !== nextAvatar
            ) {
              favoriteUpdates[normalized] = {
                ...stored,
                userId: nextUserId,
                login: normalized,
                displayName: nextDisplay,
                avatarUrl: nextAvatar
              };
            }
          }
        });
        if (mergeStartedAt !== undefined) {
          window.TFRPerformance?.report?.('favorites.mergeLiveData', mergeStartedAt, {
            favorites: favorites.length
          });
        }
        Object.entries(this.state.favorites).forEach(([login, stored]) => {
          if (!stored) {
            return;
          }
          const normalized = login.toLowerCase();
          const targetLogin = favoriteRenames.get(normalized) || normalized;
          const live = nextLive[targetLogin];
          const filterActive =
            Boolean(stored?.categoryFilter?.enabled) &&
            Array.isArray(stored.categoryFilter?.categories) &&
            stored.categoryFilter.categories.length > 0;
          if (!filterActive) {
            if (stored.filterMatchSince) {
              const existing = favoriteUpdates[targetLogin];
              if (existing) {
                favoriteUpdates[targetLogin] = { ...existing, filterMatchSince: 0 };
              } else {
                favoriteUpdates[targetLogin] = {
                  ...stored,
                  login: targetLogin,
                  filterMatchSince: 0
                };
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
            const existing = favoriteUpdates[targetLogin];
            if (existing) {
              favoriteUpdates[targetLogin] = { ...existing, filterMatchSince: nextSince };
            } else {
              favoriteUpdates[targetLogin] = {
                ...stored,
                login: targetLogin,
                filterMatchSince: nextSince
              };
            }
          } else if (
            favoriteUpdates[targetLogin]
            && favoriteUpdates[targetLogin].filterMatchSince === undefined
          ) {
            favoriteUpdates[targetLogin] = {
              ...favoriteUpdates[targetLogin],
              filterMatchSince: previousSince
            };
          }
        });
        this.liveData = nextLive;
        if (Object.keys(favoriteUpdates).length) {
          await this.updateState((draft) => {
            favoriteRenames.forEach((nextLogin, previousLogin) => {
              if (nextLogin !== previousLogin) {
                delete draft.favorites[previousLogin];
              }
            });
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

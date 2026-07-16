(function () {

  const extensionApi = globalThis.chrome ?? globalThis.browser;
  const isStandaloneContext = Boolean(globalThis.__TFR_PANEL_STANDALONE__);

  if (!extensionApi || window.__TFR_OVERLAY_PANEL__) {

    return;

  }

  const panelModel = globalThis.__TFR_PANEL_MODEL__;
  const toastPreferences = globalThis.__TFR_TOAST_PREFERENCES__;
  const toastAudioApi = globalThis.__TFR_TOAST_AUDIO__;
  const toastStackApi = globalThis.__TFR_TOAST_STACK__;
  const panelRendererApi = globalThis.__TFR_PANEL_RENDERER__;
  const panelViewApi = globalThis.__TFR_PANEL_VIEW__;
  const panelLifecycleApi = globalThis.__TFR_PANEL_LIFECYCLE__;
  if (!panelModel || !toastPreferences || !toastAudioApi || !toastStackApi || !panelRendererApi || !panelViewApi || !panelLifecycleApi) {
    console.error('[TFR overlay] panel dependencies unavailable');
    return;
  }
  const {
    buildCategoryGroups: buildPanelCategoryGroups,
    escapeHtml,
    formatNumber: formatPanelNumber,
    formatTimestamp: formatPanelTimestamp
  } = panelModel;
  const {
    normalizeToastPreferences,
    sanitizeSoundId,
    sanitizeSoundVolume,
    sanitizeToastPosition
  } = toastPreferences;
  const toastAudio = toastAudioApi.createToastAudio({
    AudioContextConstructor: window.AudioContext || window.webkitAudioContext,
    AudioConstructor: window.Audio
  });


  const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';

  const MAX_VISIBLE_TOASTS = 3;

  const DEFAULT_TOAST_DURATION = 5000;

  const REFRESH_INTERVAL = 30_000;



  const state = {

    snapshot: { favorites: {}, categories: [], preferences: {}, liveData: {}, timestamp: Date.now() },

    toastDurationMs: DEFAULT_TOAST_DURATION,
    toastEnabled: true,
    toastPosition: 'top-right',
    toastSoundEnabled: false,
    toastSoundId: 'soft',
    toastSoundVolume: 35,
    toastCustomSoundDataUrl: '',

    categoryCollapse: new Map()

  };



  const sendMessage = (payload) =>

    new Promise((resolve) => {

      try {

        extensionApi.runtime.sendMessage(payload, (response) => {

          const error = extensionApi.runtime.lastError;

          if (error) {
            const message = String(error?.message || '').toLowerCase();
            if (message.includes('extension context invalidated') || message.includes('context invalidated')) {
              return resolve(null);
            }
            console.warn('[TFR overlay] message error', error);
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
        console.warn('[TFR overlay] message exception', error);

        resolve(null);

      }

    });

  const toastStackController = toastStackApi.createToastStackController({
    documentRef: document,
    escapeHtml,
    formatNumber: formatPanelNumber,
    defaultAvatar: DEFAULT_AVATAR,
    maxVisible: MAX_VISIBLE_TOASTS,
    dismissEntry: ({ login, notificationKey }) => sendMessage({
      type: 'TFR_DISMISS_LIVE_TOAST',
      login,
      notificationKey
    })
  });
  const panelRenderer = panelRendererApi.createPanelRenderer({
    documentRef: document,
    escapeHtml,
    formatNumber: formatPanelNumber,
    defaultAvatar: DEFAULT_AVATAR
  });
  const panelView = panelViewApi.createPanelView({
    documentRef: document,
    standalone: isStandaloneContext,
    onRefresh: () => refreshSnapshot(true),
    onClose: () => {
      if (isStandaloneContext && typeof window.close === 'function') {
        window.close();
      } else {
        panelLifecycle.setOpen(false);
      }
    },
    onToggleCategory: (categoryId) => toggleCategoryCollapse(categoryId),
    onOpenChannel: (login) => openChannel(login)
  });



  const ensurePanelElements = () => {
    const host = document.body || document.documentElement;
    panelView.ensure(host);
  };



  const syncCollapsedState = (categories = []) => {

    const known = state.categoryCollapse;

    const seen = new Set();

    categories.forEach((category) => {

      if (!category?.id) return;

      seen.add(category.id);

      if (!known.has(category.id)) {

        known.set(category.id, Boolean(category.collapsed));

      }

    });

    if (!known.has('uncategorized')) {

      known.set('uncategorized', false);

    }

    seen.add('uncategorized');

    Array.from(known.keys()).forEach((id) => {

      if (!seen.has(id)) {

        known.delete(id);

      }

    });

  };



  const toggleCategoryCollapse = (categoryId) => {

    if (!categoryId) return;

    const current = state.categoryCollapse.get(categoryId) || false;

    state.categoryCollapse.set(categoryId, !current);

    renderSnapshot(state.snapshot);

  };





  const playNotificationSound = async (options = {}) => {
    const volume = sanitizeSoundVolume(options.volume ?? state.toastSoundVolume);
    const soundId = sanitizeSoundId(options.soundId ?? state.toastSoundId);
    const customSoundDataUrl = typeof options.customSoundDataUrl === 'string' && options.customSoundDataUrl
      ? options.customSoundDataUrl
      : state.toastCustomSoundDataUrl;
    return toastAudio.play({ soundId, volume, customSoundDataUrl });
  };

  const applyToastPosition = () => {
    toastStackController.setPosition(sanitizeToastPosition(state.toastPosition));
  };



  const openChannel = (login) => {

    if (!login) return;

    extensionApi.runtime.sendMessage({ type: 'TFR_OPEN_CHANNEL_TAB', login });

    if (!isStandaloneContext) {
      panelLifecycle.setOpen(false);

    }

  };



  const renderSnapshot = (snapshot) => {

    if (!snapshot) return;

    state.snapshot = snapshot;

    if (!panelView.getElements()) {

      ensurePanelElements();

    }
    const panelElements = panelView.getElements();

    const { favorites = {}, liveData = {}, categories = [], preferences = {} } = snapshot;

    syncCollapsedState(categories);

    const toastPrefs = normalizeToastPreferences(preferences, DEFAULT_TOAST_DURATION);
    state.toastDurationMs = toastPrefs.durationMs;
    state.toastEnabled = toastPrefs.enabled;
    state.toastPosition = toastPrefs.position;
    state.toastSoundEnabled = toastPrefs.soundEnabled;
    state.toastSoundId = toastPrefs.soundId;
    state.toastSoundVolume = toastPrefs.soundVolume;
    state.toastCustomSoundDataUrl = toastPrefs.customSoundDataUrl;
    applyToastPosition();

    const { groups, totalLive, totalFavorites } = buildPanelCategoryGroups({
      favorites,
      liveData,
      categories,
      categoryCollapse: state.categoryCollapse
    });



    const emptyEl = panelElements.empty;



    if (!totalFavorites) {

      emptyEl.textContent = 'Aucun favori enregistré.';

      emptyEl.classList.remove('tfr-hidden');

      panelElements.subtitle.textContent = 'Ajoutez des favoris depuis Twitch.';

    } else if (!totalLive) {

      emptyEl.textContent = 'Aucun favori en live pour le moment.';

      emptyEl.classList.remove('tfr-hidden');

      panelElements.subtitle.textContent = 'Tout est calme.';

    } else {

      emptyEl.classList.add('tfr-hidden');

      panelElements.subtitle.textContent = `${totalLive} favori(s) en live.`;

    }



    panelRenderer.renderGroups(panelElements.sections, groups);



    panelElements.timestamp.textContent = formatPanelTimestamp(snapshot.timestamp);

  };



  const refreshSnapshot = async (forceRefresh = false, options = {}) => {

    const showLoading = options.showLoading !== false && (
      forceRefresh || !Object.keys(state.snapshot?.liveData || {}).length
    );

    if (showLoading) {
      panelView.getElements()?.root.classList.add('tfr-panel--loading');
    }

    const snapshot = await sendMessage({ type: 'TFR_GET_POPUP_STATE', forceRefresh });

    if (showLoading) {
      panelView.getElements()?.root.classList.remove('tfr-panel--loading');
    }

    if (snapshot && !snapshot.error) {

      renderSnapshot(snapshot);

    } else {

      panelView.getElements().subtitle.textContent = 'Impossible de récupérer les favoris.';

    }

  };
  const panelLifecycle = panelLifecycleApi.createPanelLifecycle({
    documentRef: document,
    standalone: isStandaloneContext,
    refreshIntervalMs: REFRESH_INTERVAL,
    ensurePanel: ensurePanelElements,
    getPanelRoot: () => panelView.getElements()?.root,
    refresh: refreshSnapshot
  });



  const displayToast = (entries = [], options = {}) => {

    if (!entries.length) return false;

    const shouldPlaySound = options.playSound === true || (state.toastSoundEnabled && options.playSound !== false);
    const shouldShowToast = options.showToast !== false && (state.toastEnabled || options.force);

    if (shouldPlaySound) {
      playNotificationSound({
        soundId: options.soundId,
        volume: options.soundVolume,
        customSoundDataUrl: options.customSoundDataUrl
      });
    }

    if (!shouldShowToast) {
      return shouldPlaySound;
    }

    const duration = state.toastDurationMs || DEFAULT_TOAST_DURATION;
    return toastStackController.render(entries, {
      host: document.body || document.documentElement,
      durationMs: duration,
      position: sanitizeToastPosition(state.toastPosition)
    });
  };

  window.addEventListener('TFR_TEST_TOAST_SOUND', (event) => {
    playNotificationSound(event.detail || {});
  });


  extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    if (!message) return false;

    if (message.type === 'TFR_TOGGLE_PANEL') {

      panelLifecycle.toggle();

    } else if (message.type === 'TFR_STATE_PUSH') {

      renderSnapshot(message);

    } else if (message.type === 'TFR_OVERLAY_TOAST') {

      const displayed = displayToast(message.entries || [], {
        force: Boolean(message.force),
        showToast: message.showToast,
        playSound: message.playSound,
        soundId: message.soundId,
        soundVolume: message.soundVolume,
        customSoundDataUrl: message.customSoundDataUrl
      });
      sendResponse?.({ ok: Boolean(displayed) });
      return true;

    }

    return false;

  });



  window.__TFR_OVERLAY_PANEL__ = true;
  if (isStandaloneContext) {

    panelLifecycle.setOpen(true);

  } else {

    // Preload snapshot silently so first toggle feels instant.

    sendMessage({ type: 'TFR_GET_POPUP_STATE', forceRefresh: false }).then((snapshot) => {

      if (snapshot && !snapshot.error) {

        renderSnapshot(snapshot);

      }

    });

  }

})();

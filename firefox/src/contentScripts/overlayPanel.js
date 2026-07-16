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
  const panelSnapshotApi = globalThis.__TFR_PANEL_SNAPSHOT_CONTROLLER__;
  const panelPresenterApi = globalThis.__TFR_PANEL_SNAPSHOT_PRESENTER__;
  const runtimeClientApi = globalThis.__TFR_EXTENSION_RUNTIME_CLIENT__;
  const panelMessageRouterApi = globalThis.__TFR_PANEL_MESSAGE_ROUTER__;
  if (!panelModel || !toastPreferences || !toastAudioApi || !toastStackApi || !panelRendererApi || !panelViewApi || !panelLifecycleApi || !panelSnapshotApi || !panelPresenterApi || !runtimeClientApi || !panelMessageRouterApi) {
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



  const runtimeClient = runtimeClientApi.createExtensionRuntimeClient({
    runtime: extensionApi.runtime
  });

  const toastStackController = toastStackApi.createToastStackController({
    documentRef: document,
    escapeHtml,
    formatNumber: formatPanelNumber,
    defaultAvatar: DEFAULT_AVATAR,
    maxVisible: MAX_VISIBLE_TOASTS,
    dismissEntry: ({ login, notificationKey }) =>
      runtimeClient.dismissToast(login, notificationKey)
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
    onRefresh: () => panelSnapshotController.refresh(true),
    onClose: () => {
      if (isStandaloneContext && typeof window.close === 'function') {
        window.close();
      } else {
        panelLifecycle.setOpen(false);
      }
    },
    onToggleCategory: (categoryId) => panelSnapshotPresenter.toggleCategory(categoryId),
    onOpenChannel: (login) => openChannel(login)
  });



  const ensurePanelElements = () => {
    const host = document.body || document.documentElement;
    panelView.ensure(host);
  };



  const playNotificationSound = async (options = {}) => {
    const preferences = panelSnapshotPresenter.getToastPreferences();
    const volume = sanitizeSoundVolume(options.volume ?? preferences.soundVolume);
    const soundId = sanitizeSoundId(options.soundId ?? preferences.soundId);
    const customSoundDataUrl = typeof options.customSoundDataUrl === 'string' && options.customSoundDataUrl
      ? options.customSoundDataUrl
      : preferences.customSoundDataUrl;
    return toastAudio.play({ soundId, volume, customSoundDataUrl });
  };

  const applyToastPosition = (position) => {
    toastStackController.setPosition(sanitizeToastPosition(position));
  };



  const openChannel = (login) => {

    if (!login) return;

    runtimeClient.openChannel(login);

    if (!isStandaloneContext) {
      panelLifecycle.setOpen(false);

    }

  };



  const panelSnapshotPresenter = panelPresenterApi.createPanelSnapshotPresenter({
    ensurePanel: ensurePanelElements,
    getPanelElements: () => panelView.getElements(),
    normalizeToastPreferences,
    defaultToastDurationMs: DEFAULT_TOAST_DURATION,
    buildCategoryGroups: buildPanelCategoryGroups,
    renderGroups: (container, groups) => panelRenderer.renderGroups(container, groups),
    formatTimestamp: formatPanelTimestamp,
    applyToastPosition
  });



  const panelSnapshotController = panelSnapshotApi.createPanelSnapshotController({
    requestSnapshot: runtimeClient.getSnapshot,
    renderSnapshot: panelSnapshotPresenter.render,
    getPanelRoot: () => panelView.getElements()?.root,
    getSubtitle: () => panelView.getElements()?.subtitle,
    hasLiveData: panelSnapshotPresenter.hasLiveData
  });
  const panelLifecycle = panelLifecycleApi.createPanelLifecycle({
    documentRef: document,
    standalone: isStandaloneContext,
    refreshIntervalMs: REFRESH_INTERVAL,
    ensurePanel: ensurePanelElements,
    getPanelRoot: () => panelView.getElements()?.root,
    refresh: panelSnapshotController.refresh
  });



  const displayToast = (entries = [], options = {}) => {

    if (!entries.length) return false;

    const preferences = panelSnapshotPresenter.getToastPreferences();
    const shouldPlaySound = options.playSound === true || (preferences.soundEnabled && options.playSound !== false);
    const shouldShowToast = options.showToast !== false && (preferences.enabled || options.force);

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

    const duration = preferences.durationMs || DEFAULT_TOAST_DURATION;
    return toastStackController.render(entries, {
      host: document.body || document.documentElement,
      durationMs: duration,
      position: sanitizeToastPosition(preferences.position)
    });
  };

  window.addEventListener('TFR_TEST_TOAST_SOUND', (event) => {
    playNotificationSound(event.detail || {});
  });


  extensionApi.runtime.onMessage.addListener(
    panelMessageRouterApi.createPanelMessageRouter({
      togglePanel: panelLifecycle.toggle,
      renderSnapshot: panelSnapshotPresenter.render,
      displayToast
    })
  );



  window.__TFR_OVERLAY_PANEL__ = true;
  if (isStandaloneContext) {

    panelLifecycle.setOpen(true);

  } else {

    // Preload snapshot silently so first toggle feels instant.

    panelSnapshotController.preload();

  }

})();

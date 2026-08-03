(() => {
  const createFavoritesOverlay = ({
    DEFAULT_AVATAR,
    t,
    formatViewers,
    getLiveDataEntry,
    getSidebarVisibilityInfo,
    normalizeCategoryName,
    fetchCategorySuggestions
  }) => {
const categoryFilterTools = window.TFRFavoriteCategoryFilterTools?.create?.({ normalizeCategoryName });
if (!categoryFilterTools) {
  throw new Error('[TFR] favorite category filter tools are missing');
}
const categoryFilterView = window.TFRFavoriteCategoryFilterView?.create?.({ t });
if (!categoryFilterView) {
  throw new Error('[TFR] favorite category filter view is missing');
}
const FavoriteCategoryFilterController = window.TFRFavoriteCategoryFilterController?.create?.({
  t,
  normalizeCategoryName,
  tools: categoryFilterTools,
  view: categoryFilterView
});
if (!FavoriteCategoryFilterController) {
  throw new Error('[TFR] favorite category filter controller is missing');
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
    this.isDriveSyncing = false;
    this.driveStatus = null;
    this.driveMessage = '';
    this.driveDebugVisible = false;
    this.toastSoundMessage = '';
    this.draggedLogin = null;
    this.draggedCategoryStartX = 0;
    this.selectedFavorites = new Set();
    this.activeFavoriteLogin = null;
    this.categorySuggestionCache = new Map();
    this.appearanceWizardStep = 0;
    this.appearanceRadialState = {};
    this.appearanceWizardOpen = false;
    this.appearanceAdvancedOpen = false;
    this.dataToolsOpen = false;
    this.featureCardsOpen = new Set();
    this.categoryFilterController = new FavoriteCategoryFilterController({
      store: this.store,
      getCategorySuggestions: (term) => this.getCategorySuggestions(term),
      onChange: () => this.render()
    });
    this.favoriteIssuesPanel = window.TFRFavoriteIssuesPanel?.create?.({
      store: this.store,
      t,
      defaultAvatar: DEFAULT_AVATAR,
      onChange: () => this.render()
    }) || null;
    this.unsubscribe = this.store.subscribe(() => {
      if (this.isOpen) {
        this.render();
      }
    });
    this.handleEscapeKeydown = (event) => {
      if (event.key === 'Escape' && this.isOpen) {
        this.close();
      }
    };
    this.handleOverlayKeyboardEvent = (event) => {
      if (!this.isOpen || !this.root?.contains(event.target)) {
        return;
      }
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (event.type === 'keydown' && event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    };
    document.addEventListener('keydown', this.handleEscapeKeydown);
  }

  hexToRgb(hex) {
    return window.TFRColorTools.hexToRgb(hex);
  }

  applyCategoryColorVars(element, color) {
    const rgb = this.hexToRgb(color);
    if (!rgb) return;
    element.dataset.color = 'custom';
    element.style.setProperty('--tfr-category-card-tint', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`);
    element.style.setProperty('--tfr-category-card-border', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.62)`);
    element.style.setProperty('--tfr-swatch-color', color);
  }

  hsvToHex(hue, saturation, value) {
    return window.TFRColorTools.hsvToHex(hue, saturation, value);
  }

  getColorFromWheelEvent(event, element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const radius = Math.min(rect.width, rect.height) / 2;
    const distance = Math.min(radius, Math.sqrt(dx * dx + dy * dy));
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
    const saturation = Math.max(0, Math.min(1, distance / radius));
    return this.hsvToHex(hue, saturation, 0.94);
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
    ['keydown', 'keyup', 'keypress'].forEach((eventName) => {
      backdrop.addEventListener(eventName, this.handleOverlayKeyboardEvent);
    });
    const panel = document.createElement('div');
    panel.className = 'tfr-overlay-panel';
    const header = document.createElement('div');
    header.className = 'tfr-overlay-header';
    const title = document.createElement('h2');
    title.className = 'tfr-overlay-title';
    title.textContent = t('manager.title');
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'tfr-overlay-close';
    closeButton.setAttribute('aria-label', t('common.closeAction'));
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
      this.refreshDriveStatus();
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
    this.draggedCategoryStartX = 0;
    this.selectedFavorites.clear();
    this.activeFavoriteLogin = null;
    this.closeListeners.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[TFR] Overlay close listener error', error);
      }
    });
  }

  dispose() {
    this.close();
    this.unsubscribe?.();
    this.unsubscribe = null;
    document.removeEventListener('keydown', this.handleEscapeKeydown);
    this.openListeners.clear();
    this.closeListeners.clear();
    this.categorySuggestionCache.clear();
    this.root = null;
  }

  sendBackgroundMessage(payload) {
    return new Promise((resolve) => {
      const api = globalThis.chrome ?? globalThis.browser;
      if (!api?.runtime?.sendMessage) {
        resolve(null);
        return;
      }
      try {
        api.runtime.sendMessage(payload, (response) => {
          const error = api.runtime?.lastError;
          if (error) {
            resolve({ ok: false, message: error.message || 'Extension message failed' });
            return;
          }
          resolve(response);
        });
      } catch (error) {
        resolve({ ok: false, message: error?.message || 'Extension message failed' });
      }
    });
  }

  async refreshDriveStatus() {
    const response = await this.sendBackgroundMessage({ type: 'TFR_DRIVE_SYNC_STATUS' });
    if (response?.ok) {
      this.driveStatus = response.status;
      if (!response.status?.configured) {
        this.driveMessage = t('drive.notConfigured');
      } else if (!this.driveMessage) {
        this.driveMessage = response.status?.connectedAt ? t('drive.connected') : t('drive.readyToConnect');
      }
      if (this.isOpen) {
        this.render();
      }
    }
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
    const previousScrollTop = content.scrollTop;
    const previousScrollLeft = content.scrollLeft;
    const focusSnapshot = this.captureFocusSnapshot();
    content.innerHTML = '';

    content.appendChild(this.renderProfileControls(state));
    content.appendChild(this.renderManagerControls());
    this.appendIfPresent(content, this.renderFavoriteIssues(state));
    content.appendChild(this.renderDataTools());
    this.appendIfPresent(content, this.renderRecentLiveSettings(state));

    content.appendChild(this.renderSidebarAppearanceWizard(state));
    this.appendIfPresent(content, this.renderToastSettings(state));
    this.appendIfPresent(content, this.renderFeatureToggles(state));
    content.appendChild(this.renderBoard(state, liveData));

    this.renderFavoriteDetailsPanel(state, liveData);
    requestAnimationFrame(() => {
      if (!content.isConnected) {
        return;
      }
      if (content.scrollTop !== previousScrollTop) {
        content.scrollTop = previousScrollTop;
      }
      if (content.scrollLeft !== previousScrollLeft) {
        content.scrollLeft = previousScrollLeft;
      }
      this.restoreFocusSnapshot(focusSnapshot);
    });
  }

  appendIfPresent(parent, child) {
    if (child) parent.appendChild(child);
    return child;
  }

  renderManagerControls() {
    const controls = document.createElement('div');
    controls.className = 'tfr-manager-controls';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.dataset.tfrFocusKey = 'manager-search';
    searchInput.placeholder = t('search.placeholder');
    searchInput.value = this.searchTerm;
    searchInput.addEventListener('input', (event) => {
      this.searchTerm = event.target.value;
      this.render();
    });

    const sortSelect = document.createElement('select');
    [
      ['viewersDesc', 'sort.viewersDesc'],
      ['alphabetical', 'sort.alphabetical'],
      ['recent', 'sort.recent']
    ].forEach(([value, labelKey]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = t(labelKey);
      sortSelect.appendChild(option);
    });
    sortSelect.value = this.sortMode;
    sortSelect.addEventListener('change', async (event) => {
      this.sortMode = event.target.value;
      await this.store.setSortMode(this.sortMode);
      this.render();
    });
    controls.append(searchInput, sortSelect);
    return controls;
  }

  renderDataTools() {
    const tools = document.createElement('details');
    tools.className = 'tfr-data-tools';
    tools.open = this.dataToolsOpen;
    tools.addEventListener('toggle', () => {
      this.dataToolsOpen = tools.open;
    });
    const summary = document.createElement('summary');
    summary.textContent = t('backup.tools');
    const body = document.createElement('div');
    body.className = 'tfr-data-tools__body';
    body.append(this.renderBackupControls(), this.renderDriveControls());
    tools.append(summary, body);
    return tools;
  }

  renderFavoriteIssues(state) {
    return this.favoriteIssuesPanel?.render(state) || null;
  }

  captureFocusSnapshot() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.root?.contains(active)) {
      return null;
    }
    const focusKey = active.dataset?.tfrFocusKey || '';
    if (!focusKey) {
      return null;
    }
    const snapshot = {
      focusKey,
      selectionStart: null,
      selectionEnd: null
    };
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
    ) {
      snapshot.selectionStart = active.selectionStart;
      snapshot.selectionEnd = active.selectionEnd;
    }
    return snapshot;
  }

  restoreFocusSnapshot(snapshot) {
    if (!snapshot?.focusKey || !this.root?.isConnected) {
      return;
    }
    const escapedFocusKey =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(snapshot.focusKey)
        : String(snapshot.focusKey).replace(/["\\]/g, '\\$&');
    const next = this.root.querySelector(`[data-tfr-focus-key="${escapedFocusKey}"]`);
    if (!(next instanceof HTMLElement)) {
      return;
    }
    try {
      next.focus({ preventScroll: true });
      if (
        (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) &&
        Number.isFinite(snapshot.selectionStart) &&
        Number.isFinite(snapshot.selectionEnd)
      ) {
        next.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
      }
    } catch {
      next.focus();
    }
  }

  renderProfileControls(state) {
    const profiles = this.store.getProfiles ? this.store.getProfiles() : [];
    const activeId = state.activeProfileId || profiles[0]?.id || 'default';
    const wrapper = document.createElement('section');
    wrapper.className = 'tfr-profile-controls';

    const label = document.createElement('label');
    label.className = 'tfr-profile-controls__select';
    const labelText = document.createElement('span');
    labelText.textContent = t('profiles.label');
    label.appendChild(labelText);

    const select = document.createElement('select');
    profiles.forEach((profile) => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.name} (${profile.count})`;
      select.appendChild(option);
    });
    select.value = activeId;
    select.addEventListener('change', async (event) => {
      await this.store.switchProfile?.(event.target.value);
      this.render();
    });
    label.appendChild(select);
    wrapper.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'tfr-profile-controls__actions';

    const newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.className = 'tfr-button';
    newButton.textContent = t('profiles.new');
    newButton.addEventListener('click', async () => {
      const name = window.prompt(t('profiles.promptNew'), t('profiles.defaultName'));
      if (!name?.trim()) return;
      await this.store.createProfile?.(name.trim());
      this.render();
    });
    actions.appendChild(newButton);

    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.className = 'tfr-button tfr-button--ghost';
    renameButton.textContent = t('profiles.rename');
    renameButton.addEventListener('click', async () => {
      const current = profiles.find((profile) => profile.id === activeId);
      const name = window.prompt(t('profiles.promptRename'), current?.name || '');
      if (!name?.trim()) return;
      await this.store.renameProfile?.(activeId, name.trim());
      this.render();
    });
    actions.appendChild(renameButton);

    const exportProfileButton = document.createElement('button');
    exportProfileButton.type = 'button';
    exportProfileButton.className = 'tfr-button tfr-button--ghost';
    exportProfileButton.textContent = t('profiles.export');
    exportProfileButton.addEventListener('click', () => this.handleExportProfile());
    actions.appendChild(exportProfileButton);

    const importProfileInput = document.createElement('input');
    importProfileInput.type = 'file';
    importProfileInput.accept = 'application/json';
    importProfileInput.className = 'tfr-backup-file-input';
    importProfileInput.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) this.importProfileFromFile(file);
    });
    const importProfileButton = document.createElement('button');
    importProfileButton.type = 'button';
    importProfileButton.className = 'tfr-button tfr-button--ghost';
    importProfileButton.textContent = t('profiles.import');
    importProfileButton.addEventListener('click', () => importProfileInput.click());
    actions.append(importProfileButton, importProfileInput);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'tfr-button tfr-button--danger';
    deleteButton.textContent = t('profiles.delete');
    deleteButton.disabled = profiles.length <= 1;
    deleteButton.addEventListener('click', async () => {
      const current = profiles.find((profile) => profile.id === activeId);
      const confirmed = window.confirm(t('profiles.confirmDelete', { name: current?.name || activeId }));
      if (!confirmed) return;
      await this.store.deleteProfile?.(activeId);
      this.render();
    });
    actions.appendChild(deleteButton);

    wrapper.appendChild(actions);
    return wrapper;
  }

  downloadJson(payload, filename) {
    window.TFRBackupTools.downloadJson(payload, filename);
  }

  handleExportProfile() {
    try {
      const payload = this.store.getActiveProfileExportData();
      const safeName = window.TFRBackupTools.slugify(payload.profile?.name, 'profil');
      this.downloadJson(payload, `twitch-favoris-profil-${safeName}.json`);
    } catch (error) {
      console.error('[TFR] Profile export error', error);
      window.alert(t('profiles.exportError'));
    }
  }

  async importProfileFromFile(file) {
    try {
      const parsed = JSON.parse(await file.text());
      await this.store.importProfile(parsed);
      window.alert(t('profiles.importSuccess'));
      this.render();
    } catch (error) {
      console.error('[TFR] Profile import error', error);
      window.alert(t('profiles.importError'));
    }
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
    toggleText.textContent = t('recent.toggle');
    toggleLabel.appendChild(toggle);
    toggleLabel.appendChild(toggleText);
    wrapper.appendChild(toggleLabel);

    const thresholdWrapper = document.createElement('div');
    thresholdWrapper.className = 'tfr-recent-live-threshold';
    const thresholdLabel = document.createElement('label');
    thresholdLabel.textContent = t('recent.maxDurationLabel');
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
    thresholdSuffix.textContent = t('recent.maxDurationUnit');
    thresholdWrapper.appendChild(thresholdSuffix);
    wrapper.appendChild(thresholdWrapper);

    const hint = document.createElement('p');
    hint.className = 'tfr-recent-live-hint';
    hint.textContent = t('recent.hint');
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

  renderSidebarAppearanceWizard(state) {
    const prefs = state.preferences || {};
    const categoryValues = [
      'gradient', 'solid', 'stripe', 'glow', 'glass', 'outline', 'minimal', 'dot',
      'rail', 'double', 'soft-card', 'soft-neon', 'ribbon', 'count-badge', 'ink',
      'compact', 'parent-accent'
    ];
    const streamerValues = [
      'default', 'compact', 'card', 'soft-card', 'outline', 'left-line',
      'avatar-ring', 'avatar-square', 'neon', 'viewer-badge', 'game-focus',
      'title-focus', 'glass', 'minimal', 'avatar-grid'
    ];
    const surfaceValues = [
      'default', 'full', 'panel', 'glow', 'rail', 'connected', 'layers', 'canvas',
      'edge', 'spectrum', 'pulse', 'poster', 'arcade'
    ];
    const steps = [
      {
        kind: 'category',
        label: t('appearance.wizard.groups'),
        value: this.store.sanitizeCategoryColorStyle?.(prefs.categoryColorStyle) || 'gradient',
        values: categoryValues,
        labelFor: (style) => t(`categoryAppearance.style.${style}`),
        descriptionFor: (style) => t(
          ['gradient', 'rail', 'soft-card', 'outline', 'minimal', 'parent-accent'].includes(style)
            ? `appearance.description.category.${style}`
            : 'appearance.description.category.other'
        ),
        apply: (style) => this.store.setCategoryColorStyle(style)
      },
      {
        kind: 'streamer',
        label: t('appearance.wizard.streamers'),
        value: this.store.sanitizeStreamerItemStyle?.(prefs.streamerItemStyle) || 'default',
        values: streamerValues,
        labelFor: (style) => t(`streamerAppearance.style.${style}`),
        descriptionFor: (style) => t(
          ['default', 'soft-card', 'compact', 'minimal', 'avatar-ring', 'avatar-grid'].includes(style)
            ? `appearance.description.streamer.${style}`
            : 'appearance.description.streamer.other'
        ),
        apply: (style) => this.store.setStreamerItemStyle(style)
      },
      {
        kind: 'surface',
        label: t('appearance.wizard.surface'),
        value: this.store.sanitizeSidebarSurfaceStyle?.(prefs.sidebarSurfaceStyle) || 'default',
        values: surfaceValues,
        labelFor: (style) => t(`sidebarSurface.style.${style}`),
        descriptionFor: (style) => t(
          ['default', 'panel', 'rail', 'full', 'glow', 'canvas'].includes(style)
            ? `appearance.description.surface.${style}`
            : 'appearance.description.surface.other'
        ),
        apply: (style) => this.store.setSidebarSurfaceStyle(style)
      }
    ];
    this.appearanceWizardStep = Math.max(0, Math.min(steps.length - 1, this.appearanceWizardStep));
    const activeStep = steps[this.appearanceWizardStep];

    const wrapper = document.createElement('section');
    wrapper.className = 'tfr-appearance-wizard';
    const header = document.createElement('div');
    header.className = 'tfr-appearance-wizard__header';
    const heading = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = t('appearance.wizard.title');
    const subtitle = document.createElement('p');
    subtitle.textContent = t('appearance.wizard.subtitle');
    heading.append(title, subtitle);
    header.appendChild(heading);
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'tfr-appearance-wizard__toggle';
    openButton.setAttribute('aria-expanded', String(this.appearanceWizardOpen));
    openButton.innerHTML = this.appearanceWizardOpen
      ? `${t('appearance.wizard.hide')} <span aria-hidden="true">\u2212</span>`
      : `${t('appearance.wizard.open')} <span aria-hidden="true">\u2726</span>`;
    openButton.addEventListener('click', () => {
      this.appearanceWizardOpen = !this.appearanceWizardOpen;
      this.render();
    });
    header.appendChild(openButton);
    wrapper.appendChild(header);

    const summary = document.createElement('div');
    summary.className = 'tfr-appearance-wizard__selection-summary';
    steps.forEach((step) => {
      const item = document.createElement('span');
      item.innerHTML = `<small>${step.label}</small><strong>${step.labelFor(step.value)}</strong>`;
      summary.appendChild(item);
    });
    wrapper.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'tfr-appearance-wizard__body';
    body.hidden = !this.appearanceWizardOpen;

    const progress = document.createElement('div');
    progress.className = 'tfr-appearance-wizard__progress';
    steps.forEach((step, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tfr-appearance-wizard__step';
      button.classList.toggle('is-active', index === this.appearanceWizardStep);
      button.classList.toggle('is-complete', index < this.appearanceWizardStep);
      button.innerHTML = `<span>${index + 1}</span>${step.label}`;
      button.addEventListener('click', () => {
        this.appearanceWizardStep = index;
        this.render();
      });
      progress.appendChild(button);
    });
    body.appendChild(progress);

    const stageHeading = document.createElement('div');
    stageHeading.className = 'tfr-appearance-wizard__stage-heading';
    stageHeading.innerHTML = `<span>${t('appearance.wizard.step', {
      current: this.appearanceWizardStep + 1,
      total: steps.length
    })}</span><strong>${activeStep.label}</strong>`;
    body.appendChild(stageHeading);

    body.appendChild(this.renderVisualStylePicker({
      kind: activeStep.kind,
      value: activeStep.value,
      values: activeStep.values,
      families: this.createAppearanceFamilies(activeStep.kind, activeStep.values),
      labelFor: activeStep.labelFor,
      descriptionFor: activeStep.descriptionFor,
      onChange: async (style) => {
        await activeStep.apply(style);
      }
    }));

    const navigation = document.createElement('div');
    navigation.className = 'tfr-appearance-wizard__navigation';
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'tfr-secondary-button';
    previous.textContent = t('appearance.wizard.previous');
    previous.disabled = this.appearanceWizardStep === 0;
    previous.addEventListener('click', () => {
      this.appearanceWizardStep = Math.max(0, this.appearanceWizardStep - 1);
      this.render();
    });
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'tfr-button';
    next.textContent = this.appearanceWizardStep === steps.length - 1
      ? t('appearance.wizard.finish')
      : t('appearance.wizard.next');
    next.addEventListener('click', () => {
      this.appearanceWizardStep = this.appearanceWizardStep === steps.length - 1
        ? 0
        : this.appearanceWizardStep + 1;
      this.render();
    });
    navigation.append(previous, next);
    body.appendChild(navigation);

    const advanced = document.createElement('details');
    advanced.className = 'tfr-appearance-wizard__advanced';
    advanced.open = this.appearanceAdvancedOpen;
    advanced.addEventListener('toggle', () => {
      this.appearanceAdvancedOpen = advanced.open;
    });
    const advancedSummary = document.createElement('summary');
    advancedSummary.textContent = t('streamerAppearance.advanced');
    advanced.appendChild(advancedSummary);
    const legacySettings = document.createElement('div');
    legacySettings.className = 'tfr-appearance-wizard__legacy-settings';
    const categorySettings = this.renderCategoryAppearanceSettings(state);
    const streamerSettings = this.renderStreamerAppearanceSettings(state);
    const surfaceSettings = this.renderSidebarSurfaceSettings(state);
    const decorateAdvancedSection = (section, titleKey, descriptionKey, className) => {
      section.classList.add('tfr-appearance-wizard__advanced-card', className);
      const header = document.createElement('div');
      header.className = 'tfr-appearance-wizard__advanced-card-header';
      const title = document.createElement('strong');
      title.textContent = t(titleKey);
      const description = document.createElement('p');
      description.textContent = t(descriptionKey);
      header.append(title, description);
      section.prepend(header);
    };
    decorateAdvancedSection(
      categorySettings,
      'appearance.advanced.groups.title',
      'appearance.advanced.groups.description',
      'tfr-appearance-wizard__advanced-card--groups'
    );
    decorateAdvancedSection(
      streamerSettings,
      'appearance.advanced.behavior.title',
      'appearance.advanced.behavior.description',
      'tfr-appearance-wizard__advanced-card--behavior'
    );
    decorateAdvancedSection(
      surfaceSettings,
      'appearance.advanced.color.title',
      'appearance.advanced.color.description',
      'tfr-appearance-wizard__advanced-card--color'
    );
    const nestedAdvanced = streamerSettings.querySelector('.tfr-appearance-advanced');
    if (nestedAdvanced) {
      nestedAdvanced.open = true;
      nestedAdvanced.classList.add('tfr-appearance-advanced--embedded');
    }
    legacySettings.append(categorySettings, streamerSettings, surfaceSettings);
    advanced.appendChild(legacySettings);
    body.appendChild(advanced);
    wrapper.appendChild(body);
    return wrapper;
  }

  renderCategoryAppearanceSettings(state) {
    const prefs = state.preferences || {};
    const opacity = Number.isFinite(Number(prefs.categoryColorOpacity))
      ? Math.max(0, Math.min(30, Math.round(Number(prefs.categoryColorOpacity))))
      : 7;
    const gradient = Number.isFinite(Number(prefs.categoryColorGradient))
      ? Math.max(0, Math.min(100, Math.round(Number(prefs.categoryColorGradient))))
      : 62;
    const colorStyle = this.store.sanitizeCategoryColorStyle?.(prefs.categoryColorStyle) || 'gradient';

    const wrapper = document.createElement('section');
    wrapper.className = 'tfr-category-appearance-settings';

    const title = document.createElement('h3');
    title.className = 'tfr-category-appearance-settings__title';
    title.textContent = t('categoryAppearance.title');
    wrapper.appendChild(title);

    const controls = document.createElement('div');
    controls.className = 'tfr-category-appearance-settings__controls';

    const createSlider = ({ id, label, min, max, value, onChange }) => {
      const field = document.createElement('label');
      field.className = 'tfr-category-appearance-settings__field';
      field.setAttribute('for', id);

      const header = document.createElement('span');
      header.className = 'tfr-category-appearance-settings__label';
      const labelText = document.createElement('strong');
      labelText.textContent = label;
      const valueText = document.createElement('span');
      valueText.textContent = `${value}%`;
      header.appendChild(labelText);
      header.appendChild(valueText);
      field.appendChild(header);

      const input = document.createElement('input');
      input.id = id;
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = '1';
      input.value = String(value);
      input.className = 'tfr-category-appearance-settings__range';
      input.addEventListener('input', (event) => {
        valueText.textContent = `${event.target.value}%`;
      });
      input.addEventListener('change', async (event) => {
        await onChange(event.target.value);
      });
      field.appendChild(input);

      return field;
    };

    const styleField = document.createElement('label');
    styleField.className = 'tfr-category-appearance-settings__field';
    styleField.setAttribute('for', 'tfr-category-color-style');
    const styleHeader = document.createElement('span');
    styleHeader.className = 'tfr-category-appearance-settings__label';
    const styleTitle = document.createElement('strong');
    styleTitle.textContent = t('categoryAppearance.style');
    styleHeader.appendChild(styleTitle);
    styleField.appendChild(styleHeader);
    const categoryStyleValues = [
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
    ];
    styleField.classList.add('tfr-category-appearance-settings__field--visual');
    styleField.appendChild(this.renderVisualStylePicker({
      kind: 'category',
      value: colorStyle,
      values: categoryStyleValues,
      families: this.createAppearanceFamilies('category', categoryStyleValues),
      labelFor: (style) => t(`categoryAppearance.style.${style}`),
      descriptionFor: (style) => t(
        ['gradient', 'rail', 'soft-card', 'outline', 'minimal', 'parent-accent'].includes(style)
          ? `appearance.description.category.${style}`
          : 'appearance.description.category.other'
      ),
      onChange: (nextValue) => this.store.setCategoryColorStyle(nextValue)
    }));
    controls.appendChild(styleField);

    controls.appendChild(createSlider({
      id: 'tfr-category-color-opacity',
      label: t('categoryAppearance.opacity'),
      min: 0,
      max: 30,
      value: opacity,
      onChange: (value) => this.store.setCategoryColorOpacity(value)
    }));

    const intensitySlider = createSlider({
      id: 'tfr-category-color-gradient',
      label: t('categoryAppearance.gradient'),
      min: 0,
      max: 100,
      value: gradient,
      onChange: (value) => this.store.setCategoryColorGradient(value)
    });
    intensitySlider.hidden = !['gradient', 'glow', 'glass', 'soft-neon', 'ink', 'parent-accent'].includes(colorStyle);
    controls.appendChild(intensitySlider);
    wrapper.appendChild(controls);

    const specialColors = this.store.sanitizeSpecialCategoryColors?.(prefs.specialCategoryColors) || {};
    const specialSection = document.createElement('div');
    specialSection.className = 'tfr-special-category-settings';
    const specialTitle = document.createElement('strong');
    specialTitle.textContent = t('categoryAppearance.special');
    specialSection.appendChild(specialTitle);
    specialSection.appendChild(this.renderSpecialCategoryColorControl({
      key: 'recentLive',
      label: t('categoryAppearance.special.recent'),
      color: specialColors.recentLive
    }));
    specialSection.appendChild(this.renderSpecialCategoryColorControl({
      key: 'uncategorized',
      label: t('categoryAppearance.special.uncategorized'),
      color: specialColors.uncategorized
    }));
    wrapper.appendChild(specialSection);

    const hint = document.createElement('p');
    hint.className = 'tfr-category-appearance-settings__hint';
    hint.textContent = t('categoryAppearance.hint');
    wrapper.appendChild(hint);

    return wrapper;
  }

  renderStyleStepper(select, values, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tfr-style-stepper';

    const move = async (direction) => {
      const currentIndex = Math.max(0, values.indexOf(select.value));
      const nextIndex = (currentIndex + direction + values.length) % values.length;
      const nextValue = values[nextIndex];
      select.value = nextValue;
      await onChange(nextValue);
      this.render();
    };

    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'tfr-style-stepper__button';
    previous.textContent = '<';
    previous.title = t('styleStepper.previous');
    previous.setAttribute('aria-label', t('styleStepper.previous'));
    previous.addEventListener('click', (event) => {
      event.preventDefault();
      move(-1);
    });

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'tfr-style-stepper__button';
    next.textContent = '>';
    next.title = t('styleStepper.next');
    next.setAttribute('aria-label', t('styleStepper.next'));
    next.addEventListener('click', (event) => {
      event.preventDefault();
      move(1);
    });

    wrapper.appendChild(previous);
    wrapper.appendChild(select);
    wrapper.appendChild(next);
    return wrapper;
  }

  renderVisualStylePicker({
    kind,
    value,
    values,
    families = [],
    labelFor,
    descriptionFor,
    onChange
  }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tfr-radial-style-picker';
    const persistedState = this.appearanceRadialState[kind] || {};
    let activeFamily = families.find((family) => family.id === persistedState.familyId)
      || families.find((family) => family.values.includes(value))
      || families[0];
    let activeMode = persistedState.mode === 'styles' ? 'styles' : 'families';
    let previewValue = value;

    const radial = document.createElement('div');
    radial.className = 'tfr-radial-style-picker__stage';
    const orbit = document.createElement('div');
    orbit.className = 'tfr-radial-style-picker__orbit';
    const center = document.createElement('div');
    center.className = 'tfr-radial-style-picker__center';
    center.tabIndex = 0;
    const centerKicker = document.createElement('span');
    centerKicker.className = 'tfr-radial-style-picker__kicker';
    const centerTitle = document.createElement('strong');
    centerTitle.className = 'tfr-radial-style-picker__title';
    const centerDescription = document.createElement('span');
    centerDescription.className = 'tfr-radial-style-picker__description';
    center.append(centerKicker, centerTitle, centerDescription);
    radial.append(orbit, center);
    wrapper.appendChild(radial);

    const updateCenter = (style = previewValue) => {
      centerKicker.textContent = activeFamily?.label || '';
      centerTitle.textContent = labelFor(style);
      centerDescription.textContent = descriptionFor(style);
    };

    const renderOrbit = (mode = 'families') => {
      orbit.textContent = '';
      const items = mode === 'families'
        ? families.map((family) => ({
            id: family.id,
            label: family.label,
            role: 'submenu',
            icon: '\u203A',
            selected: family === activeFamily,
            onClick: () => {
              activeFamily = family;
              activeMode = 'styles';
              this.appearanceRadialState[kind] = {
                familyId: family.id,
                mode: activeMode
              };
              previewValue = family.values.includes(value) ? value : family.values[0];
              updateCenter(previewValue);
              renderOrbit(activeMode);
            },
            onPreview: () => {
              centerKicker.textContent = t('appearance.radial.family');
              centerTitle.textContent = family.label;
              centerDescription.textContent = family.description;
            }
          }))
        : [
            {
              id: 'back',
              label: t('appearance.radial.back'),
              role: 'navigation',
              icon: '\u2190',
              selected: false,
              onClick: () => {
                activeMode = 'families';
                this.appearanceRadialState[kind] = {
                  familyId: activeFamily.id,
                  mode: activeMode
                };
                updateCenter(value);
                renderOrbit(activeMode);
              },
              onPreview: () => updateCenter(value)
            },
            ...activeFamily.values.map((style) => ({
              id: style,
              label: labelFor(style),
              role: 'action',
              icon: style === value ? '\u2713' : '\u2192',
              selected: style === value,
              onClick: async () => {
                if (style === value) return;
                this.appearanceRadialState[kind] = {
                  familyId: activeFamily.id,
                  mode: 'styles'
                };
                await onChange(style);
                this.render();
              },
              onPreview: () => updateCenter(style)
            }))
          ];

      items.forEach((item, index) => {
        const angle = (360 / items.length) * index - 90;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tfr-radial-style-picker__item';
        button.dataset.kind = kind;
        button.dataset.value = item.id;
        button.dataset.role = item.role;
        button.classList.toggle('is-selected', item.selected);
        button.style.setProperty('--tfr-radial-angle', `${angle}deg`);
        button.setAttribute('aria-pressed', String(item.selected));
        const label = document.createElement('span');
        label.className = 'tfr-radial-style-picker__item-label';
        label.textContent = item.label;
        const icon = document.createElement('span');
        icon.className = 'tfr-radial-style-picker__item-icon';
        icon.textContent = item.icon;
        icon.setAttribute('aria-hidden', 'true');
        button.append(label, icon);
        button.addEventListener('mouseenter', item.onPreview);
        button.addEventListener('focus', item.onPreview);
        button.addEventListener('mouseleave', () => updateCenter(previewValue));
        button.addEventListener('click', item.onClick);
        orbit.appendChild(button);
      });
    };

    const fallback = document.createElement('select');
    fallback.className = 'tfr-radial-style-picker__fallback tfr-streamer-appearance-settings__select';
    fallback.setAttribute('aria-label', t('appearance.radial.fallback'));
    values.forEach((style) => {
      const option = document.createElement('option');
      option.value = style;
      option.textContent = labelFor(style);
      fallback.appendChild(option);
    });
    fallback.value = value;
    fallback.addEventListener('change', async (event) => {
      await onChange(event.target.value);
      this.render();
    });
    wrapper.appendChild(fallback);

    const legend = document.createElement('div');
    legend.className = 'tfr-radial-style-picker__legend';
    legend.innerHTML = `
      <span data-role="submenu"><i></i>${t('appearance.radial.legend.submenu')}</span>
      <span data-role="action"><i></i>${t('appearance.radial.legend.apply')}</span>
      <span data-role="navigation"><i></i>${t('appearance.radial.legend.navigation')}</span>
    `;
    wrapper.appendChild(legend);

    updateCenter(value);
    renderOrbit(activeMode);
    return wrapper;
  }

  createAppearanceFamilies(kind, values) {
    const definitions = {
      category: [
        ['classic', ['gradient', 'solid', 'soft-card', 'glass']],
        ['lines', ['stripe', 'outline', 'rail', 'double']],
        ['light', ['minimal', 'dot', 'compact', 'count-badge']],
        ['effects', ['glow', 'soft-neon', 'ribbon', 'ink', 'parent-accent']]
      ],
      streamer: [
        ['classic', ['default', 'card', 'soft-card', 'glass']],
        ['compact', ['compact', 'minimal', 'viewer-badge']],
        ['avatar', ['avatar-ring', 'avatar-square', 'avatar-grid']],
        ['focus', ['game-focus', 'title-focus', 'left-line', 'outline']],
        ['effects', ['neon']]
      ],
      surface: [
        ['classic', ['default', 'full', 'panel', 'connected']],
        ['lines', ['rail', 'edge']],
        ['depth', ['layers', 'canvas', 'poster']],
        ['effects', ['glow', 'spectrum', 'pulse', 'arcade']]
      ]
    };
    return (definitions[kind] || []).map(([id, familyValues]) => ({
      id,
      label: t(`appearance.family.${id}`),
      description: t(`appearance.family.${id}.description`),
      values: familyValues.filter((style) => values.includes(style))
    })).filter((family) => family.values.length);
  }

  renderSpecialCategoryColorControl({ key, label, color }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tfr-special-category-color';
    wrapper.appendChild(this.renderCategoryColorPickerControl({
      label,
      currentColor: color,
      onApply: (nextColor) => this.store.setSpecialCategoryColor(key, nextColor),
      onClear: () => this.store.setSpecialCategoryColor(key, '')
    }));
    return wrapper;
  }

  renderStreamerAppearanceSettings(state) {
    const prefs = state.preferences || {};
    const streamerStyle = this.store.sanitizeStreamerItemStyle?.(prefs.streamerItemStyle) || 'default';
    const autoCompactStyle = this.store.sanitizeStreamerItemStyle?.(prefs.autoCompactStreamerStyle || 'compact') || 'compact';
    const autoCompactGroupStyle = this.store.sanitizeAutoCompactGroupStyle?.(prefs.autoCompactGroupStyle) || 'default';
    const animationStyle = this.store.sanitizeSidebarAnimationStyle?.(prefs.sidebarAnimationStyle) || 'soft';

    const wrapper = document.createElement('section');
    wrapper.className = 'tfr-streamer-appearance-settings';

    const title = document.createElement('h3');
    title.className = 'tfr-streamer-appearance-settings__title';
    title.textContent = t('streamerAppearance.title');
    wrapper.appendChild(title);

    const field = document.createElement('label');
    field.className = 'tfr-streamer-appearance-settings__field';
    field.setAttribute('for', 'tfr-streamer-item-style');
    const label = document.createElement('span');
    label.className = 'tfr-streamer-appearance-settings__label';
    const labelText = document.createElement('strong');
    labelText.textContent = t('streamerAppearance.style');
    label.appendChild(labelText);
    field.appendChild(label);

    const streamerStyleValues = [
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
      'minimal',
      'avatar-grid'
    ];
    field.classList.add('tfr-streamer-appearance-settings__field--visual');
    field.appendChild(this.renderVisualStylePicker({
      kind: 'streamer',
      value: streamerStyle,
      values: streamerStyleValues,
      families: this.createAppearanceFamilies('streamer', streamerStyleValues),
      labelFor: (style) => t(`streamerAppearance.style.${style}`),
      descriptionFor: (style) => t(
        ['default', 'soft-card', 'compact', 'minimal', 'avatar-ring', 'avatar-grid'].includes(style)
          ? `appearance.description.streamer.${style}`
          : 'appearance.description.streamer.other'
      ),
      onChange: (nextValue) => this.store.setStreamerItemStyle(nextValue)
    }));
    wrapper.appendChild(field);

    const advanced = document.createElement('details');
    advanced.className = 'tfr-appearance-advanced';
    const advancedSummary = document.createElement('summary');
    advancedSummary.textContent = t('streamerAppearance.advanced');
    advanced.appendChild(advancedSummary);

    const compactField = document.createElement('label');
    compactField.className = 'tfr-streamer-appearance-settings__field';
    compactField.setAttribute('for', 'tfr-auto-compact-streamer-style');
    const compactLabel = document.createElement('span');
    compactLabel.className = 'tfr-streamer-appearance-settings__label';
    const compactLabelText = document.createElement('strong');
    compactLabelText.textContent = t('streamerAppearance.autoCompactStyle');
    compactLabel.appendChild(compactLabelText);
    compactField.appendChild(compactLabel);

    const compactSelect = document.createElement('select');
    compactSelect.id = 'tfr-auto-compact-streamer-style';
    compactSelect.className = 'tfr-streamer-appearance-settings__select';
    streamerStyleValues.forEach((style) => {
      const option = document.createElement('option');
      option.value = style;
      option.textContent = t(`streamerAppearance.style.${style}`);
      compactSelect.appendChild(option);
    });
    compactSelect.value = autoCompactStyle;
    compactSelect.addEventListener('change', async (event) => {
      await this.store.setAutoCompactStreamerStyle(event.target.value);
      this.render();
    });
    compactField.appendChild(this.renderStyleStepper(
      compactSelect,
      streamerStyleValues,
      (nextValue) => this.store.setAutoCompactStreamerStyle(nextValue)
    ));
    const compactHint = document.createElement('small');
    compactHint.className = 'tfr-appearance-field-hint';
    compactHint.textContent = t(
      autoCompactStyle === 'avatar-grid'
        ? 'appearance.advanced.compact.avatarGridHint'
        : autoCompactStyle === 'compact'
          ? 'appearance.advanced.compact.compactHint'
          : 'appearance.advanced.compact.hint'
    );
    compactField.appendChild(compactHint);
    advanced.appendChild(compactField);

    const compactGroupField = document.createElement('label');
    compactGroupField.className = 'tfr-streamer-appearance-settings__field';
    compactGroupField.setAttribute('for', 'tfr-auto-compact-group-style');
    const compactGroupLabel = document.createElement('span');
    compactGroupLabel.className = 'tfr-streamer-appearance-settings__label';
    const compactGroupLabelText = document.createElement('strong');
    compactGroupLabelText.textContent = t('streamerAppearance.autoCompactGroupStyle');
    compactGroupLabel.appendChild(compactGroupLabelText);
    compactGroupField.appendChild(compactGroupLabel);

    const compactGroupValues = ['default', 'dense', 'vertical'];
    const compactGroupSelect = document.createElement('select');
    compactGroupSelect.id = 'tfr-auto-compact-group-style';
    compactGroupSelect.className = 'tfr-streamer-appearance-settings__select';
    compactGroupValues.forEach((style) => {
      const option = document.createElement('option');
      option.value = style;
      option.textContent = t(`streamerAppearance.groupStyle.${style}`);
      compactGroupSelect.appendChild(option);
    });
    compactGroupSelect.value = autoCompactGroupStyle;
    compactGroupSelect.addEventListener('change', async (event) => {
      await this.store.setAutoCompactGroupStyle(event.target.value);
      this.render();
    });
    compactGroupField.appendChild(this.renderStyleStepper(
      compactGroupSelect,
      compactGroupValues,
      (nextValue) => this.store.setAutoCompactGroupStyle(nextValue)
    ));
    const compactGroupHint = document.createElement('small');
    compactGroupHint.className = 'tfr-appearance-field-hint';
    compactGroupHint.textContent = t('appearance.advanced.groupLayout.hint');
    compactGroupField.appendChild(compactGroupHint);
    advanced.appendChild(compactGroupField);

    const animationField = document.createElement('label');
    animationField.className = 'tfr-streamer-appearance-settings__field';
    animationField.setAttribute('for', 'tfr-sidebar-animation-style');
    const animationLabel = document.createElement('span');
    animationLabel.className = 'tfr-streamer-appearance-settings__label';
    const animationLabelText = document.createElement('strong');
    animationLabelText.textContent = t('streamerAppearance.animationStyle');
    animationLabel.appendChild(animationLabelText);
    animationField.appendChild(animationLabel);

    const animationValues = ['none', 'soft', 'slide', 'pop', 'glow', 'fly', 'bounce', 'spin', 'glitch'];
    const animationSelect = document.createElement('select');
    animationSelect.id = 'tfr-sidebar-animation-style';
    animationSelect.className = 'tfr-streamer-appearance-settings__select';
    animationValues.forEach((style) => {
      const option = document.createElement('option');
      option.value = style;
      option.textContent = t(`streamerAppearance.animation.${style}`);
      animationSelect.appendChild(option);
    });
    animationSelect.value = animationStyle;
    animationSelect.addEventListener('change', async (event) => {
      await this.store.setSidebarAnimationStyle(event.target.value);
      this.previewSidebarAnimation();
      this.render();
    });
    animationField.appendChild(this.renderStyleStepper(
      animationSelect,
      animationValues,
      async (nextValue) => {
        await this.store.setSidebarAnimationStyle(nextValue);
        this.previewSidebarAnimation();
      }
    ));
    const animationHint = document.createElement('small');
    animationHint.className = 'tfr-appearance-field-hint';
    animationHint.textContent = t('appearance.advanced.animation.hint');
    animationField.appendChild(animationHint);
    advanced.appendChild(animationField);

    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.className = 'tfr-secondary-button';
    previewButton.textContent = t('streamerAppearance.animationPreview');
    previewButton.addEventListener('click', () => this.previewSidebarAnimation());
    advanced.appendChild(previewButton);
    wrapper.appendChild(advanced);

    const hint = document.createElement('p');
    hint.className = 'tfr-streamer-appearance-settings__hint';
    hint.textContent = t('streamerAppearance.hint');
    wrapper.appendChild(hint);

    return wrapper;
  }

  previewSidebarAnimation() {
    window.dispatchEvent(new CustomEvent('tfr:previewSidebarAnimation'));
  }

  renderSidebarSurfaceSettings(state) {
    const prefs = state.preferences || {};
    const surfaceStyle = this.store.sanitizeSidebarSurfaceStyle?.(prefs.sidebarSurfaceStyle) || 'default';

    const wrapper = document.createElement('section');
    wrapper.className = 'tfr-streamer-appearance-settings tfr-sidebar-surface-settings';

    const title = document.createElement('h3');
    title.className = 'tfr-streamer-appearance-settings__title';
    title.textContent = t('sidebarSurface.title');
    wrapper.appendChild(title);

    const field = document.createElement('label');
    field.className = 'tfr-streamer-appearance-settings__field';
    field.setAttribute('for', 'tfr-sidebar-surface-style');
    const label = document.createElement('span');
    label.className = 'tfr-streamer-appearance-settings__label';
    const labelText = document.createElement('strong');
    labelText.textContent = t('sidebarSurface.style');
    label.appendChild(labelText);
    field.appendChild(label);

    const surfaceStyleValues = [
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
    ];
    field.classList.add('tfr-streamer-appearance-settings__field--visual');
    field.appendChild(this.renderVisualStylePicker({
      kind: 'surface',
      value: surfaceStyle,
      values: surfaceStyleValues,
      families: this.createAppearanceFamilies('surface', surfaceStyleValues),
      labelFor: (style) => t(`sidebarSurface.style.${style}`),
      descriptionFor: (style) => t(
        ['default', 'panel', 'rail', 'full', 'glow', 'canvas'].includes(style)
          ? `appearance.description.surface.${style}`
          : 'appearance.description.surface.other'
      ),
      onChange: (nextValue) => this.store.setSidebarSurfaceStyle(nextValue)
    }));
    wrapper.appendChild(field);

    wrapper.appendChild(this.renderCategoryColorPickerControl({
      label: t('sidebarSurface.color'),
      currentColor: prefs.sidebarSurfaceColor,
      onApply: (nextColor) => this.store.setSidebarSurfaceColor(nextColor),
      onClear: () => this.store.setSidebarSurfaceColor('')
    }));

    const hint = document.createElement('p');
    hint.className = 'tfr-streamer-appearance-settings__hint';
    hint.textContent = t('sidebarSurface.hint');
    wrapper.appendChild(hint);

    return wrapper;
  }

  createToastToggle(labelKey, checked) {
    const label = document.createElement('label');
    label.className = 'tfr-toast-settings__toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(checked);
    input.className = 'tfr-toast-settings__checkbox';
    const text = document.createElement('span');
    text.textContent = t(labelKey);
    label.append(input, text);
    return { label, input };
  }

  validateToastSoundFile(file) {
    if (!file) return 'toast.settings.customSoundInvalid';
    const hasAudioType = /^audio\//i.test(file.type || '');
    const hasAudioExtension = /\.(mp3|wav|ogg|webm)$/i.test(file.name || '');
    if (!hasAudioType && !hasAudioExtension) return 'toast.settings.customSoundInvalid';
    return file.size > 1_048_576 ? 'toast.settings.customSoundTooLarge' : '';
  }

  readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(String(reader.result || '')));
      reader.addEventListener('error', () => resolve(''));
      reader.readAsDataURL(file);
    });
  }

  dispatchToastTestSound({ soundId, volume, customSoundDataUrl = '' }) {
    window.dispatchEvent(new CustomEvent('TFR_TEST_TOAST_SOUND', {
      detail: { soundId, volume: Number(volume), customSoundDataUrl }
    }));
  }

  setToastControlsEnabled(enabled, controls, container) {
    controls.forEach((control) => {
      control.disabled = !enabled;
    });
    container?.classList.toggle('is-disabled', !enabled);
  }

  async importToastSound(file, volume) {
    const validationError = this.validateToastSoundFile(file);
    if (validationError) {
      this.toastSoundMessage = t(validationError);
      this.render();
      return false;
    }
    const dataUrl = await this.readFileAsDataUrl(file);
    if (!dataUrl) {
      this.toastSoundMessage = t('toast.settings.customSoundInvalid');
      this.render();
      return false;
    }
    await this.store.setToastCustomSound({ name: file.name, dataUrl });
    this.toastSoundMessage = '';
    this.render();
    this.dispatchToastTestSound({ soundId: 'custom', volume, customSoundDataUrl: dataUrl });
    return true;
  }

  renderToastSettings(state) {
    const prefs = state.preferences || {};
    const wrapper = document.createElement('section');
    wrapper.className = 'tfr-toast-settings';

    const title = document.createElement('h3');
    title.className = 'tfr-toast-settings__title';
    title.textContent = t('toast.settings.title');
    wrapper.appendChild(title);

    const { label: enabledLabel, input: enabledInput } = this.createToastToggle(
      'toast.settings.enabled', prefs.toastEnabled !== false
    );
    wrapper.appendChild(enabledLabel);

    const controls = document.createElement('div');
    controls.className = 'tfr-toast-settings__controls tfr-toast-settings__controls--visual';
    const label = document.createElement('label');
    label.textContent = t('toast.settings.durationLabel');
    controls.appendChild(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '2';
    input.max = '60';
    const current = Number.isFinite(Number(prefs.toastDurationSeconds))
      ? Math.max(2, Math.min(60, Math.round(Number(prefs.toastDurationSeconds))))
      : 6;
    input.value = String(current);
    input.className = 'tfr-toast-settings__input';
    const inputId = 'tfr-toast-settings-duration';
    input.id = inputId;
    label.setAttribute('for', inputId);
    controls.appendChild(input);

    const unit = document.createElement('span');
    unit.textContent = t('toast.settings.durationUnit');
    controls.appendChild(unit);

    wrapper.appendChild(controls);

    const positionControls = document.createElement('div');
    positionControls.className = 'tfr-toast-settings__controls tfr-toast-settings__controls--visual';
    const positionLabel = document.createElement('label');
    positionLabel.textContent = t('toast.settings.positionLabel');
    positionControls.appendChild(positionLabel);
    const positionSelect = document.createElement('select');
    positionSelect.className = 'tfr-toast-settings__select';
    const currentPosition = typeof prefs.toastPosition === 'string' ? prefs.toastPosition : 'top-right';
    [
      'top-left',
      'top-center',
      'top-right',
      'bottom-left',
      'bottom-center',
      'bottom-right'
    ].forEach((position) => {
      const option = document.createElement('option');
      option.value = position;
      option.textContent = t(`toast.settings.position.${position}`);
      positionSelect.appendChild(option);
    });
    positionSelect.value = currentPosition;
    const positionSelectId = 'tfr-toast-settings-position';
    positionSelect.id = positionSelectId;
    positionLabel.setAttribute('for', positionSelectId);
    positionControls.appendChild(positionSelect);
    wrapper.appendChild(positionControls);

    const hint = document.createElement('p');
    hint.className = 'tfr-toast-settings__hint';
    hint.textContent = t('toast.settings.hint');
    wrapper.appendChild(hint);

    const applyEnabledState = () => {
      this.setToastControlsEnabled(enabledInput.checked, [input, positionSelect], wrapper);
    };
    applyEnabledState();

    enabledInput.addEventListener('change', async (event) => {
      await this.store.setToastEnabled(Boolean(event.target.checked));
      applyEnabledState();
      this.render();
    });

    input.addEventListener('change', async (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) {
        event.target.value = String(current);
        return;
      }
      const sanitized = Math.max(2, Math.min(60, Math.round(value)));
      event.target.value = String(sanitized);
      await this.store.setToastDuration(sanitized);
      this.render();
    });

    positionSelect.addEventListener('change', async (event) => {
      await this.store.setToastPosition(event.target.value);
      this.render();
    });

    const { label: soundLabel, input: soundInput } = this.createToastToggle(
      'toast.settings.soundEnabled', prefs.toastSoundEnabled === true
    );
    wrapper.appendChild(soundLabel);

    const soundControls = document.createElement('div');
    soundControls.className = 'tfr-toast-settings__controls tfr-toast-settings__controls--sound';
    const soundSelectLabel = document.createElement('label');
    soundSelectLabel.textContent = t('toast.settings.soundLabel');
    soundControls.appendChild(soundSelectLabel);
    const soundSelect = document.createElement('select');
    soundSelect.className = 'tfr-toast-settings__select';
    const currentSound = typeof prefs.toastSoundId === 'string' ? prefs.toastSoundId : 'soft';
    ['soft', 'chime', 'arcade', 'pulse', 'alert', 'custom'].forEach((soundId) => {
      const option = document.createElement('option');
      option.value = soundId;
      option.textContent = t(`toast.settings.sound.${soundId}`);
      if (soundId === 'custom' && !prefs.toastCustomSoundDataUrl) {
        option.disabled = true;
      }
      soundSelect.appendChild(option);
    });
    soundSelect.value = currentSound === 'custom' && !prefs.toastCustomSoundDataUrl ? 'soft' : currentSound;
    const soundSelectId = 'tfr-toast-settings-sound';
    soundSelect.id = soundSelectId;
    soundSelectLabel.setAttribute('for', soundSelectId);
    soundControls.appendChild(soundSelect);

    const volumeLabel = document.createElement('label');
    volumeLabel.textContent = t('toast.settings.volumeLabel');
    soundControls.appendChild(volumeLabel);
    const volumeInput = document.createElement('input');
    volumeInput.type = 'range';
    volumeInput.min = '0';
    volumeInput.max = '100';
    volumeInput.step = '1';
    volumeInput.value = String(Number.isFinite(Number(prefs.toastSoundVolume)) ? prefs.toastSoundVolume : 35);
    volumeInput.className = 'tfr-toast-settings__range';
    const volumeId = 'tfr-toast-settings-volume';
    volumeInput.id = volumeId;
    volumeLabel.setAttribute('for', volumeId);
    soundControls.appendChild(volumeInput);
    const volumeValue = document.createElement('span');
    volumeValue.className = 'tfr-toast-settings__value';
    volumeValue.textContent = `${volumeInput.value}%`;
    soundControls.appendChild(volumeValue);

    const testSoundButton = document.createElement('button');
    testSoundButton.type = 'button';
    testSoundButton.className = 'tfr-button tfr-button--ghost tfr-toast-settings__test';
    testSoundButton.textContent = t('toast.settings.testSound');
    soundControls.appendChild(testSoundButton);
    wrapper.appendChild(soundControls);

    const customSoundControls = document.createElement('div');
    customSoundControls.className = 'tfr-toast-settings__custom-sound';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm';
    fileInput.className = 'tfr-toast-settings__file';
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'tfr-button tfr-button--ghost';
    importButton.textContent = t('toast.settings.importSound');
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'tfr-button tfr-button--ghost';
    removeButton.textContent = t('toast.settings.removeSound');
    removeButton.disabled = !prefs.toastCustomSoundDataUrl;
    const customInfo = document.createElement('span');
    customInfo.className = 'tfr-toast-settings__custom-info';
    customInfo.textContent = prefs.toastCustomSoundName || t('toast.settings.customSoundEmpty');
    const customHint = document.createElement('small');
    customHint.className = 'tfr-toast-settings__hint';
    customHint.textContent = t('toast.settings.customSoundLimit');
    const customMessage = document.createElement('small');
    customMessage.className = 'tfr-toast-settings__message';
    customMessage.textContent = this.toastSoundMessage;
    customMessage.hidden = !this.toastSoundMessage;
    customSoundControls.appendChild(fileInput);
    customSoundControls.appendChild(importButton);
    customSoundControls.appendChild(removeButton);
    customSoundControls.appendChild(customInfo);
    customSoundControls.appendChild(customHint);
    customSoundControls.appendChild(customMessage);
    wrapper.appendChild(customSoundControls);

    const playTestSound = () => {
      this.dispatchToastTestSound({
        soundId: soundSelect.value,
        volume: volumeInput.value,
        customSoundDataUrl: prefs.toastCustomSoundDataUrl
      });
    };

    const applySoundEnabledState = () => {
      this.setToastControlsEnabled(
        soundInput.checked,
        [soundSelect, volumeInput, testSoundButton],
        soundControls
      );
    };
    applySoundEnabledState();

    soundInput.addEventListener('change', async (event) => {
      await this.store.setToastSoundEnabled(Boolean(event.target.checked));
      applySoundEnabledState();
      this.render();
    });

    soundSelect.addEventListener('change', async (event) => {
      await this.store.setToastSound(event.target.value);
      playTestSound();
      this.render();
    });

    importButton.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) {
        return;
      }
      await this.importToastSound(file, volumeInput.value);
    });

    removeButton.addEventListener('click', async () => {
      await this.store.clearToastCustomSound();
      this.toastSoundMessage = '';
      this.render();
    });

    volumeInput.addEventListener('input', (event) => {
      volumeValue.textContent = `${event.target.value}%`;
    });

    volumeInput.addEventListener('change', async (event) => {
      const value = Number(event.target.value);
      const sanitized = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 35;
      event.target.value = String(sanitized);
      volumeValue.textContent = `${sanitized}%`;
      await this.store.setToastSoundVolume(sanitized);
      playTestSound();
    });

    testSoundButton.addEventListener('click', playTestSound);

    return wrapper;
  }

  isFeatureEnabled(config, preferences) {
    if (!config) return false;
    return config?.defaultEnabled === false
      ? preferences[config.key] === true
      : preferences[config.key] !== false;
  }

  createFeatureToggle(config, preferences) {
    const item = document.createElement('label');
    item.className = 'tfr-feature-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.isFeatureEnabled(config, preferences);
    input.className = 'tfr-feature-toggle__input';
    const body = document.createElement('span');
    body.className = 'tfr-feature-toggle__body';
    const label = document.createElement('strong');
    label.textContent = config.label;
    const description = document.createElement('small');
    description.textContent = config.description;
    body.append(label, description);
    input.addEventListener('change', (event) => {
      this.applyFeatureToggle(config.setter, Boolean(event.target.checked));
    });
    item.append(input, body);
    return item;
  }

  async applyFeatureToggle(setter, enabled) {
    if (typeof setter !== 'string' || !/^set[A-Z][A-Za-z]+(?:Enabled|Hover)$/.test(setter)) return false;
    const update = this.store[setter];
    if (typeof update !== 'function') return false;
    await update.call(this.store, enabled);
    this.render();
    return true;
  }

  createFeatureCard(group, toggles, preferences) {
    const card = document.createElement('details');
    card.className = 'tfr-feature-card';
    card.open = this.featureCardsOpen.has(group.id);
    card.addEventListener('toggle', () => {
      if (card.open) this.featureCardsOpen.add(group.id);
      else this.featureCardsOpen.delete(group.id);
    });

    const summary = document.createElement('summary');
    summary.className = 'tfr-feature-card__summary';
    const summaryBody = document.createElement('span');
    summaryBody.className = 'tfr-feature-card__summary-body';
    const title = document.createElement('strong');
    title.textContent = group.title;
    const description = document.createElement('small');
    description.textContent = group.description;
    summaryBody.append(title, description);

    const activeCount = group.keys.filter((key) => {
      const config = toggles.find((toggle) => toggle.key === key);
      return this.isFeatureEnabled(config, preferences);
    }).length;
    const status = document.createElement('span');
    status.className = 'tfr-feature-card__status';
    status.textContent = activeCount
      ? t('settings.enhancements.activeCount', { count: activeCount })
      : t('settings.enhancements.noneActive');
    const action = document.createElement('span');
    action.className = 'tfr-feature-card__action';
    action.textContent = t('settings.enhancements.configure');
    summary.append(summaryBody, status, action);

    const body = document.createElement('div');
    body.className = 'tfr-feature-card__body';
    card.append(summary, body);
    return { card, body };
  }

  playFeatureTestSound(soundId) {
    const audioFactory = globalThis.__TFR_TOAST_AUDIO__?.createToastAudio;
    const audio = audioFactory?.({
      AudioContextConstructor: window.AudioContext || window.webkitAudioContext,
      AudioConstructor: window.Audio
    });
    audio?.play({ soundId, volume: 35 });
  }

  createMentionSettings(preferences) {
    const enabled = preferences.chatMentionHighlightEnabled === true;
    const soundEnabled = preferences.chatMentionSoundEnabled === true;
    const controls = document.createElement('div');
    controls.className = 'tfr-chat-mention-settings';
    controls.classList.toggle('is-disabled', !enabled);

    const colorLabel = document.createElement('label');
    colorLabel.className = 'tfr-chat-mention-settings__color';
    const colorText = document.createElement('strong');
    colorText.textContent = t('settings.chatMentions.color');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = /^#[0-9a-f]{6}$/i.test(preferences.chatMentionHighlightColor || '')
      ? preferences.chatMentionHighlightColor
      : '#9147ff';
    colorInput.disabled = !enabled;
    colorInput.addEventListener('change', (event) => this.store.setChatMentionHighlightColor(event.target.value));
    colorLabel.append(colorText, colorInput);

    const soundLabel = document.createElement('label');
    soundLabel.className = 'tfr-chat-mention-settings__sound';
    const soundInput = document.createElement('input');
    soundInput.type = 'checkbox';
    soundInput.checked = soundEnabled;
    soundInput.disabled = !enabled;
    const soundText = document.createElement('strong');
    soundText.textContent = t('settings.chatMentions.sound');
    soundInput.addEventListener('change', async (event) => {
      await this.store.setChatMentionSoundEnabled(event.target.checked);
      this.render();
    });
    soundLabel.append(soundInput, soundText);

    const soundSelect = document.createElement('select');
    soundSelect.disabled = !enabled || !soundEnabled;
    ['soft', 'chime', 'arcade', 'pulse', 'alert'].forEach((soundId) => {
      const option = document.createElement('option');
      option.value = soundId;
      option.textContent = t(`toast.settings.sound.${soundId}`);
      option.selected = (preferences.chatMentionSoundId || 'soft') === soundId;
      soundSelect.appendChild(option);
    });
    soundSelect.addEventListener('change', (event) => this.store.setChatMentionSoundId(event.target.value));

    const testButton = document.createElement('button');
    testButton.type = 'button';
    testButton.className = 'tfr-chat-mention-settings__test';
    testButton.textContent = t('settings.chatMentions.testSound');
    testButton.disabled = !enabled || !soundEnabled;
    testButton.addEventListener('click', () => this.playFeatureTestSound(soundSelect.value));

    const preview = document.createElement('div');
    preview.className = 'tfr-chat-mention-settings__preview';
    preview.style.setProperty('--tfr-chat-mention-preview-color', colorInput.value);
    preview.textContent = t('settings.chatMentions.preview');
    colorInput.addEventListener('input', (event) => {
      preview.style.setProperty('--tfr-chat-mention-preview-color', event.target.value);
    });

    controls.append(colorLabel, soundLabel, soundSelect, testButton, preview);
    return controls;
  }

  normalizeChatPaddingPx(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(20, Math.round(parsed))) : 0;
  }

  createChatPaddingSettings(preferences) {
    const enabled = preferences.chatNoPaddingEnabled === true;
    const value = this.normalizeChatPaddingPx(preferences.chatPaddingPx);
    const choice = document.createElement('label');
    choice.className = 'tfr-chat-padding-choice';
    choice.classList.toggle('is-disabled', !enabled);

    const heading = document.createElement('span');
    heading.className = 'tfr-chat-padding-choice__heading';
    const title = document.createElement('strong');
    title.textContent = t('settings.chatPadding.amount');
    const output = document.createElement('output');
    output.className = 'tfr-chat-padding-choice__value';
    output.textContent = `${value} px`;
    heading.append(title, output);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '20';
    input.step = '1';
    input.value = String(value);
    input.disabled = !enabled;
    input.addEventListener('input', (event) => {
      const nextValue = this.normalizeChatPaddingPx(event.target.value);
      output.textContent = `${nextValue} px`;
      document.documentElement.style.setProperty('--tfr-chat-padding', `${nextValue}px`);
    });
    input.addEventListener('change', (event) => {
      this.store.setChatPaddingPx(this.normalizeChatPaddingPx(event.target.value));
    });

    choice.append(heading, input);
    return choice;
  }

  renderFeatureToggles(state) {
    const prefs = state.preferences || {};
    const wrapper = document.createElement('section');
    wrapper.className = 'tfr-feature-toggles';

    const heading = document.createElement('div');
    heading.className = 'tfr-feature-dashboard__heading';
    const headingTitle = document.createElement('h3');
    headingTitle.textContent = t('settings.enhancements.title');
    const headingHint = document.createElement('p');
    headingHint.textContent = t('settings.enhancements.description');
    heading.append(headingTitle, headingHint);
    wrapper.appendChild(heading);

    const toggles = [
      {
        key: 'liveFavoritesEnabled',
        label: t('settings.liveSidebar.toggle'),
        description: t('settings.liveSidebar.description'),
        setter: 'setLiveFavoritesEnabled'
      },
      {
        key: 'chatHistoryEnabled',
        label: t('settings.chatHistory.toggle'),
        description: t('settings.chatHistory.description'),
        setter: 'setChatHistoryEnabled'
      },
      {
        key: 'moderationHistoryEnabled',
        label: t('settings.moderation.toggle'),
        description: t('settings.moderation.description'),
        setter: 'setModerationHistoryEnabled'
      },
      {
        key: 'sevenTvEmotesEnabled',
        defaultEnabled: false,
        label: t('settings.sevenTv.toggle'),
        description: t('settings.sevenTv.description'),
        setter: 'setSevenTvEmotesEnabled'
      },
      {
        key: 'betterTtvEmotesEnabled',
        defaultEnabled: false,
        label: t('settings.betterTtv.toggle'),
        description: t('settings.betterTtv.description'),
        setter: 'setBetterTtvEmotesEnabled'
      },
      {
        key: 'playerLatencyEnabled',
        defaultEnabled: false,
        label: t('settings.playerLatency.toggle'),
        description: t('settings.playerLatency.description'),
        setter: 'setPlayerLatencyEnabled'
      },
      {
        key: 'chatFontEnabled',
        defaultEnabled: false,
        label: t('settings.chatFont.toggle'),
        description: t('settings.chatFont.description'),
        setter: 'setChatFontEnabled'
      },
      {
        key: 'chatNoPaddingEnabled',
        defaultEnabled: false,
        label: t('settings.chatPadding.toggle'),
        description: t('settings.chatPadding.description'),
        setter: 'setChatNoPaddingEnabled'
      },
      {
        key: 'chatMentionHighlightEnabled',
        defaultEnabled: false,
        label: t('settings.chatMentions.toggle'),
        description: t('settings.chatMentions.description'),
        setter: 'setChatMentionHighlightEnabled'
      },
      {
        key: 'showDeletedMessagesEnabled',
        defaultEnabled: false,
        label: t('settings.deletedMessages.toggle'),
        description: t('settings.deletedMessages.description'),
        setter: 'setShowDeletedMessagesEnabled'
      },
      {
        key: 'showFullRepliesEnabled',
        defaultEnabled: false,
        label: t('settings.fullReplies.toggle'),
        description: t('settings.fullReplies.description'),
        setter: 'setShowFullRepliesEnabled'
      },
      {
        key: 'hideCollapsedGroupsUntilHover',
        defaultEnabled: false,
        label: t('settings.collapsedGroups.toggle'),
        description: t('settings.collapsedGroups.description'),
        setter: 'setHideCollapsedGroupsUntilHover'
      },
      {
        key: 'autoCompactSidebarEnabled',
        defaultEnabled: false,
        label: t('settings.autoCompactSidebar.toggle'),
        description: t('settings.autoCompactSidebar.description'),
        setter: 'setAutoCompactSidebarEnabled'
      },
      {
        key: 'liveHoverPreviewEnabled',
        defaultEnabled: false,
        label: t('settings.livePreview.toggle'),
        description: t('settings.livePreview.description'),
        setter: 'setLiveHoverPreviewEnabled'
      }
    ];

    const groups = [
      {
        id: 'chat',
        title: t('settings.enhancements.chat'),
        description: t('settings.enhancements.chatDescription'),
        keys: ['chatHistoryEnabled', 'moderationHistoryEnabled', 'chatFontEnabled', 'chatNoPaddingEnabled', 'showDeletedMessagesEnabled', 'showFullRepliesEnabled']
      },
      {
        id: 'mentions',
        title: t('settings.enhancements.mentions'),
        description: t('settings.enhancements.mentionsDescription'),
        keys: ['chatMentionHighlightEnabled']
      },
      {
        id: 'emotes',
        title: t('settings.enhancements.emotes'),
        description: t('settings.enhancements.emotesDescription'),
        keys: ['sevenTvEmotesEnabled', 'betterTtvEmotesEnabled']
      },
      {
        id: 'player',
        title: t('settings.enhancements.player'),
        description: t('settings.enhancements.playerDescription'),
        keys: ['liveFavoritesEnabled', 'playerLatencyEnabled', 'hideCollapsedGroupsUntilHover', 'autoCompactSidebarEnabled', 'liveHoverPreviewEnabled']
      }
    ];
    const cards = new Map();
    const grid = document.createElement('div');
    grid.className = 'tfr-feature-dashboard';
    groups.forEach((group) => {
      const cardParts = this.createFeatureCard(group, toggles, prefs);
      grid.appendChild(cardParts.card);
      cards.set(group.id, cardParts);
    });
    wrapper.appendChild(grid);

    const groupByKey = new Map(groups.flatMap((group) => group.keys.map((key) => [key, group.id])));
    toggles.forEach((toggleConfig) => {
      cards.get(groupByKey.get(toggleConfig.key))?.body.appendChild(
        this.createFeatureToggle(toggleConfig, prefs)
      );
    });

    cards.get('mentions').body.appendChild(this.createMentionSettings(prefs));

    cards.get('chat').body.appendChild(this.createChatPaddingSettings(prefs));

    const previewChoice = document.createElement('label');
    previewChoice.className = 'tfr-live-preview-choice';
    previewChoice.classList.toggle('is-disabled', prefs.liveHoverPreviewEnabled !== true);
    const previewLabel = document.createElement('strong');
    previewLabel.textContent = t('settings.livePreview.mode');
    const previewSelect = document.createElement('select');
    previewSelect.disabled = prefs.liveHoverPreviewEnabled !== true;
    [
      ['image', 'settings.livePreview.photo'],
      ['video', 'settings.livePreview.video']
    ].forEach(([value, labelKey]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = t(labelKey);
      option.selected = (prefs.liveHoverPreviewMode || 'image') === value;
      previewSelect.appendChild(option);
    });
    previewSelect.addEventListener('change', async (event) => {
      await this.store.setLiveHoverPreviewMode(event.target.value);
    });
    previewChoice.append(previewLabel, previewSelect);
    cards.get('player').body.appendChild(previewChoice);

    const fontChoice = document.createElement('label');
    fontChoice.className = 'tfr-chat-font-choice';
    fontChoice.classList.toggle('is-disabled', prefs.chatFontEnabled !== true);
    const fontLabel = document.createElement('strong');
    fontLabel.textContent = t('settings.chatFont.choice');
    const fontSelect = document.createElement('select');
    fontSelect.disabled = prefs.chatFontEnabled !== true;
    [
      ['system', 'settings.chatFont.system'],
      ['arial', 'settings.chatFont.arial'],
      ['verdana', 'settings.chatFont.verdana'],
      ['georgia', 'settings.chatFont.georgia'],
      ['monospace', 'settings.chatFont.monospace']
    ].forEach(([value, labelKey]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = t(labelKey);
      option.selected = (prefs.chatFontFamily || 'system') === value;
      fontSelect.appendChild(option);
    });
    if (prefs.chatCustomFontDataUrl) {
      const customOption = document.createElement('option');
      customOption.value = 'custom';
      customOption.textContent = prefs.chatCustomFontName
        ? `${t('settings.chatFont.custom')} · ${prefs.chatCustomFontName}`
        : t('settings.chatFont.custom');
      customOption.selected = prefs.chatFontFamily === 'custom';
      fontSelect.appendChild(customOption);
    }
    fontSelect.addEventListener('change', async (event) => {
      await this.store.setChatFontFamily(event.target.value);
    });
    fontChoice.appendChild(fontLabel);
    fontChoice.appendChild(fontSelect);
    const fontActions = document.createElement('span');
    fontActions.className = 'tfr-chat-font-choice__actions';
    const fontFileInput = document.createElement('input');
    fontFileInput.type = 'file';
    fontFileInput.accept = '.woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf';
    fontFileInput.hidden = true;
    const importFontButton = document.createElement('button');
    importFontButton.type = 'button';
    importFontButton.textContent = t('settings.chatFont.import');
    importFontButton.addEventListener('click', () => fontFileInput.click());
    fontFileInput.addEventListener('change', async () => {
      const file = fontFileInput.files?.[0];
      if (!file || file.size > 3 * 1024 * 1024 || !/\.(woff2?|ttf|otf)$/i.test(file.name)) {
        window.alert(t('settings.chatFont.invalid'));
        return;
      }
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result || '')));
        reader.addEventListener('error', () => resolve(''));
        reader.readAsDataURL(file);
      });
      const saved = await this.store.setChatCustomFont({ name: file.name, dataUrl });
      if (!saved) window.alert(t('settings.chatFont.invalid'));
      this.render();
    });
    fontActions.appendChild(importFontButton);
    fontActions.appendChild(fontFileInput);
    if (prefs.chatCustomFontDataUrl) {
      const removeFontButton = document.createElement('button');
      removeFontButton.type = 'button';
      removeFontButton.textContent = t('settings.chatFont.remove');
      removeFontButton.addEventListener('click', async () => {
        await this.store.clearChatCustomFont();
        this.render();
      });
      fontActions.appendChild(removeFontButton);
    }
    fontChoice.appendChild(fontActions);
    cards.get('chat').body.appendChild(fontChoice);

    return wrapper;
  }
  async getCategorySuggestions(term) {
    const normalized = normalizeCategoryName(term);
    if (!normalized || normalized.length < 2) {
      return [];
    }
    if (this.categorySuggestionCache.has(normalized)) {
      return this.categorySuggestionCache.get(normalized);
    }
    const results = await fetchCategorySuggestions(term, 20);
    const unique = [];
    const seen = new Set();
    results.forEach((name) => {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      const key = normalizeCategoryName(trimmed);
      if (!trimmed || !key || seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push(trimmed);
    });
    this.categorySuggestionCache.set(normalized, unique);
    return unique;
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
    const sticky = document.createElement('div');
    sticky.className = 'tfr-free-sticky';
    column.appendChild(sticky);

    const title = document.createElement('h3');
    title.className = 'tfr-board-title';
    title.textContent = t('available.title');
    sticky.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'tfr-board-subtitle';
    subtitle.textContent = t('available.subtitle');
    sticky.appendChild(subtitle);

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
      empty.textContent = term ? t('available.emptyFiltered') : t('available.emptyAll');
      grid.appendChild(empty);
    } else {
      freeFavorites.forEach((fav) => {
        const chip = this.createFavoriteChip(fav, liveData);
        grid.appendChild(chip);
      });
    }

    sticky.appendChild(grid);
    this.enableUncategorizedDrop(grid);
    return column;
  }

  openChannel(login) {
    const extensionApi = globalThis.chrome ?? globalThis.browser;
    if (extensionApi?.runtime?.sendMessage) {
      try {
        extensionApi.runtime.sendMessage({ type: 'TFR_OPEN_CHANNEL_TAB', login });
      } catch (error) {
        window.open(`https://www.twitch.tv/${login}`, '_blank', 'noopener');
      }
    } else {
      window.open(`https://www.twitch.tv/${login}`, '_blank', 'noopener');
    }
  }

  createFavoriteChip(fav, liveData) {
    const normalizedLogin = fav.login?.toLowerCase();
    const wrapper = document.createElement('div');
    wrapper.className = 'tfr-free-chip';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tfr-free-avatar';
    button.title = fav.displayName || fav.login;
    if (normalizedLogin && this.selectedFavorites.has(normalizedLogin)) {
      button.classList.add('is-selected');
    }

    const img = document.createElement('img');
    img.src = getLiveDataEntry(liveData, fav)?.avatarUrl || fav.avatarUrl || DEFAULT_AVATAR;
    img.alt = '';
    button.appendChild(img);

    const label = document.createElement('span');
    label.className = 'tfr-visually-hidden';
    label.textContent = fav.displayName || fav.login;
    button.appendChild(label);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!normalizedLogin) {
        return;
      }
      const isSelected = this.selectedFavorites.has(normalizedLogin);
      if (event.ctrlKey || event.metaKey) {
        if (isSelected) {
          this.selectedFavorites.delete(normalizedLogin);
        } else {
          this.selectedFavorites.add(normalizedLogin);
        }
        this.render();
        return;
      }
      if (!isSelected || this.selectedFavorites.size > 1) {
        this.selectedFavorites.clear();
        this.selectedFavorites.add(normalizedLogin);
        this.render();
      }
      this.openChannel(fav.login);
    });

    this.makeFavoriteDraggable(button, fav.login);
    wrapper.appendChild(button);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'tfr-free-chip__remove';
    removeButton.title = 'Retirer des favoris';
    removeButton.textContent = '×';
    removeButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.store.removeFavorite(fav.login);
      this.render();
    });
    wrapper.appendChild(removeButton);

    return wrapper;
  }

  renderCategoriesColumn(state, liveData, term) {
    const column = document.createElement('section');
    column.className = 'tfr-board-column tfr-board-column--categories';

    const header = document.createElement('div');
    header.className = 'tfr-board-header';

    const title = document.createElement('h3');
    title.className = 'tfr-board-title';
    title.textContent = t('categories.panel.title');
    header.appendChild(title);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'tfr-chip-action';
    addButton.textContent = t('categories.panel.new');
    addButton.addEventListener('click', async () => {
      const name = window.prompt(t('prompts.newCategory'));
      if (!name) return;
      await this.store.createCategory(name);
      this.render();
    });
    header.appendChild(addButton);

    const randomButton = document.createElement('button');
    randomButton.type = 'button';
    randomButton.className = 'tfr-chip-action';
    randomButton.textContent = t('categories.color.randomize');
    randomButton.addEventListener('click', async () => {
      await this.store.randomizeCategoryColors();
      this.render();
    });
    header.appendChild(randomButton);

    column.appendChild(header);

    const categoriesTree = this.store.getCategoriesTree();
    const rootDropZone = document.createElement('div');
    rootDropZone.className = 'tfr-category-root-dropzone';
    rootDropZone.textContent = 'Déposer ici pour remettre au niveau racine';
    this.setupCategoryDropTarget(rootDropZone, null);

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
      empty.textContent = t('categories.panel.empty');
      cards.appendChild(empty);
    } else {
      categoriesTree.forEach((node) => {
        const card = this.buildCategoryCard(node, assignmentsMap, aggregatedCounts, liveData, term, 0);
        cards.appendChild(card);
      });
    }

    this.setupCategoryDropTarget(cards, null);
    column.appendChild(rootDropZone);
    column.appendChild(cards);
    return column;
  }

  buildCategoryCard(node, assignmentsMap, aggregatedCounts, liveData, term, depth) {
    const card = document.createElement('div');
    card.className = 'tfr-category-card';
    card.dataset.categoryId = node.id;
    card.dataset.depth = String(depth);
    card.style.setProperty('--card-depth', String(depth));
    card.draggable = true;
    if (node.color) {
      this.applyCategoryColorVars(card, node.color);
    }
    card.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', node.id);
        event.dataTransfer.setData('application/json', JSON.stringify({ categoryId: node.id }));
        event.dataTransfer.effectAllowed = 'move';
      }
      card.classList.add('is-dragging');
      this.draggedCategoryId = node.id;
      this.draggedCategoryStartX = event.clientX || 0;
    });
    card.addEventListener('dragend', (event) => {
      event.stopPropagation();
      card.classList.remove('is-dragging');
      this.draggedCategoryId = null;
      this.draggedCategoryStartX = 0;
    });
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

    const moveUpBtn = document.createElement('button');
    moveUpBtn.type = 'button';
    moveUpBtn.className = 'tfr-chip-action';
    moveUpBtn.textContent = '↑';
    moveUpBtn.title = 'Déplacer vers le haut';
    moveUpBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.store.moveCategoryUp(node.id);
      this.render();
    });
    actions.appendChild(moveUpBtn);

    const moveDownBtn = document.createElement('button');
    moveDownBtn.type = 'button';
    moveDownBtn.className = 'tfr-chip-action';
    moveDownBtn.textContent = '↓';
    moveDownBtn.title = 'Déplacer vers le bas';
    moveDownBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.store.moveCategoryDown(node.id);
      this.render();
    });
    actions.appendChild(moveDownBtn);

    if (depth > 0) {
      const outdentBtn = document.createElement('button');
      outdentBtn.type = 'button';
      outdentBtn.className = 'tfr-chip-action';
      outdentBtn.textContent = '←';
      outdentBtn.title = 'Remonter d’un niveau';
      outdentBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await this.store.outdentCategory(node.id);
        this.render();
      });
      actions.appendChild(outdentBtn);
    }

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'tfr-chip-action';
    collapseBtn.textContent = node.collapsed ? t('categories.toggle.expand') : t('categories.toggle.collapse');
    collapseBtn.addEventListener('click', async () => {
      await this.store.toggleCategoryCollapse(node.id);
      this.render();
    });
    actions.appendChild(collapseBtn);

    const addSubBtn = document.createElement('button');
    addSubBtn.type = 'button';
    addSubBtn.className = 'tfr-chip-action';
    addSubBtn.textContent = t('categories.sub.addShort');
    addSubBtn.addEventListener('click', async () => {
      const name = window.prompt(t('prompts.newSubcategory'), `${node.name} ${node.children.length + 1}`);
      if (!name) return;
      await this.store.createCategory(name, node.id);
      this.render();
    });
    actions.appendChild(addSubBtn);

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'tfr-chip-action';
    renameBtn.textContent = t('common.rename');
    renameBtn.addEventListener('click', async () => {
      const name = window.prompt(t('prompts.renameCategory'), node.name);
      if (!name) return;
      await this.store.renameCategory(node.id, name);
      this.render();
    });
    actions.appendChild(renameBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'tfr-chip-action tfr-chip-action--danger';
    deleteBtn.textContent = t('common.delete');
    deleteBtn.addEventListener('click', async () => {
      const confirmed = window.confirm(t('confirms.deleteWithName', { name: node.name }));
      if (!confirmed) return;
      await this.store.removeCategory(node.id);
      this.render();
    });
    actions.appendChild(deleteBtn);

    header.appendChild(actions);
    card.appendChild(header);

    card.appendChild(this.renderCategoryColorPicker(node));

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
      empty.textContent = term ? t('categories.dropzone.emptyFiltered') : t('categories.dropzone.empty');
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

  renderCategoryColorPicker(node) {
    return this.renderCategoryColorPickerControl({
      label: t('categories.color.label'),
      currentColor: node.color,
      onApply: (nextColor) => this.store.setCategoryColor(node.id, nextColor),
      onClear: () => this.store.setCategoryColor(node.id, '')
    });
  }

  renderCategoryColorPickerControl({ label: labelText, currentColor: rawColor, onApply, onClear }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tfr-category-color-picker';

    const label = document.createElement('span');
    label.className = 'tfr-category-color-picker__label';
    label.textContent = labelText;
    wrapper.appendChild(label);

    const options = document.createElement('div');
    options.className = 'tfr-category-color-picker__options';
    const currentColor = this.store.sanitizeCategoryColor?.(rawColor) || '';
    let pendingColor = currentColor;

    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.className = 'tfr-category-color-swatch tfr-category-color-swatch--picker';
    previewButton.title = t('categories.color.openPalette');
    previewButton.setAttribute('aria-label', t('categories.color.openPalette'));
    if (currentColor) {
      this.applyCategoryColorVars(previewButton, currentColor);
    } else {
      previewButton.classList.add('tfr-category-color-swatch--none');
    }
    previewButton.addEventListener('click', (event) => {
      event.stopPropagation();
      wrapper.classList.toggle('is-open');
    });
    options.appendChild(previewButton);

    const value = document.createElement('code');
    value.className = 'tfr-category-color-picker__value';
    value.textContent = currentColor || t('categories.color.none');
    options.appendChild(value);

    const palette = document.createElement('div');
    palette.className = 'tfr-category-color-popover';

    const updatePreview = (color) => {
      pendingColor = this.store.sanitizeCategoryColor?.(color) || '';
      value.textContent = pendingColor || t('categories.color.none');
      previewButton.classList.toggle('tfr-category-color-swatch--none', !pendingColor);
      if (pendingColor) {
        this.applyCategoryColorVars(previewButton, pendingColor);
      } else {
        previewButton.removeAttribute('data-color');
        previewButton.style.removeProperty('--tfr-category-card-tint');
        previewButton.style.removeProperty('--tfr-category-card-border');
        previewButton.style.removeProperty('--tfr-swatch-color');
      }
    };

    const wheel = document.createElement('button');
    wheel.type = 'button';
    wheel.className = 'tfr-category-color-wheel';
    wheel.setAttribute('aria-label', t('categories.color.pickFromWheel'));
    let isPicking = false;
    const pickFromWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      updatePreview(this.getColorFromWheelEvent(event, wheel));
    };
    wheel.addEventListener('pointerdown', (event) => {
      isPicking = true;
      wheel.setPointerCapture?.(event.pointerId);
      pickFromWheel(event);
    });
    wheel.addEventListener('pointermove', (event) => {
      if (!isPicking) return;
      pickFromWheel(event);
    });
    wheel.addEventListener('pointerup', (event) => {
      isPicking = false;
      wheel.releasePointerCapture?.(event.pointerId);
    });
    wheel.addEventListener('pointercancel', (event) => {
      isPicking = false;
      wheel.releasePointerCapture?.(event.pointerId);
    });
    palette.appendChild(wheel);

    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'tfr-chip-action tfr-chip-action--primary';
    applyButton.textContent = t('categories.color.apply');
    applyButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await onApply(pendingColor);
      this.render();
    });
    palette.appendChild(applyButton);

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'tfr-chip-action';
    clearButton.textContent = t('categories.color.clear');
    clearButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await onClear();
      this.render();
    });
    palette.appendChild(clearButton);
    options.appendChild(palette);

    wrapper.appendChild(options);
    return wrapper;
  }

  createFavoriteSquare(fav, liveData) {
    const normalizedLogin = fav.login?.toLowerCase();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tfr-category-square';
    button.title = t('favorites.configure', { name: fav.displayName || fav.login });
    if (normalizedLogin && this.selectedFavorites.has(normalizedLogin)) {
      button.classList.add('is-selected');
    }

    const avatar = document.createElement('img');
    avatar.className = 'tfr-category-square__avatar';
    avatar.src = getLiveDataEntry(liveData, fav)?.avatarUrl || fav.avatarUrl || DEFAULT_AVATAR;
    avatar.alt = '';
    button.appendChild(avatar);
    if (fav.recentHighlightEnabled !== false) {
      button.classList.add('tfr-category-square--recent');
      const badge = document.createElement('span');
      badge.className = 'tfr-category-square__badge';
      badge.textContent = t('recent.badgeShort');
      button.appendChild(badge);
    }

    const label = document.createElement('span');
    label.className = 'tfr-visually-hidden';
    label.textContent = fav.displayName || fav.login;
    button.appendChild(label);

    this.makeFavoriteDraggable(button, fav.login);
    if (this.activeFavoriteLogin === normalizedLogin) {
      button.classList.add('is-active');
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!normalizedLogin) {
        return;
      }
      const isSelected = this.selectedFavorites.has(normalizedLogin);
      if (event.ctrlKey || event.metaKey) {
        if (isSelected) {
          this.selectedFavorites.delete(normalizedLogin);
        } else {
          this.selectedFavorites.add(normalizedLogin);
        }
        this.render();
        return;
      }
      if (!isSelected || this.selectedFavorites.size > 1) {
        this.selectedFavorites.clear();
        this.selectedFavorites.add(normalizedLogin);
        this.render();
      }
      if (this.draggedLogin) {
        return;
      }
      this.openFavoriteDetails(fav.login);
    });
    return button;
  }

  parseDraggedLogins(event) {
    const data = [];
    const rawJson = event.dataTransfer?.getData('application/json');
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && Array.isArray(parsed.logins)) {
          parsed.logins.forEach((login) => {
            if (typeof login === 'string' && login.trim()) {
              data.push(login.toLowerCase());
            }
          });
        }
      } catch {
        // ignore
      }
    }
    if (!data.length) {
      const rawText = event.dataTransfer?.getData('text/plain') || '';
      rawText.split(',').forEach((login) => {
        const trimmed = String(login).trim();
        if (trimmed) {
          data.push(trimmed.toLowerCase());
        }
      });
    }
    if (!data.length && Array.isArray(this.draggedLogin)) {
      this.draggedLogin.forEach((login) => {
        if (typeof login === 'string' && login.trim()) {
          data.push(login.toLowerCase());
        }
      });
    }
    return Array.from(new Set(data));
  }

  parseDraggedCategoryId(event) {
    const rawJson = event.dataTransfer?.getData('application/json');
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed.categoryId === 'string' && parsed.categoryId.trim()) {
          return parsed.categoryId;
        }
        if (parsed && Array.isArray(parsed.logins)) {
          return null;
        }
      } catch {
        // ignore
      }
    }
    if (typeof this.draggedCategoryId === 'string' && this.draggedCategoryId.trim()) {
      return this.draggedCategoryId;
    }
    return null;
  }

  getCategoryDropPlacement(event, element) {
    const isCategoryTarget =
      element?.classList?.contains('tfr-category-item') || element?.classList?.contains('tfr-category-card');
    if (!isCategoryTarget) {
      return 'inside';
    }
    const depth = Number(element.dataset?.depth || 0);
    const elementRect = element.getBoundingClientRect();
    if (depth > 0 && this.draggedCategoryStartX && event.clientX <= this.draggedCategoryStartX - 24) {
      return 'out';
    }
    if (depth > 0 && event.clientX <= elementRect.left + 32) {
      return 'root';
    }
    const header =
      element.querySelector?.('.tfr-category-item-header') || element.querySelector?.('.tfr-category-card__header');
    const rect = (header || element).getBoundingClientRect();
    if (!rect.height) {
      return 'inside';
    }
    const offsetY = event.clientY - rect.top;
    if (offsetY < 0 || offsetY > rect.height) {
      return 'inside';
    }
    if (offsetY < rect.height * 0.3) {
      return 'before';
    }
    if (offsetY > rect.height * 0.7) {
      return 'after';
    }
    return 'inside';
  }

  setCategoryDropIndicator(element, placement) {
    element.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-inside', 'is-drop-root', 'is-drop-out');
    if (placement === 'before') {
      element.classList.add('is-drop-before');
    } else if (placement === 'after') {
      element.classList.add('is-drop-after');
    } else if (placement === 'root') {
      element.classList.add('is-drop-root');
    } else if (placement === 'out') {
      element.classList.add('is-drop-out');
    } else {
      element.classList.add('is-drop-inside');
    }
  }

  clearCategoryDropIndicator(element) {
    element.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after', 'is-drop-inside', 'is-drop-root', 'is-drop-out');
  }

  makeFavoriteDraggable(element, login) {
    element.draggable = true;
    element.dataset.login = login;
    element.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      const normalized = login?.toLowerCase();
      let selected = [];
      if (normalized && this.selectedFavorites.has(normalized) && this.selectedFavorites.size > 1) {
        selected = Array.from(this.selectedFavorites);
      } else if (normalized) {
        selected = [normalized];
      }
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', selected[0] || normalized || '');
        event.dataTransfer.setData('application/json', JSON.stringify({ logins: selected }));
        event.dataTransfer.effectAllowed = 'move';
      }
      element.classList.add('is-dragging');
      this.draggedLogin = selected.length ? selected : normalized ? [normalized] : null;
    });
    element.addEventListener('dragend', (event) => {
      event.stopPropagation();
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
    exportButton.textContent = t('backup.export');
    exportButton.addEventListener('click', () => this.handleExportBackup());

    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'tfr-button tfr-button--ghost';
    importButton.textContent = this.isImportingBackup ? t('backup.importing') : t('backup.import');
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
    pasteButton.textContent = t('backup.pasteJson');
    pasteButton.addEventListener('click', () => this.importBackupFromText());

    wrapper.appendChild(exportButton);
    wrapper.appendChild(importButton);
    wrapper.appendChild(pasteButton);
    wrapper.appendChild(importFileInput);
    this.backupInput = importFileInput;
    return wrapper;
  }

  renderDriveControls() {
    const wrapper = document.createElement('div');
    wrapper.className = 'tfr-drive-controls';
    const isConfigured = this.driveStatus?.configured !== false;
    const isConnected = Boolean(this.driveStatus?.connectedAt);

    const title = document.createElement('span');
    title.className = 'tfr-drive-controls__title';
    title.textContent = t('drive.title');
    title.title = 'Ctrl + Alt + clic pour afficher les informations de debug Drive';
    title.addEventListener('click', (event) => {
      if (!event.ctrlKey || !event.altKey) {
        return;
      }
      event.preventDefault();
      this.driveDebugVisible = !this.driveDebugVisible;
      this.render();
    });
    wrapper.appendChild(title);

    const connectButton = document.createElement('button');
    connectButton.type = 'button';
    connectButton.className = 'tfr-button';
    connectButton.textContent = this.isDriveSyncing ? t('drive.syncing') : (isConnected ? t('drive.reconnect') : t('drive.connect'));
    connectButton.disabled = this.isDriveSyncing || !isConfigured;
    connectButton.addEventListener('click', () => this.connectGoogleDrive());
    wrapper.appendChild(connectButton);

    const pushButton = document.createElement('button');
    pushButton.type = 'button';
    pushButton.className = 'tfr-button tfr-button--ghost';
    pushButton.textContent = this.isDriveSyncing ? t('drive.syncing') : t('drive.push');
    pushButton.disabled = this.isDriveSyncing || !isConfigured || !isConnected;
    pushButton.addEventListener('click', () => this.pushBackupToDrive());
    wrapper.appendChild(pushButton);

    const pullButton = document.createElement('button');
    pullButton.type = 'button';
    pullButton.className = 'tfr-button tfr-button--ghost';
    pullButton.textContent = t('drive.pull');
    pullButton.disabled = this.isDriveSyncing || !isConfigured || !isConnected;
    pullButton.addEventListener('click', () => this.pullBackupFromDrive());
    wrapper.appendChild(pullButton);

    const signOutButton = document.createElement('button');
    signOutButton.type = 'button';
    signOutButton.className = 'tfr-button tfr-button--ghost';
    signOutButton.textContent = t('drive.signOut');
    signOutButton.disabled = this.isDriveSyncing || !isConfigured || !isConnected;
    signOutButton.addEventListener('click', () => this.signOutDrive());
    wrapper.appendChild(signOutButton);

    if (!isConfigured) {
      const wizard = document.createElement('div');
      wizard.className = 'tfr-drive-wizard';
      wizard.innerHTML = `
        <strong>${t('drive.setupTitle')}</strong>
        <ol>
          <li>${t('drive.setupStep1')}</li>
          <li>${t('drive.setupStep2')}</li>
          <li>${t('drive.setupStep3')}</li>
        </ol>
      `;
      wrapper.appendChild(wizard);
    }
    if (this.driveDebugVisible && this.driveStatus) {
      const redirectHint = document.createElement('div');
      redirectHint.className = 'tfr-drive-wizard tfr-drive-wizard--debug';
      const label = document.createElement('strong');
      label.textContent = 'Debug Drive';
      const value = document.createElement('code');
      value.textContent = [
        `Extension ID: ${this.driveStatus.extensionId || ''}`,
        `Chrome OAuth client: ${this.driveStatus.chromeOAuthClientId || ''}`,
        `Web OAuth client: ${this.driveStatus.webAuthClientId || ''}`,
        `Redirect URI: ${this.driveStatus.webAuthRedirectUri || ''}`
      ].join('\n');
      const testToastButton = document.createElement('button');
      testToastButton.type = 'button';
      testToastButton.className = 'tfr-button tfr-button--ghost';
      testToastButton.textContent = t('drive.debug.testNotification');
      testToastButton.addEventListener('click', () => this.testToastNotification());
      redirectHint.appendChild(label);
      redirectHint.appendChild(value);
      redirectHint.appendChild(testToastButton);
      wrapper.appendChild(redirectHint);
    }

    if (this.driveMessage) {
      const message = document.createElement('small');
      message.className = 'tfr-drive-controls__message';
      message.textContent = this.driveMessage;
      wrapper.appendChild(message);
    }

    return wrapper;
  }

  async testToastNotification() {
    const response = await this.sendBackgroundMessage({ type: 'TFR_TEST_OVERLAY_TOAST' });
    this.driveMessage = response?.ok
      ? t('drive.debug.testSent')
      : t('drive.debug.testFailed');
    this.render();
  }

  async connectGoogleDrive() {
    this.isDriveSyncing = true;
    this.driveMessage = t('drive.connecting');
    this.render();
    const response = await this.sendBackgroundMessage({ type: 'TFR_DRIVE_CONNECT' });
    this.isDriveSyncing = false;
    if (response?.ok) {
      this.driveStatus = response.syncState || this.driveStatus;
      this.driveMessage = t('drive.connected');
    } else {
      this.driveStatus = response?.syncState || this.driveStatus;
      this.driveMessage = t('drive.failed', { message: response?.message || 'erreur inconnue' });
    }
    this.render();
  }

  async pushBackupToDrive() {
    this.isDriveSyncing = true;
    this.driveMessage = t('drive.syncing');
    this.render();
    const response = await this.sendBackgroundMessage({
      type: 'TFR_DRIVE_PUSH',
      backup: this.store.getBackupData()
    });
    this.isDriveSyncing = false;
    if (response?.ok) {
      this.driveStatus = response.syncState || this.driveStatus;
      this.driveMessage = t('drive.pushSuccess');
    } else {
      this.driveMessage = t('drive.failed', { message: response?.message || 'erreur inconnue' });
    }
    this.render();
  }

  async pullBackupFromDrive() {
    const confirmed = window.confirm(t('drive.confirmPull'));
    if (!confirmed) return;
    this.isDriveSyncing = true;
    this.driveMessage = t('drive.syncing');
    this.render();
    const response = await this.sendBackgroundMessage({ type: 'TFR_DRIVE_PULL' });
    if (response?.ok && response.payload) {
      try {
        await this.store.restoreFromBackup(response.payload);
        this.driveStatus = response.syncState || this.driveStatus;
        this.driveMessage = t('drive.pullSuccess');
      } catch (error) {
        this.driveMessage = t('drive.failed', { message: error?.message || 'backup invalide' });
      }
    } else {
      this.driveMessage = t('drive.failed', { message: response?.message || 'erreur inconnue' });
    }
    this.isDriveSyncing = false;
    this.render();
  }

  async signOutDrive() {
    this.isDriveSyncing = true;
    this.driveMessage = t('drive.syncing');
    this.render();
    const response = await this.sendBackgroundMessage({ type: 'TFR_DRIVE_SIGN_OUT' });
    this.isDriveSyncing = false;
    if (response?.ok) {
      this.driveStatus = response.syncState || { ...this.driveStatus, connectedAt: null };
      this.driveMessage = t('drive.readyToConnect');
    } else {
      this.driveMessage = t('drive.failed', { message: response?.message || 'erreur inconnue' });
    }
    this.render();
  }

  async handleExportBackup() {
    try {
      const payload = this.store.getBackupData();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.downloadJson(payload, `twitch-favoris-backup-${timestamp}.json`);
    } catch (error) {
      console.error('[TFR] Export backup error', error);
      window.alert(t('backup.exportError'));
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
          ? t('backup.importInvalidFile')
          : t('backup.importReadError');
      window.alert(message);
    } finally {
      this.isImportingBackup = false;
      if (this.isOpen) {
        this.render();
      }
    }
  }

  async importBackupFromText() {
    const input = window.prompt(t('prompts.pasteJson'));
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
          ? t('backup.importInvalidText')
          : t('backup.importFailed');
      window.alert(message);
    } finally {
      this.isImportingBackup = false;
      if (this.isOpen) {
        this.render();
      }
    }
  }

  async applyBackupContent(rawText) {
    const parsed = window.TFRBackupTools.parseJson(rawText);
    const confirmed = window.confirm(t('confirms.import'));
    if (!confirmed) {
      return;
    }
    await this.store.restoreFromBackup(parsed);
    window.alert(t('backup.importSuccess'));
  }

  renderCategories(content, state) {
    const categoriesSection = document.createElement('section');
    categoriesSection.className = 'tfr-categories-section';

    const header = document.createElement('div');
    header.className = 'tfr-categories-header';
    header.textContent = t('categories.header');

    const dragHint = document.createElement('div');
    dragHint.className = 'tfr-category-help';
    dragHint.textContent = 'Glissez une catégorie sur l’en-tête d’un groupe pour la réordonner, au centre pour en faire une sous-catégorie, ou dans la zone racine pour la remonter.';

    const addCategory = document.createElement('button');
    addCategory.type = 'button';
    addCategory.className = 'tfr-button';
    addCategory.textContent = t('categories.add');
    addCategory.addEventListener('click', async () => {
      const name = window.prompt(t('prompts.newCategoryAlt'));
      if (!name) {
        return;
      }
      await this.store.createCategory(name);
      this.render();
    });

    const list = document.createElement('div');
    list.className = 'tfr-category-list';
    const rootDropZone = document.createElement('div');
    rootDropZone.className = 'tfr-category-root-dropzone';
    rootDropZone.textContent = 'Déposer ici pour remettre au niveau racine';
    this.setupCategoryDropTarget(rootDropZone, null);
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
      empty.textContent = t('categories.empty');
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
        name.textContent = t('categories.noneName');
        const meta = document.createElement('span');
        meta.className = 'tfr-category-meta';
        meta.textContent = t('categories.uncategorizedMeta', { count: uncategorizedFavorites.length });
        title.appendChild(name);
        title.appendChild(meta);
        uncategorizedItem.appendChild(title);

        const chips = document.createElement('div');
        chips.className = 'tfr-category-assigned';
        uncategorizedFavorites.forEach((fav) => {
        const chipWrapper = document.createElement('div');
        chipWrapper.className = 'tfr-category-chip-wrapper';

        const chipButton = document.createElement('button');
        chipButton.type = 'button';
        chipButton.className = 'tfr-category-chip-btn';
        chipButton.title = fav.displayName || fav.login;
        chipButton.addEventListener('click', () => {
          this.openChannel(fav.login);
        });

        const chipAvatar = document.createElement('img');
        chipAvatar.className = 'tfr-category-chip-btn__avatar';
        chipAvatar.src = fav.avatarUrl || DEFAULT_AVATAR;
        chipAvatar.alt = '';
        const chipLabel = document.createElement('span');
        chipLabel.textContent = fav.displayName || fav.login;
        chipButton.appendChild(chipAvatar);
        chipButton.appendChild(chipLabel);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'tfr-category-chip-remove';
        removeButton.title = 'Retirer des favoris';
        removeButton.textContent = '×';
        removeButton.addEventListener('click', async (event) => {
          event.stopPropagation();
          await this.store.removeFavorite(fav.login);
          this.render();
        });

        chipWrapper.appendChild(chipButton);
        chipWrapper.appendChild(removeButton);
        chips.appendChild(chipWrapper);
      });

      const hint = document.createElement('div');
      hint.className = 'tfr-category-assigned tfr-category-assigned--empty';
      hint.textContent = t('categories.assignHint');
      uncategorizedItem.appendChild(chips);
      uncategorizedItem.appendChild(hint);
      this.enableUncategorizedDrop(uncategorizedItem);
      list.appendChild(uncategorizedItem);
    }
  }

  this.setupCategoryDropTarget(list, null);
    categoriesSection.appendChild(header);
    categoriesSection.appendChild(dragHint);
    categoriesSection.appendChild(addCategory);
    categoriesSection.appendChild(rootDropZone);
    categoriesSection.appendChild(list);
    content.appendChild(categoriesSection);
  }

  appendCategoryListItem(container, category, depth, assignmentsMap, aggregatedCounts, favoritesArray) {
    const item = document.createElement('div');
    item.className = 'tfr-category-item';
    item.dataset.depth = String(depth);
    item.style.marginLeft = `${depth * 16}px`;
    item.draggable = true;
    item.dataset.categoryId = category.id;
    item.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', category.id);
        event.dataTransfer.setData('application/json', JSON.stringify({ categoryId: category.id }));
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setDragImage(item, 0, 0);
      }
      item.classList.add('is-dragging');
      this.draggedCategoryId = category.id;
      this.draggedCategoryStartX = event.clientX || 0;
    });
    item.addEventListener('dragend', (event) => {
      event.stopPropagation();
      item.classList.remove('is-dragging');
      this.draggedCategoryId = null;
      this.draggedCategoryStartX = 0;
    });

    const title = document.createElement('div');
    title.className = 'tfr-category-item-title';
    const name = document.createElement('span');
    const indentText = depth > 1 ? '  '.repeat(depth - 1) : '';
    const bullet = depth ? '- ' : '';
    name.textContent = `${indentText}${bullet}${category.name}`;
    const meta = document.createElement('span');
    meta.className = 'tfr-category-meta';
    const totalCount = aggregatedCounts.get(category.id) || 0;
    meta.textContent = t('categories.totalMeta', { count: totalCount });
    title.appendChild(name);
    title.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'tfr-category-item-actions';

    const moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'tfr-button tfr-button--ghost';
    moveUp.textContent = '↑';
    moveUp.title = 'Déplacer vers le haut';
    moveUp.addEventListener('click', async () => {
      await this.store.moveCategoryUp(category.id);
      this.render();
    });

    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'tfr-button tfr-button--ghost';
    moveDown.textContent = '↓';
    moveDown.title = 'Déplacer vers le bas';
    moveDown.addEventListener('click', async () => {
      await this.store.moveCategoryDown(category.id);
      this.render();
    });

    const indent = document.createElement('button');
    indent.type = 'button';
    indent.className = 'tfr-button tfr-button--ghost';
    indent.textContent = '→';
    indent.title = 'Déplacer dans une sous-catégorie';
    indent.addEventListener('click', async () => {
      await this.store.indentCategory(category.id);
      this.render();
    });

    const outdent = document.createElement('button');
    outdent.type = 'button';
    outdent.className = 'tfr-button tfr-button--ghost';
    outdent.textContent = '←';
    outdent.title = 'Remonter de niveau';
    outdent.addEventListener('click', async () => {
      await this.store.outdentCategory(category.id);
      this.render();
    });

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tfr-button tfr-button--ghost';
    toggle.textContent = category.collapsed ? t('categories.toggle.expandAlt') : t('categories.toggle.collapseAlt');
    toggle.addEventListener('click', async () => {
      await this.store.toggleCategoryCollapse(category.id);
      this.render();
    });

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'tfr-button tfr-button--ghost';
    rename.textContent = t('common.rename');
    rename.addEventListener('click', async () => {
      const next = window.prompt(t('prompts.renameCategory'), category.name);
      if (!next) {
        return;
      }
      await this.store.renameCategory(category.id, next);
      this.render();
    });

    const addSub = document.createElement('button');
    addSub.type = 'button';
    addSub.className = 'tfr-button tfr-button--ghost';
    addSub.textContent = t('categories.addSub');
    addSub.addEventListener('click', async () => {
      const nameValue = window.prompt(t('prompts.newSubcategoryAlt'));
      if (!nameValue) {
        return;
      }
      await this.store.createCategory(nameValue, category.id);
      this.render();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tfr-button tfr-button--danger';
    remove.textContent = t('common.delete');
    remove.addEventListener('click', async () => {
      const confirmed = window.confirm(t('confirms.deleteKeepFavorites'));
      if (!confirmed) {
        return;
      }
      await this.store.removeCategory(category.id);
      this.render();
    });

    actions.appendChild(moveUp);
    actions.appendChild(moveDown);
    actions.appendChild(indent);
    actions.appendChild(outdent);
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
        chipButton.title = t('favorites.settingsTooltip');
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
      empty.textContent = t('categories.assignEmpty');
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
      placeholder.textContent = t('categories.assignPlaceholder');
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
      assignButton.textContent = t('categories.assign');
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

  setupCategoryDropTarget(element, targetCategoryId) {
    const highlight = (event) => {
      element.classList.add('is-drop-target');
      const draggedCategoryId = this.parseDraggedCategoryId(event);
      if (draggedCategoryId && draggedCategoryId !== targetCategoryId) {
        this.setCategoryDropIndicator(element, this.getCategoryDropPlacement(event, element));
      }
    };
    const removeHighlight = () => this.clearCategoryDropIndicator(element);
    const canHandle = (event) => {
      const types = event.dataTransfer?.types;
      if (!types) return false;
      const available = Array.from(types);
      return available.includes('application/json') || available.includes('text/plain') || available.includes('Text');
    };
    element.addEventListener('dragover', (event) => {
      if (!canHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      highlight(event);
    });
    element.addEventListener('dragenter', (event) => {
      if (!canHandle(event)) return;
      event.preventDefault();
      event.stopPropagation();
      highlight(event);
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

      const draggedCategoryId = this.parseDraggedCategoryId(event);
      if (draggedCategoryId) {
        const placement = targetCategoryId ? this.getCategoryDropPlacement(event, element) : 'root';
        if (draggedCategoryId !== targetCategoryId || placement === 'root' || placement === 'out') {
          await this.store.moveCategory(draggedCategoryId, targetCategoryId || null, placement);
          this.draggedCategoryId = null;
          this.render();
          return;
        }
      }

      const logins = this.parseDraggedLogins(event);
      if (!logins.length) return;
      try {
        if (targetCategoryId) {
          await Promise.all(logins.map((login) => this.store.setFavoriteCategory(login, targetCategoryId)));
        }
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
      if (!types) return false;
      const available = Array.from(types);
      return available.includes('application/json') || available.includes('text/plain') || available.includes('Text');
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
      const logins = this.parseDraggedLogins(event);
      if (!logins.length) return;
      try {
        await Promise.all(logins.map((login) => this.store.clearFavoriteCategory(login)));
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
    const flatCategories = window.TFRCategoryTreeTools.flatten(categoryTree);
    const knownCategories = categoryFilterTools.collectKnownCategories(state, liveData);
    const detailsPanel = this.renderFavoriteDetails(state, liveData, flatCategories, knownCategories);
    if (detailsPanel) {
      panelContainer.appendChild(detailsPanel);
      panelContainer.classList.add('tfr-overlay-panel--with-details');
    }
  }

  renderFavoriteDetailsHeader(favorite, live) {
    const header = document.createElement('div');
    header.className = 'tfr-favorite-details__header';
    const info = document.createElement('div');
    info.className = 'tfr-favorite-details__header-info';
    const avatar = document.createElement('img');
    avatar.className = 'tfr-favorite-details__avatar';
    avatar.src = live?.avatarUrl || favorite.avatarUrl || DEFAULT_AVATAR;
    avatar.alt = favorite.displayName;

    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'tfr-favorite-details__title-wrapper';
    const title = document.createElement('h3');
    title.className = 'tfr-favorite-details__title';
    title.textContent = favorite.displayName;
    const subtitle = document.createElement('span');
    subtitle.className = 'tfr-favorite-details__subtitle';
    subtitle.textContent = `@${favorite.login}`;
    const fixLoginButton = document.createElement('button');
    fixLoginButton.type = 'button';
    fixLoginButton.className = 'tfr-favorite-details__fix-login';
    fixLoginButton.textContent = t('details.login.fix');
    fixLoginButton.addEventListener('click', async () => {
      const requested = window.prompt(t('details.login.prompt', { name: favorite.displayName }), favorite.login);
      if (requested === null || !requested.trim()) return;
      fixLoginButton.disabled = true;
      const result = await this.store.migrateFavoriteLogin(favorite.login, requested);
      if (!result.ok) {
        const errorKey = result.reason === 'duplicate'
          ? 'details.login.duplicate'
          : result.reason === 'notFound'
            ? 'details.login.notFound'
            : 'details.login.unavailable';
        window.alert(t(errorKey));
        fixLoginButton.disabled = false;
        return;
      }
      this.activeFavoriteLogin = result.login;
      this.render();
    });
    titleWrapper.append(title, subtitle, fixLoginButton);
    info.append(avatar, titleWrapper);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'tfr-favorite-details__close';
    closeButton.setAttribute('aria-label', t('details.panelClose', { name: favorite.displayName }));
    closeButton.textContent = '\u00D7';
    closeButton.addEventListener('click', () => this.closeFavoriteDetails());
    header.append(info, closeButton);
    return header;
  }

  renderFavoriteDetailsInfo(favorite, live, preferences) {
    const section = document.createElement('section');
    section.className = 'tfr-details-section tfr-details-section--info';
    const status = document.createElement('p');
    status.className = 'tfr-details-info';
    let highlight = null;
    if (live?.isLive) {
      const now = Date.now();
      const viewers = formatViewers(live.viewers || 0);
      const startedAt = live.startedAt ? Date.parse(live.startedAt) : NaN;
      const game = live.game || t('details.status.unknownCategory');
      status.textContent = Number.isFinite(startedAt)
        ? t('details.status.liveSince', {
            minutes: Math.max(0, Math.floor((now - startedAt) / 60000)), game, viewers
          })
        : t('details.status.live', { game, viewers });

      const matchSince = Number.isFinite(favorite.filterMatchSince) && favorite.filterMatchSince > 0
        ? favorite.filterMatchSince
        : 0;
      const recentReference = Math.max(Number.isFinite(startedAt) ? startedAt : 0, matchSince);
      if (preferences.recentLiveEnabled && recentReference > 0) {
        const threshold = Number.isFinite(Number(preferences.recentLiveThresholdMinutes))
          ? Math.max(1, Math.min(120, Math.round(Number(preferences.recentLiveThresholdMinutes))))
          : 10;
        if (Math.max(0, Math.floor((now - recentReference) / 60000)) <= threshold) {
          highlight = document.createElement('p');
          highlight.className = 'tfr-details-info tfr-details-info--highlight';
          highlight.textContent = t('details.status.recentHighlight', { minutes: threshold });
        }
      }
    } else {
      status.textContent = t('details.status.offline');
    }

    const visibility = getSidebarVisibilityInfo(favorite, live);
    const visibilityLine = document.createElement('p');
    visibilityLine.className = visibility.visible
      ? 'tfr-details-info tfr-details-info--highlight'
      : 'tfr-details-info tfr-details-info--warning';
    visibilityLine.textContent = visibility.reason;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'tfr-details-close';
    closeButton.textContent = t('details.closeLink');
    closeButton.setAttribute('aria-label', t('common.closeAction'));
    closeButton.addEventListener('click', () => this.closeFavoriteDetails());
    section.append(status, visibilityLine);
    if (highlight) section.appendChild(highlight);
    section.appendChild(closeButton);
    return section;
  }

  renderFavoriteCategorySection(favorite, flatCategories) {
    const section = document.createElement('section');
    section.className = 'tfr-details-section';
    const title = document.createElement('h4');
    title.className = 'tfr-details-section__title';
    title.textContent = t('details.category.title');
    const select = document.createElement('select');
    select.className = 'tfr-category-select tfr-category-select--wide';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = flatCategories.length
      ? t('categories.noneName')
      : t('details.category.noneAvailable');
    select.appendChild(placeholder);
    flatCategories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      const prefix = category.depth ? `${'  '.repeat(category.depth)}- ` : '';
      option.textContent = `${prefix}${category.name}`;
      select.appendChild(option);
    });
    select.value = Array.isArray(favorite.categories) && favorite.categories.length
      ? favorite.categories[0]
      : '';
    select.disabled = !flatCategories.length;
    select.addEventListener('change', async (event) => {
      await this.store.setFavoriteCategory(favorite.login, event.target.value || null);
      this.render();
    });
    section.append(title, select);
    if (!flatCategories.length) {
      const hint = document.createElement('p');
      hint.className = 'tfr-details-hint';
      hint.textContent = t('details.category.hint');
      section.appendChild(hint);
    }
    return section;
  }

  renderFavoriteRecentHighlightToggle(favorite) {
    const label = document.createElement('label');
    label.className = 'tfr-details-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'tfr-details-toggle__input';
    input.checked = favorite.recentHighlightEnabled !== false;
    input.addEventListener('change', async (event) => {
      await this.store.setFavoriteRecentHighlight(favorite.login, Boolean(event.target.checked));
      this.render();
    });
    const text = document.createElement('span');
    text.textContent = t('details.recentHighlight.toggle');
    label.append(input, text);
    return label;
  }

  renderFavoriteDetailsShell(favorite, live) {
    const panel = document.createElement('aside');
    panel.className = 'tfr-favorite-details';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('details.panelTitle', { name: favorite.displayName }));
    panel.tabIndex = -1;
    requestAnimationFrame(() => {
      try {
        panel.focus();
      } catch {
        // ignore focus errors
      }
    });
    panel.appendChild(this.renderFavoriteDetailsHeader(favorite, live));
    const body = document.createElement('div');
    body.className = 'tfr-favorite-details__body';
    panel.appendChild(body);
    return { panel, body };
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
    const live = getLiveDataEntry(liveData, login);
    const prefs = state.preferences || {};
    const { panel, body } = this.renderFavoriteDetailsShell(favorite, live);

    body.appendChild(this.renderFavoriteCategorySection(favorite, flatCategories));
    const filterSection = this.categoryFilterController.render({
      favorite,
      live,
      knownCategories
    });
    filterSection.appendChild(this.renderFavoriteRecentHighlightToggle(favorite));
    body.appendChild(filterSection);

    body.appendChild(this.renderFavoriteDetailsInfo(favorite, live, prefs));

    return panel;
  }

  destroy() {
    this.unsubscribe?.();
    this.close();
  }
}
    return FavoritesOverlay;
  };

  window.TFRFavoritesOverlay = {
    create: createFavoritesOverlay
  };
})();

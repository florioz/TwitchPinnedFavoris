(() => {
  const SETTINGS_BUTTON_SELECTOR = [
    '[data-a-target="player-settings-button"]',
    '[data-test-selector="player-settings-button"]'
  ].join(', ');
  const QUALITY_BUTTON_SELECTOR = 'button[data-a-target="player-settings-menu-item-quality"]';
  const QUALITY_RADIO_SELECTOR = [
    '[data-a-target="player-settings-menu"] input[data-a-target="tw-radio"]',
    'input[data-a-target="tw-radio"]'
  ].join(', ');
  const QUALITY_MENU_SELECTOR = '[data-a-target="player-settings-menu"]';
  const CONTENT_GATE_SELECTOR = '[data-a-target*="content-gate"], [data-test-selector*="content-gate"]';
  const SCOPED_ERROR_SELECTOR = [
    '[data-a-target*="player-error"]',
    '[data-test-selector*="player-error"]',
    '[class*="player-error"]'
  ].join(', ');
  const PLAYER_CONTROL_SELECTOR = '[data-a-target^="player-"]';
  const STALL_CHECK_DELAY_MS = 10000;
  const RECOVERY_RETRY_DELAY_MS = 500;
  const BUTTON_FEEDBACK_DELAY_MS = 1500;

  class PlayerRecovery {
    constructor({
      documentRef = document,
      windowRef = window,
      now = () => Date.now(),
      cooldownMs = 8000,
      qualitySwitchDelayMs = 350,
      t = (key) => key
    } = {}) {
      this.document = documentRef;
      this.setTimeout = windowRef.setTimeout?.bind(windowRef) || setTimeout;
      this.clearTimeout = windowRef.clearTimeout?.bind(windowRef) || clearTimeout;
      this.t = t;
      this.selectors = window.TFRPlayerRecoveryPolicy.SELECTORS;
      this.recoverableErrorPattern = window.TFRPlayerRecoveryPolicy.RECOVERABLE_ERROR_PATTERN;
      this.retryLabelPattern = window.TFRPlayerRecoveryPolicy.RETRY_LABEL_PATTERN;
      this.attemptLimiter = window.TFRPlayerRecoveryPolicy.createAttemptLimiter({ now, cooldownMs });
      this.qualitySwitchDelayMs = qualitySwitchDelayMs;
      this.enabled = false;
      this.buttonEnabled = false;
      this.observer = null;
      this.video = null;
      this.button = null;
      this.buttonSlot = null;
      this.stallTimer = null;
      this.recoveryTimer = null;
      this.feedbackTimer = null;
      this.boundError = () => this.recover('media-error');
      this.boundStalled = () => this.scheduleStallCheck();
      this.boundManualRecovery = () => this.manualRecover();
    }
    init() {
      this.observer = new MutationObserver(() => this.inspect());
      this.observer.observe(this.document.documentElement, { childList: true, subtree: true });
      this.inspect();
    }
    configure(preferences) {
      const legacyEnabled = preferences === true;
      this.enabled = legacyEnabled || preferences?.automaticEnabled === true;
      this.buttonEnabled = legacyEnabled || preferences?.buttonEnabled === true;
      if (this.enabled || this.buttonEnabled) this.inspect();
      else this.attachVideo(null);
      if (!this.enabled) {
        this.clearStallCheck();
        this.clearRecoveryRetry();
      }
      if (!this.buttonEnabled) this.removeButton();
    }
    findVideo() { return this.document.querySelector(this.selectors.video); }
    findPlayer() { return this.document.querySelector(this.selectors.player); }
    isUsableErrorCandidate(candidate) {
      return Boolean(candidate)
        && candidate.hidden !== true
        && candidate.getAttribute?.('aria-hidden') !== 'true'
        && !candidate.closest?.(CONTENT_GATE_SELECTOR);
    }
    findErrorState(video = this.findVideo() || this.video) {
      const explicitError = this.document.querySelector(this.selectors.error);
      if (this.isUsableErrorCandidate(explicitError)) return explicitError;
      const player = this.findPlayer();
      const scopedError = player?.querySelector?.(SCOPED_ERROR_SELECTOR);
      if (this.isUsableErrorCandidate(scopedError)) return scopedError;
      if (video?.error) return video;
      return this.recoverableErrorPattern.test(String(player?.textContent || '')) ? player : null;
    }
    findRetryButton(errorState = null) {
      const direct = this.document.querySelector(this.selectors.retry);
      if (direct) return direct;
      const player = errorState?.closest?.(this.selectors.player) || this.findPlayer();
      const buttons = Array.from(player?.querySelectorAll?.('button') || []);
      return buttons.find((button) => {
        const label = [
          button.textContent,
          button.getAttribute?.('aria-label'),
          button.getAttribute?.('title')
        ].filter(Boolean).join(' ');
        return this.retryLabelPattern.test(label);
      }) || null;
    }
    resolveRecoveryTargets(errorState = null) {
      const currentVideo = this.findVideo();
      if (currentVideo) this.attachVideo(currentVideo);
      const video = currentVideo || this.video;
      return {
        retry: this.findRetryButton(errorState || this.findErrorState(video)),
        video
      };
    }
    attachVideo(video) {
      if (video === this.video) return;
      this.video?.removeEventListener('error', this.boundError);
      this.video?.removeEventListener('stalled', this.boundStalled);
      this.video = video || null;
      this.video?.addEventListener('error', this.boundError);
      this.video?.addEventListener('stalled', this.boundStalled);
    }
    inspect() {
      if (!this.enabled && !this.buttonEnabled) {
        this.attachVideo(null);
        this.removeButton();
        return;
      }
      this.attachVideo(this.findVideo());
      if (this.buttonEnabled) this.ensureButton();
      if (!this.enabled) return;
      const error = this.findErrorState(this.video);
      if (error) this.recover('twitch-error', error);
    }
    scheduleStallCheck() {
      if (!this.enabled || this.stallTimer) return;
      this.stallTimer = this.setTimeout(() => {
        this.stallTimer = null;
        if (this.video && !this.video.paused && this.video.readyState < 2) this.recover('stalled');
      }, STALL_CHECK_DELAY_MS);
    }
    clearTimer(property) {
      this.clearTimeout(this[property]);
      this[property] = null;
    }
    clearStallCheck() { this.clearTimer('stallTimer'); }
    scheduleRecoveryRetry() {
      if (!this.enabled || this.recoveryTimer) return;
      this.recoveryTimer = this.setTimeout(() => {
        this.recoveryTimer = null;
        this.inspect();
      }, RECOVERY_RETRY_DELAY_MS);
    }
    clearRecoveryRetry() { this.clearTimer('recoveryTimer'); }
    restartPlayback(video = this.video) {
      if (!video) return false;
      if (!video.paused) video.pause?.();
      video.play?.()?.catch?.(() => {});
      return true;
    }
    performRecovery({ retry, video } = this.resolveRecoveryTargets()) {
      if (retry) {
        retry.click();
        return true;
      }
      if (!video) return false;
      void this.resetThroughQualityMenu().then((reset) => {
        if (!reset) this.restartPlayback(video);
      }).catch(() => this.restartPlayback(video));
      return true;
    }
    recover(_reason = '', errorState = null) {
      if (!this.enabled) return false;
      const targets = this.resolveRecoveryTargets(errorState);
      if (!targets.retry && !targets.video) {
        this.scheduleRecoveryRetry();
        return false;
      }
      this.clearRecoveryRetry();
      if (!this.attemptLimiter.consume()) return false;
      return this.performRecovery(targets);
    }
    resolveButtonMount(settingsButton) {
      let reference = settingsButton;
      for (let depth = 0; reference?.parentElement && depth < 5; depth += 1) {
        const container = reference.parentElement;
        const siblings = Array.from(container.children || []);
        const hasOtherPlayerControl = siblings.some((sibling) => sibling !== reference && (
          sibling.matches?.(PLAYER_CONTROL_SELECTOR)
          || sibling.querySelector?.(PLAYER_CONTROL_SELECTOR)
        ));
        if (hasOtherPlayerControl) return { container, reference };
        reference = container;
      }
      return { container: settingsButton?.parentElement || null, reference: settingsButton };
    }
    createButton() {
      const slot = this.document.createElement('div');
      slot.className = 'tfr-player-reset-slot';
      const button = this.document.createElement('button');
      button.type = 'button';
      button.className = 'tfr-player-reset-button';
      button.title = this.t('settings.playerRecovery.manualButton');
      button.setAttribute('aria-label', button.title);
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 1-7.45 5.08 1 1 0 0 1 1.86.74A6 6 0 1 0 8 7.08V9a1 1 0 0 1-2 0V4.5a1 1 0 0 1 1-1h4.5a1 1 0 0 1 0 2H9.42A7.96 7.96 0 0 1 12 4Z"/></svg>';
      button.addEventListener('click', this.boundManualRecovery);
      slot.appendChild(button);
      this.buttonSlot = slot;
      this.button = button;
      return slot;
    }
    ensureButton() {
      const settingsButton = this.document.querySelector(SETTINGS_BUTTON_SELECTOR);
      if (!settingsButton) {
        this.buttonSlot?.remove();
        return;
      }
      const { container, reference } = this.resolveButtonMount(settingsButton);
      if (!container || !reference) return;
      const slot = this.buttonSlot || this.createButton();
      if (slot.parentElement !== container || slot.nextSibling !== reference) {
        container.insertBefore(slot, reference);
      }
    }
    removeButton() {
      this.clearTimer('feedbackTimer');
      this.button?.removeEventListener('click', this.boundManualRecovery);
      this.buttonSlot?.remove();
      this.buttonSlot = null;
      this.button = null;
    }
    findQualityRadios() {
      return Array.from(this.document.querySelectorAll?.(
        QUALITY_RADIO_SELECTOR
      ) || []).filter((radio) => !radio.disabled);
    }
    waitFor(getValue, timeoutMs = 800) {
      const immediate = getValue();
      if (immediate) return Promise.resolve(immediate);
      return new Promise((resolve) => {
        const startedAt = Date.now();
        const check = () => {
          const value = getValue();
          if (value || Date.now() - startedAt >= timeoutMs) resolve(value || null);
          else this.setTimeout(check, 25);
        };
        this.setTimeout(check, 25);
      });
    }
    async openQualityOptions() {
      const existingRadios = this.findQualityRadios();
      if (existingRadios.length > 1) return existingRadios;
      const settingsButton = this.document.querySelector(SETTINGS_BUTTON_SELECTOR);
      if (!settingsButton) return [];
      settingsButton.click();
      const qualityButton = await this.waitFor(() => this.document.querySelector(QUALITY_BUTTON_SELECTOR));
      if (!qualityButton) return [];
      qualityButton.click();
      return await this.waitFor(() => {
        const radios = this.findQualityRadios();
        return radios.length > 1 ? radios : null;
      }) || [];
    }
    async resetThroughQualityMenu() {
      const radios = await this.openQualityOptions();
      const originalIndex = radios.findIndex((radio) => radio.checked || radio.getAttribute?.('aria-checked') === 'true');
      if (originalIndex < 0 || radios.length < 2) return false;
      const alternateIndex = originalIndex === 0 ? 1 : 0;
      radios[alternateIndex].click();
      await new Promise((resolve) => this.setTimeout(resolve, this.qualitySwitchDelayMs));
      const refreshedRadios = await this.openQualityOptions();
      const original = refreshedRadios[originalIndex];
      if (!original) return false;
      original.click();
      const openMenu = this.document.querySelector(QUALITY_MENU_SELECTOR);
      if (openMenu) {
        this.document.querySelector(SETTINGS_BUTTON_SELECTOR)?.click();
      }
      this.video?.play?.()?.catch?.(() => {});
      return true;
    }
    setButtonFeedback(resetInProgress) {
      if (!this.button) return;
      this.button.disabled = resetInProgress;
      this.button.classList.toggle('is-resetting', resetInProgress);
      this.button.title = this.t(resetInProgress
        ? 'settings.playerRecovery.manualSuccess'
        : 'settings.playerRecovery.manualButton');
      this.button.setAttribute('aria-label', this.button.title);
    }
    async manualRecover() {
      const { retry } = this.resolveRecoveryTargets();
      if (retry) {
        retry.click();
      } else {
        const reset = await this.resetThroughQualityMenu().catch((error) => {
          console.warn('[TFR] player quality reset failed', error);
          return false;
        });
        if (!reset) return false;
      }
      this.clearTimer('feedbackTimer');
      this.setButtonFeedback(true);
      this.feedbackTimer = this.setTimeout(() => {
        this.feedbackTimer = null;
        this.setButtonFeedback(false);
      }, BUTTON_FEEDBACK_DELAY_MS);
      return true;
    }
    dispose() {
      this.observer?.disconnect(); this.observer = null; this.clearStallCheck(); this.clearRecoveryRetry(); this.attachVideo(null);
      this.removeButton();
    }
  }
  window.TFRPlayerRecovery = Object.freeze({ PlayerRecovery });
})();

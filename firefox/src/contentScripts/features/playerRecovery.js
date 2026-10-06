(() => {
  const SETTINGS_BUTTON_SELECTOR = [
    '[data-a-target="player-settings-button"]',
    '[data-test-selector="player-settings-button"]'
  ].join(', ');
  const CONTENT_GATE_SELECTOR = '[data-a-target*="content-gate"], [data-test-selector*="content-gate"]';
  const SCOPED_ERROR_SELECTOR = [
    '[data-a-target*="player-error"]',
    '[data-test-selector*="player-error"]',
    '[class*="player-error"]'
  ].join(', ');
  const PLAYER_CONTROL_SELECTOR = '[data-a-target^="player-"]';
  const STALL_CHECK_DELAY_MS = 10000;

  class PlayerRecovery {
    constructor({
      documentRef = document,
      windowRef = window,
      now = () => Date.now(),
      cooldownMs = 8000,
      t = (key) => key
    } = {}) {
      this.document = documentRef;
      this.window = windowRef;
      this.now = now;
      this.session = 0;
      this.pending = null;
      this.disposed = false;
      this.failureCount = 0;
      this.nextAttemptAt = 0;
      this.progress = null;
      this.boundAudioRestore = () => { void this.requestRecovery('audio-source-change', { manual: true, audio: true }); };
      this.setTimeout = windowRef.setTimeout?.bind(windowRef) || setTimeout;
      this.clearTimeout = windowRef.clearTimeout?.bind(windowRef) || clearTimeout;
      this.t = t;
      this.selectors = window.TFRPlayerRecoveryPolicy.SELECTORS;
      this.recoverableErrorPattern = window.TFRPlayerRecoveryPolicy.RECOVERABLE_ERROR_PATTERN;
      this.retryLabelPattern = window.TFRPlayerRecoveryPolicy.RETRY_LABEL_PATTERN;
      this.attemptLimiter = window.TFRPlayerRecoveryPolicy.createAttemptLimiter({ now, cooldownMs });
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
      this.boundVisibility = () => {
        this.progress = null;
        if (this.document.visibilityState === 'hidden' && this.pending && !this.pending.manual) this.cancelPending();
      };
    }
    init() {
      this.observer = new MutationObserver(() => this.inspect());
      this.observer.observe(this.document.documentElement, { childList: true, subtree: true });
      this.inspect();
      this.document.addEventListener('tfr:player:audio-restore', this.boundAudioRestore);
      this.document.addEventListener('visibilitychange', this.boundVisibility);
      this.pollTimer = this.window.setInterval(() => this.inspect(), 1000);
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
      if (!this.enabled && !this.buttonEnabled) this.cancelPending();
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
        if (button === this.button || button.closest?.('.tfr-player-reset-slot')) return false;
        const label = [
          button.textContent,
          button.getAttribute?.('aria-label'),
          button.getAttribute?.('title')
        ].filter(Boolean).join(' ');
        return this.retryLabelPattern.test(label);
      }) || null;
    }
    attachVideo(video) {
      if (video === this.video) return;
      this.clearStallCheck();
      this.progress = null;
      this.video?.removeEventListener('error', this.boundError);
      this.video?.removeEventListener('stalled', this.boundStalled);
      this.video = video || null;
      this.video?.addEventListener('error', this.boundError);
      this.video?.addEventListener('stalled', this.boundStalled);
    }
    inspect() {
      if (this.disposed) return;
      const path = this.window.location?.pathname || '';
      if (path !== this.path) {
        this.path = path;
        this.cancelPending();
        this.progress = null;
        this.failureCount = 0;
        this.nextAttemptAt = 0;
        this.attemptLimiter.reset();
      }
      if (!this.enabled && !this.buttonEnabled) {
        this.attachVideo(null);
        this.removeButton();
        return;
      }
      this.attachVideo(this.findVideo());
      if (this.buttonEnabled) this.ensureButton();
      if (!this.enabled) return;
      if (!this.automaticAllowed()) { this.progress = null; return; }
      const error = this.findErrorState(this.video);
      if (error) { void this.requestRecovery('twitch-error'); return; }
      const time = this.now();
      if (!this.video || this.video.paused || this.video.ended) { this.progress = null; return; }
      if (!this.progress || this.progress.position !== this.video.currentTime) {
        const since = this.progress?.healthySince ?? time;
        this.progress = { position: this.video.currentTime, at: time, healthySince: since };
        if (time - since > 30000) { this.failureCount = 0; this.nextAttemptAt = 0; this.attemptLimiter.reset(); }
      } else if (time - this.progress.at > 20000) {
        void this.requestRecovery('playback-stalled');
      }
    }
    automaticAllowed() {
      const path = this.window.location?.pathname || '';
      if (!/^\/[a-z0-9_]+\/?$/i.test(path) || /\/(videos|directory|clips|settings|downloads)\/?$/i.test(path)) return false;
      if (this.document.visibilityState === 'hidden' || this.video?.ended) return false;
      if (this.document.querySelector('[data-a-target="offline-channel-main-content"], [data-a-target="channel-offline-status"], [data-a-target="video-ad-label"], [data-test-selector="ad-banner-default-text"], [data-a-target*="content-gate"]')) return false;
      // An error is an explicit signal; stalls additionally require a real live timeline.
      return Boolean(this.findErrorState()) || (this.video?.duration === Infinity && !this.video.paused);
    }
    debug(event, detail = '') { this.window.TFRPerformance?.debug?.('player-recovery', event, detail); }
    cancelPending() {
      this.session++;
      if (this.pending?.root) this.pending.root.removeAttribute?.('data-tfr-recovery-request');
      this.pending?.cancel?.();
      this.pending = null;
      this.setButtonFeedback(false);
    }
    async requestRecovery(reason, { manual = false, audio = false } = {}) {
      if (this.disposed || this.pending || (!manual && (!this.enabled || this.failureCount >= 3 || !this.automaticAllowed()))) return false;
      if (this.now() < this.nextAttemptAt || !this.attemptLimiter.consume()) {
        this.debug('ignored', 'cooldown'); return false;
      }
      const root = this.findPlayer();
      const video = this.findVideo();
      if (!root) return false;
      const wasPaused = video?.paused === true;
      const token = { session: this.session, path: this.window.location?.pathname, root, video, manual };
      this.pending = token;
      const valid = () => !this.disposed && this.pending === token && token.session === this.session
        && token.path === this.window.location?.pathname && root.isConnected !== false
        && (token.sourceRequested || this.findVideo() === video)
        && this.findPlayer() === root;
      const delay = (ms) => new Promise((resolve) => {
        const id = this.setTimeout(() => { token.cancel = null; resolve(); }, ms);
        token.cancel = () => { this.clearTimeout(id); resolve(); };
      });
      const progressing = async (requestId = null) => {
        const observed = this.findVideo();
        const last = observed?.currentTime;
        for (let n = 0; n < 8 && valid(); n++) {
          await delay(500);
          if (!valid()) return false;
          const current = this.findVideo();
          if (!manual && !this.automaticAllowed()) return false;
          if (requestId && root.getAttribute('data-tfr-recovery-result') !== requestId) continue;
          if (!current || this.findErrorState(current)) continue;
          if (manual && wasPaused) {
            if (current.paused && current.readyState >= 2) return true;
          } else if (!current.paused && current.currentTime > (current === observed ? last : 0) + 0.05) return true;
        }
        return false;
      };
      this.setButtonFeedback(true);
      this.debug('requested', reason);
      let success = false;
      try {
        if (!audio) {
          const errorState = this.findErrorState(video);
          const retry = errorState ? this.findRetryButton(errorState) : null;
          if (retry) { this.debug('strategy', 'native-retry'); retry.click(); }
          else if (!manual && video && !video.paused) { this.debug('strategy', 'resume'); video.play?.()?.catch?.(() => {}); }
          if (retry || !manual) success = await progressing();
        }
        if (!success && valid() && (manual || this.automaticAllowed())) {
          this.debug('strategy', 'source-restart');
          const requestId = `${this.session}-${this.now()}`;
          token.sourceRequested = true;
          root.setAttribute('data-tfr-recovery-request', requestId);
          root.dispatchEvent(new this.window.Event('tfr:player:restart', { bubbles: true }));
          success = await progressing(requestId);
          if (root.getAttribute('data-tfr-recovery-request') === requestId) root.removeAttribute('data-tfr-recovery-request');
        }
        if (!valid()) return false;
        this.failureCount = success ? 0 : this.failureCount + 1;
        // A failed automatic recovery stops after three attempts until playback or navigation recovers.
        this.nextAttemptAt = this.now() + (success ? 8000 : 8000 * 2 ** Math.min(this.failureCount, 3));
        this.progress = null;
        this.debug(success ? 'success' : 'failed', reason);
        return success;
      } catch (error) {
        if (!valid()) return false;
        this.failureCount++;
        this.nextAttemptAt = this.now() + 16000;
        this.debug('failed', String(error));
        return false;
      } finally {
        if (valid()) root.removeAttribute?.('data-tfr-recovery-request');
        if (this.pending === token) { this.pending = null; this.setButtonFeedback(false); }
      }
    }
    scheduleStallCheck() {
      if (!this.enabled || this.stallTimer) return;
      this.stallTimer = this.setTimeout(() => {
        this.stallTimer = null;
        this.inspect();
      }, STALL_CHECK_DELAY_MS);
    }
    clearTimer(property) {
      this.clearTimeout(this[property]);
      this[property] = null;
    }
    clearStallCheck() { this.clearTimer('stallTimer'); }
    clearRecoveryRetry() { this.clearTimer('recoveryTimer'); }
    recover(_reason = '', errorState = null) {
      return this.requestRecovery(_reason || 'media-error');
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
    setButtonFeedback(resetInProgress) {
      if (!this.button) return;
      this.button.disabled = resetInProgress;
      this.button.classList.toggle('is-resetting', resetInProgress);
      this.button.title = this.t(resetInProgress
        ? 'settings.playerRecovery.inProgress'
        : 'settings.playerRecovery.manualButton');
      this.button.setAttribute('aria-label', this.button.title);
    }
    async manualRecover() {
      return this.requestRecovery('manual', { manual: true });
    }
    dispose() {
      this.disposed = true;
      this.cancelPending();
      this.window.clearInterval?.(this.pollTimer);
      this.document.removeEventListener?.('tfr:player:audio-restore', this.boundAudioRestore);
      this.document.removeEventListener?.('visibilitychange', this.boundVisibility);
      this.observer?.disconnect(); this.observer = null; this.clearStallCheck(); this.clearRecoveryRetry(); this.attachVideo(null);
      this.removeButton();
    }
  }
  window.TFRPlayerRecovery = Object.freeze({ PlayerRecovery });
})();

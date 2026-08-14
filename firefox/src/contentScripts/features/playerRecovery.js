(() => {
  class PlayerRecovery {
    constructor({ documentRef = document, now = () => Date.now(), cooldownMs = 8000 } = {}) {
      this.document = documentRef;
      this.selectors = window.TFRPlayerRecoveryPolicy.SELECTORS;
      this.attemptLimiter = window.TFRPlayerRecoveryPolicy.createAttemptLimiter({ now, cooldownMs });
      this.enabled = false;
      this.observer = null;
      this.video = null;
      this.stallTimer = null;
      this.boundError = () => this.recover('media-error');
      this.boundStalled = () => this.scheduleStallCheck();
    }
    init() {
      this.observer = new MutationObserver(() => this.inspect());
      this.observer.observe(this.document.documentElement, { childList: true, subtree: true });
      this.inspect();
    }
    configure(enabled) { this.enabled = enabled === true; if (this.enabled) this.inspect(); else this.clearStallCheck(); }
    findVideo() { return this.document.querySelector(this.selectors.video); }
    attachVideo(video) {
      if (video === this.video) return;
      this.video?.removeEventListener('error', this.boundError);
      this.video?.removeEventListener('stalled', this.boundStalled);
      this.video = video || null;
      this.video?.addEventListener('error', this.boundError);
      this.video?.addEventListener('stalled', this.boundStalled);
    }
    inspect() {
      this.attachVideo(this.findVideo());
      if (!this.enabled) return;
      const error = this.document.querySelector(this.selectors.error);
      if (error) this.recover('twitch-error');
    }
    scheduleStallCheck() {
      if (!this.enabled || this.stallTimer) return;
      this.stallTimer = setTimeout(() => {
        this.stallTimer = null;
        if (this.video && !this.video.paused && this.video.readyState < 2) this.recover('stalled');
      }, 10000);
    }
    clearStallCheck() { clearTimeout(this.stallTimer); this.stallTimer = null; }
    recover() {
      if (!this.enabled || !this.attemptLimiter.consume()) return false;
      const retry = this.document.querySelector(this.selectors.retry);
      if (retry) retry.click();
      else if (this.video) {
        const wasPaused = this.video.paused;
        this.video.load();
        if (!wasPaused) this.video.play()?.catch?.(() => {});
      }
      return true;
    }
    dispose() {
      this.observer?.disconnect(); this.observer = null; this.clearStallCheck(); this.attachVideo(null);
    }
  }
  window.TFRPlayerRecovery = Object.freeze({ PlayerRecovery });
})();

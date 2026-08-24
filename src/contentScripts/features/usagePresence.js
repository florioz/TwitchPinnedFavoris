(function (root, factory) {
  const api = factory();
  root.TFRUsagePresence = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HEARTBEAT_INTERVAL_MS = 60_000;

  const create = ({
    sendExtensionMessage,
    documentRef = globalThis.document,
    setIntervalImpl = globalThis.setInterval,
    clearIntervalImpl = globalThis.clearInterval
  }) => {
    class UsagePresence {
      constructor() {
        this.state = { enabled: true, count: null, status: 'loading', updatedAt: 0 };
        this.refreshPromise = null;
        this.timer = null;
        this.started = false;
        this.requestRevision = 0;
        this.listeners = new Set();
        this.handleVisibilityChange = () => {
          if (documentRef?.visibilityState !== 'hidden') void this.refresh({ force: true });
        };
      }

      snapshot() {
        return { ...this.state };
      }

      notify() {
        this.listeners.forEach((listener) => {
          try { listener(this.snapshot()); } catch (error) { console.warn('[TFR] presence listener failed', error); }
        });
      }

      applyResponse(response, revision = this.requestRevision) {
        if (revision !== this.requestRevision) return this.snapshot();
        this.state = response?.ok && response.data
          ? { ...this.state, ...response.data, status: 'ready' }
          : { ...this.state, status: 'unavailable' };
        this.notify();
        return this.snapshot();
      }

      async refresh({ force = false } = {}) {
        if (!force && documentRef?.visibilityState === 'hidden') return this.snapshot();
        if (this.refreshPromise) return this.refreshPromise;
        const revision = this.requestRevision;
        this.refreshPromise = Promise.resolve(sendExtensionMessage({ type: 'TFR_USAGE_PRESENCE_REFRESH' }))
          .then((response) => this.applyResponse(response, revision))
          .catch(() => this.applyResponse(null, revision))
          .finally(() => { this.refreshPromise = null; });
        return this.refreshPromise;
      }

      async setEnabled(enabled) {
        const revision = ++this.requestRevision;
        this.state = { ...this.state, enabled: enabled === true, status: 'loading' };
        this.notify();
        try {
          const response = await sendExtensionMessage({
            type: 'TFR_USAGE_PRESENCE_SET_ENABLED',
            enabled: enabled === true
          });
          return this.applyResponse(response, revision);
        } catch {
          return this.applyResponse(null, revision);
        }
      }

      init() {
        if (this.started) return;
        this.started = true;
        documentRef?.addEventListener?.('visibilitychange', this.handleVisibilityChange);
        this.timer = setIntervalImpl(() => { void this.refresh(); }, HEARTBEAT_INTERVAL_MS);
        void this.refresh();
      }

      dispose() {
        if (this.timer !== null) clearIntervalImpl(this.timer);
        this.timer = null;
        this.started = false;
        documentRef?.removeEventListener?.('visibilitychange', this.handleVisibilityChange);
        this.listeners.clear();
      }

      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
    }

    return UsagePresence;
  };

  return Object.freeze({ create, HEARTBEAT_INTERVAL_MS });
});

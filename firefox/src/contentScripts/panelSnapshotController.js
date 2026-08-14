(function (root, factory) {
  const api = factory();
  root.__TFR_PANEL_SNAPSHOT_CONTROLLER__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const createPanelSnapshotController = ({
    requestSnapshot,
    renderSnapshot,
    getPanelRoot,
    getSubtitle,
    hasLiveData,
    setRefreshState = () => {},
    feedbackMinDurationMs = 450,
    wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
    errorMessage = 'Impossible de récupérer les favoris.'
  }) => {
    let refreshPromise = null;
    let feedbackSequence = 0;
    let feedbackVisible = false;
    const applySnapshot = (snapshot) => {
      if (!snapshot || snapshot.error) {
        const subtitle = getSubtitle();
        if (subtitle) subtitle.textContent = errorMessage;
        return false;
      }
      renderSnapshot(snapshot);
      return true;
    };

    const presentFeedback = async (promise) => {
      const sequence = ++feedbackSequence;
      const feedbackStartedAt = Date.now();
      if (!feedbackVisible) {
        feedbackVisible = true;
        setRefreshState('loading');
      }
      const succeeded = await promise;
      const remaining = Math.max(0, feedbackMinDurationMs - (Date.now() - feedbackStartedAt));
      if (remaining) await wait(remaining);
      if (sequence === feedbackSequence) {
        setRefreshState(succeeded ? 'success' : 'error');
        feedbackVisible = false;
      }
      return succeeded;
    };

    const refresh = (forceRefresh = false, options = {}) => {
      if (refreshPromise) {
        return options.showFeedback === true
          ? presentFeedback(refreshPromise)
          : refreshPromise;
      }
      const run = async () => {
      const showLoading = options.showLoading !== false && (
        forceRefresh || !hasLiveData()
      );
      const rootElement = getPanelRoot();
      if (showLoading) {
        rootElement?.classList.add('tfr-panel--loading');
      }
      let snapshot = null;
      try {
        snapshot = await requestSnapshot(forceRefresh);
      } catch (_) {
        snapshot = null;
      } finally {
        if (showLoading) {
          rootElement?.classList.remove('tfr-panel--loading');
        }
      }
      const succeeded = applySnapshot(snapshot);
      return succeeded;
      };
      refreshPromise = run().finally(() => {
        refreshPromise = null;
      });
      return options.showFeedback === true
        ? presentFeedback(refreshPromise)
        : refreshPromise;
    };

    const preload = async () => {
      let snapshot = null;
      try {
        snapshot = await requestSnapshot(false);
      } catch (_) {
        return false;
      }
      if (!snapshot || snapshot.error) {
        return false;
      }
      renderSnapshot(snapshot);
      return true;
    };

    return { applySnapshot, preload, refresh };
  };

  return { createPanelSnapshotController };
});

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
    errorMessage = 'Impossible de récupérer les favoris.'
  }) => {
    let refreshPromise = null;
    const applySnapshot = (snapshot) => {
      if (!snapshot || snapshot.error) {
        const subtitle = getSubtitle();
        if (subtitle) subtitle.textContent = errorMessage;
        return false;
      }
      renderSnapshot(snapshot);
      return true;
    };

    const refresh = async (forceRefresh = false, options = {}) => {
      if (refreshPromise) return refreshPromise;
      const run = async () => {
      const showFeedback = options.showFeedback === true;
      const showLoading = options.showLoading !== false && (
        forceRefresh || !hasLiveData()
      );
      const rootElement = getPanelRoot();
      if (showFeedback) setRefreshState('loading');
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
      if (showFeedback) setRefreshState(succeeded ? 'success' : 'error');
      return succeeded;
      };
      refreshPromise = run().finally(() => {
        refreshPromise = null;
      });
      return refreshPromise;
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

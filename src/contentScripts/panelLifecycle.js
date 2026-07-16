(function (root, factory) {
  const api = factory();
  root.__TFR_PANEL_LIFECYCLE__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const createPanelLifecycle = ({
    documentRef,
    standalone = false,
    refreshIntervalMs,
    forcedRefreshDelayMs = 150,
    ensurePanel,
    getPanelRoot,
    refresh,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout
  }) => {
    let open = false;
    let refreshTimer = null;

    const clearRefresh = () => {
      if (refreshTimer !== null) {
        clearIntervalFn(refreshTimer);
        refreshTimer = null;
      }
    };

    const scheduleRefresh = () => {
      clearRefresh();
      refreshTimer = setIntervalFn(
        () => refresh(standalone, { showLoading: false }),
        refreshIntervalMs
      );
    };

    const handleOutsidePointerDown = (event) => {
      if (!open || standalone) return;
      if (getPanelRoot()?.contains(event.target)) return;
      setOpen(false);
    };

    const setOpen = (nextOpen) => {
      ensurePanel();
      open = Boolean(nextOpen);
      getPanelRoot().classList.toggle('tfr-open', open);
      if (open) {
        refresh(false, { showLoading: false });
        setTimeoutFn(
          () => refresh(true, { showLoading: false }),
          forcedRefreshDelayMs
        );
        scheduleRefresh();
        documentRef.addEventListener('pointerdown', handleOutsidePointerDown, true);
      } else {
        clearRefresh();
        documentRef.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      }
    };

    return {
      setOpen,
      toggle: () => setOpen(!open),
      isOpen: () => open
    };
  };

  return { createPanelLifecycle };
});

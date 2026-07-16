(function (root, factory) {
  const api = factory();
  root.__TFR_PANEL_SNAPSHOT_PRESENTER__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const syncCategoryCollapse = (categoryCollapse, categories = []) => {
    const seen = new Set();
    categories.forEach((category) => {
      if (!category?.id) return;
      seen.add(category.id);
      if (!categoryCollapse.has(category.id)) {
        categoryCollapse.set(category.id, Boolean(category.collapsed));
      }
    });
    if (!categoryCollapse.has('uncategorized')) {
      categoryCollapse.set('uncategorized', false);
    }
    seen.add('uncategorized');
    Array.from(categoryCollapse.keys()).forEach((id) => {
      if (!seen.has(id)) categoryCollapse.delete(id);
    });
    return categoryCollapse;
  };

  const getPanelSummary = (totalFavorites, totalLive, t = (key) => key) => {
    if (!totalFavorites) {
      return {
        empty: true,
        emptyText: t('panel.empty.saved'),
        subtitle: t('panel.empty.savedHint')
      };
    }
    if (!totalLive) {
      return {
        empty: true,
        emptyText: t('panel.empty.live'),
        subtitle: t('panel.empty.liveHint')
      };
    }
    return {
      empty: false,
      emptyText: '',
      subtitle: t('panel.liveCount', { count: totalLive })
    };
  };

  const createPanelSnapshotPresenter = ({
    ensurePanel,
    getPanelElements,
    normalizeToastPreferences,
    defaultToastDurationMs,
    buildCategoryGroups,
    renderGroups,
    formatTimestamp,
    applyToastPosition,
    t = (key) => key
  }) => {
    let snapshot = {
      favorites: {},
      categories: [],
      preferences: {},
      liveData: {},
      timestamp: Date.now()
    };
    let toastPreferences = normalizeToastPreferences({}, defaultToastDurationMs);
    const categoryCollapse = new Map();

    const render = (nextSnapshot) => {
      if (!nextSnapshot) return false;
      snapshot = nextSnapshot;
      ensurePanel();
      const elements = getPanelElements();
      const {
        favorites = {},
        liveData = {},
        categories = [],
        preferences = {}
      } = snapshot;

      syncCategoryCollapse(categoryCollapse, categories);
      toastPreferences = normalizeToastPreferences(preferences, defaultToastDurationMs);
      applyToastPosition(toastPreferences.position);

      const result = buildCategoryGroups({
        favorites,
        liveData,
        categories,
        categoryCollapse
      });
      const summary = getPanelSummary(result.totalFavorites, result.totalLive, t);
      elements.empty.textContent = summary.emptyText;
      elements.empty.classList.toggle('tfr-hidden', !summary.empty);
      elements.subtitle.textContent = summary.subtitle;
      renderGroups(elements.sections, result.groups);
      elements.timestamp.textContent = formatTimestamp(snapshot.timestamp);
      return true;
    };

    const toggleCategory = (categoryId) => {
      if (!categoryId) return false;
      categoryCollapse.set(categoryId, !(categoryCollapse.get(categoryId) || false));
      render(snapshot);
      return true;
    };

    return {
      render,
      toggleCategory,
      getSnapshot: () => snapshot,
      getToastPreferences: () => toastPreferences,
      hasLiveData: () => Boolean(Object.keys(snapshot?.liveData || {}).length)
    };
  };

  return {
    createPanelSnapshotPresenter,
    getPanelSummary,
    syncCategoryCollapse
  };
});

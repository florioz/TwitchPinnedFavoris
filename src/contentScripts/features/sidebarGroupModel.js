(() => {
  const createSidebarGroupModel = ({ t, getLiveDataEntry, shouldDisplayFavorite, isValidColor }) => {
    const collectCategoryIds = (nodes, target = new Set()) => {
      nodes.forEach((node) => {
        target.add(node.id);
        collectCategoryIds(node.children || [], target);
      });
      return target;
    };

    const createComparator = (sortMode, liveData) => (a, b) => {
      if (sortMode === 'alphabetical') return a.displayName.localeCompare(b.displayName, 'fr');
      if (sortMode === 'recent') return (b.addedAt || 0) - (a.addedAt || 0);
      const difference = (getLiveDataEntry(liveData, b)?.viewers || 0)
        - (getLiveDataEntry(liveData, a)?.viewers || 0);
      return difference || a.displayName.localeCompare(b.displayName, 'fr');
    };

    const collect = ({ state, liveData, categoryTree, now = Date.now() }) => {
      const preferences = state.preferences || {};
      const favorites = Object.values(state.favorites || {});
      const validCategoryIds = collectCategoryIds(categoryTree);
      const assignments = new Map();
      const uncategorized = [];
      favorites.forEach((favorite) => {
        const categoryId = favorite.categories?.[0];
        if (!categoryId || !validCategoryIds.has(categoryId)) {
          uncategorized.push(favorite);
          return;
        }
        if (!assignments.has(categoryId)) assignments.set(categoryId, []);
        assignments.get(categoryId).push(favorite);
      });

      const comparator = createComparator(preferences.sortMode || 'viewersDesc', liveData);
      const visibleEntries = (entries) => entries
        .filter((favorite) => shouldDisplayFavorite(favorite, getLiveDataEntry(liveData, favorite)))
        .sort(comparator);
      const buildNode = (node) => {
        const children = (node.children || []).map(buildNode).filter(Boolean);
        const entries = visibleEntries(assignments.get(node.id) || []);
        const totalEntries = entries.length + children.reduce((sum, child) => sum + child.totalEntries, 0);
        return totalEntries ? {
          id: node.id,
          name: node.name,
          collapsed: node.collapsed,
          parentId: node.parentId,
          color: node.color || '',
          entries,
          children,
          totalEntries
        } : null;
      };

      const groups = categoryTree.map(buildNode).filter(Boolean);
      const specialColors = preferences.specialCategoryColors || {};
      if (preferences.recentLiveEnabled) {
        const configuredMinutes = Number(preferences.recentLiveThresholdMinutes);
        const minutes = Number.isFinite(configuredMinutes)
          ? Math.max(1, Math.min(120, Math.round(configuredMinutes)))
          : 10;
        const recentEntries = visibleEntries(favorites.filter((favorite) => {
          if (favorite.recentHighlightEnabled === false) return false;
          const live = getLiveDataEntry(liveData, favorite);
          const startedAt = live?.isLive && live.startedAt ? Date.parse(live.startedAt) : NaN;
          const age = now - startedAt;
          return Number.isFinite(startedAt) && age >= 0 && age <= minutes * 60_000;
        }));
        if (recentEntries.length) groups.unshift({
          id: 'recentLive',
          name: t('recent.sectionTitle'),
          collapsed: Boolean(preferences.recentLiveCollapsed),
          parentId: null,
          entries: recentEntries,
          children: [],
          totalEntries: recentEntries.length,
          color: isValidColor(specialColors.recentLive) ? specialColors.recentLive : '',
          isRecentLive: true
        });
      }

      const uncategorizedEntries = visibleEntries(uncategorized);
      if (uncategorizedEntries.length) groups.push({
        id: 'uncategorized',
        name: t('categoryAppearance.special.uncategorized'),
        collapsed: Boolean(preferences.uncategorizedCollapsed),
        entries: uncategorizedEntries,
        children: [],
        totalEntries: uncategorizedEntries.length,
        color: isValidColor(specialColors.uncategorized) ? specialColors.uncategorized : '',
        isUncategorized: true
      });
      return groups;
    };

    return { collect, collectCategoryIds, createComparator };
  };

  window.TFRSidebarGroupModel = { create: createSidebarGroupModel };
})();

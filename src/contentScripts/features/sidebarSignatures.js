(() => {
  const walkGroups = (groups, visitor) => {
    const walk = (group) => {
      visitor(group);
      (group.children || []).forEach(walk);
    };
    (groups || []).forEach(walk);
  };

  const getWorkspaceSignature = (state) => ({
    mode: state.workspaceMode || 'personal',
    profileId: state.activeProfileId || '',
    sharedSpaceId: state.activeSharedSpaceId || ''
  });

  const createSidebarSignatures = ({ getLiveDataEntry }) => ({
    render(state, liveData, groups, { isSidebarHovering = false, compactLevel = 0 } = {}) {
      const preferences = state.preferences || {};
      const liveParts = [];
      walkGroups(groups, (group) => {
        liveParts.push([
          'g', group.id, group.name, group.collapsed ? 1 : 0,
          group.color || '', group.totalEntries || 0
        ].join(':'));
        (group.entries || []).forEach((favorite) => {
          const live = getLiveDataEntry(liveData, favorite) || {};
          liveParts.push([
            'f', favorite.login, live.isLive ? 1 : 0,
            live.displayName || favorite.displayName || favorite.login,
            live.avatarUrl || favorite.avatarUrl || '', live.viewers || 0,
            live.game || '', live.title || ''
          ].join(':'));
        });
      });
      return JSON.stringify({
        workspace: getWorkspaceSignature(state),
        enabled: preferences.liveFavoritesEnabled !== false,
        hover: Boolean(isSidebarHovering),
        compactLevel,
        prefs: {
          hideCollapsedGroupsUntilHover: Boolean(preferences.hideCollapsedGroupsUntilHover),
          autoCompactSidebarEnabled: Boolean(preferences.autoCompactSidebarEnabled),
          streamerItemStyle: preferences.streamerItemStyle || '',
          autoCompactStreamerStyle: preferences.autoCompactStreamerStyle || '',
          autoCompactGroupStyle: preferences.autoCompactGroupStyle || '',
          sidebarAnimationStyle: preferences.sidebarAnimationStyle || '',
          sidebarSurfaceStyle: preferences.sidebarSurfaceStyle || '',
          sidebarSurfaceColor: preferences.sidebarSurfaceColor || '',
          categoryColorOpacity: preferences.categoryColorOpacity,
          categoryColorGradient: preferences.categoryColorGradient,
          categoryColorStyle: preferences.categoryColorStyle || '',
          specialCategoryColors: preferences.specialCategoryColors || {}
        },
        liveParts
      });
    },

    autoCompact(state, groups, isSidebarHovering = false) {
      const preferences = state.preferences || {};
      const groupParts = [];
      walkGroups(groups, (group) => {
        groupParts.push([
          group.id, group.collapsed ? 1 : 0, group.totalEntries || 0,
          (group.children || []).length
        ].join(':'));
      });
      return JSON.stringify({
        workspace: getWorkspaceSignature(state),
        enabled: Boolean(preferences.autoCompactSidebarEnabled),
        streamerItemStyle: preferences.streamerItemStyle || '',
        autoCompactStreamerStyle: preferences.autoCompactStreamerStyle || '',
        autoCompactGroupStyle: preferences.autoCompactGroupStyle || '',
        sidebarSurfaceStyle: preferences.sidebarSurfaceStyle || '',
        hideCollapsedGroupsUntilHover: Boolean(preferences.hideCollapsedGroupsUntilHover),
        hover: Boolean(isSidebarHovering),
        groupParts
      });
    },

    liveStructure(groups) {
      const parts = [];
      walkGroups(groups, (group) => {
        parts.push([
          group.id,
          group.collapsed ? 1 : 0,
          (group.entries || []).map((favorite) => favorite.login).sort().join(','),
          (group.children || []).map((child) => child.id).sort().join(',')
        ].join(':'));
      });
      return parts.sort().join('|');
    }
  });

  window.TFRSidebarSignatures = { create: createSidebarSignatures };
})();

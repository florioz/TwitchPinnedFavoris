(() => {
  const getFirstCategoryId = (favorite) => (
    Array.isArray(favorite?.categories) ? favorite.categories[0] || '' : ''
  );

  const hasSameLogins = (left = {}, right = {}) => {
    const leftLogins = Object.keys(left).sort();
    const rightLogins = Object.keys(right).sort();
    return leftLogins.length > 0
      && leftLogins.length === rightLogins.length
      && leftLogins.every((login, index) => login === rightLogins[index]);
  };

  const repairPersonalFavoriteLeak = (target, now = Date.now()) => {
    if (target?.workspaceMode !== 'shared' || !target.activeSharedSpaceId) return false;
    const space = target.sharedSpaces?.[target.activeSharedSpaceId];
    if (!space || space.remoteBacked === true || space.syncState !== 'local') return false;

    const personal = target.personalWorkspaceSnapshot
      || target.profiles?.[target.activeProfileId]
      || null;
    const sharedFavorites = target.favorites || {};
    const personalFavorites = personal?.favorites || {};
    if (!hasSameLogins(sharedFavorites, personalFavorites)) return false;

    const sharedCategoryIds = new Set((target.categories || []).map((category) => category?.id).filter(Boolean));
    const personalCategoryIds = new Set((personal?.categories || []).map((category) => category?.id).filter(Boolean));
    let inheritedAssignmentCount = 0;
    const matchesPersonalAssignments = Object.keys(sharedFavorites).every((login) => {
      const sharedCategory = getFirstCategoryId(sharedFavorites[login]);
      const personalCategory = getFirstCategoryId(personalFavorites[login]);
      if (sharedCategory !== personalCategory) return false;
      if (!sharedCategory) return true;
      if (sharedCategoryIds.has(sharedCategory) || !personalCategoryIds.has(sharedCategory)) return false;
      inheritedAssignmentCount += 1;
      return true;
    });
    if (!matchesPersonalAssignments || inheritedAssignmentCount === 0) return false;

    target.favorites = {};
    space.favorites = {};
    space.updatedAt = now;
    space.revision = Math.max(0, Number(space.revision) || 0) + 1;
    return true;
  };

  window.TFRSharedWorkspaceIntegrity = Object.freeze({
    getFirstCategoryId,
    hasSameLogins,
    repairPersonalFavoriteLeak
  });
})();

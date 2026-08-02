(() => {
  const createProfileStateTools = ({ deepCopy, defaultPreferences, getDefaultName }) => {
    const createSnapshot = (profile = {}, fallbackPreferences = {}) => {
      const now = Date.now();
      return {
        id: typeof profile.id === 'string' && profile.id.trim() ? profile.id.trim() : 'default',
        name: typeof profile.name === 'string' && profile.name.trim()
          ? profile.name.trim()
          : getDefaultName(),
        favorites: deepCopy(profile.favorites && typeof profile.favorites === 'object' ? profile.favorites : {}),
        categories: deepCopy(Array.isArray(profile.categories) ? profile.categories : []),
        preferences: deepCopy(
          profile.preferences && typeof profile.preferences === 'object'
            ? profile.preferences
            : fallbackPreferences || defaultPreferences
        ),
        createdAt: Number.isFinite(profile.createdAt) ? profile.createdAt : now,
        updatedAt: Number.isFinite(profile.updatedAt) ? profile.updatedAt : now
      };
    };

    const syncActive = (target) => {
      const activeId = typeof target.activeProfileId === 'string' && target.activeProfileId.trim()
        ? target.activeProfileId
        : 'default';
      const profiles = target.profiles && typeof target.profiles === 'object' ? target.profiles : {};
      profiles[activeId] = createSnapshot({
        ...(profiles[activeId] || {}),
        id: activeId,
        favorites: target.favorites || {},
        categories: target.categories || [],
        preferences: target.preferences || {},
        updatedAt: Date.now()
      }, target.preferences);
      target.profiles = profiles;
      target.activeProfileId = activeId;
    };

    const applyToRoot = (target, profileId) => {
      const profile = target.profiles?.[profileId];
      if (!profile) return false;
      target.activeProfileId = profileId;
      target.favorites = deepCopy(profile.favorites || {});
      target.categories = deepCopy(Array.isArray(profile.categories) ? profile.categories : []);
      target.preferences = {
        ...deepCopy(defaultPreferences),
        ...deepCopy(profile.preferences || {})
      };
      return true;
    };

    return { applyToRoot, createSnapshot, syncActive };
  };

  window.TFRProfileStateTools = { create: createProfileStateTools };
})();

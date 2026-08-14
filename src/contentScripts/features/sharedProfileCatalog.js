(() => {
  const resolve = ({ profiles = {}, personalSnapshot = null, workspaceMode = 'personal' }, profileId, deepCopy = structuredClone) => {
    const id = String(profileId || '');
    const profile = profiles?.[id];
    if (!profile) return null;
    if (workspaceMode === 'shared' && personalSnapshot?.activeProfileId === id) {
      return deepCopy({
        ...profile,
        favorites: personalSnapshot.favorites || {},
        categories: personalSnapshot.categories || [],
        preferences: personalSnapshot.preferences || profile.preferences || {}
      });
    }
    return deepCopy(profile);
  };

  const list = (state, deepCopy = structuredClone) => Object.values(state.profiles || {})
    .map((profile) => {
      const snapshot = resolve({
        profiles: state.profiles,
        personalSnapshot: state.personalWorkspaceSnapshot,
        workspaceMode: state.workspaceMode
      }, profile.id, deepCopy) || profile;
      return { id: profile.id, name: profile.name, count: Object.keys(snapshot.favorites || {}).length };
    })
    .sort((a, b) => {
      if (a.id === state.activeProfileId) return -1;
      if (b.id === state.activeProfileId) return 1;
      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
    });

  window.TFRSharedProfileCatalog = Object.freeze({ resolve, list });
})();

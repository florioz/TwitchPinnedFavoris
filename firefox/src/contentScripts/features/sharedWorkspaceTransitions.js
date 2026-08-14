(() => {
  const enterEmptySharedWorkspace = (draft) => {
    draft.workspaceMode = 'shared';
    draft.activeSharedSpaceId = '';
    draft.favorites = {};
    draft.categories = [];
    return true;
  };

  const removeSpace = (draft, spaceId, { stayShared = false, applyShared, applyPersonal } = {}) => {
    if (!draft.sharedSpaces?.[spaceId]) return false;
    delete draft.sharedSpaces[spaceId];
    const nextSpaceId = Object.keys(draft.sharedSpaces || {})[0] || '';
    if (nextSpaceId) return Boolean(applyShared?.(draft, nextSpaceId));
    if (stayShared) return enterEmptySharedWorkspace(draft);
    return Boolean(applyPersonal?.(draft));
  };

  window.TFRSharedWorkspaceTransitions = Object.freeze({ enterEmptySharedWorkspace, removeSpace });
})();

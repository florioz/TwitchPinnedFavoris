(() => {
  const ROLES = Object.freeze(['owner', 'editor', 'viewer']);
  const SYNC_STATES = Object.freeze(['local', 'syncing', 'synced', 'offline', 'conflict']);
  const PERMISSIONS = Object.freeze({
    owner: Object.freeze({ view: true, edit: true, invite: true, manageMembers: true, delete: true }),
    editor: Object.freeze({ view: true, edit: true, invite: false, manageMembers: false, delete: false }),
    viewer: Object.freeze({ view: true, edit: false, invite: false, manageMembers: false, delete: false })
  });
  const sanitizeRole = (role) => ROLES.includes(role) ? role : 'viewer';
  const sanitizeSyncState = (state) => SYNC_STATES.includes(state) ? state : 'local';
  const createId = (prefix = 'space') => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const createMember = (member = {}, fallbackId = createId('member')) => ({
    id: String(member.id || fallbackId),
    displayName: String(member.displayName || member.name || 'Membre').trim().slice(0, 80) || 'Membre',
    avatarUrl: String(member.avatarUrl || '').trim().slice(0, 1000),
    role: sanitizeRole(member.role),
    joinedAt: Number.isFinite(member.joinedAt) ? member.joinedAt : Date.now()
  });
  const createSpace = (source = {}, deepCopy = (value) => structuredClone(value)) => {
    const id = String(source.id || createId()).trim();
    const ownerId = String(source.ownerId || source.currentMemberId || createId('member'));
    const members = Array.isArray(source.members) ? source.members.map((member) => createMember(member)) : [];
    if (!members.some((member) => member.id === ownerId)) {
      members.unshift(createMember({ id: ownerId, displayName: source.ownerName || 'Moi', role: 'owner' }));
    }
    return {
      id,
      name: String(source.name || 'Nouvel espace').trim().slice(0, 100) || 'Nouvel espace',
      description: String(source.description || '').trim().slice(0, 240),
      ownerId,
      currentMemberId: String(source.currentMemberId || ownerId),
      members,
      favorites: deepCopy(source.favorites && typeof source.favorites === 'object' ? source.favorites : {}),
      categories: deepCopy(Array.isArray(source.categories) ? source.categories : []),
      settings: {
        allowMemberExport: source.settings?.allowMemberExport !== false,
        initializedAt: Number.isFinite(source.settings?.initializedAt) ? source.settings.initializedAt : Date.now()
      },
      revision: Math.max(0, Number(source.revision) || 0),
      remoteRevision: Math.max(0, Number(source.remoteRevision ?? source.revision) || 0),
      remoteBacked: source.remoteBacked === true || source.syncState === 'synced',
      syncState: sanitizeSyncState(source.syncState),
      createdAt: Number.isFinite(source.createdAt) ? source.createdAt : Date.now(),
      updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt : Date.now()
    };
  };
  const getCurrentMember = (space) => space?.members?.find((member) => member.id === space.currentMemberId) || null;
  const getPermissions = (space) => PERMISSIONS[getCurrentMember(space)?.role || 'viewer'];
  const getExitAction = (space, { remote = false } = {}) => {
    if (!space) return Object.freeze({ type: 'none', enabled: false });
    if (getPermissions(space).delete) return Object.freeze({ type: 'delete', enabled: true });
    return Object.freeze({ type: 'leave', enabled: Boolean(remote) });
  };
  window.TFRSharedSpaceModel = Object.freeze({
    ROLES, SYNC_STATES, createMember, createSpace, getCurrentMember, getPermissions, getExitAction,
    sanitizeRole, sanitizeSyncState
  });
})();

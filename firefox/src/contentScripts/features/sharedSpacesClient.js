(() => {
  const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
  const send = (payload) => new Promise((resolve) => {
    try {
      runtime.sendMessage(payload, (response) => {
        if (runtime.lastError) resolve({ ok: false, message: runtime.lastError.message });
        else resolve(response || { ok: false, message: 'empty response' });
      });
    } catch (error) {
      resolve({ ok: false, message: error?.message || 'extension unavailable' });
    }
  });
  window.TFRSharedSpacesClient = Object.freeze({
    status: () => send({ type: 'TFR_SHARED_STATUS' }),
    connect: () => send({ type: 'TFR_SHARED_CONNECT' }),
    disconnect: () => send({ type: 'TFR_SHARED_DISCONNECT' }),
    createSpace: (space) => send({ type: 'TFR_SHARED_CREATE_SPACE', space }),
    listSpaces: () => send({ type: 'TFR_SHARED_LIST_SPACES' }),
    pullSpace: (spaceId) => send({ type: 'TFR_SHARED_PULL_SPACE', spaceId }),
    pushSpace: (space) => send({ type: 'TFR_SHARED_PUSH_SPACE', space }),
    listInvitations: () => send({ type: 'TFR_SHARED_LIST_INVITATIONS' }),
    inviteByLogin: (spaceId, login, role) => send({ type: 'TFR_SHARED_INVITE_LOGIN', spaceId, login, role }),
    createInviteLink: (spaceId, role) => send({ type: 'TFR_SHARED_CREATE_LINK', spaceId, role }),
    respondToInvitation: (invitationId, accept) => send({ type: 'TFR_SHARED_RESPOND_INVITATION', invitationId, accept }),
    joinByToken: (token) => send({ type: 'TFR_SHARED_JOIN_TOKEN', token }),
    setMemberRole: (spaceId, userId, role) => send({ type: 'TFR_SHARED_SET_MEMBER_ROLE', spaceId, userId, role }),
    deleteSpace: (spaceId) => send({ type: 'TFR_SHARED_DELETE_SPACE', spaceId }),
    leaveSpace: (spaceId) => send({ type: 'TFR_SHARED_LEAVE_SPACE', spaceId })
  });
})();

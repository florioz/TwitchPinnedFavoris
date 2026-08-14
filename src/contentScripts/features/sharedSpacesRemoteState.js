(() => {
  const normalizeList = (response) => response?.ok && Array.isArray(response.data) ? response.data : [];

  const create = ({ client, onChange = () => {} }) => {
    let loadingPromise = null;
    const state = {
      status: null,
      spaces: [],
      invitations: [],
      message: ''
    };

    const snapshot = () => ({
      status: state.status,
      spaces: [...state.spaces],
      invitations: [...state.invitations],
      message: state.message
    });

    const setMessage = (message = '') => {
      state.message = String(message || '');
      onChange(snapshot());
    };

    const refresh = async ({ notify = true } = {}) => {
      if (loadingPromise) return loadingPromise;
      loadingPromise = (async () => {
        const status = await client.status();
        state.status = status?.data || { configured: false, connected: false };
        state.spaces = [];
        state.invitations = [];
        if (state.status.connected) {
          const [invitations, spaces] = await Promise.all([client.listInvitations(), client.listSpaces()]);
          state.invitations = normalizeList(invitations);
          state.spaces = normalizeList(spaces);
        }
        if (notify) onChange(snapshot());
        return snapshot();
      })().finally(() => { loadingPromise = null; });
      return loadingPromise;
    };

    return Object.freeze({ snapshot, refresh, setMessage });
  };

  window.TFRSharedSpacesRemoteState = Object.freeze({ create });
})();

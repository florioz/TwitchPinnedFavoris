(() => {
  const mergeWorkspace = ({ cache = {}, favorites = {}, updates = {} } = {}) => {
    const merged = { ...cache };
    Object.entries(favorites).forEach(([login, favorite]) => {
      delete merged[String(login || '').toLowerCase()];
      const userId = String(favorite?.userId || '');
      if (userId) delete merged[userId];
    });
    Object.assign(merged, updates);
    return merged;
  };

  window.TFRLiveDataCache = Object.freeze({ mergeWorkspace });
})();

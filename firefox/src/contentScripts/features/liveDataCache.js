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

  const freshEntries = (cache = {}, now = Date.now()) => Object.fromEntries(
    Object.entries(cache).filter(([, entry]) => {
      const confirmedAt = Number(entry?.lastConfirmedAt);
      return Number.isFinite(confirmedAt) && confirmedAt > 0
        && now >= confirmedAt && now - confirmedAt <= 120_000;
    })
  );

  window.TFRLiveDataCache = Object.freeze({ mergeWorkspace, freshEntries });
})();

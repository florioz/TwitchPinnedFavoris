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

  const freshEntries = (cache = {}, now = Date.now(), maxAge = 120_000) => Object.fromEntries(
    Object.entries(cache).filter(([, entry]) => {
      const confirmedAt = Number(entry?.lastConfirmedAt);
      return Number.isFinite(confirmedAt) && confirmedAt > 0
        && now >= confirmedAt && now - confirmedAt <= maxAge;
    })
  );

  const reconcile = (current, incoming, now = Date.now()) => ({
    ...freshEntries(current, now, 180_000),
    ...freshEntries(incoming, now)
  });
  window.TFRLiveDataCache = Object.freeze({ mergeWorkspace, freshEntries, reconcile });
})();

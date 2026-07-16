export const createLiveSnapshotCoordinator = ({
  cacheTtlMs,
  loadCachedSnapshot,
  refreshSnapshot,
  now = Date.now,
  logger = console
}) => {
  let cachedSnapshot = null;
  let cachedAt = 0;
  let evaluationPromise = null;

  const remember = (snapshot) => {
    if (snapshot) {
      cachedSnapshot = snapshot;
      cachedAt = now();
    }
    return snapshot;
  };

  const evaluate = (reason = 'manual') => {
    if (!evaluationPromise) {
      evaluationPromise = Promise.resolve()
        .then(() => refreshSnapshot(reason))
        .then(remember)
        .finally(() => {
          evaluationPromise = null;
        });
    }
    return evaluationPromise;
  };

  const ensure = async (forceRefresh = false) => {
    if (!forceRefresh && cachedSnapshot && now() - cachedAt < cacheTtlMs) {
      return cachedSnapshot;
    }

    if (forceRefresh) {
      try {
        return await evaluate('popup');
      } catch (error) {
        logger?.error?.('[TFR] failed to refresh live snapshot', error);
        throw error;
      }
    }

    const storedSnapshot = await loadCachedSnapshot();
    remember(storedSnapshot);
    evaluate('popup-background').catch((error) => {
      logger?.error?.('[TFR] failed to refresh live snapshot', error);
      return null;
    });
    return storedSnapshot;
  };

  return {
    ensure,
    evaluate,
    getCachedSnapshot: () => cachedSnapshot
  };
};

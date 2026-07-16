const NOTIFICATION_RETENTION_MS = 24 * 60 * 60 * 1000;

export const createLiveDataSignature = (liveData = {}) => {
  const entries = Object.keys(liveData)
    .sort()
    .map((login) => {
      const live = liveData[login] || {};
      return [
        login,
        live.isLive ? 1 : 0,
        live.streamId || '',
        live.title || '',
        live.game || '',
        Number(live.viewers || 0),
        live.startedAt || '',
        live.fetchFailed ? 1 : 0
      ].join('|');
    });
  return entries.join('\n');
};

export const createNotifiedStreamsSignature = (notifiedStreams = {}) => {
  const entries = Object.keys(notifiedStreams)
    .sort()
    .map((login) => {
      const entry = notifiedStreams[login] || {};
      return `${login}|${entry.key || ''}`;
    });
  return entries.join('\n');
};

export const getNotificationKey = (login, live) => {
  if (!login || !live?.isLive) {
    return '';
  }
  if (live.streamId) {
    return `${login}:${live.streamId}`;
  }
  return live.startedAt ? `${login}:${live.startedAt}` : '';
};

export const isRecentLiveStart = (live, preferences = {}, now = Date.now()) => {
  if (!live?.isLive || !live.startedAt) {
    return false;
  }
  const startedAt = Date.parse(live.startedAt);
  if (!Number.isFinite(startedAt)) {
    return false;
  }
  const thresholdMinutes = Number.isFinite(Number(preferences.recentLiveThresholdMinutes))
    ? Math.max(1, Math.min(120, Math.round(Number(preferences.recentLiveThresholdMinutes))))
    : 10;
  return now - startedAt >= 0 && now - startedAt <= thresholdMinutes * 60 * 1000;
};

export const cleanupNotifiedStreams = (notifiedStreams = {}, liveData = {}, now = Date.now()) => {
  const next = {};
  Object.entries(notifiedStreams || {}).forEach(([login, entry]) => {
    const live = liveData?.[login];
    if (!live?.isLive) {
      return;
    }
    const key = getNotificationKey(login, live);
    if (!key || entry?.key !== key) {
      return;
    }
    const notifiedAt = Number(entry.notifiedAt || 0);
    if (Number.isFinite(notifiedAt) && now - notifiedAt < NOTIFICATION_RETENTION_MS) {
      next[login] = entry;
    }
  });
  return next;
};

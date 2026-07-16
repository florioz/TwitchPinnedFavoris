export const buildToastEntries = (entries = [], maxNotifications = 2) =>
  entries
    .filter(({ fav }) => fav?.recentHighlightEnabled !== false)
    .slice(0, maxNotifications)
    .map(({ login, fav, live, notificationKey }) => ({
      source: { login, fav, live, notificationKey },
      toast: {
        login,
        notificationKey,
        fav: {
          login: fav.login,
          displayName: fav.displayName,
          avatarUrl: fav.avatarUrl
        },
        live: {
          login: live.login,
          displayName: live.displayName,
          avatarUrl: live.avatarUrl,
          viewers: live.viewers,
          game: live.game,
          title: live.title,
          streamId: live.streamId,
          startedAt: live.startedAt
        }
      }
    }));

export const createLiveNotificationService = ({
  storage,
  notifiedStreamsKey,
  broadcastToast,
  maxNotifications = 2,
  now = Date.now
}) => ({
  async markHandled(login, notificationKey) {
    if (!login || !notificationKey) {
      return {};
    }
    const stored = await storage.get(notifiedStreamsKey);
    const notifiedStreams =
      stored?.[notifiedStreamsKey] && typeof stored[notifiedStreamsKey] === 'object'
        ? stored[notifiedStreamsKey]
        : {};
    const next = {
      ...notifiedStreams,
      [login]: {
        key: notificationKey,
        notifiedAt: now()
      }
    };
    await storage.set({ [notifiedStreamsKey]: next });
    return next;
  },

  async notify(entries, preferences = {}) {
    const prefs = preferences || {};
    const wantsToast = prefs.toastEnabled !== false;
    const wantsSound = prefs.toastSoundEnabled === true;
    if (!wantsToast && !wantsSound) {
      return [];
    }
    const selected = buildToastEntries(entries, maxNotifications);
    if (!selected.length) {
      return [];
    }
    const delivered = await broadcastToast(
      selected.map(({ toast }) => toast),
      {
        showToast: wantsToast,
        playSound: wantsSound,
        soundId: prefs.toastSoundId,
        soundVolume: prefs.toastSoundVolume,
        customSoundDataUrl: prefs.toastCustomSoundDataUrl
      }
    );
    return delivered ? selected.map(({ source }) => source) : [];
  }
});

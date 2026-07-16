export const normalizeVersion = (version) =>
  String(version || '')
    .trim()
    .replace(/^v/i, '');

export const parseVersion = (version) => {
  const cleaned = normalizeVersion(version);
  if (!cleaned) return [0];
  return cleaned.split('.').map((part) => {
    const match = String(part).match(/\d+/);
    return match ? Number(match[0]) : 0;
  });
};

export const isVersionNewer = (remote, local) => {
  const remoteParts = parseVersion(remote);
  const localParts = parseVersion(local);
  const length = Math.max(remoteParts.length, localParts.length);
  for (let index = 0; index < length; index += 1) {
    const remoteValue = remoteParts[index] ?? 0;
    const localValue = localParts[index] ?? 0;
    if (remoteValue > localValue) return true;
    if (remoteValue < localValue) return false;
  }
  return false;
};

export const canShowUpdate = (state = {}, currentVersion = '0.0.0', now = Date.now()) => {
  const latestVersion = normalizeVersion(state.latestVersion);
  if (!latestVersion || !isVersionNewer(latestVersion, currentVersion)) {
    return false;
  }
  if (state.dismissedVersion === latestVersion) {
    return false;
  }
  if (state.snoozeUntil && now < state.snoozeUntil) {
    return false;
  }
  return true;
};

export const createUpdateService = ({
  storage,
  storageKey,
  apiUrl,
  repoUrl,
  currentVersion,
  checkIntervalMs,
  setBadgeAvailable,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  logger = console
}) => {
  const readState = async () => {
    const stored = await storage.get(storageKey).catch(() => ({}));
    return stored?.[storageKey] && typeof stored[storageKey] === 'object'
      ? stored[storageKey]
      : {};
  };

  const updateBadge = async (state, timestamp = now()) => {
    const available = canShowUpdate(state, currentVersion, timestamp);
    await setBadgeAvailable(available);
    return available;
  };

  return {
    async refreshBadge() {
      const state = await readState();
      await updateBadge(state);
      return state;
    },

    async check(force = false) {
      const timestamp = now();
      const state = await readState();
      if (!force && state.lastCheck && timestamp - state.lastCheck < checkIntervalMs) {
        await updateBadge(state, timestamp);
        return state;
      }
      try {
        if (typeof fetchImpl !== 'function') {
          throw new Error('Fetch API unavailable');
        }
        const response = await fetchImpl(apiUrl, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-cache'
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const remoteVersion = normalizeVersion(payload?.tag_name || payload?.name);
        const nextState = {
          ...state,
          lastCheck: timestamp,
          latestVersion: remoteVersion,
          releaseUrl: payload?.html_url || repoUrl,
          releaseNotes: (payload?.body || '').trim()
        };
        if (state.latestVersion !== remoteVersion) {
          nextState.dismissedVersion = null;
          nextState.snoozeUntil = null;
        }
        await storage.set({ [storageKey]: nextState });
        await updateBadge(nextState, timestamp);
        return nextState;
      } catch (error) {
        logger?.warn?.('[TFR] background update check failed', error);
        await updateBadge(state, timestamp);
        return state;
      }
    }
  };
};

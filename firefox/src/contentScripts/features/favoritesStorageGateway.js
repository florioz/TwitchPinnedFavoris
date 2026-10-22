(() => {
  const extensionApi = globalThis.browser || globalThis.chrome;
  const isInvalidatedContextError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('extension context invalidated') || message.includes('context invalidated');
  };

  const createFavoritesStorageGateway = ({ storageKey, liveCacheKey = '' }) => {
    const keys = liveCacheKey ? [storageKey, liveCacheKey] : storageKey;

    let invalidated = false;
    const readKeys = async (requestedKeys) => {
      if (invalidated) return null;
      try {
        return await extensionApi.storage.local.get(requestedKeys);
      } catch (error) {
        if (!isInvalidatedContextError(error)) throw error;
        invalidated = true;
        return null;
      }
    };
    const read = () => readKeys(keys);
    const readState = async () => {
      const stored = await readKeys(storageKey);
      // null means unavailable; undefined means the key has not been saved yet.
      return stored === null ? null : stored?.[storageKey];
    };
    const writeState = async (state) => {
      if (invalidated) return false;
      try {
        await extensionApi.storage.local.set({ [storageKey]: state });
        return true;
      } catch (error) {
        if (isInvalidatedContextError(error)) {
          invalidated = true;
          return false;
        }
        throw error;
      }
    };
    const subscribe = (listener) => {
      const handler = (changes, area) => {
        if (area !== 'local') return;
        listener({
          state: changes[storageKey]?.newValue,
          liveData: liveCacheKey ? changes[liveCacheKey]?.newValue : undefined
        });
      };
      extensionApi.storage.onChanged.addListener(handler);
      return () => extensionApi.storage.onChanged.removeListener?.(handler);
    };

    return { read, readState, writeState, subscribe, isAvailable: () => !invalidated };
  };

  window.TFRFavoritesStorageGateway = {
    create: createFavoritesStorageGateway,
    isInvalidatedContextError
  };
})();

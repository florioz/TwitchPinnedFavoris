(() => {
  const isInvalidatedContextError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('extension context invalidated') || message.includes('context invalidated');
  };

  const createFavoritesStorageGateway = ({ storageKey, liveCacheKey = '' }) => {
    const keys = liveCacheKey ? [storageKey, liveCacheKey] : storageKey;

    const read = async () => chrome.storage.local.get(keys);
    const readState = async () => (await chrome.storage.local.get(storageKey))?.[storageKey];
    const writeState = async (state) => {
      try {
        await chrome.storage.local.set({ [storageKey]: state });
        return true;
      } catch (error) {
        if (isInvalidatedContextError(error)) return false;
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
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener?.(handler);
    };

    return { read, readState, writeState, subscribe };
  };

  window.TFRFavoritesStorageGateway = {
    create: createFavoritesStorageGateway,
    isInvalidatedContextError
  };
})();

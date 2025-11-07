const browserApi = globalThis.browser ?? globalThis.chrome;
const STORAGE_KEY = 'tfr_state';
const DEFAULT_STATE = {
  favorites: {},
  categories: [],
  preferences: {
    sortMode: 'viewersDesc',
    uncategorizedCollapsed: false
  }
};

browserApi.runtime.onInstalled.addListener(async () => {
  try {
    const stored = await browserApi.storage.local.get(STORAGE_KEY);
    if (!stored || !stored[STORAGE_KEY]) {
      const initialCategory = {
        id: `cat_${Date.now()}`,
        name: 'Favoris',
        collapsed: false,
        sortOrder: Date.now()
      };
      await browserApi.storage.local.set({
        [STORAGE_KEY]: {
          ...DEFAULT_STATE,
          categories: [initialCategory]
        }
      });
    }
  } catch (error) {
    console.error('TFR: failed to seed default state', error);
  }
});

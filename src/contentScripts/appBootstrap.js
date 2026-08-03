(() => {
  'use strict';
  const create = (types) => {
    const instances = [];
    const dispose = () => instances.splice(0).forEach((instance) => {
      try { instance?.dispose?.(); } catch (error) { console.warn('[TFR] dispose error', error); }
    });
    const start = async () => {
      const store = new types.FavoritesStore();
      await store.init();
      const features = new types.FeatureController(store);
      const sidebar = new types.SidebarRenderer(store);
      const favoriteButton = new types.ChannelFavoriteButton(store);
      const overlay = new types.FavoritesOverlay(store);
      const navigation = new types.TopNavManager(overlay);
      const updates = new types.UpdateNotifier();
      instances.push(sidebar, favoriteButton, overlay, navigation, features, updates);
      [features, sidebar, favoriteButton, navigation, updates].forEach((instance) => instance.init());
      window.addEventListener('focus', () => store.refreshLiveData());
      window.addEventListener('beforeunload', dispose, { once: true });
      return Object.freeze({ store, dispose });
    };
    return Object.freeze({ start, dispose });
  };
  window.TFRAppBootstrap = Object.freeze({ create });
})();

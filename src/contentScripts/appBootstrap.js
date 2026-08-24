(() => {
  'use strict';
  const create = (types) => {
    const requiredConstructors = [
      'FavoritesStore', 'FeatureController', 'SidebarRenderer', 'ChannelFavoriteButton',
      'UsagePresence', 'FavoritesOverlay', 'TopNavManager', 'UpdateNotifier',
      'ViewerCardSharedInvite', 'OnboardingTutorial'
    ];
    const validateConstructors = () => {
      requiredConstructors.forEach((name) => {
        if (typeof types[name] !== 'function') {
          throw new TypeError(`${name} must be a constructor.`);
        }
      });
    };
    const instantiate = (name, ...args) => {
      const Constructor = types[name];
      return new Constructor(...args);
    };
    const instances = [];
    let focusHandler = null;
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (focusHandler) {
        window.removeEventListener('focus', focusHandler);
        focusHandler = null;
      }
      instances.splice(0).forEach((instance) => {
        try { instance?.dispose?.(); } catch (error) { console.warn('[TFR] dispose error', error); }
      });
    };
    const start = async () => {
      validateConstructors();
      const store = instantiate('FavoritesStore');
      await store.init();
      const features = instantiate('FeatureController', store);
      const sidebar = instantiate('SidebarRenderer', store);
      const favoriteButton = instantiate('ChannelFavoriteButton', store);
      const usagePresence = instantiate('UsagePresence');
      const overlay = instantiate('FavoritesOverlay', store, usagePresence);
      const navigation = instantiate('TopNavManager', overlay);
      const updates = instantiate('UpdateNotifier');
      const viewerCardInvite = instantiate('ViewerCardSharedInvite');
      const onboarding = instantiate('OnboardingTutorial', store);
      instances.push(sidebar, favoriteButton, usagePresence, overlay, navigation, features, updates, viewerCardInvite, onboarding, store);
      [usagePresence, features, sidebar, favoriteButton, navigation, updates, viewerCardInvite, onboarding].forEach((instance) => instance.init());
      focusHandler = () => store.refreshLiveData();
      window.addEventListener('focus', focusHandler);
      window.addEventListener('beforeunload', dispose, { once: true });
      return Object.freeze({ store, dispose });
    };
    return Object.freeze({ start, dispose });
  };
  window.TFRAppBootstrap = Object.freeze({ create });
})();

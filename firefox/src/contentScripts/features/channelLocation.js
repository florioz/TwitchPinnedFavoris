(() => {
  'use strict';

  const RESERVED_PATHS = new Set([
    '', 'directory', 'p', 'jobs', 'downloads', 'friends', 'messages', 'settings',
    'logout', 'signup', 'products', 'store', 'turbo', 'videos', 'search', 'drops',
    'subscriptions', 'wallet'
  ]);

  const getChannelFromLocation = (locationLike = window.location) => {
    const segments = String(locationLike?.pathname || '').split('/').filter(Boolean);
    if (!segments.length) return null;
    const candidate = segments[0].toLowerCase();
    return RESERVED_PATHS.has(candidate) ? null : candidate;
  };

  window.TFRChannelLocation = Object.freeze({ getChannelFromLocation });
})();

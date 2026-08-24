(function (root, factory) {
  const api = factory();
  root.TFRFavoriteVisibilityTools = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const normalizeCategoryName = (value) => {
    if (!value) return '';
    let output = String(value).trim().toLocaleLowerCase();
    if (typeof output.normalize === 'function') {
      output = output.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return output;
  };

  const sanitizeCategoryList = (values) => {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    return values.reduce((sanitized, value) => {
      if (typeof value !== 'string') return sanitized;
      const raw = value.trim();
      const key = normalizeCategoryName(raw);
      if (!key || seen.has(key)) return sanitized;
      seen.add(key);
      sanitized.push(raw);
      return sanitized;
    }, []);
  };

  const getFavoriteCategoryFilterNames = (favoriteEntry) => {
    const filter = favoriteEntry?.categoryFilter;
    if (!filter?.enabled) return [];
    if (Array.isArray(filter.categories)) return filter.categories;
    return typeof filter.category === 'string' ? [filter.category] : [];
  };

  const shouldDisplayFavorite = (favoriteEntry, liveEntry) => {
    if (!liveEntry?.isLive) return false;
    const filter = favoriteEntry?.categoryFilter;
    if (!filter?.enabled) return true;

    const requiredCategories = new Set(
      getFavoriteCategoryFilterNames(favoriteEntry).map(normalizeCategoryName).filter(Boolean)
    );
    if (!requiredCategories.size) return true;

    const currentCategory = normalizeCategoryName(liveEntry.game);
    if (!currentCategory) {
      return Boolean(liveEntry.fetchFailed || liveEntry.inferredFromPage);
    }
    return requiredCategories.has(currentCategory);
  };

  const getLiveDataEntry = (liveData, favoriteOrLogin) => {
    const login = typeof favoriteOrLogin === 'string' ? favoriteOrLogin : favoriteOrLogin?.login;
    const normalized = String(login || '').toLowerCase();
    return normalized ? liveData?.[normalized] || liveData?.[login] || null : null;
  };

  return Object.freeze({
    getFavoriteCategoryFilterNames,
    getLiveDataEntry,
    normalizeCategoryName,
    sanitizeCategoryList,
    shouldDisplayFavorite
  });
});

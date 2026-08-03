(() => {
  const createFavoriteCategoryFilterTools = ({ normalizeCategoryName }) => {
    const getCategories = (store, login, fallback = []) => {
      const stored = store.getState().favorites?.[login]?.categoryFilter?.categories;
      return Array.isArray(stored) ? stored : fallback;
    };

    const buildSuggestions = ({ remote = [], known = [], selected = [], term = '', limit = 8 }) => {
      const normalizedTerm = normalizeCategoryName(term);
      if (!normalizedTerm) return [];
      const selectedKeys = new Set(selected.map(normalizeCategoryName).filter(Boolean));
      const candidates = new Map();
      [...remote, ...known].forEach((name) => {
        const raw = typeof name === 'string' ? name.trim() : '';
        const normalized = normalizeCategoryName(raw);
        if (raw && normalized && !candidates.has(normalized)) candidates.set(normalized, raw);
      });
      return Array.from(candidates, ([normalized, raw]) => ({ normalized, raw }))
        .filter(({ normalized }) => !selectedKeys.has(normalized) && normalized.includes(normalizedTerm))
        .slice(0, limit)
        .map(({ raw }) => raw);
    };

    const addCategory = (currentCategories, rawValue) => {
      const current = Array.isArray(currentCategories) ? currentCategories : [];
      const value = typeof rawValue === 'string' ? rawValue.trim() : '';
      if (!value) return null;
      const normalizedValue = normalizeCategoryName(value);
      const exists = current.some((entry) => normalizeCategoryName(entry) === normalizedValue);
      return exists ? null : [...current, value];
    };

    const removeCategory = (currentCategories, rawValue) => {
      const current = Array.isArray(currentCategories) ? currentCategories : [];
      const normalizedValue = normalizeCategoryName(rawValue);
      return current.filter((entry) => normalizeCategoryName(entry) !== normalizedValue);
    };

    const collectKnownCategories = (state, liveData) => {
      const categories = new Set();
      const add = (value) => {
        const category = typeof value === 'string' ? value.trim() : '';
        if (category) categories.add(category);
      };
      Object.values(liveData || {}).forEach((live) => add(live?.game));
      Object.values(state?.favorites || {}).forEach((favorite) => {
        const filters = Array.isArray(favorite?.categoryFilter?.categories)
          ? favorite.categoryFilter.categories
          : [];
        filters.forEach(add);
      });
      return Array.from(categories).sort((a, b) => a.localeCompare(b, 'fr'));
    };

    return { getCategories, buildSuggestions, addCategory, removeCategory, collectKnownCategories };
  };

  window.TFRFavoriteCategoryFilterTools = { create: createFavoriteCategoryFilterTools };
})();

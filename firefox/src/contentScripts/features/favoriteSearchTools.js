(() => {
  const normalize = (value) => String(value || '').trim().toLocaleLowerCase();

  const getSuggestions = (state, term, limit = 8) => {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return [];
    const categories = new Map((state?.categories || []).map((category) => [category.id, category.name]));
    return Object.values(state?.favorites || {})
      .map((favorite) => {
        const name = favorite.displayName || favorite.login || '';
        const login = favorite.login || '';
        const normalizedName = normalize(name);
        const normalizedLogin = normalize(login);
        const categoryId = Array.isArray(favorite.categories) ? favorite.categories[0] : '';
        return {
          favorite,
          name,
          login,
          starts: normalizedName.startsWith(normalizedTerm) || normalizedLogin.startsWith(normalizedTerm),
          matches: `${normalizedName} ${normalizedLogin}`.includes(normalizedTerm),
          category: categories.get(categoryId) || ''
        };
      })
      .filter((entry) => entry.matches)
      .sort((left, right) => Number(right.starts) - Number(left.starts)
        || left.name.localeCompare(right.name, 'fr'))
      .slice(0, Math.max(0, limit));
  };

  window.TFRFavoriteSearchTools = Object.freeze({ getSuggestions });
})();

(() => {
  const createBackupNormalizer = ({ defaultAvatar, sanitizeCategoryList, sanitizeColor }) => {
    const favorites = (source = {}) => {
      const normalizedFavorites = {};
      const entries = source && typeof source === 'object' ? Object.entries(source) : [];
      entries.forEach(([login, raw]) => {
        if (typeof login !== 'string' || !login || !raw || typeof raw !== 'object') return;
        const normalized = login.toLowerCase();
        const categories = Array.isArray(raw.categories)
          ? raw.categories.filter((id) => typeof id === 'string' && id)
          : [];
        if (!categories.length && typeof raw.category === 'string' && raw.category) {
          categories.push(raw.category);
        }
        let categoryFilter = { enabled: false, categories: [] };
        const rawFilter = raw.categoryFilter && typeof raw.categoryFilter === 'object'
          ? raw.categoryFilter
          : null;
        if (rawFilter) {
          const filterCategories = Array.isArray(rawFilter.categories)
            ? rawFilter.categories
            : typeof rawFilter.category === 'string' ? [rawFilter.category] : [];
          categoryFilter = {
            enabled: Boolean(rawFilter.enabled),
            categories: sanitizeCategoryList(filterCategories)
          };
        } else if (typeof raw.requiredCategory === 'string' && raw.requiredCategory.trim()) {
          categoryFilter = {
            enabled: true,
            categories: sanitizeCategoryList([raw.requiredCategory])
          };
        }
        normalizedFavorites[normalized] = {
          userId: String(raw.userId || raw.id || ''),
          login: normalized,
          displayName: typeof raw.displayName === 'string' && raw.displayName ? raw.displayName : normalized,
          avatarUrl: typeof raw.avatarUrl === 'string' && raw.avatarUrl ? raw.avatarUrl : defaultAvatar,
          categories,
          addedAt: typeof raw.addedAt === 'number' ? raw.addedAt : Date.now(),
          filterMatchSince: typeof raw.filterMatchSince === 'number' ? raw.filterMatchSince : 0,
          accountLookupFailures: Math.max(0, Number(raw.accountLookupFailures || 0)),
          accountStatus: ['unresolved', 'checking'].includes(raw.accountStatus) ? raw.accountStatus : '',
          recentHighlightEnabled: typeof raw.recentHighlightEnabled === 'boolean'
            ? raw.recentHighlightEnabled
            : true,
          categoryFilter
        };
      });
      return normalizedFavorites;
    };

    const categories = (source = []) => {
      const result = [];
      const usedIds = new Set();
      const now = Date.now();
      (Array.isArray(source) ? source : []).forEach((raw, index) => {
        if (!raw || typeof raw !== 'object') return;
        let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `cat_${now}_${index}`;
        const baseId = id;
        let suffix = 1;
        while (usedIds.has(id)) id = `${baseId}_${suffix++}`;
        usedIds.add(id);
        result.push({
          id,
          name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `Catégorie ${index + 1}`,
          sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : now + index,
          collapsed: typeof raw.collapsed === 'boolean' ? raw.collapsed : false,
          parentId: typeof raw.parentId === 'string' && raw.parentId.trim() ? raw.parentId.trim() : null,
          color: sanitizeColor(raw.color)
        });
      });
      return result;
    };

    return { categories, favorites };
  };

  window.TFRBackupNormalizer = { create: createBackupNormalizer };
})();

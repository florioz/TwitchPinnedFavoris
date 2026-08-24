(function (root, factory) {
  const visibilityTools = root.TFRFavoriteVisibilityTools
    || (typeof module === 'object' && module.exports
      ? require('./features/favoriteVisibilityTools.js')
      : null);
  const api = factory(visibilityTools);
  root.__TFR_PANEL_MODEL__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (visibilityTools) {
  if (!visibilityTools) throw new Error('[TFR] favorite visibility tools module is missing');
  const { normalizeCategoryName, shouldDisplayFavorite } = visibilityTools;

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  const formatNumber = (value) => (Number(value) || 0).toLocaleString('fr-FR');

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return '';
      return `Mis à jour à ${date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      })}`;
    } catch (_) {
      return '';
    }
  };

  const buildCategoryOrder = (rawCategories = [], now = Date.now) => {
    if (!Array.isArray(rawCategories)) return [];
    const baseTimestamp = now();
    const nodes = rawCategories
      .map((category, index) => ({
        id: typeof category?.id === 'string' && category.id.trim() ? category.id.trim() : `cat_${index}`,
        name:
          typeof category?.name === 'string' && category.name.trim()
            ? category.name.trim()
            : `Catégorie ${index + 1}`,
        sortOrder: typeof category?.sortOrder === 'number' ? category.sortOrder : baseTimestamp + index,
        parentId: typeof category?.parentId === 'string' && category.parentId.trim()
          ? category.parentId.trim()
          : null,
        collapsed: Boolean(category?.collapsed),
        children: []
      }))
      .filter((category) => category.id);

    const map = new Map(nodes.map((node) => [node.id, node]));
    nodes.forEach((node) => {
      if (!node.parentId || !map.has(node.parentId) || node.parentId === node.id) {
        node.parentId = null;
      }
    });

    const roots = [];
    nodes.forEach((node) => {
      if (node.parentId) {
        map.get(node.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sorted = [];
    const traverse = (list, depth = 0) => {
      list.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, 'fr');
      });
      list.forEach((node) => {
        sorted.push({ ...node, depth });
        if (node.children.length) {
          traverse(node.children, depth + 1);
        }
      });
    };
    traverse(roots);
    return sorted;
  };

  const buildCategoryGroups = ({
    favorites = {},
    liveData = {},
    categories = [],
    categoryCollapse = new Map()
  } = {}) => {
    const entries = Object.values(favorites)
      .map((fav) => ({ fav, live: liveData[fav.login] }))
      .filter(({ fav, live }) => fav && live && shouldDisplayFavorite(fav, live))
      .sort((a, b) => {
        const viewerDifference = (b.live?.viewers || 0) - (a.live?.viewers || 0);
        if (viewerDifference) return viewerDifference;
        return (a.live?.displayName || a.fav.displayName || a.fav.login || '')
          .localeCompare(b.live?.displayName || b.fav.displayName || b.fav.login || '', 'fr');
      });

    const grouped = [];
    const groupMap = new Map();
    buildCategoryOrder(categories).forEach((category) => {
      const group = {
        category,
        favorites: [],
        depth: category.depth || 0,
        collapsed: categoryCollapse.get(category.id) ?? Boolean(category.collapsed)
      };
      groupMap.set(category.id, group);
      grouped.push(group);
    });

    const uncategorizedCollapsed = categoryCollapse.get('uncategorized') || false;
    const uncategorized = {
      category: {
        id: 'uncategorized',
        name: 'Sans catégorie',
        collapsed: uncategorizedCollapsed
      },
      favorites: [],
      depth: 0,
      collapsed: uncategorizedCollapsed
    };

    entries.forEach((entry) => {
      const categoryId =
        Array.isArray(entry.fav?.categories) && entry.fav.categories.length
          ? entry.fav.categories[0]
          : null;
      const target = categoryId && groupMap.has(categoryId)
        ? groupMap.get(categoryId)
        : uncategorized;
      target.favorites.push(entry);
    });

    const groups = grouped.filter((group) => group.favorites.length);
    if (uncategorized.favorites.length) {
      groups.push(uncategorized);
    }
    return {
      groups,
      totalLive: entries.length,
      totalFavorites: Object.keys(favorites).length
    };
  };

  return {
    buildCategoryGroups,
    buildCategoryOrder,
    escapeHtml,
    formatNumber,
    formatTimestamp,
    normalizeCategoryName,
    shouldDisplayFavorite
  };
});

(() => {
  'use strict';
  const sameParent = (left, right) => (left || null) === (right || null);
  const sortCategories = (categories) => [...categories].sort((a, b) =>
    a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name, 'fr'));
  const siblingsOf = (categories, parentId, excludedId = null) => sortCategories(
    categories.filter((category) => sameParent(category.parentId, parentId) && category.id !== excludedId)
  );
  const isDescendant = (categories, candidateId, ancestorId) => {
    let current = candidateId;
    const visited = new Set();
    while (current && !visited.has(current)) {
      if (current === ancestorId) return true;
      visited.add(current);
      current = categories.find((category) => category.id === current)?.parentId || null;
    }
    return false;
  };
  const normalizeSiblings = (categories, parentId) => siblingsOf(categories, parentId)
    .forEach((category, index) => { category.sortOrder = (index + 1) * 1000; });
  const swapSibling = (categories, categoryId, offset) => {
    const target = categories.find((category) => category.id === categoryId);
    if (!target) return false;
    const siblings = siblingsOf(categories, target.parentId);
    const index = siblings.findIndex((category) => category.id === categoryId);
    const other = siblings[index + offset];
    if (!other) return false;
    [target.sortOrder, other.sortOrder] = [other.sortOrder, target.sortOrder];
    return true;
  };
  window.TFRCategoryMutationTools = Object.freeze({ isDescendant, normalizeSiblings, siblingsOf, sortCategories, swapSibling });
})();

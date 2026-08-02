(() => {
  const build = (categories = [], sanitizeColor = () => '') => {
    const nodes = (Array.isArray(categories) ? categories : []).map((category) => ({
      id: category.id,
      name: category.name,
      collapsed: Boolean(category.collapsed),
      sortOrder: typeof category.sortOrder === 'number' ? category.sortOrder : 0,
      parentId: category.parentId || null,
      color: sanitizeColor(category.color),
      children: []
    }));
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const roots = [];
    nodes.forEach((node) => {
      const parent = node.parentId && node.parentId !== node.id ? nodeMap.get(node.parentId) : null;
      if (parent) parent.children.push(node);
      else {
        node.parentId = null;
        roots.push(node);
      }
    });
    const sort = (items) => {
      items.sort((left, right) => (
        left.sortOrder !== right.sortOrder
          ? left.sortOrder - right.sortOrder
          : left.name.localeCompare(right.name, 'fr')
      ));
      items.forEach((item) => sort(item.children));
    };
    sort(roots);
    return roots;
  };

  window.TFRCategoryTreeTools = Object.freeze({ build });
})();

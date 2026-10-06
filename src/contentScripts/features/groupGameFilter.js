(() => {
  const create = ({ store, t, FavoriteCategoryFilterController, categoryFilterTools, getCategorySuggestions, onChange }) => {
    const openGroups = new Set();
    const render = (node) => {
    const login = `group-${node.id}`;
    const getFavorite = () => ({ login, categoryFilter: store.getState().categories
      .find(group => group.id === node.id)?.categoryFilter });
    const controller = new FavoriteCategoryFilterController({
      store: {
        getState: () => ({ favorites: { [login]: getFavorite() } }),
        setFavoriteCategoryFilter: (_login, payload) => store.setGroupCategoryFilter(node.id, payload)
      },
      getCategorySuggestions: term => getCategorySuggestions(term),
      onChange: () => onChange()
    });
    const wrapper = document.createElement('div');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tfr-chip-action';
    button.textContent = t('categories.gameFilter.button');
    const panel = controller.render({
      favorite: getFavorite(), group: true,
      knownCategories: categoryFilterTools.collectKnownCategories(store.getState(), store.getLiveData())
    });
    panel.id = `tfr-group-game-filter-${node.id}`;
    button.setAttribute('aria-controls', panel.id);
    const updateExpanded = () => {
      const expanded = openGroups.has(node.id);
      panel.hidden = !expanded;
      panel.style.display = expanded ? '' : 'none';
      button.setAttribute('aria-expanded', String(expanded));
    };
    button.addEventListener('click', () => {
      if (openGroups.has(node.id)) openGroups.delete(node.id);
      else openGroups.add(node.id);
      updateExpanded();
    });
    updateExpanded();
    wrapper.append(button, panel);
    return wrapper;
  };
    return Object.freeze({ render });
  };
  window.TFRGroupGameFilter = Object.freeze({ create });
})();

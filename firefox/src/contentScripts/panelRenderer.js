(function (root, factory) {
  const api = factory();
  root.__TFR_PANEL_RENDERER__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const createPanelRenderer = ({
    documentRef,
    escapeHtml,
    formatNumber,
    defaultAvatar
  }) => ({
    renderGroups(container, groups = []) {
      container.textContent = '';

      groups.forEach((group) => {
        const section = documentRef.createElement('section');
        section.className = 'tfr-panel__group';
        if (group.collapsed) {
          section.classList.add('tfr-panel__group--collapsed');
        }

        const categoryId = group.category?.id || 'uncategorized';
        const categoryName = group.category?.name || 'Sans catégorie';
        const safeCategoryId = escapeHtml(categoryId);
        const header = documentRef.createElement('div');
        header.className = 'tfr-panel__groupHeader';
        header.innerHTML = `
          <div class="tfr-panel__groupHeaderTitle">
            <button class="tfr-panel__groupToggle" data-action="toggleCategory" data-category-id="${safeCategoryId}">
              <span class="tfr-panel__groupToggleIcon">&#9662;</span>
            </button>
            <span class="tfr-panel__groupLabel" data-action="toggleCategory" data-category-id="${safeCategoryId}">
              <span class="tfr-panel__groupName">${escapeHtml(categoryName)}</span>
              <span class="tfr-panel__groupBadge">${group.favorites.length}</span>
            </span>
          </div>
        `;
        section.appendChild(header);

        const list = documentRef.createElement('div');
        list.className = 'tfr-panel__groupList';
        group.favorites.forEach(({ fav = {}, live = {} }) => {
          const card = documentRef.createElement('div');
          card.className = 'tfr-panel__card';
          card.dataset.login = fav.login;
          card.innerHTML = `
            <img class="tfr-panel__avatar" src="${escapeHtml(live.avatarUrl || fav.avatarUrl || defaultAvatar)}" alt="" />
            <div class="tfr-panel__details">
              <div class="tfr-panel__row">
                <span class="tfr-panel__name">${escapeHtml(live.displayName || fav.displayName || fav.login)}</span>
                <span class="tfr-panel__viewers">${formatNumber(live.viewers)} spectateurs</span>
              </div>
              <div class="tfr-panel__game">${escapeHtml(live.game || 'Catégorie inconnue')}</div>
              <div class="tfr-panel__titleLine">${escapeHtml(live.title || 'Live sans titre')}</div>
            </div>
          `;
          list.appendChild(card);
        });
        section.appendChild(list);
        container.appendChild(section);
      });
    }
  });

  return { createPanelRenderer };
});

(() => {
  const createFavoriteCategoryFilterView = ({ t }) => ({
    renderList({ categories, enabled, onRemove }) {
      const list = document.createElement('div');
      list.className = 'tfr-category-filter__list';
      if (!categories.length) {
        const empty = document.createElement('span');
        empty.className = 'tfr-category-filter__empty';
        empty.textContent = enabled
          ? t('details.filter.emptyEnabled')
          : t('details.filter.emptyDisabled');
        list.appendChild(empty);
        return list;
      }
      categories.forEach((category) => {
        const chip = document.createElement('span');
        chip.className = 'tfr-category-filter__chip';
        chip.textContent = category;
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'tfr-category-filter__remove';
        removeButton.setAttribute('aria-label', t('details.filter.remove', { category }));
        removeButton.textContent = '\u00D7';
        removeButton.addEventListener('click', () => onRemove(category));
        chip.appendChild(removeButton);
        list.appendChild(chip);
      });
      return list;
    },

    renderDatalist(id, categories) {
      const datalist = document.createElement('datalist');
      datalist.id = id;
      categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        datalist.appendChild(option);
      });
      return datalist;
    },

    renderLiveInfo(live) {
      const info = document.createElement('small');
      info.className = 'tfr-category-filter__hint';
      if (!live?.isLive) info.textContent = t('details.filter.offline');
      else if (live.game) info.textContent = t('details.filter.currentCategory', { game: live.game });
      else info.textContent = t('details.filter.currentCategoryUnavailable');
      return info;
    },

    renderToggle(favorite) {
      const id = `tfr-detail-filter-${favorite.login}`;
      const label = document.createElement('label');
      label.className = 'tfr-category-filter__toggle';
      label.setAttribute('for', id);
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.id = id;
      toggle.className = 'tfr-category-filter__checkbox';
      toggle.checked = Boolean(favorite.categoryFilter?.enabled);
      const text = document.createElement('span');
      text.textContent = t('details.filter.toggle');
      label.append(toggle, text);
      return { id, label, toggle };
    },

    setControlsEnabled(enabled, controls) {
      controls.forEach((control) => {
        if (control) control.disabled = !enabled;
      });
    },

    renderInput(favorite, filterToggleId, knownCategories) {
      const row = document.createElement('div');
      row.className = 'tfr-category-filter__input-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tfr-category-filter__input';
      input.dataset.tfrFocusKey = `category-filter-${favorite.login}`;
      input.placeholder = t('details.filter.placeholder');
      input.value = '';
      input.autocomplete = 'off';
      input.spellcheck = false;
      const datalistId = `${filterToggleId}-list`;
      input.setAttribute('list', datalistId);
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'tfr-category-filter__add';
      addButton.textContent = t('details.filter.add');
      row.append(input, addButton);
      const datalist = this.renderDatalist(datalistId, knownCategories);
      const suggestions = document.createElement('div');
      suggestions.className = 'tfr-category-filter__suggestions';
      return { row, input, addButton, datalist, suggestions };
    },

    clearSuggestions(container) {
      container.innerHTML = '';
      container.classList.remove('is-visible');
    },

    renderSuggestions(container, names, onSelect) {
      this.clearSuggestions(container);
      names.slice(0, 8).forEach((name) => {
        const suggestion = document.createElement('button');
        suggestion.type = 'button';
        suggestion.className = 'tfr-category-suggestion';
        suggestion.textContent = name;
        suggestion.addEventListener('mousedown', (event) => {
          event.preventDefault();
          onSelect(name);
        });
        container.appendChild(suggestion);
      });
      if (names.length) container.classList.add('is-visible');
    }
  });

  window.TFRFavoriteCategoryFilterView = { create: createFavoriteCategoryFilterView };
})();

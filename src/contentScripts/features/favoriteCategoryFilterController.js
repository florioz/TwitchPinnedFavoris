(() => {
  const createFavoriteCategoryFilterController = ({ t, normalizeCategoryName, tools, view }) => {
    return class FavoriteCategoryFilterController {
      constructor({ store, getCategorySuggestions, onChange }) {
        this.store = store;
        this.getCategorySuggestions = getCategorySuggestions;
        this.onChange = onChange;
      }

      async removeCategory(favorite, fallbackCategories, enabled, category) {
        const source = tools.getCategories(this.store, favorite.login, fallbackCategories);
        const next = tools.removeCategory(source, category);
        await this.store.setFavoriteCategoryFilter(favorite.login, {
          categories: next,
          enabled: next.length ? enabled : false
        });
        this.onChange();
      }

      render({ favorite, live, knownCategories }) {
        const filterCategories = Array.isArray(favorite.categoryFilter?.categories)
          ? favorite.categoryFilter.categories
          : [];
        const section = document.createElement('section');
        section.className = 'tfr-details-section';
        const title = document.createElement('h4');
        title.className = 'tfr-details-section__title';
        title.textContent = t('details.filter.title');
        section.appendChild(title);
        const container = document.createElement('div');
        container.className = 'tfr-category-filter';
        const { id: toggleId, label: toggleLabel, toggle } = view.renderToggle(favorite);
        container.appendChild(toggleLabel);
        container.appendChild(view.renderList({
          categories: filterCategories,
          enabled: toggle.checked,
          onRemove: (category) => this.removeCategory(
            favorite,
            filterCategories,
            toggle.checked,
            category
          )
        }));
        const {
          row,
          input,
          addButton,
          datalist,
          suggestions
        } = view.renderInput(favorite, toggleId, knownCategories);
        container.append(row, datalist, suggestions, view.renderLiveInfo(live));

        const applyToggleState = (enabled) => {
          view.setControlsEnabled(enabled, [input, addButton]);
        };
        const clearSuggestions = () => view.clearSuggestions(suggestions);
        const getCurrentCategories = () => tools.getCategories(
          this.store,
          favorite.login,
          filterCategories
        );
        applyToggleState(toggle.checked);

        let suggestionToken = 0;
        const addCategory = async (rawValue) => {
          const next = tools.addCategory(
            getCurrentCategories(),
            typeof rawValue === 'string' ? rawValue : input.value
          );
          if (!next) {
            input.value = '';
            clearSuggestions();
            return;
          }
          await this.store.setFavoriteCategoryFilter(favorite.login, {
            categories: next,
            enabled: true
          });
          toggle.checked = true;
          applyToggleState(true);
          input.value = '';
          clearSuggestions();
          this.onChange();
        };
        const updateSuggestions = async () => {
          const typedRaw = input.value;
          const normalizedTerm = normalizeCategoryName(typedRaw);
          const currentToken = ++suggestionToken;
          clearSuggestions();
          if (!normalizedTerm) return;
          const remoteNames = await this.getCategorySuggestions(typedRaw);
          if (currentToken !== suggestionToken) return;
          const matches = tools.buildSuggestions({
            remote: remoteNames,
            known: knownCategories,
            selected: getCurrentCategories(),
            term: normalizedTerm
          });
          view.renderSuggestions(suggestions, matches, addCategory);
        };

        toggle.addEventListener('change', async (event) => {
          const enabled = event.target.checked;
          applyToggleState(enabled);
          if (enabled) updateSuggestions();
          else clearSuggestions();
          const categories = getCurrentCategories();
          await this.store.setFavoriteCategoryFilter(favorite.login, {
            enabled,
            categories: Array.isArray(categories) ? [...categories] : []
          });
          this.onChange();
        });
        addButton.addEventListener('click', () => addCategory());
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addCategory();
          }
        });
        input.addEventListener('input', updateSuggestions);
        input.addEventListener('focus', updateSuggestions);
        input.addEventListener('blur', () => setTimeout(clearSuggestions, 120));
        section.appendChild(container);
        return section;
      }
    };
  };

  window.TFRFavoriteCategoryFilterController = { create: createFavoriteCategoryFilterController };
})();

(() => {
  const createSidebarRenderer = ({
    DEFAULT_AVATAR,
    t,
    formatViewers,
    shouldDisplayFavorite,
    getLiveDataEntry
  }) => {
  class SidebarRenderer {
    constructor(store) {
      this.store = store;
      this.container = null;
      this.sideNavObserver = null;
      this.unsubscribe = null;
    }

    init() {
      this.unsubscribe = this.store.subscribe(() => this.render());
      this.observeSideNav();
      this.render();
    }

    dispose() {
      this.unsubscribe?.();
      this.sideNavObserver?.disconnect();
    }

    observeSideNav() {
      this.sideNavObserver?.disconnect();
      this.sideNavObserver = new MutationObserver(() => {
        this.ensureContainer();
      });
      this.sideNavObserver.observe(document.body, { childList: true, subtree: true });
      this.ensureContainer();
    }

    getNav() {
      return (
        document.querySelector('nav[data-a-target="side-nav"]') ||
        document.querySelector('nav[data-test-selector="side-nav"]') ||
        document.querySelector('div.side-nav') ||
        document.querySelector('[data-test-selector="side-nav"]')
      );
    }

    getSection(nav) {
      if (!nav) return null;
      const selectors = [
        'section[data-test-selector="followed-side-nav-section"]',
        'section[data-a-target="side-nav-section"]',
        'section[aria-label="Followed Channels"]',
        'section[aria-label="Chaines suivies"]',
        'section[data-test-selector="side-nav-section"]'
      ];
      for (const selector of selectors) {
        const candidate = nav.querySelector(selector);
        if (candidate) return candidate;
      }
      return nav.querySelector('section') || nav;
    }

    getList(section) {
      if (!section) return null;
      const selectors = [
        '[data-test-selector="followed-side-nav-section__items"]',
        '[data-test-selector="side-nav-section__items"]',
        '.side-nav-section__items',
        '[role="list"]',
        'ul',
        '.simplebar-content > div',
        '[data-simplebar] > div'
      ];
      for (const selector of selectors) {
        const candidate = section.querySelector(selector);
        if (candidate) return candidate;
      }
      return section;
    }

    getModernPinnedHost() {
      const candidates = Array.from(document.querySelectorAll('div.Layout-sc-1xcs6mc-0.gDDWxy'));
      for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement)) continue;
        const sideNav = candidate.closest(
          '.side-nav, [data-test-selector="side-nav"], nav[data-a-target="side-nav"], nav[data-test-selector="side-nav"]'
        );
        if (!sideNav) continue;
        return candidate;
      }
      return null;
    }

    getModernInsertionTarget(wrapper) {
      if (!(wrapper instanceof HTMLElement)) {
        return null;
      }
      const selectors = [
        '[data-test-selector="side-nav"] [data-test-selector="followed-side-nav-section__items"]',
        '[data-test-selector="side-nav"] [data-test-selector="side-nav-section__items"]',
        '[data-test-selector="side-nav"] [role="list"]',
        '[data-test-selector="side-nav"] nav',
        '[data-test-selector="side-nav"]',
        '.side-nav__new [data-test-selector="side-nav-section__items"]',
        '.side-nav__new [role="list"]',
        '.side-nav__new',
        '.scrollable-area__content',
        '.simplebar-content > div',
        '[role="list"]'
      ];
      for (const selector of selectors) {
        try {
          const candidate = wrapper.querySelector(selector);
          if (candidate instanceof HTMLElement && !candidate.closest('#tfr-favorites-root')) {
            return candidate;
          }
        } catch (error) {
          // ignore invalid selectors on dynamic DOM
        }
      }
      return wrapper;
    }

    ensureContainer() {
      const modernWrapper = this.getModernPinnedHost();
      let targetParent = null;
      let needsListItem = false;

      if (modernWrapper) {
        targetParent = this.getModernInsertionTarget(modernWrapper);
        if (!targetParent) {
          this.container = null;
          return;
        }
        if (modernWrapper instanceof HTMLElement) {
          modernWrapper.style.pointerEvents = 'auto';
        }
        if (targetParent instanceof HTMLElement && targetParent !== modernWrapper) {
          targetParent.style.pointerEvents = 'auto';
        }
      } else {
        const nav = this.getNav();
        if (!nav) {
          this.container = null;
          return;
        }
        const section = this.getSection(nav);
        const list = this.getList(section);
        if (!list) {
          this.container = null;
          return;
        }
        nav.style.pointerEvents = 'auto';
        if (section && section !== nav) section.style.pointerEvents = 'auto';
        if (list && list !== nav && list !== section) list.style.pointerEvents = 'auto';
        targetParent = list;
        needsListItem = list.tagName === 'UL' || list.getAttribute('role') === 'list';
      }

      if (!(targetParent instanceof HTMLElement)) {
        this.container = null;
        return;
      }

      if (
        !needsListItem &&
        (targetParent.tagName === 'UL' ||
          targetParent.tagName === 'OL' ||
          targetParent.getAttribute('role') === 'list')
      ) {
        needsListItem = true;
      }

      const desiredTag = needsListItem ? 'li' : 'div';
      const candidates = Array.from(document.querySelectorAll('#tfr-favorites-root'));
      let container =
        candidates.find((node) => node.parentElement === targetParent) ||
        candidates.find((node) => node.tagName.toLowerCase() === desiredTag) ||
        candidates[0] ||
        null;

      if (container && container.tagName.toLowerCase() !== desiredTag) {
        const replacement = document.createElement(desiredTag);
        replacement.id = 'tfr-favorites-root';
        replacement.className = 'tfr-favorites-root';
        while (container.firstChild) {
          replacement.appendChild(container.firstChild);
        }
        container.replaceWith(replacement);
        container = replacement;
      }

      if (!container) {
        container = document.createElement(desiredTag);
        container.id = 'tfr-favorites-root';
        container.className = 'tfr-favorites-root';
      }

      if (container.parentElement !== targetParent) {
        targetParent.insertBefore(container, targetParent.firstChild || null);
      }

      container.className = 'tfr-favorites-root';
      if (needsListItem) {
        container.classList.add('tfr-favorites-root--list-item', 'side-nav-card');
      } else {
        container.classList.remove('tfr-favorites-root--list-item', 'side-nav-card');
      }

      if (modernWrapper) {
        container.classList.add('tfr-favorites-root--modern');
      } else {
        container.classList.remove('tfr-favorites-root--modern');
      }

      container.style.pointerEvents = 'auto';

      document.querySelectorAll('#tfr-favorites-root').forEach((node) => {
        if (node !== container) {
          node.remove();
        }
      });

      this.container = container;
    }

    collectGroups(state, liveData) {
      const sortMode = state.preferences?.sortMode || 'viewersDesc';
      const categoryTree = this.store.getCategoriesTree();
      const validCategoryIds = new Set();
      const collectIds = (nodes) => {
        nodes.forEach((node) => {
          validCategoryIds.add(node.id);
          if (node.children && node.children.length) {
            collectIds(node.children);
          }
        });
      };
      collectIds(categoryTree);
      const favorites = Object.values(state.favorites);
      const assignments = new Map();
      const uncategorized = [];
      favorites.forEach((fav) => {
        const categoryId = Array.isArray(fav.categories) && fav.categories.length ? fav.categories[0] : null;
        if (!categoryId || !validCategoryIds.has(categoryId)) {
          uncategorized.push(fav);
          return;
        }
        if (!assignments.has(categoryId)) {
          assignments.set(categoryId, []);
        }
        assignments.get(categoryId).push(fav);
      });
      const comparator = (a, b) => {
        if (sortMode === 'alphabetical') return a.displayName.localeCompare(b.displayName, 'fr');
        if (sortMode === 'recent') return (b.addedAt || 0) - (a.addedAt || 0);
        const viewersA = getLiveDataEntry(liveData, a)?.viewers || 0;
        const viewersB = getLiveDataEntry(liveData, b)?.viewers || 0;
        if (viewersB !== viewersA) return viewersB - viewersA;
        return a.displayName.localeCompare(b.displayName, 'fr');
      };
      const buildNode = (node) => {
        const children = node.children.map((child) => buildNode(child)).filter(Boolean);
        const rawEntries = assignments.get(node.id) || [];
        const entries = rawEntries
          .filter((fav) => shouldDisplayFavorite(fav, getLiveDataEntry(liveData, fav)))
          .sort(comparator);
        const totalEntries = entries.length + children.reduce((sum, child) => sum + child.totalEntries, 0);
        if (!totalEntries) {
          return null;
        }
        return {
          id: node.id,
          name: node.name,
          collapsed: node.collapsed,
          parentId: node.parentId,
          entries,
          children,
          totalEntries
        };
      };
      const groups = [];
      categoryTree.forEach((root) => {
        const built = buildNode(root);
        if (built) {
          groups.push(built);
        }
      });
      const preferences = state.preferences || {};
      if (preferences.recentLiveEnabled) {
        const thresholdMinutes = Number(preferences.recentLiveThresholdMinutes);
        const sanitizedMinutes = Number.isFinite(thresholdMinutes) ? Math.max(1, Math.min(120, Math.round(thresholdMinutes))) : 10;
        const thresholdMs = sanitizedMinutes * 60000;
        const now = Date.now();
        const recentEntries = favorites
          .filter((fav) => fav.recentHighlightEnabled !== false)
          .filter((fav) => shouldDisplayFavorite(fav, getLiveDataEntry(liveData, fav)))
          .filter((fav) => {
            const live = getLiveDataEntry(liveData, fav);
            if (!live?.isLive) {
              return false;
            }
            const startedAt = live.startedAt ? Date.parse(live.startedAt) : NaN;
            if (!Number.isFinite(startedAt)) {
              return false;
            }
            const diff = now - startedAt;
            return diff >= 0 && diff <= thresholdMs;
          })
          .sort(comparator);
        if (recentEntries.length) {
          groups.unshift({
            id: 'recentLive',
            name: t('recent.sectionTitle'),
            collapsed: Boolean(preferences.recentLiveCollapsed),
            parentId: null,
            entries: recentEntries,
            children: [],
            totalEntries: recentEntries.length,
            isRecentLive: true
          });
        }
      }
      const uncategorizedEntries = uncategorized
        .filter((fav) => shouldDisplayFavorite(fav, getLiveDataEntry(liveData, fav)))
        .sort(comparator);
      if (uncategorizedEntries.length) {
        groups.push({
          id: 'uncategorized',
          name: 'Sans cat\u00e9gorie',
          collapsed: Boolean(state.preferences?.uncategorizedCollapsed),
          entries: uncategorizedEntries,
          children: [],
          totalEntries: uncategorizedEntries.length,
          isUncategorized: true
        });
      }
      return groups;
    }

    createFavoriteEntry(fav, liveData) {
      const live = getLiveDataEntry(liveData, fav);
      const anchor = document.createElement('a');
      anchor.className = 'tfr-favorite-entry';
      anchor.classList.add('side-nav-card__link', 'tw-link');
      anchor.href = `https://www.twitch.tv/${fav.login}`;
      anchor.target = '_self';
      anchor.rel = 'noopener noreferrer';
      if (live?.title) {
        anchor.title = live.title;
      } else if (live?.displayName) {
        anchor.title = live.displayName;
      } else {
        anchor.title = fav.displayName;
      }

      const avatar = document.createElement('img');
      avatar.className = 'tfr-favorite-entry__avatar';
      avatar.src = (live && live.avatarUrl) || fav.avatarUrl || DEFAULT_AVATAR;
      avatar.alt = fav.displayName;

      const info = document.createElement('div');
      info.className = 'tfr-favorite-entry__info';
      const nameLine = document.createElement('span');
      nameLine.className = 'tfr-favorite-entry__name';
      nameLine.textContent = live?.displayName || fav.displayName;
      const categoryLine = document.createElement('span');
      categoryLine.className = 'tfr-favorite-entry__category';
      categoryLine.textContent = live?.game || '';
      const viewerLine = document.createElement('span');
      viewerLine.className = 'tfr-favorite-entry__viewers';
      viewerLine.textContent = t('sidebar.viewerCount', { count: formatViewers(live?.viewers || 0) });
      info.appendChild(nameLine);
      if (categoryLine.textContent) {
        info.appendChild(categoryLine);
      }
      info.appendChild(viewerLine);
      anchor.appendChild(avatar);
      anchor.appendChild(info);
      return anchor;
    }

    render() {
      if (!this.container || !document.body.contains(this.container)) {
        this.ensureContainer();
        if (!this.container) return;
      }

      const state = this.store.getState();
      const liveData = this.store.getLiveData();
    const groups = this.collectGroups(state, liveData);
    const totalLive = groups.reduce((sum, group) => sum + group.totalEntries, 0);
    const isCollapsed = Boolean(state.preferences?.liveFavoritesCollapsed);

      this.container.innerHTML = '';
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'tfr-nav-header';
    if (isCollapsed) header.classList.add('is-collapsed');
    header.textContent = totalLive
      ? t('sidebar.live.headerWithCount', { count: totalLive })
      : t('sidebar.live.header');
    header.setAttribute('aria-expanded', String(!isCollapsed));
    header.addEventListener('click', () => this.store.toggleLiveFavoritesCollapsed());
    this.container.appendChild(header);

    if (!totalLive) {
      const empty = document.createElement('div');
      empty.className = 'tfr-empty';
      empty.textContent = t('sidebar.live.empty');
      this.container.appendChild(empty);
      return;
    }

    if (isCollapsed) {
      const collapsedNotice = document.createElement('div');
      collapsedNotice.className = 'tfr-empty';
      collapsedNotice.textContent = t('sidebar.live.collapsedNotice');
      this.container.appendChild(collapsedNotice);
      return;
    }

    const renderGroup = (group, depth = 0) => {
      const block = document.createElement('div');
      block.className = 'tfr-category-block';
      block.dataset.depth = String(depth);
      if (group.collapsed) block.classList.add('is-collapsed');
      if (group.isRecentLive) block.classList.add('tfr-category-block--recent');

      const headerRow = document.createElement('button');
      headerRow.type = 'button';
      headerRow.className = 'tfr-category-header';
      if (group.isRecentLive) headerRow.classList.add('tfr-category-header--recent');
      headerRow.style.paddingLeft = `${12 + depth * 16}px`;
      const label = document.createElement('span');
      label.className = 'tfr-category-header-label';
      const chevron = document.createElement('span');
      chevron.className = 'tfr-chevron';
      chevron.textContent = '>';
      chevron.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.textContent = group.name;
      const count = document.createElement('span');
      count.className = 'tfr-category-count';
      count.textContent = `${group.totalEntries}`;
      label.appendChild(chevron);
      label.appendChild(name);
      headerRow.appendChild(label);
      headerRow.appendChild(count);
      headerRow.setAttribute('aria-expanded', String(!group.collapsed));
      headerRow.addEventListener('click', () => {
        if (group.isRecentLive) {
          this.store.toggleRecentLiveCollapsed();
        } else if (group.isUncategorized) {
          this.store.setUncategorizedCollapsed(!group.collapsed);
        } else {
          this.store.toggleCategoryCollapse(group.id);
        }
      });

      block.appendChild(headerRow);
      if (group.entries.length) {
        const list = document.createElement('div');
        list.className = 'tfr-category-list';
        list.style.paddingLeft = `${depth * 16}px`;
        group.entries.forEach((fav) => {
          list.appendChild(this.createFavoriteEntry(fav, liveData));
        });
        block.appendChild(list);
      }
      if (group.children && group.children.length) {
        const childContainer = document.createElement('div');
        childContainer.className = 'tfr-subcategory-container';
        group.children.forEach((child) => {
          const childBlock = renderGroup(child, depth + 1);
          if (childBlock) {
            childContainer.appendChild(childBlock);
          }
        });
        block.appendChild(childContainer);
      }
      return block;
    };

    groups.forEach((group) => {
      const block = renderGroup(group, 0);
      if (block) {
        this.container.appendChild(block);
      }
    });
    }
  }


    return SidebarRenderer;
  };

  window.TFRSidebarRenderer = {
    create: createSidebarRenderer
  };
})();
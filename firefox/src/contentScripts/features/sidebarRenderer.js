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
      this.isSidebarHovering = false;
      this.boundMouseEnter = () => {
        if (!this.isSidebarHovering) {
          this.isSidebarHovering = true;
          this.render();
        }
      };
      this.boundMouseLeave = () => {
        if (this.isSidebarHovering) {
          this.isSidebarHovering = false;
          this.render();
        }
      };
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

    hexToRgb(hex) {
      const normalized = typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '';
      if (!normalized) return null;
      return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16)
      };
    }

    getCategoryAppearance(preferences = {}) {
      const opacity = Number(preferences.categoryColorOpacity);
      const gradient = Number(preferences.categoryColorGradient);
      const colorStyle = typeof preferences.categoryColorStyle === 'string' ? preferences.categoryColorStyle : 'gradient';
      const allowedStyles = new Set([
        'gradient',
        'solid',
        'stripe',
        'glow',
        'glass',
        'outline',
        'minimal',
        'dot',
        'rail',
        'double',
        'soft-card',
        'soft-neon',
        'ribbon',
        'count-badge',
        'ink',
        'compact',
        'parent-accent'
      ]);
      return {
        fillOpacity: Number.isFinite(opacity) ? Math.max(0, Math.min(30, Math.round(opacity))) / 100 : 0.07,
        gradientStop: `${Number.isFinite(gradient) ? Math.max(0, Math.min(100, Math.round(gradient))) : 62}%`,
        colorStyle: allowedStyles.has(colorStyle) ? colorStyle : 'gradient'
      };
    }

    applyCategoryColor(element, color, appearance = this.getCategoryAppearance()) {
      const rgb = this.hexToRgb(color);
      if (!rgb) return;
      const fillOpacity = Math.max(0, Math.min(1, Number(appearance.fillOpacity) || 0));
      const tintOpacity = fillOpacity > 0 ? Math.min(0.42, fillOpacity + 0.11) : 0;
      const hoverOpacity = fillOpacity > 0 ? Math.min(0.52, tintOpacity + 0.1) : 0.12;
      element.dataset.color = 'custom';
      element.dataset.colorStyle = appearance.colorStyle || 'gradient';
      element.style.setProperty('--tfr-category-tint', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${tintOpacity.toFixed(2)})`);
      element.style.setProperty('--tfr-category-fill', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${fillOpacity.toFixed(2)})`);
      element.style.setProperty('--tfr-category-tint-hover', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${hoverOpacity.toFixed(2)})`);
      element.style.setProperty('--tfr-category-accent', color);
      element.style.setProperty('--tfr-category-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(0.38, fillOpacity + 0.08).toFixed(2)})`);
      element.style.setProperty('--tfr-category-gradient-stop', appearance.gradientStop || '62%');
    }

    applyRootAccent(element, color) {
      const rgb = this.hexToRgb(color);
      if (!rgb) return;
      element.dataset.rootAccent = 'custom';
      element.style.setProperty('--tfr-root-accent', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.72)`);
      element.style.setProperty('--tfr-root-accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
    }

    applyFavoriteAccent(element, color) {
      const rgb = this.hexToRgb(color);
      if (!rgb) return;
      element.dataset.groupAccent = 'custom';
      element.style.setProperty('--tfr-streamer-accent', color);
      element.style.setProperty('--tfr-streamer-accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`);
      element.style.setProperty('--tfr-streamer-accent-mid', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`);
      element.style.setProperty('--tfr-streamer-accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.38)`);
      element.style.setProperty('--tfr-streamer-accent-text', `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
    }

    applySurfaceColor(element, color) {
      const rgb = this.hexToRgb(color);
      if (!rgb) return;
      element.dataset.surfaceColor = 'custom';
      element.style.setProperty('--tfr-sidebar-custom', color);
      element.style.setProperty('--tfr-sidebar-custom-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`);
      element.style.setProperty('--tfr-sidebar-custom-mid', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.26)`);
      element.style.setProperty('--tfr-sidebar-custom-strong', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.42)`);
      element.style.setProperty('--tfr-sidebar-custom-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`);
    }


    sanitizeStreamerItemStyle(value) {
      const allowed = new Set([
        'default',
        'compact',
        'card',
        'soft-card',
        'outline',
        'left-line',
        'avatar-ring',
        'avatar-square',
        'neon',
        'viewer-badge',
        'game-focus',
        'title-focus',
        'glass',
        'minimal'
      ]);
      return allowed.has(value) ? value : 'default';
    }

    sanitizeSidebarSurfaceStyle(value) {
      const allowed = new Set([
        'default',
        'full',
        'panel',
        'glow',
        'rail',
        'connected',
        'layers',
        'canvas',
        'edge',
        'spectrum',
        'pulse',
        'poster',
        'arcade'
      ]);
      return allowed.has(value) ? value : 'default';
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
      container.removeEventListener('mouseenter', this.boundMouseEnter);
      container.removeEventListener('mouseleave', this.boundMouseLeave);
      container.addEventListener('mouseenter', this.boundMouseEnter);
      container.addEventListener('mouseleave', this.boundMouseLeave);

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
          color: node.color || '',
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
      const specialColors = preferences.specialCategoryColors || {};
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
            color: this.hexToRgb(specialColors.recentLive) ? specialColors.recentLive : '',
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
          color: this.hexToRgb(specialColors.uncategorized) ? specialColors.uncategorized : '',
          isUncategorized: true
        });
      }
      return groups;
    }

    createFavoriteEntry(fav, liveData, groupColor = '') {
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
      this.applyFavoriteAccent(anchor, groupColor);

      const avatar = document.createElement('img');
      avatar.className = 'tfr-favorite-entry__avatar';
      avatar.src = (live && live.avatarUrl) || fav.avatarUrl || DEFAULT_AVATAR;
      avatar.alt = fav.displayName;

      const info = document.createElement('div');
      info.className = 'tfr-favorite-entry__info';
      const identity = document.createElement('div');
      identity.className = 'tfr-favorite-entry__identity';
      const meta = document.createElement('div');
      meta.className = 'tfr-favorite-entry__meta';
      const nameLine = document.createElement('span');
      nameLine.className = 'tfr-favorite-entry__name';
      nameLine.textContent = live?.displayName || fav.displayName;
      const categoryLine = document.createElement('span');
      categoryLine.className = 'tfr-favorite-entry__category';
      categoryLine.textContent = live?.game || '';
      const viewerLine = document.createElement('span');
      viewerLine.className = 'tfr-favorite-entry__viewers';
      viewerLine.textContent = formatViewers(live?.viewers || 0);
      viewerLine.title = t('sidebar.viewerCount', { count: viewerLine.textContent });
      const titleLine = document.createElement('span');
      titleLine.className = 'tfr-favorite-entry__title';
      titleLine.textContent = live?.title || '';
      identity.appendChild(nameLine);
      meta.appendChild(categoryLine);
      if (titleLine.textContent) {
        meta.appendChild(titleLine);
      }
      info.appendChild(identity);
      info.appendChild(viewerLine);
      if (categoryLine.textContent || titleLine.textContent) {
        info.appendChild(meta);
      }
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
    const hideCollapsedUntilHover = Boolean(state.preferences?.hideCollapsedGroupsUntilHover);
    const shouldHideCollapsedGroups = hideCollapsedUntilHover && !this.isSidebarHovering;
    const categoryAppearance = this.getCategoryAppearance(state.preferences || {});
    this.container.dataset.streamerStyle = this.sanitizeStreamerItemStyle(state.preferences?.streamerItemStyle);
    this.container.dataset.surfaceStyle = this.sanitizeSidebarSurfaceStyle(state.preferences?.sidebarSurfaceStyle);
    this.container.removeAttribute('data-surface-color');
    this.container.style.removeProperty('--tfr-sidebar-custom');
    this.container.style.removeProperty('--tfr-sidebar-custom-soft');
    this.container.style.removeProperty('--tfr-sidebar-custom-mid');
    this.container.style.removeProperty('--tfr-sidebar-custom-strong');
    this.container.style.removeProperty('--tfr-sidebar-custom-glow');
    this.applySurfaceColor(this.container, state.preferences?.sidebarSurfaceColor);
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

    const renderGroup = (group, depth = 0, inheritedParentColor = '') => {
      if (shouldHideCollapsedGroups && group.collapsed) {
        return null;
      }
      const childAccentColor = group.color || inheritedParentColor;
      const visibleChildBlocks = (group.children || [])
        .map((child) => renderGroup(child, depth + 1, childAccentColor))
        .filter(Boolean);
      if (!group.entries.length && !visibleChildBlocks.length) {
        return null;
      }
      const block = document.createElement('div');
      block.className = 'tfr-category-block';
      block.dataset.depth = String(depth);
      if (group.collapsed) block.classList.add('is-collapsed');
      if (group.isRecentLive) block.classList.add('tfr-category-block--recent');
      if (group.color) {
        this.applyCategoryColor(block, group.color, categoryAppearance);
      }
      const headerRow = document.createElement('button');
      headerRow.type = 'button';
      headerRow.className = 'tfr-category-header';
      if (group.isRecentLive) headerRow.classList.add('tfr-category-header--recent');
      headerRow.style.paddingLeft = `${6 + depth * 10}px`;
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
        list.style.paddingLeft = `${depth * 8}px`;
        const entryAccentColor = group.color || inheritedParentColor;
        group.entries.forEach((fav) => {
          list.appendChild(this.createFavoriteEntry(fav, liveData, entryAccentColor));
        });
        block.appendChild(list);
      }
      if (visibleChildBlocks.length) {
        const childContainer = document.createElement('div');
        childContainer.className = 'tfr-subcategory-container';
        if (childAccentColor) {
          this.applyRootAccent(childContainer, childAccentColor);
        }
        visibleChildBlocks.forEach((childBlock) => childContainer.appendChild(childBlock));
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

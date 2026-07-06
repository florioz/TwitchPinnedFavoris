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
      this.isAutoCompact = false;
      this.autoCompactLevel = 0;
      this.autoCompactFrame = null;
      this.previousVisibleLogins = null;
      this.previousCompactLevels = new Map();
      this.previewTimer = null;
      this.suppressAnimationsOnce = false;
      this.boundPreviewAnimation = () => this.previewSidebarAnimation();
      this.boundMouseEnter = () => {
        if (!this.isSidebarHovering) {
          this.isSidebarHovering = true;
          this.suppressAnimationsOnce = true;
          this.render();
        }
      };
      this.boundMouseLeave = () => {
        if (this.isSidebarHovering) {
          this.isSidebarHovering = false;
          this.suppressAnimationsOnce = true;
          this.render();
        }
      };
    }

    init() {
      this.unsubscribe = this.store.subscribe(() => this.render());
      this.observeSideNav();
      window.addEventListener('tfr:previewSidebarAnimation', this.boundPreviewAnimation);
      this.render();
    }

    dispose() {
      this.unsubscribe?.();
      this.sideNavObserver?.disconnect();
      window.removeEventListener('tfr:previewSidebarAnimation', this.boundPreviewAnimation);
      if (this.autoCompactFrame) {
        cancelAnimationFrame(this.autoCompactFrame);
        this.autoCompactFrame = null;
      }
      if (this.previewTimer) {
        clearTimeout(this.previewTimer);
        this.previewTimer = null;
      }
    }

    scheduleAutoCompactCheck(enabled) {
      if (this.autoCompactFrame) {
        cancelAnimationFrame(this.autoCompactFrame);
        this.autoCompactFrame = null;
      }
      const clearGroupCompaction = () => {
        this.container?.querySelectorAll('.tfr-category-block[data-compact-level]').forEach((block) => {
          block.removeAttribute('data-compact-level');
        });
      };
      if (!enabled || !this.container) {
        this.isAutoCompact = false;
        this.autoCompactLevel = 0;
        this.previousCompactLevels = new Map();
        clearGroupCompaction();
        this.container?.classList.remove('is-auto-compact');
        this.container?.removeAttribute('data-auto-compact');
        this.container?.removeAttribute('data-auto-compact-level');
        return;
      }
      if (!document.body.contains(this.container)) {
        return;
      }
      const parent = this.container.parentElement;
      const viewportHeight = Math.max(1, window.innerHeight - this.container.getBoundingClientRect().top - 8);
      const measuredHeights = [
        this.container.clientHeight,
        parent?.clientHeight || 0,
        viewportHeight
      ].filter((height) => Number.isFinite(height) && height > 0);
      const visibleHeight = Math.max(1, Math.min(...measuredHeights));
      this.container.dataset.autoCompact = 'measuring';
      clearGroupCompaction();

      const isOverflowing = (ratio = 1) => this.container.scrollHeight > visibleHeight * ratio;
      if (!isOverflowing(1.08)) {
        this.isAutoCompact = false;
        this.autoCompactLevel = 0;
        this.container.classList.remove('is-auto-compact');
        this.container.dataset.autoCompact = 'idle';
        this.container.dataset.autoCompactLevel = '0';
        this.previousCompactLevels = new Map();
        return;
      }

      const candidates = Array.from(this.container.querySelectorAll('.tfr-category-block'))
        .filter((block) => !block.classList.contains('is-collapsed'))
        .map((block, index) => ({
          block,
          index,
          entries: Number(block.dataset.totalEntries || '0'),
          height: block.scrollHeight
        }))
        .filter((item) => item.entries > 1 && item.height > 0)
        .sort((a, b) => (b.height - a.height) || (b.entries - a.entries) || (a.index - b.index));

      for (const item of candidates) {
        item.block.dataset.compactLevel = '1';
        if (!isOverflowing(1.02)) break;
      }

      if (isOverflowing(1.02)) {
        for (const item of candidates) {
          item.block.dataset.compactLevel = '2';
          if (!isOverflowing(1.0)) break;
        }
      }

      const nextLevel = candidates.reduce((level, item) => Math.max(level, Number(item.block.dataset.compactLevel || '0')), 0);
      const shouldCompact = nextLevel > 0;
      this.autoCompactLevel = nextLevel;
      this.isAutoCompact = shouldCompact;
      this.container.classList.toggle('is-auto-compact', shouldCompact);
      this.container.dataset.autoCompact = shouldCompact ? 'active' : 'idle';
      this.container.dataset.autoCompactLevel = String(nextLevel);
      this.previousCompactLevels = new Map(
        Array.from(this.container.querySelectorAll('.tfr-category-block[data-group-id]')).map((block) => [
          block.dataset.groupId,
          block.dataset.compactLevel || '0'
        ])
      );
    }

    getSidebarAnimationStyle() {
      if (this.suppressAnimationsOnce) return 'none';
      const allowed = new Set(['none', 'soft', 'slide', 'pop', 'glow', 'fly', 'bounce', 'spin', 'glitch']);
      const value = this.store.getState()?.preferences?.sidebarAnimationStyle;
      return allowed.has(value) ? value : 'soft';
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
        'minimal',
        'avatar-grid'
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

    sanitizeSidebarAnimationStyle(value) {
      const allowed = new Set(['none', 'soft', 'slide', 'pop', 'glow', 'fly', 'bounce', 'spin', 'glitch']);
      return allowed.has(value) ? value : 'soft';
    }

    sanitizeAutoCompactGroupStyle(value) {
      const allowed = new Set(['default', 'dense', 'vertical']);
      return allowed.has(value) ? value : 'default';
    }

    captureEntrySnapshots() {
      if (!this.container) return new Map();
      const snapshots = new Map();
      this.container.querySelectorAll('.tfr-favorite-entry[data-login]').forEach((entry) => {
        const login = entry.dataset.login;
        if (!login) return;
        snapshots.set(login, {
          rect: entry.getBoundingClientRect(),
          clone: entry.cloneNode(true)
        });
      });
      return snapshots;
    }

    animateRemovedEntries(previousSnapshots, currentLogins) {
      const animationStyle = this.getSidebarAnimationStyle();
      if (animationStyle === 'none') return;
      previousSnapshots.forEach((snapshot, login) => {
        if (currentLogins.has(login) || !snapshot?.clone || !snapshot?.rect) return;
        const ghost = snapshot.clone;
        ghost.classList.add('tfr-favorite-entry-ghost', 'tfr-entry-leave');
        ghost.dataset.sidebarAnimation = animationStyle;
        ghost.style.left = `${snapshot.rect.left}px`;
        ghost.style.top = `${snapshot.rect.top}px`;
        ghost.style.width = `${snapshot.rect.width}px`;
        ghost.style.height = `${snapshot.rect.height}px`;
        ghost.style.setProperty('--tfr-sidebar-animation', animationStyle);
        document.body.appendChild(ghost);
        window.setTimeout(() => ghost.remove(), animationStyle === 'fly' ? 820 : 620);
      });
    }

    animateNewEntries(currentLogins) {
      const animationStyle = this.getSidebarAnimationStyle();
      if (animationStyle === 'none' || !this.previousVisibleLogins) return;
      this.container.querySelectorAll('.tfr-favorite-entry[data-login]').forEach((entry) => {
        if (this.previousVisibleLogins.has(entry.dataset.login)) return;
        if (animationStyle === 'fly') {
          this.animateFlyingEntry(entry);
          return;
        }
        entry.classList.add('tfr-entry-enter');
        window.setTimeout(() => entry.classList.remove('tfr-entry-enter'), 620);
      });
    }

    animateFlyingEntry(entry) {
      const rect = entry.getBoundingClientRect();
      const ghost = entry.cloneNode(true);
      ghost.classList.add('tfr-favorite-entry-ghost', 'tfr-entry-fly-in');
      ghost.dataset.sidebarAnimation = 'fly';
      ghost.style.left = `${rect.left}px`;
      ghost.style.top = `${rect.top}px`;
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      ghost.style.setProperty('--tfr-fly-x', `${Math.max(240, window.innerWidth - rect.left + 32)}px`);
      document.body.appendChild(ghost);
      entry.classList.add('tfr-entry-fly-target');
      window.setTimeout(() => {
        ghost.remove();
        entry.classList.remove('tfr-entry-fly-target');
      }, 820);
    }

    previewSidebarAnimation() {
      if (!this.container || this.getSidebarAnimationStyle() === 'none') return;
      const entries = Array.from(this.container.querySelectorAll('.tfr-favorite-entry'));
      const animationStyle = this.getSidebarAnimationStyle();
      const stepMs = animationStyle === 'fly' ? 55 : 28;
      entries.forEach((entry, index) => {
        window.setTimeout(() => {
          if (animationStyle === 'fly') {
            this.animateFlyingEntry(entry);
            return;
          }
          entry.classList.remove('tfr-entry-enter');
          void entry.offsetWidth;
          entry.classList.add('tfr-entry-enter');
        }, index * stepMs);
      });
      if (this.previewTimer) clearTimeout(this.previewTimer);
      this.previewTimer = window.setTimeout(() => {
        entries.forEach((entry) => entry.classList.remove('tfr-entry-enter'));
        this.previewTimer = null;
      }, 900 + entries.length * stepMs);
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
      anchor.dataset.login = fav.login;
      anchor.href = `https://www.twitch.tv/${fav.login}`;
      anchor.target = '_self';
      anchor.rel = 'noopener noreferrer';
      const tooltipParts = [
        live?.displayName || fav.displayName,
        live?.game || '',
        live?.title || '',
        live?.viewers ? t('sidebar.viewerCount', { count: formatViewers(live.viewers) }) : ''
      ].filter(Boolean);
      anchor.title = tooltipParts.join('\n');
      anchor.dataset.tooltip = anchor.title;
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
        if (!this.container) {
          this.suppressAnimationsOnce = false;
          return;
        }
      }

      try {
      const state = this.store.getState();
      const liveData = this.store.getLiveData();
    const previousSnapshots = this.captureEntrySnapshots();
    const hideCollapsedUntilHover = Boolean(state.preferences?.hideCollapsedGroupsUntilHover);
    const shouldHideCollapsedGroups = hideCollapsedUntilHover && !this.isSidebarHovering;
    const autoCompactEnabled = Boolean(state.preferences?.autoCompactSidebarEnabled);
    if (!autoCompactEnabled) {
      this.isAutoCompact = false;
      this.autoCompactLevel = 0;
      this.previousCompactLevels = new Map();
    }
    const normalStreamerStyle = this.sanitizeStreamerItemStyle(state.preferences?.streamerItemStyle);
    const compactStreamerStyle = this.sanitizeStreamerItemStyle(state.preferences?.autoCompactStreamerStyle || 'compact');
    const compactGroupStyle = this.sanitizeAutoCompactGroupStyle(state.preferences?.autoCompactGroupStyle);
    const animationStyle = this.sanitizeSidebarAnimationStyle(state.preferences?.sidebarAnimationStyle);
    const categoryAppearance = this.getCategoryAppearance(state.preferences || {});
    this.container.dataset.streamerStyle = normalStreamerStyle;
    this.container.dataset.normalStreamerStyle = normalStreamerStyle;
    this.container.dataset.compactStreamerStyle = compactStreamerStyle;
    this.container.dataset.compactGroupStyle = compactGroupStyle;
    this.container.dataset.sidebarAnimation = animationStyle;
    this.container.dataset.autoCompactLevel = String(this.autoCompactLevel);
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
    const isEnabled = state.preferences?.liveFavoritesEnabled !== false;

      this.container.innerHTML = '';
    this.container.hidden = !isEnabled;
    if (!isEnabled) {
      return;
    }

    const header = document.createElement('div');
    header.className = 'tfr-nav-header';
    header.textContent = totalLive
      ? t('sidebar.live.headerWithCount', { count: totalLive })
      : t('sidebar.live.header');
    this.container.appendChild(header);

    if (!totalLive) {
      const empty = document.createElement('div');
      empty.className = 'tfr-empty';
      empty.textContent = t('sidebar.live.empty');
      this.container.appendChild(empty);
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
      block.dataset.totalEntries = String(group.totalEntries);
      block.dataset.groupId = group.id;
      const previousCompactLevel = this.previousCompactLevels.get(group.id);
      if (previousCompactLevel && previousCompactLevel !== '0') {
        block.dataset.compactLevel = previousCompactLevel;
      }
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
    const currentLogins = new Set(
      Array.from(this.container.querySelectorAll('.tfr-favorite-entry[data-login]')).map((entry) => entry.dataset.login)
    );
    this.animateRemovedEntries(previousSnapshots, currentLogins);
    this.animateNewEntries(currentLogins);
    this.previousVisibleLogins = currentLogins;
    this.scheduleAutoCompactCheck(autoCompactEnabled);
      } finally {
        this.suppressAnimationsOnce = false;
      }
    }
  }


    return SidebarRenderer;
  };

  window.TFRSidebarRenderer = {
    create: createSidebarRenderer
  };
})();

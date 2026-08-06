(() => {
  const SIDE_NAV_SELECTOR = '[data-test-selector="side-nav"], [data-a-target="side-nav-bar"]';
  const NATIVE_SCROLL_SELECTOR = '.side-nav__scrollable_content';
  const NATIVE_CONTENT_SELECTOR = '.side-bar-contents';
  const MODERN_HOST_SELECTOR = 'div.Layout-sc-1xcs6mc-0.gDDWxy';
  const MODERN_SIDE_NAV_SELECTOR =
    '.side-nav, [data-test-selector="side-nav"], nav[data-a-target="side-nav"], nav[data-test-selector="side-nav"]';
  const MODERN_TARGET_SELECTORS = [
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
  const LEGACY_SECTION_SELECTORS = [
    'section[data-test-selector="followed-side-nav-section"]',
    'section[data-a-target="side-nav-section"]',
    'section[aria-label="Followed Channels"]',
    'section[aria-label="Chaines suivies"]',
    'section[data-test-selector="side-nav-section"]',
    'section'
  ];
  const LEGACY_LIST_SELECTORS = [
    '[data-test-selector="followed-side-nav-section__items"]',
    '[data-test-selector="side-nav-section__items"]',
    '.side-nav-section__items',
    '[role="list"]',
    'ul',
    '.simplebar-content > div',
    '[data-simplebar] > div'
  ];
  const isQueryRoot = (value) => Boolean(value && typeof value.querySelector === 'function');
  const isListTarget = (target) => Boolean(
    target && (
      target.tagName === 'UL' ||
      target.tagName === 'OL' ||
      target.getAttribute?.('role') === 'list'
    )
  );
  const createMount = ({ target, modern, nativeScroll = false, pointerTargets = [] }) => ({
    target,
    needsListItem: isListTarget(target),
    modern: Boolean(modern),
    nativeScroll: Boolean(nativeScroll),
    pointerTargets: Array.from(new Set(pointerTargets.filter(Boolean)))
  });

  const findSideNav = (documentRef = document) => documentRef.querySelector(SIDE_NAV_SELECTOR);

  const findInsertionTarget = (documentRef = document) => {
    const sideNav = findSideNav(documentRef);
    if (!isQueryRoot(sideNav)) return null;

    const scrollable = sideNav.querySelector(NATIVE_SCROLL_SELECTOR);
    if (!isQueryRoot(scrollable)) return null;

    const contents = scrollable.querySelector(NATIVE_CONTENT_SELECTOR);
    if (isQueryRoot(contents)) return contents;

    return scrollable.firstElementChild || scrollable;
  };

  const findScrollViewport = (container) => {
    if (!container || typeof container.closest !== 'function') return null;
    return container.closest(NATIVE_SCROLL_SELECTOR);
  };

  const findLegacyNav = (documentRef = document) => (
    documentRef.querySelector('nav[data-a-target="side-nav"]') ||
    documentRef.querySelector('nav[data-test-selector="side-nav"]') ||
    documentRef.querySelector('div.side-nav') ||
    documentRef.querySelector('[data-test-selector="side-nav"]')
  );

  const findFirst = (root, selectors) => {
    if (!isQueryRoot(root)) return null;
    for (const selector of selectors) {
      try {
        const candidate = root.querySelector(selector);
        if (candidate) return candidate;
      } catch (error) {
        // Twitch can replace parts of the sidebar while selectors are evaluated.
      }
    }
    return null;
  };

  const findModernHost = (documentRef = document) => {
    const candidates = Array.from(
      documentRef.querySelectorAll?.(MODERN_HOST_SELECTOR) || []
    );
    return candidates.find((candidate) => candidate.closest?.(MODERN_SIDE_NAV_SELECTOR)) || null;
  };

  const resolveMount = (documentRef = document) => {
    const nativeTarget = findInsertionTarget(documentRef);
    if (nativeTarget) {
      return createMount({
        target: nativeTarget,
        modern: true,
        nativeScroll: true,
        pointerTargets: [nativeTarget]
      });
    }

    const modernHost = findModernHost(documentRef);
    if (modernHost) {
      const target = findFirst(modernHost, MODERN_TARGET_SELECTORS) || modernHost;
      return createMount({
        target,
        modern: true,
        pointerTargets: target === modernHost ? [modernHost] : [modernHost, target]
      });
    }

    const nav = findLegacyNav(documentRef);
    if (!nav) return null;
    const section = findFirst(nav, LEGACY_SECTION_SELECTORS) || nav;
    const target = findFirst(section, LEGACY_LIST_SELECTORS) || section;
    return createMount({
      target,
      modern: false,
      pointerTargets: [nav, section, target]
    });
  };

  window.TFRSidebarDomAdapter = {
    findSideNav,
    findInsertionTarget,
    findScrollViewport,
    resolveMount
  };
})();

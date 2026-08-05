(() => {
  const isQueryRoot = (value) => Boolean(value && typeof value.querySelector === 'function');

  const findSideNav = (documentRef = document) => documentRef.querySelector(
    '[data-test-selector="side-nav"], [data-a-target="side-nav-bar"]'
  );

  const findInsertionTarget = (documentRef = document) => {
    const sideNav = findSideNav(documentRef);
    if (!isQueryRoot(sideNav)) return null;

    const scrollable = sideNav.querySelector('.side-nav__scrollable_content');
    if (!isQueryRoot(scrollable)) return null;

    const contents = scrollable.querySelector('.side-bar-contents');
    if (isQueryRoot(contents)) return contents;

    return scrollable.firstElementChild || scrollable;
  };

  const findScrollViewport = (container) => {
    if (!container || typeof container.closest !== 'function') return null;
    return container.closest('.side-nav__scrollable_content');
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
      documentRef.querySelectorAll?.('div.Layout-sc-1xcs6mc-0.gDDWxy') || []
    );
    return candidates.find((candidate) => candidate.closest?.(
      '.side-nav, [data-test-selector="side-nav"], nav[data-a-target="side-nav"], nav[data-test-selector="side-nav"]'
    )) || null;
  };

  const resolveMount = (documentRef = document) => {
    const nativeTarget = findInsertionTarget(documentRef);
    if (nativeTarget) {
      return { target: nativeTarget, needsListItem: false, modern: true, pointerTargets: [nativeTarget] };
    }

    const modernHost = findModernHost(documentRef);
    if (modernHost) {
      const target = findFirst(modernHost, [
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
      ]) || modernHost;
      return {
        target,
        needsListItem: target.tagName === 'UL' || target.getAttribute?.('role') === 'list',
        modern: true,
        pointerTargets: target === modernHost ? [modernHost] : [modernHost, target]
      };
    }

    const nav = findLegacyNav(documentRef);
    if (!nav) return null;
    const section = findFirst(nav, [
      'section[data-test-selector="followed-side-nav-section"]',
      'section[data-a-target="side-nav-section"]',
      'section[aria-label="Followed Channels"]',
      'section[aria-label="Chaines suivies"]',
      'section[data-test-selector="side-nav-section"]',
      'section'
    ]) || nav;
    const target = findFirst(section, [
      '[data-test-selector="followed-side-nav-section__items"]',
      '[data-test-selector="side-nav-section__items"]',
      '.side-nav-section__items',
      '[role="list"]',
      'ul',
      '.simplebar-content > div',
      '[data-simplebar] > div'
    ]) || section;
    return {
      target,
      needsListItem: target.tagName === 'UL' || target.getAttribute?.('role') === 'list',
      modern: false,
      pointerTargets: Array.from(new Set([nav, section, target]))
    };
  };

  window.TFRSidebarDomAdapter = {
    findSideNav,
    findInsertionTarget,
    findScrollViewport,
    resolveMount
  };
})();

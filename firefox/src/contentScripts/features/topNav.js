(() => {
  const createTopNavManager = ({
    t,
    sendExtensionMessage,
    extensionApi
  }) => {
  class TopNavManager {
  constructor(overlay) {
    this.overlay = overlay;
    this.button = null;
    this.vodsButton = null;
    this.observer = null;
    this.retryTimer = null;
    this.overlayListeners = [];
    this.pendingInjection = false;
    this.injectFrame = null;
    this.slot = null;
    this.bodyReadyFrame = null;
  }

  log(event, detail) {
    try {
      if (detail !== undefined) {
        console.log('[TFR] TopNav', event, detail);
      } else {
        console.log('[TFR] TopNav', event);
      }
    } catch (error) {
      console.error('[TFR] TopNav log error', error);
    }
  }

  init() {
    this.log('init');
    this.injectButton();
    if (!this.overlayListeners.length) {
      const onOpenUnsub = this.overlay.onOpen(() => this.setButtonActive(true));
      const onCloseUnsub = this.overlay.onClose(() => this.setButtonActive(false));
      [onOpenUnsub, onCloseUnsub].forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') {
          this.overlayListeners.push(unsubscribe);
        }
      });
    }
    this.setButtonActive(this.overlay.isOpen);
    this.observeDomMutations();
  }

  dispose() {
    this.log('dispose');
    this.observer?.disconnect();
    this.observer = null;
    if (this.injectFrame !== null) {
      cancelAnimationFrame(this.injectFrame);
      this.injectFrame = null;
    }
    if (this.bodyReadyFrame !== null) {
      cancelAnimationFrame(this.bodyReadyFrame);
      this.bodyReadyFrame = null;
    }
    this.pendingInjection = false;
    this.overlayListeners.forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.overlayListeners = [];
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.slot?.parentElement) {
      this.slot.parentElement.removeChild(this.slot);
    }
    this.slot = null;
    this.button = null;
    this.vodsButton = null;
  }

  scheduleRetry() {
    if (this.retryTimer) {
      return;
    }
    this.log('scheduleRetry');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.scheduleInjection();
    }, 500);
  }

  scheduleInjection() {
    if (this.pendingInjection) {
      return;
    }
    this.pendingInjection = true;
    if (this.injectFrame !== null) {
      cancelAnimationFrame(this.injectFrame);
    }
    this.injectFrame = requestAnimationFrame(() => {
      this.injectFrame = null;
      this.pendingInjection = false;
      this.injectButton();
    });
  }

  observeDomMutations() {
    const target = document.body || document.documentElement;
    if (!target) {
      if (this.bodyReadyFrame !== null) {
        cancelAnimationFrame(this.bodyReadyFrame);
      }
      this.bodyReadyFrame = requestAnimationFrame(() => {
        this.bodyReadyFrame = null;
        this.observeDomMutations();
      });
      this.log('wait-body');
      return;
    }
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => this.scheduleInjection());
    this.observer.observe(target, { childList: true, subtree: true });
  }

  ensureSlot(anchor) {
    if (!this.slot) {
      const tag = anchor?.parentElement?.tagName === 'SPAN' ? 'span' : 'div';
      this.slot = document.createElement(tag);
      this.slot.dataset.tfrTopnavSlot = 'true';
      this.slot.className = 'tfr-topnav-slot';
      this.slot.style.pointerEvents = 'auto';
      this.slot.style.display = 'inline-flex';
      this.slot.style.alignItems = 'center';
      this.slot.style.justifyContent = 'center';
      this.slot.style.position = 'relative';
      const stopHoverPropagation = (event) => {
        event.stopPropagation();
      };
      ['pointerenter', 'pointerover', 'mouseenter', 'mouseover', 'mouseleave', 'pointerleave'].forEach((eventName) => {
        this.slot.addEventListener(eventName, stopHoverPropagation, true);
      });
    }
    return this.slot;
  }

  isUsableParent(node) {
    if (!(node instanceof HTMLElement) || !node.isConnected) {
      return false;
    }
    const style = window.getComputedStyle(node);
    if (!style) {
      return false;
    }
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    if (parseFloat(style.opacity || '1') === 0) {
      return false;
    }
    if (node.offsetWidth === 0 && node.offsetHeight === 0 && style.position !== 'fixed' && style.position !== 'absolute') {
      return false;
    }
    return true;
  }

  findMountPoint() {
    const anchorSelectors = [
      '[data-a-target="top-nav-prime-link"]',
      '[data-a-target="prime-offers-icon"]',
      'button[data-a-target="prime-offers-icon"]',
      'button[data-target="prime-offers-icon"]',
      '[data-test-selector="prime-offers-icon"]',
      'button[aria-label="Offres Prime"]',
      'button[aria-label="Prime Offers"]',
      'a[aria-label="Offres Prime"]',
      'a[aria-label="Prime Offers"]'
    ];
    const containerSelectors = [
      '[data-test-selector="top-nav-bar-icon-buttons"]',
      '[data-test-selector="top-nav-bar__icon-menu"]',
      '[data-test-selector="top-nav-bar__icons"]',
      '[data-test-selector="top-nav"]',
      '[data-a-target="top-nav"]',
      '[data-test-selector="top-nav-bar-prime"]',
      '.Layout-sc-1xcs6mc-0.bZYcrx',
      'header div[role="menubar"]',
      'header [data-test-selector="tw-top-nav"]',
      'header nav'
    ];

    const findAnchorInParent = (parent) => {
      for (const selector of anchorSelectors) {
        try {
          const candidate = parent.querySelector(selector);
          if (candidate) {
            return candidate;
          }
        } catch (error) {
          this.log('selector-error', { selector, error: String(error) });
        }
      }
      return (
        Array.from(parent.querySelectorAll('[data-a-target],[data-target],button,a'))
          .find((node) => node !== this.button) || null
      );
    };

    const findUsableParent = (element) => {
      let current = element?.parentElement;
      while (current && !this.isUsableParent(current)) {
        current = current.parentElement;
      }
      if (current) {
        return current;
      }
      const root = element?.getRootNode?.();
      if (root?.host && this.isUsableParent(root.host)) {
        return root.host;
      }
      return null;
    };

    for (const selector of containerSelectors) {
      let parent = null;
      try {
        parent = document.querySelector(selector);
      } catch (error) {
        this.log('selector-error', { selector, error: String(error) });
        continue;
      }
      if (!parent || !this.isUsableParent(parent)) {
        continue;
      }
      this.log('mount-point', {
        strategy: 'container',
        selector,
        anchorTag: null,
        hasReference: false
      });
      return { parent, reference: null, anchor: null };
    }

    for (const selector of anchorSelectors) {
      let anchor = null;
      try {
        anchor = document.querySelector(selector);
      } catch (error) {
        this.log('selector-error', { selector, error: String(error) });
        continue;
      }
      if (!anchor) {
        continue;
      }
      const parent = findUsableParent(anchor);
      if (!parent) {
        continue;
      }
      const reference = anchor.nextElementSibling;
      this.log('mount-point', {
        strategy: 'direct',
        selector,
        anchorTag: anchor.tagName,
        hasReference: Boolean(reference)
      });
      return { parent, reference, anchor };
    }

    this.log('mount-point-missing');
    return null;
  }


  ensureButton() {
    if (this.button) {
      return this.button;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.tfrTopnavButton = 'true';
    button.dataset.aTarget = 'top-nav-favorites-button';
    button.className = 'tfr-topnav-action tfr-topnav-action--icon';
    button.style.pointerEvents = 'auto';
    button.style.display = 'inline-flex';
    button.style.flex = '0 0 auto';
    button.style.position = 'relative';
    button.style.zIndex = '1';
    button.tabIndex = 0;
    button.setAttribute('aria-label', t('sidebar.button'));
    button.setAttribute('aria-pressed', 'false');
    button.title = t('sidebar.button');
    button.innerHTML = '<svg class="tfr-topnav-action__icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2c-2.761 0-5 2.239-5 5 0 3.727 3.533 8.275 4.63 9.513a.5.5 0 0 0 .74 0C13.467 15.275 17 10.727 17 7c0-2.761-2.239-5-5-5z" fill="currentColor"></path><path d="M12 5.2l.985 1.996 2.203.32-1.594 1.554.376 2.194L12 9.8l-1.97 1.464.376-2.194-1.594-1.554 2.203-.32z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2"></path></svg>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.overlay.isOpen) {
        this.overlay.close();
      } else {
        this.overlay.open();
      }
    });
    this.button = button;
    this.log('button-created');
    return button;
  }

  ensureVodsButton() {
    if (this.vodsButton) {
      return this.vodsButton;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.tfrVodsButton = 'true';
    button.dataset.aTarget = 'top-nav-vods-button';
    button.className = 'tfr-topnav-action tfr-topnav-action--icon';
    button.style.pointerEvents = 'auto';
    button.style.display = 'inline-flex';
    button.style.flex = '0 0 auto';
    button.style.position = 'relative';
    button.style.zIndex = '1';
    button.tabIndex = 0;
    button.setAttribute('aria-label', 'Ouvrir le planning VODs');
    button.title = 'Planning VODs';
    button.innerHTML = '<svg class="tfr-topnav-action__icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 2h2v3h6V2h2v3h3a1 1 0 0 1 1 1v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h3V2zm12 8H5v10h14V10z" fill="currentColor"></path><path d="M10 13.2v4.1l3.7-2.05L10 13.2z" fill="#fff"></path></svg>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      sendExtensionMessage({ type: 'TFR_OPEN_VODS_PAGE' }).then((response) => {
        if (response?.ok) {
          return;
        }
        const url = extensionApi?.runtime?.getURL?.('panel/vods.html');
        if (url) {
          window.open(url, '_blank', 'noopener');
        }
      });
    });
    this.vodsButton = button;
    this.log('vods-button-created');
    return button;
  }

  populateSlot(slot) {
    const favoritesButton = this.ensureButton();
    const vodsButton = this.ensureVodsButton();
    [favoritesButton, vodsButton].forEach((button) => {
      if (button && !slot.contains(button)) {
        slot.appendChild(button);
      }
    });
  }

  syncWithAnchor(anchor, parent) {
    const button = this.ensureButton();
    const vodsButton = this.ensureVodsButton();
    if (!button) {
      return null;
    }
    const slot = this.ensureSlot(anchor);
    if (!slot.contains(button) || !slot.contains(vodsButton)) {
      slot.innerHTML = '';
      this.populateSlot(slot);
    }
    let source = anchor;
    if (!source && parent) {
      source = Array.from(parent.querySelectorAll('button, a')).find((node) => node !== button);
    }
    const isActive = button.classList.contains('is-active');
    button.classList.add('tfr-topnav-action', 'tfr-topnav-action--icon');
    slot.classList.add('tfr-topnav-slot');
    if (isActive) {
      button.classList.add('is-active');
    } else {
      button.classList.remove('is-active');
    }
    if (!source) {
      slot.style.margin = '0 6px';
      slot.style.width = '';
      slot.style.height = '';
      button.style.width = '32px';
      button.style.height = '32px';
      button.style.margin = '0';
      if (vodsButton) {
        vodsButton.style.width = '32px';
        vodsButton.style.height = '32px';
        vodsButton.style.margin = '0';
      }
      this.log('sync-anchor-missing');
      return slot;
    }
    const style = source ? window.getComputedStyle(source) : null;
    const parseMargin = (value, fallback) => {
      if (!value || value === 'auto') return fallback;
      const numeric = parseFloat(value);
      if (!Number.isFinite(numeric) || Math.abs(numeric) < 1) return fallback;
      return value;
    };
    const marginTop = style?.marginTop || '0';
    const marginBottom = style?.marginBottom || '0';
    const marginLeft = parseMargin(style?.marginLeft, '6px');
    const marginRight = parseMargin(style?.marginRight, '6px');
    slot.style.margin = `${marginTop} ${marginRight} ${marginBottom} ${marginLeft}`;
    let width = '';
    if (style?.width && style.width !== 'auto') {
      width = style.width;
    } else if (source?.offsetWidth) {
      width = `${source.offsetWidth}px`;
    }
    slot.style.width = '';
    button.style.width = width || '32px';
    if (vodsButton) {
      vodsButton.style.width = width || '32px';
    }
    let height = '';
    if (style?.height && style.height !== 'auto') {
      height = style.height;
    } else if (source?.offsetHeight) {
      height = `${source.offsetHeight}px`;
    }
    if (height) {
      slot.style.height = height;
      button.style.height = height;
      if (vodsButton) {
        vodsButton.style.height = height;
      }
    } else {
      slot.style.height = '';
      button.style.height = '32px';
      if (vodsButton) {
        vodsButton.style.height = '32px';
      }
    }
    button.style.margin = '0';
    if (vodsButton) {
      vodsButton.style.margin = '0';
    }
    this.log('sync-anchor', { sourceTag: source?.tagName });
    return slot;
  }

  setButtonActive(isActive) {
    const button = this.ensureButton();
    if (!button) {
      return;
    }
    button.classList.add('tfr-topnav-action', 'tfr-topnav-action--icon');
    button.classList.toggle('is-active', Boolean(isActive));
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }

  injectButton() {
    let mountInfo = null;
    try {
      mountInfo = this.findMountPoint();
    } catch (error) {
      this.log('find-mount-error', error);
      return;
    }
    const button = this.ensureButton();
    const vodsButton = this.ensureVodsButton();
    if (!button) {
      this.log('button-missing');
      return;
    }
    if (!mountInfo) {
      this.log('mount-missing');
      this.scheduleRetry();
      return;
    }
    const { parent, reference, anchor } = mountInfo;
    if (!parent) {
      this.log('mount-no-parent');
      this.scheduleRetry();
      return;
    }
    try {
      const slot = this.syncWithAnchor(anchor, parent);
      if (!slot) {
        this.log('slot-missing');
        this.scheduleRetry();
        return;
      }
      if (!slot.contains(button) || !slot.contains(vodsButton)) {
        slot.innerHTML = '';
        this.populateSlot(slot);
      }
      let insertionParent = parent;
      let insertionReference = reference;
      const anchorParent = anchor?.parentElement || null;
      const anchorGrand = anchorParent?.parentElement || null;
      if (anchorParent && this.isUsableParent(anchorParent) && anchorParent !== parent) {
        insertionParent = anchorParent;
        insertionReference = anchor || null;
      }
      if (anchorGrand && this.isUsableParent(anchorGrand) && anchorGrand !== parent && anchorGrand !== insertionParent) {
        insertionParent = anchorGrand;
        insertionReference = anchorParent || anchor || null;
      }
      if (anchor && anchor.parentElement === insertionParent) {
        insertionReference = anchor;
      } else if (anchorParent && anchorParent.parentElement === insertionParent) {
        insertionReference = anchorParent;
      }
      if (!insertionReference) {
        // Force the slot before existing actions so the button renders on the left.
        insertionReference = Array.from(insertionParent.children).find((child) => child !== slot) || null;
      }
      if (insertionReference === slot) {
        insertionReference = slot.nextElementSibling;
      }
      if (slot.parentElement !== insertionParent) {
        if (insertionReference) {
          insertionParent.insertBefore(slot, insertionReference);
          this.log('slot-insert-before', { parentTag: insertionParent.tagName });
        } else {
          insertionParent.appendChild(slot);
          this.log('slot-append', { parentTag: insertionParent.tagName });
        }
      } else if (insertionReference && slot.nextElementSibling !== insertionReference) {
        insertionParent.insertBefore(slot, insertionReference);
        this.log('slot-reposition', { parentTag: insertionParent.tagName });
      } else {
        this.log('slot-already-mounted');
      }
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
    } catch (error) {
      this.log('inject-error', error);
      this.scheduleRetry();
    }
  }

}




    return TopNavManager;
  };

  window.TFRTopNav = {
    create: createTopNavManager
  };
})();
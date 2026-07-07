(() => {
  const createChannelFavoriteButton = ({
    t,
    LocationWatcher,
    getChannelFromLocation
  }) => {
  const FAVORITE_ICON =
    '<svg class="tfr-inline-button__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.46 13.97 5.82 21z"></path></svg>';

  class ChannelFavoriteButton {
    constructor(store) {
      this.store = store;
      this.button = null;
      this.currentLogin = null;
      this.unsubscribe = null;
      this.domObserver = null;
      this.refreshTimer = null;
      this.mountFrame = null;
      this.locationWatcher = new LocationWatcher(() => this.handleLocationChange());
    }

    init() {
      this.unsubscribe = this.store.subscribe(() => this.updateButtonAppearance());
      this.observeDom();
      this.locationWatcher.start();
      this.handleLocationChange();
    }

    dispose() {
      this.unsubscribe?.();
      this.domObserver?.disconnect();
      if (this.mountFrame) {
        cancelAnimationFrame(this.mountFrame);
        this.mountFrame = null;
      }
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
      this.locationWatcher.stop();
    }

    observeDom() {
      this.domObserver?.disconnect();
      this.domObserver = new MutationObserver(() => {
        this.scheduleMountButton();
      });
      this.domObserver.observe(document.body, { childList: true, subtree: true });
      this.tryMountButton();
    }

    scheduleMountButton() {
      if (this.mountFrame) {
        return;
      }
      this.mountFrame = requestAnimationFrame(() => {
        this.mountFrame = null;
        this.tryMountButton();
      });
    }

    handleLocationChange() {
      this.currentLogin = getChannelFromLocation(window.location);
      this.updateButtonAppearance();
      this.tryMountButton();
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      const login = this.currentLogin?.toLowerCase();
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        if (login && this.store.getState().favorites[login]) {
          this.store.applyCurrentPageLiveData(login);
          this.store.refreshLiveData();
        }
      }, 1500);
    }

    isUsableAnchor(node) {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      if (node === this.button || node.closest('.tfr-inline-button')) {
        return false;
      }
      if (node.closest('nav, [role="navigation"], [role="tablist"], [data-a-target="channel-home-tab"]')) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    getButtonText(button) {
      return [
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
        button.textContent
      ]
        .filter(Boolean)
        .join(' ')
        .trim()
        .toLowerCase();
    }

    findChannelActionButton() {
      const actionPatterns = [
        /(^|\s)(suivre|follow)(\s|$)/i,
        /s['’]?abonner|subscribe/i,
        /abonnements?-cadeaux|gift/i,
        /\bbits?\b/i
      ];
      const buttons = Array.from(document.querySelectorAll('main button, [data-a-target="channel-header-right"] button'));
      const candidates = buttons
        .filter((button) => this.isUsableAnchor(button))
        .map((button) => ({
          button,
          text: this.getButtonText(button),
          rect: button.getBoundingClientRect()
        }))
        .filter(({ text }) => actionPatterns.some((pattern) => pattern.test(text)));

      if (!candidates.length) {
        return null;
      }

      const followCandidate = candidates.find(({ text }) => /(^|\s)(suivre|follow)(\s|$)/i.test(text));
      if (followCandidate) {
        return followCandidate.button;
      }

      return candidates
        .sort((a, b) => (a.rect.top - b.rect.top) || (b.rect.left - a.rect.left))[0]
        .button;
    }

    isPrimaryFollowButton(node) {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      return /(^|\s)(suivre|follow)(\s|$)/i.test(this.getButtonText(node));
    }

    getMountPoint(anchor) {
      if (!anchor?.parentElement) {
        return null;
      }
      const group = anchor.parentElement;
      const shouldEscapeButtonGroup = this.isPrimaryFollowButton(anchor)
        && group instanceof HTMLElement
        && group.children.length <= 3
        && group.parentElement instanceof HTMLElement;

      if (shouldEscapeButtonGroup) {
        return {
          parent: group.parentElement,
          before: group.nextSibling
        };
      }

      return {
        parent: group,
        before: null
      };
    }

    findAnchor() {
      const channelAction = this.findChannelActionButton();
      if (channelAction) {
        return channelAction;
      }

      const selectors = [
        '[data-a-target="player-overlay-notifications-toggle-button"]',
        '[data-a-target="player-notifications-toggle-button"]',
        '[data-a-target="notifications-toggle-button"]',
        '[data-a-target="stream-notifications-toggle-button"]',
        '[data-a-target="player-control-notifications-button"]',
        '[data-test-selector="player-notifications-button"]',
        '[data-test-selector="player-overlay-notifications-button"]',
        '[data-test-selector="notifications-button"]'
      ];
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (this.isUsableAnchor(node)) {
          return node;
        }
      }
      const buttons = Array.from(document.querySelectorAll('button[aria-label]'));
      const primary = buttons.find((btn) => {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        return label.includes('notification') && this.isUsableAnchor(btn);
      });
      if (primary) {
        return primary;
      }
      const containerSelectors = [
        '[data-a-target="channel-header-right"]',
        '[data-a-target="channel-header-user-actions"]',
        '[data-a-target="channel-root__right-column"]',
        '[data-a-target="follow-button"]',
        '[data-test-selector="follow-button"]',
        '[data-test-selector="player-overlay-channel-status"]',
        '[data-test-selector="channel-info-bar"]',
        '[data-test-selector="player-overlay-follow-button"]',
        '[data-test-selector="player-actions"]'
      ];
      for (const selector of containerSelectors) {
        const container = document.querySelector(selector);
        if (!container) continue;
        if (container instanceof HTMLButtonElement && this.isUsableAnchor(container)) {
          return container;
        }
        const candidate = container.querySelector('button');
        if (this.isUsableAnchor(candidate)) {
          return candidate;
        }
      }
      return null;
    }

    ensureButton() {
      if (this.button) return this.button;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tfr-inline-button';
      button.setAttribute('aria-label', 'Ajouter ou retirer ce streamer des favoris Twitch');
      button.title = 'Ajouter ou retirer ce streamer des favoris Twitch';
      button.style.setProperty('margin-left', '8px', 'important');
      button.style.marginTop = '0';
      button.style.alignSelf = 'center';
      button.style.pointerEvents = 'auto';
      button.textContent = '';
      button.innerHTML = FAVORITE_ICON;
      const stopHoverPropagation = (event) => {
        event.stopPropagation();
      };
      ['pointerenter', 'pointerover', 'mouseenter', 'mouseover', 'mouseleave', 'pointerleave'].forEach((eventName) => {
        button.addEventListener(eventName, stopHoverPropagation, true);
      });
      button.addEventListener('click', async () => {
        if (!this.currentLogin) return;
        const normalized = this.currentLogin.toLowerCase();
        const isFavorite = Boolean(this.store.getState().favorites[normalized]);
        button.disabled = true;
        try {
          if (isFavorite) await this.store.removeFavorite(normalized);
          else await this.store.addFavorite(normalized);
        } finally {
          button.disabled = false;
          this.updateButtonAppearance();
        }
      });
      this.button = button;
      return button;
    }

    tryMountButton() {
      if (!this.currentLogin) {
        this.removeButton();
        return;
      }
      const anchor = this.findAnchor();
      const mountPoint = this.getMountPoint(anchor);
      if (!anchor || !mountPoint?.parent) {
        this.removeButton();
        return;
      }
      const button = this.ensureButton();
      if (button.parentElement === mountPoint.parent) return;
      mountPoint.parent.insertBefore(button, mountPoint.before || null);
      this.updateButtonAppearance();
    }

    removeButton() {
      if (this.button?.parentElement) {
        this.button.parentElement.removeChild(this.button);
      }
    }

    updateButtonAppearance() {
      const button = this.button;
      if (!button) return;
      if (!this.currentLogin) {
        button.disabled = true;
        button.classList.remove('is-remove');
        button.textContent = t('sidebar.live.unavailable');
        return;
      }
      const normalized = this.currentLogin.toLowerCase();
      const isFavorite = Boolean(this.store.getState().favorites[normalized]);
      button.disabled = false;
      button.classList.toggle('is-remove', isFavorite);
      button.innerHTML = FAVORITE_ICON;
    }
  }



    return ChannelFavoriteButton;
  };

  window.TFRChannelFavoriteButton = {
    create: createChannelFavoriteButton
  };
})();

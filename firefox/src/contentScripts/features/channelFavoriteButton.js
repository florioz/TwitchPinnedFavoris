(() => {
  const createChannelFavoriteButton = ({
    t,
    LocationWatcher,
    getChannelFromLocation
  }) => {
  class ChannelFavoriteButton {
    constructor(store) {
      this.store = store;
      this.button = null;
      this.currentLogin = null;
      this.unsubscribe = null;
      this.domObserver = null;
      this.refreshTimer = null;
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
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
      this.locationWatcher.stop();
    }

    observeDom() {
      this.domObserver?.disconnect();
      this.domObserver = new MutationObserver(() => {
        this.tryMountButton();
      });
      this.domObserver.observe(document.body, { childList: true, subtree: true });
      this.tryMountButton();
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

    findAnchor() {
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
        if (node && !node.closest('nav')) {
          return node;
        }
      }
      const buttons = Array.from(document.querySelectorAll('button[aria-label]'));
      const primary = buttons.find((btn) => {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        return label.includes('notification') && !btn.closest('nav');
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
        const candidate = container.querySelector('button');
        if (candidate && !candidate.closest('nav')) {
          return candidate;
        }
      }
      const channelHeading = document.querySelector('main h1, h1');
      const headingActions = channelHeading?.closest('[class*="channel"]')?.querySelector('button');
      if (headingActions && !headingActions.closest('nav')) {
        return headingActions;
      }
      if (channelHeading?.parentElement && !channelHeading.closest('nav')) {
        return channelHeading;
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
      button.style.marginLeft = '8px';
      button.style.marginTop = '0';
      button.style.alignSelf = 'center';
      button.style.pointerEvents = 'auto';
      button.textContent = '';
      button.innerHTML = '<svg class="tfr-inline-button__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.46 13.97 5.82 21z"></path></svg>';
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
      if (!anchor || !anchor.parentElement) {
        this.removeButton();
        return;
      }
      const button = this.ensureButton();
      if (anchor.parentElement.contains(button)) return;
      anchor.parentElement.appendChild(button);
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
        if (isFavorite) {
          button.classList.add('is-remove');
          button.innerHTML = '<svg class="tfr-inline-button__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.46 13.97 5.82 21z"></path></svg>';
        } else {
          button.classList.remove('is-remove');
          button.innerHTML = '<svg class="tfr-inline-button__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.46 13.97 5.82 21z"></path></svg>';
        }
    }
  }



    return ChannelFavoriteButton;
  };

  window.TFRChannelFavoriteButton = {
    create: createChannelFavoriteButton
  };
})();

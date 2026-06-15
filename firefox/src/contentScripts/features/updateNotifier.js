(() => {
  const createUpdateNotifier = ({
    UPDATE_STORAGE_KEY,
    UPDATE_REPO_API_URL,
    UPDATE_REPO_URL,
    UPDATE_CHECK_INTERVAL_MS
  }) => {
  class UpdateNotifier {
    constructor() {
      this.storageKey = UPDATE_STORAGE_KEY;
      this.apiUrl = UPDATE_REPO_API_URL;
      this.repoUrl = UPDATE_REPO_URL;
      this.checkInterval = UPDATE_CHECK_INTERVAL_MS;
      this.currentVersion = chrome.runtime?.getManifest?.().version || '0.0.0';
      this.banner = null;
    }

    async init() {
      if (!chrome?.storage?.local || typeof fetch !== 'function') {
        return;
      }
      try {
        await this.checkForUpdates();
      } catch (error) {
        console.warn('[TFR] update notifier init failed', error);
      }
    }

    async getState() {
      try {
        const stored = await chrome.storage.local.get(this.storageKey);
        const value = stored?.[this.storageKey];
        return value && typeof value === 'object' ? value : {};
      } catch (error) {
        console.warn('[TFR] update state read failed', error);
        return {};
      }
    }

    async setState(partial) {
      const state = await this.getState();
      const next = { ...state, ...partial };
      await chrome.storage.local.set({ [this.storageKey]: next });
      return next;
    }

    normalizeVersion(version) {
      return String(version || '')
        .trim()
        .replace(/^v/i, '');
    }

    parseVersion(version) {
      const cleaned = this.normalizeVersion(version);
      if (!cleaned) return [0];
      return cleaned.split('.').map((part) => {
        const match = String(part).match(/\d+/);
        return match ? Number(match[0]) : 0;
      });
    }

    isVersionNewer(remote, local) {
      const rParts = this.parseVersion(remote);
      const lParts = this.parseVersion(local);
      const length = Math.max(rParts.length, lParts.length);
      for (let i = 0; i < length; i += 1) {
        const r = rParts[i] ?? 0;
        const l = lParts[i] ?? 0;
        if (r > l) return true;
        if (r < l) return false;
      }
      return false;
    }

    canShowVersion(version, state, now = Date.now()) {
      if (!this.isVersionNewer(version, this.currentVersion)) {
        return false;
      }
      if (state.dismissedVersion === version) {
        return false;
      }
      if (state.snoozeUntil && now < state.snoozeUntil) {
        return false;
      }
      return true;
    }

    async checkForUpdates() {
      const now = Date.now();
      const state = await this.getState();
      if (state.latestVersion && this.canShowVersion(state.latestVersion, state, now)) {
        this.showBanner(state.latestVersion, state.releaseUrl, state.releaseNotes);
      }
      if (state.lastCheck && now - state.lastCheck < this.checkInterval) {
        return;
      }
      try {
        const response = await fetch(this.apiUrl, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-cache'
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const remoteVersion = this.normalizeVersion(payload?.tag_name || payload?.name);
        if (!remoteVersion) {
          await this.setState({ lastCheck: now });
          return;
        }
        const releaseUrl = payload?.html_url || this.repoUrl;
        const releaseNotes = (payload?.body || '').trim();
        const previousVersion = state.latestVersion;
        const nextState = {
          ...state,
          lastCheck: now,
          latestVersion: remoteVersion,
          releaseUrl,
          releaseNotes
        };
        if (previousVersion !== remoteVersion) {
          nextState.dismissedVersion = null;
          nextState.snoozeUntil = null;
        }
        await chrome.storage.local.set({ [this.storageKey]: nextState });
        if (this.canShowVersion(remoteVersion, nextState, now)) {
          this.showBanner(remoteVersion, releaseUrl, releaseNotes);
        } else if (this.banner) {
          this.removeBanner();
        }
      } catch (error) {
        console.warn('[TFR] update check failed', error);
      }
    }

    removeBanner() {
      if (this.banner?.parentElement) {
        this.banner.parentElement.removeChild(this.banner);
      }
      this.banner = null;
    }

    async dismissVersion(version) {
      await this.setState({ dismissedVersion: version, snoozeUntil: null });
      this.removeBanner();
    }

    async snooze(hours = 6) {
      const until = Date.now() + hours * 60 * 60 * 1000;
      await this.setState({ snoozeUntil: until });
      this.removeBanner();
    }

    showBanner(version, url, notes) {
      if (this.banner || !document?.body) {
        return;
      }
      const banner = document.createElement('aside');
      banner.className = 'tfr-update-banner';

      const header = document.createElement('div');
      header.className = 'tfr-update-banner__header';

      const title = document.createElement('p');
      title.className = 'tfr-update-banner__title';
      title.textContent = 'Nouvelle mise a jour disponible';
      header.appendChild(title);

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'tfr-update-banner__close';
      closeButton.setAttribute('aria-label', 'Fermer la notification de mise a jour');
      closeButton.textContent = 'X';
      closeButton.addEventListener('click', () => this.snooze());
      header.appendChild(closeButton);

      const body = document.createElement('p');
      body.className = 'tfr-update-banner__body';
      const summaryLine = (notes || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length);
      const description = summaryLine ? `Notes : ${summaryLine}` : 'Consultez GitHub pour telecharger la derniere version.';
      body.textContent = `Version ${version} est disponible. ${description}`;

      const actions = document.createElement('div');
      actions.className = 'tfr-update-banner__actions';

      const primary = document.createElement('button');
      primary.type = 'button';
      primary.className = 'tfr-update-banner__button tfr-update-banner__button--primary';
      primary.textContent = 'Ouvrir GitHub';
      primary.addEventListener('click', () => {
        try {
          window.open(url || this.repoUrl, '_blank', 'noopener');
        } catch {
          window.location.href = url || this.repoUrl;
        } finally {
          this.dismissVersion(version);
        }
      });

      const later = document.createElement('button');
      later.type = 'button';
      later.className = 'tfr-update-banner__button tfr-update-banner__button--ghost';
      later.textContent = 'Plus tard';
      later.addEventListener('click', () => this.snooze());

      actions.appendChild(primary);
      actions.appendChild(later);

      banner.appendChild(header);
      banner.appendChild(body);
      banner.appendChild(actions);

      document.body.appendChild(banner);
      this.banner = banner;
    }
  }


    return UpdateNotifier;
  };

  window.TFRUpdateNotifier = {
    create: createUpdateNotifier
  };
})();
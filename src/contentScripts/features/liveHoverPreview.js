(() => {
  const PREVIEW_DELAY_MS = 500;
  const CLOSE_DELAY_MS = 250;
  const PREVIEW_MODES = new Set(['image', 'video']);

  class LiveHoverPreview {
    constructor({ formatViewers, t }) {
      this.formatViewers = formatViewers;
      this.t = t;
      this.enabled = false;
      this.mode = 'image';
      this.container = null;
      this.preview = null;
      this.openTimer = null;
      this.closeTimer = null;
      this.activeEntry = null;
      this.boundPointerOver = (event) => this.handlePointerOver(event);
      this.boundPointerOut = (event) => this.handlePointerOut(event);
      this.boundScroll = () => this.close();
      this.boundPreviewEnter = () => {
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
      };
      this.boundPreviewLeave = () => {
        clearTimeout(this.closeTimer);
        this.closeTimer = window.setTimeout(() => this.close(), 120);
      };
    }

    attach(container) {
      if (this.container === container) return;
      this.detach();
      this.container = container;
      container?.addEventListener('pointerover', this.boundPointerOver);
      container?.addEventListener('pointerout', this.boundPointerOut);
      container?.addEventListener('scroll', this.boundScroll, { passive: true });
      this.updateNativeTooltips();
    }

    configure(enabled, mode = 'image') {
      const next = Boolean(enabled);
      const nextMode = PREVIEW_MODES.has(mode) ? mode : 'image';
      if (this.enabled === next && this.mode === nextMode) return;
      const modeChanged = this.mode !== nextMode;
      this.enabled = next;
      this.mode = nextMode;
      if (!next || modeChanged) this.close();
      this.updateNativeTooltips();
    }

    updateNativeTooltips() {
      this.container?.querySelectorAll('.tfr-favorite-entry').forEach((entry) => {
        if (this.enabled && entry.dataset.livePreview === 'true') entry.removeAttribute('title');
        else if (entry.dataset.tooltip) entry.title = entry.dataset.tooltip;
      });
    }

    handlePointerOver(event) {
      if (!this.enabled || !(event.target instanceof Element)) return;
      const entry = event.target.closest('.tfr-favorite-entry[data-live-preview="true"]');
      if (!entry || !this.container?.contains(entry)) return;
      if (entry.contains(event.relatedTarget)) return;
      clearTimeout(this.closeTimer);
      clearTimeout(this.openTimer);
      this.openTimer = window.setTimeout(() => this.open(entry), PREVIEW_DELAY_MS);
    }

    handlePointerOut(event) {
      if (!(event.target instanceof Element)) return;
      const entry = event.target.closest('.tfr-favorite-entry[data-live-preview="true"]');
      if (!entry || entry.contains(event.relatedTarget)) return;
      clearTimeout(this.openTimer);
      this.openTimer = null;
      this.closeTimer = window.setTimeout(() => this.close(), CLOSE_DELAY_MS);
    }

    createMedia(login, displayName) {
      const normalizedLogin = encodeURIComponent(login.toLowerCase());
      const imageAlt = this.t('settings.livePreview.imageAlt', { name: displayName });
      if (this.mode === 'video') {
        const media = document.createElement('iframe');
        media.className = 'tfr-live-hover-preview__media tfr-live-hover-preview__video';
        media.title = imageAlt;
        media.allow = 'autoplay; fullscreen';
        media.setAttribute('scrolling', 'no');
        const parent = encodeURIComponent(window.location.hostname);
        media.src = `https://player.twitch.tv/?channel=${normalizedLogin}&parent=${parent}&muted=true&autoplay=true&controls=false&layout=video`;
        return media;
      }

      const media = document.createElement('img');
      media.className = 'tfr-live-hover-preview__media tfr-live-hover-preview__image';
      media.alt = imageAlt;
      media.src = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${normalizedLogin}-320x180.jpg?time=${Math.floor(Date.now() / 60000)}`;
      return media;
    }

    open(entry) {
      if (!this.enabled || !entry?.isConnected) return;
      this.close(false);
      this.activeEntry = entry;
      const login = entry.dataset.login || '';
      const displayName = entry.dataset.previewName || login;
      const game = entry.dataset.previewGame || '';
      const title = entry.dataset.previewTitle || '';
      const viewers = Number(entry.dataset.previewViewers || 0);

      const preview = document.createElement('aside');
      preview.id = 'tfr-live-hover-preview';
      preview.className = 'tfr-live-hover-preview';
      preview.classList.toggle('is-video', this.mode === 'video');
      preview.setAttribute('role', 'tooltip');
      if (this.mode === 'video') {
        preview.addEventListener('pointerenter', this.boundPreviewEnter);
        preview.addEventListener('pointerleave', this.boundPreviewLeave);
      }

      const media = this.createMedia(login, displayName);

      const body = document.createElement('div');
      body.className = 'tfr-live-hover-preview__body';
      const heading = document.createElement('strong');
      heading.textContent = displayName;
      const meta = document.createElement('span');
      meta.textContent = [game, viewers ? this.t('sidebar.viewerCount', { count: this.formatViewers(viewers) }) : '']
        .filter(Boolean)
        .join(' · ');
      body.append(heading, meta);
      if (title) {
        const streamTitle = document.createElement('small');
        streamTitle.textContent = title;
        body.appendChild(streamTitle);
      }
      preview.append(media, body);
      document.body.appendChild(preview);
      entry.setAttribute('aria-describedby', preview.id);
      this.preview = preview;
      this.position(entry);
    }

    position(entry) {
      if (!this.preview) return;
      const anchor = entry.getBoundingClientRect();
      const preview = this.preview.getBoundingClientRect();
      const gap = 10;
      let left = anchor.right + gap;
      if (left + preview.width > window.innerWidth - gap) left = anchor.left - preview.width - gap;
      const top = Math.max(gap, Math.min(anchor.top, window.innerHeight - preview.height - gap));
      this.preview.style.left = `${Math.max(gap, left)}px`;
      this.preview.style.top = `${top}px`;
    }

    close(clearActive = true) {
      clearTimeout(this.openTimer);
      clearTimeout(this.closeTimer);
      this.openTimer = null;
      this.closeTimer = null;
      this.preview?.remove();
      this.preview = null;
      this.activeEntry?.removeAttribute('aria-describedby');
      if (clearActive) this.activeEntry = null;
    }

    detach() {
      this.container?.removeEventListener('pointerover', this.boundPointerOver);
      this.container?.removeEventListener('pointerout', this.boundPointerOut);
      this.container?.removeEventListener('scroll', this.boundScroll);
      this.container = null;
      this.close();
    }

    dispose() {
      this.detach();
    }
  }

  window.TFRLiveHoverPreview = {
    create: (dependencies) => new LiveHoverPreview(dependencies)
  };
})();

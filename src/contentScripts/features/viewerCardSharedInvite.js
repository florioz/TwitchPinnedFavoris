(() => {
  const CARD_SELECTORS = [
    '[data-a-target="viewer-card"]',
    '[data-test-selector="viewer-card"]',
    '.viewer-card',
    'aside.viewer-card'
  ];
  const BODY_SELECTORS = [
    '[data-test-selector="viewer-card-modal-body"]',
    '[data-test-selector="viewer-card-body"]',
    '[data-a-target="viewer-card-body"]',
    '.viewer-card__body',
    '.viewer-card-body'
  ];
  const LOGIN_SELECTORS = [
    '[data-a-target="viewer-card-user-name"]',
    '[data-test-selector="viewer-card-user-name"]',
    '[data-a-target="viewer-card-channel-link"]',
    'a[data-test-selector="viewer-card-channel-link"]'
  ];
  const ACTION_HOST_SELECTORS = [
    '[data-a-target="viewer-card-actions"]',
    '[data-test-selector="viewer-card-actions"]',
    '.viewer-card__actions',
    '.viewer-card-actions'
  ];
  const ACTION_BUTTON_SELECTORS = [
    'button[data-a-target="follow-button"]',
    'button[data-test-selector="follow-button"]',
    'button[data-a-target="viewer-card-whisper-button"]',
    'button[data-test-selector="viewer-card-whisper-button"]'
  ];

  const create = ({ t }) => class ViewerCardSharedInvite {
    constructor() {
      this.observer = null;
      this.frame = null;
      this.cache = { expiresAt: 0, status: null, spaces: [] };
    }

    init() {
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(document.body, { childList: true, subtree: true });
      this.schedule();
    }

    dispose() {
      this.observer?.disconnect();
      this.observer = null;
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = null;
      document.querySelectorAll('.tfr-viewer-card-invite').forEach((node) => node.remove());
    }

    schedule() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.sync();
      });
    }

    findCards() {
      const cards = new Set();
      CARD_SELECTORS.forEach((selector) => {
        try { document.querySelectorAll(selector).forEach((card) => cards.add(card)); } catch {}
      });
      return Array.from(cards);
    }

    extractLogin(card) {
      const dataset = card?.dataset || {};
      const direct = dataset.username || dataset.user || dataset.login || dataset.userLogin;
      if (direct) return String(direct).trim().replace(/^@/, '').toLowerCase();
      for (const selector of LOGIN_SELECTORS) {
        const node = card.querySelector(selector);
        const text = node?.textContent?.trim().replace(/^@/, '');
        if (text) return text.toLowerCase();
      }
      const href = card.querySelector('a[href^="/"]')?.getAttribute('href') || '';
      return (href.match(/^\/([^/?#]+)/)?.[1] || '').toLowerCase();
    }

    findHost(card) {
      for (const selector of BODY_SELECTORS) {
        const host = card.querySelector(selector);
        if (host) return host;
      }
      return card;
    }

    findActionsHost(card) {
      for (const selector of ACTION_HOST_SELECTORS) {
        const host = card.querySelector(selector);
        if (host) return host;
      }
      let actionButton = null;
      for (const selector of ACTION_BUTTON_SELECTORS) {
        actionButton = card.querySelector(selector);
        if (actionButton) break;
      }
      let candidate = actionButton?.parentElement || null;
      for (let depth = 0; candidate && candidate !== card && depth < 5; depth += 1) {
        const buttons = candidate.querySelectorAll?.('button')?.length || 0;
        if (buttons >= 2 && buttons <= 8) return candidate;
        candidate = candidate.parentElement;
      }
      return null;
    }

    sync() {
      this.findCards().forEach((card) => {
        if (card.querySelector(':scope .tfr-viewer-card-invite')) return;
        const login = this.extractLogin(card);
        if (!login) return;
        const actionsHost = this.findActionsHost(card);
        const host = actionsHost || this.findHost(card);
        if (!card.contains(host)) return;
        const container = document.createElement('div');
        container.className = 'tfr-viewer-card-invite';
        container.classList.toggle('is-actions', Boolean(actionsHost));
        container.dataset.login = login;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tfr-viewer-card-invite__button';
        button.textContent = actionsHost
          ? t('sharedSpaces.cardInvite.shortButton')
          : t('sharedSpaces.cardInvite.button');
        button.title = t('sharedSpaces.cardInvite.button');
        button.addEventListener('click', () => this.toggleMenu(container, login));
        container.appendChild(button);
        host.appendChild(container);
      });
    }

    async loadRemoteContext(force = false) {
      if (!force && this.cache.expiresAt > Date.now()) return this.cache;
      const client = window.TFRSharedSpacesClient;
      const status = await client?.status?.();
      let spaces = [];
      if (status?.ok && status.data?.connected) {
        const response = await client.listSpaces();
        if (response?.ok) spaces = Array.isArray(response.data) ? response.data : [];
      }
      this.cache = { status: status?.data || null, spaces, expiresAt: Date.now() + 30_000 };
      return this.cache;
    }

    async toggleMenu(container, login) {
      const existing = container.querySelector('.tfr-viewer-card-invite__menu');
      if (existing) { existing.remove(); return; }
      const menu = document.createElement('div');
      menu.className = 'tfr-viewer-card-invite__menu';
      menu.textContent = t('sharedSpaces.cardInvite.loading');
      container.appendChild(menu);
      const context = await this.loadRemoteContext();
      if (!menu.isConnected) return;
      menu.innerHTML = '';
      if (!context.status?.connected) {
        menu.textContent = t('sharedSpaces.cardInvite.connect');
        return;
      }
      const spaces = context.spaces.filter((space) => space.role === 'owner');
      if (!spaces.length) {
        menu.textContent = t('sharedSpaces.cardInvite.noSpace');
        return;
      }
      const select = document.createElement('select');
      spaces.forEach((space) => {
        const option = document.createElement('option'); option.value = space.id; option.textContent = space.name;
        select.appendChild(option);
      });
      const role = document.createElement('select');
      ['editor', 'viewer'].forEach((value) => {
        const option = document.createElement('option'); option.value = value; option.textContent = t(`sharedSpaces.role.${value}`);
        role.appendChild(option);
      });
      const confirm = document.createElement('button');
      confirm.type = 'button'; confirm.className = 'tfr-viewer-card-invite__confirm';
      confirm.textContent = t('sharedSpaces.cardInvite.confirm');
      const feedback = document.createElement('small');
      confirm.addEventListener('click', async () => {
        confirm.disabled = true;
        const result = await window.TFRSharedSpacesClient.inviteByLogin(select.value, login, role.value);
        feedback.textContent = result?.ok
          ? t('sharedSpaces.cardInvite.success', { login })
          : (result?.message || t('sharedSpaces.cardInvite.error'));
        confirm.disabled = false;
      });
      menu.append(select, role, confirm, feedback);
    }
  };

  window.TFRViewerCardSharedInvite = Object.freeze({ create });
})();

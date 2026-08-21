(() => {
  'use strict';

  const CHAT_INPUT_SELECTOR = [
    '.chat-wysiwyg-input__editor[contenteditable="true"]',
    '[contenteditable="true"][data-a-target="chat-input"]',
    '[data-a-target="chat-input"] [contenteditable="true"]',
    'textarea[data-a-target*="chat"]'
  ].join(', ');
  const NATIVE_EMOTE_BUTTON_SELECTORS = [
    'button[data-a-target="emote-picker-button"]',
    'button[data-a-target="chat-emote-picker-button"]',
    'button[data-test-selector="emote-picker-button"]'
  ];
  const RENDER_BATCH_SIZE = 120;
  const DRAG_MARGIN = 6;
  const PROVIDER_FILTERS = Object.freeze([
    ['all', 'settings.emotePicker.all'],
    ['7TV', '7TV'],
    ['BetterTTV', 'BTTV']
  ]);

  const model = window.TFRChatEmotePickerModel;
  if (!model) throw new Error('Chat emote picker model is missing');
  const { normalizeCatalog, filterCatalog, clampPanelPosition, getAnchoredPanelPosition } = model;

  class ChatEmotePicker {
    constructor({ documentRef = document, windowRef = window, t = (key) => key } = {}) {
      this.document = documentRef;
      this.window = windowRef;
      this.t = t;
      this.enabled = false;
      this.catalog = [];
      this.provider = 'all';
      this.button = null;
      this.slot = null;
      this.panel = null;
      this.grid = null;
      this.search = null;
      this.empty = null;
      this.mountTimer = null;
      this.savedInputState = null;
      this.filteredResults = [];
      this.renderedCount = 0;
      this.manualPosition = false;
      this.dragState = null;
      this.handleDocumentPointer = this.handleDocumentPointer.bind(this);
      this.handleViewportChange = this.handleViewportChange.bind(this);
      this.handleGridScroll = this.handleGridScroll.bind(this);
      this.handleGridPointerDown = this.handleGridPointerDown.bind(this);
      this.handleGridClick = this.handleGridClick.bind(this);
      this.handleDragMove = this.handleDragMove.bind(this);
      this.handleDragEnd = this.handleDragEnd.bind(this);
    }

    setEnabled(enabled) {
      const next = Boolean(enabled);
      if (next === this.enabled) return;
      this.enabled = next;
      if (next) this.start(); else this.stop();
    }

    setEmotes(emotes) {
      this.catalog = normalizeCatalog(emotes);
      if (this.panel?.isConnected) this.renderResults();
    }

    start() {
      this.ensureMounted();
      if (!this.mountTimer) {
        this.mountTimer = this.window.setInterval(() => this.ensureMounted(), 1200);
      }
      this.document.addEventListener('pointerdown', this.handleDocumentPointer, true);
      this.window.addEventListener('resize', this.handleViewportChange);
      this.window.addEventListener('scroll', this.handleViewportChange, true);
    }

    stop() {
      this.handleDragEnd();
      this.window.clearInterval(this.mountTimer);
      this.mountTimer = null;
      this.document.removeEventListener('pointerdown', this.handleDocumentPointer, true);
      this.window.removeEventListener('resize', this.handleViewportChange);
      this.window.removeEventListener('scroll', this.handleViewportChange, true);
      this.slot?.remove();
      this.panel?.remove();
      this.button = null;
      this.slot = null;
      this.resetPanelState();
      this.savedInputState = null;
      this.dragState = null;
    }

    dispose() {
      this.setEnabled(false);
      this.catalog = [];
    }

    findNativeButton() {
      for (const selector of NATIVE_EMOTE_BUTTON_SELECTORS) {
        const button = this.document.querySelector(selector);
        if (button) return button;
      }
      const input = this.document.querySelector(CHAT_INPUT_SELECTOR);
      const scope = input?.closest('form') || input?.parentElement?.parentElement || null;
      return Array.from(scope?.querySelectorAll?.('button[aria-label]') || []).find((button) => (
        /emote|emotic|emoji/i.test(button.getAttribute('aria-label') || '')
      )) || null;
    }

    ensureMounted() {
      if (!this.enabled) return false;
      const nativeButton = this.findNativeButton();
      const nativeSlot = nativeButton?.parentElement;
      const actionRow = nativeSlot?.parentElement;
      if (!nativeSlot || !actionRow) return false;
      if (!this.slot?.isConnected) {
        this.slot = this.document.createElement('span');
        this.slot.className = 'tfr-chat-emote-picker-slot';
        this.button = this.createButton();
        this.slot.appendChild(this.button);
      }
      if (this.slot.parentElement !== actionRow || this.slot.nextElementSibling !== nativeSlot) {
        actionRow.insertBefore(this.slot, nativeSlot);
      }
      return true;
    }

    createButton() {
      const button = this.document.createElement('button');
      button.type = 'button';
      button.className = 'tfr-chat-emote-picker-button';
      button.setAttribute('aria-label', this.t('settings.emotePicker.button'));
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="8" r="5.5"></circle><circle cx="6" cy="7" r=".7"></circle><circle cx="10" cy="7" r=".7"></circle><path d="M5.7 9.4c.7 1.3 3.9 1.3 4.6 0"></path><path d="m12.2 12.2 3.2 3.2"></path></svg>';
      button.addEventListener('click', () => this.toggle());
      return button;
    }

    toggle() {
      if (this.panel?.isConnected) {
        this.close();
        return;
      }
      this.open();
    }

    open() {
      const input = this.document.querySelector(CHAT_INPUT_SELECTOR);
      const tools = this.window.TFRChatEmoteAutocomplete;
      this.savedInputState = tools?.getInputState?.(input, this.document) || null;
      this.panel = this.createPanel();
      this.manualPosition = false;
      this.document.body.appendChild(this.panel);
      this.button?.setAttribute('aria-expanded', 'true');
      this.renderResults();
      this.positionPanel();
      this.search?.focus({ preventScroll: true });
    }

    close() {
      this.handleDragEnd();
      this.panel?.remove();
      this.resetPanelState();
      this.button?.setAttribute('aria-expanded', 'false');
    }

    resetPanelState() {
      this.panel = null;
      this.grid = null;
      this.search = null;
      this.empty = null;
      this.filteredResults = [];
      this.renderedCount = 0;
    }

    createPanel() {
      const panel = this.document.createElement('section');
      panel.className = 'tfr-chat-emote-picker';
      panel.setAttribute('aria-label', this.t('settings.emotePicker.title'));

      const header = this.document.createElement('header');
      header.addEventListener('pointerdown', (event) => this.beginDrag(event));
      const title = this.document.createElement('strong');
      title.textContent = this.t('settings.emotePicker.title');
      const close = this.document.createElement('button');
      close.type = 'button';
      close.className = 'tfr-chat-emote-picker__close';
      close.textContent = '×';
      close.setAttribute('aria-label', this.t('common.close'));
      close.addEventListener('click', () => this.close());
      header.append(title, close);

      this.search = this.document.createElement('input');
      this.search.type = 'search';
      this.search.className = 'tfr-chat-emote-picker__search';
      this.search.placeholder = this.t('settings.emotePicker.search');
      this.search.autocomplete = 'off';
      this.search.addEventListener('input', () => this.renderResults());
      this.search.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') this.close();
      });

      const filters = this.document.createElement('div');
      filters.className = 'tfr-chat-emote-picker__filters';
      PROVIDER_FILTERS.forEach(([value, labelKey]) => {
        const filter = this.document.createElement('button');
        filter.type = 'button';
        filter.dataset.provider = value;
        filter.textContent = labelKey.includes('.') ? this.t(labelKey) : labelKey;
        filter.classList.toggle('is-active', this.provider === value);
        filter.addEventListener('click', () => {
          this.provider = value;
          filters.querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === filter));
          this.renderResults();
        });
        filters.appendChild(filter);
      });

      this.grid = this.document.createElement('div');
      this.grid.className = 'tfr-chat-emote-picker__grid';
      this.grid.addEventListener('scroll', this.handleGridScroll, { passive: true });
      this.grid.addEventListener('pointerdown', this.handleGridPointerDown);
      this.grid.addEventListener('click', this.handleGridClick);
      this.empty = this.document.createElement('p');
      this.empty.className = 'tfr-chat-emote-picker__empty';
      this.empty.textContent = this.t('settings.emotePicker.empty');
      panel.append(header, this.search, filters, this.grid, this.empty);
      return panel;
    }

    renderResults() {
      if (!this.grid || !this.empty) return;
      this.filteredResults = filterCatalog(this.catalog, this.search?.value, this.provider);
      this.renderedCount = 0;
      this.grid.replaceChildren();
      this.appendNextBatch();
      this.empty.hidden = this.filteredResults.length > 0;
    }

    appendNextBatch() {
      if (!this.grid || this.renderedCount >= this.filteredResults.length) return;
      const fragment = this.document.createDocumentFragment();
      const startIndex = this.renderedCount;
      const next = this.filteredResults.slice(this.renderedCount, this.renderedCount + RENDER_BATCH_SIZE);
      next.forEach((emote, offset) => {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.className = 'tfr-chat-emote-picker__emote';
        button.dataset.emoteIndex = String(startIndex + offset);
        button.title = `${emote.name} · ${emote.provider}`;
        button.setAttribute('aria-label', `${emote.name}, ${emote.provider}`);
        const image = this.document.createElement('img');
        image.src = emote.url;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        const name = this.document.createElement('span');
        name.textContent = emote.name;
        button.append(image, name);
        fragment.appendChild(button);
      });
      this.renderedCount += next.length;
      this.grid.appendChild(fragment);
    }

    getEmoteButton(target) {
      const button = target?.closest?.('.tfr-chat-emote-picker__emote');
      return button && this.grid?.contains(button) ? button : null;
    }

    handleGridPointerDown(event) {
      if (this.getEmoteButton(event.target)) event.preventDefault();
    }

    handleGridClick(event) {
      const button = this.getEmoteButton(event.target);
      if (!button) return;
      const index = Number.parseInt(button.dataset.emoteIndex || '', 10);
      const emote = Number.isInteger(index) ? this.filteredResults[index] : null;
      if (emote) this.insertEmote(emote);
    }

    handleGridScroll() {
      if (!this.grid) return;
      if (this.grid.scrollTop + this.grid.clientHeight >= this.grid.scrollHeight - 120) {
        this.appendNextBatch();
      }
    }

    insertEmote(emote) {
      const tools = this.window.TFRChatEmoteAutocomplete;
      const input = this.savedInputState?.input || this.document.querySelector(CHAT_INPUT_SELECTOR);
      if (!tools?.replaceRange || !input) return false;
      input.focus?.({ preventScroll: true });
      const current = tools.getInputState?.(input, this.document);
      const state = current || this.savedInputState;
      if (!state) return false;
      const caret = Number.isInteger(state.caret) ? state.caret : state.text.length;
      const replacement = emote.name;
      const inserted = tools.replaceRange(
        state, caret, caret, replacement, this.document, this.window, emote
      );
      if (inserted) {
        this.savedInputState = {
          ...state,
          text: `${state.text.slice(0, caret)}${replacement}${state.text.slice(caret)}`,
          caret: caret + replacement.length
        };
        this.close();
      }
      return inserted;
    }

    positionPanel() {
      if (!this.panel || !this.button?.getBoundingClientRect) return;
      const anchor = this.button.getBoundingClientRect();
      const bounds = this.panel.getBoundingClientRect();
      this.applyPanelPosition(getAnchoredPanelPosition(anchor, bounds, this.getViewportSize()));
    }

    getViewportSize() {
      return { width: this.window.innerWidth, height: this.window.innerHeight };
    }

    applyPanelPosition(position) {
      if (!this.panel) return;
      this.panel.style.left = `${Math.round(position.left)}px`;
      this.panel.style.top = `${Math.round(position.top)}px`;
    }

    beginDrag(event) {
      if (event.button !== 0 || event.target?.closest?.('.tfr-chat-emote-picker__close')) return;
      const bounds = this.panel?.getBoundingClientRect?.();
      if (!bounds) return;
      this.dragState = { offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
      this.manualPosition = true;
      this.panel.classList.add('is-dragging');
      this.document.addEventListener('pointermove', this.handleDragMove, true);
      this.document.addEventListener('pointerup', this.handleDragEnd, true);
      this.document.addEventListener('pointercancel', this.handleDragEnd, true);
      event.preventDefault();
    }

    handleDragMove(event) {
      if (!this.dragState || !this.panel) return;
      const bounds = this.panel.getBoundingClientRect();
      this.applyPanelPosition(clampPanelPosition({
        left: event.clientX - this.dragState.offsetX,
        top: event.clientY - this.dragState.offsetY
      }, bounds, this.getViewportSize(), DRAG_MARGIN));
    }

    handleDragEnd() {
      this.dragState = null;
      this.panel?.classList.remove('is-dragging');
      this.document.removeEventListener('pointermove', this.handleDragMove, true);
      this.document.removeEventListener('pointerup', this.handleDragEnd, true);
      this.document.removeEventListener('pointercancel', this.handleDragEnd, true);
    }

    handleDocumentPointer(event) {
      if (!this.panel?.isConnected) return;
      if (this.panel.contains(event.target) || this.button?.contains(event.target)) return;
      this.close();
    }

    handleViewportChange() {
      if (!this.panel?.isConnected) return;
      if (!this.manualPosition) {
        this.positionPanel();
        return;
      }
      const bounds = this.panel.getBoundingClientRect();
      this.applyPanelPosition(clampPanelPosition(
        { left: bounds.left, top: bounds.top },
        bounds,
        this.getViewportSize(),
        DRAG_MARGIN
      ));
    }
  }

  window.TFRChatEmotePicker = Object.freeze({ ChatEmotePicker });
})();

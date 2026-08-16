(() => {
  'use strict';
  const CHAT_INPUT_SELECTOR = [
    '.chat-wysiwyg-input__editor[contenteditable="true"]',
    '[contenteditable="true"][data-a-target="chat-input"]',
    '[data-a-target="chat-input"] [contenteditable="true"]',
    'textarea[data-a-target*="chat"]',
  ].join(', ');
  const SYNC_EVENT = 'tfr:chat-emotes:sync';
  const REPLACE_EVENT = 'tfr:chat-emotes:replace';
  const SESSION_RESET_EVENTS = ['beforeinput', 'paste', 'cut', 'drop', 'pointerdown', 'focusout'];
  const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

  const normalizeNames = (names) => [...new Set(Array.from(names || [], (name) => String(name || '').trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

  const normalizeCatalog = (emotes) => {
    const values = emotes instanceof Map ? emotes.values() : emotes || [];
    const catalog = new Map();
    Array.from(values).forEach((entry) => {
      const emote = typeof entry === 'string' ? { name: entry } : entry;
      const name = String(emote?.name || '').trim();
      if (!name || catalog.has(name)) return;
      catalog.set(name, {
        name,
        url: String(emote?.url || ''),
        provider: String(emote?.provider || '')
      });
    });
    return catalog;
  };

  const findMatches = (names, prefix) => {
    const normalizedPrefix = String(prefix || '').toLowerCase();
    if (!normalizedPrefix) return [];
    return names.filter((name) => name.toLowerCase().startsWith(normalizedPrefix));
  };

  const getTextareaState = (input) => {
    if (typeof input?.value !== 'string' || !Number.isInteger(input.selectionStart)) return null;
    return { input, text: input.value, caret: input.selectionStart, kind: 'text' };
  };

  const getEditableState = (input, documentRef) => {
    if (!input?.isContentEditable) return null;
    const selection = documentRef.getSelection?.();
    if (!selection?.rangeCount || !selection.isCollapsed || !input.contains(selection.anchorNode)) return null;
    const range = selection.getRangeAt(0);
    const before = range.cloneRange();
    before.selectNodeContents(input);
    before.setEnd(range.endContainer, range.endOffset);
    return { input, text: input.textContent || '', caret: before.toString().length, kind: 'editable' };
  };

  const getInputState = (target, documentRef) => {
    const input = target?.closest?.(CHAT_INPUT_SELECTOR);
    if (!input) return null;
    return getTextareaState(input) || getEditableState(input, documentRef);
  };

  const findTextPoint = (root, offset, documentRef) => {
    const walker = documentRef.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let last = null;
    while (walker.nextNode()) {
      last = walker.currentNode;
      const length = last.nodeValue?.length || 0;
      if (remaining <= length) return { node: last, offset: remaining };
      remaining -= length;
    }
    return last ? { node: last, offset: last.nodeValue?.length || 0 } : null;
  };

  const dispatchInput = (input, windowRef) => input.dispatchEvent(new windowRef.InputEvent('input', {
    bubbles: true,
    inputType: 'insertText'
  }));
  const createCustomEvent = (documentRef, windowRef, type, detail) => {
    if (typeof windowRef.CustomEvent === 'function') return new windowRef.CustomEvent(type, { bubbles: true, detail });
    const event = documentRef.createEvent('CustomEvent');
    event.initCustomEvent(type, true, false, detail);
    return event;
  };

  const replaceRange = (state, start, end, replacement, documentRef, windowRef, emote = null) => {
    if (state.kind === 'text') {
      state.input.setRangeText(replacement, start, end, 'end');
      dispatchInput(state.input, windowRef);
      return true;
    }
    const requestId = `${Date.now()}-${Math.random()}`;
    state.input.removeAttribute('data-tfr-emote-replace-result');
    state.input.setAttribute('data-tfr-emote-replace-request', JSON.stringify({
      start, end, replacement, requestId, emote
    }));
    state.input.dispatchEvent(createCustomEvent(documentRef, windowRef, REPLACE_EVENT));
    if (state.input.dataset.tfrEmoteReplaceResult === requestId) {
      state.input.removeAttribute('data-tfr-emote-replace-result');
      return true;
    }
    state.input.removeAttribute('data-tfr-emote-replace-request');
    const startPoint = findTextPoint(state.input, start, documentRef);
    const endPoint = findTextPoint(state.input, end, documentRef);
    if (!startPoint || !endPoint) return false;
    const range = documentRef.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    const selection = documentRef.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return Boolean(documentRef.execCommand?.('insertText', false, replacement));
  };

  const createPreviewElement = (documentRef) => {
    const root = documentRef.createElement('div');
    root.className = 'tfr-chat-emote-autocomplete-preview';
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    const image = documentRef.createElement('img');
    image.alt = '';
    const details = documentRef.createElement('span');
    const name = documentRef.createElement('strong');
    const provider = documentRef.createElement('small');
    details.append(name, provider);
    root.append(image, details);
    return { root, image, name, provider };
  };

  class ChatEmoteAutocomplete {
    constructor(documentRef = document, windowRef = window) {
      this.document = documentRef;
      this.window = windowRef;
      this.enabled = false;
      this.names = [];
      this.catalog = new Map();
      this.session = null;
      this.replacingInput = null;
      this.preview = null;
      this.handleKeyDown = this.handleKeyDown.bind(this);
      this.handleEdit = this.handleEdit.bind(this);
    }

    setEnabled(enabled) {
      const next = Boolean(enabled);
      if (next === this.enabled) return;
      this.enabled = next;
      this.session = null;
      if (next) {
        this.document.addEventListener('keydown', this.handleKeyDown, true);
        SESSION_RESET_EVENTS.forEach((name) => this.document.addEventListener(name, this.handleEdit, true));
      } else {
        this.document.removeEventListener('keydown', this.handleKeyDown, true);
        SESSION_RESET_EVENTS.forEach((name) => this.document.removeEventListener(name, this.handleEdit, true));
        this.hidePreview();
      }
    }

    setEmotes(emotes) {
      this.catalog = normalizeCatalog(emotes);
      this.names = normalizeNames(this.catalog.keys());
      this.session = null;
      this.hidePreview();
      this.document.documentElement?.setAttribute(
        'data-tfr-chat-emote-catalog',
        JSON.stringify([...this.catalog.values()])
      );
      this.document.dispatchEvent(createCustomEvent(
        this.document,
        this.window,
        SYNC_EVENT
      ));
    }

    handleEdit(event) {
      if (event?.target && event.target === this.replacingInput) return;
      this.session = null;
      this.hidePreview();
    }

    ensurePreview() {
      if (this.preview?.root?.isConnected) return this.preview;
      this.preview = createPreviewElement(this.document);
      this.document.body.appendChild(this.preview.root);
      return this.preview;
    }

    showPreview(input, emoteName) {
      const emote = this.catalog.get(emoteName);
      if (!emote?.url || !input?.getBoundingClientRect) {
        this.hidePreview();
        return;
      }
      const preview = this.ensurePreview();
      preview.image.src = emote.url;
      preview.name.textContent = emote.name;
      preview.provider.textContent = emote.provider;
      preview.root.dataset.provider = emote.provider;
      preview.root.hidden = false;
      const anchor = input.getBoundingClientRect();
      const bounds = preview.root.getBoundingClientRect();
      const left = Math.max(8, anchor.right - bounds.width - 8);
      const top = Math.max(8, anchor.top + ((anchor.height - bounds.height) / 2));
      preview.root.style.left = `${Math.round(left)}px`;
      preview.root.style.top = `${Math.round(top)}px`;
    }

    hidePreview() {
      if (this.preview) this.preview.root.hidden = true;
    }

    handleKeyDown(event) {
      if (!this.enabled) return;
      if (event.key !== 'Tab') {
        if (!MODIFIER_KEYS.has(event.key)) this.handleEdit();
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const state = getInputState(event.target, this.document);
      if (!state) return;
      let session = this.session;
      // Twitch renders a recognized Slate token as an image. Its DOM text can then
      // contain alt text and zero-width markers, so it is not a reliable source for
      // cycling through the same completion. Real edits reset the session via input.
      const continues = session?.input === state.input;
      if (!continues) {
        const prefix = state.text.slice(0, state.caret).match(/([^\s]+)$/)?.[1] || '';
        if (prefix.length < 2) return;
        const matches = findMatches(this.names, prefix);
        if (!matches.length || (matches.length === 1 && matches[0] === prefix)) return;
        session = {
          input: state.input,
          start: state.caret - prefix.length,
          current: prefix,
          matches,
          index: event.shiftKey ? matches.length - 1 : 0
        };
      } else {
        const direction = event.shiftKey ? -1 : 1;
        session.index = (session.index + direction + session.matches.length) % session.matches.length;
      }
      const replacement = session.matches[session.index];
      const replacementEnd = continues ? session.start + session.current.length : state.caret;
      let replaced = false;
      this.replacingInput = state.input;
      try {
        replaced = replaceRange(
          state,
          session.start,
          replacementEnd,
          replacement,
          this.document,
          this.window,
          this.catalog.get(replacement) || null
        );
      } finally {
        this.replacingInput = null;
      }
      if (!replaced) return;
      session.current = replacement;
      this.session = session;
      if (state.kind === 'text') this.showPreview(state.input, replacement);
      else this.hidePreview();
      event.preventDefault();
      event.stopPropagation();
    }

    dispose() {
      this.setEnabled(false);
      this.names = [];
      this.catalog.clear();
      this.preview?.root?.remove();
      this.preview = null;
    }
  }

  window.TFRChatEmoteAutocomplete = Object.freeze({
    ChatEmoteAutocomplete,
    normalizeNames,
    normalizeCatalog,
    findMatches,
    createPreviewElement,
    getInputState,
    replaceRange
  });
})();

(() => {
  const REACTIONS = window.TFRSharedSpaceChat.REACTIONS;
  const createAvatar = (options) => window.TFRSharedSpacesView.createAvatar(options);
  const button = (label, onClick, className = '') => {
    const control = document.createElement('button'); control.type = 'button'; control.className = className; control.textContent = label;
    if (onClick) control.addEventListener('click', onClick);
    return control;
  };

  const renderMessage = ({ message, state, t, handlers }) => {
    const item = document.createElement('article');
    item.className = `tfr-shared-chat__message${message.mine ? ' is-mine' : ''}${message.kind === 'system' ? ' is-system' : ''}`;
    if (message.kind === 'system') { item.textContent = t(`sharedSpaces.chat.system.${message.body}`); return item; }
    const avatar = createAvatar({ url: message.author?.avatarUrl, label: message.author?.displayName || message.author?.login, className: 'tfr-shared-chat__avatar' });
    const content = document.createElement('div'); content.className = 'tfr-shared-chat__message-content';
    const meta = document.createElement('div'); meta.className = 'tfr-shared-chat__meta';
    const author = document.createElement('strong'); author.textContent = message.author?.displayName || message.author?.login || t('sharedSpaces.chat.unknown');
    const time = document.createElement('time'); time.dateTime = message.createdAt || '';
    time.textContent = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    if (message.editedAt) time.textContent += ` · ${t('sharedSpaces.chat.edited')}`;
    meta.append(author, time); content.appendChild(meta);
    if (message.replyTo) {
      const quote = document.createElement('div'); quote.className = 'tfr-shared-chat__reply-quote';
      quote.textContent = message.replyTo.deleted ? t('sharedSpaces.chat.deleted') : `${message.replyTo.authorName || t('sharedSpaces.chat.unknown')} · ${message.replyTo.body}`;
      content.appendChild(quote);
    }
    if (state.editingMessage?.id === message.id) {
      const editor = document.createElement('form'); editor.className = 'tfr-shared-chat__editor';
      const input = document.createElement('textarea'); input.rows = 2; input.maxLength = window.TFRSharedSpaceChat.MAX_MESSAGE_LENGTH;
      input.value = state.editDraft || ''; input.dataset.tfrFocusKey = `shared-space-chat-edit-${message.id}`;
      const controls = document.createElement('div'); const save = button(t('sharedSpaces.chat.save')); save.type = 'submit'; save.disabled = !input.value.trim();
      input.addEventListener('input', () => { handlers.onEditDraft(input.value); save.disabled = !input.value.trim(); });
      editor.addEventListener('submit', (event) => { event.preventDefault(); handlers.onSaveEdit(); });
      controls.append(save, button(t('sharedSpaces.chat.cancel'), handlers.onCancelEdit)); editor.append(input, controls); content.appendChild(editor);
    } else {
      const text = document.createElement('p'); text.textContent = message.deleted ? t('sharedSpaces.chat.deleted') : message.body;
      if (message.deleted) text.className = 'is-deleted'; content.appendChild(text);
    }
    const reactions = document.createElement('div'); reactions.className = 'tfr-shared-chat__reactions';
    if (!message.deleted) REACTIONS.forEach((emoji) => {
      const value = message.reactions?.find((entry) => entry.emoji === emoji);
      const control = button(`${emoji}${value?.count ? ` ${value.count}` : ''}`, () => handlers.onReact(message, emoji));
      control.className = value?.reacted ? 'is-active' : ''; control.setAttribute('aria-label', t('sharedSpaces.chat.react', { emoji })); reactions.appendChild(control);
    });
    const actions = document.createElement('div'); actions.className = 'tfr-shared-chat__message-actions';
    if (!message.deleted) {
      actions.appendChild(button(t('sharedSpaces.chat.reply'), () => handlers.onReply(message)));
      if (message.mine) actions.appendChild(button(t('sharedSpaces.chat.edit'), () => handlers.onEdit(message)));
      if (message.canDelete) actions.appendChild(button(t('sharedSpaces.chat.delete'), () => handlers.onDelete(message)));
      if (!message.mine && message.author?.id) {
        actions.append(button(t('sharedSpaces.chat.report'), () => handlers.onReport(message)), button(t('sharedSpaces.chat.block'), () => handlers.onBlock(message)));
      }
    }
    content.append(reactions, actions); item.append(avatar, content); return item;
  };

  const render = (options) => {
    const { state, t } = options;
    const panel = document.createElement('details'); panel.className = 'tfr-shared-chat'; panel.classList.toggle('is-fullscreen', state.fullscreen === true); panel.open = state.expanded === true;
    const summary = document.createElement('summary'); summary.className = 'tfr-shared-chat__summary';
    const heading = document.createElement('span'); const title = document.createElement('strong'); title.textContent = t('sharedSpaces.chat.title');
    const hint = document.createElement('small'); hint.textContent = t('sharedSpaces.chat.hint'); heading.append(title, hint);
    const summaryActions = document.createElement('span'); summaryActions.className = 'tfr-shared-chat__summary-actions';
    const badge = document.createElement('span'); badge.className = 'tfr-shared-chat__badge'; badge.textContent = state.unreadCount > 99 ? '99+' : String(state.unreadCount || ''); badge.hidden = !state.unreadCount;
    const fullscreen = button(state.fullscreen ? '⤡' : '⤢', (event) => { event.preventDefault(); event.stopPropagation(); options.onFullscreen(!state.fullscreen); }, 'tfr-shared-chat__fullscreen');
    fullscreen.setAttribute('aria-label', t(state.fullscreen ? 'sharedSpaces.chat.exitFullscreen' : 'sharedSpaces.chat.fullscreen')); fullscreen.title = fullscreen.getAttribute('aria-label');
    summaryActions.append(badge, fullscreen); summary.append(heading, summaryActions); panel.appendChild(summary);
    panel.addEventListener('toggle', () => { if (panel.open !== (state.expanded === true)) options.onToggle(panel.open); });
    const body = document.createElement('div'); body.className = 'tfr-shared-chat__body';
    const search = document.createElement('input'); search.type = 'search'; search.className = 'tfr-shared-chat__search'; search.value = state.query || ''; search.placeholder = t('sharedSpaces.chat.search'); search.dataset.tfrFocusKey = 'shared-space-chat-search'; search.addEventListener('input', () => options.onSearch(search.value)); body.appendChild(search);
    const list = document.createElement('div'); list.className = 'tfr-shared-chat__messages'; list.setAttribute('role', 'log'); list.setAttribute('aria-live', 'polite');
    if (state.hasOlder) { const older = button(state.loadingOlder ? t('sharedSpaces.chat.loading') : t('sharedSpaces.chat.older'), options.onLoadOlder, 'tfr-shared-chat__older'); older.disabled = state.loadingOlder; list.appendChild(older); }
    if (state.loading && !state.messages.length) { const empty = document.createElement('p'); empty.className = 'tfr-shared-chat__empty'; empty.textContent = t('sharedSpaces.chat.loading'); list.appendChild(empty); }
    else if (!state.messages.length) { const empty = document.createElement('p'); empty.className = 'tfr-shared-chat__empty'; empty.textContent = t(state.query ? 'sharedSpaces.chat.searchEmpty' : 'sharedSpaces.chat.empty'); list.appendChild(empty); }
    state.messages.forEach((message) => list.appendChild(renderMessage({ message, state, t, handlers: options })));
    body.appendChild(list);
    if (state.replyTo) { const bar = document.createElement('div'); bar.className = 'tfr-shared-chat__reply-bar'; const text = document.createElement('span'); text.textContent = t('sharedSpaces.chat.replyingTo', { name: state.replyTo.author?.displayName || state.replyTo.author?.login || '' }); const cancel = button('×', () => options.onReply(null)); cancel.setAttribute('aria-label', t('sharedSpaces.chat.cancelReply')); bar.append(text, cancel); body.appendChild(bar); }
    const composer = document.createElement('form'); composer.className = 'tfr-shared-chat__composer'; const input = document.createElement('textarea'); input.rows = 2; input.maxLength = window.TFRSharedSpaceChat.MAX_MESSAGE_LENGTH; input.value = state.draft || ''; input.placeholder = t('sharedSpaces.chat.placeholder'); input.dataset.tfrFocusKey = 'shared-space-chat-input'; input.disabled = state.sending;
    const submit = button(state.sending ? t('sharedSpaces.chat.sending') : t('sharedSpaces.chat.send'), null, 'tfr-button'); submit.type = 'submit'; submit.disabled = state.sending || !String(state.draft || '').trim();
    input.addEventListener('input', () => { options.onDraft(input.value); submit.disabled = state.sending || !input.value.trim(); }); input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); composer.requestSubmit(); } }); composer.addEventListener('submit', async (event) => { event.preventDefault(); await options.onSend(); }); composer.append(input, submit); body.appendChild(composer);
    if (state.blockedUsers?.length) { const blocked = document.createElement('details'); blocked.className = 'tfr-shared-chat__blocked'; const label = document.createElement('summary'); label.textContent = t('sharedSpaces.chat.blockedUsers', { count: state.blockedUsers.length }); blocked.appendChild(label); state.blockedUsers.forEach((user) => { const row = document.createElement('div'); const name = document.createElement('span'); name.textContent = user.displayName || user.login || t('sharedSpaces.chat.unknown'); row.append(name, button(t('sharedSpaces.chat.unblock'), () => options.onUnblock(user))); blocked.appendChild(row); }); body.appendChild(blocked); }
    const feedbackKey = state.notice === 'reported' ? 'reported' : state.notice === 'edited' ? 'editSuccess' : '';
    if (feedbackKey) { const notice = document.createElement('small'); notice.className = 'tfr-shared-chat__notice'; notice.textContent = t(`sharedSpaces.chat.${feedbackKey}`); body.appendChild(notice); }
    if (state.error) { const error = document.createElement('small'); error.className = 'tfr-shared-chat__error'; error.textContent = t('sharedSpaces.chat.error'); body.appendChild(error); }
    panel.appendChild(body); queueMicrotask(() => { if (panel.open) list.scrollTop = list.scrollHeight; }); return panel;
  };

  window.TFRSharedSpaceChatView = Object.freeze({ render });
})();

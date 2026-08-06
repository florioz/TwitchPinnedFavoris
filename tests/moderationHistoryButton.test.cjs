const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class HTMLElementMock {}

const context = vm.createContext({
  window: { TFRChatEmoteResolver: { create: () => ({}) } },
  document: {},
  console,
  HTMLElement: HTMLElementMock
});
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/chatDomTools.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationDurationTools.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationHistoryPresenter.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationActionCollection.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationTextTools.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationPanelGeometry.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/chatModeration.js'),
  'utf8'
), context);

const {
  ModerationActionTracker,
  ModerationHistoryUI,
  ViewerCardHistoryRenderer
} = context.window.TFRChatModeration.create({ t: (key) => key });

test('moderation history button stays immediately before chat settings', () => {
  const toolbar = new HTMLElementMock();
  const settingsSlot = new HTMLElementMock();
  const anchor = new HTMLElementMock();
  const button = new HTMLElementMock();
  anchor.parentElement = settingsSlot;
  settingsSlot.parentElement = toolbar;
  settingsSlot.getBoundingClientRect = () => ({ width: 32 });
  toolbar.parentElement = null;
  toolbar.getBoundingClientRect = () => ({ width: 320, left: 100, top: 200 });
  anchor.getBoundingClientRect = () => ({ left: 356, top: 202, width: 32, height: 32 });
  button.parentElement = null;
  button.nextElementSibling = null;
  button.offsetWidth = 32;
  button.offsetHeight = 32;
  button.style = { left: '', top: '', removeProperty() {} };
  toolbar.classList = { add() {}, remove() {} };
  let appended = null;
  toolbar.appendChild = (node) => {
    appended = node;
    node.parentElement = toolbar;
  };
  toolbar.contains = () => false;

  const ui = Object.create(ModerationHistoryUI.prototype);
  ui.findControlsAnchor = () => anchor;
  ui.findControlsContainer = () => null;
  ui.ensureButton = () => button;
  ui.buttonAnchor = null;
  ui.mountButton();

  assert.equal(appended, button);
  assert.equal(button.style.left, '224px');
  assert.equal(button.style.top, '2px');
  appended = null;
  ui.mountButton();
  assert.equal(appended, null);
});

test('moderation history button has a dedicated compact size', () => {
  const css = fs.readFileSync(path.join(__dirname, '../styles/buttons.css'), 'utf8');
  assert.match(css, /\.tfr-mod-history-button\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/s);
  assert.match(css, /\.tfr-mod-history-button\s*\{[^}]*position:\s*absolute;/s);
});

test('moderation history anchors immediately before chat settings', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/chatModeration.js'),
    'utf8'
  );
  const anchorMethod = source.match(/findControlsAnchor\(\)\s*\{([\s\S]*?)\n\s*findControlsContainer\(\)/)?.[1] || '';

  assert.match(anchorMethod, /chat-settings/);
  assert.doesNotMatch(anchorMethod, /emote-picker-button/);
});

test('viewer card observer ignores mutations created by its own history renderer', () => {
  const renderer = new ViewerCardHistoryRenderer({});
  const history = { id: 'tfr-viewer-history', closest: () => null };
  const child = { id: '', closest: (selector) => selector === '#tfr-viewer-history' ? history : null };
  const native = { id: '', closest: () => null };

  assert.equal(renderer.isOwnHistoryMutation({ target: child, addedNodes: [], removedNodes: [] }), true);
  assert.equal(renderer.isOwnHistoryMutation({ target: native, addedNodes: [history], removedNodes: [] }), true);
  assert.equal(renderer.isOwnHistoryMutation({ target: native, addedNodes: [native], removedNodes: [] }), false);
  assert.equal(renderer.isOwnHistoryMutation({ target: native, addedNodes: [history, native], removedNodes: [] }), false);
});

test('generic Twitch deletion markers stay deletions instead of becoming timeouts', () => {
  const tracker = new ModerationActionTracker({});
  const element = new HTMLElementMock();
  element.dataset = {};
  element.classList = { contains: () => false };
  element.querySelector = (selector) => selector.includes('deleted-message')
    ? { textContent: 'Message supprimé' }
    : null;

  const action = tracker.detectDeletionAction(element, 'message supprime');

  assert.equal(action.type, 'deletion');
  assert.equal(action.duration, null);
  assert.equal(tracker.isModerationPlaceholder('Message supprimé'), true);
  assert.equal(tracker.isModerationPlaceholder('mon message parle de timeout'), false);
});

test('moderation mutation filtering ignores ordinary class churn', () => {
  const tracker = new ModerationActionTracker({});
  const target = {
    getAttribute: (name) => name === 'class' ? 'chat-line__message is-hovered' : ''
  };

  assert.equal(tracker.shouldScanMutation({ type: 'attributes', attributeName: 'class', oldValue: 'chat-line__message', target }), false);
  assert.equal(tracker.shouldScanMutation({ type: 'attributes', attributeName: 'class', oldValue: 'chat-line__message', target: {
    getAttribute: () => 'chat-line__message chat-line__message--deleted'
  } }), true);
});

test('announcement banners are never interpreted as bans', () => {
  const tracker = new ModerationActionTracker({});

  assert.equal(tracker.hasBanIndicator('chat-line__message announcement-banner'), false);
  assert.equal(tracker.hasBanIndicator('community-banner'), false);
  assert.equal(tracker.hasBanIndicator('moderation-action-ban'), true);
  assert.equal(tracker.hasBanIndicator('utilisateur banni'), true);
});

test('hidden moderation controls are not evidence of an executed timeout', () => {
  const tracker = new ModerationActionTracker({});
  const button = {
    tagName: 'BUTTON',
    getAttribute: () => '',
    closest: () => null
  };
  const labelInsideButton = {
    tagName: 'SPAN',
    getAttribute: () => '',
    closest: (selector) => selector.includes('button') ? button : null
  };
  const status = {
    tagName: 'DIV',
    getAttribute: () => '',
    closest: () => null
  };

  assert.equal(tracker.isInteractiveModerationControl(button), true);
  assert.equal(tracker.isInteractiveModerationControl(labelInsideButton), true);
  assert.equal(tracker.isInteractiveModerationControl(status), false);
});

test('temporary-ban status promotes the recent deletion with its duration', () => {
  const tracker = new ModerationActionTracker({ normalizeLogin: (value) => value, getHistory: () => [] });
  const deletion = {
    id: 'deletion-floriozztest-1',
    login: 'floriozztest',
    displayName: 'floriozztest',
    type: 'deletion',
    duration: null,
    detectedAt: Date.now(),
    timestamp: Date.now(),
    offenseMessage: 'message test'
  };
  tracker.actions.push(deletion);
  tracker.actionKeys.add(deletion.id);
  const status = new HTMLElementMock();
  status.innerText = 'Bannissement temporaire Vous pourrez envoyer un nouveau message dans 9 minutes';
  status.dataset = {};
  status.closest = () => null;

  assert.equal(tracker.captureModerationStatus(status), true);
  assert.equal(deletion.type, 'timeout');
  assert.equal(deletion.duration, 540);
  assert.equal(deletion.offenseMessage, 'message test');
});

test('a burst of deleted messages from another user is inferred as a timeout', () => {
  const tracker = new ModerationActionTracker({ normalizeLogin: (value) => value });
  const now = Date.now();
  const deletion = {
    id: 'deletion-other-1', login: 'other', type: 'deletion', detectedAt: now,
    timestamp: now, offenseMessage: 'premier message', lastMessageTimestamp: now - 100
  };
  tracker.actions.push(deletion);
  tracker.actionKeys.add(deletion.id);

  assert.equal(tracker.recordDeletionEvidence(deletion), false);
  assert.equal(tracker.recordDeletionEvidence({
    ...deletion,
    id: 'deletion-other-2',
    offenseMessage: 'second message',
    lastMessageTimestamp: now
  }), true);
  assert.equal(deletion.type, 'timeout');
  assert.equal(deletion.duration, null);
});

test('timeout status arriving before the deleted line is applied afterwards', () => {
  const tracker = new ModerationActionTracker({ normalizeLogin: (value) => value, getLatestMessage: () => null });
  const status = new HTMLElementMock();
  status.innerText = 'Bannissement temporaire Vous pourrez envoyer un nouveau message dans 10 minutes';
  status.dataset = {};
  status.closest = () => null;

  assert.equal(tracker.captureModerationStatus(status), false);
  assert.equal(tracker.pendingStatuses.get('timeout').duration, 600);

  const deletion = {
    id: 'deletion-late-1', login: 'late_user', type: 'deletion', detectedAt: Date.now(), timestamp: Date.now()
  };
  tracker.actions.push(deletion);
  tracker.actionKeys.add(deletion.id);

  assert.equal(tracker.applyPendingTimeout('late_user'), true);
  assert.equal(deletion.type, 'timeout');
  assert.equal(deletion.duration, 600);
  assert.equal(tracker.pendingStatuses.has('timeout'), false);
});

test('Twitch timeout countdown is rounded up to the next full minute', () => {
  const tracker = new ModerationActionTracker({});

  assert.equal(
    tracker.extractRoundedCountdownDuration('Vous pourrez envoyer un nouveau message dans 9 minutes 29 secondes.'),
    600
  );
  assert.equal(
    tracker.extractRoundedCountdownDuration('You can send a new message in 4 minutes 1 second.'),
    300
  );
});

test('Twitch banned-user marker promotes a deletion to a permanent ban', () => {
  const tracker = new ModerationActionTracker({ normalizeLogin: (value) => value, getLatestMessage: () => null });
  const now = Date.now();
  const deletion = {
    id: 'deletion-perma-1', login: 'perma_user', displayName: 'Perma_user',
    type: 'deletion', duration: null, isPermanent: false, detectedAt: now, timestamp: now,
    offenseMessage: 'message concerné'
  };
  tracker.actions.push(deletion);
  tracker.actionKeys.add(deletion.id);
  const status = new HTMLElementMock();
  status.innerText = "Vous avez été banni du chat. Vous ne pouvez plus participer tant qu'un modérateur n'a pas annulé votre bannissement. Demande après 15 minutes.";
  status.dataset = {};
  status.closest = () => null;
  status.matches = (selector) => selector.includes('banned-user-message');

  assert.equal(tracker.captureModerationStatus(status), true);
  assert.equal(deletion.type, 'ban');
  assert.equal(deletion.isPermanent, true);
  assert.equal(deletion.duration, null);
  assert.equal(deletion.offenseMessage, 'message concerné');
});

test('permanent-ban status can wait for its deleted line', () => {
  const tracker = new ModerationActionTracker({ normalizeLogin: (value) => value, getLatestMessage: () => null });
  const status = new HTMLElementMock();
  status.innerText = 'Vous avez été banni du chat';
  status.dataset = {};
  status.closest = () => null;
  status.matches = () => true;

  assert.equal(tracker.captureModerationStatus(status), false);
  const deletion = {
    id: 'deletion-perma-late', login: 'late_perma', type: 'deletion', detectedAt: Date.now(), timestamp: Date.now()
  };
  tracker.actions.push(deletion);
  tracker.actionKeys.add(deletion.id);
  assert.equal(tracker.applyPendingPermanentBan('late_perma'), true);
  assert.equal(deletion.type, 'ban');
  assert.equal(deletion.isPermanent, true);
});

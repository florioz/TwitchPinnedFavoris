const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const loadFeatures = () => {
  class ElementMock {}
  let intervalId = 0;
  let timeoutCalls = 0;
  const activeIntervals = new Set();
  const window = {
    location: { pathname: '/directory' },
    setInterval: () => {
      intervalId += 1;
      activeIntervals.add(intervalId);
      return intervalId;
    },
    clearInterval: (id) => activeIntervals.delete(id),
    setTimeout: () => {
      timeoutCalls += 1;
      return timeoutCalls;
    },
    clearTimeout: () => {},
    TFRPerformance: null,
    addEventListener() {},
    removeEventListener() {}
  };
  const classes = new Set();
  const styles = new Map();
  const context = {
    window,
    document: {
      visibilityState: 'visible',
      querySelector: () => null,
      querySelectorAll: () => [],
      documentElement: {
        classList: {
          toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
          remove: (name) => classes.delete(name)
        },
        style: {
          setProperty: (name, value) => styles.set(name, value),
          removeProperty: (name) => styles.delete(name)
        }
      }
    },
    fetch: async () => ({ ok: false, json: async () => null }),
    console,
    Element: ElementMock,
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    clearInterval: window.clearInterval,
    clearTimeout: window.clearTimeout
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/deletedMessageView.js'), 'utf8'),
    context
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/domWorkScheduler.js'), 'utf8'),
    context
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/playerAudioEngine.js'), 'utf8'),
    context
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/streamEnhancements.js'), 'utf8'),
    context
  );
  const features = window.TFRStreamEnhancements.create({ t: (key) => key });
  return { features, activeIntervals, classes, styles, ElementMock, getTimeoutCalls: () => timeoutCalls };
};

test('player latency indicator starts and stops without leaving a timer behind', () => {
  const { features, activeIntervals } = loadFeatures();
  const indicator = new features.PlayerLatencyIndicator();

  assert.equal(indicator.engine, undefined);
  indicator.configure(true);
  assert.equal(activeIntervals.size, 1);

  indicator.configure(false);
  assert.equal(activeIntervals.size, 0);
});

test('stream enhancement module exposes independent emote and player features', () => {
  const { features } = loadFeatures();
  assert.equal(typeof features.ThirdPartyChatEmotes, 'function');
  assert.equal(typeof features.PlayerLatencyIndicator, 'function');
  assert.equal(typeof features.AutoClaimChannelPoints, 'function');
  assert.equal(typeof features.PlayerAudioCompressor, 'function');
  assert.equal(typeof features.ChatFontManager, 'function');
  assert.equal(typeof features.ChatPaddingManager, 'function');
  assert.equal(typeof features.ChatMentionHighlighter, 'function');
  assert.equal(typeof features.DeletedMessageViewer, 'function');
  assert.equal(typeof features.ReplyExpansionTracker, 'function');
});

test('channel point bonuses are claimed once without clicking unrelated buttons', () => {
  const { features, ElementMock } = loadFeatures();
  const manager = new features.AutoClaimChannelPoints();
  let claimClicks = 0;
  const claimButton = { disabled: false, click: () => { claimClicks += 1; } };
  const bonusNode = new ElementMock();
  bonusNode.matches = () => false;
  bonusNode.querySelector = () => ({ closest: () => claimButton });
  bonusNode.querySelectorAll = () => [];

  manager.enabled = true;
  manager.scan(bonusNode);
  manager.scan(bonusNode);
  assert.equal(claimClicks, 1);

  const unrelatedNode = new ElementMock();
  unrelatedNode.matches = () => false;
  unrelatedNode.querySelector = () => null;
  unrelatedNode.querySelectorAll = () => [{ getAttribute: () => 'Community Points' }];
  manager.scan(unrelatedNode);
  assert.equal(claimClicks, 1);
});

test('audio compressor presets remain bounded and disabled mode is transparent', () => {
  const { features } = loadFeatures();
  const compressor = new features.PlayerAudioCompressor();
  const parameters = Object.fromEntries(
    ['threshold', 'knee', 'ratio', 'attack', 'release'].map((key) => [key, { value: null }])
  );
  compressor.graph = { compressor: parameters };
  compressor.configure({ enabled: false, preset: 'unknown' });
  assert.equal(compressor.preset, 'balanced');
  assert.equal(parameters.ratio.value, 1);
  compressor.configure({ enabled: true, preset: 'strong' });
  assert.equal(parameters.threshold.value, -30);
  assert.equal(parameters.ratio.value, 8);
});

test('volume normalization clamps its target and applied correction', () => {
  const { features } = loadFeatures();
  const manager = new features.PlayerAudioCompressor();
  manager.configure({ enabled: false, normalizerEnabled: true, targetDb: -16 });
  assert.equal(manager.targetDb, -16);
  assert.equal(manager.calculateTargetGainDb(-4), -12);
  assert.equal(manager.calculateTargetGainDb(-30), 0);
  assert.equal(manager.calculateTargetGainDb(-52), 0);
  assert.equal(manager.calculateTargetGainDb(-92), null);
  const musicLikeSignal = new Float32Array([0.05, 0.05, 0.05, 0.8]);
  assert.ok(manager.calculateMeasuredLevelDb(musicLikeSignal) > -13);
  manager.configure({ enabled: false, normalizerEnabled: true, targetDb: -40 });
  assert.equal(manager.targetDb, -40);
});

test('chat mention colors and sounds use safe fallbacks', () => {
  const { features } = loadFeatures();
  const manager = new features.ChatMentionHighlighter();
  assert.equal(manager.sanitizeColor('#12AbEF'), '#12AbEF');
  assert.equal(manager.sanitizeColor('red'), '#9147ff');
  manager.soundId = 'unknown';
  manager.configure({ enabled: false, color: '#123456', soundId: 'unknown' });
  assert.equal(manager.soundId, 'soft');
});

test('chat mentions are rechecked when Twitch appends message fragments', () => {
  const { features } = loadFeatures();
  const manager = new features.ChatMentionHighlighter();
  manager.enabled = true;
  manager.login = 'florian_tv';
  let highlighted = false;
  const body = { textContent: 'Salut' };
  const message = {
    dataset: {},
    querySelector: (selector) => selector.includes('chat-message-mention') ? null : body,
    classList: { toggle: (_name, enabled) => { highlighted = enabled; } }
  };
  manager.processMessage(message, false);
  assert.equal(highlighted, false);
  assert.equal(message.dataset.tfrMentionChecked, 'florian_tv');

  body.textContent = 'Salut @Florian_TV !';
  manager.processMessage(message, false);
  assert.equal(highlighted, true);

  highlighted = false;
  manager.processMessage(message, false);
  assert.equal(highlighted, false, 'unchanged text is not processed twice');
});

test('chat mention sound is emitted only once for an incrementally built message', () => {
  const { features } = loadFeatures();
  const manager = new features.ChatMentionHighlighter();
  manager.enabled = true;
  manager.soundEnabled = true;
  manager.login = 'nks_floriozz';
  let plays = 0;
  manager.audio = { play: () => { plays += 1; } };
  const body = { textContent: 'test @nks_floriozz' };
  const message = {
    dataset: {},
    querySelector: (selector) => selector.includes('chat-message-mention') ? null : body,
    classList: { toggle() {} }
  };
  manager.processMessage(message, true);
  body.textContent += ' suite';
  manager.processMessage(message, true);
  assert.equal(plays, 1);
});

test('chat mentions use Twitch recipient markup when the account login is unavailable', () => {
  const { features } = loadFeatures();
  const manager = new features.ChatMentionHighlighter();
  manager.enabled = true;
  manager.soundEnabled = true;
  let highlighted = false;
  let plays = 0;
  manager.audio = { play: () => { plays += 1; } };
  const body = { textContent: '@nks_floriozz test' };
  const nativeMention = {};
  const message = {
    dataset: {},
    querySelector: (selector) => selector.includes('chat-message-mention') ? nativeMention : body,
    classList: { toggle: (_name, enabled) => { highlighted = enabled; } }
  };

  manager.processMessage(message, true);

  assert.equal(highlighted, true);
  assert.equal(plays, 1);
  assert.equal(message.dataset.tfrMentionChecked, 'twitch-current-user');
  assert.equal(message.dataset.tfrMentionNotified, 'twitch-current-user');
});

test('chat padding can be removed and restored independently', () => {
  const { features, classes, styles } = loadFeatures();
  const manager = new features.ChatPaddingManager();
  manager.configure({ enabled: true, paddingPx: 14 });
  assert.equal(classes.has('tfr-chat-no-padding'), true);
  assert.equal(styles.get('--tfr-chat-padding'), '14px');
  manager.configure({ enabled: false, paddingPx: 14 });
  assert.equal(classes.has('tfr-chat-no-padding'), false);
  assert.equal(styles.has('--tfr-chat-padding'), false);
});

test('chat padding CSS does not override Twitch scroll wrappers', () => {
  const css = fs.readFileSync(path.join(__dirname, '../styles/overlay.css'), 'utf8');
  const start = css.indexOf('.tfr-chat-no-padding');
  const paddingRules = css.slice(start, css.indexOf('.tfr-deleted-message-revealed', start));
  assert.match(paddingRules, /overflow-x:\s*clip\s*!important/);
  assert.match(paddingRules, /var\(--tfr-chat-padding,\s*0px\)/);
  assert.doesNotMatch(paddingRules, /simplebar-content-wrapper/);
  assert.doesNotMatch(paddingRules, /overflow-x:\s*hidden/);
});

test('reply expansion never reparents React-owned Twitch nodes', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/streamEnhancements.js'),
    'utf8'
  );
  const start = source.indexOf('class ReplyExpansionTracker');
  const replyTracker = source.slice(start, source.indexOf('\n    return {', start));
  assert.doesNotMatch(replyTracker, /while\s*\(replyContext\.firstChild\)/);
  assert.doesNotMatch(replyTracker, /replaceWith\(/);
  assert.match(replyTracker, /replyContext\.appendChild\(customReply\)/);
});

test('reply expansion display text does not pollute Twitch message text content', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/streamEnhancements.js'),
    'utf8'
  );
  const start = source.indexOf('class ReplyExpansionTracker');
  const replyTracker = source.slice(start, source.indexOf('\n    return {', start));
  assert.match(replyTracker, /author\.dataset\.tfrText\s*=/);
  assert.match(replyTracker, /message\.dataset\.tfrText\s*=/);
  assert.doesNotMatch(replyTracker, /tfr-custom-reply-label/);
  assert.doesNotMatch(replyTracker, /(?:author|message)\.textContent\s*=/);

  const css = fs.readFileSync(path.join(__dirname, '../styles/overlay.css'), 'utf8');
  assert.match(css, /\.tfr-custom-reply-message::before\s*\{\s*content:\s*attr\(data-tfr-text\)/);
  assert.doesNotMatch(css, /\.tfr-chat-full-replies\s+\[data-a-target\*?=[^\n]+reply-context/);
  assert.doesNotMatch(css, /\.tfr-chat-full-replies\s+\[class\*=[^\n]+reply/);
});

test('reply expansion preserves the bottom only when the viewer was already near it', () => {
  const { features } = loadFeatures();
  const tracker = new features.ReplyExpansionTracker();
  const nearBottom = {
    scrollHeight: 1000,
    clientHeight: 400,
    scrollTop: 570,
    isConnected: true
  };
  tracker.findScrollViewport = () => nearBottom;
  const state = tracker.captureBottomState();
  assert.equal(state.wasNearBottom, true);
  nearBottom.scrollTop = 400;
  assert.equal(nearBottom.scrollTop < state.scrollTop - 2, true, 'manual upward scrolling is detectable');

  nearBottom.scrollTop = 300;
  assert.equal(tracker.captureBottomState().wasNearBottom, false);
});

test('reply expansion schedules bottom restoration after its custom content is appended', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/streamEnhancements.js'),
    'utf8'
  );
  const start = source.indexOf('class ReplyExpansionTracker');
  const replyTracker = source.slice(start, source.indexOf('\n    return {', start));
  assert.match(replyTracker, /const bottomState = this\.captureBottomState\(\)/);
  assert.match(replyTracker, /replyContext\.appendChild\(customReply\);\s*this\.restoreBottomAfterLayout\(bottomState\)/);
  assert.match(replyTracker, /userDidNotScrollUp/);
});

test('chat observers share a single pending container retry', () => {
  const { features, getTimeoutCalls } = loadFeatures();
  const viewer = new features.DeletedMessageViewer();
  viewer.configure(true);
  viewer.configure(true);
  assert.equal(getTimeoutCalls(), 1);
  viewer.dispose();
});

test('deleted messages are restored inside their original body without a duplicate block', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/streamEnhancements.js'),
    'utf8'
  );
  const start = source.indexOf('class DeletedMessageViewer');
  const viewer = source.slice(start, source.indexOf('class RootClassToggle', start));
  assert.match(viewer, /deletedMessageView\.reveal/);
  assert.doesNotMatch(viewer, /message\.appendChild\(restored\)/);
  assert.doesNotMatch(viewer, /tfr-deleted-message-content/);

  const css = fs.readFileSync(path.join(__dirname, '../styles/overlay.css'), 'utf8');
  assert.match(css, /\.tfr-deleted-message-revealed/);
  assert.match(css, /\.tfr-deleted-message-restored/);
});

test('chat mutation traversal processes the same message only once', () => {
  const { features, ElementMock } = loadFeatures();
  const emotes = new features.ThirdPartyChatEmotes();
  const message = new ElementMock();
  message.matches = () => true;
  message.closest = () => message;
  message.querySelectorAll = () => [message];
  let visits = 0;
  emotes.renderMessage = () => { visits += 1; };
  emotes.scanNode(message);
  assert.equal(visits, 1);
});

test('chat font can be enabled, changed and fully removed', () => {
  const { features, classes, styles } = loadFeatures();
  const manager = new features.ChatFontManager();
  manager.configure({ enabled: true, font: 'verdana' });
  assert.equal(classes.has('tfr-chat-custom-font'), true);
  assert.match(styles.get('--tfr-chat-font-family'), /Verdana/);
  manager.dispose();
  assert.equal(classes.size, 0);
  assert.equal(styles.size, 0);
});

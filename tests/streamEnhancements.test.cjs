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
    TFRPerformance: null
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
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/streamEnhancements.js'), 'utf8'),
    context
  );
  const features = window.TFRStreamEnhancements.create({ t: (key) => key });
  return { features, activeIntervals, classes, styles, ElementMock, getTimeoutCalls: () => timeoutCalls };
};

test('player latency indicator starts and stops without leaving a timer behind', () => {
  const { features, activeIntervals } = loadFeatures();
  const indicator = new features.PlayerLatencyIndicator();

  indicator.configure(true);
  assert.equal(activeIntervals.size, 1);

  indicator.configure(false);
  assert.equal(activeIntervals.size, 0);
});

test('stream enhancement module exposes independent emote and player features', () => {
  const { features } = loadFeatures();
  assert.equal(typeof features.ThirdPartyChatEmotes, 'function');
  assert.equal(typeof features.PlayerLatencyIndicator, 'function');
  assert.equal(typeof features.ChatFontManager, 'function');
  assert.equal(typeof features.ChatPaddingManager, 'function');
  assert.equal(typeof features.ChatMentionHighlighter, 'function');
  assert.equal(typeof features.DeletedMessageViewer, 'function');
  assert.equal(typeof features.ReplyExpansionTracker, 'function');
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

test('chat mentions match the full Twitch login only once', () => {
  const { features } = loadFeatures();
  const manager = new features.ChatMentionHighlighter();
  manager.enabled = true;
  manager.login = 'florian_tv';
  let highlighted = false;
  const message = {
    dataset: {},
    querySelector: () => ({ textContent: 'Salut @Florian_TV !' }),
    classList: { toggle: (_name, enabled) => { highlighted = enabled; } }
  };
  manager.processMessage(message, false);
  assert.equal(highlighted, true);
  assert.equal(message.dataset.tfrMentionChecked, 'florian_tv');

  highlighted = false;
  manager.processMessage(message, false);
  assert.equal(highlighted, false);
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
  const paddingRules = css.slice(start, css.indexOf('.tfr-deleted-message-content', start));
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

test('chat observers share a single pending container retry', () => {
  const { features, getTimeoutCalls } = loadFeatures();
  const viewer = new features.DeletedMessageViewer();
  viewer.configure(true);
  viewer.configure(true);
  assert.equal(getTimeoutCalls(), 1);
  viewer.dispose();
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

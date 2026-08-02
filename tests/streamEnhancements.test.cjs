const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const loadFeatures = () => {
  let intervalId = 0;
  const activeIntervals = new Set();
  const window = {
    location: { pathname: '/directory' },
    setInterval: () => {
      intervalId += 1;
      activeIntervals.add(intervalId);
      return intervalId;
    },
    clearInterval: (id) => activeIntervals.delete(id),
    setTimeout: () => 1,
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
    Element: class {},
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
  return { features, activeIntervals, classes, styles };
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
  assert.equal(typeof features.DeletedMessageViewer, 'function');
  assert.equal(typeof features.FullReplyViewer, 'function');
  assert.equal(typeof features.ReplyExpansionTracker, 'function');
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

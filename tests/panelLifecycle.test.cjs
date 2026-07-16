const test = require('node:test');
const assert = require('node:assert/strict');

const { createPanelLifecycle } = require('../src/contentScripts/panelLifecycle.js');

const createHarness = ({ standalone = false } = {}) => {
  const calls = [];
  const listeners = {};
  const intervals = [];
  const timeouts = [];
  const root = {
    classList: {
      toggle(name, enabled) {
        calls.push(`class:${name}:${enabled}`);
      }
    },
    contains(target) {
      return target === 'inside';
    }
  };
  const lifecycle = createPanelLifecycle({
    documentRef: {
      addEventListener(type, handler) {
        listeners[type] = handler;
        calls.push(`add:${type}`);
      },
      removeEventListener(type) {
        delete listeners[type];
        calls.push(`remove:${type}`);
      }
    },
    standalone,
    refreshIntervalMs: 30_000,
    ensurePanel: () => calls.push('ensure'),
    getPanelRoot: () => root,
    refresh: (force) => calls.push(`refresh:${force}`),
    setIntervalFn: (callback, delay) => {
      const timer = { callback, delay };
      intervals.push(timer);
      return timer;
    },
    clearIntervalFn: (timer) => {
      timer.cleared = true;
    },
    setTimeoutFn: (callback, delay) => {
      timeouts.push({ callback, delay });
    }
  });
  return { lifecycle, calls, listeners, intervals, timeouts };
};

test('opening schedules immediate, forced and periodic refreshes', () => {
  const { lifecycle, calls, intervals, timeouts } = createHarness();
  lifecycle.setOpen(true);

  assert.equal(lifecycle.isOpen(), true);
  assert.equal(calls.includes('refresh:false'), true);
  assert.equal(intervals[0].delay, 30_000);
  assert.equal(timeouts[0].delay, 150);
  timeouts[0].callback();
  assert.equal(calls.includes('refresh:true'), true);
});

test('closing clears interval and pointer listener', () => {
  const { lifecycle, calls, intervals } = createHarness();
  lifecycle.setOpen(true);
  lifecycle.setOpen(false);

  assert.equal(lifecycle.isOpen(), false);
  assert.equal(intervals[0].cleared, true);
  assert.equal(calls.includes('remove:pointerdown'), true);
});

test('outside click closes overlay but inside click does not', () => {
  const { lifecycle, listeners } = createHarness();
  lifecycle.setOpen(true);
  listeners.pointerdown({ target: 'inside' });
  assert.equal(lifecycle.isOpen(), true);
  listeners.pointerdown({ target: 'outside' });
  assert.equal(lifecycle.isOpen(), false);
});

test('standalone panel remains open on outside click and forces periodic refresh', () => {
  const { lifecycle, listeners, intervals, calls } = createHarness({ standalone: true });
  lifecycle.setOpen(true);
  listeners.pointerdown({ target: 'outside' });
  intervals[0].callback();

  assert.equal(lifecycle.isOpen(), true);
  assert.equal(calls.filter((call) => call === 'refresh:true').length, 1);
});

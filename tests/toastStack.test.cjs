const test = require('node:test');
const assert = require('node:assert/strict');

const { createToastStackController } = require('../src/contentScripts/toastStack.js');

const createFakeElement = () => {
  const listeners = {};
  const element = {
    children: [],
    className: '',
    dataset: {},
    style: {},
    isConnected: true,
    appendChild(child) {
      this.children.push(child);
    },
    prepend(child) {
      this.children.unshift(child);
    },
    remove() {
      this.isConnected = false;
      if (this.parent) {
        this.parent.children = this.parent.children.filter((child) => child !== this);
      }
    },
    querySelector() {
      return {
        addEventListener(type, handler) {
          listeners[type] = handler;
        }
      };
    },
    clickClose() {
      listeners.click?.();
    }
  };
  Object.defineProperties(element, {
    childElementCount: { get: () => element.children.length },
    lastElementChild: { get: () => element.children.at(-1) || null },
    innerHTML: {
      set(value) {
        element.markup = value;
      }
    }
  });
  const originalPrepend = element.prepend;
  element.prepend = function (child) {
    child.parent = element;
    originalPrepend.call(element, child);
  };
  return element;
};

const createHarness = (maxVisible = 3) => {
  const timers = [];
  const dismissed = [];
  const host = createFakeElement();
  const controller = createToastStackController({
    documentRef: { createElement: createFakeElement },
    escapeHtml: (value) => String(value),
    formatNumber: String,
    defaultAvatar: 'default.png',
    maxVisible,
    schedule: (callback, delay) => timers.push({ callback, delay }),
    dismissEntry: (entry) => dismissed.push(entry)
  });
  return { controller, host, timers, dismissed };
};

const entry = (login) => ({
  login,
  notificationKey: `${login}:stream`,
  fav: { login, displayName: login },
  live: { login, displayName: login, viewers: 10 }
});

test('toast stack applies position and limits visible entries', () => {
  const { controller, host } = createHarness(2);
  controller.render([entry('one'), entry('two'), entry('three')], {
    host,
    durationMs: 5000,
    position: 'bottom-left'
  });

  assert.equal(controller.getStack().dataset.position, 'bottom-left');
  assert.equal(controller.getStack().childElementCount, 2);
});

test('manual close dismisses once and schedules removal', () => {
  const { controller, host, timers, dismissed } = createHarness();
  controller.render([entry('one')], { host, durationMs: 5000, position: 'top-right' });
  const toast = controller.getStack().children[0];

  toast.clickClose();
  toast.clickClose();

  assert.deepEqual(dismissed, [{ login: 'one', notificationKey: 'one:stream' }]);
  assert.equal(timers.some(({ delay }) => delay === 200), true);
});

test('expiration dismisses a connected toast', () => {
  const { controller, host, timers, dismissed } = createHarness();
  controller.render([entry('one')], { host, durationMs: 5000, position: 'top-right' });

  timers.find(({ delay }) => delay === 5000).callback();

  assert.deepEqual(dismissed, [{ login: 'one', notificationKey: 'one:stream' }]);
});

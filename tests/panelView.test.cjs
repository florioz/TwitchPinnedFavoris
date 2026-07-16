const test = require('node:test');
const assert = require('node:assert/strict');

const { createPanelView } = require('../src/contentScripts/panelView.js');

const createRootElement = () => {
  let clickHandler;
  const refs = {
    '.tfr-panel__sections': { type: 'sections' },
    '.tfr-panel__subtitle': { type: 'subtitle' },
    '.tfr-panel__empty': { type: 'empty' },
    '.tfr-panel__timestamp': { type: 'timestamp' }
  };
  return {
    className: '',
    classList: {
      values: [],
      add(value) {
        this.values.push(value);
      }
    },
    querySelector(selector) {
      return refs[selector];
    },
    addEventListener(type, handler) {
      if (type === 'click') clickHandler = handler;
    },
    dispatchClick(target) {
      clickHandler({ target });
    },
    set innerHTML(value) {
      this.markup = value;
    }
  };
};

const actionTarget = (action, extras = {}) => ({
  dataset: { action, ...extras },
  closest(selector) {
    return selector === '[data-action]' ? this : null;
  },
  matches() {
    return false;
  }
});

test('panel view creates the shell once and exposes references', () => {
  const root = createRootElement();
  const host = {
    children: [],
    appendChild(child) {
      this.children.push(child);
    }
  };
  const view = createPanelView({
    documentRef: { createElement: () => root },
    standalone: true,
    onRefresh() {},
    onClose() {},
    onToggleCategory() {},
    onOpenChannel() {}
  });

  const first = view.ensure(host);
  const second = view.ensure(host);
  assert.equal(first, second);
  assert.equal(host.children.length, 1);
  assert.equal(root.classList.values.includes('tfr-panel--standalone'), true);
  assert.equal(first.empty.type, 'empty');
});

test('panel view routes button and category actions', () => {
  const calls = [];
  const root = createRootElement();
  const view = createPanelView({
    documentRef: { createElement: () => root },
    onRefresh: () => calls.push('refresh'),
    onClose: () => calls.push('close'),
    onToggleCategory: (id) => calls.push(`toggle:${id}`),
    onOpenChannel: (login) => calls.push(`open:${login}`)
  });
  view.ensure({ appendChild() {} });

  root.dispatchClick(actionTarget('refresh'));
  root.dispatchClick(actionTarget('close'));
  root.dispatchClick(actionTarget('toggleCategory', { categoryId: 'games' }));

  assert.deepEqual(calls, ['refresh', 'close', 'toggle:games']);
});

test('panel view routes streamer card clicks', () => {
  let opened;
  const root = createRootElement();
  const card = { dataset: { login: 'streamer' } };
  const target = {
    closest(selector) {
      if (selector === '[data-action]') return null;
      if (selector === '.tfr-panel__card') return card;
      return null;
    },
    matches(selector) {
      return selector === '.tfr-panel__card, .tfr-panel__card *';
    }
  };
  const view = createPanelView({
    documentRef: { createElement: () => root },
    onRefresh() {},
    onClose() {},
    onToggleCategory() {},
    onOpenChannel: (login) => {
      opened = login;
    }
  });
  view.ensure({ appendChild() {} });
  root.dispatchClick(target);
  assert.equal(opened, 'streamer');
});

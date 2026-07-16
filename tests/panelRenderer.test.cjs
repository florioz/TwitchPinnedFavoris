const test = require('node:test');
const assert = require('node:assert/strict');

const { createPanelRenderer } = require('../src/contentScripts/panelRenderer.js');

const createElement = (tagName) => {
  const classes = new Set();
  const element = {
    tagName,
    children: [],
    dataset: {},
    className: '',
    classList: {
      add(value) {
        classes.add(value);
      },
      contains(value) {
        return classes.has(value);
      }
    },
    appendChild(child) {
      this.children.push(child);
    }
  };
  Object.defineProperty(element, 'innerHTML', {
    set(value) {
      element.markup = value;
    }
  });
  Object.defineProperty(element, 'textContent', {
    set(value) {
      if (value === '') element.children = [];
    }
  });
  return element;
};

const createRenderer = () => createPanelRenderer({
  documentRef: { createElement },
  escapeHtml: (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;'),
  formatNumber: (value) => `#${value}`,
  defaultAvatar: 'default.png',
  t: (key, params = {}) => ({
    'panel.viewers': `${params.count} spectateurs`,
    'panel.uncategorized': 'Sans catégorie',
    'panel.unknownCategory': 'Catégorie inconnue',
    'panel.untitled': 'Live sans titre'
  })[key] || key
});

test('renderer creates collapsed groups and streamer cards', () => {
  const container = createElement('div');
  createRenderer().renderGroups(container, [{
    category: { id: 'games', name: 'Games' },
    collapsed: true,
    favorites: [{
      fav: { login: 'streamer', displayName: 'Streamer' },
      live: { viewers: 42, game: 'Game', title: 'Live title' }
    }]
  }]);

  const section = container.children[0];
  assert.equal(section.className, 'tfr-panel__group');
  assert.equal(section.classList.contains('tfr-panel__group--collapsed'), true);
  assert.match(section.children[0].markup, /data-category-id="games"/);
  assert.equal(section.children[1].children[0].dataset.login, 'streamer');
  assert.match(section.children[1].children[0].markup, /#42 spectateurs/);
});

test('renderer escapes category and streamer content', () => {
  const container = createElement('div');
  createRenderer().renderGroups(container, [{
    category: { id: 'unsafe', name: '<Category>' },
    favorites: [{
      fav: { login: 'unsafe', displayName: '<Streamer>' },
      live: { viewers: 1, title: '<Title>' }
    }]
  }]);

  assert.match(container.children[0].children[0].markup, /&lt;Category&gt;/);
  assert.match(container.children[0].children[1].children[0].markup, /&lt;Streamer&gt;/);
  assert.match(container.children[0].children[1].children[0].markup, /&lt;Title&gt;/);
});

test('renderer clears previous groups before drawing', () => {
  const container = createElement('div');
  container.children.push(createElement('old'));
  createRenderer().renderGroups(container, []);
  assert.equal(container.children.length, 0);
});

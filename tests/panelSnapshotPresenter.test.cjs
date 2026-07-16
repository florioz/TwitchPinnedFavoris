const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPanelSnapshotPresenter,
  getPanelSummary,
  syncCategoryCollapse
} = require('../src/contentScripts/panelSnapshotPresenter.js');

const t = (key, params = {}) => ({
  'panel.empty.saved': 'Aucun favori enregistré.',
  'panel.empty.savedHint': 'Ajoutez des favoris depuis Twitch.',
  'panel.empty.live': 'Aucun favori en live pour le moment.',
  'panel.empty.liveHint': 'Tout est calme.',
  'panel.liveCount': `${params.count} favori(s) en live.`
})[key] || key;

test('category collapse state adds new categories and removes deleted ones', () => {
  const collapse = new Map([['deleted', true]]);
  syncCategoryCollapse(collapse, [
    { id: 'games', collapsed: true },
    { id: 'music', collapsed: false }
  ]);

  assert.deepEqual(Array.from(collapse.entries()), [
    ['games', true],
    ['music', false],
    ['uncategorized', false]
  ]);
});

test('panel summary covers no favorites, no lives and active lives', () => {
  assert.equal(getPanelSummary(0, 0, t).subtitle, 'Ajoutez des favoris depuis Twitch.');
  assert.equal(getPanelSummary(3, 0, t).subtitle, 'Tout est calme.');
  assert.deepEqual(getPanelSummary(3, 2, t), {
    empty: false,
    emptyText: '',
    subtitle: '2 favori(s) en live.'
  });
});

test('presenter applies preferences, summary, groups and timestamp', () => {
  const renderedGroups = [];
  const positions = [];
  const elements = {
    empty: {
      textContent: '',
      classList: {
        toggle(name, enabled) {
          this.value = `${name}:${enabled}`;
        }
      }
    },
    subtitle: { textContent: '' },
    sections: {},
    timestamp: { textContent: '' }
  };
  const presenter = createPanelSnapshotPresenter({
    ensurePanel() {},
    getPanelElements: () => elements,
    normalizeToastPreferences: (preferences) => ({
      enabled: preferences.toastEnabled !== false,
      position: preferences.toastPosition || 'top-right'
    }),
    defaultToastDurationMs: 5000,
    buildCategoryGroups: () => ({
      groups: [{ category: { id: 'games' }, favorites: [] }],
      totalFavorites: 2,
      totalLive: 1
    }),
    renderGroups: (_container, groups) => renderedGroups.push(groups),
    formatTimestamp: (timestamp) => `time:${timestamp}`,
    applyToastPosition: (position) => positions.push(position),
    t
  });

  presenter.render({
    favorites: { one: {}, two: {} },
    liveData: { one: { isLive: true } },
    categories: [],
    preferences: { toastPosition: 'bottom-left' },
    timestamp: 123
  });

  assert.equal(elements.subtitle.textContent, '1 favori(s) en live.');
  assert.equal(elements.empty.classList.value, 'tfr-hidden:true');
  assert.equal(elements.timestamp.textContent, 'time:123');
  assert.equal(renderedGroups.length, 1);
  assert.deepEqual(positions, ['bottom-left']);
  assert.equal(presenter.getToastPreferences().position, 'bottom-left');
});

test('toggling a category rerenders the current snapshot', () => {
  let renders = 0;
  const presenter = createPanelSnapshotPresenter({
    ensurePanel() {},
    getPanelElements: () => ({
      empty: { classList: { toggle() {} } },
      subtitle: {},
      sections: {},
      timestamp: {}
    }),
    normalizeToastPreferences: () => ({ position: 'top-right' }),
    defaultToastDurationMs: 5000,
    buildCategoryGroups: ({ categoryCollapse }) => {
      renders += 1;
      return {
        groups: [],
        totalFavorites: 0,
        totalLive: 0,
        collapsed: categoryCollapse.get('games')
      };
    },
    renderGroups() {},
    formatTimestamp: () => '',
    applyToastPosition() {}
  });
  presenter.render({ categories: [{ id: 'games', collapsed: false }] });
  assert.equal(presenter.toggleCategory('games'), true);
  assert.equal(renders, 2);
});

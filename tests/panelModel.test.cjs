const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCategoryGroups,
  buildCategoryOrder,
  escapeHtml,
  shouldDisplayFavorite
} = require('../src/contentScripts/panelModel.js');

test('panel HTML escaping protects generated card markup', () => {
  assert.equal(escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
});

test('panel category filter is accent-insensitive', () => {
  const favorite = {
    categoryFilter: { enabled: true, categories: ['Pokémon'] }
  };
  assert.equal(shouldDisplayFavorite(favorite, { isLive: true, game: 'Pokemon' }), true);
  assert.equal(shouldDisplayFavorite(favorite, { isLive: false, game: 'Pokemon' }), false);
});

test('nested categories are flattened in sort order with depth', () => {
  const result = buildCategoryOrder([
    { id: 'child', name: 'Child', parentId: 'parent', sortOrder: 1 },
    { id: 'parent', name: 'Parent', sortOrder: 2 },
    { id: 'last', name: 'Last', sortOrder: 3 }
  ]);

  assert.deepEqual(
    result.map(({ id, depth }) => ({ id, depth })),
    [
      { id: 'parent', depth: 0 },
      { id: 'child', depth: 1 },
      { id: 'last', depth: 0 }
    ]
  );
});

test('panel groups live favorites by first category and sorts viewers', () => {
  const result = buildCategoryGroups({
    favorites: {
      alpha: { login: 'alpha', categories: ['games'] },
      beta: { login: 'beta', categories: ['games'] },
      free: { login: 'free', categories: [] },
      offline: { login: 'offline', categories: ['games'] }
    },
    liveData: {
      alpha: { isLive: true, viewers: 10, displayName: 'Alpha' },
      beta: { isLive: true, viewers: 20, displayName: 'Beta' },
      free: { isLive: true, viewers: 5, displayName: 'Free' },
      offline: { isLive: false }
    },
    categories: [{ id: 'games', name: 'Games', sortOrder: 1 }],
    categoryCollapse: new Map([['games', true]])
  });

  assert.equal(result.totalLive, 3);
  assert.equal(result.totalFavorites, 4);
  assert.equal(result.groups[0].collapsed, true);
  assert.deepEqual(result.groups[0].favorites.map(({ fav }) => fav.login), ['beta', 'alpha']);
  assert.equal(result.groups[1].category.id, 'uncategorized');
});

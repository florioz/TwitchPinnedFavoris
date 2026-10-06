const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sanitizeCategoryList } = require('../src/contentScripts/features/favoriteVisibilityTools.js');

test('group filter mutation saves one rule without overwriting member filters', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/favoritesStore.js'), 'utf8');
  const method = source.slice(source.indexOf('    async setGroupCategoryFilter('), source.indexOf('    async toggleCategoryAssignment('));
  const Store = vm.runInNewContext(`(class { ${method} })`, { sanitizeCategoryList });
  const store = new Store();
  const draft = { categories: [{ id: 'rp' }], favorites: {
    a: { categories: ['rp'], filterMatchSince: 100, categoryFilter: { enabled: true, categories: ['Minecraft'] } },
    b: { categories: ['other'], filterMatchSince: 200 }
  } };
  store.updateState = async fn => fn(draft);
  await store.setGroupCategoryFilter('rp', { enabled: true, categories: [' GTA ', 'gta', ''] });
  assert.deepEqual(Array.from(draft.categories[0].categoryFilter.categories), ['GTA']);
  assert.equal(draft.categories[0].categoryFilter.enabled, true);
  assert.equal(draft.favorites.a.filterMatchSince, 0);
  assert.equal(draft.favorites.b.filterMatchSince, 200);
  assert.deepEqual(draft.favorites.a.categoryFilter.categories, ['Minecraft']);
  await store.setGroupCategoryFilter('rp', { enabled: false });
  assert.equal(draft.categories[0].categoryFilter.enabled, false);
  assert.deepEqual(Array.from(draft.categories[0].categoryFilter.categories), ['GTA']);
});

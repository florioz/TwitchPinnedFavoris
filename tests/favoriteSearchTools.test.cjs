const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/favoriteSearchTools.js'),
  'utf8'
), context);
const tools = context.window.TFRFavoriteSearchTools;

test('favorite search is empty without a useful term', () => {
  assert.deepEqual(Array.from(tools.getSuggestions({ favorites: {} }, '  ')), []);
});

test('favorite search prioritizes prefixes, includes logins and respects its limit', () => {
  const results = tools.getSuggestions({
    categories: [{ id: 'group', name: 'Group' }],
    favorites: {
      first: { login: 'alpha_login', displayName: 'Alpha', categories: ['group'] },
      second: { login: 'contains_alpha', displayName: 'Beta', categories: [] },
      third: { login: 'alpha_other', displayName: 'Gamma', categories: [] }
    }
  }, 'alpha', 2);

  assert.deepEqual(JSON.parse(JSON.stringify(results.map(({ login, category }) => ({ login, category })))), [
    { login: 'alpha_login', category: 'Group' },
    { login: 'alpha_other', category: '' }
  ]);
});

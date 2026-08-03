const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/categoryMutationTools.js'), 'utf8'), { window });
const tools = window.TFRCategoryMutationTools;

test('category mutation tools sort and swap only siblings', () => {
  const categories = [
    { id: 'b', parentId: null, sortOrder: 2, name: 'B' },
    { id: 'a', parentId: null, sortOrder: 1, name: 'A' },
    { id: 'child', parentId: 'a', sortOrder: 1, name: 'Child' }
  ];
  assert.equal(tools.swapSibling(categories, 'b', -1), true);
  assert.equal(categories.find((item) => item.id === 'b').sortOrder, 1);
  assert.deepEqual(Array.from(tools.siblingsOf(categories, null), (item) => item.id), ['b', 'a']);
});

test('category mutation tools detect descendants without looping on corrupt trees', () => {
  const categories = [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }];
  assert.equal(tools.isDescendant(categories, 'b', 'a'), true);
  assert.equal(tools.isDescendant(categories, 'missing', 'a'), false);
});

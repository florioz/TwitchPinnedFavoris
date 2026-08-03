const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/categoryTreeTools.js'),
  'utf8'
), context);
const { build, flatten } = context.window.TFRCategoryTreeTools;

test('category tree tools attach children and sort every level', () => {
  const tree = build([
    { id: 'second', name: 'Second', sortOrder: 2 },
    { id: 'child-b', name: 'B', sortOrder: 2, parentId: 'first' },
    { id: 'first', name: 'First', sortOrder: 1 },
    { id: 'child-a', name: 'A', sortOrder: 1, parentId: 'first' }
  ], (color) => color || '');
  assert.equal(tree[0].id, 'first');
  assert.deepEqual(Array.from(tree[0].children, (item) => item.id), ['child-a', 'child-b']);
  assert.equal(tree[1].id, 'second');
});

test('category tree tools promote missing and self parents to roots', () => {
  const tree = build([
    { id: 'missing', name: 'Missing', parentId: 'unknown' },
    { id: 'self', name: 'Self', parentId: 'self' }
  ]);
  assert.equal(tree.length, 2);
  assert.ok(tree.every((item) => item.parentId === null));
});

test('category tree tools flatten nested nodes in display order with their depth', () => {
  const tree = [
    {
      id: 'root',
      name: 'Racine',
      children: [
        { id: 'child', name: 'Enfant', children: [] },
        { id: 'branch', name: 'Branche', children: [{ id: 'leaf', name: 'Feuille' }] }
      ]
    },
    { id: 'second', name: 'Seconde' }
  ];

  assert.deepEqual(JSON.parse(JSON.stringify(flatten(tree))), [
    { id: 'root', name: 'Racine', depth: 0 },
    { id: 'child', name: 'Enfant', depth: 1 },
    { id: 'branch', name: 'Branche', depth: 1 },
    { id: 'leaf', name: 'Feuille', depth: 2 },
    { id: 'second', name: 'Seconde', depth: 0 }
  ]);
});

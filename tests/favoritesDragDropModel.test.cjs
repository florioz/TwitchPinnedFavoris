const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/favoritesDragDropModel.js'),
  'utf8'
), context);
const model = context.window.TFRFavoritesDragDropModel;
const transfer = (values) => ({ getData: (type) => values[type] || '' });

test('favorite drag payload prefers JSON and normalizes duplicate logins', () => {
  const result = model.parseLogins(transfer({
    'application/json': JSON.stringify({ logins: [' Foo ', 'foo', 'BAR'] }),
    'text/plain': 'ignored'
  }));
  assert.deepEqual(Array.from(result), ['foo', 'bar']);
});

test('favorite drag payload falls back to text and in-memory values', () => {
  assert.deepEqual(Array.from(model.parseLogins(transfer({ 'text/plain': 'One, Two' }))), ['one', 'two']);
  assert.deepEqual(Array.from(model.parseLogins(transfer({}), ['Fallback'])), ['fallback']);
});

test('category payloads cannot be confused with favorite payloads', () => {
  assert.equal(model.parseCategoryId(transfer({
    'application/json': JSON.stringify({ categoryId: ' group-1 ' })
  })), 'group-1');
  assert.equal(model.parseCategoryId(transfer({
    'application/json': JSON.stringify({ logins: ['user'] })
  }), 'fallback'), null);
});

test('category placement distinguishes nesting and vertical insertion zones', () => {
  const base = {
    isCategoryTarget: true,
    depth: 1,
    clientX: 100,
    dragStartX: 100,
    elementLeft: 40,
    headerTop: 20,
    headerHeight: 100
  };
  assert.equal(model.getCategoryPlacement({ ...base, clientX: 70, dragStartX: 0 }), 'root');
  assert.equal(model.getCategoryPlacement({ ...base, clientX: 50, dragStartX: 100 }), 'out');
  assert.equal(model.getCategoryPlacement({ ...base, clientY: 30 }), 'before');
  assert.equal(model.getCategoryPlacement({ ...base, clientY: 110 }), 'after');
  assert.equal(model.getCategoryPlacement({ ...base, clientY: 70 }), 'inside');
});

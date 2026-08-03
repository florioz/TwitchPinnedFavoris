const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const createClassList = () => {
  const values = new Set();
  return { add: (value) => values.add(value), remove: (value) => values.delete(value), has: (value) => values.has(value) };
};

test('deleted message view reveals content once in the original body and clears it', () => {
  let restored = null;
  const document = { createElement: () => ({ setAttribute(name, value) { this[name] = value; }, remove() { restored = null; } }) };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/deletedMessageView.js'), 'utf8'), { window, document });
  const classes = createClassList();
  const message = { classList: classes, querySelector: () => restored };
  const body = { appendChild: (node) => { restored = node; } };
  const view = window.TFRDeletedMessageView.create(document);
  assert.equal(view.reveal({ message, body, text: 'message original', label: 'supprime' }), true);
  assert.equal(restored.textContent, 'message original');
  assert.equal(classes.has(view.REVEALED_CLASS), true);
  assert.equal(view.reveal({ message, body, text: 'doublon' }), false);
  view.clear(message);
  assert.equal(restored, null);
  assert.equal(classes.has(view.REVEALED_CLASS), false);
});

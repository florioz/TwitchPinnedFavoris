const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const createClassList = () => {
  const values = new Set();
  let removeCalls = 0;
  return {
    add: (value) => values.add(value),
    remove: (value) => { removeCalls += 1; values.delete(value); },
    contains: (value) => values.has(value),
    has: (value) => values.has(value),
    getRemoveCalls: () => removeCalls
  };
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
  assert.equal(classes.getRemoveCalls(), 1);
  view.clear(message);
  assert.equal(classes.getRemoveCalls(), 1);
});

test('deleted message view restores cloned message nodes when available', () => {
  let restored;
  const appended = [];
  const document = {
    createElement: () => ({
      appendChild: (node) => appended.push(node),
      setAttribute() {}
    })
  };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/deletedMessageView.js'), 'utf8'), { window, document });
  const message = { classList: createClassList(), querySelector: () => restored };
  const body = { appendChild: (node) => { restored = node; } };
  const sourceNode = { cloneNode: (deep) => ({ cloned: deep }) };
  const view = window.TFRDeletedMessageView.create(document);
  assert.equal(view.reveal({ message, body, text: 'fallback', nodes: [sourceNode] }), true);
  assert.deepEqual(appended, [{ cloned: true }]);
  assert.equal(restored.textContent, undefined);
});

test('deleted message view hides and restores Twitch native deletion markers', () => {
  const markerClasses = createClassList();
  const marker = { classList: markerClasses };
  let restored = null;
  const document = {
    createElement: () => ({ setAttribute() {}, remove() { restored = null; } })
  };
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/deletedMessageView.js'), 'utf8'),
    { window, document }
  );
  let removedLabel = false;
  const labeledBody = { removeAttribute: () => { removedLabel = true; } };
  const message = {
    dataset: { tfrDeletedLabel: 'Supprimé' },
    classList: createClassList(),
    querySelector: (selector) => selector.includes('tfr-deleted-message-restored') ? restored : null,
    querySelectorAll: (selector) => selector === '[data-tfr-deleted-label]'
      ? [labeledBody]
      : selector.includes('deleted-message') ? [marker] : []
  };
  const body = { appendChild: (node) => { restored = node; } };
  const view = window.TFRDeletedMessageView.create(document);

  assert.equal(view.reveal({ message, body, text: 'contenu original' }), true);
  assert.equal(markerClasses.has(view.NATIVE_MARKER_CLASS), true);
  view.clear(message);
  assert.equal(markerClasses.has(view.NATIVE_MARKER_CLASS), false);
  assert.equal(removedLabel, true);
  assert.equal(message.dataset.tfrDeletedLabel, undefined);
});

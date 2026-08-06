const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationPanelGeometry.js'),
  'utf8'
), context);
const geometry = context.window.TFRModerationPanelGeometry;

test('moderation panel geometry keeps positions inside the viewport', () => {
  assert.deepEqual(
    { ...geometry.clamp({ left: 900, top: -20 }, { width: 300, height: 200 }, { width: 1000, height: 700 }) },
    { left: 692, top: 8 }
  );
});

test('moderation panel geometry places the panel above or below its button', () => {
  const above = geometry.anchored(
    { top: 500, bottom: 532, right: 900 },
    { width: 380, height: 300 },
    { width: 1000, height: 700 }
  );
  assert.deepEqual({ ...above }, { left: 520, top: 192 });
  const below = geometry.anchored(
    { top: 20, bottom: 52, right: 900 },
    { width: 380, height: 300 },
    { width: 1000, height: 700 }
  );
  assert.equal(below.top, 60);
});

test('moderation panel geometry calculates dragging and responsive height', () => {
  assert.deepEqual(
    { ...geometry.dragged({ left: 20, top: 30, startX: 10, startY: 10 }, { x: 25, y: 35 }) },
    { left: 35, top: 55 }
  );
  assert.equal(geometry.maxHeight(800), 620);
});

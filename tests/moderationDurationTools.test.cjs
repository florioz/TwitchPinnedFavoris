const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function loadTools() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/moderationDurationTools.js'), 'utf8'), { window });
  return window.TFRModerationDurationTools;
}

test('parses common moderation durations', () => {
  const tools = loadTools();
  assert.equal(tools.parse('PT1H2M3S'), 3723);
  assert.equal(tools.parse('01:30'), 90);
  assert.equal(tools.fromText('pendant 2 minutes'), 120);
  assert.equal(tools.convert(2, 'heures'), 7200);
});

test('finds timeout durations and the first valid candidate', () => {
  const tools = loadTools();
  assert.equal(tools.timeoutFromText('timeout pendant 30 secondes'), 30);
  assert.equal(tools.first([null, { value: 2500, unit: 'ms' }, 8]), 3);
  assert.equal(tools.first(['', 'invalid']), null);
});

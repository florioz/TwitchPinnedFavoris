const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/colorTools.js'),
  'utf8'
), context);
const colors = context.window.TFRColorTools;

test('color tools parse strict hexadecimal colors', () => {
  assert.deepEqual({ ...colors.hexToRgb('#9147ff') }, { r: 145, g: 71, b: 255 });
  assert.equal(colors.hexToRgb('#fff'), null);
  assert.equal(colors.hexToRgb('invalid'), null);
});

test('color tools convert and clamp HSV values', () => {
  assert.equal(colors.hsvToHex(0, 1, 1), '#ff0000');
  assert.equal(colors.hsvToHex(120, 1, 1), '#00ff00');
  assert.equal(colors.hsvToHex(360, 2, 2), '#ff0000');
});

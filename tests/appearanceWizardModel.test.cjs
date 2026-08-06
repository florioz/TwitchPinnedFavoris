const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/appearanceWizardModel.js'),
  'utf8'
), context);

const calls = [];
const store = {
  sanitizeCategoryColorStyle: (value) => value,
  sanitizeStreamerItemStyle: (value) => value,
  sanitizeSidebarSurfaceStyle: (value) => value,
  setCategoryColorStyle: (value) => calls.push(['category', value]),
  setStreamerItemStyle: (value) => calls.push(['streamer', value]),
  setSidebarSurfaceStyle: (value) => calls.push(['surface', value])
};
const model = context.window.TFRAppearanceWizardModel.create({
  t: (key) => key,
  store
});

test('appearance wizard exposes the three ordered steps and persisted values', () => {
  const steps = model.createSteps({
    categoryColorStyle: 'rail',
    streamerItemStyle: 'minimal',
    sidebarSurfaceStyle: 'canvas'
  });
  assert.deepEqual(Array.from(steps, (step) => step.kind), ['category', 'streamer', 'surface']);
  assert.deepEqual(Array.from(steps, (step) => step.value), ['rail', 'minimal', 'canvas']);
  steps[1].apply('compact');
  assert.deepEqual(calls.pop(), ['streamer', 'compact']);
});

test('appearance families contain each supported style exactly once', () => {
  for (const kind of ['category', 'streamer', 'surface']) {
    const values = model.getValues(kind);
    const grouped = model.createFamilies(kind, values).flatMap((family) => Array.from(family.values));
    assert.deepEqual([...grouped].sort(), [...values].sort());
    assert.equal(new Set(grouped).size, values.length);
  }
});

test('appearance wizard navigation is bounded and wraps only after the final step', () => {
  assert.equal(model.clampStep(-4, 3), 0);
  assert.equal(model.clampStep(9, 3), 2);
  assert.equal(model.nextStep(0, 3), 1);
  assert.equal(model.nextStep(2, 3), 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../panel/vods.js'), 'utf8');
const extract = (from, to) => source.slice(source.indexOf(`  function ${from}(`), source.indexOf(`  function ${to}(`));

test('switching VOD views renders only the active view, clears selection and retains filters', () => {
  const calls = [];
  const element = () => ({ setAttribute(key, value) { this[key] = value; } });
  const label = {};
  const elements = { chronologyBoard: element(), planningBoard: element(), chronologyViewButton: element(),
    planningViewButton: element(), timelineFullDay: { closest: () => label }, emptyState: {}, vodInspector: {} };
  const state = { view: 'planning', periodDays: 60, selectedVideo: { videoId: '1' }, searchTerm: 'demo', selectedDay: 42 };
  const ctx = vm.createContext({ state, elements, getVisibleRows: () => [{ videos: [] }],
    renderPlanning: () => calls.push('planning'), renderChronology: () => calls.push('chronology'), renderSummary() {} });
  vm.runInContext(extract('renderViewControls', 'renderChronology') + extract('renderViews', 'buildClipSegments'), ctx);
  ctx.renderViews();
  assert.deepEqual(calls, ['planning']);
  assert.equal(elements.chronologyBoard.hidden, true);
  assert.equal(elements.planningViewButton['aria-pressed'], 'true');
  ctx.setView('chronology');
  assert.deepEqual(calls, ['planning', 'chronology']);
  assert.equal(state.selectedVideo, null);
  assert.equal(elements.vodInspector.hidden, true);
  assert.equal(elements.planningBoard.hidden, true);
  assert.equal(elements.chronologyViewButton['aria-pressed'], 'true');
  assert.equal(state.periodDays, 60);
  assert.equal(state.searchTerm, 'demo');
  assert.equal(state.selectedDay, 42);
  ctx.setView('chronology'); ctx.setView('invalid');
  assert.equal(calls.length, 2);
  ctx.setView('planning');
  assert.deepEqual(calls, ['planning', 'chronology', 'planning']);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const debugCalls = [];
let currentTime = 100;
const context = vm.createContext({
  window: {},
  performance: { now: () => currentTime },
  console: { debug: (...args) => debugCalls.push(args) }
});
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/performanceMonitor.js'),
  'utf8'
), context);
const monitor = context.window.TFRPerformance;

test('performance monitor ignores ordinary frames and stores long tasks silently', () => {
  currentTime = 120;
  monitor.report('short', 100);
  assert.equal(monitor.getReports().length, 0);

  currentTime = 180;
  monitor.report('long', 100, { mutations: 4 });
  assert.equal(monitor.getReports().length, 1);
  assert.equal(monitor.getReports()[0].label, 'long');
  assert.equal(debugCalls.length, 0);
});

test('performance logging is explicit and never uses warning output', () => {
  monitor.setLoggingEnabled(true);
  currentTime = 260;
  monitor.report('diagnostic', 200);
  assert.equal(debugCalls.length, 1);
  monitor.clearReports();
  assert.equal(monitor.getReports().length, 0);
});

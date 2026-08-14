const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, document: {}, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/playerRecoveryPolicy.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/playerRecovery.js'), 'utf8'), context);
const PlayerRecovery = context.window.TFRPlayerRecovery.PlayerRecovery;

test('player recovery reloads only the video when no Twitch retry button exists', () => {
  let loads = 0; let plays = 0;
  const video = { paused: false, load: () => { loads += 1; }, play: () => { plays += 1; return Promise.resolve(); } };
  const recovery = new PlayerRecovery({ documentRef: { querySelector: () => null }, now: () => 10000 });
  recovery.configure(true); recovery.video = video;
  assert.equal(recovery.recover(), true);
  assert.equal(loads, 1);
  assert.equal(plays, 1);
});

test('player recovery uses Twitch retry and rate-limits repeated errors', () => {
  let clicks = 0; let timestamp = 10000;
  const retry = { click: () => { clicks += 1; } };
  const recovery = new PlayerRecovery({
    documentRef: { querySelector: (selector) => selector.includes('retry') ? retry : null },
    now: () => timestamp,
    cooldownMs: 8000
  });
  recovery.configure(true);
  assert.equal(recovery.recover(), true);
  timestamp += 1000;
  assert.equal(recovery.recover(), false);
  assert.equal(clicks, 1);
});

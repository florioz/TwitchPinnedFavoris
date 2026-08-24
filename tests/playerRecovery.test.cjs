const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, document: {}, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/playerRecoveryPolicy.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/playerRecovery.js'), 'utf8'), context);
const PlayerRecovery = context.window.TFRPlayerRecovery.PlayerRecovery;

test('automatic player recovery retries playback without reloading its MediaSource', async () => {
  let loads = 0; let pauses = 0; let plays = 0;
  const video = {
    paused: false,
    duration: Infinity,
    currentTime: 120,
    seekable: { length: 1, start: () => 100, end: () => 125 },
    load: () => { loads += 1; },
    pause: () => { pauses += 1; },
    play: () => { plays += 1; return Promise.resolve(); }
  };
  const recovery = new PlayerRecovery({ documentRef: { querySelector: () => null }, now: () => 10000 });
  recovery.configure(true); recovery.video = video;
  recovery.resetThroughQualityMenu = async () => false;
  assert.equal(recovery.recover(), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(loads, 0);
  assert.equal(pauses, 1);
  assert.equal(plays, 1);
  assert.equal(video.currentTime, 120);
});

test('automatic recovery recognizes a Twitch error code rendered inside the player', () => {
  let retries = 0;
  const retry = {
    textContent: 'Recharger le lecteur',
    getAttribute: () => '',
    click: () => { retries += 1; }
  };
  const player = {
    textContent: 'Une erreur est survenue. Erreur #3000',
    querySelectorAll: () => [retry]
  };
  const recovery = new PlayerRecovery({
    documentRef: {
      querySelector: (selector) => selector.includes(' video') ? null : (
        selector.startsWith('[data-a-target="video-player"],') ? player : null
      )
    },
    now: () => 10000
  });
  recovery.enabled = true;
  recovery.inspect();
  assert.equal(retries, 1);
});

test('automatic recovery recognizes a blocking player error without an error code', () => {
  let retries = 0;
  const retry = {
    textContent: 'Réessayer',
    getAttribute: () => '',
    click: () => { retries += 1; }
  };
  const player = {
    textContent: 'Une erreur est survenue pendant la lecture',
    querySelector: () => null,
    querySelectorAll: () => [retry]
  };
  const recovery = new PlayerRecovery({
    documentRef: {
      querySelector: (selector) => selector.includes(' video') ? null : (
        selector.startsWith('[data-a-target="video-player"],') ? player : null
      )
    },
    now: () => 10000
  });
  recovery.enabled = true;
  recovery.inspect();
  assert.equal(retries, 1);
});

test('automatic recovery recognizes the native media error state', async () => {
  let resets = 0;
  const video = {
    error: { code: 3 },
    paused: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    play: () => Promise.resolve()
  };
  const recovery = new PlayerRecovery({
    documentRef: { querySelector: (selector) => selector.includes(' video') ? video : null },
    now: () => 10000
  });
  recovery.enabled = true;
  recovery.resetThroughQualityMenu = async () => { resets += 1; return true; };
  recovery.inspect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resets, 1);
});

test('automatic recovery falls back to a quality reset when no retry button exists', async () => {
  let resets = 0;
  const video = {
    paused: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    play: () => Promise.resolve()
  };
  const recovery = new PlayerRecovery({
    documentRef: { querySelector: (selector) => selector.includes(' video') ? video : null },
    now: () => 10000
  });
  recovery.configure(true);
  recovery.resetThroughQualityMenu = async () => { resets += 1; return true; };
  assert.equal(recovery.recover(), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resets, 1);
});

test('automatic recovery waits when Twitch has not mounted its retry controls yet', () => {
  const recovery = new PlayerRecovery({
    documentRef: { querySelector: () => null },
    now: () => 10000
  });
  recovery.enabled = true;
  assert.equal(recovery.recover(), false);
  assert.notEqual(recovery.recoveryTimer, null);
  recovery.configure(false);
  assert.equal(recovery.recoveryTimer, null);
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

test('manual player recovery never reloads the page when quality controls are unavailable', async () => {
  let reloads = 0;
  const recovery = new PlayerRecovery({
    documentRef: { querySelector: () => null, querySelectorAll: () => [] },
    windowRef: { location: { reload: () => { reloads += 1; } } }
  });
  assert.equal(recovery.enabled, false);
  assert.equal(await recovery.manualRecover(), false);
  assert.equal(reloads, 0);
});

test('manual player recovery prefers the native Twitch retry action', async () => {
  let retries = 0; let reloads = 0;
  const retry = { click: () => { retries += 1; } };
  const recovery = new PlayerRecovery({
    documentRef: { querySelector: (selector) => selector.includes('retry') ? retry : null },
    windowRef: { location: { reload: () => { reloads += 1; } } }
  });
  assert.equal(await recovery.manualRecover(), true);
  assert.equal(retries, 1);
  assert.equal(reloads, 0);
  recovery.dispose();
});

test('manual player recovery toggles quality and restores the original option', async () => {
  const clicks = [];
  const firstRadios = [
    { checked: true, disabled: false, click: () => clicks.push('auto-off') },
    { checked: false, disabled: false, click: () => clicks.push('source-on') }
  ];
  const restoredRadios = [
    { checked: false, disabled: false, click: () => clicks.push('auto-restore') },
    { checked: true, disabled: false, click: () => clicks.push('source-off') }
  ];
  let radioRead = 0;
  const settingsButton = { click: () => clicks.push('settings') };
  const recovery = new PlayerRecovery({
    documentRef: {
      querySelector: (selector) => selector.includes('player-settings-button') ? settingsButton : null,
      querySelectorAll: () => radioRead++ === 0 ? firstRadios : restoredRadios
    },
    windowRef: { location: { reload: () => clicks.push('reload') } },
    qualitySwitchDelayMs: 0
  });
  assert.equal(await recovery.manualRecover(), true);
  assert.deepEqual(clicks, ['source-on', 'auto-restore']);
  assert.equal(clicks.includes('reload'), false);
  recovery.dispose();
});

test('manual reset slot is placed immediately before the Twitch settings control', () => {
  const otherControl = {
    matches: () => false,
    querySelector: (selector) => selector.includes('player-') ? {} : null
  };
  const settingsButton = { parentElement: null };
  const settingsControl = {
    parentElement: null,
    children: [settingsButton],
    matches: () => false,
    querySelector: () => null
  };
  settingsButton.parentElement = settingsControl;
  const controls = { children: [otherControl, settingsControl] };
  settingsControl.parentElement = controls;
  otherControl.parentElement = controls;

  const recovery = new PlayerRecovery({ documentRef: { querySelector: () => null } });
  const mount = recovery.resolveButtonMount(settingsButton);
  assert.equal(mount.container, controls);
  assert.equal(mount.reference, settingsControl);
});

test('disabling player recovery removes its manual button immediately', () => {
  let removals = 0; let listenerRemovals = 0;
  const recovery = new PlayerRecovery({ documentRef: { querySelector: () => null } });
  recovery.enabled = true;
  recovery.button = { removeEventListener: () => { listenerRemovals += 1; } };
  recovery.buttonSlot = { remove: () => { removals += 1; } };
  recovery.configure(false);
  assert.equal(removals, 1);
  assert.equal(listenerRemovals, 1);
  assert.equal(recovery.button, null);
  assert.equal(recovery.buttonSlot, null);
});

test('manual reset button can be enabled independently from automatic recovery', () => {
  const recovery = new PlayerRecovery({ documentRef: { querySelector: () => null } });
  let inspections = 0;
  recovery.inspect = () => { inspections += 1; };
  recovery.configure({ automaticEnabled: false, buttonEnabled: true });
  assert.equal(recovery.enabled, false);
  assert.equal(recovery.buttonEnabled, true);
  assert.equal(inspections, 1);
});

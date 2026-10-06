const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, document: {}, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/playerRecoveryPolicy.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/playerRecovery.js'), 'utf8'), context);
const PlayerRecovery = context.window.TFRPlayerRecovery.PlayerRecovery;


const setup = () => {
  let clock = 10000;
  const timers = [];
  const attrs = new Map();
  const video = { paused: false, ended: false, currentTime: 10, duration: Infinity, readyState: 2,
    play: () => Promise.resolve(), addEventListener() {}, removeEventListener() {} };
  const state = { video, error: null, blocked: false, retries: 0, restarts: 0, retry: false, advance: false };
  const root = { isConnected: true, querySelector: () => null, querySelectorAll: () => [],
    setAttribute: (k, v) => attrs.set(k, v), getAttribute: (k) => attrs.get(k), removeAttribute: (k) => attrs.delete(k),
    dispatchEvent: () => { state.restarts++; attrs.set('data-tfr-recovery-result', attrs.get('data-tfr-recovery-request')); } };
  const documentRef = { visibilityState: 'visible', removeEventListener() {},
    querySelector(selector) {
      if (selector.includes('offline-channel')) return state.blocked ? {} : null;
      if (selector.includes(' video')) return state.video;
      if (selector.includes('retry')) return state.retry ? { click: () => state.retries++ } : null;
      if (selector === context.window.TFRPlayerRecoveryPolicy.SELECTORS.player) return root;
      if (selector === context.window.TFRPlayerRecoveryPolicy.SELECTORS.error) return state.error;
      return null;
    }
  };
  const windowRef = { location: { pathname: '/streamer' }, Event: class {},
    setTimeout: (fn) => { timers.push(fn); return fn; },
    clearTimeout: (fn) => { const index = timers.indexOf(fn); if (index >= 0) timers.splice(index, 1); } };
  const manager = new PlayerRecovery({ documentRef, windowRef, now: () => clock });
  manager.enabled = true;
  manager.path = '/streamer';
  manager.video = video;
  const tick = async (ms = 500) => {
    clock += ms;
    if (state.advance && state.video) state.video.currentTime += 1;
    timers.splice(0).forEach((fn) => fn());
    for (let n = 0; n < 6; n++) await Promise.resolve();
  };
  const finish = async () => { for (let n = 0; n < 20; n++) await tick(); };
  return { manager, state, root, documentRef, windowRef, tick, finish };
};

test('manual recovery restarts the Twitch source and verifies actual progress', async () => {
  const s = setup();
  const task = s.manager.manualRecover();
  assert.equal(s.state.restarts, 1);
  s.state.advance = true;
  await s.finish();
  assert.equal(await task, true);
});

test('retry lookup ignores the extension refresh button inside the player', () => {
  const s = setup();
  const own = { textContent: 'Refresh player', getAttribute() {}, closest: () => ({}) };
  const retry = { textContent: 'Retry', getAttribute() {}, closest: () => null };
  s.root.querySelectorAll = () => [own, retry];
  assert.equal(s.manager.findRetryButton(), retry);
});

test('manual refresh does not accept ongoing playback instead of actually restarting the source', async () => {
  const s = setup();
  s.state.retry = true; s.state.advance = true;
  const task = s.manager.manualRecover();
  await s.finish();
  assert.equal(await task, true);
  assert.equal(s.state.retries, 0);
  assert.equal(s.state.restarts, 1);
});

test('a playing video is not proof that an unavailable restart API succeeded', async () => {
  const s = setup(); s.root.dispatchEvent = () => { s.state.restarts++; };
  s.state.advance = true;
  const task = s.manager.manualRecover(); await s.finish();
  assert.equal(await task, false);
});

test('manual recovery does not report success when it loses the original pause', async () => {
  const s = setup(); s.state.video.paused = true;
  const task = s.manager.manualRecover();
  s.state.video.paused = false; s.state.advance = true;
  await s.finish();
  assert.equal(await task, false);
});

test('manual recovery does not treat a new unexpected pause as success', async () => {
  const s = setup();
  const task = s.manager.manualRecover();
  s.state.video.paused = true;
  await s.finish();
  assert.equal(await task, false);
});

test('automatic recovery uses native retry and succeeds only when playback advances', async () => {
  const s = setup();
  s.state.retry = true; s.state.error = {};
  const task = s.manager.recover('error');
  assert.equal(s.state.retries, 1);
  s.state.error = null; s.state.advance = true;
  await s.finish();
  assert.equal(await task, true);
  assert.equal(s.state.restarts, 0);
});

test('stuck playback escalates to source restart, then backs off after failure', async () => {
  const s = setup();
  const task = s.manager.recover('stalled');
  await s.finish();
  assert.equal(await task, false);
  assert.equal(s.state.restarts, 1);
  assert.equal(await s.manager.recover('stalled'), false);
  assert.equal(s.state.restarts, 1);
});

test('simultaneous manual and automatic requests share the in-flight guard', async () => {
  const s = setup();
  const task = s.manager.manualRecover();
  assert.equal(await s.manager.recover('error'), false);
  assert.equal(await s.manager.manualRecover(), false);
  s.manager.dispose();
  assert.equal(await task, false);
});

test('navigation cancels an old recovery before it can restart the next channel', async () => {
  const s = setup();
  const task = s.manager.recover('stall');
  s.windowRef.location.pathname = '/another';
  s.manager.inspect();
  await s.finish();
  assert.equal(await task, false);
  assert.equal(s.state.restarts, 0);
});

test('a replaced video is not restarted by the previous videos native retry', async () => {
  const s = setup();
  const task = s.manager.recover('stall');
  s.state.video = { ...s.state.video };
  await s.finish();
  assert.equal(await task, false);
  assert.equal(s.state.restarts, 0);
});

test('healthy playback, voluntary pause, clips, offline, ads and hidden tabs never auto-recover', async () => {
  for (const kind of ['healthy', 'paused', 'clip', 'offline', 'ad', 'hidden']) {
    const s = setup();
    if (kind === 'paused') s.state.video.paused = true;
    if (kind === 'clip') s.windowRef.location.pathname = '/streamer/clip/Example';
    if (kind === 'offline' || kind === 'ad') s.state.blocked = true;
    if (kind === 'hidden') s.documentRef.visibilityState = 'hidden';
    for (let n = 0; n < 30; n++) {
      s.state.video.currentTime++;
      await s.tick(1000);
      s.manager.inspect();
    }
    assert.equal(s.state.restarts, 0, kind);
    if (kind !== 'healthy') assert.equal(await s.manager.recover('stalled'), false, kind);
  }
});

test('background elapsed time does not count as a visible playback stall', async () => {
  const s = setup(); s.manager.inspect();
  s.documentRef.visibilityState = 'hidden'; s.manager.boundVisibility();
  await s.tick(60000);
  s.documentRef.visibilityState = 'visible'; s.manager.boundVisibility(); s.manager.inspect();
  assert.equal(s.state.restarts, 0); assert.equal(s.manager.pending, null);
});

test('automatic watchdog detects sustained lack of progress', async () => {
  const s = setup();
  s.manager.inspect();
  await s.tick(21000);
  s.manager.inspect();
  assert.ok(s.manager.pending);
  s.manager.dispose();
});

test('offline transition and player destruction stop escalation', async () => {
  for (const kind of ['offline', 'destroyed']) {
    const s = setup();
    const task = s.manager.recover('stalled');
    if (kind === 'offline') s.state.blocked = true;
    else s.root.isConnected = false;
    await s.finish();
    assert.equal(await task, false);
    assert.equal(s.state.restarts, 0);
  }
});

test('three failed recoveries stop until a stable playback or navigation reset', async () => {
  const s = setup();
  for (let n = 0; n < 3; n++) {
    const task = s.manager.recover('stalled');
    await s.finish();
    assert.equal(await task, false);
    await s.tick(70000);
  }
  assert.equal(s.state.restarts, 3);
  assert.equal(await s.manager.recover('stalled'), false);
  s.state.advance = true;
  for (let n = 0; n < 35; n++) { await s.tick(1000); s.manager.inspect(); }
  assert.equal(s.manager.failureCount, 0);
  assert.equal(s.manager.nextAttemptAt, 0);
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
  recovery.button = { classList: { toggle() {} }, setAttribute() {}, removeEventListener: () => { listenerRemovals += 1; } };
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

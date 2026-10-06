const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup() {
  const listeners = {}; const timers = new Set();
  class Element {
    constructor() { this.dataset = {}; this.attributes = {}; this.isConnected = true; }
    matches() { return true; }
    getAttribute(name) { return this.attributes[name]; }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector() { return this.video; }
  }
  const location = { pathname: '/videos/123' };
  const document = { addEventListener: (name, fn) => { listeners[name] = fn; }, createElement: () => new Element() };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/page/playerBridge.js'), 'utf8'), {
    document, location, Element, setTimeout: (fn, ms) => { if (ms === 250) queueMicrotask(fn); else timers.add(fn); return fn; }, clearTimeout: (fn) => timers.delete(fn)
  });
  const root = new Element(); const video = new Element(); root.video = video;
  Object.assign(video, { duration: 200, currentTime: 40, paused: true, muted: true, volume: 0.3 });
  const calls = [];
  const player = { seekTo: (position) => calls.push(['seek', position]), pause: () => calls.push(['pause']), attachHTMLVideoElement: (node) => { root.video = node; } };
  const owner = { props: { mediaPlayerInstance: player }, setSrc: () => { calls.push(['restart']); } };
  root.__reactFiber$test = { stateNode: owner };
  root.setAttribute('data-tfr-recovery-request', '1');
  const restart = () => listeners['tfr:player:restart']({ target: root });
  return { root, video, calls, owner, location, timers, restart, listeners, Element };
}
test('bridge uses the native source API and preserves VOD position and pause', async () => {
  const s = setup(); await s.restart();
  assert.deepEqual(s.calls, [['restart'], ['seek', 40], ['pause']]);
  assert.equal(s.root.getAttribute('data-tfr-recovery-result'), '1'); assert.equal(s.timers.size, 0);
});
test('captured media is replaced through the player API with user mute and volume intact', async () => {
  const s = setup(); s.video.dataset.tfrAudioCaptured = 'true'; s.video.replaceWith = () => {};
  await s.restart(); assert.notEqual(s.root.video, s.video);
  assert.equal(s.root.video.muted, true); assert.equal(s.root.video.volume, 0.3);
});
test('missing capabilities fail safely without reloading anything', async () => {
  const s = setup(); delete s.owner.setSrc; await s.restart(); assert.equal(s.calls.length, 0);
});

test('source component may be a sibling of controls under the same player owner', async () => {
  const s = setup();
  const foreign = { props: { mediaPlayerInstance: {} }, setSrc() { throw new Error('wrong player'); } };
  s.root.__reactFiber$test = { memoizedProps: s.owner.props, child: {
    stateNode: foreign, sibling: { child: { stateNode: s.owner } }
  } };
  await s.restart();
  assert.deepEqual(s.calls, [['restart'], ['seek', 40], ['pause']]);
  assert.equal(s.root.getAttribute('data-tfr-recovery-result'), '1');
});

test('native duration keeps finite HTML live buffers from being restored as VOD positions', async () => {
  const s = setup();
  s.owner.props.mediaPlayerInstance.getDuration = () => Infinity;
  s.video.paused = false;
  await s.restart();
  assert.deepEqual(s.calls, [['restart']]);
});

test('replacing the video during an async restart prevents stale seek and pause', async () => {
  const s = setup(); let finish;
  s.owner.setSrc = () => new Promise(resolve => { finish = resolve; });
  const task = s.restart();
  s.root.video = new s.Element();
  finish(); await task;
  assert.deepEqual(s.calls, []);
  assert.equal(s.root.getAttribute('data-tfr-recovery-result'), undefined);
});
test('navigation invalidates pending results and a hung source call has a bounded deadline', async () => {
  const s = setup(); let resolve;
  s.owner.setSrc = () => new Promise((done) => { resolve = done; });
  const task = s.restart(); s.location.pathname = '/another'; resolve(); await task;
  assert.equal(s.calls.length, 0); assert.equal(s.root.getAttribute('data-tfr-recovery-result'), undefined);
  const hung = s.restart(); [...s.timers].forEach((fn) => fn()); await hung;
  assert.equal(s.timers.size, 0);
});
test('reply bridge exposes only public recipient, identity and message ID, clearing stale data', () => {
  const s = setup(); const message = new s.Element();
  message.__reactFiber$test = { memoizedProps: { currentUser: { login: 'viewer', token: 'never-expose' }, message: { id: 'message-1', reply: { parentUserLogin: 'viewer' } } } };
  s.listeners['tfr:chat:inspect-reply']({ target: message });
  assert.deepEqual(message.dataset, { tfrReplyParent: 'viewer', tfrCurrentLogin: 'viewer', tfrMessageId: 'message-1' });
  message.__reactFiber$test = {}; s.listeners['tfr:chat:inspect-reply']({ target: message });
  assert.deepEqual(message.dataset, {});
});

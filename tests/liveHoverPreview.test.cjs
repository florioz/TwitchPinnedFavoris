const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({
  window: { setTimeout, clearTimeout },
  document: {},
  Element: class {},
  setTimeout,
  clearTimeout
});
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/liveHoverPreview.js'),
  'utf8'
), context);

test('live hover preview replaces only live native tooltips while enabled', () => {
  const live = {
    dataset: { livePreview: 'true', tooltip: 'Live details' },
    title: 'Live details',
    removeAttribute(name) { if (name === 'title') delete this.title; }
  };
  const offline = {
    dataset: { livePreview: 'false', tooltip: 'Offline details' },
    title: 'Offline details',
    removeAttribute(name) { if (name === 'title') delete this.title; }
  };
  const container = {
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll: () => [live, offline]
  };
  const preview = context.window.TFRLiveHoverPreview.create({
    formatViewers: String,
    t: (key) => key
  });
  preview.attach(container);
  preview.configure(true, 'video');
  assert.equal(preview.mode, 'video');
  assert.equal(live.title, undefined);
  assert.equal(offline.title, 'Offline details');
  preview.configure(true, 'unsupported');
  assert.equal(preview.mode, 'image');
  preview.configure(false);
  assert.equal(live.title, 'Live details');
});

test('live preview stylesheet expands the stream title on hover', () => {
  const css = fs.readFileSync(path.join(__dirname, '../styles/sidebar.css'), 'utf8');
  assert.match(css, /\.tfr-live-hover-preview__title:hover[\s\S]*?white-space:\s*normal/);
  assert.match(css, /\.tfr-live-hover-preview\s*\{[\s\S]*?pointer-events:\s*auto/);
});


function setup() {
  class Element {
    constructor() { this.dataset = {}; this.children = []; this.listeners = new Map(); this.style = {}; this.isConnected = true; this.hover = true; this.classList = { toggle() {} }; }
    addEventListener(type, fn) { this.listeners.set(type, fn); }
    removeEventListener(type) { this.listeners.delete(type); }
    setAttribute(key, value) { this[key] = value; }
    removeAttribute(key) { delete this[key]; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); }
    remove() { this.isConnected = false; }
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    closest() { return this; }
    matches() { return this.hover; }
    querySelectorAll() { return this.children; }
    getBoundingClientRect() { return { top: 20, left: 20, right: 100, width: 200, height: 150 }; }
  }
  const timers = new Map(); let id = 0;
  const window = Object.assign(new Element(), { location: { pathname: '/one', hostname: 'www.twitch.tv' }, innerWidth: 1200, innerHeight: 800,
    setTimeout(fn) { timers.set(++id, fn); return id; } });
  const clearTimeout = (key) => timers.delete(key);
  const document = Object.assign(new Element(), { body: new Element(), createElement: () => new Element(), visibilityState: 'visible' });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/liveHoverPreview.js'), 'utf8'), { window, document, Element, clearTimeout });
  const preview = window.TFRLiveHoverPreview.create({ formatViewers: String, t: (key) => key });
  const container = new Element(); const first = new Element(); const second = new Element();
  first.dataset = { login: 'one', livePreview: 'true' }; second.dataset = { login: 'two', livePreview: 'true' };
  container.append(first, second); preview.attach(container); preview.configure(true);
  const fire = (property) => { const key = preview[property]; const fn = timers.get(key); timers.delete(key); fn?.(); };
  return { preview, container, first, second, timers, fire, window, document };
}

test('preview opens after hover and closes after pointer leaves', () => {
  const s = setup();
  s.preview.handlePointerOver({ target: s.first }); s.fire('openTimer');
  assert.equal(s.preview.activeEntry, s.first); assert.ok(s.preview.preview);
  s.first.hover = false; s.preview.preview.hover = false;
  s.preview.handlePointerOut({ target: s.first }); s.fire('closeTimer');
  assert.equal(s.preview.preview, null); assert.equal(s.timers.size, 0);
});

test('close button suppresses the current hover but permits the next one', () => {
  const s = setup(); s.preview.open(s.first);
  s.preview.preview.children.at(-1).listeners.get('click')();
  assert.equal(s.preview.preview, null); assert.equal(s.timers.size, 0);
  s.preview.handlePointerOver({ target: s.first }); assert.equal(s.timers.size, 0);
  s.preview.handlePointerOut({ target: s.first });
  s.preview.handlePointerOver({ target: s.first }); s.fire('openTimer');
  assert.ok(s.preview.preview); s.preview.dispose();
});

test('rapid hovers cancel the old opening and destruction cleans every timer and listener', () => {
  const s = setup();
  s.preview.handlePointerOver({ target: s.first });
  s.preview.handlePointerOver({ target: s.second });
  assert.equal(s.timers.size, 1); s.fire('openTimer');
  assert.equal(s.preview.activeEntry, s.second);
  s.preview.schedulePosition(); s.preview.dispose();
  assert.equal(s.timers.size, 0); assert.equal(s.container.listeners.size, 0);
  assert.equal(s.document.listeners.size, 0); assert.equal(s.window.listeners.size, 0);
});

test('closing from inside the preview permits the first return to its anchor', () => {
  const s = setup(); s.preview.open(s.first);
  s.first.hover = false;
  s.preview.handlePointerOut({ target: s.first, relatedTarget: s.preview.preview });
  s.preview.boundDismiss();
  s.first.hover = true;
  s.preview.handlePointerOver({ target: s.first }); s.fire('openTimer');
  assert.ok(s.preview.preview);
  s.preview.dispose();
});

test('removed anchors, SPA navigation, hidden tabs and lost hover cannot strand a preview', () => {
  for (const kind of ['removed', 'navigation', 'hidden', 'lost-hover']) {
    const s = setup(); s.preview.open(s.first);
    if (kind === 'removed') { s.first.isConnected = false; s.preview.preview.hover = false; }
    if (kind === 'navigation') s.window.location.pathname = '/two';
    if (kind === 'hidden') s.document.visibilityState = 'hidden';
    if (kind === 'lost-hover') { s.first.hover = false; s.preview.preview.hover = false; }
    s.fire('watchTimer'); if (kind === 'lost-hover') s.fire('closeTimer');
    assert.equal(s.preview.preview, null, kind); assert.equal(s.timers.size, 0, kind);
  }
});

test('pending close cannot dismiss a hovered preview even if pointerenter was missed', () => {
  const s = setup(); s.preview.open(s.first); s.first.hover = false;
  s.preview.handlePointerOut({ target: s.first });
  s.fire('closeTimer');
  assert.ok(s.preview.preview);
  s.preview.dispose();
});

test('iframe focus keeps video preview open without a parent-window blur dismissal', () => {
  const s = setup(); s.preview.configure(true, 'video'); s.preview.open(s.first);
  s.first.hover = false; s.preview.preview.hover = false;
  s.document.activeElement = s.preview.preview.children[0];
  assert.equal(s.window.listeners.has('blur'), false);
  s.preview.scheduleClose(250); s.fire('watchTimer'); s.fire('closeTimer');
  assert.ok(s.preview.preview);
  s.preview.dispose();
});

test('returning to the same favorite does not rebuild an open preview', () => {
  const s = setup(); s.preview.open(s.first);
  const current = s.preview.preview;
  s.preview.handlePointerOver({ target: s.first }); s.fire('openTimer');
  assert.equal(s.preview.preview, current);
  s.preview.dispose();
});

test('sidebar rebuild on hover exit rebinds the same streamer without removing the preview', () => {
  const s = setup(); s.preview.open(s.first);
  const popup = s.preview.preview;
  s.first.isConnected = false; s.first.hover = false;
  s.second.dataset.login = 'one'; s.container.children = [s.second];
  s.fire('watchTimer');
  assert.equal(s.preview.preview, popup);
  assert.equal(s.preview.activeEntry, s.second);
  assert.equal(s.second['aria-describedby'], popup.id);
  s.preview.dispose();
});

test('collapsing the source group keeps the hovered popup usable until it is left', () => {
  const s = setup(); s.preview.open(s.first);
  s.first.isConnected = false; s.first.hover = false; s.container.children = [];
  s.fire('watchTimer');
  assert.ok(s.preview.preview);
  s.preview.preview.hover = false;
  s.fire('watchTimer');
  assert.equal(s.preview.preview, null);
  assert.equal(s.timers.size, 0);
});

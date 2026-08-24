const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loadAdapter = (documentRef) => {
  const context = vm.createContext({ window: {}, document: documentRef });
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/sidebarDomAdapter.js'),
    'utf8'
  );
  vm.runInContext(source, context);
  return context.window.TFRSidebarDomAdapter;
};

test('sidebar DOM adapter inserts favorites inside Twitch native scroll contents', () => {
  const contents = { querySelector() {} };
  const scrollable = {
    querySelector(selector) {
      return selector === '.side-bar-contents' ? contents : null;
    }
  };
  const sideNav = {
    querySelector(selector) {
      return selector === '.side-nav__scrollable_content' ? scrollable : null;
    }
  };
  const documentRef = { querySelector: () => sideNav };
  const adapter = loadAdapter(documentRef);

  assert.equal(adapter.findInsertionTarget(documentRef), contents);
});

test('sidebar DOM adapter exposes the native viewport used by auto compact', () => {
  const viewport = { clientHeight: 720 };
  const container = {
    closest(selector) {
      return selector === '.side-nav__scrollable_content' ? viewport : null;
    }
  };
  const adapter = loadAdapter({ querySelector: () => null });

  assert.equal(adapter.findScrollViewport(container), viewport);
});

test('sidebar DOM adapter keeps a safe fallback for Twitch DOM transitions', () => {
  const fallback = { querySelector() {} };
  const scrollable = {
    firstElementChild: fallback,
    querySelector: () => null
  };
  const sideNav = { querySelector: () => scrollable };
  const documentRef = { querySelector: () => sideNav };
  const adapter = loadAdapter(documentRef);

  assert.equal(adapter.findInsertionTarget(documentRef), fallback);
});

test('sidebar DOM adapter resolves legacy list mounts without renderer knowledge', () => {
  const list = { tagName: 'UL', getAttribute: () => null, querySelector() {} };
  const section = {
    querySelector(selector) {
      return selector === '[data-test-selector="followed-side-nav-section__items"]' ? list : null;
    }
  };
  const nav = {
    querySelector(selector) {
      return selector === 'section[data-test-selector="followed-side-nav-section"]'
        ? section
        : null;
    }
  };
  const documentRef = {
    querySelector(selector) {
      return selector === 'nav[data-a-target="side-nav"]' ? nav : null;
    },
    querySelectorAll: () => []
  };
  const adapter = loadAdapter(documentRef);
  const mount = adapter.resolveMount(documentRef);

  assert.equal(mount.target, list);
  assert.equal(mount.needsListItem, true);
  assert.equal(mount.modern, false);
});

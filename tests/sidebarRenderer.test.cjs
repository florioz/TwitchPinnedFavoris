const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loadSidebarRenderer = (windowRef, documentRef) => {
  const context = vm.createContext({
    window: windowRef,
    document: documentRef,
    console,
    requestAnimationFrame() {},
    cancelAnimationFrame() {}
  });
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/colorTools.js'),
    'utf8'
  );
  vm.runInContext(source, context);
  const appearanceSource = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/appearancePreferences.js'),
    'utf8'
  );
  vm.runInContext(appearanceSource, context);
  const compactSource = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/autoCompactEngine.js'),
    'utf8'
  );
  vm.runInContext(compactSource, context);
  const signatureSource = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/sidebarSignatures.js'),
    'utf8'
  );
  vm.runInContext(signatureSource, context);
  const previewSource = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/liveHoverPreview.js'),
    'utf8'
  );
  vm.runInContext(previewSource, context);
  const rendererSource = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/sidebarRenderer.js'),
    'utf8'
  );
  vm.runInContext(rendererSource, context);
  return context.window.TFRSidebarRenderer.create({});
};

test('auto compact is immediately remeasured after crossing its release threshold', () => {
  const block = {
    dataset: { totalEntries: '20', groupId: 'large-group' },
    classList: { contains: () => false },
    scrollHeight: 900,
    removeAttribute(name) {
      if (name === 'data-compact-level') delete this.dataset.compactLevel;
    }
  };
  const classNames = new Set(['is-auto-compact']);
  const container = {
    dataset: {},
    clientHeight: 300,
    parentElement: { clientHeight: 300 },
    classList: {
      add: (name) => classNames.add(name),
      remove: (name) => classNames.delete(name),
      toggle(name, enabled) {
        if (enabled) classNames.add(name);
        else classNames.delete(name);
      }
    },
    get scrollHeight() {
      if (block.dataset.compactLevel === '2') return 220;
      if (block.dataset.compactLevel === '1') return 520;
      return 900;
    },
    getBoundingClientRect: () => ({ top: 0 }),
    querySelectorAll(selector) {
      if (selector.includes('data-compact-level')) {
        return block.dataset.compactLevel ? [block] : [];
      }
      if (selector.includes('data-group-id')) return [block];
      if (selector === '.tfr-category-block') return [block];
      return [];
    }
  };
  const windowRef = { innerHeight: 700 };
  const documentRef = { body: { contains: () => true }, hidden: false };
  const SidebarRenderer = loadSidebarRenderer(windowRef, documentRef);
  const renderer = new SidebarRenderer({
    getState: () => ({ preferences: { autoCompactSidebarEnabled: true } })
  });
  renderer.container = container;
  renderer.isAutoCompact = true;
  renderer.autoCompactLevel = 1;
  renderer.autoCompactActivationHeight = 500;

  renderer.scheduleAutoCompactCheck(true);

  assert.equal(renderer.isAutoCompact, true);
  assert.equal(renderer.autoCompactLevel, 2);
  assert.equal(renderer.autoCompactActivationHeight, 700);
  assert.equal(container.dataset.autoCompact, 'active');
  assert.equal(block.dataset.compactLevel, '2');
});

test('auto compact also reduces groups containing a single streamer', () => {
  const block = {
    dataset: { totalEntries: '1', groupId: 'single-streamer-group', singleton: 'true' },
    classList: { contains: () => false },
    scrollHeight: 120,
    removeAttribute(name) {
      if (name === 'data-compact-level') delete this.dataset.compactLevel;
    }
  };
  const container = {
    scrollTop: 3,
    dataset: {},
    clientHeight: 80,
    parentElement: { clientHeight: 80 },
    classList: { remove() {}, toggle() {} },
    get scrollHeight() {
      if (block.dataset.compactLevel === '2') return 55;
      if (block.dataset.compactLevel === '1') return 95;
      return 120;
    },
    getBoundingClientRect: () => ({ top: 0 }),
    querySelectorAll(selector) {
      if (selector.includes('data-compact-level')) {
        return block.dataset.compactLevel ? [block] : [];
      }
      if (selector.includes('data-group-id')) return [block];
      if (selector === '.tfr-category-block') return [block];
      return [];
    }
  };
  const SidebarRenderer = loadSidebarRenderer(
    { innerHeight: 80 },
    { body: { contains: () => true }, hidden: false }
  );
  const renderer = new SidebarRenderer({
    getState: () => ({ preferences: { autoCompactSidebarEnabled: true } })
  });
  renderer.container = container;

  renderer.scheduleAutoCompactCheck(true);

  assert.equal(renderer.autoCompactLevel, 3);
  assert.equal(block.dataset.compactLevel, '3');
  assert.equal(container.scrollTop, 0);
});

test('collapsed groups restore normal cards when the available sidebar height is sufficient', () => {
  const block = {
    dataset: { totalEntries: '3', groupId: 'remaining-group', compactLevel: '2' },
    classList: { contains: () => false },
    scrollHeight: 600,
    removeAttribute(name) {
      if (name === 'data-compact-level') delete this.dataset.compactLevel;
    }
  };
  const classNames = new Set(['is-auto-compact']);
  const container = {
    dataset: {},
    // The compact content currently occupies only 300px, while the Twitch
    // sidebar still has 700px available.
    clientHeight: 300,
    parentElement: { clientHeight: 700 },
    classList: {
      remove: (name) => classNames.delete(name),
      toggle(name, enabled) {
        if (enabled) classNames.add(name);
        else classNames.delete(name);
      }
    },
    scrollHeight: 600,
    getBoundingClientRect: () => ({ top: 0 }),
    querySelectorAll(selector) {
      if (selector.includes('data-compact-level')) {
        return block.dataset.compactLevel ? [block] : [];
      }
      if (selector.includes('data-group-id')) return [block];
      if (selector === '.tfr-category-block') return [block];
      return [];
    }
  };
  const SidebarRenderer = loadSidebarRenderer(
    { innerHeight: 708 },
    { body: { contains: () => true }, hidden: false }
  );
  const renderer = new SidebarRenderer({
    getState: () => ({ preferences: { autoCompactSidebarEnabled: true } })
  });
  renderer.container = container;
  renderer.isAutoCompact = true;
  renderer.autoCompactLevel = 2;
  renderer.autoCompactActivationHeight = 708;

  renderer.scheduleAutoCompactCheck(true);

  assert.equal(renderer.isAutoCompact, false);
  assert.equal(renderer.autoCompactLevel, 0);
  assert.equal(renderer.autoCompactActivationHeight, 0);
  assert.equal(container.dataset.autoCompact, 'idle');
  assert.equal(block.dataset.compactLevel, undefined);
  assert.equal(classNames.has('is-auto-compact'), false);
});

test('live structure signature ignores viewer-driven ordering but detects membership changes', () => {
  const SidebarRenderer = loadSidebarRenderer(
    { innerHeight: 700 },
    { body: { contains: () => true }, hidden: false }
  );
  const renderer = new SidebarRenderer({});
  const first = [{
    id: 'group',
    collapsed: false,
    entries: [{ login: 'alpha' }, { login: 'beta' }],
    children: []
  }];
  const reordered = [{
    id: 'group',
    collapsed: false,
    entries: [{ login: 'beta' }, { login: 'alpha' }],
    children: []
  }];
  const changed = [{
    id: 'group',
    collapsed: false,
    entries: [{ login: 'alpha' }, { login: 'gamma' }],
    children: []
  }];

  assert.equal(
    renderer.createLiveStructureSignature(first),
    renderer.createLiveStructureSignature(reordered)
  );
  assert.notEqual(
    renderer.createLiveStructureSignature(first),
    renderer.createLiveStructureSignature(changed)
  );
});

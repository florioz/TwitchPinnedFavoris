const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, document: {}, console });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/favoriteCategoryFilterTools.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/favoriteCategoryFilterView.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/favoriteCategoryFilterController.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/featureSettingsConfig.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/appearanceWizardModel.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/favoritesDragDropModel.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/favoritesOverlay.js'),
  'utf8'
), context);

const normalizeCategoryName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();
const categoryFilterTools = context.window.TFRFavoriteCategoryFilterTools.create({ normalizeCategoryName });
const categoryFilterView = context.window.TFRFavoriteCategoryFilterView.create({ t: (key) => key });
const FavoriteCategoryFilterController = context.window.TFRFavoriteCategoryFilterController.create({
  t: (key) => key,
  normalizeCategoryName,
  tools: categoryFilterTools,
  view: categoryFilterView
});
const featureSettingsConfig = context.window.TFRFeatureSettingsConfig.create({ t: (key) => key });
const FavoritesOverlay = context.window.TFRFavoritesOverlay.create({
  t: (key) => key,
  normalizeCategoryName
});

test('chat padding values are normalized consistently for the settings UI', () => {
  const overlay = Object.create(FavoritesOverlay.prototype);
  assert.equal(overlay.normalizeChatPaddingPx('12.7'), 13);
  assert.equal(overlay.normalizeChatPaddingPx(-1), 0);
  assert.equal(overlay.normalizeChatPaddingPx(40), 20);
  assert.equal(overlay.normalizeChatPaddingPx('invalid'), 0);
});

test('feature settings config assigns every toggle to one dashboard group', () => {
  const assignedKeys = featureSettingsConfig.groups.flatMap((group) => group.keys);
  assert.equal(new Set(assignedKeys).size, assignedKeys.length);
  assert.deepEqual(
    [...featureSettingsConfig.toggles.map((toggle) => toggle.key)].sort(),
    [...assignedKeys].sort()
  );
  assert.equal(
    featureSettingsConfig.toggles.find((toggle) => toggle.key === 'liveFavoritesEnabled').defaultEnabled,
    undefined
  );
  assert.equal(
    featureSettingsConfig.toggles.find((toggle) => toggle.key === 'chatFontEnabled').defaultEnabled,
    false
  );
});

test('optional overlay sections append only when they exist', () => {
  const overlay = Object.create(FavoritesOverlay.prototype);
  const appended = [];
  const parent = { appendChild: (child) => appended.push(child) };
  const section = { id: 'section' };

  assert.equal(overlay.appendIfPresent(parent, null), null);
  assert.equal(overlay.appendIfPresent(parent, section), section);
  assert.deepEqual(appended, [section]);
});

test('custom toast sound validation accepts supported audio files within one megabyte', () => {
  const overlay = Object.create(FavoritesOverlay.prototype);
  assert.equal(overlay.validateToastSoundFile({ name: 'alert.ogg', type: '', size: 1024 }), '');
  assert.equal(overlay.validateToastSoundFile({ name: 'alert.bin', type: 'audio/ogg', size: 1024 }), '');
  assert.equal(
    overlay.validateToastSoundFile({ name: 'alert.txt', type: 'text/plain', size: 1024 }),
    'toast.settings.customSoundInvalid'
  );
  assert.equal(
    overlay.validateToastSoundFile({ name: 'alert.mp3', type: 'audio/mpeg', size: 1_048_577 }),
    'toast.settings.customSoundTooLarge'
  );
});

test('custom toast sound import persists and previews one validated file', async () => {
  const overlay = Object.create(FavoritesOverlay.prototype);
  const calls = [];
  overlay.toastSoundMessage = 'previous error';
  overlay.readFileAsDataUrl = async () => 'data:audio/ogg;base64,AAAA';
  overlay.store = {
    setToastCustomSound: async (payload) => calls.push(['save', payload])
  };
  overlay.render = () => calls.push(['render']);
  overlay.dispatchToastTestSound = (payload) => calls.push(['preview', payload]);

  const imported = await overlay.importToastSound(
    { name: 'alert.ogg', type: 'audio/ogg', size: 2048 },
    '42'
  );

  assert.equal(imported, true);
  assert.equal(overlay.toastSoundMessage, '');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['save', { name: 'alert.ogg', dataUrl: 'data:audio/ogg;base64,AAAA' }],
    ['render'],
    ['preview', { soundId: 'custom', volume: '42', customSoundDataUrl: 'data:audio/ogg;base64,AAAA' }]
  ]);
});

test('invalid custom toast sound import stops before reading or saving', async () => {
  const overlay = Object.create(FavoritesOverlay.prototype);
  let reads = 0;
  let writes = 0;
  overlay.readFileAsDataUrl = async () => { reads += 1; return ''; };
  overlay.store = { setToastCustomSound: async () => { writes += 1; } };
  overlay.render = () => {};

  const imported = await overlay.importToastSound(
    { name: 'notes.txt', type: 'text/plain', size: 50 },
    35
  );

  assert.equal(imported, false);
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  assert.equal(overlay.toastSoundMessage, 'toast.settings.customSoundInvalid');
});

test('favorite details delegates category and recent-highlight controls', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/favoritesOverlay.js'),
    'utf8'
  );
  const start = source.indexOf('  renderFavoriteDetails(state,');
  const end = source.indexOf('\n  destroy()', start);
  const detailsMethod = source.slice(start, end);

  assert.match(detailsMethod, /renderFavoriteCategorySection\(favorite, flatCategories\)/);
  assert.match(detailsMethod, /renderFavoriteDetailsShell\(favorite, live\)/);
  assert.match(detailsMethod, /renderFavoriteRecentHighlightToggle\(favorite\)/);
  assert.match(detailsMethod, /categoryFilterController\.render\(\{/);
  assert.doesNotMatch(detailsMethod, /categoryFilterView\./);
  assert.doesNotMatch(detailsMethod, /setFavoriteCategoryFilter\(/);
  assert.doesNotMatch(detailsMethod, /setFavoriteCategory\(/);
  assert.doesNotMatch(detailsMethod, /setFavoriteRecentHighlight\(/);
  assert.doesNotMatch(detailsMethod, /tfr-category-filter__remove/);
});

test('favorite details shell creates an accessible dialog and schedules focus', () => {
  const elements = [];
  context.document.createElement = (tagName) => {
    const element = {
      tagName,
      children: [],
      attributes: {},
      focused: false,
      appendChild(child) { this.children.push(child); },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { this.focused = true; }
    };
    elements.push(element);
    return element;
  };
  let focusCallback = null;
  context.requestAnimationFrame = (callback) => { focusCallback = callback; };
  const overlay = Object.create(FavoritesOverlay.prototype);
  const header = { tagName: 'header' };
  overlay.renderFavoriteDetailsHeader = () => header;
  const { panel, body } = overlay.renderFavoriteDetailsShell(
    { displayName: 'Streamer' },
    { isLive: true }
  );

  assert.equal(panel.tagName, 'aside');
  assert.equal(panel.attributes.role, 'dialog');
  assert.equal(panel.attributes['aria-label'], 'details.panelTitle');
  assert.equal(panel.tabIndex, -1);
  assert.deepEqual(panel.children, [header, body]);
  assert.equal(body.className, 'tfr-favorite-details__body');
  assert.equal(panel.focused, false);
  focusCallback();
  assert.equal(panel.focused, true);
});

test('category filter suggestion renderer clears stale entries and forwards selection', () => {
  const createContainer = () => {
    const classes = new Set(['is-visible']);
    return {
      children: [{ textContent: 'stale' }],
      classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name)
      },
      set innerHTML(value) {
        if (value === '') this.children = [];
      },
      appendChild(child) { this.children.push(child); }
    };
  };
  context.document.createElement = (tagName) => ({
    tagName,
    listeners: {},
    addEventListener(name, handler) { this.listeners[name] = handler; }
  });
  const container = createContainer();
  const selected = [];
  categoryFilterView.renderSuggestions(container, ['Art', 'Minecraft'], (name) => selected.push(name));

  assert.deepEqual(container.children.map((child) => child.textContent), ['Art', 'Minecraft']);
  assert.equal(container.classList.contains('is-visible'), true);
  let prevented = false;
  container.children[1].listeners.mousedown({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(selected, ['Minecraft']);

  categoryFilterView.renderSuggestions(container, [], () => {});
  assert.deepEqual(container.children, []);
  assert.equal(container.classList.contains('is-visible'), false);
});

test('favorite category filter input returns its interactive elements and datalist', () => {
  context.document.createElement = (tagName) => ({
    tagName,
    children: [],
    dataset: {},
    attributes: {},
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const controls = categoryFilterView.renderInput(
    { login: 'streamer' },
    'tfr-detail-filter-streamer',
    ['Art', 'Minecraft']
  );

  assert.deepEqual(controls.row.children, [controls.input, controls.addButton]);
  assert.equal(controls.input.dataset.tfrFocusKey, 'category-filter-streamer');
  assert.equal(controls.input.attributes.list, 'tfr-detail-filter-streamer-list');
  assert.equal(controls.datalist.id, 'tfr-detail-filter-streamer-list');
  assert.deepEqual(controls.datalist.children.map((option) => option.value), ['Art', 'Minecraft']);
  assert.equal(controls.suggestions.className, 'tfr-category-filter__suggestions');
});

test('favorite category filter toggle exposes a stable id and stored state', () => {
  context.document.createElement = (tagName) => ({
    tagName,
    children: [],
    attributes: {},
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const control = categoryFilterView.renderToggle({
    login: 'streamer',
    categoryFilter: { enabled: true }
  });

  assert.equal(control.id, 'tfr-detail-filter-streamer');
  assert.equal(control.label.attributes.for, control.id);
  assert.equal(control.toggle.id, control.id);
  assert.equal(control.toggle.checked, true);
  assert.equal(control.label.children.length, 2);
});

test('category filter controls share one enabled state', () => {
  const input = { disabled: false };
  const button = { disabled: false };

  categoryFilterView.setControlsEnabled(false, [input, null, button]);
  assert.equal(input.disabled, true);
  assert.equal(button.disabled, true);
  categoryFilterView.setControlsEnabled(true, [input, button]);
  assert.equal(input.disabled, false);
  assert.equal(button.disabled, false);
});

test('live category information distinguishes offline, unavailable and named categories', () => {
  context.document.createElement = (tagName) => ({ tagName, className: '', textContent: '' });
  assert.equal(categoryFilterView.renderLiveInfo(null).textContent, 'details.filter.offline');
  assert.equal(
    categoryFilterView.renderLiveInfo({ isLive: true, game: '' }).textContent,
    'details.filter.currentCategoryUnavailable'
  );
  assert.equal(
    categoryFilterView.renderLiveInfo({ isLive: true, game: 'Minecraft' }).textContent,
    'details.filter.currentCategory'
  );
});

test('known category datalist preserves its id and option order', () => {
  context.document.createElement = (tagName) => ({
    tagName,
    id: '',
    value: '',
    children: [],
    appendChild(child) { this.children.push(child); }
  });
  const datalist = categoryFilterView.renderDatalist('category-list', ['Art', 'Minecraft']);

  assert.equal(datalist.id, 'category-list');
  assert.deepEqual(
    datalist.children.map((option) => option.value),
    ['Art', 'Minecraft']
  );
});

test('category filter suggestions merge, deduplicate and exclude selected values', () => {
  const suggestions = categoryFilterTools.buildSuggestions({
    remote: ['Grand Theft Auto V', 'Minecraft', 'Just Chatting'],
    known: ['grand theft auto v', 'Minecraft', 'Musique'],
    selected: ['MINECRAFT'],
    term: 'a',
    limit: 3
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(suggestions)),
    ['Grand Theft Auto V', 'Just Chatting']
  );
});

test('category filter additions trim values and reject empty or normalized duplicates', () => {
  const current = ['Minecraft', 'Grand Theft Auto V'];

  assert.equal(categoryFilterTools.addCategory(current, '   '), null);
  assert.equal(categoryFilterTools.addCategory(current, ' minecraft '), null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(categoryFilterTools.addCategory(current, ' Just Chatting '))),
    ['Minecraft', 'Grand Theft Auto V', 'Just Chatting']
  );
  assert.deepEqual(current, ['Minecraft', 'Grand Theft Auto V']);
});

test('category filter removals use normalized names without mutating the source', () => {
  const current = ['Pok\u00e9mon', 'Minecraft', 'POKEMON'];
  const next = categoryFilterTools.removeCategory(current, ' pokemon ');

  assert.deepEqual(JSON.parse(JSON.stringify(next)), ['Minecraft']);
  assert.deepEqual(current, ['Pok\u00e9mon', 'Minecraft', 'POKEMON']);
  assert.deepEqual(
    JSON.parse(JSON.stringify(categoryFilterTools.removeCategory(null, 'Minecraft'))),
    []
  );
});

test('favorite filter categories prefer current store state over rendered fallback', () => {
  const store = {
    getState: () => ({
      favorites: { streamer: { categoryFilter: { categories: ['Current'] } } }
    })
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(categoryFilterTools.getCategories(store, 'streamer', ['Old']))),
    ['Current']
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(categoryFilterTools.getCategories(store, 'missing', ['Fallback']))),
    ['Fallback']
  );
});

test('category filter controller removes a category and disables an empty filter', async () => {
  const writes = [];
  let changes = 0;
  const store = {
    getState: () => ({
      favorites: { streamer: { categoryFilter: { categories: ['Minecraft'] } } }
    }),
    setFavoriteCategoryFilter: async (login, value) => writes.push([login, value])
  };
  const controller = new FavoriteCategoryFilterController({
    store,
    getCategorySuggestions: async () => [],
    onChange: () => { changes += 1; }
  });

  await controller.removeCategory(
    { login: 'streamer' },
    ['Fallback'],
    true,
    ' minecraft '
  );

  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [
    ['streamer', { categories: [], enabled: false }]
  ]);
  assert.equal(changes, 1);
});

test('known Twitch categories are trimmed, deduplicated and sorted', () => {
  const categories = categoryFilterTools.collectKnownCategories(
    {
      favorites: {
        one: { categoryFilter: { categories: [' Minecraft ', '', null] } },
        two: { categoryFilter: { categories: ['Art', 'Minecraft'] } },
        three: {}
      }
    },
    {
      one: { game: ' Just Chatting ' },
      two: { game: 'Art' },
      three: { game: 42 }
    }
  );

  assert.deepEqual(JSON.parse(JSON.stringify(categories)), ['Art', 'Just Chatting', 'Minecraft']);
});

test('feature toggle dispatcher calls only supported store setters', async () => {
  const calls = [];
  const overlay = Object.create(FavoritesOverlay.prototype);
  overlay.store = {
    value: 'store-context',
    async setChatNoPaddingEnabled(enabled) {
      calls.push([this.value, enabled]);
    },
    async removeAllFavorites() {
      calls.push(['unsafe']);
    }
  };
  let renders = 0;
  overlay.render = () => { renders += 1; };

  assert.equal(await overlay.applyFeatureToggle('setChatNoPaddingEnabled', true), true);
  assert.deepEqual(calls, [['store-context', true]]);
  assert.equal(renders, 1);

  assert.equal(await overlay.applyFeatureToggle('removeAllFavorites', true), false);
  assert.equal(await overlay.applyFeatureToggle('setMissingEnabled', true), false);
  assert.equal(calls.length, 1);
  assert.equal(renders, 1);
});

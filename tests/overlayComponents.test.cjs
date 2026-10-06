const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(file, api) {
  class Node {
    constructor() {
      this.children = []; this.events = {}; this.style = { removeProperty() {} };
      this.classList = { add() {}, toggle() {} };
    }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.append(item); }
    setAttribute(key, value) { this[key] = value; }
    removeAttribute(key) { delete this[key]; }
    addEventListener(key, fn) { this.events[key] = fn; }
  }
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features', file), 'utf8'), {
    window, document: { createElement: () => new Node() }
  });
  return { create: window[api].create, Node };
}

test('group filter retains expansion on rerender and sends writes to the group only', async () => {
  const { create, Node } = setup('groupGameFilter.js', 'TFRGroupGameFilter');
  let adapter, request;
  class Controller {
    constructor({ store }) { adapter = store; }
    render() { return new Node(); }
  }
  const component = create({
    store: { getState: () => ({ categories: [{ id: 'rp' }] }), getLiveData: () => ({}),
      setGroupCategoryFilter: async (...args) => { request = args; } },
    t: key => key, FavoriteCategoryFilterController: Controller,
    categoryFilterTools: { collectKnownCategories: () => [] }, onChange() {}, getCategorySuggestions() {}
  });
  let wrapper = component.render({ id: 'rp' });
  assert.equal(wrapper.children[1].hidden, true);
  wrapper.children[0].events.click();
  assert.equal(wrapper.children[1].hidden, false);
  wrapper = component.render({ id: 'rp' });
  assert.equal(wrapper.children[0]['aria-expanded'], 'true');
  const filter = { enabled: true, categories: ['GTA'] };
  await adapter.setFavoriteCategoryFilter('group-rp', filter);
  assert.deepEqual(request, ['rp', filter]);
});

test('color picker previews a wheel selection and only persists on apply', async () => {
  const { create } = setup('categoryColorPicker.js', 'TFRCategoryColorPicker');
  let selected, rerenders = 0;
  const picker = create({ t: key => key, sanitizeColor: value => value || '', applyColor() {},
    colorFromEvent: () => '#abcdef', onChange: () => rerenders++ });
  const wrapper = picker.render({ label: 'Color', currentColor: '#123456', onApply: value => { selected = value; }, onClear() {} });
  const options = wrapper.children[1];
  const palette = options.children.at(-1);
  const event = { preventDefault() {}, stopPropagation() {} };
  palette.children[0].events.pointerdown(event);
  assert.equal(selected, undefined);
  assert.equal(options.children[1].textContent, '#abcdef');
  await palette.children[1].events.click(event);
  assert.equal(selected, '#abcdef');
  assert.equal(rerenders, 1);
});

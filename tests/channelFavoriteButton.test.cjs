const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loadChannelFavoriteButton = (documentRef) => {
  const context = vm.createContext({
    window: {},
    document: documentRef,
    console,
    HTMLElement: class HTMLElement {},
    HTMLButtonElement: class HTMLButtonElement {},
    MutationObserver: class MutationObserver {},
    requestAnimationFrame() {},
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout
  });
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/channelFavoriteButton.js'),
    'utf8'
  );
  vm.runInContext(source, context);
  return context.window.TFRChannelFavoriteButton.create({
    t: (key) => key,
    LocationWatcher: class LocationWatcher {},
    getChannelFromLocation: () => 'example'
  });
};

test('an attached favorite button keeps its slot during Twitch panel mutations', () => {
  const button = {
    disabled: false,
    classList: { toggle() {}, remove() {} },
    set innerHTML(value) {
      this.markup = value;
    }
  };
  const documentRef = {
    body: { contains: (node) => node === button },
    querySelectorAll: () => []
  };
  const ChannelFavoriteButton = loadChannelFavoriteButton(documentRef);
  const instance = new ChannelFavoriteButton({
    getState: () => ({ favorites: {} })
  });
  instance.currentLogin = 'example';
  instance.button = button;
  instance.findAnchor = () => {
    throw new Error('the anchor must not be recomputed while the button is attached');
  };

  instance.tryMountButton();

  assert.match(button.markup, /tfr-inline-button__icon/);
});

test('favorite button mounting is skipped outside channel routes', () => {
  const documentRef = {
    body: { contains: () => false },
    querySelectorAll: () => []
  };
  const ChannelFavoriteButton = loadChannelFavoriteButton(documentRef);
  const instance = new ChannelFavoriteButton({
    getState: () => ({ favorites: {} })
  });
  let anchorLookups = 0;
  instance.currentLogin = null;
  instance.findAnchor = () => {
    anchorLookups += 1;
    return null;
  };

  instance.scheduleMountButton();

  assert.equal(anchorLookups, 0);
  assert.equal(instance.mountFrame, null);
});

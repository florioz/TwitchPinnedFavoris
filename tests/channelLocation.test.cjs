const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: { location: { pathname: '/' } } });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/channelLocation.js'), 'utf8'),
  context
);
const { getChannelFromLocation } = context.window.TFRChannelLocation;

test('channel location resolves real Twitch channel routes', () => {
  assert.equal(getChannelFromLocation({ pathname: '/Nikos' }), 'nikos');
  assert.equal(getChannelFromLocation({ pathname: '/Nikos/videos' }), 'nikos');
});

test('channel location rejects Twitch global pages', () => {
  [
    '/', '/drops/inventory', '/directory/following', '/settings/profile',
    '/subscriptions', '/wallet', '/search'
  ].forEach((pathname) => assert.equal(getChannelFromLocation({ pathname }), null, pathname));
});

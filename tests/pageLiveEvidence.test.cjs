const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/contentScripts/main.js'), 'utf8');
const expression = source.slice(source.indexOf('  const inferCurrentPageLiveData ='), source.indexOf('  const createOfflineLiveData ='));
const setup = () => {
  const location = { channel: 'test' };
  const document = { offline: false, querySelector() { return this.offline ? {} : null; } };
  const ctx = vm.createContext({ window: { location }, document, getChannelFromLocation: (loc) => loc.channel,
    getFirstText: () => '', parseViewerText: () => 0, DEFAULT_AVATAR: 'avatar' });
  vm.runInContext(expression + '\nglobalThis.infer = inferCurrentPageLiveData;', ctx);
  return { infer: ctx.infer, location, document };
};
test('visiting a channel with chat and player cannot turn missing or offline data into live data', () => {
  const s = setup();
  assert.equal(s.infer('test', {}), null);
  assert.equal(s.infer('test', { isLive: false }), null);
  assert.equal(s.infer('test', { isLive: true, fetchFailed: true, startedAt: '2026-09-27' }), null);
});
test('live metadata follows confirmed transitions and ignores the previous channel during navigation', () => {
  const s = setup();
  const confirmed = { isLive: true, startedAt: '2026-09-27T12:00:00Z', lastConfirmedAt: Date.now() };
  assert.equal(s.infer('test', { ...confirmed, lastConfirmedAt: Date.now() - 360000 }), null);
  assert.equal(s.infer('test', confirmed).lastConfirmedAt, confirmed.lastConfirmedAt);
  assert.equal(s.infer('test', confirmed).isLive, true);
  s.document.offline = true;
  assert.equal(s.infer('test', confirmed), null);
  s.document.offline = false;
  assert.equal(s.infer('test', { ...confirmed, isLive: false }), null);
  assert.equal(s.infer('test', confirmed).startedAt, confirmed.startedAt);
  s.location.channel = 'another';
  assert.equal(s.infer('test', confirmed), null);
});

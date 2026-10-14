const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const context = { window: {}, console };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../src/contentScripts/features/twitchChatEvents.js'), 'utf8'), context);
const { parse, create } = context.window.TFRTwitchChatEvents;
const msg = (id, at = 1000) => `@id=${id};user-id=42;display-name=Alice;tmi-sent-ts=${at} :alice!alice@alice.tmi.twitch.tv PRIVMSG #channel :hello`;
const sanction = (at = 2000, duration = ';ban-duration=600') => `@target-user-id=42;tmi-sent-ts=${at}${duration} :tmi.twitch.tv CLEARCHAT #channel :alice`;
const harness = () => {
  const sockets = []; let tick; let time = 10000;
  class Socket { constructor(url) { this.url = url; this.sent = []; sockets.push(this); } send(s) { this.sent.push(s); } close() { this.closed = true; this.onclose?.(); } }
  const win = { location: { pathname: '/channel' }, setInterval(fn) { tick = fn; return 1; }, clearInterval() {} };
  const service = create({ windowRef: win, Socket, now: () => time });
  const events = []; const stop = service.subscribe(e => events.push(e));
  const feed = text => sockets.at(-1).onmessage({ data: text + '\r\n' });
  return { service, sockets, events, stop, feed, win, tick: () => tick(), advance: ms => { time += ms; } };
};
test('server timeout, permanent ban and single deletion are distinct', () => {
  assert.equal(parse(sanction()).duration, 600);
  assert.equal(parse(sanction(2000, '')).isPermanent, true);
  assert.equal(parse(sanction(2000, ';ban-duration=oops')), null);
  assert.equal(parse('@login=alice;target-msg-id=m;tmi-sent-ts=3000 :tmi.twitch.tv CLEARMSG #channel :hello').messageId, 'm');
});
test('user text and forged server prefixes cannot turn into sanctions', () => {
  const s = harness();
  s.feed(msg('m') + '\r\n' + msg('attack').replace(':hello', ':CLEARCHAT #channel :victim'));
  s.feed(sanction().replace(':tmi.twitch.tv ', ':attacker!attacker@attacker.tmi.twitch.tv '));
  assert.equal(s.service.getMessageState('m').deleted, false);
  assert.equal(s.events.filter(e => e.source).length, 0);
  assert.equal(parse('alice banned victim for 600 seconds'), null);
  s.stop();
});
test('latest server sanction applies to old messages, never newer messages or another channel', () => {
  const s = harness(); s.feed(msg('m')); s.feed(sanction());
  assert.equal(s.service.getMessageState('m').action.duration, 600);
  s.feed(sanction(3000, '')); assert.equal(s.service.getMessageState('m').action.type, 'ban');
  s.feed(sanction(2500)); assert.equal(s.service.getMessageState('m').action.type, 'ban');
  s.feed(msg('new', 4000)); assert.equal(s.service.getMessageState('new').deleted, false);
  s.feed(sanction(5000).replace('#channel', '#other')); assert.equal(s.service.getMessageState('new').deleted, false);
  s.win.location.pathname = '/other'; s.tick(); assert.equal(s.service.getMessageState('m'), null);
  assert.equal(s.sockets[0].closed, true); s.stop();
});
test('deletion arriving before message is reconciled by exact ID', () => {
  const s = harness(); s.feed('@login=alice;target-msg-id=m;tmi-sent-ts=3000 :tmi.twitch.tv CLEARMSG #channel :hello');
  s.feed(msg('m')); s.feed(msg('reply'));
  assert.equal(s.service.getMessageState('m').deleted, true);
  assert.equal(s.service.getMessageState('reply').deleted, false); s.stop();
});
test('read-only connection answers keepalive and reconnects with backoff', () => {
  const s = harness(); s.sockets[0].onopen();
  assert.ok(s.sockets[0].sent.includes('JOIN #channel'));
  assert.equal(s.sockets[0].sent.some(x => /^PRIVMSG|^PASS/.test(x)), false);
  s.feed('PING :tmi.twitch.tv'); assert.ok(s.sockets[0].sent.includes('PONG :tmi.twitch.tv'));
  s.sockets[0].close(); s.tick(); assert.equal(s.sockets.length, 1);
  s.advance(5000); s.tick(); assert.equal(s.sockets.length, 2); s.stop();
});


test('navigation isolates message state and late events before the polling tick', () => {
  const s = harness();
  s.feed(msg('old')); s.feed(sanction());
  const oldSocket = s.sockets[0];
  s.win.location.pathname = '/other';
  assert.equal(s.service.getMessageState('old'), null);
  oldSocket.onmessage({ data: sanction(3000) + '\r\n' });
  assert.equal(s.events.at(-1).type, 'reset');
  assert.equal(s.events.at(-1).channel, '/other');
  s.feed(sanction(4000).replace('#channel', '#other'));
  assert.equal(s.events.at(-1).channel, '/other');
  oldSocket.onmessage({ data: sanction(5000) + '\r\n' });
  assert.equal(s.events.at(-1).channel, '/other');
  s.stop();
});

test('separate chat pages never share sanctions for the same user', () => {
  const a = harness(), b = harness();
  b.win.location.pathname = '/popout/other/chat'; b.tick();
  a.feed(msg('same')); b.feed(msg('same').replace('#channel', '#other'));
  a.feed(sanction());
  assert.equal(a.service.getMessageState('same').deleted, true);
  assert.equal(b.service.getMessageState('same').deleted, false);
  a.stop(); b.stop();
});


test('sanction history resolves the last server message before the sanction by user ID', () => {
  const s = harness();
  s.feed(msg('first', 1000)); s.feed(msg('last', 1500));
  s.feed(msg('someone-else', 1800).replace('user-id=42', 'user-id=99'));
  s.feed(sanction());
  const action = s.events.at(-1);
  s.feed(msg('after', 3000));
  assert.equal(s.service.getActionMessage(action).messageId, 'last');
  assert.equal(s.service.getActionMessage(action).text, 'hello');
  assert.equal(s.service.getActionMessage({ ...action, channel: '/other' }), null);
  s.win.location.pathname = '/other';
  assert.equal(s.service.getActionMessage(action), null);
  s.stop();
});

test('late server messages fill sanction history and deletions keep their exact target', () => {
  const s = harness(); s.feed(sanction());
  const action = s.events.at(-1);
  assert.equal(s.service.getActionMessage(action), null);
  s.feed(msg('late'));
  assert.equal(s.events.at(-1).type, 'refresh');
  assert.equal(s.service.getActionMessage(action).messageId, 'late');
  s.feed(msg('latest', 1500));
  s.feed('@login=alice;target-msg-id=late;tmi-sent-ts=3000 :tmi.twitch.tv CLEARMSG #channel :hello');
  assert.equal(s.service.getActionMessage(s.events.at(-1)).messageId, 'late');
  s.stop();
});

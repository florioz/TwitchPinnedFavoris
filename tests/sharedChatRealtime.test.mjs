import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedChatRealtime } from '../src/background/sharedChatRealtime.mjs';

test('private chat channel keeps credentials in background and emits only invalidations', async () => {
  const sockets = [], events = [], timeouts = new Map(), intervals = new Map();
  let id = 0;
  class Socket {
    constructor(url) { this.url = url; this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.closed = true; }
  }
  const realtime = createSharedChatRealtime({
    config: { supabaseUrl: 'https://project.supabase.co', publishableKey: 'public-key' },
    getSession: async () => ({ accessToken: 'private-token' }), Socket,
    timers: {
      setTimeout: fn => { timeouts.set(++id, fn); return id; }, clearTimeout: key => timeouts.delete(key),
      setInterval: fn => { intervals.set(++id, fn); return id; }, clearInterval: key => intervals.delete(key)
    }
  });
  const stop = realtime.subscribe('space', event => events.push(event));
  await new Promise(setImmediate);
  const socket = sockets[0]; socket.onopen();
  assert.equal(socket.url.includes('private-token'), false);
  assert.equal(socket.sent[0].payload.config.private, true);
  socket.onmessage({ data: JSON.stringify({ topic: 'realtime:tfr-chat:space', event: 'phx_reply', ref: '1', payload: { status: 'ok' } }) });
  socket.onmessage({ data: JSON.stringify({ topic: 'realtime:tfr-chat:other', event: 'broadcast', payload: { event: 'changed' } }) });
  socket.onmessage({ data: JSON.stringify({ topic: 'realtime:tfr-chat:space', event: 'broadcast', payload: { event: 'changed', payload: { body: 'ignored' } } }) });
  assert.deepEqual(events, [{ type: 'status', ready: true }, { type: 'changed' }]);
  stop();
  assert.equal(socket.closed, true);
  assert.equal(timeouts.size, 0);
  assert.equal(intervals.size, 0);
});

test('subscription disposed during session retrieval never opens a socket', async () => {
  let finish;
  let opened = 0;
  const realtime = createSharedChatRealtime({ config: {}, getSession: () => new Promise(resolve => { finish = resolve; }), Socket: class { constructor() { opened++; } } });
  const stop = realtime.subscribe('space', () => {});
  stop(); finish({ accessToken: 'secret' });
  await new Promise(setImmediate);
  assert.equal(opened, 0);
});

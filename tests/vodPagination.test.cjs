const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../panel/vodClient.js'), 'utf8');

test('VOD client reports HTTP and GraphQL failures instead of treating them as empty archives', async () => {
  const ctx = vm.createContext({}); vm.runInContext(source, ctx);
  const http = ctx.TFRVodClient.create({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(http.fetchChannelVods('demo'), /503/);
  const graphql = ctx.TFRVodClient.create({ fetchImpl: async () => ({ ok: true, json: async () => ({ errors: [{ message: 'Unavailable' }] }) }) });
  await assert.rejects(graphql.fetchChannelVods('demo'), /Unavailable/);
  await assert.rejects(graphql.fetchVideoClips({ login: 'demo' }, { id: '1', createdAt: '2026-10-01', lengthSeconds: 60 }), /Unavailable/);
});
test('archives paginate beyond first page, deduplicate and stop at the history boundary', async () => {
  const calls = [];
  const node = (id, date) => ({ cursor: id, node: { id, createdAt: date, lengthSeconds: 3600 } });
  const pages = [
    [node('1', '2026-10-01T00:00:00Z')],
    [node('1', '2026-10-01T00:00:00Z'), node('2', '2026-09-01T00:00:00Z')],
    [node('3', '2026-01-01T00:00:00Z')]
  ];
  const ctx = vm.createContext({ Date, state: { favorites: {} }, DEFAULT_AVATAR: '', VIDEO_LIMIT: 60,
    TWITCH_GRAPHQL_ENDPOINT: '', TWITCH_CLIENT_ID: '', VODS_QUERY: '',
    startOfDay: date => date, oldestTimelineDay: () => Date.parse('2026-08-01T00:00:00Z'),
    fetch: async (_url, request) => {
      calls.push(JSON.parse(request.body).variables.cursor);
      return { ok: true, json: async () => ({ data: { user: { login: 'demo', videos: { edges: pages.shift(), pageInfo: { hasNextPage: true } } } } }) };
    }
  });
  vm.runInContext(source, ctx);
  const result = await ctx.TFRVodClient.create().fetchChannelVods('demo', { oldest: Date.parse('2026-08-01T00:00:00Z') });
  assert.deepEqual(calls, [null, '1', '2']);
  assert.deepEqual(Array.from(result.videos, v => v.id), ['1', '2', '3']);
});

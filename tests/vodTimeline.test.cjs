const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = vm.createContext({ Date });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../panel/vodTimeline.js'), 'utf8'), ctx);
const timeline = ctx.TFRVodTimeline;
const start = Date.parse('2026-09-27T00:00:00Z');
const video = (createdAt, lengthSeconds) => ({ createdAt, lengthSeconds });

test('60-day range uses calendar days including DST and includes older archives', () => {
  const before = process.env.TZ;
  process.env.TZ = 'Europe/Paris';
  try {
    const last = new Date(2026, 9, 25).getTime();
    const range = timeline.periodRange(last, 60);
    const expected = new Date(2026, 9, 25); expected.setDate(expected.getDate() - 59);
    assert.equal(range.start, expected.getTime());
    assert.equal(range.end - range.start, (60 * 24 + 1) * 3600000);
    assert.ok(timeline.interval(video(new Date(range.start).toISOString(), 3600), range.start, range.end));
    assert.equal(timeline.periodRange(last, 1).start, last);
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});

test('timeline includes overnight streams and clips only the visible interval', () => {
  const band = timeline.interval(video('2026-09-26T23:00:00Z', 7200), start, start + 86400000);
  assert.equal(band.left, 0);
  assert.equal(band.width, 100 / 24);
  assert.equal(band.to - band.from, 7200000);
});
test('timeline preserves very short and multi-day streams without overflowing', () => {
  assert.ok(timeline.interval(video('2026-09-27T00:00:00Z', 1), start, start + 86400000).width > 0);
  assert.equal(timeline.interval(video('2026-09-26T00:00:00Z', 259200), start, start + 86400000).width, 100);
  assert.equal(timeline.interval(video('invalid', 42), start, start + 86400000), null);
  assert.equal(timeline.interval(video('2026-09-28T00:00:00Z', 42), start, start + 86400000), null);
});
test('overlapping archives of the same streamer use separate lanes', () => {
  const bands = timeline.layout([video('2026-09-27T01:00:00Z', 7200), video('2026-09-27T02:00:00Z', 7200), video('2026-09-27T04:00:00Z', 60)], start, start + 86400000);
  assert.deepEqual(Array.from(bands, (band) => band.lane), [0, 1, 0]);
});
test('local day boundaries follow the calendar through daylight saving changes', () => {
  const before = process.env.TZ;
  process.env.TZ = 'Europe/Paris';
  try {
    const date = new Date(2026, 9, 25).getTime();
    assert.equal(timeline.dayEnd(date) - date, 25 * 3600000);
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});

test('timeline renders many streamer rows with selectable, labelled bands and zoom', () => {
  const makeNode = () => ({ children: [], style: { setProperty() {} }, classList: { toggle() {} },
    replaceChildren() { this.children = []; }, appendChild(node) { this.children.push(node); },
    append(...nodes) { this.children.push(...nodes); }, setAttribute(name, value) { this[name] = value; },
    addEventListener(_name, fn) { this.click = fn; } });
  ctx.document = { createElement: makeNode };
  const host = makeNode(); let selected;
  const rows = Array.from({ length: 100 }, (_, index) => ({ login: `streamer${index}`, videos: [{
    ...video('2026-09-27T02:00:00Z', 3600), id: String(index), title: 'Stream title'
  }] }));
  timeline.render(host, rows, start, { locale: 'fr', zoom: 2, formatDuration: String,
    onSelect: (channel, item) => { selected = [channel.login, item.id]; } });
  const chart = host.children[0]; assert.equal(chart.style.minWidth, '1800px');
  assert.equal(chart.children.length, 102);
  const band = chart.children[1].children[1].children[0];
  assert.match(band['aria-label'], /streamer0/); band.click();
  const selection = host.children[1];
  assert.equal(selection.hidden, false);
  assert.equal(selection.children[1].href, 'https://www.twitch.tv/videos/0?t=0s');
  selection.children[2].click();
  assert.deepEqual(selected, ['streamer0', '0']);
  timeline.render(host, [], start, { locale: 'en', formatDuration: String, onSelect() {} });
  assert.equal(host.children.length, 2); assert.equal(host.children[0].children.length, 2);
});

test('focused range includes all archives, with full day and empty fallbacks', () => {
  const day = new Date(2026, 8, 27).getTime();
  const rows = [{ videos: [video(new Date(day + 12 * 3600000).toISOString(), 3600)] }];
  const range = timeline.visibleRange(rows, day);
  assert.equal(range.start, day + 11.5 * 3600000);
  assert.equal(range.end, day + 13.5 * 3600000);
  assert.equal(timeline.visibleRange(rows, day, true).start, day);
  assert.equal(timeline.visibleRange([], day).end, timeline.dayEnd(day));
});

test('playback offsets use the archive start even across midnight and clamp to its duration', () => {
  const vod = { ...video('2026-09-26T23:00:00Z', 7200), id: '123' };
  assert.equal(timeline.playbackUrl(vod, start), 'https://www.twitch.tv/videos/123?t=3600s');
  assert.equal(timeline.offsetAt(vod, start - 86400000), 0);
  assert.equal(timeline.offsetAt(vod, start + 86400000), 7199);
  assert.equal(timeline.playbackUrl({ ...vod, id: 'bad/path' }, start), null);
});

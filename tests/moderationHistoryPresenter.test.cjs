const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationHistoryPresenter.js'),
  'utf8'
), context);

const presenter = context.window.TFRModerationHistoryPresenter.create({
  t: (key, values = {}) => values.duration ? `${key}:${values.duration}` : key,
  formatDuration: (seconds) => `${seconds / 60} min`,
  formatTimestamp: () => '12:34'
});

test('moderation history presenter distinguishes permanent and temporary bans', () => {
  assert.equal(
    presenter.formatEntry({ type: 'ban', isPermanent: true }).actionLabel,
    'moderation.history.action.banPermanent'
  );
  assert.equal(
    presenter.formatEntry({ type: 'timeout', duration: 600 }).actionLabel,
    'moderation.history.action.timeout:10 min'
  );
});

test('moderation history presenter formats deletion metadata and truncation', () => {
  const entry = presenter.formatEntry({ type: 'deletion', moderator: 'mod', timestamp: Date.now() });
  assert.equal(entry.actionLabel, 'moderation.history.action.deletion');
  assert.equal(entry.metaLabel, 'moderation.history.meta.by');
  assert.equal(entry.timeLabel, '12:34');
  assert.equal(presenter.truncate('abcdefgh', 6), 'abc...');
});

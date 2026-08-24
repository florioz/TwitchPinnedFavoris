const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/019_extension_usage_presence.sql'),
  'utf8'
);

test('presence migration exposes only secured RPC functions to public clients', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.tfr_extension_presence from anon, authenticated/i);
  assert.match(migration, /security definer/gi);
  assert.match(migration, /grant execute on function public\.tfr_touch_extension_presence/i);
  assert.match(migration, /grant execute on function public\.tfr_remove_extension_presence/i);
  assert.match(migration, /grant execute on function public\.tfr_get_extension_presence_count/i);
});

test('presence migration validates anonymous hashes and bounds retention', () => {
  assert.match(migration, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(migration, /interval '2 minutes'/i);
  assert.match(migration, /interval '7 days'/i);
});

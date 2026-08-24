const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const {
  SETUP_PATH,
  buildSupabaseSetup,
  listMigrations
} = require('../scripts/supabaseSetup');

test('Supabase setup is generated from every numbered migration in order', () => {
  const migrations = listMigrations();
  const setup = buildSupabaseSetup();
  assert.ok(migrations.length > 0);
  assert.ok(migrations.includes('016_shared_space_chat.sql'));
  assert.ok(migrations.includes('017_shared_space_chat_reactions.sql'));
  assert.ok(migrations.includes('018_shared_space_chat_editing.sql'));
  migrations.forEach((migration, index) => {
    const position = setup.indexOf(`-- ${migration}`);
    assert.ok(position >= 0, `${migration} is missing`);
    if (index > 0) assert.ok(position > setup.indexOf(`-- ${migrations[index - 1]}`));
  });
  assert.equal(setup.startsWith('-- TwitchPinnedFavoris'), true);
  assert.equal(setup.trimEnd().endsWith('commit;'), true);
});

test('committed Supabase setup matches the generated content', () => {
  const actual = readFileSync(SETUP_PATH, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(actual, buildSupabaseSetup());
});

const { readFileSync } = require('node:fs');
const { SETUP_PATH, buildSupabaseSetup, listMigrations } = require('./supabaseSetup');

const expected = buildSupabaseSetup();
const actual = readFileSync(SETUP_PATH, 'utf8').replace(/\r\n/g, '\n');
if (actual !== expected) {
  throw new Error('Supabase setup is stale. Run npm run sync:supabase.');
}

console.log(`Supabase setup matches ${listMigrations().length} migrations.`);

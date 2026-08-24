const { readdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { PROJECT_ROOT } = require('./projectPaths');

const MIGRATIONS_DIRECTORY = join(PROJECT_ROOT, 'supabase', 'migrations');
const SETUP_PATH = join(PROJECT_ROOT, 'supabase', 'setup.sql');
const HEADER = [
  '-- TwitchPinnedFavoris - installation Supabase complète',
  '--',
  "-- À exécuter une seule fois dans le SQL Editor d'un nouveau projet Supabase.",
  "-- Ce fichier regroupe les migrations versionnées dans leur ordre d'application.",
  '',
  'begin;',
  ''
];

const listMigrations = () => readdirSync(MIGRATIONS_DIRECTORY)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const buildSupabaseSetup = () => {
  const sections = listMigrations().flatMap((file) => [
    '-- -----------------------------------------------------------------------------',
    `-- ${file}`,
    '-- -----------------------------------------------------------------------------',
    readFileSync(join(MIGRATIONS_DIRECTORY, file), 'utf8').trimEnd(),
    ''
  ]);
  return [...HEADER, ...sections, 'commit;', ''].join('\n');
};

const writeSupabaseSetup = () => {
  const content = buildSupabaseSetup();
  writeFileSync(SETUP_PATH, content);
  return { migrations: listMigrations().length, path: SETUP_PATH };
};

module.exports = {
  SETUP_PATH,
  buildSupabaseSetup,
  listMigrations,
  writeSupabaseSetup
};

if (require.main === module) {
  const result = writeSupabaseSetup();
  console.log(`Supabase setup generated from ${result.migrations} migrations: ${result.path}`);
}

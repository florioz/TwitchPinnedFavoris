const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loadTools = () => {
  const context = vm.createContext({ window: {} });
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/backupTools.js'),
    'utf8'
  );
  vm.runInContext(source, context);
  return context.window.TFRBackupTools;
};

test('backup JSON parser rejects empty and malformed content', () => {
  const tools = loadTools();
  assert.throws(() => tools.parseJson('  '), /Contenu vide/);
  assert.throws(() => tools.parseJson('{oops'), /JSON invalide/);
  assert.deepEqual({ ...tools.parseJson('{"ok":true}') }, { ok: true });
});

test('profile filenames are normalized safely', () => {
  const tools = loadTools();
  assert.equal(tools.slugify('Équipe préférée !'), 'equipe-preferee');
  assert.equal(tools.slugify('***', 'profil'), 'profil');
});

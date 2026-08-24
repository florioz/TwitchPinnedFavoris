const { existsSync, readdirSync, statSync } = require('node:fs');
const { extname, join, relative } = require('node:path');

const PROJECT_ROOT = join(__dirname, '..');
const FIREFOX_SYNC_PAIRS = Object.freeze([
  ['_locales', 'firefox/_locales'],
  ['assets', 'firefox/assets'],
  ['panel', 'firefox/panel'],
  ['src', 'firefox/src'],
  ['styles', 'firefox/styles']
]);
const BROWSER_PACKAGE_ENTRIES = Object.freeze([
  '_locales', 'assets', 'panel', 'src', 'styles', 'PRIVACY.md', 'LICENSE'
]);
const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const isConflictArtifact = (value) => /#\s*(?:edit conflict|name clash)\b/i.test(String(value || ''));

const collectRelativeFiles = (target, base = target) => {
  if (!existsSync(target)) throw new Error(`Missing path: ${relative(PROJECT_ROOT, target)}`);
  if (!statSync(target).isDirectory()) return [relative(base, target) || '.'];
  return readdirSync(target, { withFileTypes: true })
    .filter((entry) => !isConflictArtifact(entry.name))
    .flatMap((entry) => {
      const child = join(target, entry.name);
      return entry.isDirectory() ? collectRelativeFiles(child, base) : [relative(base, child)];
    })
    .sort();
};

const collectJavaScriptFiles = (relativeRoots = ['src', 'panel', 'mobile', 'scripts']) => relativeRoots
  .flatMap((relativeRoot) => {
    const directory = join(PROJECT_ROOT, relativeRoot);
    if (!existsSync(directory)) return [];
    return collectRelativeFiles(directory)
      .filter((file) => JAVASCRIPT_EXTENSIONS.has(extname(file)))
      .map((file) => join(directory, file));
  });

module.exports = {
  BROWSER_PACKAGE_ENTRIES,
  FIREFOX_SYNC_PAIRS,
  PROJECT_ROOT,
  collectJavaScriptFiles,
  collectRelativeFiles,
  isConflictArtifact
};

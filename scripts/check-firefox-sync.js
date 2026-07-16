const { existsSync, readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const root = join(__dirname, '..');
const pairs = [
  ['_locales', 'firefox/_locales'],
  ['assets', 'firefox/assets'],
  ['panel', 'firefox/panel'],
  ['src', 'firefox/src'],
  ['styles', 'firefox/styles'],
  ['manifest.json', 'firefox/manifest.json']
];

const collectFiles = (path, base = path) => {
  if (!existsSync(path)) {
    throw new Error(`Missing path: ${relative(root, path)}`);
  }
  if (!statSync(path).isDirectory()) {
    return [relative(base, path) || '.'];
  }
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      const child = join(path, entry.name);
      return entry.isDirectory()
        ? collectFiles(child, base)
        : [relative(base, child)];
    })
    .sort();
};

for (const [sourceRelative, targetRelative] of pairs) {
  const source = join(root, sourceRelative);
  const target = join(root, targetRelative);
  const sourceFiles = collectFiles(source);
  const targetFiles = collectFiles(target);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(targetFiles)) {
    throw new Error(`Firefox file list differs for ${sourceRelative}. Run npm run sync:firefox.`);
  }
  sourceFiles.forEach((file) => {
    const sourceFile = file === '.' ? source : join(source, file);
    const targetFile = file === '.' ? target : join(target, file);
    if (!readFileSync(sourceFile).equals(readFileSync(targetFile))) {
      throw new Error(`Firefox copy is stale: ${targetRelative}/${file}. Run npm run sync:firefox.`);
    }
  });
}

console.log('Firefox copy matches the primary extension sources.');

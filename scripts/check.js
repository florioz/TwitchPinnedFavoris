const { spawnSync } = require('node:child_process');
const { relative } = require('node:path');
const { collectJavaScriptFiles, PROJECT_ROOT } = require('./projectPaths');

const files = collectJavaScriptFiles();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Syntax check failed: ${relative(PROJECT_ROOT, file)}`);
    process.exit(result.status || 1);
  }
}

console.log(`Checked ${files.length} JavaScript files.`);

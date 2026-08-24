const { cpSync, existsSync, mkdirSync, readFileSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { isConflictArtifact } = require('./projectPaths');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const recreateDirectory = (directory) => {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
};

const copyRequiredEntries = ({ root, destination, entries }) => {
  entries.forEach((entry) => {
    const source = join(root, entry);
    if (!existsSync(source)) throw new Error(`Missing required package entry: ${entry}`);
    cpSync(source, join(destination, entry), {
      recursive: true,
      filter: (candidate) => !isConflictArtifact(candidate)
    });
  });
};

const validateChromeManifest = (manifest) => {
  const forbiddenHosts = new Set(['https://*/*', 'http://*/*', '<all_urls>']);
  const broadHost = (manifest.host_permissions || []).find((host) => forbiddenHosts.has(host));
  if (broadHost) throw new Error(`Refusing Chrome package with broad host permission: ${broadHost}`);
  if ((manifest.permissions || []).includes('scripting')) {
    throw new Error('Refusing Chrome package with unused scripting permission.');
  }
};

const createZipArchive = ({ sourceDirectory, destination, entries = null }) => {
  rmSync(destination, { force: true });
  if (process.platform === 'win32') {
    const archiveEntries = entries?.length ? entries : ['.'];
    execFileSync('tar.exe', [
      '-a', '-c', '-f', destination, '-C', sourceDirectory, ...archiveEntries
    ], { stdio: 'inherit' });
    return;
  }
  execFileSync('zip', ['-qr', destination, ...(entries?.length ? entries : ['.'])], {
    cwd: sourceDirectory,
    stdio: 'inherit'
  });
};

module.exports = {
  copyRequiredEntries,
  createZipArchive,
  readJson,
  recreateDirectory,
  validateChromeManifest
};

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isConflictArtifact } = require('../scripts/projectPaths');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest references existing scripts, styles, pages and icons without duplicates', () => {
  const referenced = [
    ...(manifest.background?.service_worker ? [manifest.background.service_worker] : []),
    ...(manifest.content_scripts || []).flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
    manifest.action?.default_popup,
    manifest.side_panel?.default_path,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {})
  ].filter(Boolean);
  (manifest.content_scripts || []).forEach((entry) => {
    const resources = [...(entry.js || []), ...(entry.css || [])];
    assert.equal(new Set(resources).size, resources.length, 'content script contains duplicate resources');
  });
  new Set(referenced).forEach((relativePath) => {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `missing manifest resource: ${relativePath}`);
  });
});

test('manifest content scripts load every JavaScript feature exactly once', () => {
  const loaded = new Set((manifest.content_scripts || []).flatMap((entry) => entry.js || []));
  const featureFiles = fs.readdirSync(path.join(root, 'src/contentScripts/features'))
    .filter((filename) => filename.endsWith('.js') && !isConflictArtifact(filename))
    .map((filename) => `src/contentScripts/features/${filename}`);
  featureFiles.forEach((file) => assert.equal(loaded.has(file), true, `feature is not loaded: ${file}`));
});

test('side panel scripts exist and load favorite visibility before the panel model', () => {
  const panelPath = path.join(root, manifest.side_panel.default_path);
  const panelSource = fs.readFileSync(panelPath, 'utf8');
  const scriptPaths = Array.from(panelSource.matchAll(/<script\s+src="([^"]+)"/g), (match) => match[1]);
  scriptPaths.forEach((relativePath) => {
    assert.equal(
      fs.existsSync(path.resolve(path.dirname(panelPath), relativePath)),
      true,
      `missing side panel script: ${relativePath}`
    );
  });

  const visibilityIndex = scriptPaths.indexOf('../src/contentScripts/features/favoriteVisibilityTools.js');
  const panelModelIndex = scriptPaths.indexOf('../src/contentScripts/panelModel.js');
  assert.notEqual(visibilityIndex, -1, 'favorite visibility tools are missing from the side panel');
  assert.equal(visibilityIndex < panelModelIndex, true, 'favorite visibility tools must load before panelModel');
});

test('Chrome and Firefox source trees remain byte-for-byte synchronized', () => {
  const sourceFiles = [];
  const visit = (directory, prefix = '') => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      if (isConflictArtifact(entry.name)) return;
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
      else sourceFiles.push(relative);
    });
  };
  visit(path.join(root, 'src'));
  sourceFiles.forEach((relative) => {
    const primary = fs.readFileSync(path.join(root, 'src', relative));
    const firefoxPath = path.join(root, 'firefox/src', relative);
    assert.equal(fs.existsSync(firefoxPath), true, `missing Firefox source: ${relative}`);
    assert.equal(primary.equals(fs.readFileSync(firefoxPath)), true, `stale Firefox source: ${relative}`);
  });
});

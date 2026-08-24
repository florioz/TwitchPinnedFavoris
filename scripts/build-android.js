const { copyFileSync, existsSync, mkdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { PROJECT_ROOT } = require('./projectPaths');
const { readJson } = require('./packageTools');

const manifest = readJson(join(PROJECT_ROOT, 'manifest.json'));
const capacitorPackage = require('@capacitor/cli/package.json');
const capacitor = join(PROJECT_ROOT, 'node_modules', '@capacitor', 'cli', capacitorPackage.bin.cap);
const gradleWrapper = join(PROJECT_ROOT, 'android', 'gradle', 'wrapper', 'gradle-wrapper.jar');
const run = (command, args, cwd = PROJECT_ROOT) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
};

if (!existsSync(capacitor)) throw new Error('Capacitor CLI is missing. Run npm install first.');
if (!existsSync(gradleWrapper)) throw new Error('Android Gradle wrapper is missing.');
run(process.execPath, [capacitor, 'sync', 'android']);
run('java', ['-classpath', gradleWrapper, 'org.gradle.wrapper.GradleWrapperMain', 'assembleDebug'], join(PROJECT_ROOT, 'android'));

const source = join(PROJECT_ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(source)) throw new Error('Android build completed without producing app-debug.apk.');
const dist = join(PROJECT_ROOT, 'dist');
mkdirSync(dist, { recursive: true });
const destination = join(dist, `TwitchFavoritesSidebar-v${manifest.version}.apk`);
copyFileSync(source, destination);
console.log(`Android package ready: ${destination}`);

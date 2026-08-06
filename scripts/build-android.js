const { copyFileSync, existsSync, mkdirSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const capacitorPackage = require('@capacitor/cli/package.json');
const capacitor = join(root, 'node_modules', '@capacitor', 'cli', capacitorPackage.bin.cap);
const gradleWrapper = join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.jar');
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
};

if (!existsSync(capacitor)) throw new Error('Capacitor CLI is missing. Run npm install first.');
if (!existsSync(gradleWrapper)) throw new Error('Android Gradle wrapper is missing.');
run(process.execPath, [capacitor, 'sync', 'android']);
run('java', ['-classpath', gradleWrapper, 'org.gradle.wrapper.GradleWrapperMain', 'assembleDebug'], join(root, 'android'));

const source = join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(source)) throw new Error('Android build completed without producing app-debug.apk.');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
const destination = join(dist, `TwitchFavoritesSidebar-v${manifest.version}.apk`);
copyFileSync(source, destination);
console.log(`Android package ready: ${destination}`);

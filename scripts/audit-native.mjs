import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import worker from '../worker/index.js';

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), 'utf8');
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function pngDimensions(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a' || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const [packageJson, capacitorConfig, projectFile, infoPlist, workflow, appSource, cloudSync, masterCatalog, serviceWorker, indexHtml, workerSource, galleryCss, finalCss, professionalCss] = await Promise.all([
  read('package.json').then(JSON.parse),
  read('capacitor.config.json').then(JSON.parse),
  read('ios/App/App.xcodeproj/project.pbxproj'),
  read('ios/App/App/Info.plist'),
  read('.github/workflows/build-ios-ipa.yml'),
  read('src/app.js'),
  read('src/components/CloudSync.js'),
  read('src/components/MasterCatalog.js'),
  read('sw.js'),
  read('index.html'),
  read('worker/index.js'),
  read('src/styles/gallery.css'),
  read('src/styles/final-complete-v9.css'),
  read('src/styles/professional-v20.css')
]);

check(packageJson.dependencies?.['@capacitor/core'] === '6.2.1', 'Capacitor core must remain pinned to the iOS 13-compatible 6.2.1 release.');
check(packageJson.dependencies?.['@capacitor/ios'] === '6.2.1', 'Capacitor iOS must remain pinned to 6.2.1.');
check(packageJson.devDependencies?.['@capacitor/cli'] === '6.2.1', 'Capacitor CLI must match the native runtime.');
check(capacitorConfig.appId === 'com.gibly.skylandersvault', 'Native bundle ID is incorrect.');
check(capacitorConfig.webDir === 'dist/client', 'Native app must bundle the production client build.');
check(capacitorConfig.plugins?.CapacitorHttp?.enabled === true, 'Native HTTP support must remain enabled for the hosted sync API.');
check(capacitorConfig.plugins?.CapacitorCookies?.enabled === true, 'Native cookie support must remain enabled for existing authorized sessions.');
check((projectFile.match(/IPHONEOS_DEPLOYMENT_TARGET = 13\.0;/g) || []).length >= 2, 'iOS 13 deployment support is missing.');
check((projectFile.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.gibly\.skylandersvault;/g) || []).length === 2, 'Native bundle ID is not applied to both build configurations.');
check((projectFile.match(/MARKETING_VERSION = 1\.3\.0;/g) || []).length === 2, 'Native marketing version must match app version 1.3.0.');
check((projectFile.match(/CURRENT_PROJECT_VERSION = 4;/g) || []).length === 2, 'Native build number must be 4.');
check(infoPlist.includes('<string>Skylanders Vault</string>'), 'Native display name is missing.');
check(infoPlist.includes('<key>NSCameraUsageDescription</key>'), 'Camera permission text is missing.');
check(infoPlist.includes('<key>NSPhotoLibraryUsageDescription</key>'), 'Photo-library permission text is missing.');
check(infoPlist.includes('<key>WKAppBoundDomains</key>') && infoPlist.includes('gibly-skylanders-vault.neumanng98.chatgpt.site'), 'The private sync host is missing from the iOS app-bound domains.');
check(workflow.includes('CODE_SIGNING_ALLOWED=NO'), 'Unsigned IPA workflow must disable code signing.');
check(workflow.includes('Skylanders-Vault-unsigned.ipa'), 'IPA workflow output name is missing.');
check(appSource.includes("const APP_VERSION = '1.3.0';"), 'In-app update version does not match the native release.');
check(appSource.includes('releases/latest') && appSource.includes('Skylanders-Vault-unsigned.ipa'), 'Verified release update checking is missing.');
check(indexHtml.includes('data-app-update-panel') && indexHtml.includes('data-download-app-update'), 'The in-app update controls are missing.');
check(serviceWorker.includes("gibly-core-stable-v21"), 'The update release must use the stable-v21 cache.');
check(serviceWorker.includes('requestUrl.origin !== self.location.origin'), 'External release checks must bypass the offline asset cache.');
check(cloudSync.includes("['capacitor:', 'ionic:'].includes(location.protocol)"), 'Native runtime detection is missing.');
check(cloudSync.includes('Bearer ${nativeSession}'), 'Native authenticated sync is missing.');
check(masterCatalog.includes('resolveCloudResourceUrl(photo.url)'), 'Native personal-photo URL resolution is missing.');
check(!indexHtml.includes('data-pairing') && !cloudSync.includes('/api/pair'), 'The pairing-code interface or request path is still present.');
check(!workerSource.includes("url.pathname === '/api/pair'"), 'The removed pairing endpoint is still routed.');
check(masterCatalog.includes("sort: 'series order'") && masterCatalog.includes('compareCatalogCards'), 'Canonical series ordering is missing.');
check(masterCatalog.includes('catalog-grid__chapter') && masterCatalog.includes('chapterKey(card, state)'), 'Visible full-series catalog chapters are missing.');
check(professionalCss.includes('grid-template-columns: repeat(9') && professionalCss.includes('.series-nav__game:not(.series-nav__home)'), 'The complete non-scrolling series menu is missing.');
check(finalCss.includes('filter: none !important;') && !finalCss.includes('grayscale(0.42)'), 'Card artwork is still being desaturated.');
check(professionalCss.includes('html.legacy-ipad .app-header') && professionalCss.includes('backdrop-filter: none !important'), 'Legacy iPad performance fallbacks are missing.');
check(galleryCss.includes('font-family: "Vault Manrope"') && galleryCss.includes('font-family: "Vault Space Grotesk"'), 'Bundled custom fonts are not registered.');

const iconBuffer = await readFile(resolve(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
const icon = pngDimensions(iconBuffer);
check(icon?.width === 1024 && icon?.height === 1024, 'Native app icon must be 1024 by 1024.');

for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  const path = resolve(root, 'ios/App/App/Assets.xcassets/Splash.imageset', name);
  const dimensions = pngDimensions(await readFile(path));
  check(dimensions?.width === 2732 && dimensions?.height === 2732, `${name} must be 2732 by 2732.`);
  check((await stat(path)).size > 10000, `${name} appears to be empty.`);
}

for (const name of ['vault-manrope-latin.woff2', 'vault-space-grotesk-latin.woff2']) {
  check((await stat(resolve(root, 'assets/fonts', name))).size > 20000, `${name} is missing or incomplete.`);
}

const origin = 'capacitor://localhost';
const optionsResponse = await worker.fetch(new Request('https://vault.example/api/state', {
  method: 'OPTIONS',
  headers: { origin }
}), {});
check(optionsResponse.status === 204, 'Native CORS preflight did not return 204.');
check(optionsResponse.headers.get('access-control-allow-origin') === origin, 'Native CORS origin was not returned.');
check(optionsResponse.headers.get('access-control-allow-headers')?.includes('authorization'), 'Native CORS does not allow the session header.');

const env = {
  VAULT_NATIVE_SESSION_SECRET: 'VAULT-TEST-2026',
  VAULT_OWNER_EMAIL: 'owner@example.com'
};
const removedPairingResponse = await worker.fetch(new Request('https://vault.example/api/pair', {
  method: 'POST',
  headers: { origin, 'content-type': 'application/json', 'x-vault-native': 'ios' },
  body: JSON.stringify({ code: 'unused' })
}), env);
check(removedPairingResponse.status === 401, 'The retired pairing endpoint must not authorize a device.');

const normalizedSecret = env.VAULT_NATIVE_SESSION_SECRET.toUpperCase().replace(/[^A-Z0-9]/g, '');
const sessionToken = createHash('sha256').update(`gibly-vault-session-v1:${normalizedSecret}`).digest('hex');

const authenticatedResponse = await worker.fetch(new Request('https://vault.example/api/state', {
  headers: { origin, authorization: `Bearer ${sessionToken}` }
}), env);
check(authenticatedResponse.status === 503, 'Native bearer authentication did not reach the configured-service check.');
check(authenticatedResponse.headers.get('access-control-allow-origin') === origin, 'Authenticated native response is missing CORS headers.');

if (errors.length) {
  console.error(`Native audit failed with ${errors.length} issue(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('Native audit passed: iOS 13 wrapper, custom fonts, complete menus, canonical card order, code-free auth behavior, update checker, unsigned IPA workflow, sync, and photo routing are ready.');

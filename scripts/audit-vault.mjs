import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_YEARS = {
  "Spyro's Adventure": 2011,
  Giants: 2012,
  'SWAP Force': 2013,
  'Trap Team': 2014,
  SuperChargers: 2015,
  Imaginators: 2016
};
const EXCLUDED_CATEGORIES = new Set(['Pack / Set', 'Prototype / Unreleased', 'Villain Reference']);
const UNRELEASED_IDS = new Set([
  'catalog-11513604',
  'catalog-11513621',
  'catalog-11513645',
  'catalog-11513653',
  'catalog-11513673',
  'catalog-58496'
]);
const EONS_ELITE_RELEASE_GAMES = {
  'Chop Chop': 'Trap Team',
  Eruptor: 'Trap Team',
  'Gill Grunt': 'Trap Team',
  Spyro: 'Trap Team',
  'Stealth Elf': 'Trap Team',
  Terrafin: 'Trap Team',
  'Trigger Happy': 'Trap Team',
  Whirlwind: 'Trap Team',
  Boomer: 'SuperChargers',
  'Dino-Rang': 'SuperChargers',
  'Ghost Roaster': 'SuperChargers',
  'Slam Bam': 'SuperChargers',
  Voodood: 'SuperChargers',
  Zook: 'SuperChargers'
};
const SPECIAL_RELEASE_GAMES = {
  'Portal Of Power [Glow In The Dark]': 'Giants',
  'Sir Hoodington': 'Imaginators',
  'Spyro - E3, 2011': "Spyro's Adventure"
};

const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  values.forEach((value) => {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  });
  return [...repeated];
}

function isCollectible(card) {
  return !UNRELEASED_IDS.has(card?.id) && !EXCLUDED_CATEGORIES.has(card?.category);
}

function effectiveReleaseGame(card) {
  const stated = String(card?.scl?.allInfo?.['Released With'] || '').trim();
  if (GAME_YEARS[stated]) return stated;
  if (/battleground/i.test(stated)) return 'Giants';
  const eliteName = card.name.match(/^Eon['’]s Elite (.+)$/)?.[1] || '';
  return EONS_ELITE_RELEASE_GAMES[eliteName] || SPECIAL_RELEASE_GAMES[card.name] || card.game || '';
}

async function json(relativePath) {
  return JSON.parse(await readFile(resolve(ROOT, relativePath), 'utf8'));
}

async function pathExists(relativePath) {
  try {
    await access(resolve(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function filesUnder(relativePath) {
  const directory = resolve(ROOT, relativePath);
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = `${relativePath}/${entry.name}`.replaceAll('\\', '/');
    if (entry.isDirectory()) output.push(...await filesUnder(child));
    else output.push(child);
  }
  return output;
}

const [catalog, details, elements, traps, villains, masterCatalog, manifest, ipadManifest] = await Promise.all([
  json('src/data/catalog.json'),
  json('src/data/catalog-details.json'),
  json('src/data/elements.json'),
  json('src/data/traps.json'),
  json('src/data/villains.json'),
  json('src/data/master-catalog.json'),
  json('manifest.webmanifest'),
  json('public/manifest-ipad.webmanifest')
]);

check(Array.isArray(catalog.cards), 'catalog.json must contain a cards array.');
check(catalog.cards.length === catalog.meta.totalCards, 'catalog meta totalCards does not match the card array.');
check(masterCatalog.cards?.length === catalog.cards.length, 'master-catalog.json and catalog.json card totals differ.');
check(duplicates(catalog.cards.map((card) => card.id)).length === 0, 'Catalog card IDs are not unique.');
check(duplicates(traps.map((trap) => trap.id)).length === 0, 'Trap IDs are not unique.');
check(duplicates(villains.map((villain) => villain.id)).length === 0, 'Villain IDs are not unique.');

const collectible = catalog.cards.filter(isCollectible);
check(collectible.length === 640, `Expected 640 obtainable cards; found ${collectible.length}.`);
check(collectible.every((card) => !EXCLUDED_CATEGORIES.has(card.category)), 'A reference-only category leaked into the obtainable collection.');
check([...UNRELEASED_IDS].every((id) => !collectible.some((card) => card.id === id)), 'An unreleased card leaked into the obtainable collection.');

const effectiveCounts = Object.fromEntries(Object.keys(GAME_YEARS).map((game) => [
  game,
  collectible.filter((card) => effectiveReleaseGame(card) === game).length
]));
const correctedReleaseLines = collectible.filter((card) => effectiveReleaseGame(card) && effectiveReleaseGame(card) !== card.game).length;
notes.push(`release-line corrections applied at runtime: ${correctedReleaseLines}`);
notes.push(`effective six-game counts: ${Object.entries(effectiveCounts).map(([game, count]) => `${game}=${count}`).join(', ')}`);

const catalogIds = new Set(catalog.cards.map((card) => card.id));
const derivedScanIndex = {};
catalog.cards.forEach((card) => {
  (card.scanIdentities || []).forEach((identity) => {
    if (identity?.charId && identity?.variantId) derivedScanIndex[`${identity.charId}:${identity.variantId}`] = card.id;
  });
});
const scanIndexEntries = Object.entries(Object.keys(catalog.scanIndex || {}).length ? catalog.scanIndex : derivedScanIndex);
check(scanIndexEntries.length === catalog.meta.linkedScanIdentities, 'scanIndex count does not match linkedScanIdentities.');
scanIndexEntries.forEach(([identity, cardId]) => {
  check(/^0X[0-9A-F]{4}:0X[0-9A-F]{4}$/.test(identity), `Malformed scan identity key: ${identity}`);
  check(catalogIds.has(cardId), `Scan identity ${identity} points to missing card ${cardId}.`);
});

catalog.cards.forEach((card) => {
  check(Boolean(card.id && card.name && card.category), `Card ${card.id || '(missing id)'} is missing required identity fields.`);
  check(Array.isArray(card.scanIdentities), `Card ${card.id} is missing scanIdentities.`);
  (card.scanIdentities || []).forEach((identity) => {
    check(/^0X[0-9A-F]{4}$/.test(identity.charId), `${card.id} has malformed Character ID ${identity.charId}.`);
    check(/^0X[0-9A-F]{4}$/.test(identity.variantId), `${card.id} has malformed Variant ID ${identity.variantId}.`);
  });
  if (card.profileKey) check(Boolean(details[card.profileKey]), `${card.id} points to missing profile ${card.profileKey}.`);
  if (card.photoUrl) check(card.photoUrl.startsWith('assets/'), `${card.id} has a non-local primary photo.`);
});

traps.forEach((trap) => check(Boolean(elements[trap.element]), `Trap ${trap.id} uses unknown element ${trap.element}.`));
villains.forEach((villain) => check(Boolean(elements[villain.element]), `Villain ${villain.id} uses unknown element ${villain.element}.`));

const requiredStaticPaths = new Set();
for (const appManifest of [manifest, ipadManifest]) {
  check(appManifest.display === 'standalone', `${appManifest.name} is not configured as a standalone app.`);
  for (const icon of appManifest.icons || []) {
    const base = appManifest === ipadManifest ? 'public' : '';
    requiredStaticPaths.add([base, icon.src].filter(Boolean).join('/'));
  }
}

const swSource = await readFile(resolve(ROOT, 'sw.js'), 'utf8');
const coreBlock = swSource.match(/const CORE_ASSETS = \[([\s\S]*?)\];/)?.[1] || '';
for (const match of coreBlock.matchAll(/['"](\.\/[^'"]+)['"]/g)) {
  const relativePath = match[1].replace(/^\.\//, '').split('?')[0];
  if (relativePath) requiredStaticPaths.add(relativePath);
}
for (const relativePath of requiredStaticPaths) {
  check(await pathExists(relativePath), `Required PWA asset is missing: ${relativePath}`);
}

const firstPartyFiles = [
  'index.html',
  'sw.js',
  'vite.config.js',
  'worker/index.js',
  ...await filesUnder('src')
].filter((path) => ['.html', '.js', '.css', '.json'].includes(extname(path)));

const versionTags = new Set();
for (const relativePath of firstPartyFiles) {
  const source = await readFile(resolve(ROOT, relativePath), 'utf8');
  check(!source.includes('\uFFFD'), `${relativePath} contains a Unicode replacement character.`);
  check(!/[ÃÂ][\u0080-\u00BF]|â(?:€|™|œ|ž)/.test(source), `${relativePath} contains likely mojibake.`);
  for (const match of source.matchAll(/stable-v\d+/g)) versionTags.add(match[0]);
  if (extname(relativePath) !== '.js') continue;
  for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const importPath = match[1].split('?')[0];
    const absoluteImport = resolve(dirname(resolve(ROOT, relativePath)), importPath);
    try {
      await access(absoluteImport);
    } catch {
      failures.push(`${relativePath} imports missing file ${importPath}.`);
    }
  }
}

check(versionTags.size === 1, `Expected one stable cache version; found ${[...versionTags].join(', ') || 'none'}.`);
notes.push(`stable cache version: ${[...versionTags][0] || 'missing'}`);
notes.push(`catalog cards: ${catalog.cards.length}; obtainable: ${collectible.length}; profiles: ${Object.keys(details).length}; scan links: ${scanIndexEntries.length}`);

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures, notes }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ passed: true, failures: [], notes }, null, 2));

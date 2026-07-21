import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/master-catalog.json'), 'utf8')
);
const outputDir = path.join(root, 'assets/card-art/cards');
const unreleasedCardIds = new Set([
  'catalog-11513604',
  'catalog-11513621',
  'catalog-11513645',
  'catalog-11513653',
  'catalog-11513673',
  'catalog-58496'
]);
const excludedCategories = new Set([
  'Pack / Set',
  'Prototype / Unreleased',
  'Villain Reference'
]);
const eligibleIds = new Set(
  catalog.cards
    .filter(
      (card) =>
        !unreleasedCardIds.has(card.id) &&
        !excludedCategories.has(card.category)
    )
    .map((card) => card.id)
);
const artworkIds = new Set(
  fs
    .readdirSync(outputDir)
    .filter((name) => name.endsWith('.webp'))
    .map((name) => name.slice(0, -'.webp'.length))
);
const missing = [...eligibleIds].filter((id) => !artworkIds.has(id));
const extra = [...artworkIds].filter((id) => !eligibleIds.has(id));

process.stdout.write(
  JSON.stringify(
    {
      eligible: eligibleIds.size,
      artwork: artworkIds.size,
      missing,
      extra,
      passed:
        eligibleIds.size === 640 &&
        artworkIds.size === 640 &&
        missing.length === 0 &&
        extra.length === 0
    },
    null,
    2
  )
);

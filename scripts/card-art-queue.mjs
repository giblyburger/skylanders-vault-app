import fs from 'node:fs';
import path from 'node:path';

const count = Math.max(1, Number(process.argv[2] || 4));
const offset = Math.max(0, Number(process.argv[3] || 0));
const mode = String(process.argv[4] || 'remaining');
const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/data/master-catalog.json'), 'utf8'));
const outputDir = path.join(root, 'assets/card-art/cards');
const unreleasedCardIds = new Set([
  'catalog-11513604',
  'catalog-11513621',
  'catalog-11513645',
  'catalog-11513653',
  'catalog-11513673',
  'catalog-58496'
]);
const launchExistingIds = new Set([
  'catalog-5604990', 'catalog-7211525', 'catalog-5404987', 'catalog-5404988',
  'catalog-67603', 'catalog-11513632', 'catalog-5404990', 'catalog-5604933',
  'catalog-58451', 'catalog-5604878', 'catalog-67589', 'catalog-5404992',
  'catalog-58450', 'scl-2117', 'catalog-58529', 'catalog-58463',
  'catalog-55861', 'catalog-58540', 'catalog-161312', 'catalog-33657',
  'catalog-36042', 'catalog-200274'
]);
const specialRetryIds = new Set([
  'catalog-4040892',
  'catalog-36043',
  'catalog-33693',
  'catalog-34723',
  'catalog-35523',
  'catalog-36041'
]);

const scopedCards = catalog.cards
  .filter((card) => !unreleasedCardIds.has(card.id) && !['Pack / Set', 'Prototype / Unreleased', 'Villain Reference'].includes(card.category));
const selectedCards = mode === 'launch'
  ? scopedCards.filter((card) => !launchExistingIds.has(card.id)).slice(offset, offset + count).filter(isMissing)
  : scopedCards.filter(isMissing).filter((card) => mode !== 'remaining-safe' || !specialRetryIds.has(card.id)).slice(offset, offset + count);

const cards = selectedCards
  .map((card) => ({
    id: card.id,
    name: card.name,
    element: card.element || 'None',
    category: card.category,
    game: card.game || 'Skylanders',
    releaseYear: card.releaseYear || '',
    role: card.role || card.scl?.series || card.category,
    edition: card.edition || 'Standard',
    photoPath: path.join(root, card.photoUrl.replaceAll('/', path.sep)),
    scan: card.scanIdentities?.[0] || null,
    compatibility: Object.entries(card.compatibility || {})
      .filter(([, support]) => String(support).startsWith('yes'))
      .map(([game]) => game)
  }));

function isMissing(card) {
  return !fs.existsSync(path.join(outputDir, `${card.id}.webp`));
}

process.stdout.write(JSON.stringify(cards));

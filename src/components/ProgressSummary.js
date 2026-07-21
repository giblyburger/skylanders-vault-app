import { asPercent, getTrapRecord, getVillainStatus } from './helpers.js?v=animation-2';

export function calculateProgress({ villains, traps, state }) {
  const trappedVillains = villains.filter((villain) => {
    const status = getVillainStatus(state, villain.id);
    return status === 'trapped' || status === 'evolved';
  }).length;
  const evolvedVillains = villains.filter((villain) => getVillainStatus(state, villain.id) === 'evolved').length;
  const ownedTraps = traps.filter((trap) => getTrapRecord(state, trap.id).quantity > 0);
  const coreOwned = ownedTraps.filter((trap) => trap.collectionGroup === 'Core 60').length;
  const variantOwned = ownedTraps.filter((trap) => trap.collectionGroup === 'Variant 6').length;
  const elementsCovered = new Set(ownedTraps.map((trap) => trap.element)).size;

  return {
    trappedVillains,
    evolvedVillains,
    ownedTraps: ownedTraps.length,
    coreOwned,
    variantOwned,
    elementsCovered,
    villainTotal: villains.length,
    trapTotal: traps.length,
    coreTotal: traps.filter((trap) => trap.collectionGroup === 'Core 60').length,
    variantTotal: traps.filter((trap) => trap.collectionGroup === 'Variant 6').length,
    elementTotal: 11,
    overallPercent: asPercent(trappedVillains + ownedTraps.length, villains.length + traps.length)
  };
}

export function renderSummary(root, progress) {
  const items = [
    ['Villains trapped', progress.trappedVillains + '/' + progress.villainTotal, asPercent(progress.trappedVillains, progress.villainTotal)],
    ['Villains evolved', String(progress.evolvedVillains), asPercent(progress.evolvedVillains, progress.villainTotal)],
    ['Trap entries owned', progress.ownedTraps + '/' + progress.trapTotal, asPercent(progress.ownedTraps, progress.trapTotal)],
    ['Core traps', progress.coreOwned + '/' + progress.coreTotal, asPercent(progress.coreOwned, progress.coreTotal)],
    ['Variant traps', progress.variantOwned + '/' + progress.variantTotal, asPercent(progress.variantOwned, progress.variantTotal)],
    ['Elements covered', progress.elementsCovered + '/' + progress.elementTotal, asPercent(progress.elementsCovered, progress.elementTotal)]
  ];

  root.innerHTML = items.map(([label, value, percent]) => {
    return '<article class="stat" aria-label="' + label + ': ' + value + '">' +
      '<strong>' + value + '</strong>' +
      '<span>' + label + '</span>' +
      '<i style="--value:' + percent + '%"></i>' +
    '</article>';
  }).join('');

  const meter = document.querySelector('[data-overall-meter]');
  const meterLabel = document.querySelector('[data-overall-label]');
  if (meter && meterLabel) {
    meter.style.setProperty('--value', progress.overallPercent + '%');
    meterLabel.textContent = progress.overallPercent + '% complete';
  }
}

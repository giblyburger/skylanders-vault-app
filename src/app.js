import { renderSummary, calculateProgress } from './components/ProgressSummary.js?v=animation-2';
import { renderVillainBoard } from './components/VillainBoard.js?v=animation-2';
import { renderTrapRack } from './components/TrapRack.js?v=animation-2';
import { createTrapEditor } from './components/TrapEditor.js?v=animation-2';
import { createMasterCatalog } from './components/MasterCatalog.js?v=ios-dark-v2';
import { actionIcon } from './components/icons.js?v=animation-2';
import { ELEMENT_ORDER, STATUS_ORDER, escapeHtml, getTrapRecord, normalizeText } from './components/helpers.js?v=animation-2';

const STORAGE_KEY = 'gibly-skylanders-master-v5';
const FRESH_START_KEY = 'gibly-skylanders-fresh-start-2026-07-21';
const PREVIOUS_STORAGE_KEYS = [
  'gibly-skylanders-master-v4',
  'gibly-trap-team-tracker-v3',
  'gibly-trap-team-3d-v2'
];
const DATA_URLS = {
  elements: 'src/data/elements.json',
  villains: 'src/data/villains.json',
  traps: 'src/data/traps.json',
  catalog: 'src/data/master-catalog.json'
};

const app = {
  elements: {},
  villains: [],
  traps: [],
  catalog: null,
  villainsById: new Map(),
  trapsById: new Map(),
  state: freshState(),
  filters: {
    search: '',
    element: '',
    villain: '',
    mold: '',
    group: ''
  },
  editor: null,
  catalogController: null,
  selectedTrapId: '',
  lastPlacement: null,
  placementTimer: null
};

const refs = {
  appRoot: document.querySelector('[data-app-root]'),
  summary: document.querySelector('[data-summary]'),
  villainBoard: document.querySelector('[data-villain-board]'),
  trapRack: document.querySelector('[data-trap-rack]'),
  placementDock: document.querySelector('[data-placement-dock]'),
  search: document.querySelector('[data-search]'),
  elementFilter: document.querySelector('[data-filter-element]'),
  villainFilter: document.querySelector('[data-filter-villain]'),
  moldFilter: document.querySelector('[data-filter-mold]'),
  groupFilter: document.querySelector('[data-filter-group]'),
  tabs: Array.from(document.querySelectorAll('[data-view-tab]')),
  views: Array.from(document.querySelectorAll('[data-view]')),
  exportButton: document.querySelector('[data-export]'),
  importButton: document.querySelector('[data-import]'),
  importFile: document.querySelector('[data-import-file]'),
  resetButton: document.querySelector('[data-reset]'),
  installButton: document.querySelector('[data-install]'),
  trapDialog: document.querySelector('[data-trap-dialog]'),
  catalogRoot: document.querySelector('[data-master-catalog]'),
  catalogDialog: document.querySelector('[data-catalog-dialog]'),
  toast: document.querySelector('[data-toast]'),
  boardStage: document.querySelector('[data-board-stage]'),
  boardShell: document.querySelector('[data-board-shell]')
};

init();

async function init() {
  try {
    const [elements, villains, traps, catalog] = await Promise.all([
      loadJson(DATA_URLS.elements),
      loadJson(DATA_URLS.villains),
      loadJson(DATA_URLS.traps),
      loadJson(DATA_URLS.catalog)
    ]);

    app.elements = elements;
    app.villains = villains;
    app.traps = traps;
    app.catalog = catalog;
    app.villainsById = new Map(villains.map((villain) => [villain.id, villain]));
    app.trapsById = new Map(traps.map((trap) => [trap.id, trap]));
    applyFreshStartMigration();
    app.state = loadState();
    app.editor = createTrapEditor(refs.trapDialog, { onSave: saveTrap });
    app.catalogController = createMasterCatalog(refs.catalogRoot, refs.catalogDialog, catalog, {
      getState: () => app.state,
      onSave: saveCatalogRecord,
      onToast: showToast
    });
    window.skylandersScan = {
      identify: (scan) => app.catalogController.identifyScan(scan),
      openCard: (cardId) => app.catalogController.open(cardId),
      catalogVersion: catalog.meta.generatedAt
    };

    populateFilters();
    wireEvents();
    setView('catalog');
    renderAll();
    registerServiceWorker();
  } catch (error) {
    showFatal(error);
  }
}

async function loadJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Could not load ' + url);
  return response.json();
}

function freshState() {
  return { version: 5, villains: {}, traps: {}, catalog: {} };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return freshState();
  try {
    return normalizeState(JSON.parse(saved));
  } catch {}
  return freshState();
}

function applyFreshStartMigration() {
  if (localStorage.getItem(FRESH_START_KEY)) return;
  PREVIOUS_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(STORAGE_KEY);
  localStorage.setItem(FRESH_START_KEY, new Date().toISOString());
}

function normalizeState(raw) {
  const source = raw?.state || raw || {};
  const clean = freshState();
  const villainIds = new Set(app.villains.map((villain) => villain.id));
  const trapIds = new Set(app.traps.map((trap) => trap.id));

  Object.entries(source.villains || {}).forEach(([villainId, status]) => {
    if (villainIds.has(villainId) && STATUS_ORDER.includes(status)) {
      clean.villains[villainId] = status;
    }
  });

  Object.entries(source.traps || {}).forEach(([trapId, record]) => {
    if (!trapIds.has(trapId)) return;
    const normalized = getTrapRecord({ traps: { [trapId]: record } }, trapId);
    clean.traps[trapId] = normalized;
  });

  const catalogIds = new Set((app.catalog?.cards || []).map((card) => card.id));
  Object.entries(source.catalog || {}).forEach(([cardId, record]) => {
    if (!catalogIds.has(cardId)) return;
    const copies = Array.isArray(record?.copies) ? record.copies : [];
    clean.catalog[cardId] = {
      wishlist: Boolean(record?.wishlist),
      notes: String(record?.notes || ''),
      copies: copies.map((copy, index) => ({
        id: String(copy?.id || `imported-${cardId}-${index}`),
        uid: String(copy?.uid || ''),
        condition: String(copy?.condition || 'Not graded'),
        packaging: String(copy?.packaging || 'Loose'),
        storage: String(copy?.storage || ''),
        acquired: String(copy?.acquired || ''),
        paid: String(copy?.paid || ''),
        notes: String(copy?.notes || '')
      }))
    };
  });

  return clean;
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
}

function populateFilters() {
  fillSelect(refs.elementFilter, ELEMENT_ORDER.filter((element) => app.elements[element]).map((element) => ({ value: element, label: element })), 'All elements');
  fillSelect(refs.villainFilter, app.villains.map((villain) => ({ value: villain.id, label: villain.name })), 'All villains');

  const molds = Array.from(new Set(app.traps.map((trap) => trap.mold))).sort((a, b) => a.localeCompare(b));
  fillSelect(refs.moldFilter, molds.map((mold) => ({ value: mold, label: mold })), 'All molds');

  const groups = Array.from(new Set(app.traps.map((trap) => trap.collectionGroup))).sort((a, b) => a.localeCompare(b));
  fillSelect(refs.groupFilter, groups.map((group) => ({ value: group, label: group })), 'All groups');
}

function fillSelect(select, options, placeholder) {
  select.innerHTML = '<option value="">' + placeholder + '</option>' + options.map((option) => {
    return '<option value="' + option.value + '">' + option.label + '</option>';
  }).join('');
}

function wireEvents() {
  refs.search.addEventListener('input', () => {
    app.filters.search = refs.search.value;
    renderAll();
  });

  [refs.elementFilter, refs.villainFilter, refs.moldFilter, refs.groupFilter].forEach((select) => {
    select.addEventListener('change', () => {
      app.filters.element = refs.elementFilter.value;
      app.filters.villain = refs.villainFilter.value;
      app.filters.mold = refs.moldFilter.value;
      app.filters.group = refs.groupFilter.value;
      renderAll();
    });
  });

  refs.tabs.forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.dataset.viewTab));
  });

  refs.exportButton.innerHTML = actionIcon('export') + '<span>Export</span>';
  refs.importButton.innerHTML = actionIcon('import') + '<span>Import</span>';
  refs.resetButton.innerHTML = actionIcon('reset') + '<span>Reset</span>';
  refs.installButton.innerHTML = actionIcon('install') + '<span>Install</span>';

  refs.exportButton.addEventListener('click', exportBackup);
  refs.importButton.addEventListener('click', () => refs.importFile.click());
  refs.importFile.addEventListener('change', importBackup);
  refs.resetButton.addEventListener('click', resetProgress);
  setupBoardTilt();
  setupInstallPrompt();
}

function setView(viewName) {
  refs.appRoot.dataset.activeView = viewName;
  refs.tabs.forEach((tab) => {
    const active = tab.dataset.viewTab === viewName;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  refs.views.forEach((view) => {
    const active = view.dataset.view === viewName;
    view.hidden = !active;
  });

  if (!['board', 'rack'].includes(viewName)) refs.placementDock.hidden = true;
  else if (app.selectedTrapId) renderPlacementDock(app.trapsById.get(app.selectedTrapId));
}

function renderAll() {
  const selectedVillain = app.filters.villain ? app.villainsById.get(app.filters.villain) : null;
  const selectedTrap = app.selectedTrapId ? app.trapsById.get(app.selectedTrapId) : null;
  const placementsByVillain = getPlacementsByVillain();

  renderPlacementDock(selectedTrap);
  renderSummary(refs.summary, calculateProgress(app));
  updateOverallProgress();
  renderCollectionViews(selectedVillain, selectedTrap, placementsByVillain);
}

function updateOverallProgress() {
  const catalogOwned = Object.values(app.state.catalog || {}).filter((record) => record.copies?.length).length;
  const catalogTotal = app.catalog?.meta.totalCards || app.catalog?.cards.length || 0;
  const catalogPercent = catalogTotal ? Math.round((catalogOwned / catalogTotal) * 100) : 0;
  const meter = document.querySelector('[data-overall-meter]');
  const meterLabel = document.querySelector('[data-overall-label]');
  if (meter && meterLabel) {
    meter.style.setProperty('--value', catalogPercent + '%');
    meterLabel.textContent = catalogOwned + ' of ' + catalogTotal + ' collected';
  }
}

function saveCatalogRecord(cardId, record) {
  if (!app.catalog?.cards.some((card) => card.id === cardId)) return;
  app.state.catalog[cardId] = record;
  persistState();
  updateOverallProgress();
}

function renderCollectionViews(selectedVillain, selectedTrap, placementsByVillain) {
  renderVillainBoard(refs.villainBoard, {
    elements: app.elements,
    villains: app.villains,
    state: app.state,
    filters: app.filters,
    selectedTrap,
    placementsByVillain,
    lastPlacement: app.lastPlacement,
    onCycleVillain: cycleVillain,
    onPlaceTrap: placeSelectedTrap
  });
  renderTrapRack(refs.trapRack, {
    elements: app.elements,
    villainsById: app.villainsById,
    villains: app.villains,
    traps: app.traps,
    state: app.state,
    filters: app.filters,
    selectedVillain,
    selectedTrapId: app.selectedTrapId,
    onSelectTrap: selectTrap,
    onOpenTrap: openTrap
  });
  app.catalogController?.render();
}

function renderPlacementDock(selectedTrap) {
  if (!refs.placementDock) return;
  if (!selectedTrap) {
    refs.placementDock.hidden = true;
    refs.placementDock.innerHTML = '';
    return;
  }

  const element = app.elements[selectedTrap.element];
  const record = getTrapRecord(app.state, selectedTrap.id);
  const style = '--el:' + element.color + ';--el-dark:' + element.dark;
  refs.placementDock.hidden = false;
  refs.placementDock.innerHTML = '<div class="placement-dock__piece" style="' + style + '">' +
    '<span class="mini-crystal" aria-hidden="true"><span></span></span>' +
    '<div><span>Holding</span><strong>' + escapeHtml(selectedTrap.official) + '</strong><small>' + escapeHtml(selectedTrap.element + ' ' + selectedTrap.mold + (record.quantity > 0 ? ' · owned x' + record.quantity : ' · will mark owned')) + '</small></div>' +
  '</div>' +
  '<div class="placement-dock__actions">' +
    '<button class="button" type="button" data-placement-details>Details</button>' +
    '<button class="button button--danger" type="button" data-placement-cancel>Cancel</button>' +
  '</div>';

  refs.placementDock.querySelector('[data-placement-cancel]').addEventListener('click', () => {
    app.selectedTrapId = '';
    renderAll();
  });
  refs.placementDock.querySelector('[data-placement-details]').addEventListener('click', () => openTrap(selectedTrap.id));
}

function cycleVillain(villainId, status) {
  app.state.villains[villainId] = status;
  persistState();
  renderAll();
  const villain = app.villainsById.get(villainId);
  if (villain) showToast(villain.name + ': ' + status.replace('-', ' '));
}

function selectTrap(trapId) {
  const trap = app.trapsById.get(trapId);
  if (!trap) return;
  app.selectedTrapId = app.selectedTrapId === trapId ? '' : trapId;
  renderAll();
  if (app.selectedTrapId) {
    setView('board');
    refs.boardStage?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    showToast(trap.official + ' ready for the board');
  }
}

function openTrap(trapId) {
  const trap = app.trapsById.get(trapId);
  if (!trap) return;
  app.editor.open(trap, app);
}

function saveTrap(trapId, record) {
  const trap = app.trapsById.get(trapId);
  if (!trap) return;
  const cleanRecord = {
    quantity: Math.max(0, Number(record.quantity) || 0),
    assignedVillainId: record.quantity > 0 ? String(record.assignedVillainId || '') : '',
    assignedVillainName: record.quantity > 0 ? String(record.assignedVillainName || '') : ''
  };
  if (cleanRecord.assignedVillainId || cleanRecord.assignedVillainName) {
    clearPlacementForVillain(cleanRecord.assignedVillainId, cleanRecord.assignedVillainName, trapId);
  }
  app.state.traps[trapId] = cleanRecord;
  if (app.selectedTrapId === trapId && cleanRecord.quantity === 0) app.selectedTrapId = '';
  persistState();
  renderAll();
  showToast(trap.official + ' saved');
}

function placeSelectedTrap(villainId) {
  const trap = app.trapsById.get(app.selectedTrapId);
  const villain = app.villainsById.get(villainId);
  if (!trap || !villain) return;
  if (trap.element !== villain.element) {
    showToast(trap.element + ' Traps fit ' + trap.element + ' villains');
    return;
  }

  const record = getTrapRecord(app.state, trap.id);
  clearPlacementForVillain(villain.id, villain.name, trap.id);
  app.state.traps[trap.id] = {
    quantity: Math.max(1, record.quantity),
    assignedVillainId: villain.id,
    assignedVillainName: villain.name
  };

  const currentStatus = app.state.villains[villain.id] || 'not-found';
  if (currentStatus !== 'evolved') app.state.villains[villain.id] = 'trapped';
  app.selectedTrapId = '';
  app.lastPlacement = { villainId: villain.id, trapId: trap.id, at: Date.now() };
  if (app.placementTimer) clearTimeout(app.placementTimer);
  app.placementTimer = setTimeout(() => {
    if (app.lastPlacement?.villainId === villain.id && app.lastPlacement?.trapId === trap.id) {
      app.lastPlacement = null;
      renderAll();
    }
  }, 1500);
  persistState();
  renderAll();
  showToast(trap.official + ' placed on ' + villain.name);
}

function clearPlacementForVillain(villainId, villainName, exceptTrapId) {
  const normalizedName = normalizeText(villainName);
  app.traps.forEach((trap) => {
    if (trap.id === exceptTrapId) return;
    const record = getTrapRecord(app.state, trap.id);
    const sameVillain = (villainId && record.assignedVillainId === villainId) ||
      (normalizedName && normalizeText(record.assignedVillainName) === normalizedName);
    if (!sameVillain) return;
    app.state.traps[trap.id] = {
      ...record,
      assignedVillainId: '',
      assignedVillainName: ''
    };
  });
}

function getPlacementsByVillain() {
  const placements = new Map();
  app.traps.forEach((trap) => {
    const record = getTrapRecord(app.state, trap.id);
    if (record.quantity <= 0) return;
    let villainId = record.assignedVillainId;
    if (!villainId && record.assignedVillainName) {
      const match = app.villains.find((villain) => normalizeText(villain.name) === normalizeText(record.assignedVillainName));
      villainId = match?.id || '';
    }
    if (!villainId || !app.villainsById.has(villainId)) return;
    placements.set(villainId, { trap, record });
  });
  return placements;
}

function exportBackup() {
  const payload = {
    app: "Gibly's Skylanders Master Vault",
    version: 5,
    exportedAt: new Date().toISOString(),
    dataset: {
      villains: app.villains.length,
      traps: app.traps.length,
      coreTraps: app.traps.filter((trap) => trap.collectionGroup === 'Core 60').length,
      variantTraps: app.traps.filter((trap) => trap.collectionGroup === 'Variant 6').length,
      catalogCards: app.catalog?.meta.totalCards || 0,
      scanIdentities: app.catalog?.meta.totalScanIdentities || 0,
      ownedCatalogCards: Object.values(app.state.catalog || {}).filter((record) => record.copies?.length).length,
      ownedPhysicalPieces: Object.values(app.state.catalog || {}).reduce((total, record) => total + (record.copies?.length || 0), 0)
    },
    state: app.state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'gibly-skylanders-master-vault-backup.json';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  showToast('Backup exported');
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    app.state = normalizeState(payload);
    persistState();
    renderAll();
    showToast('Backup imported');
  } catch {
    showToast('That backup could not be read');
  } finally {
    event.target.value = '';
  }
}

function resetProgress() {
  if (!confirm('Erase all saved progress on this device?')) return;
  app.state = freshState();
  app.selectedTrapId = '';
  app.lastPlacement = null;
  if (app.placementTimer) clearTimeout(app.placementTimer);
  persistState();
  renderAll();
  showToast('Progress reset');
}

function setupBoardTilt() {
  if (!refs.boardStage || !refs.boardShell) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  refs.boardStage.addEventListener('pointermove', (event) => {
    if (window.innerWidth < 760) return;
    const rect = refs.boardStage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    refs.boardShell.style.transform = 'rotateX(' + (4 - y * 7).toFixed(2) + 'deg) rotateY(' + (-2 + x * 8).toFixed(2) + 'deg)';
  });

  refs.boardStage.addEventListener('pointerleave', () => {
    refs.boardShell.style.transform = '';
  });
}

function setupInstallPrompt() {
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    refs.installButton.hidden = false;
  });

  refs.installButton.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    refs.installButton.hidden = true;
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    refs.toast.hidden = true;
  }, 2400);
}

function showFatal(error) {
  document.body.classList.add('load-failed');
  const target = document.querySelector('[data-app-root]');
  target.innerHTML = '<section class="fatal"><h1>Tracker could not load</h1><p>' + String(error.message || error) + '</p></section>';
}

import { renderSummary, calculateProgress } from './components/ProgressSummary.js?v=animation-2';
import { renderVillainBoard } from './components/VillainBoard.js?v=animation-2';
import { renderTrapRack } from './components/TrapRack.js?v=animation-2';
import { createTrapEditor } from './components/TrapEditor.js?v=animation-2';
import { createMasterCatalog } from './components/MasterCatalog.js?v=warm-v4';
import { createFeatureSuite } from './components/FeatureSuite.js?v=warm-v4';
import { createCloudSync } from './components/CloudSync.js?v=vault-v2';
import { actionIcon } from './components/icons.js?v=animation-2';
import { ELEMENT_ORDER, STATUS_ORDER, escapeHtml, getTrapRecord, normalizeText } from './components/helpers.js?v=animation-2';

const STORAGE_KEY = 'gibly-skylanders-master-v7-clean';
const DISPLAY_MODE_KEY = 'gibly-skylanders-display-mode';
const FRESH_START_KEY = 'gibly-skylanders-clean-start-2026-07-25';
const PREVIOUS_STORAGE_KEYS = [
  'gibly-skylanders-master-v5',
  'gibly-skylanders-master-v4',
  'gibly-trap-team-tracker-v3',
  'gibly-trap-team-3d-v2'
];
const DATA_URLS = {
  elements: 'src/data/elements.json',
  villains: 'src/data/villains.json',
  traps: 'src/data/traps.json',
  catalog: 'src/data/catalog.json'
};
const UNRELEASED_CARD_IDS = new Set([
  'catalog-11513604',
  'catalog-11513621',
  'catalog-11513645',
  'catalog-11513653',
  'catalog-11513673',
  'catalog-58496'
]);

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
  featureSuite: null,
  cloudSync: null,
  selectedTrapId: '',
  lastPlacement: null,
  placementTimer: null
};
let offlineRegistration = null;

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
  gameNav: Array.from(document.querySelectorAll('[data-game-nav]')),
  views: Array.from(document.querySelectorAll('[data-view]')),
  exportButton: document.querySelector('[data-export]'),
  importButton: document.querySelector('[data-import]'),
  importFile: document.querySelector('[data-import-file]'),
  resetButton: document.querySelector('[data-reset]'),
  displayModeButton: document.querySelector('[data-display-mode]'),
  installButton: document.querySelector('[data-install]'),
  offlineButton: document.querySelector('[data-offline-library]'),
  pairingDialog: document.querySelector('[data-pairing-dialog]'),
  pairingForm: document.querySelector('[data-pairing-form]'),
  pairingCode: document.querySelector('[data-pairing-code]'),
  pairingError: document.querySelector('[data-pairing-error]'),
  pairingSubmit: document.querySelector('[data-pairing-submit]'),
  pairingSkip: Array.from(document.querySelectorAll('[data-pairing-skip]')),
  trapDialog: document.querySelector('[data-trap-dialog]'),
  catalogRoot: document.querySelector('[data-master-catalog]'),
  featureSuiteRoot: document.querySelector('[data-feature-suite]'),
  catalogDialog: document.querySelector('[data-catalog-dialog]'),
  toast: document.querySelector('[data-toast]'),
  boardStage: document.querySelector('[data-board-stage]'),
  boardShell: document.querySelector('[data-board-shell]'),
  syncStatus: document.querySelector('[data-sync-status]')
};

applyInitialDisplayMode();
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
      onToast: showToast,
      onGameChange: updateGameNavigation,
      onUploadPhoto: (...args) => app.cloudSync?.uploadPhoto(...args),
      onDeletePhoto: (...args) => app.cloudSync?.deletePhoto(...args)
    });
    app.featureSuite = createFeatureSuite(refs.featureSuiteRoot, catalog, {
      getState: () => app.state,
      openCard: (cardId) => app.catalogController.open(cardId),
      onToast: showToast,
      commit: (type, label, cardId = '') => {
        appendTimeline(type, label, cardId);
        persistState();
        updateOverallProgress();
      }
    });
    window.skylandersScan = {
      identify: (scan) => app.catalogController.identifyScan(scan),
      openCard: (cardId) => app.catalogController.open(cardId),
      catalogVersion: catalog.meta.generatedAt
    };
    window.skylandersNfc = {
      identify: (scan) => app.catalogController.identifyScan(scan),
      openCard: (cardId) => app.catalogController.open(cardId)
    };

    populateFilters();
    wireEvents();
    setView('catalog');
    renderAll();
    openNfcDeepLink();
    app.cloudSync = createCloudSync({
      getState: () => app.state,
      normalizeState,
      applyState: (nextState) => {
        app.state = normalizeState(nextState);
        persistState({ cloud: false });
        renderAll();
      },
      onStatus: updateSyncStatus,
      onPairingRequired: openPairingDialog
    });
    app.cloudSync.start();
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
  return { version: 7, villains: {}, traps: {}, catalog: {}, assemblies: [], timeline: [] };
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

  const catalogIds = new Set((app.catalog?.cards || []).filter(isCollectibleCard).map((card) => card.id));
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
        notes: String(copy?.notes || ''),
        photos: Array.isArray(copy?.photos) ? copy.photos.map(normalizePhoto).filter(Boolean) : []
      }))
    };
  });

  clean.assemblies = Array.isArray(source.assemblies)
    ? source.assemblies.slice(0, 200).map((assembly) => ({
      id: String(assembly?.id || ''),
      topCardId: String(assembly?.topCardId || ''),
      bottomCardId: String(assembly?.bottomCardId || ''),
      name: String(assembly?.name || ''),
      createdAt: String(assembly?.createdAt || '')
    })).filter((assembly) => assembly.id && catalogIds.has(assembly.topCardId) && catalogIds.has(assembly.bottomCardId))
    : [];

  clean.timeline = Array.isArray(source.timeline)
    ? source.timeline.slice(-300).map((event) => ({
      id: String(event?.id || ''),
      type: String(event?.type || 'update'),
      cardId: String(event?.cardId || ''),
      label: String(event?.label || 'Collection updated'),
      at: String(event?.at || '')
    })).filter((event) => event.id)
    : [];

  return clean;
}

function normalizePhoto(photo) {
  const id = String(photo?.id || '');
  const url = String(photo?.url || '');
  if (!id || !url.startsWith('/api/photos/')) return null;
  return {
    id,
    url,
    contentType: String(photo?.contentType || ''),
    filename: String(photo?.filename || 'Collection photo'),
    createdAt: String(photo?.createdAt || '')
  };
}

function persistState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
  if (options.cloud !== false) app.cloudSync?.queue();
}

function updateSyncStatus(status) {
  if (!refs.syncStatus) return;
  refs.syncStatus.dataset.state = status.state || 'connecting';
  const label = refs.syncStatus.querySelector('span');
  if (label) label.textContent = status.text || 'Connecting';
  refs.syncStatus.setAttribute('aria-label', 'Collection sync status: ' + (status.text || 'Connecting'));
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

  refs.gameNav.forEach((button) => {
    button.addEventListener('click', () => {
      setView('catalog');
      app.catalogController?.setGameFilter(button.dataset.gameNav || '');
    });
  });

  refs.exportButton.innerHTML = actionIcon('export') + '<span>Export</span>';
  refs.importButton.innerHTML = actionIcon('import') + '<span>Import</span>';
  refs.resetButton.innerHTML = actionIcon('reset') + '<span>Reset</span>';
  refs.displayModeButton.innerHTML = actionIcon('display') + '<span>iPad Display</span>';
  refs.installButton.innerHTML = actionIcon('install') + '<span>Install</span>';
  refs.offlineButton.innerHTML = actionIcon('install') + '<span>Offline Library</span>';

  applyDisplayMode(document.documentElement.dataset.displayMode === 'ipad', { persist: false, updateUrl: false });

  refs.exportButton.addEventListener('click', exportBackup);
  refs.importButton.addEventListener('click', () => refs.importFile.click());
  refs.importFile.addEventListener('change', importBackup);
  refs.resetButton.addEventListener('click', resetProgress);
  refs.displayModeButton.addEventListener('click', toggleDisplayMode);
  refs.offlineButton.addEventListener('click', downloadOfflineLibrary);
  refs.syncStatus?.addEventListener('click', () => {
    if (refs.syncStatus.dataset.state === 'locked') openPairingDialog();
  });
  refs.pairingCode?.addEventListener('input', () => {
    const compact = refs.pairingCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    refs.pairingCode.value = compact.match(/.{1,4}/g)?.join('-') || '';
    showPairingError('');
  });
  refs.pairingForm?.addEventListener('submit', pairCurrentDevice);
  refs.pairingSkip.forEach((button) => button.addEventListener('click', closePairingDialog));
  refs.pairingDialog?.addEventListener('close', clearPairingFallback);
  window.addEventListener('hashchange', openNfcDeepLink);
  setupBoardTilt();
  setupInstallPrompt();
}

async function pairCurrentDevice(event) {
  event.preventDefault();
  const code = refs.pairingCode?.value.trim() || '';
  if (!code) {
    showPairingError('Enter your private pairing code.');
    refs.pairingCode?.focus();
    return;
  }

  refs.pairingSubmit.disabled = true;
  refs.pairingSubmit.textContent = 'Pairing…';
  showPairingError('');
  try {
    await app.cloudSync.pair(code);
    closePairingDialog();
    refs.pairingCode.value = '';
    showToast('Paired — your private collection is syncing');
  } catch (error) {
    showPairingError(error.message || 'This device could not be paired.');
    refs.pairingCode?.select();
  } finally {
    refs.pairingSubmit.disabled = false;
    refs.pairingSubmit.textContent = 'Pair & sync';
  }
}

function openPairingDialog() {
  const dialog = refs.pairingDialog;
  if (!dialog || dialog.hasAttribute('open')) return;
  showPairingError('');
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
    dialog.classList.add('dialog-shell--fallback');
    document.body.classList.add('dialog-fallback-active');
  }
  setTimeout(() => refs.pairingCode?.focus(), 40);
}

function closePairingDialog() {
  const dialog = refs.pairingDialog;
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.hasAttribute('open')) dialog.close();
  else dialog.removeAttribute('open');
  clearPairingFallback();
}

function clearPairingFallback() {
  refs.pairingDialog?.classList.remove('dialog-shell--fallback');
  document.body.classList.remove('dialog-fallback-active');
}

function showPairingError(message) {
  if (!refs.pairingError) return;
  refs.pairingError.textContent = message;
  refs.pairingError.hidden = !message;
}

function applyInitialDisplayMode() {
  let enabled = document.documentElement.dataset.displayMode === 'ipad';
  try {
    const request = new URLSearchParams(window.location.search).get('display');
    if (request === 'ipad') enabled = true;
    if (request === 'standard') enabled = false;
  } catch (error) {}
  applyDisplayMode(enabled, { persist: false, updateUrl: false });
}

function toggleDisplayMode() {
  const enabled = document.documentElement.dataset.displayMode !== 'ipad';
  applyDisplayMode(enabled, { persist: true, updateUrl: true });
  if (enabled) setView('catalog');
  showToast(enabled
    ? 'iPad Display is on. Use Screen Mirroring to send it to your TV.'
    : 'Standard layout restored.');
}

function applyDisplayMode(enabled, options = {}) {
  const mode = enabled ? 'ipad' : 'standard';
  document.documentElement.dataset.displayMode = mode;
  if (refs.appRoot) refs.appRoot.dataset.displayMode = mode;
  const manifest = document.querySelector('[data-app-manifest]');
  if (manifest) manifest.href = enabled ? 'public/manifest-ipad.webmanifest' : 'manifest.webmanifest';

  if (refs.displayModeButton) {
    refs.displayModeButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    refs.displayModeButton.classList.toggle('is-active', enabled);
    const label = refs.displayModeButton.querySelector('span');
    if (label) label.textContent = enabled ? 'Display On' : 'iPad Display';
  }

  if (options.persist) {
    try {
      if (enabled) localStorage.setItem(DISPLAY_MODE_KEY, 'ipad');
      else localStorage.removeItem(DISPLAY_MODE_KEY);
    } catch (error) {}
  }

  if (options.updateUrl && window.history && window.history.replaceState) {
    try {
      const url = new URL(window.location.href);
      if (enabled) url.searchParams.set('display', 'ipad');
      else url.searchParams.delete('display');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch (error) {}
  }
}

function openNfcDeepLink() {
  const match = window.location.hash.match(/^#vault-card=(.+)$/);
  if (!match || !app.catalogController) return;
  const cardId = decodeURIComponent(match[1]);
  if (!app.catalog?.cards.some((card) => card.id === cardId && isCollectibleCard(card))) return;
  setView('catalog');
  app.catalogController.open(cardId);
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

  if (viewName !== 'catalog') updateGameNavigation(null);

  if (!['board', 'rack'].includes(viewName)) refs.placementDock.hidden = true;
  else if (app.selectedTrapId) renderPlacementDock(app.trapsById.get(app.selectedTrapId));
}

function updateGameNavigation(game) {
  refs.gameNav.forEach((button) => {
    const active = game !== null && button.dataset.gameNav === game;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function renderAll() {
  const selectedVillain = app.filters.villain ? app.villainsById.get(app.filters.villain) : null;
  const selectedTrap = app.selectedTrapId ? app.trapsById.get(app.selectedTrapId) : null;
  const placementsByVillain = getPlacementsByVillain();

  renderPlacementDock(selectedTrap);
  renderSummary(refs.summary, calculateProgress(app));
  updateOverallProgress();
  renderCollectionViews(selectedVillain, selectedTrap, placementsByVillain);
  app.featureSuite?.render();
}

function updateOverallProgress() {
  const catalogOwned = Object.values(app.state.catalog || {}).filter((record) => record.copies?.length).length;
  const catalogTotal = app.catalog?.cards.filter(isCollectibleCard).length || 0;
  const catalogPercent = catalogTotal ? Math.round((catalogOwned / catalogTotal) * 100) : 0;
  const meter = document.querySelector('[data-overall-meter]');
  const meterLabel = document.querySelector('[data-overall-label]');
  if (meter && meterLabel) {
    meter.style.setProperty('--value', catalogPercent + '%');
    meterLabel.textContent = catalogOwned + ' of ' + catalogTotal + ' collected';
  }
}

function saveCatalogRecord(cardId, record) {
  const card = app.catalog?.cards.find((item) => item.id === cardId);
  if (!card) return;
  const previous = app.state.catalog[cardId] || { copies: [], wishlist: false };
  const previousCopies = previous.copies?.length || 0;
  const nextCopies = record.copies?.length || 0;
  app.state.catalog[cardId] = record;
  if (nextCopies > previousCopies) appendTimeline('copy_added', `${card.name} added to the collection`, cardId);
  else if (nextCopies < previousCopies) appendTimeline('copy_removed', `${card.name} copy removed`, cardId);
  else if (Boolean(previous.wishlist) !== Boolean(record.wishlist)) appendTimeline('wishlist', `${card.name} ${record.wishlist ? 'added to' : 'removed from'} the wishlist`, cardId);
  else appendTimeline('copy_updated', `${card.name} record updated`, cardId);
  persistState();
  updateOverallProgress();
  app.featureSuite?.render();
}

function appendTimeline(type, label, cardId = '') {
  const timeline = Array.isArray(app.state.timeline) ? app.state.timeline : [];
  timeline.push({
    id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type: String(type || 'update'),
    cardId: String(cardId || ''),
    label: String(label || 'Collection updated'),
    at: new Date().toISOString()
  });
  app.state.timeline = timeline.slice(-300);
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
    version: 6,
    exportedAt: new Date().toISOString(),
    dataset: {
      villains: app.villains.length,
      traps: app.traps.length,
      coreTraps: app.traps.filter((trap) => trap.collectionGroup === 'Core 60').length,
      variantTraps: app.traps.filter((trap) => trap.collectionGroup === 'Variant 6').length,
      catalogCards: app.catalog?.cards.filter(isCollectibleCard).length || 0,
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

function isCollectibleCard(card) {
  return !UNRELEASED_CARD_IDS.has(card?.id) && !['Pack / Set', 'Prototype / Unreleased', 'Villain Reference'].includes(card?.category);
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

async function resetProgress() {
  if (!confirm('Erase all collection progress across your synced devices?')) return;
  app.state = freshState();
  app.selectedTrapId = '';
  app.lastPlacement = null;
  if (app.placementTimer) clearTimeout(app.placementTimer);
  persistState({ cloud: false });
  renderAll();
  try {
    if (app.cloudSync) await app.cloudSync.reset();
    else persistState();
    showToast('Fresh vault synced to every device');
  } catch {
    persistState();
    showToast('Vault cleared here; cloud retry is queued');
  }
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
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true
    || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  if (appleMobile && !standalone) {
    refs.installButton.hidden = false;
    const label = refs.installButton.querySelector('span');
    if (label) label.textContent = 'Add to Home';
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    refs.installButton.hidden = false;
  });

  refs.installButton.addEventListener('click', async () => {
    if (!deferredPrompt) {
      if (appleMobile) showToast('In Safari, tap Share, then Add to Home Screen.');
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    refs.installButton.hidden = true;
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
    refs.offlineButton.hidden = true;
    return;
  }
  navigator.serviceWorker.addEventListener('message', handleOfflineLibraryMessage);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    navigator.serviceWorker.ready.then((registration) => {
      offlineRegistration = registration;
      postOfflineMessage({ type: 'OFFLINE_LIBRARY_STATUS' });
    }).catch(() => {});
  });
  navigator.serviceWorker.register('sw.js?v=warm-vault-v4', { updateViaCache: 'none' })
    .then((registration) => {
      offlineRegistration = registration;
      refs.offlineButton.hidden = false;
      registration.update();
      return navigator.serviceWorker.ready;
    })
    .then((registration) => {
      offlineRegistration = registration;
      postOfflineMessage({ type: 'OFFLINE_LIBRARY_STATUS' });
    })
    .catch(() => {});
}

async function downloadOfflineLibrary() {
  if (refs.offlineButton.dataset.ready === 'true') {
    showToast('The complete offline library is already downloaded');
    return;
  }
  refs.offlineButton.disabled = true;
  setOfflineButtonLabel('Preparing…');
  try {
    offlineRegistration = offlineRegistration || await navigator.serviceWorker.ready;
    postOfflineMessage({ type: 'DOWNLOAD_OFFLINE_LIBRARY' });
  } catch {
    refs.offlineButton.disabled = false;
    setOfflineButtonLabel('Try Offline Download');
    showToast('Offline download could not start');
  }
}

function postOfflineMessage(message) {
  const worker = offlineRegistration?.active || navigator.serviceWorker.controller || offlineRegistration?.waiting;
  if (!worker) throw new Error('Offline worker is not ready.');
  worker.postMessage(message);
}

function handleOfflineLibraryMessage(event) {
  const message = event.data || {};
  if (message.type === 'OFFLINE_LIBRARY_STATUS') {
    refs.offlineButton.disabled = false;
    refs.offlineButton.dataset.ready = message.complete ? 'true' : 'false';
    refs.offlineButton.setAttribute('aria-pressed', String(Boolean(message.complete)));
    setOfflineButtonLabel(message.complete ? 'Offline Ready' : 'Download Offline');
  }
  if (message.type === 'OFFLINE_LIBRARY_PROGRESS') {
    const percent = Math.max(0, Math.min(100, Number(message.percent) || 0));
    refs.offlineButton.disabled = true;
    refs.offlineButton.dataset.progress = String(percent);
    refs.offlineButton.style.setProperty('--offline-progress', `${percent}%`);
    setOfflineButtonLabel(`Downloading ${percent}%`);
  }
  if (message.type === 'OFFLINE_LIBRARY_COMPLETE') {
    refs.offlineButton.disabled = false;
    refs.offlineButton.dataset.ready = 'true';
    refs.offlineButton.dataset.progress = '100';
    refs.offlineButton.style.setProperty('--offline-progress', '100%');
    refs.offlineButton.setAttribute('aria-pressed', 'true');
    setOfflineButtonLabel('Offline Ready');
    showToast('Full Vault downloaded — it now works without internet');
  }
  if (message.type === 'OFFLINE_LIBRARY_ERROR') {
    refs.offlineButton.disabled = false;
    setOfflineButtonLabel('Retry Offline Download');
    showToast('The offline download paused. Tap to retry.');
  }
}

function setOfflineButtonLabel(text) {
  const label = refs.offlineButton.querySelector('span');
  if (label) label.textContent = text;
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

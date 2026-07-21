import { escapeHtml, normalizeText } from './helpers.js?v=animation-2';

const GAME_SHORT = {
  "Spyro's Adventure": 'SSA',
  Giants: 'Giants',
  'SWAP Force': 'SWAP',
  'Trap Team': 'Trap',
  SuperChargers: 'SC',
  Imaginators: 'Imaginators'
};

const GAME_LINES = [
  { name: "Spyro's Adventure", year: 2011, number: '01', feature: 'Spyro', accent: '#8f6fff' },
  { name: 'Giants', year: 2012, number: '02', feature: 'Tree Rex', accent: '#ff745f' },
  { name: 'SWAP Force', year: 2013, number: '03', feature: 'Wash Buckler', accent: '#57c8ff' },
  { name: 'Trap Team', year: 2014, number: '04', feature: 'Snap Shot', accent: '#6ee69e' },
  { name: 'SuperChargers', year: 2015, number: '05', feature: 'Spitfire', accent: '#ffb64d' },
  { name: 'Imaginators', year: 2016, number: '06', feature: 'King Pen', accent: '#f0d36e' }
];

const CONDITION_OPTIONS = ['Not graded', 'New / sealed', 'Like new', 'Good', 'Played', 'Damaged', 'Parts / repair'];
const PACKAGING_OPTIONS = ['Loose', 'Carded / sealed', 'Boxed', 'Package only'];
const UNRELEASED_CARD_IDS = new Set([
  'catalog-11513604',
  'catalog-11513621',
  'catalog-11513645',
  'catalog-11513653',
  'catalog-11513673',
  'catalog-58496'
]);

export function createMasterCatalog(container, dialog, catalog, callbacks) {
  const cardsById = new Map(catalog.cards.map((card) => [card.id, card]));
  const collectibleCards = catalog.cards.filter(isCollectibleCard);
  const referenceCount = catalog.cards.length - collectibleCards.length + (catalog.scanCatalog || catalog.unmappedScanIdentities || []).filter((identity) => ['technical-only', 'in-game/digital'].includes(identity.releaseStatus)).length;
  const state = {
    search: '',
    game: '',
    category: '',
    element: '',
    ownership: '',
    sort: 'name',
    layout: 'photos',
    limit: 72,
    activeCardId: '',
    nfcSelection: '',
    status: 'Ready for an ID or saved UID.'
  };

  renderShell();
  wireShell();
  render();

  function getRecord(cardId) {
    const source = callbacks.getState().catalog?.[cardId] || {};
    const copies = Array.isArray(source.copies) ? source.copies : [];
    return {
      wishlist: Boolean(source.wishlist),
      notes: String(source.notes || ''),
      copies: copies.map((copy) => ({
        id: String(copy.id || makeCopyId()),
        uid: String(copy.uid || ''),
        condition: String(copy.condition || 'Not graded'),
        packaging: String(copy.packaging || 'Loose'),
        storage: String(copy.storage || ''),
        acquired: String(copy.acquired || ''),
        paid: String(copy.paid || ''),
        notes: String(copy.notes || ''),
        photos: Array.isArray(copy.photos) ? copy.photos.map(normalizePhoto).filter(Boolean) : []
      }))
    };
  }

  function saveRecord(cardId, record, toast) {
    callbacks.onSave(cardId, record);
    if (toast) callbacks.onToast(toast);
    render();
  }

  function renderShell() {
    const games = unique(collectibleCards.map((card) => card.game).filter((game) => game && game !== 'Unknown'));
    const categories = unique(collectibleCards.map((card) => card.category));
    const elements = unique(collectibleCards.map((card) => card.element).filter((element) => element && element !== 'None'));
    const featureNames = ['Spyro', 'Tree Rex', 'Wash Buckler', 'Snap Shot', 'Spitfire'];
    const featured = featureNames.map((name) => collectibleCards.find((card) => card.name === name)).filter(Boolean);
    container.innerHTML = `
      <header class="catalog-hero">
        <div class="catalog-hero__copy">
          <div class="catalog-hero__kicker">
            <span class="catalog-hero__signal"><i aria-hidden="true"></i> Vault online</span>
            <span>${collectibleCards.length}-piece master archive</span>
          </div>
          <p class="eyebrow">The definitive collection companion</p>
          <h2><span>Every Skylander.</span><em>One living vault.</em></h2>
          <p>A pocket-ready home for every individually released figure, Trap, vehicle, crystal, Portal, item, and variant—built for fast scanning and effortless collecting.</p>
          <div class="catalog-hero__actions" aria-label="Vault shortcuts">
            <button class="button button--primary" type="button" data-hero-explore>Explore the vault</button>
            <button class="button" type="button" data-hero-scan>Add a figure</button>
          </div>
          <div class="catalog-hero__numbers" aria-label="Master catalog totals">
            <span><strong>${collectibleCards.length}</strong> obtainable pieces</span>
            <span><strong>${collectibleCards.length}</strong> original card artworks</span>
            <span><strong>${catalog.meta.linkedScanIdentities}</strong> scan links</span>
          </div>
        </div>
        <div class="catalog-hero__gallery" aria-label="Featured collection pieces">
          ${featured.map((card, index) => `<figure style="--hero-index:${index}"><img src="${escapeHtml(cardArtworkUrl(card))}" alt="${escapeHtml(card.name)} collector card"><figcaption>${escapeHtml(card.name)}</figcaption></figure>`).join('')}
        </div>
      </header>

      <section class="catalog-directory" data-catalog-directory aria-label="Browse the complete collection by game and item type"></section>

      <section class="catalog-progress" data-catalog-progress></section>

      <section class="catalog-toolbar" aria-label="Master catalog filters">
        <label class="catalog-toolbar__search"><span>Find a Skylander</span><input data-catalog-search type="search" autocomplete="off" placeholder="Name, variant, item, ID, or game…"></label>
        ${selectMarkup('Game', 'game', games)}
        ${selectMarkup('Type', 'category', categories)}
        ${selectMarkup('Element', 'element', elements)}
        ${selectMarkup('Collection', 'ownership', ['Owned', 'Missing', 'Wishlist', 'Scanned'])}
        ${selectMarkup('Sort', 'sort', ['Name', 'Game', 'Type', 'Owned first'])}
      </section>

      <div class="catalog-results-head">
        <p data-catalog-result-count></p>
        <div class="catalog-results-tools">
          <div class="catalog-layout-toggle" role="group" aria-label="Catalog view">
            <button class="button" type="button" data-catalog-layout="photos" aria-pressed="true">Card wall</button>
            <button class="button" type="button" data-catalog-layout="cards" aria-pressed="false">Info cards</button>
          </div>
          <button class="button" type="button" data-catalog-clear>Clear filters</button>
        </div>
      </div>
      <details class="scan-station">
        <summary><span>Add a figure</span><small data-scan-status>${escapeHtml(state.status)}</small></summary>
        <div class="scan-station__panel">
          <div class="scan-station__orb" aria-hidden="true"><i></i></div>
          <div class="scan-station__copy">
            <p class="eyebrow">Portal intake</p>
            <h3 id="scan-station-title">Identify and load a physical piece</h3>
            <p>Use a Character ID and Variant ID, or a UID you have already saved.</p>
            <p class="scan-station__safety">A Portal is required to read an original Skylanders figure. Use this field for a documented identity or a UID you already saved.</p>
          </div>
          <form class="scan-station__form" data-scan-form>
            <label>
              <span>Figure identity</span>
              <input data-scan-input autocomplete="off" placeholder="Character ID : Variant ID, or saved UID">
            </label>
            <button class="button button--primary" type="submit">Identify</button>
          </form>
          <section class="nfc-studio" aria-labelledby="nfc-studio-title">
            <div class="nfc-studio__intro">
              <p class="eyebrow">Personal tag studio</p>
              <strong id="nfc-studio-title">Read, write, or rewrite a Vault tag</strong>
              <span>Links a blank or personal NDEF tag to one saved copy. Original Skylanders tags are read-only here.</span>
            </div>
            <label class="nfc-studio__select">
              <span>Copy to link</span>
              <select data-nfc-copy-select aria-label="Choose an owned copy for the NFC tag">
                <option value="">Add a copy to begin</option>
              </select>
            </label>
            <div class="nfc-actions">
              <button class="button" type="button" data-nfc-scan>Read tag</button>
              <button class="button button--primary" type="button" data-nfc-write>Write / rewrite tag</button>
            </div>
            <span class="nfc-studio__capability" data-nfc-capability></span>
          </section>
        </div>
      </details>
      <div class="catalog-grid" data-catalog-grid data-layout="photos"></div>
      <button class="button catalog-load-more" type="button" data-catalog-more hidden>Show more cards</button>
      <footer class="catalog-sources">
        <p><strong>Collectible catalog:</strong> unreleased, internal, debug, and digital-only records are kept out of the obtainable collection (${referenceCount} reference identities remain available to the scanner). Market prices are dated snapshots.</p>
        <details><summary>Data sources and credits</summary><ul>${catalog.meta.sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a> — ${escapeHtml(source.use)}</li>`).join('')}</ul></details>
      </footer>`;
    container.querySelector('[data-catalog-sort]').value = state.sort;
  }

  function wireShell() {
    const search = container.querySelector('[data-catalog-search]');
    const scanStation = container.querySelector('.scan-station');
    const directory = container.querySelector('[data-catalog-directory]');
    container.querySelector('[data-hero-explore]').addEventListener('click', () => {
      container.querySelector('.catalog-toolbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => search.focus({ preventScroll: true }), 420);
    });
    container.querySelector('[data-hero-scan]').addEventListener('click', () => {
      scanStation.open = true;
      scanStation.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => container.querySelector('[data-scan-input]').focus({ preventScroll: true }), 420);
    });
    directory.addEventListener('click', (event) => {
      const gameButton = event.target.closest('[data-directory-game]');
      const categoryButton = event.target.closest('[data-directory-category]');
      if (!gameButton && !categoryButton) return;
      if (gameButton) {
        const game = gameButton.dataset.directoryGame;
        state.game = state.game === game ? '' : game;
        container.querySelector('[data-catalog-game]').value = state.game;
      }
      if (categoryButton) {
        const category = categoryButton.dataset.directoryCategory;
        state.category = state.category === category ? '' : category;
        container.querySelector('[data-catalog-category]').value = state.category;
      }
      state.limit = 72;
      render();
      container.querySelector('.catalog-results-head').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    search.addEventListener('input', () => {
      state.search = search.value;
      state.limit = 72;
      render();
    });

    ['game', 'category', 'element', 'ownership', 'sort'].forEach((key) => {
      container.querySelector(`[data-catalog-${key}]`).addEventListener('change', (event) => {
        state[key] = event.target.value;
        state.limit = 72;
        render();
      });
    });

    container.querySelector('[data-catalog-clear]').addEventListener('click', () => {
      Object.assign(state, { search: '', game: '', category: '', element: '', ownership: '', sort: 'name', limit: 72 });
      search.value = '';
      ['game', 'category', 'element', 'ownership', 'sort'].forEach((key) => {
        container.querySelector(`[data-catalog-${key}]`).value = key === 'sort' ? 'name' : '';
      });
      render();
    });

    container.querySelector('[data-catalog-more]').addEventListener('click', () => {
      state.limit += 72;
      render();
    });

    container.querySelectorAll('[data-catalog-layout]').forEach((button) => {
      button.addEventListener('click', () => {
        state.layout = button.dataset.catalogLayout;
        render();
      });
    });

    container.querySelector('[data-scan-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = container.querySelector('[data-scan-input]');
      identifyScan(input.value);
      input.select();
    });

    const nfcButton = container.querySelector('[data-nfc-scan]');
    const nfcWriteButton = container.querySelector('[data-nfc-write]');
    const nfcCopySelect = container.querySelector('[data-nfc-copy-select]');
    const nfcCapability = container.querySelector('[data-nfc-capability]');
    const nfcSupported = window.isSecureContext && 'NDEFReader' in window;
    nfcButton.disabled = !nfcSupported;
    nfcWriteButton.disabled = true;
    nfcCapability.textContent = nfcSupported
      ? 'Direct NFC is ready. Choose one of your saved copies to write a personal tag.'
      : 'Direct NFC requires a compatible Web NFC browser. The manual reader field still works here.';
    nfcButton.addEventListener('click', scanNfc);
    nfcCopySelect.addEventListener('change', () => {
      state.nfcSelection = nfcCopySelect.value;
      nfcWriteButton.disabled = !nfcSupported || !state.nfcSelection;
    });
    nfcWriteButton.addEventListener('click', () => {
      const [cardId, copyId] = state.nfcSelection.split('::');
      const card = cardsById.get(cardId);
      const copy = card ? getRecord(cardId).copies.find((item) => item.id === copyId) : null;
      if (!card || !copy) {
        callbacks.onToast('Choose a saved physical copy first.');
        return;
      }
      writeNfc(card, copy);
    });

    container.querySelector('[data-catalog-grid]').addEventListener('click', (event) => {
      const action = event.target.closest('[data-card-action]');
      if (!action) return;
      const cardId = action.dataset.cardId;
      if (action.dataset.cardAction === 'details') open(cardId);
      if (action.dataset.cardAction === 'add') quickAdd(cardId);
      if (action.dataset.cardAction === 'wishlist') toggleWishlist(cardId);
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-catalog-close]')) closeDialog();
    });
    dialog.addEventListener('cancel', () => { state.activeCardId = ''; });
  }

  function render() {
    const collection = callbacks.getState().catalog || {};
    const records = collectibleCards.map((card) => ({ card, record: getRecord(card.id) }));
    const ownedCards = records.filter(({ record }) => record.copies.length > 0).length;
    const ownedPieces = records.reduce((total, { record }) => total + record.copies.length, 0);
    const scannedPieces = records.reduce((total, { record }) => total + record.copies.filter((copy) => copy.uid).length, 0);
    const wishlist = records.filter(({ record }) => record.wishlist).length;
    renderDirectory(records);
    container.querySelector('[data-catalog-progress]').innerHTML = `
      <article><span>Cards owned</span><strong>${ownedCards}<small> / ${collectibleCards.length}</small></strong></article>
      <article><span>Physical pieces</span><strong>${ownedPieces}</strong></article>
      <article><span>Scanned copies</span><strong>${scannedPieces}</strong></article>
      <article><span>Wishlist</span><strong>${wishlist}</strong></article>`;
    renderNfcStudio(records);

    const query = normalizeText(state.search);
    let filtered = records.map(({ card, record }) => {
      const displayName = normalizeText(card.name);
      const relatedNames = [card.canonicalName, card.baseName].filter(Boolean).map(normalizeText);
      const aliases = (card.scl?.aliases || []).map(normalizeText);
      const identityText = normalizeText(card.scanIdentities.map((identity) => `${identity.name} ${identity.charId} ${identity.variantId}`).join(' '));
      const supportingText = normalizeText(`${card.id} ${card.category} ${card.element} ${card.edition} ${card.role} ${identityText}`);
      let searchRank = 0;
      if (query) {
        if (displayName === query) searchRank = 0;
        else if (displayName.startsWith(query)) searchRank = 1;
        else if (displayName.includes(query)) searchRank = 2;
        else if (relatedNames.some((name) => name.includes(query))) searchRank = 3;
        else if (aliases.some((alias) => alias.includes(query))) searchRank = 4;
        else if (supportingText.includes(query)) searchRank = 5;
        else searchRank = -1;
      }
      return { card, record, searchRank };
    }).filter(({ card, record, searchRank }) => {
      if (query && searchRank < 0) return false;
      if (state.game && card.game !== state.game) return false;
      if (state.category && card.category !== state.category) return false;
      if (state.element && card.element !== state.element) return false;
      if (state.ownership === 'owned' && record.copies.length === 0) return false;
      if (state.ownership === 'missing' && record.copies.length > 0) return false;
      if (state.ownership === 'wishlist' && !record.wishlist) return false;
      if (state.ownership === 'scanned' && !record.copies.some((copy) => copy.uid)) return false;
      return true;
    });

    const sorters = {
      name: (left, right) => left.card.name.localeCompare(right.card.name),
      game: (left, right) => gameOrder(left.card.game) - gameOrder(right.card.game) || left.card.name.localeCompare(right.card.name),
      category: (left, right) => left.card.category.localeCompare(right.card.category) || left.card.name.localeCompare(right.card.name),
      'owned first': (left, right) => Number(right.record.copies.length > 0) - Number(left.record.copies.length > 0) || left.card.name.localeCompare(right.card.name)
    };
    const activeSorter = sorters[state.sort] || sorters.name;
    filtered.sort((left, right) => (query ? left.searchRank - right.searchRank : 0) || activeSorter(left, right));

    const visible = filtered.slice(0, state.limit);
    container.querySelector('[data-catalog-result-count]').textContent = `${filtered.length} individual cards · showing ${visible.length}`;
    const grid = container.querySelector('[data-catalog-grid]');
    grid.dataset.layout = state.layout;
    grid.innerHTML = visible.map(({ card, record }) => cardMarkup(card, record)).join('') || emptyMarkup();
    container.querySelectorAll('[data-catalog-layout]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.catalogLayout === state.layout));
    });
    container.querySelector('[data-catalog-more]').hidden = state.limit >= filtered.length;
    container.querySelectorAll('[data-scan-status]').forEach((node) => { node.textContent = state.status; });
  }

  function renderDirectory(records) {
    const directory = container.querySelector('[data-catalog-directory]');
    const ownedTotal = records.filter(({ record }) => record.copies.length > 0).length;
    const categoryCounts = new Map();
    records.forEach(({ card }) => categoryCounts.set(card.category, (categoryCounts.get(card.category) || 0) + 1));
    const categoryButtons = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category, count]) => `<button class="catalog-directory__chip${state.category === category ? ' is-active' : ''}" type="button" data-directory-category="${escapeHtml(category)}" aria-pressed="${state.category === category}"><span>${escapeHtml(category)}</span><strong>${count}</strong></button>`)
      .join('');

    directory.innerHTML = `
      <header class="catalog-directory__head">
        <div><p class="eyebrow">Complete release library</p><h3>Browse every game. Find every piece.</h3><p>All six main games are organized as complete release lines, with Trap Team tools kept in their own clearly labeled area.</p></div>
        <button class="catalog-directory__all${state.game ? '' : ' is-active'}" type="button" data-directory-game="" aria-pressed="${!state.game}"><span>All games</span><strong>${records.length}</strong><small>${ownedTotal} owned</small></button>
      </header>
      <div class="catalog-directory__games">
        ${GAME_LINES.map((line, index) => {
          const gameRecords = records.filter(({ card }) => card.game === line.name);
          const owned = gameRecords.filter(({ record }) => record.copies.length > 0).length;
          const feature = collectibleCards.find((card) => card.name === line.feature && card.game === line.name) || gameRecords[0]?.card;
          const percent = gameRecords.length ? Math.round((owned / gameRecords.length) * 100) : 0;
          return `<button class="series-card${state.game === line.name ? ' is-active' : ''}" type="button" data-directory-game="${escapeHtml(line.name)}" aria-pressed="${state.game === line.name}" style="--series-accent:${line.accent};--series-progress:${percent}%;--series-index:${index}">
            <span class="series-card__art">${feature ? `<img src="${escapeHtml(cardArtworkUrl(feature))}" alt="" loading="lazy">` : ''}</span>
            <span class="series-card__copy"><small>${line.number} · ${line.year}</small><strong>${escapeHtml(line.name)}</strong><span>${gameRecords.length} obtainable pieces</span><i><b></b></i><em>${owned} collected</em></span>
          </button>`;
        }).join('')}
      </div>
      <div class="catalog-directory__types" aria-label="Browse by item type"><span>Item types</span><div>${categoryButtons}</div></div>`;
  }

  function renderNfcStudio(records) {
    const select = container.querySelector('[data-nfc-copy-select]');
    const writeButton = container.querySelector('[data-nfc-write]');
    const capability = container.querySelector('[data-nfc-capability]');
    if (!select || !writeButton || !capability) return;
    const nfcSupported = window.isSecureContext && 'NDEFReader' in window;
    const choices = records.flatMap(({ card, record }) => record.copies.map((copy, index) => ({
      value: `${card.id}::${copy.id}`,
      label: `${card.name} · Copy ${index + 1}${copy.uid ? ` · ${copy.uid}` : ''}`
    })));
    if (!choices.some((choice) => choice.value === state.nfcSelection)) {
      state.nfcSelection = choices.length === 1 ? choices[0].value : '';
    }
    select.innerHTML = choices.length
      ? `<option value="">Choose one of ${choices.length} saved ${choices.length === 1 ? 'copy' : 'copies'}</option>${choices.map((choice) => `<option value="${escapeHtml(choice.value)}" ${choice.value === state.nfcSelection ? 'selected' : ''}>${escapeHtml(choice.label)}</option>`).join('')}`
      : '<option value="">Add a copy to begin</option>';
    select.disabled = choices.length === 0;
    writeButton.disabled = !nfcSupported || !state.nfcSelection;
    capability.textContent = nfcSupported
      ? choices.length
        ? 'Ready for compatible writable NDEF tags. Writing replaces the tag’s existing NDEF message.'
        : 'Add a physical copy to any card, then return here to write its personal Vault tag.'
      : 'Direct NFC is unavailable in this browser. You can still scan with an external reader and paste its result above.';
  }

  function cardMarkup(card, record) {
    const owned = record.copies.length;
    const scanned = record.copies.filter((copy) => copy.uid).length;
    const identity = card.scanIdentities[0];
    const compatibilityGames = Object.entries(card.compatibility || {}).filter(([, value]) => String(value).startsWith('yes')).map(([game]) => GAME_SHORT[game] || game);
    const verification = verificationLabel(card.verification?.status);
    const cardArt = cardArtworkUrl(card);
    const identityLine = [card.releaseYear, identity?.charId ? `ID ${identity.charId}` : '', identity?.variantId ? `VARIANT ${identity.variantId}` : ''].filter(Boolean).join(' · ');
    const seriesLine = [card.element !== 'None' ? card.element : '', card.scl?.series || card.role, card.edition && card.edition !== 'Standard' ? card.edition : ''].filter(Boolean).join(' · ') || 'Source-backed catalog record';
    const releaseLine = [card.releaseYear, card.game || 'Reference'].filter(Boolean).join(' · ');
    const scanLine = identity ? `${identity.charId} · ${identity.variantId}` : 'No exact NFC identity';
    const worksWithLine = compatibilityGames.length ? compatibilityGames.join(' · ') : 'Not applicable';
    return `<article class="catalog-card" data-owned="${owned > 0}" style="--card-el:${elementColor(card.element)}">
      <button class="catalog-card__photo" type="button" data-card-action="details" data-card-id="${card.id}" aria-label="Open ${escapeHtml(card.name)} details">
        <img class="catalog-card__art" loading="lazy" decoding="async" src="${escapeHtml(cardArt)}" alt="Original collector-card artwork of ${escapeHtml(card.name)}" onload="this.closest('.catalog-card__photo').dataset.loaded='true'" onerror="this.hidden=true;this.nextElementSibling.hidden=false;this.closest('.catalog-card__photo').dataset.loaded='error'">
        <span class="catalog-card__fallback" hidden aria-hidden="true">${escapeHtml(card.element === 'None' ? card.category.slice(0, 2).toUpperCase() : card.element.slice(0, 2).toUpperCase())}</span>
        ${owned ? `<i class="catalog-card__owned">Owned ×${owned}</i>` : ''}
        <span class="catalog-card__photo-caption">
          <small>${escapeHtml([card.element !== 'None' ? card.element : '', card.role || card.category, card.game].filter(Boolean).join(' · '))}</small>
          <strong>${escapeHtml(card.name)}</strong>
          <em>${escapeHtml(identityLine || card.category)}</em>
          <b>${compatibilityGames.length ? `Works with: ${escapeHtml(compatibilityGames.join(' · '))}` : escapeHtml(card.category)}</b>
        </span>
        <span class="catalog-card__zoom-hint" aria-hidden="true">View card + info</span>
      </button>
      <button class="catalog-card__quick-add" type="button" data-card-action="add" data-card-id="${card.id}" aria-label="Add one ${escapeHtml(card.name)} to your vault">+</button>
      <div class="catalog-card__body">
        <div class="catalog-card__kicker"><span class="catalog-card__element">${escapeHtml(card.element !== 'None' ? card.element : 'Item')}</span><span>${escapeHtml(card.category)}</span></div>
        <h3>${escapeHtml(card.name)}</h3>
        <p class="catalog-card__series">${escapeHtml(seriesLine)}</p>
        <dl class="catalog-card__meta">
          <div><dt>Released</dt><dd>${escapeHtml(releaseLine)}</dd></div>
          <div><dt>Tag identity</dt><dd class="catalog-card__scan-id">${escapeHtml(scanLine)}</dd></div>
          <div><dt>Works with</dt><dd>${escapeHtml(worksWithLine)}</dd></div>
        </dl>
        <span class="catalog-verification" data-level="${escapeHtml(verification.level)}">${escapeHtml(verification.label)}</span>
        <div class="catalog-card__facts">
          ${owned ? `<span>${owned} owned</span>` : '<span>Not owned</span>'}
          ${scanned ? `<span>${scanned} scanned</span>` : ''}
        </div>
      </div>
      <div class="catalog-card__actions">
        <button class="button" type="button" data-card-action="wishlist" data-card-id="${card.id}" aria-pressed="${record.wishlist}">${record.wishlist ? '★ Wanted' : '☆ Wishlist'}</button>
        <button class="button button--primary" type="button" data-card-action="add" data-card-id="${card.id}">+ Copy</button>
        <button class="button" type="button" data-card-action="details" data-card-id="${card.id}">All info</button>
      </div>
    </article>`;
  }

  function quickAdd(cardId, seed = {}) {
    const card = cardsById.get(cardId);
    if (!card || !isCollectibleCard(card)) return;
    const record = getRecord(cardId);
    record.copies.push({
      id: String(seed.copyId || makeCopyId()),
      uid: String(seed.uid || ''),
      condition: 'Not graded',
      packaging: 'Loose',
      storage: '',
      acquired: '',
      paid: '',
      notes: '',
      photos: []
    });
    saveRecord(cardId, record, `${card.name} added to your vault`);
    if (seed.openDetails) open(cardId);
  }

  function toggleWishlist(cardId) {
    const card = cardsById.get(cardId);
    if (!card) return;
    const record = getRecord(cardId);
    record.wishlist = !record.wishlist;
    saveRecord(cardId, record, record.wishlist ? `${card.name} added to wishlist` : `${card.name} removed from wishlist`);
  }

  function open(cardId, options = {}) {
    const card = cardsById.get(cardId);
    if (!card) return false;
    state.activeCardId = cardId;
    if (options.addCopy) {
      const record = getRecord(cardId);
      record.copies.push({ id: makeCopyId(), uid: String(options.uid || ''), condition: 'Not graded', packaging: 'Loose', storage: '', acquired: '', paid: '', notes: '', photos: [] });
      saveRecord(cardId, record);
    }
    renderDialog(card);
    if (!dialog.open) dialog.showModal();
    return true;
  }

  function renderDialog(card) {
    const record = getRecord(card.id);
    const profile = card.profileKey ? catalog.details[card.profileKey] : null;
    const copies = record.copies;
    const verification = verificationLabel(card.verification?.status);
    const compatibilityEntries = Object.entries(card.compatibility || {});
    const sourcedFacts = Object.entries(card.scl?.allInfo || {});
    const marketListings = card.marketListings?.length ? card.marketListings : (card.productId ? [{ productId: card.productId, name: card.name, sourceUrl: card.sourceUrl, photoUrl: card.listingPhotoUrl || '', market: card.market || {}, marketAsOf: card.marketAsOf || '' }] : []);
    const sources = card.sources || [];
    dialog.innerHTML = `<form class="catalog-detail" data-catalog-form>
      <header class="catalog-detail__header" style="--card-el:${elementColor(card.element)}">
        <div class="catalog-detail__photos">
          ${photoButton(cardArtworkUrl(card), `Original collector-card artwork of ${card.name}`, 'Collector card')}
        </div>
        <div>
          <p class="eyebrow">${escapeHtml(card.category)} · ${escapeHtml(card.game || 'Reference record')}</p>
          <h2>${escapeHtml(card.name)}</h2>
          <p>${escapeHtml([card.element !== 'None' ? card.element : '', card.scl?.series || card.role, card.edition && card.edition !== 'Standard' ? card.edition : ''].filter(Boolean).join(' · '))}</p>
          <span class="catalog-verification" data-level="${escapeHtml(verification.level)}">${escapeHtml(verification.label)}</span>
          ${profile?.catchphrase ? `<blockquote>“${escapeHtml(profile.catchphrase)}”</blockquote>` : ''}
        </div>
        <button class="icon-button close-button" type="button" data-catalog-close aria-label="Close details">×</button>
      </header>

      <nav class="catalog-detail__jump" aria-label="Card detail sections">
        <a href="#catalog-overview">Overview</a><a href="#catalog-games">Games</a><a href="#catalog-scan">Scan IDs</a><a href="#catalog-guide">Guide</a><a href="#catalog-copies">My copies</a>
      </nav>

      <section id="catalog-overview" class="catalog-detail__section">
        <h3>Identification overview</h3>
        <div class="catalog-evidence" data-level="${escapeHtml(verification.level)}"><strong>${escapeHtml(verification.label)}</strong><p>${escapeHtml(card.verification?.statement || 'Source information is listed below.')}</p></div>
        <dl class="catalog-fact-grid">
          ${fact('Canonical item', card.canonicalName || card.name)}${fact('Release line', card.game || 'Not applicable / not stated')}${fact('Release year', card.releaseYear || 'Not stated')}${fact('Piece type', card.category)}${fact('Element', card.element || 'Not stated')}${fact('Series / role', card.scl?.series || card.role || 'Not applicable')}${fact('Vehicle terrain', card.terrain || 'Not applicable')}${fact('Exact scan links', String(card.scanIdentities.length))}
        </dl>
        ${sourcedFacts.length ? `<details open><summary>Item-page fact table (${sourcedFacts.length})</summary><dl class="catalog-fact-grid">${sourcedFacts.map(([label, value]) => fact(label, value || 'Not stated')).join('')}</dl></details>` : ''}
        ${profile?.description ? `<p class="catalog-lede">${escapeHtml(profile.description)}</p>` : ''}
        ${profile ? `<div class="catalog-profile-strip">${profile.species ? `<span><small>Species</small>${escapeHtml(profile.species)}</span>` : ''}${profile.gender ? `<span><small>Gender</small>${escapeHtml(profile.gender)}</span>` : ''}${profile.primaryGame ? `<span><small>Debut</small>${escapeHtml(profile.primaryGame)}</span>` : ''}</div>` : ''}
        ${profile?.biography ? `<details><summary>Full biography</summary><p>${escapeHtml(profile.biography)}</p></details>` : ''}
      </section>

      <section id="catalog-games" class="catalog-detail__section">
        <h3>Game compatibility</h3>
        ${compatibilityEntries.length ? `<div class="compatibility-grid">${compatibilityEntries.map(([game, support]) => compatibilityMarkup(game, support)).join('')}</div>` : '<p>Game compatibility is not applicable to this package, accessory, Portal, villain reference, or internal record—or the source does not establish a single toy identity.</p>'}
        <p class="catalog-help">Yes and No values are copied from the item page when available. For source-backed listings without an item page, they follow Activision’s official rule that a released toy works in its release game and later games, but not earlier games. Donkey Kong, Bowser, Barrel Blaster, and Clown Cruiser require compatible Nintendo hardware.</p>
        ${profile?.appearances?.length ? `<details><summary>Other appearances</summary><p>${profile.appearances.map(escapeHtml).join(' · ')}</p></details>` : ''}
      </section>

      <section id="catalog-scan" class="catalog-detail__section">
        <h3>Portal and scan identity</h3>
        ${card.scanIdentities.length ? `<div class="scan-id-list">${card.scanIdentities.map((identity) => `<article><strong>${escapeHtml(identity.name)}</strong><code>${escapeHtml(identity.charId)}</code><code>${escapeHtml(identity.variantId)}</code><span>${escapeHtml(identity.section || identity.category)} · ${escapeHtml(identity.matchMethod || 'exact documented match')}</span></article>`).join('')}</div>` : `<p>No one-to-one scan identity is assigned to this card. ${card.category === 'Pack / Set' ? 'Scan each included NFC piece on its individual card.' : card.category === 'Portal' || card.category === 'Accessory' ? 'This hardware or accessory is not a character/item NFC identity.' : card.verification?.status === 'source-backed-listing' ? 'The listing does not identify a unique mold or variant strongly enough for an exact ID link.' : 'The documented ID sources do not establish an exact link.'}</p>`}
        <p class="catalog-help">Character ID identifies the base toy. Variant ID identifies the series, edition, mold, or special release. UID identifies your individual physical copy and is saved below only after you scan it.</p>
      </section>

      <section id="catalog-guide" class="catalog-detail__section">
        <h3>Tips, tricks, and gameplay guide</h3>
        ${card.tips?.length ? `<ul class="catalog-tip-list">${card.tips.map((tip) => `<li>${escapeHtml(typeof tip === 'string' ? tip : tip.text)}${typeof tip === 'object' && tip.source ? ` <a href="${escapeHtml(tip.source)}" target="_blank" rel="noreferrer">Source</a>` : ''}</li>`).join('')}</ul>` : '<p>No item-specific tip is stated by the checked sources.</p>'}
        ${profile?.gameplay ? `<details open><summary>Community gameplay guide</summary><p class="catalog-help">The following strategy text is a community guide, not an Activision fact sheet.</p><p>${escapeHtml(profile.gameplay)}</p></details>` : ''}
        ${profile?.abilities?.length ? `<details><summary>Abilities and upgrade paths (${profile.abilities.length})</summary><div class="ability-list">${profile.abilities.map((ability) => `<article><span>${escapeHtml(ability.group)}</span><strong>${escapeHtml(ability.name)}</strong><p>${escapeHtml(ability.description)}</p>${Number.isFinite(ability.price) ? `<small>${ability.price.toLocaleString()} gold</small>` : ''}</article>`).join('')}</div></details>` : ''}
        ${profile?.trivia?.length ? `<details><summary>Collector trivia (${profile.trivia.length})</summary><ul>${profile.trivia.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : ''}
      </section>

      <section class="catalog-detail__section">
        <h3>Reference and value snapshot</h3>
        <dl class="catalog-fact-grid">${fact('Loose', card.market?.loose || 'No market snapshot')}${fact('Complete / boxed', card.market?.cib || 'No market snapshot')}${fact('New', card.market?.new || 'No market snapshot')}${fact('Snapshot date', card.marketAsOf || 'Not applicable')}</dl>
        ${marketListings.length ? `<details><summary>Marketplace listings retained (${marketListings.length})</summary><ul>${marketListings.map((listing) => `<li><a href="${escapeHtml(listing.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(listing.name)}</a>${listing.marketAsOf ? ` · snapshot ${escapeHtml(listing.marketAsOf)}` : ''}</li>`).join('')}</ul></details>` : ''}
        <details open><summary>Evidence for this card (${sources.length})</summary><ul>${sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a> — ${escapeHtml((source.covers || []).join(', '))} <small>(${escapeHtml(source.level || 'source')})</small></li>`).join('')}</ul></details>
        <div class="catalog-links">${card.scl?.url ? `<a class="button" href="${escapeHtml(card.scl.url)}" target="_blank" rel="noreferrer">Item fact page</a>` : ''}${card.sourceUrl ? `<a class="button" href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noreferrer">Catalog listing</a>` : ''}${profile?.wikiUrl ? `<a class="button" href="${escapeHtml(profile.wikiUrl)}" target="_blank" rel="noreferrer">Community character guide</a>` : ''}</div>
      </section>

      <section id="catalog-copies" class="catalog-detail__section catalog-inventory">
        <div class="catalog-inventory__head"><div><h3>My physical copies</h3><p>${copies.length ? `${copies.length} saved cop${copies.length === 1 ? 'y' : 'ies'}` : 'Nothing owned yet'}</p></div><button class="button button--primary" type="button" data-add-copy>+ Add a copy</button></div>
        <label class="catalog-wishlist"><input type="checkbox" data-record-wishlist ${record.wishlist ? 'checked' : ''}> Keep this card on my wishlist</label>
        <div data-copy-list>${copies.map((copy, index) => copyMarkup(copy, index)).join('') || '<p class="catalog-empty-copy">Add a copy now, scan it, and attach photos from your phone.</p>'}</div>
        <label class="field">Card notes<textarea data-record-notes rows="3" placeholder="Anything that applies to every copy of this release…">${escapeHtml(record.notes)}</textarea></label>
      </section>

      <footer class="catalog-detail__actions"><button class="button" type="button" data-catalog-close>Close</button><button class="button button--primary" type="submit">Save card</button></footer>
      <div class="catalog-photo-viewer" data-photo-viewer hidden aria-hidden="true">
        <button class="icon-button catalog-photo-viewer__close" type="button" data-photo-viewer-close aria-label="Close enlarged photo">×</button>
        <img data-photo-viewer-image alt="">
        <p data-photo-viewer-caption></p>
      </div>
    </form>`;

    const form = dialog.querySelector('[data-catalog-form]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const updated = readRecordFromDialog(record);
      saveRecord(card.id, updated, `${card.name} card saved`);
      closeDialog();
    });
    dialog.querySelector('[data-add-copy]').addEventListener('click', () => {
      const updated = readRecordFromDialog(record);
      updated.copies.push({ id: makeCopyId(), uid: '', condition: 'Not graded', packaging: 'Loose', storage: '', acquired: '', paid: '', notes: '', photos: [] });
      saveRecord(card.id, updated);
      renderDialog(card);
      dialog.querySelector('[data-copy-list] article:last-child input')?.focus();
    });
    dialog.querySelectorAll('[data-remove-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        const updated = readRecordFromDialog(record);
        const removed = updated.copies.find((copy) => copy.id === button.dataset.removeCopy);
        if (removed?.photos?.length && !confirm('Remove this copy and all of its uploaded photos?')) return;
        await Promise.allSettled((removed?.photos || []).map((photo) => callbacks.onDeletePhoto?.(photo.id)));
        updated.copies = updated.copies.filter((copy) => copy.id !== button.dataset.removeCopy);
        saveRecord(card.id, updated);
        renderDialog(card);
      });
    });

    dialog.querySelectorAll('[data-copy-photo-input]').forEach((input) => {
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        const copyId = input.dataset.copyPhotoInput;
        const label = dialog.querySelector(`[data-copy-photo-label="${cssEscape(copyId)}"]`);
        try {
          if (!callbacks.onUploadPhoto) throw new Error('Cloud photo sync is still connecting.');
          if (label) label.dataset.loading = 'true';
          callbacks.onToast('Uploading photo…');
          const photo = await callbacks.onUploadPhoto(card.id, copyId, file);
          const updated = readRecordFromDialog(record);
          const copy = updated.copies.find((item) => item.id === copyId);
          if (copy && photo) copy.photos.push(normalizePhoto(photo));
          saveRecord(card.id, updated, 'Photo added and syncing');
          renderDialog(card);
        } catch (error) {
          callbacks.onToast(error?.message || 'Photo upload failed');
          if (label) label.dataset.loading = 'false';
        } finally {
          input.value = '';
        }
      });
    });

    dialog.querySelectorAll('[data-delete-photo]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Delete this personal collection photo from every synced device?')) return;
        try {
          await callbacks.onDeletePhoto?.(button.dataset.deletePhoto);
          const updated = readRecordFromDialog(record);
          const copy = updated.copies.find((item) => item.id === button.dataset.copyId);
          if (copy) copy.photos = copy.photos.filter((photo) => photo.id !== button.dataset.deletePhoto);
          saveRecord(card.id, updated, 'Photo deleted');
          renderDialog(card);
        } catch (error) {
          callbacks.onToast(error?.message || 'Could not delete that photo');
        }
      });
    });

    dialog.querySelectorAll('[data-nfc-write-copy]').forEach((button) => {
      button.disabled = !(window.isSecureContext && 'NDEFReader' in window);
      if (button.disabled) button.title = 'Direct NFC writing is unavailable in this browser.';
      button.addEventListener('click', () => {
        const updated = readRecordFromDialog(record);
        const copy = updated.copies.find((item) => item.id === button.dataset.nfcWriteCopy);
        if (copy) writeNfc(card, copy);
      });
    });
    const viewer = dialog.querySelector('[data-photo-viewer]');
    const closeViewer = () => {
      viewer.hidden = true;
      viewer.setAttribute('aria-hidden', 'true');
    };
    dialog.querySelectorAll('[data-photo-viewer-src]').forEach((button) => {
      button.addEventListener('click', () => {
        const image = viewer.querySelector('[data-photo-viewer-image]');
        image.src = button.dataset.photoViewerSrc;
        image.alt = button.dataset.photoViewerAlt;
        viewer.querySelector('[data-photo-viewer-caption]').textContent = button.dataset.photoViewerLabel;
        viewer.hidden = false;
        viewer.setAttribute('aria-hidden', 'false');
        viewer.querySelector('[data-photo-viewer-close]').focus();
      });
    });
    viewer.addEventListener('click', (event) => {
      if (event.target === viewer || event.target.closest('[data-photo-viewer-close]')) closeViewer();
    });
  }

  function readRecordFromDialog(fallback) {
    const priorCopies = new Map((fallback.copies || []).map((copy) => [copy.id, copy]));
    const copies = Array.from(dialog.querySelectorAll('[data-copy]')).map((article) => {
      const prior = priorCopies.get(article.dataset.copy);
      return {
        id: article.dataset.copy,
        uid: article.querySelector('[data-copy-uid]').value.trim(),
        condition: article.querySelector('[data-copy-condition]').value,
        packaging: article.querySelector('[data-copy-packaging]').value,
        storage: article.querySelector('[data-copy-storage]').value.trim(),
        acquired: article.querySelector('[data-copy-acquired]').value,
        paid: article.querySelector('[data-copy-paid]').value.trim(),
        notes: article.querySelector('[data-copy-notes]').value.trim(),
        photos: Array.isArray(prior?.photos) ? prior.photos.map(normalizePhoto).filter(Boolean) : []
      };
    });
    return {
      wishlist: dialog.querySelector('[data-record-wishlist]')?.checked ?? fallback.wishlist,
      notes: dialog.querySelector('[data-record-notes]')?.value.trim() ?? fallback.notes,
      copies
    };
  }

  function identifyScan(input) {
    const parsed = parseScan(input);
    if (!parsed) {
      state.status = 'I need Character ID + Variant ID, or a UID that was saved before.';
      callbacks.onToast(state.status);
      render();
      return null;
    }
    const hasCharacterId = parsed.charId !== '' && parsed.charId !== null && parsed.charId !== undefined;
    if (parsed.uid && !hasCharacterId) {
      for (const card of catalog.cards) {
        const record = getRecord(card.id);
        if (record.copies.some((copy) => normalizeScan(copy.uid) === normalizeScan(parsed.uid))) {
          state.status = `${card.name} found from saved UID ${parsed.uid}.`;
          render();
          open(card.id);
          return card;
        }
      }
      state.status = `UID ${parsed.uid} is new. A reader must also provide Character ID and Variant ID the first time.`;
      callbacks.onToast(state.status);
      render();
      return null;
    }
    const key = `${toHex(parsed.charId)}:${toHex(parsed.variantId)}`;
    const cardId = catalog.scanIndex[key];
    const card = cardId ? cardsById.get(cardId) : null;
    if (!card || !isCollectibleCard(card)) {
      const technical = (catalog.scanCatalog || catalog.unmappedScanIdentities || []).find((identity) => `${identity.charId}:${identity.variantId}` === key);
      const labels = { 'technical-only': 'internal/debug or unreleased game-data record', 'in-game/digital': 'digital or in-game identity', documented: 'documented ID without a confirmed retail-card link' };
      const reference = technical || card?.scanIdentities?.find((identity) => `${identity.charId}:${identity.variantId}` === key);
      state.status = reference ? `${reference.name || card?.name} recognized as a ${labels[reference.releaseStatus] || 'reference-only record'}. It is not mixed into the obtainable collection.` : `No documented identity for ${key}.`;
      callbacks.onToast(state.status);
      render();
      return reference || null;
    }
    state.status = `${card.name} identified${parsed.uid ? ` · UID ${parsed.uid}` : ''}.`;
    render();
    const record = getRecord(card.id);
    const uidExists = parsed.uid && record.copies.some((copy) => normalizeScan(copy.uid) === normalizeScan(parsed.uid));
    if (parsed.uid && !uidExists) quickAdd(card.id, { uid: parsed.uid, openDetails: true });
    else open(card.id);
    callbacks.onToast(`${card.name} discovered`);
    return card;
  }

  async function scanNfc() {
    if (!window.isSecureContext || !('NDEFReader' in window)) {
      state.status = 'Direct web NFC is unavailable here. Use the reader result field instead.';
      callbacks.onToast(state.status);
      render();
      return;
    }
    const controller = new AbortController();
    const reader = new NDEFReader();
    let finished = false;
    const stop = () => {
      if (finished) return;
      finished = true;
      controller.abort();
    };
    try {
      state.status = 'Hold a compatible NFC tag near your phone…';
      render();
      await reader.scan({ signal: controller.signal });
      const timer = setTimeout(() => {
        stop();
        state.status = 'NFC scan timed out. Try again or use the reader field.';
        render();
      }, 20000);
      reader.addEventListener('readingerror', () => {
        clearTimeout(timer);
        stop();
        state.status = 'That NFC tag could not be read as NDEF.';
        callbacks.onToast(state.status);
        render();
      }, { once: true });
      reader.addEventListener('reading', (event) => {
        clearTimeout(timer);
        stop();
        const payload = readNfcPayload(event.message);
        if (payload?.app === 'gibly-skylanders-vault' && payload.cardId) {
          const card = cardsById.get(payload.cardId);
          if (!card || !isCollectibleCard(card)) {
            state.status = 'This tag points to a reference-only record.';
          } else {
            const record = getRecord(card.id);
            const exists = record.copies.some((copy) => copy.id === payload.copyId);
            if (exists) open(card.id);
            else quickAdd(card.id, { copyId: payload.copyId, uid: event.serialNumber || payload.uid || '', openDetails: true });
            state.status = `${card.name} loaded from NFC.`;
          }
        } else if (payload) {
          identifyScan(payload);
        } else if (event.serialNumber) {
          identifyScan({ uid: event.serialNumber });
        } else {
          state.status = 'NFC tag read, but it does not contain a Vault record.';
        }
        callbacks.onToast(state.status);
        render();
      }, { once: true });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      state.status = error?.name === 'NotAllowedError'
        ? 'NFC permission was not granted.'
        : 'Direct NFC could not start on this device.';
      callbacks.onToast(state.status);
      render();
    }
  }

  async function writeNfc(card, copy) {
    if (!window.isSecureContext || !('NDEFReader' in window)) {
      state.status = 'Direct NFC writing is unavailable in this browser.';
      callbacks.onToast(state.status);
      render();
      return false;
    }
    const approved = confirm(`Write ${card.name} · Copy ${copy.id.slice(-6)} to a compatible personal NFC tag? This rewrites the tag’s existing NDEF message. Never use an original Skylanders figure.`);
    if (!approved) return false;
    const identity = card.scanIdentities?.[0] || null;
    const payload = {
      app: 'gibly-skylanders-vault',
      version: 2,
      cardId: card.id,
      cardName: card.name,
      copyId: copy.id,
      uid: copy.uid || '',
      charId: identity?.charId || '',
      variantId: identity?.variantId || '',
      writtenAt: new Date().toISOString()
    };
    try {
      state.status = 'Hold your compatible writable NFC tag near the phone…';
      render();
      const writer = new NDEFReader();
      const tagUrl = new URL(window.location.href);
      tagUrl.search = '';
      tagUrl.hash = `vault-card=${encodeURIComponent(card.id)}`;
      await writer.write({ records: [
        {
          recordType: 'mime',
          mediaType: 'application/vnd.gibly.skylanders+json',
          data: JSON.stringify(payload)
        },
        {
          recordType: 'url',
          data: tagUrl.href
        }
      ] }, { overwrite: true });
      state.status = `${card.name} Vault link written to NFC.`;
      callbacks.onToast('Personal NFC tag written successfully');
      render();
      return true;
    } catch (error) {
      const messages = {
        NotAllowedError: 'NFC write permission was not granted.',
        NotSupportedError: 'This tag or browser does not support NDEF writing.',
        NetworkError: 'That NFC tag is read-only or moved away too soon.',
        AbortError: 'NFC writing was cancelled.'
      };
      state.status = messages[error?.name] || 'That personal NFC tag could not be written. Try a blank writable NDEF tag.';
      callbacks.onToast(state.status);
      render();
      return false;
    }
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
    state.activeCardId = '';
  }

  return { render, open, identifyScan, scanNfc, writeNfc, meta: catalog.meta };
}

function selectMarkup(label, key, options) {
  const values = options.map((option) => typeof option === 'string' ? { value: normalizeText(option), label: option } : option);
  return `<label><span>${escapeHtml(label)}</span><select data-catalog-${key}><option value="">All ${escapeHtml(label.toLowerCase())}</option>${values.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
}

function unique(values) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right)).map((value) => ({ value, label: value }));
}

function fact(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function cardArtworkUrl(card) {
  return `assets/card-art/cards/${encodeURIComponent(card.id)}.webp`;
}

function photoButton(src, alt, label) {
  return `<button class="catalog-detail__photo-button" type="button" data-photo-viewer-src="${escapeHtml(src)}" data-photo-viewer-alt="${escapeHtml(alt)}" data-photo-viewer-label="${escapeHtml(label)}" aria-label="Enlarge ${escapeHtml(label.toLowerCase())}"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"><span>${escapeHtml(label)} · Tap to enlarge</span></button>`;
}

function compatibilityMarkup(game, support) {
  const [level, restriction] = String(support || 'unknown').split(':');
  const labels = { yes: 'Yes', no: 'No', unknown: 'Not stated' };
  return `<article data-support="${level}"><strong>${escapeHtml(GAME_SHORT[game] || game)}</strong><span>${labels[level] || level}</span>${restriction === 'nintendo' ? '<small>Nintendo only</small>' : ''}</article>`;
}

function verificationLabel(status) {
  return {
    'cross-checked': { label: 'Cross-checked item', level: 'high' },
    'source-backed': { label: 'Source-backed item', level: 'high' },
    'source-backed-listing': { label: 'Source-backed listing', level: 'listing' }
  }[status] || { label: 'Reference record', level: 'reference' };
}

function copyMarkup(copy, index) {
  const photos = Array.isArray(copy.photos) ? copy.photos.filter(Boolean) : [];
  return `<article class="catalog-copy" data-copy="${escapeHtml(copy.id)}">
    <header><strong>Copy ${index + 1}</strong><div class="catalog-copy__header-actions"><button class="button button--tag" type="button" data-nfc-write-copy="${escapeHtml(copy.id)}" title="Write this copy to a blank or personal writable NDEF tag">Write / rewrite tag</button><button class="button button--danger" type="button" data-remove-copy="${escapeHtml(copy.id)}">Remove</button></div></header>
    <div class="catalog-copy__grid">
      <label><span>Scan UID</span><input data-copy-uid value="${escapeHtml(copy.uid)}" placeholder="Filled by reader or paste manually"></label>
      <label><span>Condition</span><select data-copy-condition>${optionsMarkup(CONDITION_OPTIONS, copy.condition)}</select></label>
      <label><span>Packaging</span><select data-copy-packaging>${optionsMarkup(PACKAGING_OPTIONS, copy.packaging)}</select></label>
      <label><span>Storage location</span><input data-copy-storage value="${escapeHtml(copy.storage)}" placeholder="Shelf, bin, display…"></label>
      <label><span>Acquired</span><input data-copy-acquired type="date" value="${escapeHtml(copy.acquired)}"></label>
      <label><span>Price paid</span><input data-copy-paid inputmode="decimal" value="${escapeHtml(copy.paid)}" placeholder="$0.00"></label>
    </div>
    <label><span>Copy notes</span><textarea data-copy-notes rows="2" placeholder="Paint, damage, tag behavior, seller…">${escapeHtml(copy.notes)}</textarea></label>
    <section class="copy-photos" aria-label="Personal photos for copy ${index + 1}">
      <div class="copy-photos__head"><div><strong>My photos</strong><span>${photos.length ? `${photos.length} synced` : 'Photograph this exact piece'}</span></div><label class="button copy-photo-upload" data-copy-photo-label="${escapeHtml(copy.id)}"><input data-copy-photo-input="${escapeHtml(copy.id)}" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" hidden><span>Add photo</span></label></div>
      ${photos.length ? `<div class="copy-photo-grid">${photos.map((photo) => `<figure><button type="button" data-photo-viewer-src="${escapeHtml(photo.url)}" data-photo-viewer-alt="Personal photo of copy ${index + 1}" data-photo-viewer-label="${escapeHtml(photo.filename || `Copy ${index + 1} photo`)}"><img loading="lazy" src="${escapeHtml(photo.url)}" alt="Personal collection photo"></button><button class="copy-photo-delete" type="button" data-delete-photo="${escapeHtml(photo.id)}" data-copy-id="${escapeHtml(copy.id)}" aria-label="Delete this photo">Ã—</button></figure>`).join('')}</div>` : '<p class="copy-photos__empty">On your phone, tap Add photo to open the camera. It will appear on your other signed-in devices after syncing.</p>'}
    </section>
  </article>`;
}

function optionsMarkup(options, selected) {
  return options.map((option) => `<option value="${escapeHtml(option)}" ${option === selected ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('');
}

function parseScan(input) {
  if (input && typeof input === 'object') {
    return {
      charId: input.charId ?? input.characterId ?? '',
      variantId: input.variantId ?? '',
      uid: input.uid ?? ''
    };
  }
  const value = String(input || '').trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parseScan(parsed);
  } catch {}
  const pair = value.match(/(?:char(?:acter)?\s*(?:id)?\s*[:=]?\s*)?(0x[0-9a-f]+|\d+)\s*[,/:| ]+\s*(?:variant\s*(?:id)?\s*[:=]?\s*)?(0x[0-9a-f]+|\d+)(?:\s*[,| ]+\s*(?:uid\s*[:=]?\s*)?([0-9a-f:-]{6,}))?/i);
  if (pair) return { charId: pair[1], variantId: pair[2], uid: pair[3] || '' };
  if (/^(?:[0-9a-f]{2}[:-]?){4,10}$/i.test(value)) return { charId: '', variantId: '', uid: value };
  return null;
}

function readNfcPayload(message) {
  for (const record of message?.records || []) {
    if (!record.data) continue;
    try {
      const text = new TextDecoder(record.encoding || 'utf-8').decode(record.data);
      if (!text) continue;
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }
  return null;
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

function isCollectibleCard(card) {
  return !UNRELEASED_CARD_IDS.has(card?.id) && !['Pack / Set', 'Prototype / Unreleased', 'Villain Reference'].includes(card?.category);
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function toHex(value) {
  const text = String(value || '').trim();
  const number = /^0x/i.test(text) ? parseInt(text, 16) : parseInt(text, 10);
  if (!Number.isFinite(number)) return '0X0000';
  return `0X${number.toString(16).toUpperCase().padStart(4, '0')}`;
}

function normalizeScan(value) {
  return String(value || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
}

function makeCopyId() {
  return `copy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function gameOrder(game) {
  const order = ["Spyro's Adventure", 'Giants', 'SWAP Force', 'Trap Team', 'SuperChargers', 'Imaginators', 'Unknown'];
  const index = order.indexOf(game);
  return index < 0 ? order.length : index;
}

function elementColor(element) {
  return {
    Magic: '#8f65d8', Water: '#269ee8', Tech: '#e6a13a', Fire: '#ef573f', Air: '#79d8e7',
    Earth: '#a87a45', Undead: '#9b7bc8', Life: '#60bf58', Dark: '#6b5a9f', Light: '#f1d45d', Kaos: '#c553db', None: '#1787b9'
  }[element] || '#1787b9';
}

function emptyMarkup() {
  return '<div class="catalog-empty"><strong>No cards match those filters.</strong><p>Clear one or more filters and try again.</p></div>';
}

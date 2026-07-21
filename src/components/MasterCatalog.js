import { escapeHtml, normalizeText } from './helpers.js?v=animation-2';

const GAME_SHORT = {
  "Spyro's Adventure": 'SSA',
  Giants: 'Giants',
  'SWAP Force': 'SWAP',
  'Trap Team': 'Trap',
  SuperChargers: 'SC',
  Imaginators: 'Imaginators'
};

const CONDITION_OPTIONS = ['Not graded', 'New / sealed', 'Like new', 'Good', 'Played', 'Damaged', 'Parts / repair'];
const PACKAGING_OPTIONS = ['Loose', 'Carded / sealed', 'Boxed', 'Package only'];

export function createMasterCatalog(container, dialog, catalog, callbacks) {
  const cardsById = new Map(catalog.cards.map((card) => [card.id, card]));
  const state = {
    search: '',
    game: '',
    category: '',
    element: '',
    ownership: '',
    sort: 'name',
    limit: 72,
    activeCardId: '',
    status: 'Ready for a Portal or NFC reader.'
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
        notes: String(copy.notes || '')
      }))
    };
  }

  function saveRecord(cardId, record, toast) {
    callbacks.onSave(cardId, record);
    if (toast) callbacks.onToast(toast);
    render();
  }

  function renderShell() {
    const games = unique(catalog.cards.map((card) => card.game).filter((game) => game && game !== 'Unknown'));
    const categories = unique(catalog.cards.map((card) => card.category));
    const elements = unique(catalog.cards.map((card) => card.element).filter((element) => element && element !== 'None'));
    container.innerHTML = `
      <header class="catalog-hero">
        <div>
          <p class="eyebrow">Portal Master Database</p>
          <h2>${catalog.meta.totalCards} source-backed Master Vault cards</h2>
          <p>Individual toys, variants, Traps, vehicles, crystals, items, packs, Portals, villain references, and technical scan records are separated so retail pieces are never confused with internal game data.</p>
        </div>
        <div class="catalog-hero__numbers" aria-label="Master catalog totals">
          <span><strong>${catalog.meta.collectorItemPages}</strong> item pages checked</span>
          <span><strong>${catalog.meta.marketListings}</strong> market listings retained</span>
          <span><strong>${catalog.meta.linkedScanIdentities}</strong> exact scan links</span>
        </div>
      </header>

      <section class="scan-station" aria-labelledby="scan-station-title">
        <div class="scan-station__orb" aria-hidden="true"><i></i></div>
        <div class="scan-station__copy">
          <p class="eyebrow">Scanner intake</p>
          <h3 id="scan-station-title">Place a toy on your reader</h3>
          <p data-scan-status>${escapeHtml(state.status)}</p>
        </div>
        <form class="scan-station__form" data-scan-form>
          <label>
            <span>Reader result</span>
            <input data-scan-input autocomplete="off" placeholder="Character ID : Variant ID, or a saved UID">
          </label>
          <button class="button button--primary" type="submit">Identify</button>
        </form>
      </section>

      <section class="catalog-progress" data-catalog-progress></section>

      <section class="catalog-toolbar" aria-label="Master catalog filters">
        <label class="catalog-toolbar__search"><span>Search all cards</span><input data-catalog-search type="search" autocomplete="off" placeholder="Name, variant, item, ID, game…"></label>
        ${selectMarkup('Game', 'game', games)}
        ${selectMarkup('Type', 'category', categories)}
        ${selectMarkup('Element', 'element', elements)}
        ${selectMarkup('Collection', 'ownership', ['Owned', 'Missing', 'Wishlist', 'Scanned'])}
        ${selectMarkup('Sort', 'sort', ['Name', 'Game', 'Type', 'Owned first'])}
      </section>

      <div class="catalog-results-head">
        <p data-catalog-result-count></p>
        <button class="button" type="button" data-catalog-clear>Clear filters</button>
      </div>
      <div class="catalog-grid" data-catalog-grid></div>
      <button class="button catalog-load-more" type="button" data-catalog-more hidden>Show more cards</button>
      <footer class="catalog-sources">
        <p><strong>Accuracy policy:</strong> ${escapeHtml(catalog.meta.accuracyPolicy)} Market prices are dated snapshots, not permanent values. Community gameplay guides are labeled separately from manufacturer facts.</p>
        <details><summary>Data sources and credits</summary><ul>${catalog.meta.sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a> — ${escapeHtml(source.use)}</li>`).join('')}</ul></details>
      </footer>`;
  }

  function wireShell() {
    const search = container.querySelector('[data-catalog-search]');
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

    container.querySelector('[data-scan-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = container.querySelector('[data-scan-input]');
      identifyScan(input.value);
      input.select();
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
    const records = catalog.cards.map((card) => ({ card, record: getRecord(card.id) }));
    const ownedCards = records.filter(({ record }) => record.copies.length > 0).length;
    const ownedPieces = records.reduce((total, { record }) => total + record.copies.length, 0);
    const scannedPieces = records.reduce((total, { record }) => total + record.copies.filter((copy) => copy.uid).length, 0);
    const wishlist = records.filter(({ record }) => record.wishlist).length;
    container.querySelector('[data-catalog-progress]').innerHTML = `
      <article><span>Cards owned</span><strong>${ownedCards}<small> / ${catalog.meta.totalCards}</small></strong></article>
      <article><span>Physical pieces</span><strong>${ownedPieces}</strong></article>
      <article><span>Scanned copies</span><strong>${scannedPieces}</strong></article>
      <article><span>Wishlist</span><strong>${wishlist}</strong></article>`;

    const query = normalizeText(state.search);
    let filtered = records.filter(({ card, record }) => {
      const identityText = card.scanIdentities.map((identity) => `${identity.name} ${identity.charId} ${identity.variantId}`).join(' ');
      const sourcedFacts = Object.entries(card.scl?.allInfo || {}).map(([key, value]) => `${key} ${value}`).join(' ');
      const aliases = (card.scl?.aliases || []).join(' ');
      const haystack = normalizeText(`${card.name} ${card.canonicalName || ''} ${card.baseName} ${aliases} ${sourcedFacts} ${card.category} ${card.game} ${card.element} ${card.edition} ${card.role} ${identityText}`);
      if (query && !haystack.includes(query)) return false;
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
    filtered.sort(sorters[state.sort] || sorters.name);

    container.querySelector('[data-catalog-result-count]').textContent = `${filtered.length} cards found · showing ${Math.min(filtered.length, state.limit)}`;
    container.querySelector('[data-catalog-grid]').innerHTML = filtered.slice(0, state.limit).map(({ card, record }) => cardMarkup(card, record)).join('') || emptyMarkup();
    container.querySelector('[data-catalog-more]').hidden = state.limit >= filtered.length;
    container.querySelector('[data-scan-status]').textContent = state.status;
  }

  function cardMarkup(card, record) {
    const owned = record.copies.length;
    const scanned = record.copies.filter((copy) => copy.uid).length;
    const identity = card.scanIdentities[0];
    const compatibilityCount = Object.values(card.compatibility || {}).filter((value) => value === 'yes').length;
    const verification = verificationLabel(card.verification?.status);
    return `<article class="catalog-card" data-owned="${owned > 0}" style="--card-el:${elementColor(card.element)}">
      <button class="catalog-card__photo" type="button" data-card-action="details" data-card-id="${card.id}" aria-label="Open ${escapeHtml(card.name)} details">
        ${card.photoUrl ? `<img loading="lazy" src="${escapeHtml(card.photoUrl)}" alt="${escapeHtml(card.name)} physical piece" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ''}
        <span class="catalog-card__fallback" ${card.photoUrl ? 'hidden' : ''} aria-hidden="true">${escapeHtml(card.element === 'None' ? card.category.slice(0, 2).toUpperCase() : card.element.slice(0, 2).toUpperCase())}</span>
        ${owned ? `<i class="catalog-card__owned">Owned ×${owned}</i>` : ''}
      </button>
      <div class="catalog-card__body">
        <div class="catalog-card__kicker"><span>${escapeHtml(card.category)}</span><span>${escapeHtml(card.game || 'Reference')}</span></div>
        <h3>${escapeHtml(card.name)}</h3>
        <p>${escapeHtml([card.element !== 'None' ? card.element : '', card.scl?.series || card.role, card.edition && card.edition !== 'Standard' ? card.edition : ''].filter(Boolean).join(' · ') || 'Source-backed catalog record')}</p>
        <span class="catalog-verification" data-level="${escapeHtml(verification.level)}">${escapeHtml(verification.label)}</span>
        <div class="catalog-card__facts">
          <span title="Compatible games">${compatibilityCount ? `${compatibilityCount} game${compatibilityCount === 1 ? '' : 's'}` : 'Compatibility N/A'}</span>
          <span title="Scanner status">${identity ? `${identity.charId} / ${identity.variantId}` : 'No exact scan link'}</span>
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
    if (!card) return;
    const record = getRecord(cardId);
    record.copies.push({
      id: makeCopyId(),
      uid: String(seed.uid || ''),
      condition: 'Not graded',
      packaging: 'Loose',
      storage: '',
      acquired: '',
      paid: '',
      notes: ''
    });
    saveRecord(cardId, record, `${card.name} added to your vault`);
    open(cardId);
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
      record.copies.push({ id: makeCopyId(), uid: String(options.uid || ''), condition: 'Not graded', packaging: 'Loose', storage: '', acquired: '', paid: '', notes: '' });
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
          ${card.photoUrl ? `<img src="${escapeHtml(card.photoUrl)}" alt="${escapeHtml(card.name)} physical piece">` : '<span class="catalog-card__fallback">GV</span>'}
          ${card.artUrl ? `<img src="${escapeHtml(card.artUrl)}" alt="${escapeHtml(card.baseName)} character artwork">` : ''}
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
        <div data-copy-list>${copies.map(copyMarkup).join('') || '<p class="catalog-empty-copy">Add a copy now, or let the future scanner create one automatically when this piece is identified.</p>'}</div>
        <label class="field">Card notes<textarea data-record-notes rows="3" placeholder="Anything that applies to every copy of this release…">${escapeHtml(record.notes)}</textarea></label>
      </section>

      <footer class="catalog-detail__actions"><button class="button" type="button" data-catalog-close>Close</button><button class="button button--primary" type="submit">Save card</button></footer>
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
      updated.copies.push({ id: makeCopyId(), uid: '', condition: 'Not graded', packaging: 'Loose', storage: '', acquired: '', paid: '', notes: '' });
      saveRecord(card.id, updated);
      renderDialog(card);
      dialog.querySelector('[data-copy-list] article:last-child input')?.focus();
    });
    dialog.querySelectorAll('[data-remove-copy]').forEach((button) => {
      button.addEventListener('click', () => {
        const updated = readRecordFromDialog(record);
        updated.copies = updated.copies.filter((copy) => copy.id !== button.dataset.removeCopy);
        saveRecord(card.id, updated);
        renderDialog(card);
      });
    });
  }

  function readRecordFromDialog(fallback) {
    const copies = Array.from(dialog.querySelectorAll('[data-copy]')).map((article) => ({
      id: article.dataset.copy,
      uid: article.querySelector('[data-copy-uid]').value.trim(),
      condition: article.querySelector('[data-copy-condition]').value,
      packaging: article.querySelector('[data-copy-packaging]').value,
      storage: article.querySelector('[data-copy-storage]').value.trim(),
      acquired: article.querySelector('[data-copy-acquired]').value,
      paid: article.querySelector('[data-copy-paid]').value.trim(),
      notes: article.querySelector('[data-copy-notes]').value.trim()
    }));
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
    if (!card) {
      const technical = (catalog.scanCatalog || catalog.unmappedScanIdentities || []).find((identity) => `${identity.charId}:${identity.variantId}` === key);
      const labels = { 'technical-only': 'internal/debug or unreleased game-data record', 'in-game/digital': 'digital or in-game identity', documented: 'documented ID without a confirmed retail-card link' };
      state.status = technical ? `${technical.name} recognized as a ${labels[technical.releaseStatus] || technical.releaseStatus || 'technical record'}. ${technical.statusNote || ''}` : `No documented identity for ${key}.`;
      callbacks.onToast(state.status);
      render();
      return technical || null;
    }
    state.status = `${card.name} identified${parsed.uid ? ` · UID ${parsed.uid}` : ''}.`;
    render();
    const record = getRecord(card.id);
    const uidExists = parsed.uid && record.copies.some((copy) => normalizeScan(copy.uid) === normalizeScan(parsed.uid));
    if (parsed.uid && !uidExists) quickAdd(card.id, { uid: parsed.uid });
    else open(card.id);
    callbacks.onToast(`${card.name} discovered`);
    return card;
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
    state.activeCardId = '';
  }

  return { render, open, identifyScan, meta: catalog.meta };
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
  return `<article class="catalog-copy" data-copy="${escapeHtml(copy.id)}">
    <header><strong>Copy ${index + 1}</strong><button class="button button--danger" type="button" data-remove-copy="${escapeHtml(copy.id)}">Remove</button></header>
    <div class="catalog-copy__grid">
      <label><span>Scan UID</span><input data-copy-uid value="${escapeHtml(copy.uid)}" placeholder="Filled by reader or paste manually"></label>
      <label><span>Condition</span><select data-copy-condition>${optionsMarkup(CONDITION_OPTIONS, copy.condition)}</select></label>
      <label><span>Packaging</span><select data-copy-packaging>${optionsMarkup(PACKAGING_OPTIONS, copy.packaging)}</select></label>
      <label><span>Storage location</span><input data-copy-storage value="${escapeHtml(copy.storage)}" placeholder="Shelf, bin, display…"></label>
      <label><span>Acquired</span><input data-copy-acquired type="date" value="${escapeHtml(copy.acquired)}"></label>
      <label><span>Price paid</span><input data-copy-paid inputmode="decimal" value="${escapeHtml(copy.paid)}" placeholder="$0.00"></label>
    </div>
    <label><span>Copy notes</span><textarea data-copy-notes rows="2" placeholder="Paint, damage, tag behavior, seller…">${escapeHtml(copy.notes)}</textarea></label>
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

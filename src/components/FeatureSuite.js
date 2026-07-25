import { escapeHtml, normalizeText } from './helpers.js?v=vault-v2';

const GAMES = ["Spyro's Adventure", 'Giants', 'SWAP Force', 'Trap Team', 'SuperChargers', 'Imaginators'];
const EXCLUDED_CATEGORIES = new Set(['Pack / Set', 'Prototype / Unreleased', 'Villain Reference']);
const UNRELEASED_IDS = new Set([
  'catalog-11513604',
  'catalog-11513621',
  'catalog-11513645',
  'catalog-11513653',
  'catalog-11513673',
  'catalog-58496'
]);

export function createFeatureSuite(container, catalog, callbacks) {
  const cards = catalog.cards.filter((card) => !UNRELEASED_IDS.has(card.id) && !EXCLUDED_CATEGORIES.has(card.category));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const photoDescriptorCache = new Map();
  const ui = {
    tab: 'overview',
    marketCardId: cards.slice().sort((a, b) => marketNumber(b.market?.loose) - marketNumber(a.market?.loose))[0]?.id || '',
    marketQuery: '',
    photoPreview: '',
    photoStatus: 'Choose a photo to create a private, on-device visual shortlist.',
    photoMatches: [],
    photoBusy: false,
    tvIndex: 0,
    tvPlaying: true,
    tvTimer: 0
  };

  renderShell();
  wire();
  render();

  function getState() {
    return callbacks.getState();
  }

  function getRecord(cardId) {
    return getState().catalog?.[cardId] || { copies: [], wishlist: false, notes: '' };
  }

  function metrics() {
    const records = cards.map((card) => ({ card, record: getRecord(card.id) }));
    const owned = records.filter(({ record }) => record.copies?.length);
    const pieces = owned.reduce((sum, { record }) => sum + record.copies.length, 0);
    const scanned = owned.reduce((sum, { record }) => sum + record.copies.filter((copy) => copy.uid).length, 0);
    const wishlist = records.filter(({ record }) => record.wishlist).length;
    const value = owned.reduce((sum, { card, record }) => sum + marketNumber(card.market?.loose) * record.copies.length, 0);
    const elements = new Set(owned.map(({ card }) => card.element).filter((element) => element && element !== 'None'));
    return { records, owned, ownedCount: owned.length, pieces, scanned, wishlist, value, elements };
  }

  function renderShell() {
    container.innerHTML = `
      <section class="tools-shell">
        <header class="tools-hero">
          <div>
            <p class="eyebrow">Master checklist · clean build</p>
            <h2>The complete collector toolkit.</h2>
            <p>Every requested workflow lives here without carrying over old uploads, scans, backups, or collection history.</p>
          </div>
          <button class="button button--primary" type="button" data-tools-tv>Start TV showcase</button>
        </header>
        <nav class="tools-tabs" aria-label="Vault tools">
          ${toolTab('overview', 'Overview')}
          ${toolTab('market', 'Market + eBay')}
          ${toolTab('identify', 'Photo ID')}
          ${toolTab('swap', 'SWAP Lab')}
          ${toolTab('checklist', 'Print checklist')}
          ${toolTab('activity', 'Activity')}
        </nav>
        <div class="tools-panel" data-tools-panel></div>
      </section>
      <section class="tv-showcase" data-tv-showcase hidden aria-label="TV showcase">
        <div class="tv-showcase__stage" data-tv-stage></div>
        <div class="tv-showcase__controls">
          <button type="button" data-tv-close>Close</button>
          <button type="button" data-tv-prev>Previous</button>
          <button type="button" data-tv-play>Pause</button>
          <button type="button" data-tv-next>Next</button>
          <button type="button" data-tv-fullscreen>Fullscreen</button>
        </div>
      </section>
      <section class="print-sheet" data-print-sheet aria-hidden="true"></section>`;
  }

  function toolTab(id, label) {
    return `<button type="button" data-tools-tab="${id}" aria-pressed="${id === ui.tab}">${label}</button>`;
  }

  function wire() {
    container.addEventListener('click', async (event) => {
      const tab = event.target.closest('[data-tools-tab]');
      if (tab) {
        ui.tab = tab.dataset.toolsTab;
        render();
        return;
      }

      if (event.target.closest('[data-tools-tv]')) {
        startTv();
        return;
      }
      if (event.target.closest('[data-tv-close]')) {
        closeTv();
        return;
      }
      if (event.target.closest('[data-tv-prev]')) {
        moveTv(-1);
        return;
      }
      if (event.target.closest('[data-tv-next]')) {
        moveTv(1);
        return;
      }
      if (event.target.closest('[data-tv-play]')) {
        ui.tvPlaying = !ui.tvPlaying;
        syncTvTimer();
        renderTv();
        return;
      }
      if (event.target.closest('[data-tv-fullscreen]')) {
        const showcase = container.querySelector('[data-tv-showcase]');
        if (showcase?.requestFullscreen) {
          try { await showcase.requestFullscreen(); } catch {}
        }
        return;
      }

      const marketResult = event.target.closest('[data-market-result]');
      if (marketResult) {
        ui.marketCardId = marketResult.dataset.marketResult;
        ui.marketQuery = cardsById.get(ui.marketCardId)?.name || '';
        render();
        return;
      }
      if (event.target.closest('[data-market-copy-title]')) {
        const title = container.querySelector('[data-market-title]')?.textContent || '';
        try {
          await navigator.clipboard.writeText(title);
          callbacks.onToast('eBay title copied');
        } catch {
          callbacks.onToast('Select the title and copy it manually.');
        }
        return;
      }
      if (event.target.closest('[data-market-copy-description]')) {
        const description = container.querySelector('[data-market-description]')?.textContent || '';
        try {
          await navigator.clipboard.writeText(description);
          callbacks.onToast('Listing description copied');
        } catch {
          callbacks.onToast('Select the description and copy it manually.');
        }
        return;
      }

      const photoMatch = event.target.closest('[data-photo-match]');
      if (photoMatch) {
        callbacks.openCard(photoMatch.dataset.photoMatch);
        return;
      }

      if (event.target.closest('[data-swap-save]')) {
        saveAssembly();
        return;
      }
      const removeAssembly = event.target.closest('[data-swap-remove]');
      if (removeAssembly) {
        const state = getState();
        state.assemblies = (state.assemblies || []).filter((item) => item.id !== removeAssembly.dataset.swapRemove);
        callbacks.commit('assembly', 'SWAP assembly removed');
        render();
        return;
      }

      if (event.target.closest('[data-print-checklist]')) {
        printChecklist();
        return;
      }
      if (event.target.closest('[data-download-missing]')) {
        downloadMissingCsv();
        return;
      }
    });

    container.addEventListener('input', (event) => {
      if (event.target.matches('[data-market-search]')) {
        ui.marketQuery = event.target.value;
        renderMarketResults();
      }
      if (event.target.matches('[data-market-input]')) {
        updateMarketMath();
      }
    });

    container.addEventListener('change', async (event) => {
      if (event.target.matches('[data-photo-id-input]')) {
        const file = event.target.files?.[0];
        if (file) await identifyPhoto(file);
      }
    });

    window.addEventListener('keydown', (event) => {
      const showcase = container.querySelector('[data-tv-showcase]');
      if (!showcase || showcase.hidden) return;
      if (event.key === 'Escape') closeTv();
      if (event.key === 'ArrowLeft') moveTv(-1);
      if (event.key === 'ArrowRight') moveTv(1);
      if (event.key === ' ') {
        event.preventDefault();
        ui.tvPlaying = !ui.tvPlaying;
        syncTvTimer();
        renderTv();
      }
    });
  }

  function render() {
    container.querySelectorAll('[data-tools-tab]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.toolsTab === ui.tab));
    });
    const panel = container.querySelector('[data-tools-panel]');
    if (ui.tab === 'overview') panel.innerHTML = overviewMarkup();
    if (ui.tab === 'market') panel.innerHTML = marketMarkup();
    if (ui.tab === 'identify') panel.innerHTML = identifyMarkup();
    if (ui.tab === 'swap') panel.innerHTML = swapMarkup();
    if (ui.tab === 'checklist') panel.innerHTML = checklistMarkup();
    if (ui.tab === 'activity') panel.innerHTML = activityMarkup();
    if (ui.tab === 'market') updateMarketMath();
  }

  function overviewMarkup() {
    const data = metrics();
    const achievements = achievementData(data);
    const unlocked = achievements.filter((item) => item.unlocked).length;
    return `
      <section class="tools-overview">
        <div class="tools-stat-grid">
          ${toolStat(data.ownedCount, `${cards.length} cards`, 'Collection')}
          ${toolStat(data.pieces, 'physical pieces', 'Inventory')}
          ${toolStat(money(data.value), 'snapshot estimate', 'Value')}
          ${toolStat(`${unlocked}/${achievements.length}`, 'unlocked', 'Achievements')}
        </div>
        <div class="tools-two-column">
          <section class="feature-card">
            <header><div><p class="eyebrow">Master checklist</p><h3>Feature status</h3></div><span class="status-ready">Ready</span></header>
            <div class="master-feature-list">
              ${featureRow('Museum + profiles', 'Complete 640-card visual catalog, filters, compatibility, sources, and full profiles.')}
              ${featureRow('Physical copies + photos', 'Condition, packaging, storage, cost, notes, and optional future photo sync.')}
              ${featureRow('Live market workflow', 'Dated price snapshots plus one-click current sold comps and eBay evaluation.')}
              ${featureRow('Photo identification', 'Private on-device visual matching against the clean product-photo library.')}
              ${featureRow('Achievements + timeline', 'Collection milestones and a local audit trail.')}
              ${featureRow('Printable checklists', 'Complete six-game print layout and missing-item CSV.')}
              ${featureRow('TV showcase', 'Full-screen slideshow built from generated card artwork.')}
              ${featureRow('Gated NFC editing', 'Session-only safety gate for blank or personally owned NDEF tags.')}
            </div>
          </section>
          <section class="feature-card">
            <header><div><p class="eyebrow">Achievements</p><h3>${unlocked} unlocked</h3></div><span>${Math.round(unlocked / achievements.length * 100)}%</span></header>
            <div class="achievement-grid">
              ${achievements.map((item) => `<article data-unlocked="${item.unlocked}"><i>${item.icon}</i><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.detail)}</span></div></article>`).join('')}
            </div>
          </section>
        </div>
      </section>`;
  }

  function toolStat(value, detail, label) {
    return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(detail)}</small></article>`;
  }

  function featureRow(name, detail) {
    return `<article><i aria-hidden="true">✓</i><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(detail)}</span></div></article>`;
  }

  function achievementData(data) {
    const completeGames = GAMES.filter((game) => {
      const gameCards = cards.filter((card) => card.game === game);
      return gameCards.length && gameCards.every((card) => getRecord(card.id).copies?.length);
    });
    return [
      { name: 'First arrival', detail: 'Add your first physical piece.', icon: '01', unlocked: data.pieces >= 1 },
      { name: 'Shelf builder', detail: 'Collect 25 different cards.', icon: '25', unlocked: data.ownedCount >= 25 },
      { name: 'Vault keeper', detail: 'Collect 100 different cards.', icon: '100', unlocked: data.ownedCount >= 100 },
      { name: 'Master collector', detail: 'Collect 500 different cards.', icon: '500', unlocked: data.ownedCount >= 500 },
      { name: 'Elementalist', detail: 'Own a piece from every element.', icon: 'EL', unlocked: data.elements.size >= 10 },
      { name: 'Portal verified', detail: 'Save one scanned UID.', icon: 'NFC', unlocked: data.scanned >= 1 },
      { name: 'Wish maker', detail: 'Build a ten-item wishlist.', icon: '★', unlocked: data.wishlist >= 10 },
      { name: 'Era complete', detail: completeGames.length ? `${completeGames.join(', ')} complete.` : 'Complete any full game line.', icon: '06', unlocked: completeGames.length > 0 }
    ];
  }

  function marketMarkup() {
    const card = cardsById.get(ui.marketCardId) || cards[0];
    const record = getRecord(card.id);
    const price = marketNumber(card.market?.loose);
    const title = listingTitle(card);
    const description = listingDescription(card, record);
    const liveUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(card.name + ' Skylanders')}&LH_Sold=1&LH_Complete=1`;
    return `
      <section class="market-lab">
        <header class="tool-section-head"><div><p class="eyebrow">Live comparison workflow</p><h3>Market + eBay evaluator</h3><p>Use the dated catalog snapshot as a baseline, then open current sold listings before pricing.</p></div></header>
        <label class="tool-search"><span>Find an item</span><input data-market-search value="${escapeHtml(ui.marketQuery)}" placeholder="Search the 640-card catalog" autocomplete="off"><div class="market-results" data-market-results></div></label>
        <div class="market-workbench">
          <article class="market-selected" style="--card-el:${elementColor(card.element)}">
            <img src="assets/card-art/thumbs/${encodeURIComponent(card.id)}.webp" alt="${escapeHtml(card.name)} generated card">
            <div><p>${escapeHtml(card.game || card.category)}</p><h4>${escapeHtml(card.name)}</h4><span>${escapeHtml(card.element)} · ${escapeHtml(card.category)}</span></div>
          </article>
          <section class="market-prices">
            ${priceCell('Loose', card.market?.loose || '—')}
            ${priceCell('Complete', card.market?.cib || '—')}
            ${priceCell('New', card.market?.new || '—')}
            ${priceCell('Snapshot', card.marketAsOf || 'Unknown')}
          </section>
          <section class="market-calculator">
            <label><span>Listing price</span><input data-market-input data-market-price type="number" min="0" step=".01" value="${price.toFixed(2)}"></label>
            <label><span>Your cost</span><input data-market-input data-market-cost type="number" min="0" step=".01" value="${marketNumber(record.copies?.[0]?.paid).toFixed(2)}"></label>
            <label><span>Platform fee %</span><input data-market-input data-market-fee type="number" min="0" max="40" step=".1" value="13.25"></label>
            <label><span>Shipping cost</span><input data-market-input data-market-shipping type="number" min="0" step=".01" value="5.00"></label>
            <div class="market-net"><span>Estimated net</span><strong data-market-net>$0.00</strong><small data-market-profit>Profit $0.00</small></div>
          </section>
          <section class="listing-draft">
            <div><span>Suggested title</span><strong data-market-title>${escapeHtml(title)}</strong><button type="button" data-market-copy-title>Copy</button></div>
            <div><span>Description starter</span><p data-market-description>${escapeHtml(description)}</p><button type="button" data-market-copy-description>Copy</button></div>
            <nav><a class="button button--primary" href="${liveUrl}" target="_blank" rel="noreferrer">Open live sold comps</a>${card.sourceUrl ? `<a class="button" href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noreferrer">Open price source</a>` : ''}</nav>
          </section>
        </div>
      </section>`;
  }

  function priceCell(label, value) {
    return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`;
  }

  function renderMarketResults() {
    const host = container.querySelector('[data-market-results]');
    if (!host) return;
    const query = normalizeText(ui.marketQuery);
    if (!query || query === normalizeText(cardsById.get(ui.marketCardId)?.name)) {
      host.innerHTML = '';
      return;
    }
    const matches = cards.filter((card) => normalizeText(`${card.name} ${card.game} ${card.element} ${card.category}`).includes(query)).slice(0, 8);
    host.innerHTML = matches.length
      ? matches.map((card) => `<button type="button" data-market-result="${card.id}"><span>${escapeHtml(card.name)}</span><small>${escapeHtml(card.game || card.category)} · ${escapeHtml(card.market?.loose || 'No price')}</small></button>`).join('')
      : '<span class="tool-empty">No catalog match.</span>';
  }

  function updateMarketMath() {
    const price = Number(container.querySelector('[data-market-price]')?.value || 0);
    const cost = Number(container.querySelector('[data-market-cost]')?.value || 0);
    const fee = Number(container.querySelector('[data-market-fee]')?.value || 0) / 100;
    const shipping = Number(container.querySelector('[data-market-shipping]')?.value || 0);
    const net = Math.max(0, price - price * fee - shipping);
    const profit = net - cost;
    const netNode = container.querySelector('[data-market-net]');
    const profitNode = container.querySelector('[data-market-profit]');
    if (netNode) netNode.textContent = money(net);
    if (profitNode) {
      profitNode.textContent = `${profit >= 0 ? 'Profit' : 'Loss'} ${money(Math.abs(profit))}`;
      profitNode.dataset.positive = String(profit >= 0);
    }
  }

  function listingTitle(card) {
    const pieces = [card.name, card.game, card.element !== 'None' ? card.element : '', card.category, 'Authentic'];
    return pieces.filter(Boolean).join(' · ').slice(0, 80);
  }

  function listingDescription(card, record) {
    const copy = record.copies?.[0];
    const condition = copy?.condition || 'Condition not yet graded';
    const packaging = copy?.packaging || 'Loose';
    return `${card.name} from ${card.game || 'the Skylanders collection'}. ${condition}; ${packaging}. See photos for exact cosmetic condition. NFC functionality should be verified by the seller before listing.`;
  }

  function identifyMarkup() {
    return `
      <section class="photo-lab">
        <header class="tool-section-head"><div><p class="eyebrow">Private visual matching</p><h3>Photo identification</h3><p>The selected photo stays in this browser. It is compared locally with the clean 763-photo reference library and is never uploaded.</p></div></header>
        <div class="photo-id-workbench">
          <label class="photo-drop">
            <input data-photo-id-input type="file" accept="image/jpeg,image/png,image/webp" ${ui.photoBusy ? 'disabled' : ''}>
            ${ui.photoPreview ? `<img src="${escapeHtml(ui.photoPreview)}" alt="Photo selected for local identification">` : '<span aria-hidden="true">+</span>'}
            <strong>${ui.photoBusy ? 'Comparing reference photos…' : 'Choose a clear figure photo'}</strong>
            <small>Best results: one figure, plain background, full base visible.</small>
          </label>
          <section class="photo-results">
            <p data-photo-status>${escapeHtml(ui.photoStatus)}</p>
            <div>
              ${ui.photoMatches.length ? ui.photoMatches.map((match, index) => `
                <button type="button" data-photo-match="${match.card.id}" style="--card-el:${elementColor(match.card.element)}">
                  <img src="${escapeHtml(match.card.photoUrl)}" alt="">
                  <span><b>#${index + 1} · ${escapeHtml(match.card.name)}</b><small>${escapeHtml(match.card.game || match.card.category)} · ${escapeHtml(match.card.element)}</small></span>
                  <strong>${match.confidence}%</strong>
                </button>`).join('') : '<div class="tool-empty">Your top matches will appear here.</div>'}
            </div>
          </section>
        </div>
      </section>`;
  }

  async function identifyPhoto(file) {
    if (!file.type.startsWith('image/')) {
      callbacks.onToast('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (ui.photoPreview) URL.revokeObjectURL(ui.photoPreview);
    ui.photoPreview = URL.createObjectURL(file);
    ui.photoBusy = true;
    ui.photoMatches = [];
    ui.photoStatus = 'Reading the photo on this device…';
    render();
    try {
      const target = await descriptorFromFile(file);
      const scored = [];
      const candidates = cards.filter((card) => card.photoUrl);
      for (let index = 0; index < candidates.length; index += 12) {
        const batch = candidates.slice(index, index + 12);
        const descriptors = await Promise.all(batch.map((card) => descriptorForCard(card)));
        descriptors.forEach((descriptor, offset) => {
          if (!descriptor) return;
          const score = descriptorDistance(target, descriptor);
          scored.push({ card: batch[offset], score });
        });
        if (index % 72 === 0) {
          ui.photoStatus = `Compared ${Math.min(index + 12, candidates.length)} of ${candidates.length} clean reference photos…`;
          const status = container.querySelector('[data-photo-status]');
          if (status) status.textContent = ui.photoStatus;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      scored.sort((a, b) => a.score - b.score);
      ui.photoMatches = scored.slice(0, 8).map((match) => ({
        ...match,
        confidence: Math.max(1, Math.min(99, Math.round(100 - match.score * 92)))
      }));
      ui.photoStatus = 'Visual shortlist complete. Confirm the name, variant, and base before saving.';
    } catch (error) {
      ui.photoStatus = error.message || 'This photo could not be read.';
    } finally {
      ui.photoBusy = false;
      render();
    }
  }

  async function descriptorFromFile(file) {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file);
      try { return imageDescriptor(bitmap); } finally { bitmap.close?.(); }
    }
    const url = URL.createObjectURL(file);
    try { return imageDescriptor(await loadImage(url)); } finally { URL.revokeObjectURL(url); }
  }

  async function descriptorForCard(card) {
    if (photoDescriptorCache.has(card.id)) return photoDescriptorCache.get(card.id);
    try {
      const descriptor = imageDescriptor(await loadImage(card.photoUrl));
      photoDescriptorCache.set(card.id, descriptor);
      return descriptor;
    } catch {
      photoDescriptorCache.set(card.id, null);
      return null;
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Reference image unavailable'));
      image.src = url;
    });
  }

  function imageDescriptor(image) {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 24, 24);
    context.drawImage(image, 0, 0, 24, 24);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    const sums = [0, 0, 0, 0, 0, 0];
    const histogram = new Array(12).fill(0);
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 24) continue;
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;
      sums[0] += r; sums[1] += g; sums[2] += b;
      sums[3] += r * r; sums[4] += g * g; sums[5] += b * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      let hue = 0;
      if (delta) {
        if (max === r) hue = ((g - b) / delta + 6) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
      }
      histogram[Math.min(11, Math.floor(hue / 6 * 12))] += Math.max(0.15, delta);
      count += 1;
    }
    const descriptor = sums.map((value) => value / Math.max(1, count));
    const histogramTotal = histogram.reduce((sum, value) => sum + value, 0) || 1;
    return descriptor.concat(histogram.map((value) => value / histogramTotal));
  }

  function descriptorDistance(left, right) {
    let sum = 0;
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      const weight = index < 6 ? 1.3 : 0.72;
      sum += (left[index] - right[index]) ** 2 * weight;
    }
    return Math.sqrt(sum);
  }

  function swapMarkup() {
    const state = getState();
    const swappers = cards.filter((card) => card.role === 'SWAP Force' || card.scl?.series === 'SWAP Force');
    const ownedSwappers = swappers.filter((card) => getRecord(card.id).copies?.length);
    const choices = ownedSwappers.length ? ownedSwappers : swappers;
    const assemblies = state.assemblies || [];
    return `
      <section class="swap-lab">
        <header class="tool-section-head"><div><p class="eyebrow">Relationship-only assembly manager</p><h3>SWAP Laboratory</h3><p>Build combinations without changing either source figure, its saved UID, photos, or collection history.</p></div></header>
        <div class="swap-builder">
          <label><span>Top half source</span><select data-swap-top>${swapOptions(choices)}</select></label>
          <div class="swap-join" aria-hidden="true">+</div>
          <label><span>Bottom half source</span><select data-swap-bottom>${swapOptions(choices, 1)}</select></label>
          <button class="button button--primary" type="button" data-swap-save ${choices.length < 2 ? 'disabled' : ''}>Save assembly</button>
        </div>
        ${ownedSwappers.length ? '' : '<p class="tool-note">Planning mode is active because no SWAP figures are marked owned yet.</p>'}
        <div class="assembly-list">
          ${assemblies.length ? assemblies.map((assembly) => assemblyMarkup(assembly)).join('') : '<div class="tool-empty">No saved combinations yet.</div>'}
        </div>
      </section>`;
  }

  function swapOptions(cardsToUse, selectedIndex = 0) {
    return cardsToUse.map((card, index) => `<option value="${card.id}" ${index === selectedIndex ? 'selected' : ''}>${escapeHtml(card.name)}</option>`).join('');
  }

  function saveAssembly() {
    const topCardId = container.querySelector('[data-swap-top]')?.value;
    const bottomCardId = container.querySelector('[data-swap-bottom]')?.value;
    const top = cardsById.get(topCardId);
    const bottom = cardsById.get(bottomCardId);
    if (!top || !bottom) return;
    const topName = swapParts(top.name).top;
    const bottomName = swapParts(bottom.name).bottom;
    const assembly = {
      id: `swap-${Date.now().toString(36)}`,
      topCardId,
      bottomCardId,
      name: `${topName} ${bottomName}`,
      createdAt: new Date().toISOString()
    };
    const state = getState();
    state.assemblies = [assembly, ...(state.assemblies || [])].slice(0, 200);
    callbacks.commit('assembly', `${assembly.name} assembled`);
    callbacks.onToast(`${assembly.name} saved`);
    render();
  }

  function swapParts(name) {
    const clean = String(name).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    const words = clean.split(/\s+/);
    return { top: words[0] || clean, bottom: words.slice(1).join(' ') || words[0] || clean };
  }

  function assemblyMarkup(assembly) {
    const top = cardsById.get(assembly.topCardId);
    const bottom = cardsById.get(assembly.bottomCardId);
    if (!top || !bottom) return '';
    return `<article>
      <div class="assembly-art"><img src="assets/card-art/thumbs/${encodeURIComponent(top.id)}.webp" alt=""><img src="assets/card-art/thumbs/${encodeURIComponent(bottom.id)}.webp" alt=""></div>
      <div><span>Saved combination</span><strong>${escapeHtml(assembly.name)}</strong><small>${escapeHtml(top.name)} top · ${escapeHtml(bottom.name)} bottom</small></div>
      <button type="button" data-swap-remove="${escapeHtml(assembly.id)}" aria-label="Remove ${escapeHtml(assembly.name)}">Remove</button>
    </article>`;
  }

  function checklistMarkup() {
    const data = metrics();
    const gameRows = GAMES.map((game) => {
      const gameCards = cards.filter((card) => card.game === game);
      const owned = gameCards.filter((card) => getRecord(card.id).copies?.length).length;
      return `<article><span>${escapeHtml(game)}</span><strong>${owned} / ${gameCards.length}</strong><i style="--progress:${gameCards.length ? Math.round(owned / gameCards.length * 100) : 0}%"><b></b></i></article>`;
    }).join('');
    return `
      <section class="checklist-tool">
        <header class="tool-section-head"><div><p class="eyebrow">Complete 640-card tracker</p><h3>Printable checklists</h3><p>Print a clean six-game checklist or download only the pieces still missing from your collection.</p></div></header>
        <div class="checklist-summary">
          <div><strong>${data.ownedCount}</strong><span>owned</span></div>
          <div><strong>${cards.length - data.ownedCount}</strong><span>missing</span></div>
          <div><strong>${data.wishlist}</strong><span>wishlist</span></div>
        </div>
        <div class="checklist-games">${gameRows}</div>
        <div class="checklist-actions"><button class="button button--primary" type="button" data-print-checklist>Print complete checklist</button><button class="button" type="button" data-download-missing>Download missing CSV</button></div>
      </section>`;
  }

  function printChecklist() {
    const host = container.querySelector('[data-print-sheet]');
    const grouped = GAMES.map((game) => {
      const gameCards = cards.filter((card) => card.game === game);
      return `<section><h2>${escapeHtml(game)}</h2><ul>${gameCards.map((card) => {
        const owned = Boolean(getRecord(card.id).copies?.length);
        return `<li data-owned="${owned}"><i>${owned ? '✓' : ''}</i><span>${escapeHtml(card.name)}</span><small>${escapeHtml(card.element)} · ${escapeHtml(card.category)}</small></li>`;
      }).join('')}</ul></section>`;
    }).join('');
    host.innerHTML = `<header><p>Skylanders Vault</p><h1>Complete collection checklist</h1><span>Generated ${new Date().toLocaleDateString()}</span></header>${grouped}`;
    host.setAttribute('aria-hidden', 'false');
    document.body.classList.add('printing-checklist');
    const cleanup = () => {
      document.body.classList.remove('printing-checklist');
      host.setAttribute('aria-hidden', 'true');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => window.print(), 60);
  }

  function downloadMissingCsv() {
    const missing = cards.filter((card) => !getRecord(card.id).copies?.length);
    const lines = [
      ['Name', 'Game', 'Element', 'Category', 'Loose snapshot', 'Wishlist'],
      ...missing.map((card) => [card.name, card.game, card.element, card.category, card.market?.loose || '', getRecord(card.id).wishlist ? 'Yes' : 'No'])
    ];
    const csv = lines.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'skylanders-vault-missing-checklist.csv';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function activityMarkup() {
    const timeline = (getState().timeline || []).slice().reverse();
    return `
      <section class="activity-tool">
        <header class="tool-section-head"><div><p class="eyebrow">Local collection history</p><h3>Activity timeline</h3><p>New collection changes are recorded from this clean build onward.</p></div></header>
        <div class="activity-list">
          ${timeline.length ? timeline.map((event) => `<article><i></i><div><strong>${escapeHtml(event.label)}</strong><span>${escapeHtml(event.type.replaceAll('_', ' '))}</span></div><time datetime="${escapeHtml(event.at)}">${escapeHtml(formatDate(event.at))}</time></article>`).join('') : '<div class="tool-empty">No activity yet. Add a card, create a SWAP assembly, or update a copy to begin.</div>'}
        </div>
      </section>`;
  }

  function startTv() {
    const showcase = container.querySelector('[data-tv-showcase]');
    if (!showcase) return;
    ui.tvIndex = 0;
    ui.tvPlaying = true;
    showcase.hidden = false;
    document.body.classList.add('tv-mode-active');
    renderTv();
    syncTvTimer();
  }

  function closeTv() {
    const showcase = container.querySelector('[data-tv-showcase]');
    if (showcase) showcase.hidden = true;
    document.body.classList.remove('tv-mode-active');
    window.clearInterval(ui.tvTimer);
    ui.tvTimer = 0;
    if (document.fullscreenElement) document.exitFullscreen?.();
  }

  function tvCards() {
    const owned = cards.filter((card) => getRecord(card.id).copies?.length);
    return owned.length ? owned : cards;
  }

  function moveTv(delta) {
    const list = tvCards();
    ui.tvIndex = (ui.tvIndex + delta + list.length) % list.length;
    renderTv();
  }

  function syncTvTimer() {
    window.clearInterval(ui.tvTimer);
    ui.tvTimer = 0;
    if (ui.tvPlaying) ui.tvTimer = window.setInterval(() => moveTv(1), 6500);
  }

  function renderTv() {
    const list = tvCards();
    const card = list[ui.tvIndex % list.length];
    const record = getRecord(card.id);
    const stage = container.querySelector('[data-tv-stage]');
    const showcase = container.querySelector('[data-tv-showcase]');
    const play = container.querySelector('[data-tv-play]');
    if (!stage || !card) return;
    const accent = elementColor(card.element);
    stage.style.setProperty('--tv-accent', accent);
    showcase?.style.setProperty('--tv-accent', accent);
    stage.innerHTML = `
      <div class="tv-showcase__art"><img src="assets/card-art/cards/${encodeURIComponent(card.id)}.webp" alt="${escapeHtml(card.name)} generated collector card"></div>
      <div class="tv-showcase__copy">
        <p>${escapeHtml(card.game || 'Vault archive')} · ${escapeHtml(card.category)}</p>
        <h2>${escapeHtml(card.name)}</h2>
        <span>${escapeHtml(card.element)}${card.role ? ` · ${escapeHtml(card.role)}` : ''}</span>
        <div><strong>${record.copies?.length || 0}</strong><small>${record.copies?.length === 1 ? 'copy owned' : 'copies owned'}</small></div>
        <footer>${ui.tvIndex + 1} / ${list.length} · ${getState().catalog && Object.keys(getState().catalog).length ? 'Owned collection' : 'Complete vault preview'}</footer>
      </div>`;
    if (play) play.textContent = ui.tvPlaying ? 'Pause' : 'Play';
  }

  function renderExternalChange() {
    if (ui.tab === 'overview' || ui.tab === 'checklist' || ui.tab === 'activity' || ui.tab === 'swap') render();
  }

  function csvCell(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  return { render: renderExternalChange, open: (tab = 'overview') => { ui.tab = tab; render(); } };
}

function marketNumber(value) {
  const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function elementColor(element) {
  return {
    Magic: '#9b63c7', Water: '#a76b83', Tech: '#d29a3d', Fire: '#db573d', Air: '#d7bd74',
    Earth: '#a36b3f', Undead: '#8e697d', Life: '#6f9e58', Dark: '#67405f', Light: '#e6c967', Kaos: '#bd4e87', None: '#9e7652'
  }[element] || '#9e7652';
}

import { escapeHtml, normalizeText } from "./helpers.js?v=vault-v2";
const GAMES = ["Spyro's Adventure", "Giants", "SWAP Force", "Trap Team", "SuperChargers", "Imaginators"];
const EXCLUDED_CATEGORIES = /* @__PURE__ */ new Set(["Pack / Set", "Prototype / Unreleased", "Villain Reference"]);
const UNRELEASED_IDS = /* @__PURE__ */ new Set([
  "catalog-11513604",
  "catalog-11513621",
  "catalog-11513645",
  "catalog-11513653",
  "catalog-11513673",
  "catalog-58496"
]);
function createFeatureSuite(container, catalog, callbacks) {
  var _a;
  const cards = catalog.cards.filter((card) => !UNRELEASED_IDS.has(card.id) && !EXCLUDED_CATEGORIES.has(card.category));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const photoDescriptorCache = /* @__PURE__ */ new Map();
  const ui = {
    tab: "overview",
    marketCardId: ((_a = cards.slice().sort((a, b) => {
      var _a2, _b;
      return marketNumber((_a2 = b.market) == null ? void 0 : _a2.loose) - marketNumber((_b = a.market) == null ? void 0 : _b.loose);
    })[0]) == null ? void 0 : _a.id) || "",
    marketQuery: "",
    photoPreview: "",
    photoStatus: "Choose a photo to create a private, on-device visual shortlist.",
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
    var _a2;
    return ((_a2 = getState().catalog) == null ? void 0 : _a2[cardId]) || { copies: [], wishlist: false, notes: "" };
  }
  function metrics() {
    const records = cards.map((card) => ({ card, record: getRecord(card.id) }));
    const owned = records.filter(({ record }) => {
      var _a2;
      return (_a2 = record.copies) == null ? void 0 : _a2.length;
    });
    const pieces = owned.reduce((sum, { record }) => sum + record.copies.length, 0);
    const scanned = owned.reduce((sum, { record }) => sum + record.copies.filter((copy) => copy.uid).length, 0);
    const wishlist = records.filter(({ record }) => record.wishlist).length;
    const value = owned.reduce((sum, { card, record }) => {
      var _a2;
      return sum + marketNumber((_a2 = card.market) == null ? void 0 : _a2.loose) * record.copies.length;
    }, 0);
    const elements = new Set(owned.map(({ card }) => card.element).filter((element) => element && element !== "None"));
    return { records, owned, ownedCount: owned.length, pieces, scanned, wishlist, value, elements };
  }
  function renderShell() {
    container.innerHTML = '\n      <section class="tools-shell">\n        <header class="tools-hero">\n          <div>\n            <p class="eyebrow">Master checklist \xB7 clean build</p>\n            <h2>The complete collector toolkit.</h2>\n            <p>Every requested workflow lives here without carrying over old uploads, scans, backups, or collection history.</p>\n          </div>\n          <button class="button button--primary" type="button" data-tools-tv>Start TV showcase</button>\n        </header>\n        <nav class="tools-tabs" aria-label="Vault tools">\n          '.concat(toolTab("overview", "Overview"), "\n          ").concat(toolTab("market", "Market + eBay"), "\n          ").concat(toolTab("identify", "Photo ID"), "\n          ").concat(toolTab("swap", "SWAP Lab"), "\n          ").concat(toolTab("checklist", "Print checklist"), "\n          ").concat(toolTab("activity", "Activity"), '\n        </nav>\n        <div class="tools-panel" data-tools-panel></div>\n      </section>\n      <section class="tv-showcase" data-tv-showcase hidden aria-label="TV showcase">\n        <div class="tv-showcase__stage" data-tv-stage></div>\n        <div class="tv-showcase__controls">\n          <button type="button" data-tv-close>Close</button>\n          <button type="button" data-tv-prev>Previous</button>\n          <button type="button" data-tv-play>Pause</button>\n          <button type="button" data-tv-next>Next</button>\n          <button type="button" data-tv-fullscreen>Fullscreen</button>\n        </div>\n      </section>\n      <section class="print-sheet" data-print-sheet aria-hidden="true"></section>');
  }
  function toolTab(id, label) {
    return '<button type="button" data-tools-tab="'.concat(id, '" aria-pressed="').concat(id === ui.tab, '">').concat(label, "</button>");
  }
  function wire() {
    container.addEventListener("click", async (event) => {
      var _a2, _b, _c;
      const tab = event.target.closest("[data-tools-tab]");
      if (tab) {
        ui.tab = tab.dataset.toolsTab;
        render();
        return;
      }
      if (event.target.closest("[data-tools-tv]")) {
        startTv();
        return;
      }
      if (event.target.closest("[data-tv-close]")) {
        closeTv();
        return;
      }
      if (event.target.closest("[data-tv-prev]")) {
        moveTv(-1);
        return;
      }
      if (event.target.closest("[data-tv-next]")) {
        moveTv(1);
        return;
      }
      if (event.target.closest("[data-tv-play]")) {
        ui.tvPlaying = !ui.tvPlaying;
        syncTvTimer();
        renderTv();
        return;
      }
      if (event.target.closest("[data-tv-fullscreen]")) {
        const showcase = container.querySelector("[data-tv-showcase]");
        if (showcase == null ? void 0 : showcase.requestFullscreen) {
          try {
            await showcase.requestFullscreen();
          } catch {
          }
        }
        return;
      }
      const marketResult = event.target.closest("[data-market-result]");
      if (marketResult) {
        ui.marketCardId = marketResult.dataset.marketResult;
        ui.marketQuery = ((_a2 = cardsById.get(ui.marketCardId)) == null ? void 0 : _a2.name) || "";
        render();
        return;
      }
      if (event.target.closest("[data-market-copy-title]")) {
        const title = ((_b = container.querySelector("[data-market-title]")) == null ? void 0 : _b.textContent) || "";
        try {
          await navigator.clipboard.writeText(title);
          callbacks.onToast("eBay title copied");
        } catch {
          callbacks.onToast("Select the title and copy it manually.");
        }
        return;
      }
      if (event.target.closest("[data-market-copy-description]")) {
        const description = ((_c = container.querySelector("[data-market-description]")) == null ? void 0 : _c.textContent) || "";
        try {
          await navigator.clipboard.writeText(description);
          callbacks.onToast("Listing description copied");
        } catch {
          callbacks.onToast("Select the description and copy it manually.");
        }
        return;
      }
      const photoMatch = event.target.closest("[data-photo-match]");
      if (photoMatch) {
        callbacks.openCard(photoMatch.dataset.photoMatch);
        return;
      }
      if (event.target.closest("[data-swap-save]")) {
        saveAssembly();
        return;
      }
      const removeAssembly = event.target.closest("[data-swap-remove]");
      if (removeAssembly) {
        const state = getState();
        state.assemblies = (state.assemblies || []).filter((item) => item.id !== removeAssembly.dataset.swapRemove);
        callbacks.commit("assembly", "SWAP assembly removed");
        render();
        return;
      }
      if (event.target.closest("[data-print-checklist]")) {
        printChecklist();
        return;
      }
      if (event.target.closest("[data-download-missing]")) {
        downloadMissingCsv();
        return;
      }
    });
    container.addEventListener("input", (event) => {
      if (event.target.matches("[data-market-search]")) {
        ui.marketQuery = event.target.value;
        renderMarketResults();
      }
      if (event.target.matches("[data-market-input]")) {
        updateMarketMath();
      }
    });
    container.addEventListener("change", async (event) => {
      var _a2;
      if (event.target.matches("[data-photo-id-input]")) {
        const file = (_a2 = event.target.files) == null ? void 0 : _a2[0];
        if (file) await identifyPhoto(file);
      }
    });
    window.addEventListener("keydown", (event) => {
      const showcase = container.querySelector("[data-tv-showcase]");
      if (!showcase || showcase.hidden) return;
      if (event.key === "Escape") closeTv();
      if (event.key === "ArrowLeft") moveTv(-1);
      if (event.key === "ArrowRight") moveTv(1);
      if (event.key === " ") {
        event.preventDefault();
        ui.tvPlaying = !ui.tvPlaying;
        syncTvTimer();
        renderTv();
      }
    });
  }
  function render() {
    container.querySelectorAll("[data-tools-tab]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.toolsTab === ui.tab));
    });
    const panel = container.querySelector("[data-tools-panel]");
    if (ui.tab === "overview") panel.innerHTML = overviewMarkup();
    if (ui.tab === "market") panel.innerHTML = marketMarkup();
    if (ui.tab === "identify") panel.innerHTML = identifyMarkup();
    if (ui.tab === "swap") panel.innerHTML = swapMarkup();
    if (ui.tab === "checklist") panel.innerHTML = checklistMarkup();
    if (ui.tab === "activity") panel.innerHTML = activityMarkup();
    if (ui.tab === "market") updateMarketMath();
  }
  function overviewMarkup() {
    const data = metrics();
    const achievements = achievementData(data);
    const unlocked = achievements.filter((item) => item.unlocked).length;
    return '\n      <section class="tools-overview">\n        <div class="tools-stat-grid">\n          '.concat(toolStat(data.ownedCount, "".concat(cards.length, " cards"), "Collection"), "\n          ").concat(toolStat(data.pieces, "physical pieces", "Inventory"), "\n          ").concat(toolStat(money(data.value), "snapshot estimate", "Value"), "\n          ").concat(toolStat("".concat(unlocked, "/").concat(achievements.length), "unlocked", "Achievements"), '\n        </div>\n        <div class="tools-two-column">\n          <section class="feature-card">\n            <header><div><p class="eyebrow">Master checklist</p><h3>Feature status</h3></div><span class="status-ready">Ready</span></header>\n            <div class="master-feature-list">\n              ').concat(featureRow("Museum + profiles", "Complete 640-card visual catalog, filters, compatibility, sources, and full profiles."), "\n              ").concat(featureRow("Physical copies + photos", "Condition, packaging, storage, cost, notes, and optional future photo sync."), "\n              ").concat(featureRow("Live market workflow", "Dated price snapshots plus one-click current sold comps and eBay evaluation."), "\n              ").concat(featureRow("Photo identification", "Private on-device visual matching against the clean product-photo library."), "\n              ").concat(featureRow("Achievements + timeline", "Collection milestones and a local audit trail."), "\n              ").concat(featureRow("Printable checklists", "Complete six-game print layout and missing-item CSV."), "\n              ").concat(featureRow("TV showcase", "Full-screen slideshow built from generated card artwork."), "\n              ").concat(featureRow("Gated NFC editing", "Session-only safety gate for blank or personally owned NDEF tags."), '\n            </div>\n          </section>\n          <section class="feature-card">\n            <header><div><p class="eyebrow">Achievements</p><h3>').concat(unlocked, " unlocked</h3></div><span>").concat(Math.round(unlocked / achievements.length * 100), '%</span></header>\n            <div class="achievement-grid">\n              ').concat(achievements.map((item) => '<article data-unlocked="'.concat(item.unlocked, '"><i>').concat(item.icon, "</i><div><strong>").concat(escapeHtml(item.name), "</strong><span>").concat(escapeHtml(item.detail), "</span></div></article>")).join(""), "\n            </div>\n          </section>\n        </div>\n      </section>");
  }
  function toolStat(value, detail, label) {
    return "<article><span>".concat(escapeHtml(label), "</span><strong>").concat(escapeHtml(String(value)), "</strong><small>").concat(escapeHtml(detail), "</small></article>");
  }
  function featureRow(name, detail) {
    return '<article><i aria-hidden="true">\u2713</i><div><strong>'.concat(escapeHtml(name), "</strong><span>").concat(escapeHtml(detail), "</span></div></article>");
  }
  function achievementData(data) {
    const completeGames = GAMES.filter((game) => {
      const gameCards = cards.filter((card) => card.game === game);
      return gameCards.length && gameCards.every((card) => {
        var _a2;
        return (_a2 = getRecord(card.id).copies) == null ? void 0 : _a2.length;
      });
    });
    return [
      { name: "First arrival", detail: "Add your first physical piece.", icon: "01", unlocked: data.pieces >= 1 },
      { name: "Shelf builder", detail: "Collect 25 different cards.", icon: "25", unlocked: data.ownedCount >= 25 },
      { name: "Vault keeper", detail: "Collect 100 different cards.", icon: "100", unlocked: data.ownedCount >= 100 },
      { name: "Master collector", detail: "Collect 500 different cards.", icon: "500", unlocked: data.ownedCount >= 500 },
      { name: "Elementalist", detail: "Own a piece from every element.", icon: "EL", unlocked: data.elements.size >= 10 },
      { name: "Portal verified", detail: "Save one scanned UID.", icon: "NFC", unlocked: data.scanned >= 1 },
      { name: "Wish maker", detail: "Build a ten-item wishlist.", icon: "\u2605", unlocked: data.wishlist >= 10 },
      { name: "Era complete", detail: completeGames.length ? "".concat(completeGames.join(", "), " complete.") : "Complete any full game line.", icon: "06", unlocked: completeGames.length > 0 }
    ];
  }
  function marketMarkup() {
    var _a2, _b, _c, _d, _e, _f;
    const card = cardsById.get(ui.marketCardId) || cards[0];
    const record = getRecord(card.id);
    const price = marketNumber((_a2 = card.market) == null ? void 0 : _a2.loose);
    const title = listingTitle(card);
    const description = listingDescription(card, record);
    const liveUrl = "https://www.ebay.com/sch/i.html?_nkw=".concat(encodeURIComponent(card.name + " Skylanders"), "&LH_Sold=1&LH_Complete=1");
    return '\n      <section class="market-lab">\n        <header class="tool-section-head"><div><p class="eyebrow">Live comparison workflow</p><h3>Market + eBay evaluator</h3><p>Use the dated catalog snapshot as a baseline, then open current sold listings before pricing.</p></div></header>\n        <label class="tool-search"><span>Find an item</span><input data-market-search value="'.concat(escapeHtml(ui.marketQuery), '" placeholder="Search the 640-card catalog" autocomplete="off"><div class="market-results" data-market-results></div></label>\n        <div class="market-workbench">\n          <article class="market-selected" style="--card-el:').concat(elementColor(card.element), '">\n            <img src="assets/card-art/thumbs/').concat(encodeURIComponent(card.id), '.webp" alt="').concat(escapeHtml(card.name), ' generated card">\n            <div><p>').concat(escapeHtml(card.game || card.category), "</p><h4>").concat(escapeHtml(card.name), "</h4><span>").concat(escapeHtml(card.element), " \xB7 ").concat(escapeHtml(card.category), '</span></div>\n          </article>\n          <section class="market-prices">\n            ').concat(priceCell("Loose", ((_b = card.market) == null ? void 0 : _b.loose) || "\u2014"), "\n            ").concat(priceCell("Complete", ((_c = card.market) == null ? void 0 : _c.cib) || "\u2014"), "\n            ").concat(priceCell("New", ((_d = card.market) == null ? void 0 : _d.new) || "\u2014"), "\n            ").concat(priceCell("Snapshot", card.marketAsOf || "Unknown"), '\n          </section>\n          <section class="market-calculator">\n            <label><span>Listing price</span><input data-market-input data-market-price type="number" min="0" step=".01" value="').concat(price.toFixed(2), '"></label>\n            <label><span>Your cost</span><input data-market-input data-market-cost type="number" min="0" step=".01" value="').concat(marketNumber((_f = (_e = record.copies) == null ? void 0 : _e[0]) == null ? void 0 : _f.paid).toFixed(2), '"></label>\n            <label><span>Platform fee %</span><input data-market-input data-market-fee type="number" min="0" max="40" step=".1" value="13.25"></label>\n            <label><span>Shipping cost</span><input data-market-input data-market-shipping type="number" min="0" step=".01" value="5.00"></label>\n            <div class="market-net"><span>Estimated net</span><strong data-market-net>$0.00</strong><small data-market-profit>Profit $0.00</small></div>\n          </section>\n          <section class="listing-draft">\n            <div><span>Suggested title</span><strong data-market-title>').concat(escapeHtml(title), '</strong><button type="button" data-market-copy-title>Copy</button></div>\n            <div><span>Description starter</span><p data-market-description>').concat(escapeHtml(description), '</p><button type="button" data-market-copy-description>Copy</button></div>\n            <nav><a class="button button--primary" href="').concat(liveUrl, '" target="_blank" rel="noreferrer">Open live sold comps</a>').concat(card.sourceUrl ? '<a class="button" href="'.concat(escapeHtml(card.sourceUrl), '" target="_blank" rel="noreferrer">Open price source</a>') : "", "</nav>\n          </section>\n        </div>\n      </section>");
  }
  function priceCell(label, value) {
    return "<article><span>".concat(escapeHtml(label), "</span><strong>").concat(escapeHtml(String(value)), "</strong></article>");
  }
  function renderMarketResults() {
    var _a2;
    const host = container.querySelector("[data-market-results]");
    if (!host) return;
    const query = normalizeText(ui.marketQuery);
    if (!query || query === normalizeText((_a2 = cardsById.get(ui.marketCardId)) == null ? void 0 : _a2.name)) {
      host.innerHTML = "";
      return;
    }
    const matches = cards.filter((card) => normalizeText("".concat(card.name, " ").concat(card.game, " ").concat(card.element, " ").concat(card.category)).includes(query)).slice(0, 8);
    host.innerHTML = matches.length ? matches.map((card) => {
      var _a3;
      return '<button type="button" data-market-result="'.concat(card.id, '"><span>').concat(escapeHtml(card.name), "</span><small>").concat(escapeHtml(card.game || card.category), " \xB7 ").concat(escapeHtml(((_a3 = card.market) == null ? void 0 : _a3.loose) || "No price"), "</small></button>");
    }).join("") : '<span class="tool-empty">No catalog match.</span>';
  }
  function updateMarketMath() {
    var _a2, _b, _c, _d;
    const price = Number(((_a2 = container.querySelector("[data-market-price]")) == null ? void 0 : _a2.value) || 0);
    const cost = Number(((_b = container.querySelector("[data-market-cost]")) == null ? void 0 : _b.value) || 0);
    const fee = Number(((_c = container.querySelector("[data-market-fee]")) == null ? void 0 : _c.value) || 0) / 100;
    const shipping = Number(((_d = container.querySelector("[data-market-shipping]")) == null ? void 0 : _d.value) || 0);
    const net = Math.max(0, price - price * fee - shipping);
    const profit = net - cost;
    const netNode = container.querySelector("[data-market-net]");
    const profitNode = container.querySelector("[data-market-profit]");
    if (netNode) netNode.textContent = money(net);
    if (profitNode) {
      profitNode.textContent = "".concat(profit >= 0 ? "Profit" : "Loss", " ").concat(money(Math.abs(profit)));
      profitNode.dataset.positive = String(profit >= 0);
    }
  }
  function listingTitle(card) {
    const pieces = [card.name, card.game, card.element !== "None" ? card.element : "", card.category, "Authentic"];
    return pieces.filter(Boolean).join(" \xB7 ").slice(0, 80);
  }
  function listingDescription(card, record) {
    var _a2;
    const copy = (_a2 = record.copies) == null ? void 0 : _a2[0];
    const condition = (copy == null ? void 0 : copy.condition) || "Condition not yet graded";
    const packaging = (copy == null ? void 0 : copy.packaging) || "Loose";
    return "".concat(card.name, " from ").concat(card.game || "the Skylanders collection", ". ").concat(condition, "; ").concat(packaging, ". See photos for exact cosmetic condition. NFC functionality should be verified by the seller before listing.");
  }
  function identifyMarkup() {
    return '\n      <section class="photo-lab">\n        <header class="tool-section-head"><div><p class="eyebrow">Private visual matching</p><h3>Photo identification</h3><p>The selected photo stays in this browser. It is compared locally with the clean 763-photo reference library and is never uploaded.</p></div></header>\n        <div class="photo-id-workbench">\n          <label class="photo-drop">\n            <input data-photo-id-input type="file" accept="image/jpeg,image/png,image/webp" '.concat(ui.photoBusy ? "disabled" : "", ">\n            ").concat(ui.photoPreview ? '<img src="'.concat(escapeHtml(ui.photoPreview), '" alt="Photo selected for local identification">') : '<span aria-hidden="true">+</span>', "\n            <strong>").concat(ui.photoBusy ? "Comparing reference photos\u2026" : "Choose a clear figure photo", '</strong>\n            <small>Best results: one figure, plain background, full base visible.</small>\n          </label>\n          <section class="photo-results">\n            <p data-photo-status>').concat(escapeHtml(ui.photoStatus), "</p>\n            <div>\n              ").concat(ui.photoMatches.length ? ui.photoMatches.map((match, index) => '\n                <button type="button" data-photo-match="'.concat(match.card.id, '" style="--card-el:').concat(elementColor(match.card.element), '">\n                  <img src="').concat(escapeHtml(match.card.photoUrl), '" alt="">\n                  <span><b>#').concat(index + 1, " \xB7 ").concat(escapeHtml(match.card.name), "</b><small>").concat(escapeHtml(match.card.game || match.card.category), " \xB7 ").concat(escapeHtml(match.card.element), "</small></span>\n                  <strong>").concat(match.confidence, "%</strong>\n                </button>")).join("") : '<div class="tool-empty">Your top matches will appear here.</div>', "\n            </div>\n          </section>\n        </div>\n      </section>");
  }
  async function identifyPhoto(file) {
    if (!file.type.startsWith("image/")) {
      callbacks.onToast("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (ui.photoPreview) URL.revokeObjectURL(ui.photoPreview);
    ui.photoPreview = URL.createObjectURL(file);
    ui.photoBusy = true;
    ui.photoMatches = [];
    ui.photoStatus = "Reading the photo on this device\u2026";
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
          ui.photoStatus = "Compared ".concat(Math.min(index + 12, candidates.length), " of ").concat(candidates.length, " clean reference photos\u2026");
          const status = container.querySelector("[data-photo-status]");
          if (status) status.textContent = ui.photoStatus;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      scored.sort((a, b) => a.score - b.score);
      ui.photoMatches = scored.slice(0, 8).map((match) => ({
        ...match,
        confidence: Math.max(1, Math.min(99, Math.round(100 - match.score * 92)))
      }));
      ui.photoStatus = "Visual shortlist complete. Confirm the name, variant, and base before saving.";
    } catch (error) {
      ui.photoStatus = error.message || "This photo could not be read.";
    } finally {
      ui.photoBusy = false;
      render();
    }
  }
  async function descriptorFromFile(file) {
    var _a2;
    if ("createImageBitmap" in window) {
      const bitmap = await createImageBitmap(file);
      try {
        return imageDescriptor(bitmap);
      } finally {
        (_a2 = bitmap.close) == null ? void 0 : _a2.call(bitmap);
      }
    }
    const url = URL.createObjectURL(file);
    try {
      return imageDescriptor(await loadImage(url));
    } finally {
      URL.revokeObjectURL(url);
    }
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
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Reference image unavailable"));
      image.src = url;
    });
  }
  function imageDescriptor(image) {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#fff";
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
      sums[0] += r;
      sums[1] += g;
      sums[2] += b;
      sums[3] += r * r;
      sums[4] += g * g;
      sums[5] += b * b;
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
    const swappers = cards.filter((card) => {
      var _a2;
      return card.role === "SWAP Force" || ((_a2 = card.scl) == null ? void 0 : _a2.series) === "SWAP Force";
    });
    const ownedSwappers = swappers.filter((card) => {
      var _a2;
      return (_a2 = getRecord(card.id).copies) == null ? void 0 : _a2.length;
    });
    const choices = ownedSwappers.length ? ownedSwappers : swappers;
    const assemblies = state.assemblies || [];
    return '\n      <section class="swap-lab">\n        <header class="tool-section-head"><div><p class="eyebrow">Relationship-only assembly manager</p><h3>SWAP Laboratory</h3><p>Build combinations without changing either source figure, its saved UID, photos, or collection history.</p></div></header>\n        <div class="swap-builder">\n          <label><span>Top half source</span><select data-swap-top>'.concat(swapOptions(choices), '</select></label>\n          <div class="swap-join" aria-hidden="true">+</div>\n          <label><span>Bottom half source</span><select data-swap-bottom>').concat(swapOptions(choices, 1), '</select></label>\n          <button class="button button--primary" type="button" data-swap-save ').concat(choices.length < 2 ? "disabled" : "", ">Save assembly</button>\n        </div>\n        ").concat(ownedSwappers.length ? "" : '<p class="tool-note">Planning mode is active because no SWAP figures are marked owned yet.</p>', '\n        <div class="assembly-list">\n          ').concat(assemblies.length ? assemblies.map((assembly) => assemblyMarkup(assembly)).join("") : '<div class="tool-empty">No saved combinations yet.</div>', "\n        </div>\n      </section>");
  }
  function swapOptions(cardsToUse, selectedIndex = 0) {
    return cardsToUse.map((card, index) => '<option value="'.concat(card.id, '" ').concat(index === selectedIndex ? "selected" : "", ">").concat(escapeHtml(card.name), "</option>")).join("");
  }
  function saveAssembly() {
    var _a2, _b;
    const topCardId = (_a2 = container.querySelector("[data-swap-top]")) == null ? void 0 : _a2.value;
    const bottomCardId = (_b = container.querySelector("[data-swap-bottom]")) == null ? void 0 : _b.value;
    const top = cardsById.get(topCardId);
    const bottom = cardsById.get(bottomCardId);
    if (!top || !bottom) return;
    const topName = swapParts(top.name).top;
    const bottomName = swapParts(bottom.name).bottom;
    const assembly = {
      id: "swap-".concat(Date.now().toString(36)),
      topCardId,
      bottomCardId,
      name: "".concat(topName, " ").concat(bottomName),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const state = getState();
    state.assemblies = [assembly, ...state.assemblies || []].slice(0, 200);
    callbacks.commit("assembly", "".concat(assembly.name, " assembled"));
    callbacks.onToast("".concat(assembly.name, " saved"));
    render();
  }
  function swapParts(name) {
    const clean = String(name).replace(/\s*\([^)]*\)\s*/g, " ").trim();
    const words = clean.split(/\s+/);
    return { top: words[0] || clean, bottom: words.slice(1).join(" ") || words[0] || clean };
  }
  function assemblyMarkup(assembly) {
    const top = cardsById.get(assembly.topCardId);
    const bottom = cardsById.get(assembly.bottomCardId);
    if (!top || !bottom) return "";
    return '<article>\n      <div class="assembly-art"><img src="assets/card-art/thumbs/'.concat(encodeURIComponent(top.id), '.webp" alt=""><img src="assets/card-art/thumbs/').concat(encodeURIComponent(bottom.id), '.webp" alt=""></div>\n      <div><span>Saved combination</span><strong>').concat(escapeHtml(assembly.name), "</strong><small>").concat(escapeHtml(top.name), " top \xB7 ").concat(escapeHtml(bottom.name), ' bottom</small></div>\n      <button type="button" data-swap-remove="').concat(escapeHtml(assembly.id), '" aria-label="Remove ').concat(escapeHtml(assembly.name), '">Remove</button>\n    </article>');
  }
  function checklistMarkup() {
    const data = metrics();
    const gameRows = GAMES.map((game) => {
      const gameCards = cards.filter((card) => card.game === game);
      const owned = gameCards.filter((card) => {
        var _a2;
        return (_a2 = getRecord(card.id).copies) == null ? void 0 : _a2.length;
      }).length;
      return "<article><span>".concat(escapeHtml(game), "</span><strong>").concat(owned, " / ").concat(gameCards.length, '</strong><i style="--progress:').concat(gameCards.length ? Math.round(owned / gameCards.length * 100) : 0, '%"><b></b></i></article>');
    }).join("");
    return '\n      <section class="checklist-tool">\n        <header class="tool-section-head"><div><p class="eyebrow">Complete 640-card tracker</p><h3>Printable checklists</h3><p>Print a clean six-game checklist or download only the pieces still missing from your collection.</p></div></header>\n        <div class="checklist-summary">\n          <div><strong>'.concat(data.ownedCount, "</strong><span>owned</span></div>\n          <div><strong>").concat(cards.length - data.ownedCount, "</strong><span>missing</span></div>\n          <div><strong>").concat(data.wishlist, '</strong><span>wishlist</span></div>\n        </div>\n        <div class="checklist-games">').concat(gameRows, '</div>\n        <div class="checklist-actions"><button class="button button--primary" type="button" data-print-checklist>Print complete checklist</button><button class="button" type="button" data-download-missing>Download missing CSV</button></div>\n      </section>');
  }
  function printChecklist() {
    const host = container.querySelector("[data-print-sheet]");
    const grouped = GAMES.map((game) => {
      const gameCards = cards.filter((card) => card.game === game);
      return "<section><h2>".concat(escapeHtml(game), "</h2><ul>").concat(gameCards.map((card) => {
        var _a2;
        const owned = Boolean((_a2 = getRecord(card.id).copies) == null ? void 0 : _a2.length);
        return '<li data-owned="'.concat(owned, '"><i>').concat(owned ? "\u2713" : "", "</i><span>").concat(escapeHtml(card.name), "</span><small>").concat(escapeHtml(card.element), " \xB7 ").concat(escapeHtml(card.category), "</small></li>");
      }).join(""), "</ul></section>");
    }).join("");
    host.innerHTML = "<header><p>Skylanders Vault</p><h1>Complete collection checklist</h1><span>Generated ".concat((/* @__PURE__ */ new Date()).toLocaleDateString(), "</span></header>").concat(grouped);
    host.setAttribute("aria-hidden", "false");
    document.body.classList.add("printing-checklist");
    const cleanup = () => {
      document.body.classList.remove("printing-checklist");
      host.setAttribute("aria-hidden", "true");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.setTimeout(() => window.print(), 60);
  }
  function downloadMissingCsv() {
    const missing = cards.filter((card) => {
      var _a2;
      return !((_a2 = getRecord(card.id).copies) == null ? void 0 : _a2.length);
    });
    const lines = [
      ["Name", "Game", "Element", "Category", "Loose snapshot", "Wishlist"],
      ...missing.map((card) => {
        var _a2;
        return [card.name, card.game, card.element, card.category, ((_a2 = card.market) == null ? void 0 : _a2.loose) || "", getRecord(card.id).wishlist ? "Yes" : "No"];
      })
    ];
    const csv = lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "skylanders-vault-missing-checklist.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function activityMarkup() {
    const timeline = (getState().timeline || []).slice().reverse();
    return '\n      <section class="activity-tool">\n        <header class="tool-section-head"><div><p class="eyebrow">Local collection history</p><h3>Activity timeline</h3><p>New collection changes are recorded from this clean build onward.</p></div></header>\n        <div class="activity-list">\n          '.concat(timeline.length ? timeline.map((event) => "<article><i></i><div><strong>".concat(escapeHtml(event.label), "</strong><span>").concat(escapeHtml(event.type.replaceAll("_", " ")), '</span></div><time datetime="').concat(escapeHtml(event.at), '">').concat(escapeHtml(formatDate(event.at)), "</time></article>")).join("") : '<div class="tool-empty">No activity yet. Add a card, create a SWAP assembly, or update a copy to begin.</div>', "\n        </div>\n      </section>");
  }
  function startTv() {
    const showcase = container.querySelector("[data-tv-showcase]");
    if (!showcase) return;
    ui.tvIndex = 0;
    ui.tvPlaying = true;
    showcase.hidden = false;
    document.body.classList.add("tv-mode-active");
    renderTv();
    syncTvTimer();
  }
  function closeTv() {
    var _a2;
    const showcase = container.querySelector("[data-tv-showcase]");
    if (showcase) showcase.hidden = true;
    document.body.classList.remove("tv-mode-active");
    window.clearInterval(ui.tvTimer);
    ui.tvTimer = 0;
    if (document.fullscreenElement) (_a2 = document.exitFullscreen) == null ? void 0 : _a2.call(document);
  }
  function tvCards() {
    const owned = cards.filter((card) => {
      var _a2;
      return (_a2 = getRecord(card.id).copies) == null ? void 0 : _a2.length;
    });
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
    var _a2, _b;
    const list = tvCards();
    const card = list[ui.tvIndex % list.length];
    const record = getRecord(card.id);
    const stage = container.querySelector("[data-tv-stage]");
    const showcase = container.querySelector("[data-tv-showcase]");
    const play = container.querySelector("[data-tv-play]");
    if (!stage || !card) return;
    const accent = elementColor(card.element);
    stage.style.setProperty("--tv-accent", accent);
    showcase == null ? void 0 : showcase.style.setProperty("--tv-accent", accent);
    stage.innerHTML = '\n      <div class="tv-showcase__art"><img src="assets/card-art/cards/'.concat(encodeURIComponent(card.id), '.webp" alt="').concat(escapeHtml(card.name), ' generated collector card"></div>\n      <div class="tv-showcase__copy">\n        <p>').concat(escapeHtml(card.game || "Vault archive"), " \xB7 ").concat(escapeHtml(card.category), "</p>\n        <h2>").concat(escapeHtml(card.name), "</h2>\n        <span>").concat(escapeHtml(card.element)).concat(card.role ? " \xB7 ".concat(escapeHtml(card.role)) : "", "</span>\n        <div><strong>").concat(((_a2 = record.copies) == null ? void 0 : _a2.length) || 0, "</strong><small>").concat(((_b = record.copies) == null ? void 0 : _b.length) === 1 ? "copy owned" : "copies owned", "</small></div>\n        <footer>").concat(ui.tvIndex + 1, " / ").concat(list.length, " \xB7 ").concat(getState().catalog && Object.keys(getState().catalog).length ? "Owned collection" : "Complete vault preview", "</footer>\n      </div>");
    if (play) play.textContent = ui.tvPlaying ? "Pause" : "Play";
  }
  function renderExternalChange() {
    if (ui.tab === "overview" || ui.tab === "checklist" || ui.tab === "activity" || ui.tab === "swap") render();
  }
  function csvCell(value) {
    return '"'.concat(String(value != null ? value : "").replaceAll('"', '""'), '"');
  }
  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }
  return { render: renderExternalChange, open: (tab = "overview") => {
    ui.tab = tab;
    render();
  } };
}
function marketNumber(value) {
  const number = Number(String(value != null ? value : "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}
function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}
function elementColor(element) {
  return {
    Magic: "#9b79e8",
    Water: "#4eb8ef",
    Tech: "#edb44f",
    Fire: "#f06a55",
    Air: "#79d8e7",
    Earth: "#ba8b59",
    Undead: "#a78bd2",
    Life: "#70ca68",
    Dark: "#7868ad",
    Light: "#edd56d",
    Kaos: "#d36adf",
    None: "#5c92aa"
  }[element] || "#6f8797";
}
export {
  createFeatureSuite
};

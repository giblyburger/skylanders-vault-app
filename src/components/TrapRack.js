import { actionIcon, elementIcon } from "./icons.js?v=animation-2";
import { escapeHtml, getAssignedName, getTrapRecord, normalizeText } from "./helpers.js?v=animation-2";
function trapMatchesVillain(trap, record, selectedVillain, villainsById) {
  if (!selectedVillain) return true;
  const assignedName = normalizeText(getAssignedName(record, villainsById));
  const selectedName = normalizeText(selectedVillain.name);
  const preloaded = normalizeText(trap.preloaded);
  return trap.element === selectedVillain.element || assignedName === selectedName || preloaded === selectedName;
}
function matchesTrapFilters(trap, record, filters, villainsById, selectedVillain) {
  const assignedName = getAssignedName(record, villainsById);
  const text = normalizeText(filters.search);
  const haystack = normalizeText([
    trap.element,
    trap.mold,
    trap.official,
    trap.edition,
    trap.collectionGroup,
    trap.preloaded,
    assignedName
  ].join(" "));
  if (text && !haystack.includes(text)) return false;
  if (filters.element && trap.element !== filters.element) return false;
  if (filters.mold && trap.mold !== filters.mold) return false;
  if (filters.group && trap.collectionGroup !== filters.group) return false;
  if (!trapMatchesVillain(trap, record, selectedVillain, villainsById)) return false;
  return true;
}
function renderTrapRack(root, context) {
  const {
    elements,
    villainsById,
    traps,
    state,
    filters,
    selectedVillain,
    selectedTrapId,
    onSelectTrap,
    onOpenTrap
  } = context;
  const visibleTraps = traps.filter((trap) => {
    const record = getTrapRecord(state, trap.id);
    return matchesTrapFilters(trap, record, filters, villainsById, selectedVillain);
  });
  root.innerHTML = visibleTraps.map((trap) => {
    const element = elements[trap.element];
    const record = getTrapRecord(state, trap.id);
    const assignedName = getAssignedName(record, villainsById);
    const owned = record.quantity > 0;
    const selected = selectedTrapId === trap.id;
    const style = "--el:" + element.color + ";--el-dark:" + element.dark;
    const details = [trap.edition, assignedName ? "On board: " + assignedName : "Unplaced"].filter(Boolean).join(" \xB7 ");
    const preloaded = trap.preloaded ? '<span class="preloaded-chip">Factory loaded: ' + escapeHtml(trap.preloaded) + "</span>" : "";
    return '<article class="trap-card" data-trap-id="' + escapeHtml(trap.id) + '" data-owned="' + (owned ? "true" : "false") + '" data-selected="' + (selected ? "true" : "false") + '" style="' + style + '"><button class="trap-card__select" type="button" data-trap-select-id="' + escapeHtml(trap.id) + '" aria-label="Pick up ' + escapeHtml(trap.official) + ' for board placement"><span class="owned-pill">' + (owned ? "Owned x" + record.quantity : "Missing") + '</span><span class="selected-pill">Ready</span><div class="trap-crystal" aria-hidden="true"><span class="crystal-cap"></span><span class="crystal-core"><span>' + escapeHtml(trap.mold) + '</span></span><span class="crystal-base"></span></div><div class="trap-card__body"><span class="trap-card__eyebrow">' + elementIcon(element.icon) + escapeHtml(trap.element + " \xB7 " + trap.collectionGroup) + "</span><strong>" + escapeHtml(trap.official) + "</strong><span>" + escapeHtml(trap.element + " " + trap.mold) + "</span><small>" + escapeHtml(details) + "</small>" + preloaded + '</div></button><button class="trap-card__edit" type="button" data-trap-edit-id="' + escapeHtml(trap.id) + '" aria-label="Edit ' + escapeHtml(trap.official) + ' details" title="Edit Trap">' + actionIcon("edit") + "<span>Details</span></button></article>";
  }).join("") || '<p class="empty-state">No Trap entries match the current filters.</p>';
  root.querySelectorAll("[data-trap-select-id]").forEach((button) => {
    button.addEventListener("click", () => onSelectTrap(button.getAttribute("data-trap-select-id")));
  });
  root.querySelectorAll("[data-trap-edit-id]").forEach((button) => {
    button.addEventListener("click", () => onOpenTrap(button.getAttribute("data-trap-edit-id")));
  });
}
export {
  renderTrapRack
};

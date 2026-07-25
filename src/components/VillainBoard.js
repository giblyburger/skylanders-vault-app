import { elementIcon } from "./icons.js?v=animation-2";
import {
  ELEMENT_ORDER,
  STATUS_LABELS,
  escapeHtml,
  getVillainStatus,
  nextStatus,
  normalizeText
} from "./helpers.js?v=animation-2";
function matchesVillainFilters(villain, filters) {
  const text = normalizeText(filters.search);
  const haystack = normalizeText(villain.name + " " + villain.element + " " + (villain.doomRaider ? "doom raider" : ""));
  if (text && !haystack.includes(text)) return false;
  if (filters.element && villain.element !== filters.element) return false;
  if (filters.villain && villain.id !== filters.villain) return false;
  return true;
}
function renderPlacedTrap(placed, element) {
  if (!placed) return "";
  const trap = placed.trap;
  const style = "--el:" + element.color + ";--el-dark:" + element.dark;
  return '<span class="placed-trap" style="' + style + '" aria-hidden="true"><span class="placed-trap__cap"></span><span class="placed-trap__core"><span>' + escapeHtml(trap.mold) + '</span></span><span class="placed-trap__base"></span></span>';
}
function renderVillainBoard(root, context) {
  const {
    elements,
    villains,
    state,
    filters,
    selectedTrap,
    placementsByVillain,
    lastPlacement,
    onCycleVillain,
    onPlaceTrap
  } = context;
  const groups = ELEMENT_ORDER.map((elementName) => {
    return {
      elementName,
      element: elements[elementName],
      villains: villains.filter((villain) => villain.element === elementName)
    };
  }).filter((group) => group.villains.length);
  root.innerHTML = groups.map((group) => {
    const visibleVillains = group.villains.filter((villain) => matchesVillainFilters(villain, filters));
    if (!visibleVillains.length) return "";
    const trapped = group.villains.filter((villain) => {
      const status = getVillainStatus(state, villain.id);
      return status === "trapped" || status === "evolved";
    }).length;
    const style = "--el:" + group.element.color + ";--el-dark:" + group.element.dark;
    const slots = visibleVillains.map((villain) => {
      const status = getVillainStatus(state, villain.id);
      const label = STATUS_LABELS[status];
      const placed = placementsByVillain.get(villain.id);
      const canPlace = Boolean(selectedTrap && selectedTrap.element === villain.element);
      const hasSelectedTrap = Boolean(selectedTrap);
      const justPlaced = Boolean(placed && (lastPlacement == null ? void 0 : lastPlacement.villainId) === villain.id && (lastPlacement == null ? void 0 : lastPlacement.trapId) === placed.trap.id);
      const actionLabel = hasSelectedTrap ? "Place " + selectedTrap.official + " on " + villain.name : "Cycle " + villain.name + " status";
      const placedLabel = placed ? ", placed Trap: " + placed.trap.official : "";
      return '<button class="villain-slot" type="button" data-villain-id="' + escapeHtml(villain.id) + '" data-status="' + status + '" data-placeable="' + (canPlace ? "true" : "false") + '" data-placement-mode="' + (hasSelectedTrap ? "true" : "false") + '" data-has-trap="' + (placed ? "true" : "false") + '" data-just-placed="' + (justPlaced ? "true" : "false") + '" style="' + style + '" aria-label="' + escapeHtml(actionLabel + ". " + villain.name + ", " + group.elementName + ", " + label + placedLabel) + '"><span class="status-light" aria-hidden="true"></span><span class="hex-port" aria-hidden="true"><span></span></span>' + renderPlacedTrap(placed, group.element) + (justPlaced ? '<span class="capture-burst" aria-hidden="true"><i></i><i></i><i></i></span>' : "") + '<span class="slot-name">' + escapeHtml(villain.name) + '</span><span class="slot-meta">' + (villain.doomRaider ? "Doom Raider \xB7 " : "") + escapeHtml(label) + (placed ? " \xB7 " + escapeHtml(placed.trap.mold) : "") + "</span></button>";
    }).join("");
    return '<section class="element-bank" style="' + style + '" aria-label="' + escapeHtml(group.elementName) + ' villains"><header class="element-bank__header"><span class="element-token">' + elementIcon(group.element.icon) + "</span><div><h3>" + escapeHtml(group.elementName) + "</h3><p>" + trapped + "/" + group.villains.length + '</p></div></header><div class="slot-grid">' + slots + "</div></section>";
  }).join("") || '<p class="empty-state">No villains match the current filters.</p>';
  root.querySelectorAll("[data-villain-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const villainId = button.getAttribute("data-villain-id");
      if (selectedTrap) {
        onPlaceTrap(villainId);
        return;
      }
      const status = getVillainStatus(state, villainId);
      onCycleVillain(villainId, nextStatus(status));
    });
  });
}
export {
  renderVillainBoard
};

const ELEMENT_ORDER = [
  "Tech",
  "Water",
  "Life",
  "Undead",
  "Earth",
  "Air",
  "Fire",
  "Magic",
  "Light",
  "Dark",
  "Kaos"
];
const STATUS_ORDER = ["not-found", "defeated", "trapped", "evolved"];
const STATUS_LABELS = {
  "not-found": "Not Found",
  defeated: "Defeated",
  trapped: "Trapped",
  evolved: "Evolved"
};
function escapeHtml(value) {
  return String(value != null ? value : "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
function normalizeText(value) {
  return String(value != null ? value : "").trim().toLowerCase();
}
function getVillainStatus(state, villainId) {
  return STATUS_ORDER.includes(state.villains[villainId]) ? state.villains[villainId] : "not-found";
}
function getTrapRecord(state, trapId) {
  var _a, _b, _c, _d, _e;
  const record = state.traps[trapId] || {};
  return {
    quantity: Math.max(0, Number((_b = (_a = record.quantity) != null ? _a : record.qty) != null ? _b : 0) || 0),
    assignedVillainId: String((_c = record.assignedVillainId) != null ? _c : ""),
    assignedVillainName: String((_e = (_d = record.assignedVillainName) != null ? _d : record.assigned) != null ? _e : "")
  };
}
function getAssignedName(record, villainsById) {
  if (record.assignedVillainId && villainsById.has(record.assignedVillainId)) {
    return villainsById.get(record.assignedVillainId).name;
  }
  return record.assignedVillainName || "";
}
function nextStatus(status) {
  const current = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(current + 1) % STATUS_ORDER.length];
}
function asPercent(done, total) {
  if (!total) return 0;
  return Math.round(done / total * 100);
}
export {
  ELEMENT_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  asPercent,
  escapeHtml,
  getAssignedName,
  getTrapRecord,
  getVillainStatus,
  nextStatus,
  normalizeText
};

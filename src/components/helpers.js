export const ELEMENT_ORDER = [
  'Tech',
  'Water',
  'Life',
  'Undead',
  'Earth',
  'Air',
  'Fire',
  'Magic',
  'Light',
  'Dark',
  'Kaos'
];

export const STATUS_ORDER = ['not-found', 'defeated', 'trapped', 'evolved'];

export const STATUS_LABELS = {
  'not-found': 'Not Found',
  defeated: 'Defeated',
  trapped: 'Trapped',
  evolved: 'Evolved'
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

export function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function getVillainStatus(state, villainId) {
  return STATUS_ORDER.includes(state.villains[villainId]) ? state.villains[villainId] : 'not-found';
}

export function getTrapRecord(state, trapId) {
  const record = state.traps[trapId] || {};
  return {
    quantity: Math.max(0, Number(record.quantity ?? record.qty ?? 0) || 0),
    assignedVillainId: String(record.assignedVillainId ?? ''),
    assignedVillainName: String(record.assignedVillainName ?? record.assigned ?? '')
  };
}

export function getAssignedName(record, villainsById) {
  if (record.assignedVillainId && villainsById.has(record.assignedVillainId)) {
    return villainsById.get(record.assignedVillainId).name;
  }
  return record.assignedVillainName || '';
}

export function nextStatus(status) {
  const current = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(current + 1) % STATUS_ORDER.length];
}

export function asPercent(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

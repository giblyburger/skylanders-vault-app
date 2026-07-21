const elementPaths = {
  cloud: '<path d="M7.2 15.6h8.6a4 4 0 0 0 .3-8 5.7 5.7 0 0 0-10.9 1.7A3.2 3.2 0 0 0 7.2 15.6Z"/>',
  moon: '<path d="M14.8 17.2A7.3 7.3 0 0 1 8.5 4a7.7 7.7 0 1 0 6.3 13.2Z"/>',
  diamond: '<path d="M12 3 20 12 12 21 4 12 12 3Z"/>',
  flame: '<path d="M13.4 2.8c.6 3.2-2.4 4.4-1 7.1 1-1.1 1.6-2.5 1.7-4 2.3 2 4.1 4.2 4.1 7.3a6.2 6.2 0 1 1-12.4 0c0-2.4 1.5-4.5 3.7-6.2-.3 1.9.2 3.4 1.5 4.6-.2-3.6 1.4-5.4 2.4-8.8Z"/>',
  leaf: '<path d="M20 4.3C11.8 4 6.2 7.8 5.1 15.1c3.9.4 8-.6 10.9-3.6-2.2 3.9-5.4 5.7-9.6 6.4 5.8 2.6 12.8-1.8 13.6-13.6Z"/>',
  sun: '<path d="M12 7.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0-4.1v2.4M12 18.6V21M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M3 12h2.4M18.6 12H21M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/>',
  spark: '<path d="m12 2.8 2.1 6.1 6.1 2.1-6.1 2.1-2.1 6.1-2.1-6.1L3.8 11l6.1-2.1L12 2.8Z"/>',
  gear: '<path d="M9.7 3h4.6l.6 2.4c.6.2 1.1.5 1.6.9l2.3-.7 2.3 4-1.8 1.7c.1.3.1.6.1.9s0 .6-.1.9l1.8 1.7-2.3 4-2.3-.7c-.5.4-1 .7-1.6.9l-.6 2.4H9.7L9.1 19c-.6-.2-1.1-.5-1.6-.9l-2.3.7-2.3-4 1.8-1.7a6 6 0 0 1 0-1.8L2.9 9.6l2.3-4 2.3.7c.5-.4 1-.7 1.6-.9L9.7 3Zm2.3 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/>',
  skull: '<path d="M12 3.5c-4 0-7 2.8-7 6.8 0 2.4 1.2 4.1 2.8 5.1V20h8.4v-4.6c1.6-1 2.8-2.7 2.8-5.1 0-4-3-6.8-7-6.8ZM9.1 12.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5.8 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM11 16.8v-2.2h2v2.2h-2Z"/>',
  drop: '<path d="M12 2.7c3.8 4.5 5.7 7.8 5.7 10.2a5.7 5.7 0 1 1-11.4 0C6.3 10.5 8.2 7.2 12 2.7Z"/>',
  k: '<path d="M7 4h3v6l5-6h3.6l-5.4 6.4L19 20h-3.7l-4-6.8L10 14.7V20H7V4Z"/>'
};

const actionPaths = {
  export: '<path d="M12 3v10m0 0 4-4m-4 4-4-4M5 15v4h14v-4"/>',
  import: '<path d="M12 21V11m0 0 4 4m-4-4-4 4M5 9V5h14v4"/>',
  reset: '<path d="M5 7v5h5M5.7 12A6.5 6.5 0 1 0 8 5.4"/>',
  search: '<path d="m20 20-4.5-4.5M18 10.8a7.2 7.2 0 1 1-14.4 0 7.2 7.2 0 0 1 14.4 0Z"/>',
  display: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>',
  install: '<path d="M12 3v10m0 0 3.5-3.5M12 13 8.5 9.5M5 17.5h14V21H5z"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Zm10.5-14.5 4 4"/>',
  place: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>'
};

export function elementIcon(name) {
  const path = elementPaths[name] || elementPaths.spark;
  return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
}

export function actionIcon(name) {
  const path = actionPaths[name] || actionPaths.search;
  return '<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
}

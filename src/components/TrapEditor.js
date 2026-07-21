import { actionIcon, elementIcon } from './icons.js?v=animation-2';
import { escapeHtml, getAssignedName, getTrapRecord } from './helpers.js?v=animation-2';

export function createTrapEditor(dialog, callbacks) {
  let activeTrap = null;
  let activeContext = null;

  dialog.innerHTML = '<form class="trap-editor" method="dialog" aria-labelledby="editor-title">' +
    '<header class="trap-editor__header">' +
      '<div><span class="editor-element" data-editor-element></span><h2 id="editor-title" data-editor-title></h2><p data-editor-subtitle></p></div>' +
      '<button class="icon-button close-button" type="button" data-editor-close aria-label="Close editor">' + actionIcon('close') + '</button>' +
    '</header>' +
    '<div class="editor-preview" data-editor-preview></div>' +
    '<label class="field">Owned quantity<input data-editor-qty type="number" min="0" max="99" step="1" inputmode="numeric"></label>' +
    '<label class="field">Assigned villain<select data-editor-assigned></select></label>' +
    '<footer class="trap-editor__actions">' +
      '<button class="button button--danger" type="button" data-editor-missing>Set Missing</button>' +
      '<button class="button button--primary" type="submit">Save Trap</button>' +
    '</footer>' +
  '</form>';

  const form = dialog.querySelector('form');
  const closeButton = dialog.querySelector('[data-editor-close]');
  const missingButton = dialog.querySelector('[data-editor-missing]');
  const qtyInput = dialog.querySelector('[data-editor-qty]');
  const assignedSelect = dialog.querySelector('[data-editor-assigned]');

  function close() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    dialog.classList.remove('dialog-shell--fallback');
    document.body.classList.remove('dialog-fallback-active');
    activeTrap = null;
    activeContext = null;
  }

  function save(quantityOverride) {
    if (!activeTrap || !activeContext) return;
    const selected = assignedSelect.selectedOptions[0];
    const quantity = Math.max(0, Number(quantityOverride ?? qtyInput.value) || 0);
    callbacks.onSave(activeTrap.id, {
      quantity,
      assignedVillainId: quantity > 0 ? (selected?.dataset.villainId || '') : '',
      assignedVillainName: quantity > 0 ? (selected?.dataset.villainName || '') : ''
    });
    close();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });

  missingButton.addEventListener('click', () => save(0));
  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('cancel', () => {
    activeTrap = null;
    activeContext = null;
  });

  function open(trap, context) {
    activeTrap = trap;
    activeContext = context;
    const { elements, villains, villainsById, state } = context;
    const element = elements[trap.element];
    const record = getTrapRecord(state, trap.id);
    const assignedName = getAssignedName(record, villainsById);
    const matchingVillains = villains.filter((villain) => villain.element === trap.element);
    const options = ['<option value="" data-villain-id="" data-villain-name="">No villain assigned</option>'];

    matchingVillains.forEach((villain) => {
      options.push('<option value="villain:' + escapeHtml(villain.id) + '" data-villain-id="' + escapeHtml(villain.id) + '" data-villain-name="' + escapeHtml(villain.name) + '">' + escapeHtml(villain.name) + '</option>');
    });

    if (trap.preloaded && !matchingVillains.some((villain) => villain.name === trap.preloaded)) {
      options.push('<option value="variant:' + escapeHtml(trap.preloaded) + '" data-villain-id="" data-villain-name="' + escapeHtml(trap.preloaded) + '">' + escapeHtml(trap.preloaded) + ' (variant)</option>');
    }

    dialog.querySelector('[data-editor-element]').innerHTML = '<span class="element-token" style="--el:' + element.color + ';--el-dark:' + element.dark + '">' + elementIcon(element.icon) + '</span>' + escapeHtml(trap.element + ' ' + trap.mold);
    dialog.querySelector('[data-editor-title]').textContent = trap.official;
    dialog.querySelector('[data-editor-subtitle]').textContent = trap.edition + ' · ' + trap.collectionGroup;
    dialog.querySelector('[data-editor-preview]').innerHTML = '<div class="trap-crystal trap-crystal--large" style="--el:' + element.color + ';--el-dark:' + element.dark + '" aria-hidden="true"><span class="crystal-cap"></span><span class="crystal-core"><span>' + escapeHtml(trap.mold) + '</span></span><span class="crystal-base"></span></div>' + (trap.preloaded ? '<p>Factory loaded: ' + escapeHtml(trap.preloaded) + '</p>' : '');
    qtyInput.value = record.quantity;
    assignedSelect.innerHTML = options.join('');

    if (record.assignedVillainId) {
      assignedSelect.value = 'villain:' + record.assignedVillainId;
    } else if (assignedName) {
      assignedSelect.value = 'variant:' + assignedName;
    } else {
      assignedSelect.value = '';
    }

    if (!dialog.open && !dialog.hasAttribute('open')) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else {
        dialog.setAttribute('open', '');
        dialog.classList.add('dialog-shell--fallback');
        document.body.classList.add('dialog-fallback-active');
      }
    }
    qtyInput.focus();
    qtyInput.select();
  }

  return { open, close };
}

/**
 * Custom Feature Builder
 * ----------------------
 * Slide-out panel for creating and editing one-off custom features on a creature.
 * Custom features are stored as full feature objects in creature.customFeatures and
 * run through the same applyFeatureEffects() pipeline as library features.
 */

const DAMAGE_TYPES = [
  'Bludgeoning', 'Piercing', 'Slashing',
  'Cold', 'Corrosion', 'Fire', 'Lightning',
  'Poison', 'Psychic', 'Radiant', 'Umbral',
];


const SAVE_ATTRIBUTES = ['Mig', 'Agi', 'Cha', 'Int', 'Physical', 'Mental'];

let panelEl = null;
let onSaveCallback = () => {};
let onCancelCallback = () => {};
let onLivePreviewCallback = () => {};

/** Currently editing feature id (null for new). */
let editingId = null;

/** Pre-set type hint when opened via a "+" button. */
let initialTypeHint = null;

function getPanel() {
  if (!panelEl) panelEl = document.getElementById('customFeaturePanel');
  return panelEl;
}

/**
 * Open the slide-out panel.
 * @param {{type?: string, isReaction?: boolean}} [hint] - Pre-filters the type.
 * @param {object|null} [existingFeature] - Feature to edit (null for new).
 */
export function openCustomFeatureBuilder(hint = {}, existingFeature = null) {
  const panel = getPanel();
  if (!panel) return;

  editingId = existingFeature ? existingFeature.id : null;
  initialTypeHint = hint;

  renderPanel(existingFeature);
  panel.classList.add('is-open');
  panel.removeAttribute('hidden');
}

export function closeCustomFeatureBuilder() {
  const panel = getPanel();
  if (!panel) return;
  panel.classList.remove('is-open');
  // Allow CSS transition to finish before hiding
  setTimeout(() => {
    if (!panel.classList.contains('is-open')) panel.setAttribute('hidden', '');
  }, 300);
  editingId = null;
}

export function setCustomFeatureSaveHandler(cb) {
  onSaveCallback = typeof cb === 'function' ? cb : () => {};
}

export function setCustomFeatureCancelHandler(cb) {
  onCancelCallback = typeof cb === 'function' ? cb : () => {};
}

export function setCustomFeatureLivePreviewHandler(cb) {
  onLivePreviewCallback = typeof cb === 'function' ? cb : () => {};
}

// ---------------------------------------------------------------------------
// Panel rendering
// ---------------------------------------------------------------------------

function renderPanel(existingFeature) {
  const panel = getPanel();
  if (!panel) return;

  const body = panel.querySelector('.cfp-body');
  if (!body) return;
  body.innerHTML = '';

  // Determine initial type from hint or existing feature
  let featureCategory = 'passive';
  if (existingFeature) {
    const t = String(existingFeature.type || '').toLowerCase();
    if (t.startsWith('action')) featureCategory = 'action';
    else if (t === 'modifier') featureCategory = 'modifier';
    else featureCategory = 'passive';
  } else if (initialTypeHint) {
    featureCategory = initialTypeHint.type || 'passive';
  }

  const isReactionHint = existingFeature
    ? Boolean(existingFeature.isReaction || existingFeature.effects?.isReaction)
    : Boolean(initialTypeHint && initialTypeHint.isReaction);

  // Type selector
  const typeRow = makeElement('div', 'cfp-type-row');
  const typeLabel = makeElement('span', 'cfp-label', 'Feature type:');
  typeRow.appendChild(typeLabel);

  const categories = [
    { value: 'passive', label: 'Passive' },
    { value: 'modifier', label: 'Modifier' },
    { value: 'action', label: 'Action / Reaction' },
  ];

  categories.forEach(({ value, label }) => {
    const id = `cfp-type-${value}`;
    const radio = makeElement('input');
    radio.type = 'radio';
    radio.name = 'cfpType';
    radio.id = id;
    radio.value = value;
    radio.checked = featureCategory === value;
    const lbl = makeElement('label', 'cfp-type-label');
    lbl.setAttribute('for', id);
    lbl.textContent = label;
    typeRow.appendChild(radio);
    typeRow.appendChild(lbl);
  });

  body.appendChild(typeRow);

  // Type-specific form
  const formArea = makeElement('div', 'cfp-form-area');
  body.appendChild(formArea);

  renderFormForCategory(formArea, featureCategory, existingFeature, isReactionHint);

  // Re-render form when type changes
  body.querySelectorAll('input[name="cfpType"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        renderFormForCategory(formArea, radio.value, null, false);
        triggerLivePreview(body);
      }
    });
  });

  // Wire footer buttons
  const saveBtn = panel.querySelector('#cfpSaveBtn');
  const cancelBtn = panel.querySelector('#cfpCancelBtn');

  // Remove old listeners by replacing elements
  if (saveBtn) {
    const newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    newSave.addEventListener('click', () => handleSave(body));
  }
  if (cancelBtn) {
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newCancel.addEventListener('click', () => {
      onCancelCallback();
      closeCustomFeatureBuilder();
    });
  }
  const closeBtn = panel.querySelector('#cfpCloseBtn');
  if (closeBtn) {
    const newClose = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newClose, closeBtn);
    newClose.addEventListener('click', () => {
      onCancelCallback();
      closeCustomFeatureBuilder();
    });
  }
}

function renderFormForCategory(container, category, existingFeature, isReactionHint) {
  container.innerHTML = '';

  if (category === 'passive') {
    renderPassiveForm(container, existingFeature);
  } else if (category === 'modifier') {
    renderModifierForm(container, existingFeature);
  } else if (category === 'action') {
    renderActionForm(container, existingFeature, isReactionHint);
  }

  // Live preview on every input change
  container.addEventListener('input', () => triggerLivePreview(container.closest('.cfp-body')));
  container.addEventListener('change', () => triggerLivePreview(container.closest('.cfp-body')));
}

// ---------------------------------------------------------------------------
// Passive form
// ---------------------------------------------------------------------------

function renderPassiveForm(container, existing) {
  const ef = existing?.effects ?? {};
  addTextInput(container, 'cfpName', 'Name', existing?.name ?? '');
  addTextarea(container, 'cfpPassiveText', 'Rules text', ef.text ?? existing?.description ?? '');
}

// ---------------------------------------------------------------------------
// Modifier form
// ---------------------------------------------------------------------------

function renderModifierForm(container, existing) {
  const ef = existing?.effects ?? {};
  addTextInput(container, 'cfpName', 'Name', existing?.name ?? '');
  addTextarea(container, 'cfpModifierDescription', 'Description (optional)', ef.text ?? existing?.description ?? '');

  const numericGroup = makeElement('div', 'cfp-numeric-group');
  numericGroup.innerHTML = '<span class="cfp-label">Stat bonuses:</span>';

  const numericFields = [
    { id: 'cfpModHp',     label: 'HP',     key: 'hp' },
    { id: 'cfpModPd',     label: 'PD',     key: 'pd' },
    { id: 'cfpModAd',     label: 'AD',     key: 'ad' },
    { id: 'cfpModSpeed',  label: 'Speed',  key: 'speed' },
    { id: 'cfpModDamage', label: 'Damage', key: 'damage' },
  ];

  numericFields.forEach(({ id, label, key }) => {
    const row = makeElement('div', 'cfp-inline-field');
    const lbl = makeElement('label', '', label);
    lbl.setAttribute('for', id);
    const inp = makeElement('input');
    inp.type = 'number';
    inp.id = id;
    inp.className = 'cfp-number-input';
    inp.value = typeof ef[key] === 'number' ? String(ef[key]) : '0';
    inp.step = '1';
    row.appendChild(lbl);
    row.appendChild(inp);
    numericGroup.appendChild(row);
  });

  container.appendChild(numericGroup);

  // Resistances / Immunities / Vulnerabilities checkboxes
  const traitTypes = [
    { id: 'cfpResistances',     label: 'Resistances',     key: 'resistances' },
    { id: 'cfpImmunities',      label: 'Immunities',      key: 'immunities' },
    { id: 'cfpVulnerabilities', label: 'Vulnerabilities', key: 'vulnerabilities' },
  ];

  traitTypes.forEach(({ id, label, key }) => {
    const group = makeElement('div', 'cfp-trait-group');
    const lbl = makeElement('span', 'cfp-label', label + ':');
    group.appendChild(lbl);
    const checkboxes = makeElement('div', 'cfp-checkbox-grid');
    const existingValues = Array.isArray(ef[key]?.damage) ? ef[key].damage : [];
    DAMAGE_TYPES.forEach((dtype) => {
      const cbId = `${id}-${dtype.toLowerCase()}`;
      const cb = makeElement('input');
      cb.type = 'checkbox';
      cb.id = cbId;
      cb.name = id;
      cb.value = dtype;
      cb.dataset.category = 'damage';
      cb.checked = existingValues.includes(dtype);
      const cbLabel = makeElement('label', 'cfp-checkbox-label');
      cbLabel.setAttribute('for', cbId);
      cbLabel.textContent = dtype;
      checkboxes.appendChild(cb);
      checkboxes.appendChild(cbLabel);
    });
    group.appendChild(checkboxes);
    container.appendChild(group);
  });
}

// ---------------------------------------------------------------------------
// Action form
// ---------------------------------------------------------------------------

function renderActionForm(container, existing, isReactionHint) {
  const ef = existing?.effects ?? {};
  // Derive existing kind (Martial vs Spell) from stored actionType for backward compat
  const existingActionType = ef.actionType ?? existing?.actionType ?? '';
  const existingKind = existingActionType.toLowerCase().includes('spell') ? 'Spell' : 'Martial';
  // isAttack: true when a defense was previously targeted (not "none" / empty)
  const isAttack = Boolean(ef.targetDefense && ef.targetDefense !== 'none');

  addTextInput(container, 'cfpName', 'Name', existing?.name ?? '');

  // Reaction toggle
  const reactionRow = makeElement('div', 'cfp-toggle-row');
  const isReaction = existing ? Boolean(existing.isReaction || ef.isReaction) : isReactionHint;
  const reactionCb = addCheckbox(reactionRow, 'cfpIsReaction', 'Is Reaction', isReaction);
  container.appendChild(reactionRow);

  // Trigger field (shown conditionally)
  const triggerWrapper = makeElement('div', 'cfp-trigger-wrapper');
  triggerWrapper.style.display = isReaction ? '' : 'none';
  addTextInput(triggerWrapper, 'cfpTrigger', 'Trigger', ef.reactionTrigger ?? existing?.reactionTrigger ?? '');
  container.appendChild(triggerWrapper);

  reactionCb.addEventListener('change', () => {
    triggerWrapper.style.display = reactionCb.checked ? '' : 'none';
  });

  // Legendary / Apex toggles
  const legendaryRow = makeElement('div', 'cfp-toggle-row');
  addCheckbox(legendaryRow, 'cfpIsLegendary', 'Legendary Action', Boolean(existing?.isLegendaryAction || ef.isLegendaryAction));
  addCheckbox(legendaryRow, 'cfpIsApex', 'Apex Action', Boolean(existing?.isApexAction || ef.isApexAction));
  container.appendChild(legendaryRow);

  // Martial / Spell radio — action type is derived from this + target defense on save
  const kindGroup = makeElement('div', 'cfp-field-group');
  const kindLabel = makeElement('span', 'cfp-label', 'Action kind:');
  kindGroup.appendChild(kindLabel);
  const kindRow = makeElement('div', 'cfp-radio-row');
  [['Martial', 'Martial'], ['Spell', 'Spell']].forEach(([v, label]) => {
    const kindRadioId = `cfpKind-${v}`;
    const r = makeElement('input');
    r.type = 'radio';
    r.name = 'cfpActionKind';
    r.id = kindRadioId;
    r.value = v;
    r.checked = v === existingKind;
    const lbl = makeElement('label', '', label);
    lbl.setAttribute('for', kindRadioId);
    kindRow.appendChild(r);
    kindRow.appendChild(lbl);
  });
  kindGroup.appendChild(kindRow);
  container.appendChild(kindGroup);

  // AP cost
  addNumberInput(container, 'cfpCost', 'AP Cost', typeof ef.cost === 'number' ? ef.cost : 1, { min: 0, max: 10 });

  // Target and range
  addTextInput(container, 'cfpTarget', 'Target', ef.target ?? '');
  addTextInput(container, 'cfpRange', 'Range', ef.range ?? '');

  // Description
  addTextarea(container, 'cfpActionDescription', 'Description / Flavour text', ef.actionDescription ?? existing?.description ?? '');

  // Target defense (PD / AD / None)
  const defenseGroup = makeElement('div', 'cfp-field-group');
  const defenseLabel = makeElement('span', 'cfp-label', 'Target defense:');
  defenseGroup.appendChild(defenseLabel);
  const defenseRow = makeElement('div', 'cfp-radio-row');
  [['PD', 'PD'], ['AD', 'AD'], ['none', 'None (utility / save / check)']].forEach(([val, label]) => {
    const id = `cfpDef-${val}`;
    const radio = makeElement('input');
    radio.type = 'radio';
    radio.name = 'cfpTargetDefense';
    radio.id = id;
    radio.value = val;
    const currentDef = ef.targetDefense ?? (isAttack ? 'PD' : 'none');
    radio.checked = val === currentDef;
    const lbl = makeElement('label', '', label);
    lbl.setAttribute('for', id);
    defenseRow.appendChild(radio);
    defenseRow.appendChild(lbl);
  });
  defenseGroup.appendChild(defenseRow);
  container.appendChild(defenseGroup);

  // Damage segments
  const segmentsSection = makeElement('div', 'cfp-damage-section');
  const segLabel = makeElement('span', 'cfp-label', 'Damage segments:');
  segmentsSection.appendChild(segLabel);
  const segList = makeElement('div', 'cfp-damage-list');
  segmentsSection.appendChild(segList);

  const addSegBtn = makeElement('button', 'cfp-add-segment-btn');
  addSegBtn.type = 'button';
  addSegBtn.textContent = '+ Add damage segment';
  segmentsSection.appendChild(addSegBtn);

  const existingSegs = Array.isArray(ef.damageSegments) ? ef.damageSegments : [];
  if (existingSegs.length) {
    existingSegs.forEach((seg) => addDamageSegmentRow(segList, seg));
  } else {
    addDamageSegmentRow(segList, { useBase: true, modifier: 0, type: '' });
  }

  addSegBtn.addEventListener('click', () => {
    addDamageSegmentRow(segList, { useBase: false, modifier: 0, type: '' });
    triggerLivePreview(container.closest('.cfp-body'));
  });

  container.appendChild(segmentsSection);

  // Save block
  const saveSection = makeElement('details', 'cfp-detail-section');
  const saveSummary = makeElement('summary', '', 'Save (optional)');
  saveSection.appendChild(saveSummary);
  const saveBody = makeElement('div', 'cfp-detail-section-body');

  const existingSave = ef.save ?? null;
  const saveAttrGroup = makeElement('div', 'cfp-field-group');
  const saveAttrLabel = makeElement('label', 'cfp-label', 'Save attribute');
  saveAttrLabel.setAttribute('for', 'cfpSaveAttr');
  const saveAttrSelect = makeElement('select');
  saveAttrSelect.id = 'cfpSaveAttr';
  saveAttrSelect.className = 'cfp-select';
  const noneOpt = makeElement('option');
  noneOpt.value = '';
  noneOpt.textContent = 'None';
  saveAttrSelect.appendChild(noneOpt);
  SAVE_ATTRIBUTES.forEach((attr) => {
    const opt = makeElement('option');
    opt.value = attr;
    opt.textContent = attr;
    if (existingSave?.attribute === attr) opt.selected = true;
    saveAttrSelect.appendChild(opt);
  });
  saveAttrGroup.appendChild(saveAttrLabel);
  saveAttrGroup.appendChild(saveAttrSelect);
  saveBody.appendChild(saveAttrGroup);

  addTextInput(saveBody, 'cfpSaveFailure', 'Failure effect', existingSave?.failure ?? '');
  addTextInput(saveBody, 'cfpSaveFailureEach5', 'Failure (each 5)', existingSave?.failureEach5 ?? '');
  addTextInput(saveBody, 'cfpSaveSuccess', 'Success effect', existingSave?.success ?? '');
  addTextInput(saveBody, 'cfpSaveSuccessEach5', 'Success (each 5)', existingSave?.successEach5 ?? '');
  saveSection.appendChild(saveBody);

  container.appendChild(saveSection);

  // Check block
  const checkSection = makeElement('details', 'cfp-detail-section');
  const checkSummary = makeElement('summary', '', 'Check (optional)');
  checkSection.appendChild(checkSummary);
  const checkBody = makeElement('div', 'cfp-detail-section-body');

  const existingCheck = ef.check ?? null;
  addNumberInput(checkBody, 'cfpCheckDc', 'Check DC', existingCheck?.dc ?? 0);
  addTextInput(checkBody, 'cfpCheckFailure', 'Failure effect', existingCheck?.failure ?? '');
  addTextInput(checkBody, 'cfpCheckFailureEach5', 'Failure (each 5)', existingCheck?.failureEach5 ?? '');
  addTextInput(checkBody, 'cfpCheckSuccess', 'Success effect', existingCheck?.success ?? '');
  addTextInput(checkBody, 'cfpCheckSuccessEach5', 'Success (each 5)', existingCheck?.successEach5 ?? '');
  checkSection.appendChild(checkBody);

  container.appendChild(checkSection);
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function makeElement(tag, className = '', textContent = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent) el.textContent = textContent;
  return el;
}

function addTextInput(parent, id, label, value = '') {
  const group = makeElement('div', 'cfp-field-group');
  const lbl = makeElement('label', 'cfp-label');
  lbl.textContent = label;
  lbl.setAttribute('for', id);
  const inp = makeElement('input');
  inp.type = 'text';
  inp.id = id;
  inp.className = 'cfp-text-input';
  inp.value = value;
  group.appendChild(lbl);
  group.appendChild(inp);
  parent.appendChild(group);
  return inp;
}

function addTextarea(parent, id, label, value = '') {
  const group = makeElement('div', 'cfp-field-group');
  const lbl = makeElement('label', 'cfp-label');
  lbl.textContent = label;
  lbl.setAttribute('for', id);
  const ta = makeElement('textarea');
  ta.id = id;
  ta.className = 'cfp-textarea';
  ta.rows = 3;
  ta.value = value;
  group.appendChild(lbl);
  group.appendChild(ta);
  parent.appendChild(group);
  return ta;
}

function addNumberInput(parent, id, label, value = 0, { min, max, step = 1 } = {}) {
  const group = makeElement('div', 'cfp-field-group');
  const lbl = makeElement('label', 'cfp-label');
  lbl.textContent = label;
  lbl.setAttribute('for', id);
  const inp = makeElement('input');
  inp.type = 'number';
  inp.id = id;
  inp.className = 'cfp-number-input';
  inp.value = String(value);
  inp.step = String(step);
  if (min !== undefined) inp.min = String(min);
  if (max !== undefined) inp.max = String(max);
  group.appendChild(lbl);
  group.appendChild(inp);
  parent.appendChild(group);
  return inp;
}

function addCheckbox(parent, id, label, checked = false) {
  const row = makeElement('div', 'cfp-checkbox-row');
  const cb = makeElement('input');
  cb.type = 'checkbox';
  cb.id = id;
  cb.checked = checked;
  const lbl = makeElement('label', 'cfp-checkbox-label');
  lbl.setAttribute('for', id);
  lbl.textContent = label;
  row.appendChild(cb);
  row.appendChild(lbl);
  parent.appendChild(row);
  return cb;
}

function addDamageSegmentRow(list, seg = {}) {
  const row = makeElement('div', 'cfp-damage-row');

  const useBaseCb = makeElement('input');
  useBaseCb.type = 'checkbox';
  useBaseCb.className = 'cfp-seg-usebase';
  useBaseCb.checked = Boolean(seg.useBase);
  const useBaseLabel = makeElement('label', '', 'Scale with level');
  row.appendChild(useBaseCb);
  row.appendChild(useBaseLabel);

  const modInput = makeElement('input');
  modInput.type = 'number';
  modInput.className = 'cfp-seg-modifier';
  modInput.placeholder = 'Modifier (±)';
  modInput.step = '1';
  // When useBase is false and amount is set, show amount; otherwise show modifier
  if (!seg.useBase && typeof seg.amount === 'number') {
    modInput.value = String(seg.amount);
    modInput.placeholder = 'Fixed amount';
  } else {
    modInput.value = typeof seg.modifier === 'number' ? String(seg.modifier) : '0';
  }

  const typeSelect = makeElement('select');
  typeSelect.className = 'cfp-seg-type cfp-select';
  const emptyOpt = makeElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '— damage type —';
  typeSelect.appendChild(emptyOpt);
  DAMAGE_TYPES.forEach((dtype) => {
    const opt = makeElement('option');
    opt.value = dtype;
    opt.textContent = dtype;
    if (dtype === seg.type) opt.selected = true;
    typeSelect.appendChild(opt);
  });

  const removeBtn = makeElement('button', 'cfp-seg-remove');
  removeBtn.type = 'button';
  removeBtn.textContent = '×';
  removeBtn.title = 'Remove segment';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  // Update label based on useBase
  function updateModLabel() {
    modInput.placeholder = useBaseCb.checked ? 'Modifier (±)' : 'Fixed amount';
  }
  useBaseCb.addEventListener('change', updateModLabel);
  updateModLabel();

  row.appendChild(modInput);
  row.appendChild(typeSelect);
  row.appendChild(removeBtn);

  list.appendChild(row);
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

function readFormData(body) {
  const get = (id) => body.querySelector(`#${id}`);
  const val = (id) => get(id)?.value?.trim() ?? '';
  const num = (id) => parseFloat(get(id)?.value) || 0;
  const checked = (id) => Boolean(get(id)?.checked);
  const radio = (name) => body.querySelector(`input[name="${name}"]:checked`)?.value ?? '';

  const category = radio('cfpType') || 'passive';
  const name = val('cfpName');

  if (category === 'passive') {
    return {
      type: 'passive',
      name,
      effects: { text: val('cfpPassiveText') },
    };
  }

  if (category === 'modifier') {
    const hp     = num('cfpModHp');
    const pd     = num('cfpModPd');
    const ad     = num('cfpModAd');
    const speed  = num('cfpModSpeed');
    const damage = num('cfpModDamage');

    const collectChecked = (name) => {
      const vals = [];
      body.querySelectorAll(`input[name="${name}"]:checked`).forEach((cb) => {
        if (cb.dataset.category === 'damage') vals.push(cb.value);
      });
      return vals;
    };

    const effects = {
      text: val('cfpModifierDescription'),
    };
    if (hp !== 0) effects.hp = hp;
    if (pd !== 0) effects.pd = pd;
    if (ad !== 0) effects.ad = ad;
    if (speed !== 0) effects.speed = speed;
    if (damage !== 0) effects.damage = damage;

    const res = collectChecked('cfpResistances');
    if (res.length) effects.resistances = { damage: res, condition: [] };
    const imm = collectChecked('cfpImmunities');
    if (imm.length) effects.immunities = { damage: imm, condition: [] };
    const vuln = collectChecked('cfpVulnerabilities');
    if (vuln.length) effects.vulnerabilities = { damage: vuln, condition: [] };

    return { type: 'modifier', name, effects };
  }

  // action
  const isReaction = checked('cfpIsReaction');
  // Derive actionType from kind (Martial/Spell) + whether a defense is targeted
  const actionKind = radio('cfpActionKind') || 'Martial';
  const targetDefense = radio('cfpTargetDefense');
  const actionType = targetDefense !== 'none' ? `${actionKind} Attack` : `${actionKind} Utility`;
  const cost = num('cfpCost');
  const target = val('cfpTarget');
  const range = val('cfpRange');
  const actionDescription = val('cfpActionDescription');

  // Damage segments
  const damageSegments = [];
  body.querySelectorAll('.cfp-damage-row').forEach((row) => {
    const useBase = row.querySelector('.cfp-seg-usebase')?.checked ?? false;
    const modValue = parseFloat(row.querySelector('.cfp-seg-modifier')?.value) || 0;
    const segType = row.querySelector('.cfp-seg-type')?.value ?? '';
    if (useBase) {
      damageSegments.push({ useBase: true, modifier: modValue, type: segType });
    } else {
      damageSegments.push({ amount: modValue, type: segType });
    }
  });

  // Save
  const saveAttr = val('cfpSaveAttr');
  const saveFailure = val('cfpSaveFailure');
  const saveFailureEach5 = val('cfpSaveFailureEach5');
  const saveSuccess = val('cfpSaveSuccess');
  const saveSuccessEach5 = val('cfpSaveSuccessEach5');
  const hasSave = saveAttr || saveFailure || saveSuccess;
  const save = hasSave
    ? {
        attribute: saveAttr,
        failure: saveFailure,
        failureEach5: saveFailureEach5,
        success: saveSuccess,
        successEach5: saveSuccessEach5,
      }
    : null;

  // Check
  const checkDc = num('cfpCheckDc');
  const checkFailure = val('cfpCheckFailure');
  const checkSuccess = val('cfpCheckSuccess');
  const checkFailureEach5 = val('cfpCheckFailureEach5');
  const checkSuccessEach5 = val('cfpCheckSuccessEach5');
  const hasCheck = checkDc || checkFailure || checkSuccess;
  const check = hasCheck
    ? {
        dc: checkDc,
        failure: checkFailure,
        failureEach5: checkFailureEach5,
        success: checkSuccess,
        successEach5: checkSuccessEach5,
      }
    : null;

  const effects = {
    actionType,
    cost,
    isReaction,
    isLegendaryAction: checked('cfpIsLegendary'),
    isApexAction: checked('cfpIsApex'),
    reactionTrigger: isReaction ? val('cfpTrigger') : '',
    target,
    range,
    actionDescription,
    targetDefense: targetDefense !== 'none' ? targetDefense : '',
    damageSegments,
  };

  if (save) effects.save = save;
  if (check) effects.check = check;

  return {
    type: 'action',
    name,
    isReaction,
    isLegendaryAction: checked('cfpIsLegendary'),
    isApexAction: checked('cfpIsApex'),
    reactionTrigger: isReaction ? val('cfpTrigger') : '',
    effects,
  };
}

// ---------------------------------------------------------------------------
// Live preview
// ---------------------------------------------------------------------------

function triggerLivePreview(body) {
  if (!body) return;
  const data = readFormData(body);
  onLivePreviewCallback(data);
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

function handleSave(body) {
  const data = readFormData(body);

  if (!data.name) {
    const nameInput = body.querySelector('#cfpName');
    if (nameInput) {
      nameInput.focus();
      nameInput.classList.add('cfp-input-error');
    }
    return;
  }

  body.querySelector('#cfpName')?.classList.remove('cfp-input-error');

  const feature = {
    id: editingId || `custom-${crypto.randomUUID()}`,
    isCustom: true,
    featureCost: 0,
    ...data,
  };

  onSaveCallback(feature, editingId);
  closeCustomFeatureBuilder();
}

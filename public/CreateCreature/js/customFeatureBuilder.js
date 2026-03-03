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
const SAVE_DURATIONS = [
  { value: '', label: 'Instant (no duration)' },
  { value: 'until the end of its next turn', label: 'Until end of next turn' },
  { value: 'for 1 minute', label: 'For 1 minute' },
  { value: 'until removed', label: 'Until removed' },
];

const ROLE_VALUES = [
  'artillerist', 'brute', 'controller', 'defender',
  'leader', 'lurker', 'skirmisher', 'support',
];

const CREATURE_TYPE_VALUES = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon',
  'elemental', 'fey', 'fiend', 'giant', 'humanoid',
  'ooze', 'plant', 'undead',
];

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

  // Tags section (role / creature type) — persists across feature type changes
  const existingTags = Array.isArray(existingFeature?.tags) ? existingFeature.tags : [];
  renderTagsSection(body, existingTags);

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
    newSave.textContent = existingFeature ? 'Update Feature' : 'Add to Creature';
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
    // ef.targetDefense is stored as '' when "none" was selected, so use || not ??
    const currentDef = ef.targetDefense || (isAttack ? 'PD' : 'none');
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

  const saveDurationGroup = makeElement('div', 'cfp-field-group');
  const saveDurationLabel = makeElement('label', 'cfp-label', 'Duration');
  saveDurationLabel.setAttribute('for', 'cfpSaveDuration');
  const saveDurationSelect = makeElement('select');
  saveDurationSelect.id = 'cfpSaveDuration';
  saveDurationSelect.className = 'cfp-select';
  SAVE_DURATIONS.forEach(({ value, label }) => {
    const opt = makeElement('option');
    opt.value = value;
    opt.textContent = label;
    if ((existingSave?.duration ?? '') === value) opt.selected = true;
    saveDurationSelect.appendChild(opt);
  });
  saveDurationGroup.appendChild(saveDurationLabel);
  saveDurationGroup.appendChild(saveDurationSelect);
  saveBody.appendChild(saveDurationGroup);

  const saveRepeatableGroup = makeElement('div', 'cfp-field-group cfp-checkbox-group');
  const saveRepeatableCheck = makeElement('input');
  saveRepeatableCheck.type = 'checkbox';
  saveRepeatableCheck.id = 'cfpSaveRepeatable';
  saveRepeatableCheck.className = 'cfp-checkbox';
  saveRepeatableCheck.checked = Boolean(existingSave?.repeatable);
  const saveRepeatableLabel = makeElement('label', 'cfp-label', 'Repeatable Save (at end of target\'s turn)');
  saveRepeatableLabel.setAttribute('for', 'cfpSaveRepeatable');
  saveRepeatableGroup.appendChild(saveRepeatableCheck);
  saveRepeatableGroup.appendChild(saveRepeatableLabel);
  saveBody.appendChild(saveRepeatableGroup);

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

  // Enhancements section
  const enhSection = makeElement('details', 'cfp-detail-section');
  const enhSummary = makeElement('summary', '', 'Enhancements (optional)');
  enhSection.appendChild(enhSummary);
  const enhBody = makeElement('div', 'cfp-detail-section-body');
  const enhList = makeElement('div', 'cfp-enhancement-list');
  enhBody.appendChild(enhList);

  const existingEnhancements = Array.isArray(ef.enhancements) ? ef.enhancements : [];
  existingEnhancements.forEach((enh) => addEnhancementRow(enhList, enh));

  const addEnhBtn = makeElement('button', 'cfp-add-segment-btn');
  addEnhBtn.type = 'button';
  addEnhBtn.textContent = '+ Add Enhancement';
  addEnhBtn.addEventListener('click', () => {
    addEnhancementRow(enhList, {});
    triggerLivePreview(container.closest('.cfp-body'));
  });
  enhBody.appendChild(addEnhBtn);
  enhSection.appendChild(enhBody);

  container.appendChild(enhSection);
}

// ---------------------------------------------------------------------------
// Tags section (role / creature type)
// ---------------------------------------------------------------------------

function renderTagsSection(container, existingTags) {
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const section = makeElement('div', 'cfp-tags-section');

  const roleLabelEl = makeElement('span', 'cfp-label', 'Role tags:');
  section.appendChild(roleLabelEl);
  const roleGrid = makeElement('div', 'cfp-checkbox-grid cfp-checkbox-grid--tags');
  ROLE_VALUES.forEach((role) => {
    const cbId = `cfpRole-${role}`;
    const cb = makeElement('input');
    cb.type = 'checkbox';
    cb.id = cbId;
    cb.name = 'cfpRoleTags';
    cb.value = role;
    cb.checked = existingTags.includes(`role/${role}`);
    const lbl = makeElement('label', 'cfp-checkbox-label');
    lbl.setAttribute('for', cbId);
    lbl.textContent = capitalize(role);
    roleGrid.appendChild(cb);
    roleGrid.appendChild(lbl);
  });
  section.appendChild(roleGrid);

  const typeLabelEl = makeElement('span', 'cfp-label', 'Creature type tags:');
  section.appendChild(typeLabelEl);
  const typeGrid = makeElement('div', 'cfp-checkbox-grid cfp-checkbox-grid--tags');
  CREATURE_TYPE_VALUES.forEach((type) => {
    const cbId = `cfpCtype-${type}`;
    const cb = makeElement('input');
    cb.type = 'checkbox';
    cb.id = cbId;
    cb.name = 'cfpTypeTags';
    cb.value = type;
    cb.checked = existingTags.includes(`creature/${type}`);
    const lbl = makeElement('label', 'cfp-checkbox-label');
    lbl.setAttribute('for', cbId);
    lbl.textContent = capitalize(type);
    typeGrid.appendChild(cb);
    typeGrid.appendChild(lbl);
  });
  section.appendChild(typeGrid);

  container.appendChild(section);
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

function addEnhancementRow(list, enh = {}) {
  const row = makeElement('div', 'cfp-enhancement-row');

  // Name
  const nameInp = makeElement('input');
  nameInp.type = 'text';
  nameInp.className = 'cfp-text-input cfp-enh-name';
  nameInp.placeholder = 'Enhancement name';
  nameInp.value = enh.name ?? '';
  row.appendChild(nameInp);

  // AP cost
  const costInp = makeElement('input');
  costInp.type = 'number';
  costInp.className = 'cfp-number-input cfp-enh-cost';
  costInp.placeholder = 'AP';
  costInp.min = '1';
  costInp.step = '1';
  costInp.value = String(enh.cost ?? 1);
  costInp.title = 'Additional AP cost';
  row.appendChild(costInp);

  // Type selector
  const typeSelect = makeElement('select');
  typeSelect.className = 'cfp-select cfp-enh-type';
  [['save', 'Save'], ['damage', 'Bonus Damage'], ['description', 'Description']].forEach(([v, label]) => {
    const opt = makeElement('option'); opt.value = v; opt.textContent = label;
    typeSelect.appendChild(opt);
  });
  const inferredType = enh.save ? 'save' : (Array.isArray(enh.damageSegments) && enh.damageSegments.length ? 'damage' : 'description');
  typeSelect.value = inferredType;
  row.appendChild(typeSelect);

  // Type-specific body
  const typeBody = makeElement('div', 'cfp-enh-body');
  row.appendChild(typeBody);

  function renderEnhTypeBody(type) {
    typeBody.innerHTML = '';
    if (type === 'save') {
      const attrSelect = makeElement('select');
      attrSelect.className = 'cfp-select cfp-enh-save-attr';
      const noneOpt = makeElement('option'); noneOpt.value = ''; noneOpt.textContent = 'Attribute';
      attrSelect.appendChild(noneOpt);
      SAVE_ATTRIBUTES.forEach((attr) => {
        const opt = makeElement('option'); opt.value = attr; opt.textContent = attr;
        if (enh.save?.attribute === attr) opt.selected = true;
        attrSelect.appendChild(opt);
      });
      typeBody.appendChild(attrSelect);
      const failureInp = makeElement('input');
      failureInp.type = 'text'; failureInp.className = 'cfp-text-input cfp-enh-save-failure';
      failureInp.placeholder = 'Failure effect'; failureInp.value = enh.save?.failure ?? '';
      typeBody.appendChild(failureInp);
      const failEach5Inp = makeElement('input');
      failEach5Inp.type = 'text'; failEach5Inp.className = 'cfp-text-input cfp-enh-save-failureeach5';
      failEach5Inp.placeholder = 'Failure (each 5) — optional'; failEach5Inp.value = enh.save?.failureEach5 ?? '';
      typeBody.appendChild(failEach5Inp);
      const successInp = makeElement('input');
      successInp.type = 'text'; successInp.className = 'cfp-text-input cfp-enh-save-success';
      successInp.placeholder = 'Success effect — optional'; successInp.value = enh.save?.success ?? '';
      typeBody.appendChild(successInp);
      const successEach5Inp = makeElement('input');
      successEach5Inp.type = 'text'; successEach5Inp.className = 'cfp-text-input cfp-enh-save-successeach5';
      successEach5Inp.placeholder = 'Success (each 5) — optional'; successEach5Inp.value = enh.save?.successEach5 ?? '';
      typeBody.appendChild(successEach5Inp);
      const enhDurSelect = makeElement('select');
      enhDurSelect.className = 'cfp-select cfp-enh-save-duration';
      SAVE_DURATIONS.forEach(({ value, label }) => {
        const opt = makeElement('option'); opt.value = value; opt.textContent = label;
        if ((enh.save?.duration ?? '') === value) opt.selected = true;
        enhDurSelect.appendChild(opt);
      });
      typeBody.appendChild(enhDurSelect);
      const enhRepeatLabel = makeElement('label', 'cfp-label cfp-enh-repeatable-label');
      const enhRepeatCheck = makeElement('input');
      enhRepeatCheck.type = 'checkbox'; enhRepeatCheck.className = 'cfp-checkbox cfp-enh-save-repeatable';
      enhRepeatCheck.checked = Boolean(enh.save?.repeatable);
      enhRepeatLabel.appendChild(enhRepeatCheck);
      enhRepeatLabel.appendChild(document.createTextNode(' Repeatable Save'));
      typeBody.appendChild(enhRepeatLabel);
    } else if (type === 'damage') {
      const segList = makeElement('div', 'cfp-damage-list cfp-enh-damage-list');
      const existingSegs = Array.isArray(enh.damageSegments) ? enh.damageSegments : [];
      if (existingSegs.length) {
        existingSegs.forEach((seg) => addDamageSegmentRow(segList, seg));
      } else {
        addDamageSegmentRow(segList, { useBase: true, modifier: 0, type: '' });
      }
      typeBody.appendChild(segList);
      const addSegBtn = makeElement('button', 'cfp-add-segment-btn');
      addSegBtn.type = 'button'; addSegBtn.textContent = '+ Add damage segment';
      addSegBtn.addEventListener('click', () => addDamageSegmentRow(segList, {}));
      typeBody.appendChild(addSegBtn);
    } else {
      const descInp = makeElement('textarea');
      descInp.className = 'cfp-textarea cfp-enh-description';
      descInp.placeholder = 'Free-text description (e.g. "+2 range")';
      descInp.rows = 2;
      descInp.value = enh.description ?? '';
      typeBody.appendChild(descInp);
    }
  }

  renderEnhTypeBody(typeSelect.value);
  typeSelect.addEventListener('change', () => renderEnhTypeBody(typeSelect.value));

  const removeBtn = makeElement('button', 'cfp-seg-remove');
  removeBtn.type = 'button'; removeBtn.textContent = '×'; removeBtn.title = 'Remove enhancement';
  removeBtn.addEventListener('click', () => row.remove());
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

  // Tags — shared across all categories
  const tags = [];
  body.querySelectorAll('input[name="cfpRoleTags"]:checked').forEach((cb) => tags.push(`role/${cb.value}`));
  body.querySelectorAll('input[name="cfpTypeTags"]:checked').forEach((cb) => tags.push(`creature/${cb.value}`));

  if (category === 'passive') {
    return {
      type: 'passive',
      name,
      tags,
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

    return { type: 'modifier', name, tags, effects };
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
  body.querySelectorAll('.cfp-damage-list:not(.cfp-enh-damage-list) .cfp-damage-row').forEach((row) => {
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
  const saveDuration = val('cfpSaveDuration');
  const saveRepeatable = body.querySelector('#cfpSaveRepeatable')?.checked ?? false;
  const hasSave = saveAttr || saveFailure || saveSuccess;
  const save = hasSave
    ? {
        attribute: saveAttr,
        failure: saveFailure,
        failureEach5: saveFailureEach5,
        success: saveSuccess,
        successEach5: saveSuccessEach5,
        duration: saveDuration,
        repeatable: saveRepeatable,
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

  // Enhancements
  const enhancements = [];
  body.querySelectorAll('.cfp-enhancement-list .cfp-enhancement-row').forEach((row) => {
    const name = row.querySelector('.cfp-enh-name')?.value?.trim() ?? '';
    const cost = parseFloat(row.querySelector('.cfp-enh-cost')?.value) || 1;
    const type = row.querySelector('.cfp-enh-type')?.value ?? 'description';
    const enh = { name, cost };
    if (type === 'save') {
      const attribute = row.querySelector('.cfp-enh-save-attr')?.value ?? '';
      const failure = row.querySelector('.cfp-enh-save-failure')?.value?.trim() ?? '';
      const failureEach5 = row.querySelector('.cfp-enh-save-failureeach5')?.value?.trim() ?? '';
      const success = row.querySelector('.cfp-enh-save-success')?.value?.trim() ?? '';
      const successEach5 = row.querySelector('.cfp-enh-save-successeach5')?.value?.trim() ?? '';
      const duration = row.querySelector('.cfp-enh-save-duration')?.value ?? '';
      const repeatable = row.querySelector('.cfp-enh-save-repeatable')?.checked ?? false;
      if (attribute || failure) {
        enh.save = { attribute, failure };
        if (failureEach5) enh.save.failureEach5 = failureEach5;
        if (success) enh.save.success = success;
        if (successEach5) enh.save.successEach5 = successEach5;
        if (duration) enh.save.duration = duration;
        if (repeatable) enh.save.repeatable = true;
      }
    } else if (type === 'damage') {
      const damageSegments = [];
      row.querySelectorAll('.cfp-enh-damage-list .cfp-damage-row').forEach((segRow) => {
        const useBase = segRow.querySelector('.cfp-seg-usebase')?.checked ?? false;
        const modValue = parseFloat(segRow.querySelector('.cfp-seg-modifier')?.value) || 0;
        const segType = segRow.querySelector('.cfp-seg-type')?.value ?? '';
        if (useBase) damageSegments.push({ useBase: true, modifier: modValue, type: segType });
        else damageSegments.push({ amount: modValue, type: segType });
      });
      enh.damageSegments = damageSegments;
    } else {
      enh.description = row.querySelector('.cfp-enh-description')?.value?.trim() ?? '';
    }
    enhancements.push(enh);
  });

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
  if (enhancements.length) effects.enhancements = enhancements;

  return {
    type: 'action',
    name,
    tags,
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

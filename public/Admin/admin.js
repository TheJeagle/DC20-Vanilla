/**
 * Admin Feature Manager
 * ─────────────────────
 * Secure admin-only page for reviewing, editing, and promoting DC20 features.
 * Access is gated on the presence of a VanillaAdmins/{uid} document in Firestore.
 * Firestore rules are the real enforcement layer — this is UI-only gating.
 */

import { auth, db } from '../firebaseClient.js';
import { buildAction } from '../features.js';
import { createActionCardElement } from '../actionCardRenderer.js';
import { updateNavAuth } from '../navAuth.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

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
  'brute', 'defender', 'leader', 'soldier', 'striker', 'tactician',
];

const CREATURE_TYPE_VALUES = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon',
  'elemental', 'fey', 'fiend', 'giant', 'humanoid',
  'ooze', 'plant', 'undead',
];

/** Mock creature used as context when building action previews. */
const PREVIEW_CREATURE = {
  level: 5, damage: 3, check: 14, PD: 13, AD: 11, AP: 4, speed: 5, HP: 45, saveDC: 14,
  attributes: { Mig: 3, Agi: 2, Cha: 1, Int: 1 },
  featureActions: [], featureReactions: [], featurePassives: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let currentTab = 'library';
let allFeatures = [];
let selectedFeatureId = null;
let livePreviewTimer = null;

// ─────────────────────────────────────────────────────────────────────────────
// DOM helpers
// ─────────────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const show = (el) => el && el.removeAttribute('hidden');
const hide = (el) => el && el.setAttribute('hidden', '');

// ─────────────────────────────────────────────────────────────────────────────
// Auth gate
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('logoutButton')?.addEventListener('click', () => {
  signOut(auth).then(() => {
    window.location.href = '../Auth/auth.html';
  });
});

onAuthStateChanged(auth, async (user) => {
  updateNavAuth(user, db);
  hide($('adminLoading'));

  if (!user) {
    show($('adminNotSignedIn'));
    return;
  }

  try {
    const adminSnap = await getDoc(doc(db, 'VanillaAdmins', user.uid));
    if (!adminSnap.exists()) {
      show($('adminNotAuthorized'));
      return;
    }
  } catch (err) {
    console.error('Admin check failed:', err);
    show($('adminNotAuthorized'));
    return;
  }

  show($('adminLayout'));
  initAdminPage();
});

// ─────────────────────────────────────────────────────────────────────────────
// Page init
// ─────────────────────────────────────────────────────────────────────────────

function initAdminPage() {
  $('tabLibrary').addEventListener('click', () => switchTab('library'));
  $('tabCommunity').addEventListener('click', () => switchTab('community'));
  $('featureSearch').addEventListener('input', () => {
    renderFeatureList(filterFeatures($('featureSearch').value));
  });
  loadLibraryFeatures();
}

async function switchTab(tab) {
  currentTab = tab;
  selectedFeatureId = null;
  clearMainPanel();
  $('tabLibrary').classList.toggle('is-active', tab === 'library');
  $('tabCommunity').classList.toggle('is-active', tab === 'community');
  $('featureSearch').value = '';
  if (tab === 'library') {
    await loadLibraryFeatures();
  } else {
    await loadCommunityFeatures();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature loading
// ─────────────────────────────────────────────────────────────────────────────

async function loadLibraryFeatures() {
  $('featureList').innerHTML = '<div class="admin-list-loading">Loading…</div>';
  try {
    const snap = await getDocs(collection(db, 'VanillaFeatures'));
    allFeatures = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    renderFeatureList(allFeatures);
  } catch (err) {
    $('featureList').textContent = 'Error loading library features.';
    console.error(err);
  }
}

async function loadCommunityFeatures() {
  $('featureList').innerHTML = '<div class="admin-list-loading">Loading…</div>';
  try {
    const q = query(
      collection(db, 'VanillaUsermadeFeatures'),
      where('isPublic', '==', true),
      orderBy('totalLikes', 'desc'),
      limit(100),
    );
    const snap = await getDocs(q);
    allFeatures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderFeatureList(allFeatures);
  } catch (err) {
    $('featureList').innerHTML =
      `<div class="admin-list-empty">Error: ${err.message}<br><small>Community tab may require a Firestore composite index on isPublic + totalLikes.</small></div>`;
    console.error(err);
  }
}

function filterFeatures(search) {
  if (!search) return allFeatures;
  const q = search.toLowerCase();
  return allFeatures.filter((f) => (f.name ?? '').toLowerCase().includes(q));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderFeatureList(features) {
  const list = $('featureList');
  list.innerHTML = '';

  if (!features.length) {
    const empty = document.createElement('div');
    empty.className = 'admin-list-empty';
    empty.textContent = 'No features found.';
    list.appendChild(empty);
    return;
  }

  features.forEach((feature) => {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    if (feature.id === selectedFeatureId) item.classList.add('is-selected');
    item.dataset.featureId = feature.id;

    const name = document.createElement('span');
    name.className = 'admin-list-item__name';
    name.textContent = feature.name ?? feature.id;
    item.appendChild(name);

    const typePill = document.createElement('span');
    const typeVal = String(feature.type ?? 'unknown').toLowerCase();
    const typeDisplay = typeVal.startsWith('action') ? 'action' : typeVal;
    typePill.className = `admin-list-item__type admin-type--${typeDisplay}`;
    typePill.textContent = typeDisplay;
    item.appendChild(typePill);

    if (currentTab === 'community') {
      if (feature.totalLikes) {
        const likes = document.createElement('span');
        likes.className = 'admin-list-item__likes';
        likes.textContent = `♥ ${feature.totalLikes}`;
        item.appendChild(likes);
      }
      if (feature.promotedAt) {
        const badge = document.createElement('span');
        badge.className = 'admin-list-item__promoted';
        badge.textContent = '✓ promoted';
        item.appendChild(badge);
      }
    }

    item.addEventListener('click', () => selectFeature(feature));
    list.appendChild(item);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature selection
// ─────────────────────────────────────────────────────────────────────────────

function selectFeature(feature) {
  selectedFeatureId = feature.id;
  document.querySelectorAll('.admin-list-item').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.featureId === feature.id);
  });
  renderMainPanel(feature);
}

function clearMainPanel() {
  $('adminPreviewArea').innerHTML = '<div class="admin-placeholder">Select a feature from the list to preview it here.</div>';
  $('adminFormArea').innerHTML = '<div class="admin-placeholder">Select a feature from the list to edit it here.</div>';
  $('adminActions').innerHTML = '';
  hide($('adminActions'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

function renderMainPanel(feature) {
  renderForm(feature);
  updatePreview();
  renderActionButtons(feature);
  show($('adminActions'));
}

function renderActionButtons(feature) {
  const actionsEl = $('adminActions');
  actionsEl.innerHTML = '';

  if (currentTab === 'library') {
    const saveBtn = makeElement('button', 'admin-btn admin-btn--save');
    saveBtn.type = 'button';
    saveBtn.textContent = '💾 Save to Library';
    saveBtn.addEventListener('click', handleSave);
    actionsEl.appendChild(saveBtn);

    const deleteBtn = makeElement('button', 'admin-btn admin-btn--delete');
    deleteBtn.type = 'button';
    deleteBtn.textContent = '🗑 Delete from Library';
    deleteBtn.addEventListener('click', () => handleDeleteLibrary(feature));
    actionsEl.appendChild(deleteBtn);
  } else {
    const promoteBtn = makeElement('button', 'admin-btn admin-btn--promote');
    promoteBtn.type = 'button';
    promoteBtn.textContent = '⬆ Promote to Library';
    promoteBtn.addEventListener('click', () => handlePromote(feature));
    actionsEl.appendChild(promoteBtn);

    const deleteBtn = makeElement('button', 'admin-btn admin-btn--delete');
    deleteBtn.type = 'button';
    deleteBtn.textContent = '🗑 Delete Community Feature';
    deleteBtn.addEventListener('click', () => handleDeleteCommunity(feature));
    actionsEl.appendChild(deleteBtn);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Form rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderForm(feature) {
  const formArea = $('adminFormArea');
  formArea.innerHTML = '';

  // Determine category
  let featureCategory = 'passive';
  const t = String(feature?.type ?? '').toLowerCase();
  if (t.startsWith('action')) featureCategory = 'action';
  else if (t === 'modifier') featureCategory = 'modifier';

  const isReactionHint = Boolean(feature?.isReaction || feature?.effects?.isReaction);

  // ── Admin-only fields ──
  const adminSection = makeElement('div', 'admin-extra-fields');
  const idInp = addTextInput(adminSection, 'admId', 'Feature ID (slug)', feature?.id ?? '');
  const nameInp = addTextInput(adminSection, 'admName', 'Name', feature?.name ?? '');
  addNumberInput(adminSection, 'admCost', 'Feature Cost (CP)', feature?.featureCost ?? 0, { min: 0 });
  addTextarea(adminSection, 'admFeatureDescription', 'Feature Description (picker tooltip)',
    feature?.featureDescription ?? feature?.description ?? '');
  formArea.appendChild(adminSection);

  // Auto-slug name → ID when ID was not manually changed
  let idManuallySet = Boolean(feature?.id);
  nameInp.addEventListener('input', () => {
    if (!idManuallySet) idInp.value = slugify(nameInp.value);
  });
  idInp.addEventListener('input', () => { idManuallySet = true; });

  // ── Type selector ──
  const typeRow = makeElement('div', 'cfp-type-row');
  typeRow.appendChild(makeElement('span', 'cfp-label', 'Feature type:'));
  [
    { value: 'passive', label: 'Passive' },
    { value: 'modifier', label: 'Modifier' },
    { value: 'action', label: 'Action / Reaction' },
  ].forEach(({ value, label }) => {
    const id = `admType-${value}`;
    const radio = makeElement('input');
    radio.type = 'radio'; radio.name = 'admFeatureType'; radio.id = id; radio.value = value;
    radio.checked = featureCategory === value;
    const lbl = makeElement('label', 'cfp-type-label');
    lbl.setAttribute('for', id); lbl.textContent = label;
    typeRow.appendChild(radio); typeRow.appendChild(lbl);
  });
  formArea.appendChild(typeRow);

  // ── Type-specific form ──
  const specificArea = makeElement('div', 'cfp-form-area');
  formArea.appendChild(specificArea);
  renderFormForCategory(specificArea, featureCategory, feature, isReactionHint);

  // ── Tags ──
  renderTagsSection(formArea, Array.isArray(feature?.tags) ? feature.tags : []);

  // Re-render on type change
  formArea.querySelectorAll('input[name="admFeatureType"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        renderFormForCategory(specificArea, radio.value, null, false);
        scheduleLivePreview();
      }
    });
  });

  formArea.addEventListener('input', scheduleLivePreview);
  formArea.addEventListener('change', scheduleLivePreview);
}

function renderFormForCategory(container, category, feature, isReactionHint) {
  container.innerHTML = '';
  if (category === 'passive') renderPassiveForm(container, feature);
  else if (category === 'modifier') renderModifierForm(container, feature);
  else renderActionForm(container, feature, isReactionHint);
}

function renderPassiveForm(container, existing) {
  const ef = existing?.effects ?? {};
  addTextarea(container, 'admPassiveText', 'Rules text', ef.text ?? existing?.description ?? '');
}

function renderModifierForm(container, existing) {
  const ef = existing?.effects ?? {};
  addTextarea(container, 'admModifierDescription', 'Description (optional)', ef.text ?? existing?.description ?? '');

  const numericGroup = makeElement('div', 'cfp-numeric-group');
  numericGroup.appendChild(makeElement('span', 'cfp-label', 'Stat bonuses:'));
  [
    { id: 'admModHp',     label: 'HP',     key: 'hp' },
    { id: 'admModPd',     label: 'PD',     key: 'pd' },
    { id: 'admModAd',     label: 'AD',     key: 'ad' },
    { id: 'admModSpeed',  label: 'Speed',  key: 'speed' },
    { id: 'admModDamage', label: 'Damage', key: 'damage' },
  ].forEach(({ id, label, key }) => {
    const row = makeElement('div', 'cfp-inline-field');
    const lbl = makeElement('label', '', label);
    lbl.setAttribute('for', id);
    const inp = makeElement('input');
    inp.type = 'number'; inp.id = id; inp.className = 'cfp-number-input';
    inp.value = typeof ef[key] === 'number' ? String(ef[key]) : '0';
    inp.step = '1';
    row.appendChild(lbl); row.appendChild(inp);
    numericGroup.appendChild(row);
  });
  container.appendChild(numericGroup);

  [
    { id: 'admResistances',     label: 'Resistances',     key: 'resistances' },
    { id: 'admImmunities',      label: 'Immunities',      key: 'immunities' },
    { id: 'admVulnerabilities', label: 'Vulnerabilities', key: 'vulnerabilities' },
  ].forEach(({ id, label, key }) => {
    const group = makeElement('div', 'cfp-trait-group');
    group.appendChild(makeElement('span', 'cfp-label', `${label}:`));
    const grid = makeElement('div', 'cfp-checkbox-grid');
    const existing = Array.isArray(ef[key]?.damage) ? ef[key].damage : [];
    DAMAGE_TYPES.forEach((dtype) => {
      const cbId = `${id}-${dtype.toLowerCase()}`;
      const cb = makeElement('input');
      cb.type = 'checkbox'; cb.id = cbId; cb.name = id; cb.value = dtype;
      cb.dataset.category = 'damage'; cb.checked = existing.includes(dtype);
      const cbLabel = makeElement('label', 'cfp-checkbox-label');
      cbLabel.setAttribute('for', cbId); cbLabel.textContent = dtype;
      grid.appendChild(cb); grid.appendChild(cbLabel);
    });
    group.appendChild(grid);
    container.appendChild(group);
  });
}

function renderActionForm(container, existing, isReactionHint) {
  const ef = existing?.effects ?? {};
  const existingActionType = ef.actionType ?? existing?.actionType ?? '';
  const existingKind = existingActionType.toLowerCase().includes('spell') ? 'Spell' : 'Martial';
  const isAttack = Boolean(ef.targetDefense && ef.targetDefense !== 'none');
  const isReaction = existing ? Boolean(existing.isReaction || ef.isReaction) : isReactionHint;

  // Reaction toggle
  const reactionRow = makeElement('div', 'cfp-toggle-row');
  const reactionCb = addCheckbox(reactionRow, 'admIsReaction', 'Is Reaction', isReaction);
  container.appendChild(reactionRow);

  const triggerWrapper = makeElement('div', 'cfp-trigger-wrapper');
  triggerWrapper.style.display = isReaction ? '' : 'none';
  addTextInput(triggerWrapper, 'admTrigger', 'Trigger', ef.reactionTrigger ?? existing?.reactionTrigger ?? '');
  container.appendChild(triggerWrapper);
  reactionCb.addEventListener('change', () => {
    triggerWrapper.style.display = reactionCb.checked ? '' : 'none';
  });

  const legendaryRow = makeElement('div', 'cfp-toggle-row');
  addCheckbox(legendaryRow, 'admIsLegendary', 'RP Action',
    Boolean(existing?.isLegendaryAction || ef.isLegendaryAction));
  addCheckbox(legendaryRow, 'admIsApex', 'Round Action',
    Boolean(existing?.isApexAction || ef.isApexAction));
  container.appendChild(legendaryRow);

  // Martial / Spell kind
  const kindGroup = makeElement('div', 'cfp-field-group');
  kindGroup.appendChild(makeElement('span', 'cfp-label', 'Action kind:'));
  const kindRow = makeElement('div', 'cfp-radio-row');
  ['Martial', 'Spell'].forEach((v) => {
    const r = makeElement('input');
    r.type = 'radio'; r.name = 'admActionKind'; r.id = `admKind-${v}`; r.value = v;
    r.checked = v === existingKind;
    const lbl = makeElement('label', '', v);
    lbl.setAttribute('for', `admKind-${v}`);
    kindRow.appendChild(r); kindRow.appendChild(lbl);
  });
  kindGroup.appendChild(kindRow);
  container.appendChild(kindGroup);

  addNumberInput(container, 'admActionCost', 'AP Cost',
    typeof ef.cost === 'number' ? ef.cost : 1, { min: 0, max: 10 });
  addTextInput(container, 'admTarget', 'Target', ef.target ?? '');
  addTextInput(container, 'admRange', 'Range', ef.range ?? '');
  addTextarea(container, 'admActionDescription', 'Description / Flavour text',
    ef.actionDescription ?? existing?.description ?? '');

  // Target defense
  const defenseGroup = makeElement('div', 'cfp-field-group');
  defenseGroup.appendChild(makeElement('span', 'cfp-label', 'Target defense:'));
  const defenseRow = makeElement('div', 'cfp-radio-row');
  [['PD', 'PD'], ['AD', 'AD'], ['none', 'None (utility / save / check)']].forEach(([val, label]) => {
    const radio = makeElement('input');
    radio.type = 'radio'; radio.name = 'admTargetDefense'; radio.id = `admDef-${val}`; radio.value = val;
    const currentDef = ef.targetDefense || (isAttack ? 'PD' : 'none');
    radio.checked = val === currentDef;
    const lbl = makeElement('label', '', label);
    lbl.setAttribute('for', `admDef-${val}`);
    defenseRow.appendChild(radio); defenseRow.appendChild(lbl);
  });
  defenseGroup.appendChild(defenseRow);
  container.appendChild(defenseGroup);

  // Damage segments
  const segSection = makeElement('div', 'cfp-damage-section');
  segSection.appendChild(makeElement('span', 'cfp-label', 'Damage segments:'));
  const segList = makeElement('div', 'cfp-damage-list');
  segSection.appendChild(segList);
  const addSegBtn = makeElement('button', 'cfp-add-segment-btn');
  addSegBtn.type = 'button'; addSegBtn.textContent = '+ Add damage segment';
  segSection.appendChild(addSegBtn);

  const existingSegs = Array.isArray(ef.damageSegments) ? ef.damageSegments : [];
  if (existingSegs.length) {
    existingSegs.forEach((seg) => addDamageSegmentRow(segList, seg));
  } else {
    addDamageSegmentRow(segList, { useBase: true, modifier: 0, type: '' });
  }
  addSegBtn.addEventListener('click', () => {
    addDamageSegmentRow(segList, { useBase: false, modifier: 0, type: '' });
    scheduleLivePreview();
  });
  container.appendChild(segSection);

  // Save block
  const saveSection = makeElement('details', 'cfp-detail-section');
  saveSection.appendChild(makeElement('summary', '', 'Save (optional)'));
  const saveBody = makeElement('div', 'cfp-detail-section-body');
  const existingSave = ef.save ?? null;
  const saveAttrGroup = makeElement('div', 'cfp-field-group');
  const saveAttrLabel = makeElement('label', 'cfp-label', 'Save attribute');
  saveAttrLabel.setAttribute('for', 'admSaveAttr');
  const saveAttrSelect = makeElement('select');
  saveAttrSelect.id = 'admSaveAttr'; saveAttrSelect.className = 'cfp-select';
  const noneOpt = makeElement('option'); noneOpt.value = ''; noneOpt.textContent = 'None';
  saveAttrSelect.appendChild(noneOpt);
  SAVE_ATTRIBUTES.forEach((attr) => {
    const opt = makeElement('option'); opt.value = attr; opt.textContent = attr;
    if (existingSave?.attribute === attr) opt.selected = true;
    saveAttrSelect.appendChild(opt);
  });
  saveAttrGroup.appendChild(saveAttrLabel); saveAttrGroup.appendChild(saveAttrSelect);
  saveBody.appendChild(saveAttrGroup);
  addTextInput(saveBody, 'admSaveFailure', 'Failure effect', existingSave?.failure ?? '');
  addTextInput(saveBody, 'admSaveFailureEach5', 'Failure (each 5)', existingSave?.failureEach5 ?? '');
  addTextInput(saveBody, 'admSaveSuccess', 'Success effect', existingSave?.success ?? '');
  addTextInput(saveBody, 'admSaveSuccessEach5', 'Success (each 5)', existingSave?.successEach5 ?? '');

  const saveDurationGroup = makeElement('div', 'cfp-field-group');
  const saveDurationLabel = makeElement('label', 'cfp-label', 'Duration');
  saveDurationLabel.setAttribute('for', 'admSaveDuration');
  const saveDurationSelect = makeElement('select');
  saveDurationSelect.id = 'admSaveDuration'; saveDurationSelect.className = 'cfp-select';
  SAVE_DURATIONS.forEach(({ value, label }) => {
    const opt = makeElement('option'); opt.value = value; opt.textContent = label;
    if ((existingSave?.duration ?? '') === value) opt.selected = true;
    saveDurationSelect.appendChild(opt);
  });
  saveDurationGroup.appendChild(saveDurationLabel); saveDurationGroup.appendChild(saveDurationSelect);
  saveBody.appendChild(saveDurationGroup);

  const saveRepeatableGroup = makeElement('div', 'cfp-field-group cfp-checkbox-group');
  const saveRepeatableCheck = makeElement('input');
  saveRepeatableCheck.type = 'checkbox'; saveRepeatableCheck.id = 'admSaveRepeatable';
  saveRepeatableCheck.className = 'cfp-checkbox'; saveRepeatableCheck.checked = Boolean(existingSave?.repeatable);
  const saveRepeatableLabel = makeElement('label', 'cfp-label', 'Repeatable Save (at end of target\'s turn)');
  saveRepeatableLabel.setAttribute('for', 'admSaveRepeatable');
  saveRepeatableGroup.appendChild(saveRepeatableCheck); saveRepeatableGroup.appendChild(saveRepeatableLabel);
  saveBody.appendChild(saveRepeatableGroup);

  saveSection.appendChild(saveBody);
  container.appendChild(saveSection);

  // Check block
  const checkSection = makeElement('details', 'cfp-detail-section');
  checkSection.appendChild(makeElement('summary', '', 'Check (optional)'));
  const checkBody = makeElement('div', 'cfp-detail-section-body');
  const existingCheck = ef.check ?? null;
  addNumberInput(checkBody, 'admCheckDc', 'Check DC', existingCheck?.dc ?? 0);
  addTextInput(checkBody, 'admCheckFailure', 'Failure effect', existingCheck?.failure ?? '');
  addTextInput(checkBody, 'admCheckFailureEach5', 'Failure (each 5)', existingCheck?.failureEach5 ?? '');
  addTextInput(checkBody, 'admCheckSuccess', 'Success effect', existingCheck?.success ?? '');
  addTextInput(checkBody, 'admCheckSuccessEach5', 'Success (each 5)', existingCheck?.successEach5 ?? '');
  checkSection.appendChild(checkBody);
  container.appendChild(checkSection);

  // Enhancements section
  const enhSection = makeElement('details', 'cfp-detail-section');
  enhSection.appendChild(makeElement('summary', '', 'Enhancements (optional)'));
  const enhBody = makeElement('div', 'cfp-detail-section-body');
  const enhList = makeElement('div', 'adm-enhancement-list');
  enhBody.appendChild(enhList);

  const existingEnhancements = Array.isArray(ef.enhancements) ? ef.enhancements : [];
  existingEnhancements.forEach((enh) => addEnhancementRow(enhList, enh, scheduleLivePreview));

  const addEnhBtn = makeElement('button', 'cfp-add-segment-btn');
  addEnhBtn.type = 'button';
  addEnhBtn.textContent = '+ Add Enhancement';
  addEnhBtn.addEventListener('click', () => {
    addEnhancementRow(enhList, {}, scheduleLivePreview);
    scheduleLivePreview();
  });
  enhBody.appendChild(addEnhBtn);
  enhSection.appendChild(enhBody);
  container.appendChild(enhSection);
}

function renderTagsSection(container, existingTags) {
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const section = makeElement('div', 'cfp-tags-section');

  section.appendChild(makeElement('span', 'cfp-label', 'Role tags:'));
  const roleGrid = makeElement('div', 'cfp-checkbox-grid cfp-checkbox-grid--tags');
  ROLE_VALUES.forEach((role) => {
    const cbId = `admRole-${role}`;
    const cb = makeElement('input');
    cb.type = 'checkbox'; cb.id = cbId; cb.name = 'admRoleTags'; cb.value = role;
    cb.checked = existingTags.includes(`role/${role}`);
    const lbl = makeElement('label', 'cfp-checkbox-label');
    lbl.setAttribute('for', cbId); lbl.textContent = capitalize(role);
    roleGrid.appendChild(cb); roleGrid.appendChild(lbl);
  });
  section.appendChild(roleGrid);

  section.appendChild(makeElement('span', 'cfp-label', 'Creature type tags:'));
  const typeGrid = makeElement('div', 'cfp-checkbox-grid cfp-checkbox-grid--tags');
  CREATURE_TYPE_VALUES.forEach((type) => {
    const cbId = `admCtype-${type}`;
    const cb = makeElement('input');
    cb.type = 'checkbox'; cb.id = cbId; cb.name = 'admTypeTags'; cb.value = type;
    cb.checked = existingTags.includes(`creature/${type}`);
    const lbl = makeElement('label', 'cfp-checkbox-label');
    lbl.setAttribute('for', cbId); lbl.textContent = capitalize(type);
    typeGrid.appendChild(cb); typeGrid.appendChild(lbl);
  });
  section.appendChild(typeGrid);

  container.appendChild(section);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM element helpers (mirrors customFeatureBuilder.js)
// ─────────────────────────────────────────────────────────────────────────────

function makeElement(tag, className = '', textContent = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent) el.textContent = textContent;
  return el;
}

function addTextInput(parent, id, label, value = '') {
  const group = makeElement('div', 'cfp-field-group');
  const lbl = makeElement('label', 'cfp-label');
  lbl.textContent = label; lbl.setAttribute('for', id);
  const inp = makeElement('input');
  inp.type = 'text'; inp.id = id; inp.className = 'cfp-text-input'; inp.value = value;
  group.appendChild(lbl); group.appendChild(inp); parent.appendChild(group);
  return inp;
}

function addTextarea(parent, id, label, value = '') {
  const group = makeElement('div', 'cfp-field-group');
  const lbl = makeElement('label', 'cfp-label');
  lbl.textContent = label; lbl.setAttribute('for', id);
  const ta = makeElement('textarea');
  ta.id = id; ta.className = 'cfp-textarea'; ta.rows = 3; ta.value = value;
  group.appendChild(lbl); group.appendChild(ta); parent.appendChild(group);
  return ta;
}

function addNumberInput(parent, id, label, value = 0, { min, max, step = 1 } = {}) {
  const group = makeElement('div', 'cfp-field-group');
  const lbl = makeElement('label', 'cfp-label');
  lbl.textContent = label; lbl.setAttribute('for', id);
  const inp = makeElement('input');
  inp.type = 'number'; inp.id = id; inp.className = 'cfp-number-input';
  inp.value = String(value); inp.step = String(step);
  if (min !== undefined) inp.min = String(min);
  if (max !== undefined) inp.max = String(max);
  group.appendChild(lbl); group.appendChild(inp); parent.appendChild(group);
  return inp;
}

function addCheckbox(parent, id, label, checked = false) {
  const row = makeElement('div', 'cfp-checkbox-row');
  const cb = makeElement('input');
  cb.type = 'checkbox'; cb.id = id; cb.checked = checked;
  const lbl = makeElement('label', 'cfp-checkbox-label');
  lbl.setAttribute('for', id); lbl.textContent = label;
  row.appendChild(cb); row.appendChild(lbl); parent.appendChild(row);
  return cb;
}

function addDamageSegmentRow(list, seg = {}) {
  const row = makeElement('div', 'cfp-damage-row');

  const useBaseCb = makeElement('input');
  useBaseCb.type = 'checkbox'; useBaseCb.className = 'cfp-seg-usebase';
  useBaseCb.checked = Boolean(seg.useBase);
  row.appendChild(useBaseCb);
  row.appendChild(makeElement('label', '', 'Scale with level'));

  const modInput = makeElement('input');
  modInput.type = 'number'; modInput.className = 'cfp-seg-modifier'; modInput.step = '1';
  if (!seg.useBase && typeof seg.amount === 'number') {
    modInput.value = String(seg.amount);
    modInput.placeholder = 'Fixed amount';
  } else {
    modInput.value = typeof seg.modifier === 'number' ? String(seg.modifier) : '0';
    modInput.placeholder = 'Modifier (±)';
  }

  const typeSelect = makeElement('select');
  typeSelect.className = 'cfp-seg-type cfp-select';
  const emptyOpt = makeElement('option'); emptyOpt.value = ''; emptyOpt.textContent = '— damage type —';
  typeSelect.appendChild(emptyOpt);
  DAMAGE_TYPES.forEach((dtype) => {
    const opt = makeElement('option'); opt.value = dtype; opt.textContent = dtype;
    if (dtype === seg.type) opt.selected = true;
    typeSelect.appendChild(opt);
  });

  const removeBtn = makeElement('button', 'cfp-seg-remove');
  removeBtn.type = 'button'; removeBtn.textContent = '×'; removeBtn.title = 'Remove segment';
  removeBtn.addEventListener('click', () => { row.remove(); scheduleLivePreview(); });

  useBaseCb.addEventListener('change', () => {
    modInput.placeholder = useBaseCb.checked ? 'Modifier (±)' : 'Fixed amount';
  });

  row.appendChild(modInput); row.appendChild(typeSelect); row.appendChild(removeBtn);
  list.appendChild(row);
}

function addEnhancementRow(list, enh = {}, onChangeCb = () => {}) {
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
      addSegBtn.addEventListener('click', () => { addDamageSegmentRow(segList, {}); onChangeCb(); });
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
  typeSelect.addEventListener('change', () => { renderEnhTypeBody(typeSelect.value); onChangeCb(); });

  const removeBtn = makeElement('button', 'cfp-seg-remove');
  removeBtn.type = 'button'; removeBtn.textContent = '×'; removeBtn.title = 'Remove enhancement';
  removeBtn.addEventListener('click', () => { row.remove(); onChangeCb(); });
  row.appendChild(removeBtn);

  row.addEventListener('input', onChangeCb);
  row.addEventListener('change', onChangeCb);
  list.appendChild(row);
}

function readEnhancementsFromList(listEl) {
  if (!listEl) return [];
  const enhancements = [];
  listEl.querySelectorAll('.cfp-enhancement-row').forEach((row) => {
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
  return enhancements;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data extraction
// ─────────────────────────────────────────────────────────────────────────────

function readAdminFormData() {
  const formArea = $('adminFormArea');
  const get = (id) => formArea.querySelector(`#${id}`);
  const val = (id) => get(id)?.value?.trim() ?? '';
  const num = (id) => parseFloat(get(id)?.value) || 0;
  const checked = (id) => Boolean(get(id)?.checked);
  const radio = (name) => formArea.querySelector(`input[name="${name}"]:checked`)?.value ?? '';

  const rawId = val('admId');
  const name = val('admName');
  const id = rawId || slugify(name);
  const featureCost = num('admCost');
  const featureDescription = val('admFeatureDescription');
  const category = radio('admFeatureType') || 'passive';

  const tags = [];
  formArea.querySelectorAll('input[name="admRoleTags"]:checked').forEach((cb) => tags.push(`role/${cb.value}`));
  formArea.querySelectorAll('input[name="admTypeTags"]:checked').forEach((cb) => tags.push(`creature/${cb.value}`));

  if (category === 'passive') {
    return { id, name, featureCost, featureDescription, type: 'passive', tags,
      effects: { text: val('admPassiveText') } };
  }

  if (category === 'modifier') {
    const hp = num('admModHp'), pd = num('admModPd'), ad = num('admModAd');
    const speed = num('admModSpeed'), damage = num('admModDamage');

    const collectChecked = (fieldName) => {
      const vals = [];
      formArea.querySelectorAll(`input[name="${fieldName}"]:checked`).forEach((cb) => {
        if (cb.dataset.category === 'damage') vals.push(cb.value);
      });
      return vals;
    };

    const effects = { text: val('admModifierDescription') };
    if (hp !== 0) effects.hp = hp;
    if (pd !== 0) effects.pd = pd;
    if (ad !== 0) effects.ad = ad;
    if (speed !== 0) effects.speed = speed;
    if (damage !== 0) effects.damage = damage;

    const res = collectChecked('admResistances');
    if (res.length) effects.resistances = { damage: res, condition: [] };
    const imm = collectChecked('admImmunities');
    if (imm.length) effects.immunities = { damage: imm, condition: [] };
    const vuln = collectChecked('admVulnerabilities');
    if (vuln.length) effects.vulnerabilities = { damage: vuln, condition: [] };

    return { id, name, featureCost, featureDescription, type: 'modifier', tags, effects };
  }

  // action
  const isReaction = checked('admIsReaction');
  const actionKind = radio('admActionKind') || 'Martial';
  const targetDefense = radio('admTargetDefense');
  const actionType = targetDefense !== 'none' ? `${actionKind} Attack` : `${actionKind} Utility`;
  const cost = num('admActionCost');

  const damageSegments = [];
  formArea.querySelectorAll('.cfp-damage-list:not(.cfp-enh-damage-list) .cfp-damage-row').forEach((row) => {
    const useBase = row.querySelector('.cfp-seg-usebase')?.checked ?? false;
    const modValue = parseFloat(row.querySelector('.cfp-seg-modifier')?.value) || 0;
    const segType = row.querySelector('.cfp-seg-type')?.value ?? '';
    if (useBase) {
      damageSegments.push({ useBase: true, modifier: modValue, type: segType });
    } else {
      damageSegments.push({ amount: modValue, type: segType });
    }
  });

  const saveAttr = val('admSaveAttr');
  const saveFailure = val('admSaveFailure');
  const saveSuccess = val('admSaveSuccess');
  const hasSave = saveAttr || saveFailure || saveSuccess;
  const save = hasSave ? {
    attribute: saveAttr,
    failure: saveFailure,
    failureEach5: val('admSaveFailureEach5'),
    success: saveSuccess,
    successEach5: val('admSaveSuccessEach5'),
    duration: val('admSaveDuration'),
    repeatable: formArea.querySelector('#admSaveRepeatable')?.checked ?? false,
  } : null;

  const checkDc = num('admCheckDc');
  const checkFailure = val('admCheckFailure');
  const checkSuccess = val('admCheckSuccess');
  const hasCheck = checkDc || checkFailure || checkSuccess;
  const check = hasCheck ? {
    dc: checkDc,
    failure: checkFailure,
    failureEach5: val('admCheckFailureEach5'),
    success: checkSuccess,
    successEach5: val('admCheckSuccessEach5'),
  } : null;

  const enhancements = readEnhancementsFromList(formArea.querySelector('.adm-enhancement-list'));

  const effects = {
    actionType, cost, isReaction,
    isLegendaryAction: checked('admIsLegendary'),
    isApexAction: checked('admIsApex'),
    reactionTrigger: isReaction ? val('admTrigger') : '',
    target: val('admTarget'),
    range: val('admRange'),
    actionDescription: val('admActionDescription'),
    targetDefense: targetDefense !== 'none' ? targetDefense : '',
    damageSegments,
  };
  if (save) effects.save = save;
  if (check) effects.check = check;
  if (enhancements.length) effects.enhancements = enhancements;

  return {
    id, name, featureCost, featureDescription, type: 'action', tags,
    isReaction,
    isLegendaryAction: checked('admIsLegendary'),
    isApexAction: checked('admIsApex'),
    reactionTrigger: isReaction ? val('admTrigger') : '',
    effects,
  };
}

function slugify(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Live preview
// ─────────────────────────────────────────────────────────────────────────────

function scheduleLivePreview() {
  clearTimeout(livePreviewTimer);
  livePreviewTimer = setTimeout(updatePreview, 400);
}

function updatePreview() {
  const previewArea = $('adminPreviewArea');
  if (!previewArea) return;

  let feature;
  try { feature = readAdminFormData(); } catch { return; }

  previewArea.innerHTML = '';
  const type = String(feature.type ?? '').toLowerCase();

  if (type === 'passive') {
    const card = makeElement('div', 'admin-preview-passive');
    card.appendChild(makeElement('strong', '', feature.name || '(unnamed)'));
    if (feature.effects?.text) {
      const p = makeElement('p', '', feature.effects.text);
      card.appendChild(p);
    }
    previewArea.appendChild(card);
    return;
  }

  if (type === 'modifier') {
    const card = makeElement('div', 'admin-preview-modifier');
    card.appendChild(makeElement('strong', '', feature.name || '(unnamed)'));
    const ef = feature.effects ?? {};
    const stats = [
      ['HP', ef.hp], ['PD', ef.pd], ['AD', ef.ad], ['Speed', ef.speed], ['Damage', ef.damage],
    ].filter(([, v]) => v != null && v !== 0);
    if (stats.length) {
      const dl = document.createElement('dl');
      stats.forEach(([label, value]) => {
        const dt = makeElement('dt', '', label);
        const dd = makeElement('dd', '', value > 0 ? `+${value}` : String(value));
        dl.appendChild(dt); dl.appendChild(dd);
      });
      card.appendChild(dl);
    }
    if (ef.text) card.appendChild(makeElement('p', '', ef.text));
    previewArea.appendChild(card);
    return;
  }

  // action
  try {
    const action = buildAction(PREVIEW_CREATURE, feature);
    if (!action) { previewArea.textContent = 'Could not build action preview.'; return; }
    previewArea.appendChild(createActionCardElement(
      action, action.saveDC ?? PREVIEW_CREATURE.saveDC, PREVIEW_CREATURE.damage,
      { showTrigger: Boolean(action.isReaction) }
    ));
  } catch (err) {
    previewArea.textContent = `Preview error: ${err.message}`;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Firestore operations
// ─────────────────────────────────────────────────────────────────────────────

async function handleSave() {
  let feature;
  try { feature = readAdminFormData(); } catch (err) {
    alert(`Could not read form: ${err.message}`); return;
  }
  if (!feature.name) { alert('Feature name is required.'); return; }
  if (!feature.id) { alert('Feature ID is required.'); return; }

  try {
    await setDoc(doc(db, 'VanillaFeatures', feature.id), feature);
    alert(`Saved "${feature.name}" to library.`);
    selectedFeatureId = feature.id;
    await loadLibraryFeatures();
    renderFeatureList(filterFeatures($('featureSearch').value));
  } catch (err) {
    console.error('Save failed:', err);
    alert(`Save failed: ${err.message}`);
  }
}

async function handleDeleteLibrary(feature) {
  if (!confirm(`Delete "${feature.name ?? feature.id}" from the library?\nThis cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, 'VanillaFeatures', feature.id));
    alert('Deleted from library.');
    selectedFeatureId = null;
    clearMainPanel();
    await loadLibraryFeatures();
  } catch (err) {
    console.error('Delete failed:', err);
    alert(`Delete failed: ${err.message}`);
  }
}

async function handlePromote(communityFeature) {
  let feature;
  try { feature = readAdminFormData(); } catch (err) {
    alert(`Could not read form: ${err.message}`); return;
  }
  const clean = stripCommunityFields(feature);
  if (!clean.name) { alert('Feature name is required.'); return; }
  if (!clean.id) { alert('Feature ID is required.'); return; }

  if (!confirm(`Promote "${clean.name}" to the library as ID "${clean.id}"?\nThis overwrites any existing library feature with that ID.`)) return;

  try {
    await setDoc(doc(db, 'VanillaFeatures', clean.id), clean);
    await updateDoc(doc(db, 'VanillaUsermadeFeatures', communityFeature.id), {
      promotedAt: serverTimestamp(),
    });
    alert(`Promoted "${clean.name}" to library.`);
    await loadCommunityFeatures();
  } catch (err) {
    console.error('Promote failed:', err);
    alert(`Promote failed: ${err.message}`);
  }
}

async function handleDeleteCommunity(feature) {
  if (!confirm(`Delete community feature "${feature.name ?? feature.id}"?\nThis cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, 'VanillaUsermadeFeatures', feature.id));
    alert('Deleted community feature.');
    selectedFeatureId = null;
    clearMainPanel();
    await loadCommunityFeatures();
  } catch (err) {
    console.error('Delete failed:', err);
    alert(`Delete failed: ${err.message}`);
  }
}

function stripCommunityFields(feature) {
  const clean = { ...feature };
  for (const key of ['createdBy', 'creatorName', 'createdAt', 'isPublic', 'totalLikes',
                     'savedAt', 'isOwned', 'sourceFeatureId', 'promotedAt', 'isCustom']) {
    delete clean[key];
  }
  return clean;
}

const STORAGE_KEY = 'dc20-creature-editor';
const sessionStore = (() => {
  try {
    return window.sessionStorage;
  } catch (error) {
    console.warn('Session storage is unavailable.', error);
    return null;
  }
})();
const localStore = (() => {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('Local storage is unavailable.', error);
    return null;
  }
})();

function safeGetItem(storage, key) {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (error) {
    return null;
  }
}

function safeSetItem(storage, key, value) {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function safeRemoveItem(storage, key) {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch (error) {
    // ignore cleanup failures
  }
}

function loadStoredCreatureDraft() {
  const raw =
    safeGetItem(sessionStore, STORAGE_KEY) ?? safeGetItem(localStore, STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('Stored creature draft could not be parsed.', error);
    return null;
  }
}

function persistCreatureDraft(payload) {
  if (!payload) return false;

  try {
    const serialized = JSON.stringify(payload);
    if (safeSetItem(sessionStore, STORAGE_KEY, serialized)) {
      if (localStore && localStore !== sessionStore) {
        safeRemoveItem(localStore, STORAGE_KEY);
      }
      return true;
    }

    if (safeSetItem(localStore, STORAGE_KEY, serialized)) {
      return true;
    }
  } catch (error) {
    console.error('Failed to persist creature draft.', error);
    return false;
  }

  console.error('Unable to access web storage for creature drafts.');
  return false;
}
const ATTRIBUTE_KEYS = ['Mig', 'Agi', 'Cha', 'Int'];
const CORE_NUMERIC_FIELDS = [
  { key: 'HP', label: 'HP' },
  { key: 'PD', label: 'PD' },
  { key: 'AD', label: 'AD' },
  { key: 'damage', label: 'Damage' },
  { key: 'check', label: 'Attack Bonus' },
  { key: 'saveDC', label: 'Save DC' },
  { key: 'AP', label: 'Action Points' },
  { key: 'speed', label: 'Speed' },
];

const baseInfoContainer = document.querySelector('#baseInfo');
const coreStatsContainer = document.querySelector('#coreStats');
const attributeValueList = document.querySelector('#attributeValueList');
const attributeList = document.querySelector('#attributeList');
const statusMessage = document.querySelector('#statusMessage');
const saveButton = document.querySelector('#btnSave');
const backButton = document.querySelector('#btnBack');

let draft = null;
let baseline = null;
let workingDeltas = {};
let workingAttributeOrder = ATTRIBUTE_KEYS.slice();
let baselineAttributes = {};
let baselineRankValues = [];
let workingRankValues = [];
let rankValueDeltas = {};
let currentAttributeTotals = {};

function recomputeRankDeltas() {
  const updated = {};
  workingRankValues.forEach((value, index) => {
    const base = baselineRankValues[index] ?? 0;
    const diff = value - base;
    if (Math.abs(diff) > 1e-9) {
      updated[index] = diff;
    }
  });
  rankValueDeltas = updated;
}

function enforceRankOrdering() {
  const combined = workingRankValues.map((value, index) => ({
    value,
    attribute: workingAttributeOrder[index] ?? ATTRIBUTE_KEYS[index],
    originalOrder: index,
  }));

  combined.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.originalOrder - b.originalOrder;
  });

  workingRankValues = combined.map((entry) => entry.value);
  workingAttributeOrder = normalizeAttributeOrder(combined.map((entry) => entry.attribute));
  updateAttributeAssignments();
  recomputeRankDeltas();
}

function showStatus(message, tone = 'info') {
  if (!statusMessage) return;
  statusMessage.style.display = 'block';
  statusMessage.textContent = message;
  statusMessage.style.background =
    tone === 'error' ? 'rgba(255, 70, 70, 0.18)' : 'rgba(70, 255, 180, 0.16)';
  statusMessage.style.border =
    tone === 'error' ? '1px solid rgba(255, 86, 86, 0.35)' : '1px solid rgba(70, 255, 200, 0.35)';
}

function clearStatus() {
  if (!statusMessage) return;
  statusMessage.style.display = 'none';
  statusMessage.textContent = '';
}

function normalizeAttributeOrder(order) {
  const normalized = [];
  if (Array.isArray(order)) {
    order.forEach((attribute) => {
      if (ATTRIBUTE_KEYS.includes(attribute) && !normalized.includes(attribute)) {
        normalized.push(attribute);
      }
    });
  }

  ATTRIBUTE_KEYS.forEach((attribute) => {
    if (!normalized.includes(attribute)) {
      normalized.push(attribute);
    }
  });

  return normalized;
}

function normalizeRankDeltas(raw) {
  const normalized = {};
  if (Array.isArray(raw)) {
    raw.forEach((value, index) => {
      const numeric = Number(value);
      if (!Number.isNaN(numeric) && Math.abs(numeric) > 1e-9) {
        normalized[index] = numeric;
      }
    });
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([key, value]) => {
      const index = Number(key);
      const numeric = Number(value);
      if (!Number.isNaN(index) && !Number.isNaN(numeric) && Math.abs(numeric) > 1e-9) {
        normalized[index] = numeric;
      }
    });
  }
  return normalized;
}

function convertAttributeDeltasToRankDeltas(attributeDeltas) {
  if (!attributeDeltas || typeof attributeDeltas !== 'object') return baselineRankValues.slice();

  const totalsByAttribute = {};
  ATTRIBUTE_KEYS.forEach((attribute) => {
    const base = baselineAttributes[attribute] ?? 0;
    const delta = Number(attributeDeltas[attribute] ?? 0);
    totalsByAttribute[attribute] = base + (Number.isNaN(delta) ? 0 : delta);
  });

  const totalsByRank = workingAttributeOrder.map((attribute) => totalsByAttribute[attribute] ?? (baselineAttributes[attribute] ?? 0));
  return totalsByRank;
}

function updateAttributeAssignments() {
  currentAttributeTotals = {};
  workingAttributeOrder.forEach((attribute, index) => {
    const assigned = workingRankValues[index] ?? workingRankValues[workingRankValues.length - 1] ?? 0;
    currentAttributeTotals[attribute] = assigned;
  });
}

function initializeRankData() {
  baselineRankValues = ATTRIBUTE_KEYS
    .map((attribute) => baselineAttributes[attribute] ?? 0)
    .sort((a, b) => b - a);
  while (baselineRankValues.length < ATTRIBUTE_KEYS.length) {
    baselineRankValues.push(0);
  }

  const storedRankDeltas = normalizeRankDeltas(draft.rankValueDeltas);
  rankValueDeltas = { ...storedRankDeltas };

  Object.keys(rankValueDeltas).forEach((key) => {
    if (Number(key) >= ATTRIBUTE_KEYS.length) {
      delete rankValueDeltas[key];
    }
  });

  if (!Object.keys(rankValueDeltas).length && draft.deltas?.attributes) {
    workingRankValues = convertAttributeDeltasToRankDeltas(draft.deltas.attributes);
  } else {
    workingRankValues = baselineRankValues.map((value, index) => value + (rankValueDeltas[index] ?? 0));
  }

  while (workingRankValues.length < ATTRIBUTE_KEYS.length) {
    workingRankValues.push(workingRankValues[workingRankValues.length - 1] ?? 0);
  }

  enforceRankOrdering();
}

function loadDraft() {
  try {
    const stored = loadStoredCreatureDraft();
    if (!stored) {
      showStatus('No creature draft found. Launch the builder and click “Edit Creature” first.', 'error');
      disableEditing();
      return;
    }

    draft = stored || null;

    if (!draft || !draft.base || !draft.baseline) {
      showStatus('Draft data is missing required sections. Please re-export from the builder.', 'error');
      disableEditing();
      return;
    }

    baseline = draft.baseline;
    workingDeltas = { ...(draft.deltas || {}) };
    baselineAttributes = { ...(baseline.attributes || {}) };
    workingAttributeOrder = normalizeAttributeOrder(
      Array.isArray(draft.attributePriority) ? draft.attributePriority : baseline.attributePriority
    );

    initializeRankData();
    delete workingDeltas.attributes;
    renderBaseInfo();
    renderCoreStatEditors();
    renderAttributeValues();
    renderAttributeEditor();
    clearStatus();
  } catch (error) {
    console.error('Failed to load creature draft', error);
    showStatus('Something went wrong while loading the draft. Check the console for details.', 'error');
    disableEditing();
  }
}

function disableEditing() {
  if (saveButton) saveButton.disabled = true;
}

function renderBaseInfo() {
  if (!baseInfoContainer || !draft) return;
  baseInfoContainer.innerHTML = '';
  const entries = [
    ['Name', draft.base?.name ?? '—'],
    ['Level', draft.base?.level ?? '—'],
    ['Role', draft.base?.role ?? '—'],
    ['Power', draft.base?.power ?? '—'],
    ['Size', draft.base?.size ?? '—'],
    ['Type', draft.base?.type ?? '—'],
  ];

  entries.forEach(([label, value]) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel-field';
    wrapper.innerHTML = `<strong>${label}</strong><div class="baseline">${value}</div>`;
    baseInfoContainer.appendChild(wrapper);
  });
}

function renderCoreStatEditors() {
  if (!coreStatsContainer || !baseline) return;
  coreStatsContainer.innerHTML = '';

  CORE_NUMERIC_FIELDS.forEach(({ key, label }) => {
    const baselineValue = baseline[key] ?? 0;
    const deltaValue = Number(workingDeltas[key] ?? 0);
    const totalValue = baselineValue + deltaValue;

    const row = document.createElement('div');
    row.className = 'field-row';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;

    const baselineEl = document.createElement('div');
    baselineEl.className = 'baseline';
    baselineEl.dataset.base = String(baselineValue);
    baselineEl.innerHTML = `
      <div>Base ${baselineValue}</div>
      <div class="delta-preview">Total <span data-total>${totalValue}</span></div>
    `;

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.value = deltaValue || '';
    input.dataset.fieldKey = key;
    input.addEventListener('input', handleNumericDeltaChange);

    row.append(labelEl, baselineEl, input);

    coreStatsContainer.appendChild(row);
  });
}

function renderAttributeValues() {
  if (!attributeValueList) return;
  attributeValueList.innerHTML = '';

  workingRankValues.forEach((value, index) => {
    const base = baselineRankValues[index] ?? 0;
    const delta = rankValueDeltas[index] ?? 0;
    const row = document.createElement('div');
    row.className = 'attribute-value-row';

    const label = document.createElement('div');
    const assignedAttribute = workingAttributeOrder[index] || '—';
    label.innerHTML = `<strong>Rank ${index + 1} → ${assignedAttribute}</strong><div class="baseline">Base ${base}${delta ? ` · diff ${delta > 0 ? '+' : ''}${delta}` : ''}</div>`;

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.value = value;
    input.dataset.rank = String(index);
    input.addEventListener('input', handleRankValueChange);

    row.append(label, input);
    attributeValueList.appendChild(row);
  });
}

function renderAttributeEditor() {
  if (!attributeList || !baseline) return;
  attributeList.innerHTML = '';

  workingAttributeOrder.forEach((attribute, index) => {
    const baselineScore = baselineAttributes?.[attribute] ?? 0;
    const total = currentAttributeTotals[attribute] ?? baselineScore;
    const deltaValue = total - baselineScore;

    const item = document.createElement('div');
    item.className = 'attribute-item';

    const info = document.createElement('div');
    info.className = 'attribute-item-info';
    const title = document.createElement('strong');
    title.textContent = attribute;
    const assigned = document.createElement('div');
    assigned.className = 'assigned';
    assigned.textContent = `Assigned ${total} (Base ${baselineScore}${deltaValue ? `, diff ${deltaValue > 0 ? '+' : ''}${deltaValue}` : ''})`;
    info.append(title, assigned);

    const controls = document.createElement('div');
    controls.className = 'attr-controls';

    const upButton = document.createElement('button');
    upButton.className = 'chip-button';
    upButton.textContent = 'Move Up';
    upButton.disabled = index === 0;
    upButton.addEventListener('click', () => moveAttribute(index, index - 1));

    const downButton = document.createElement('button');
    downButton.className = 'chip-button';
    downButton.textContent = 'Move Down';
    downButton.disabled = index === workingAttributeOrder.length - 1;
    downButton.addEventListener('click', () => moveAttribute(index, index + 1));

    controls.append(upButton, downButton);

    item.append(info, controls);
    attributeList.appendChild(item);
  });
}

function moveAttribute(from, to) {
  if (to < 0 || to >= workingAttributeOrder.length) return;
  const updated = [...workingAttributeOrder];
  const [moved] = updated.splice(from, 1);
  updated.splice(to, 0, moved);
  workingAttributeOrder = normalizeAttributeOrder(updated);
  updateAttributeAssignments();
  recomputeRankDeltas();
  renderAttributeValues();
  renderAttributeEditor();
}

function handleNumericDeltaChange(event) {
  const target = event.currentTarget;
  const field = target.dataset.fieldKey;
  if (!field) return;

  const raw = target.value;
  if (raw === '') {
    delete workingDeltas[field];
  } else {
    workingDeltas[field] = Number(raw);
  }

  const row = target.closest('.field-row');
  if (!row) return;
  const baselineEl = row.querySelector('.baseline');
  const totalEl = baselineEl?.querySelector('[data-total]');
  if (!baselineEl || !totalEl) return;

  const baselineValue = Number(baselineEl.dataset.base ?? 0);
  const numericDelta = Number(raw || 0);
  totalEl.textContent = String(baselineValue + numericDelta);
}

function handleRankValueChange(event) {
  const target = event.currentTarget;
  const index = Number(target.dataset.rank);
  if (Number.isNaN(index)) return;

  const numericValue = Number(target.value || 0);
  workingRankValues[index] = numericValue;
  enforceRankOrdering();
  renderAttributeValues();
  renderAttributeEditor();
}

function handleSave() {
  if (!draft) return;

  const sanitized = sanitizeDeltas();
  const cleanedRankDeltas = {};
  Object.entries(rankValueDeltas).forEach(([key, value]) => {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && Math.abs(numeric) > 1e-9) {
      cleanedRankDeltas[key] = numeric;
    }
  });

  const payload = {
    ...draft,
    deltas: sanitized,
    attributePriority: workingAttributeOrder.slice(),
    rankValueDeltas: cleanedRankDeltas,
    updatedAt: new Date().toISOString(),
  };

  if (persistCreatureDraft(payload)) {
    showStatus('Creature deltas saved. Return to the builder to see the updates.', 'success');
  } else {
    showStatus('Unable to save deltas because web storage is unavailable.', 'error');
  }
}

function sanitizeDeltas() {
  const output = {};

  Object.entries(workingDeltas).forEach(([key, value]) => {
    if (key === 'attributes') return;
    if (value === '' || Number.isNaN(Number(value))) return;
    const numeric = Number(value);
    if (numeric !== 0) {
      output[key] = numeric;
    }
  });

  return output;
}

function handleBack() {
  window.location.href = 'index.html';
}

function init() {
  backButton?.addEventListener('click', handleBack);
  saveButton?.addEventListener('click', handleSave);
  loadDraft();
}

document.addEventListener('DOMContentLoaded', init);

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { baseLevelStatsData, powerScalingFactors, roleModifiersData, attributeScoresByLevel, sizeScalingFactors, SkillAttribute } from './Rules/gameRules.js'
import { loadFeatures, applyFeatureEffects, FEATURE_TYPES, getFeatureSummary } from './features.js'

const nameInput = document.querySelector('#creatureName');
const levelInput = document.querySelector('#creatureLevel');
const shortDescriptionInput = document.querySelector('#creatureShortDescription');
const longDescriptionInput = document.querySelector('#creatureLongDescription');

const statblockName = document.querySelector('#statblockName');
const statblockInfo = document.querySelector('#statblockInfo');
const statblockShortDescription = document.querySelector('#statblockShortDescription');
const statblockLongDescription = document.querySelector('#statblockLongDescription');
// HP
const statblockHP = document.querySelector('#statblockHP');
// Defenses
const statblockPD = document.querySelector("#statblockPD");
const statblockAD = document.querySelector("#statblockAD");
// Attributes
const statblockMIG = document.querySelector('#statblockMIG');
const statblockAGI = document.querySelector('#statblockAGI');
const statblockCHA = document.querySelector('#statblockCHA');
const statblockINT = document.querySelector('#statblockINT');
// Saves
const statblockMIGSave = document.querySelector('#statblockMIGSave');
const statblockAGISave = document.querySelector('#statblockAGISave');
const statblockCHASave = document.querySelector('#statblockCHASave');
const statblockINTSave = document.querySelector('#statblockINTSave');
// Traits
const statblockResistances = document.querySelector('#statblockResistances');
const statblockVulnerabilities = document.querySelector('#statblockVulnerabilities');
const statblockImmunities = document.querySelector('#statblockImmunities');
const statblockSkills = document.querySelector('#statblockSkills');
const statblockSenses = document.querySelector('#statblockSenses');
const statblockFeatures = document.querySelector('#statblockFeatures');
const statblockActionsHeading = document.querySelector('#statblockActionsHeading');
const statblockActionsInfo = document.querySelector('#statblockActionsInfo');
const statblockActionsList = document.querySelector('#statblockActions');
// Inputs
const inputsContainer = document.querySelector('#creatureInputs');
const featureControls = document.querySelector('#featureControls');
const featureSearchInput = document.querySelector('#featureSearch');
const editCreatureButton = document.querySelector('#editCreatureButton');
const saveToFirebaseButton = document.querySelector('#saveToFirebaseButton');
const saveStatus = document.querySelector('#saveStatus');
const logoutButton = document.querySelector('#logoutButton');
const resetInputsButton = document.querySelector('#resetInputsButton');
const recommendationsPanel = document.querySelector('#recomendationsPanel');

const featureState = {
  byId: {},
  allIds: [],
  filteredIds: [],
  searchTerm: '',
  selectedIds: [],
}

const urlParams = new URLSearchParams(window.location.search);
const requestedCreatureId = urlParams.get('creatureId');
const hasRequestedCreature = Boolean(requestedCreatureId);

let featuresLoaded = false;
let pendingLoadedCreature = null;

const TITLE_FALLBACK = 'Creature Name';
const CREATURE_EDITOR_STORAGE_KEY = 'dc20-creature-editor';
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
    safeGetItem(sessionStore, CREATURE_EDITOR_STORAGE_KEY) ??
    safeGetItem(localStore, CREATURE_EDITOR_STORAGE_KEY);
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
    if (safeSetItem(sessionStore, CREATURE_EDITOR_STORAGE_KEY, serialized)) {
      if (localStore && localStore !== sessionStore) {
        safeRemoveItem(localStore, CREATURE_EDITOR_STORAGE_KEY);
      }
      return true;
    }

    if (safeSetItem(localStore, CREATURE_EDITOR_STORAGE_KEY, serialized)) {
      return true;
    }
  } catch (error) {
    console.error('Failed to persist creature draft.', error);
    return false;
  }

  console.error('Unable to access web storage for creature drafts.');
  return false;
}

const CREATURE_FIRESTORE_ENDPOINT = 'https://firestore.googleapis.com/v1/projects/dc20-creature-creator/databases/(default)/documents/VanillaCreatures';
const FIRESTORE_API_KEY = 'AIzaSyCgdyE834tp64B2flcR9VUzbIvXwPdwQ-k';
const FIREBASE_CONFIG = {
  apiKey: FIRESTORE_API_KEY,
  authDomain: 'dc20-creature-creator.firebaseapp.com',
  projectId: 'dc20-creature-creator',
  storageBucket: 'dc20-creature-creator.firebasestorage.app',
  messagingSenderId: '638039342508',
  appId: '1:638039342508:web:a80d7ddaecdab47b1b8e09',
  measurementId: 'G-2BEL1FHFPP',
};

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
let currentUser = null;

const creature = {
  name: "",
  level: 1,
  attributes: {Mig: 0, Agi: 0, Cha: 0, Int: 0},
  attributeSaves: {Mig: 0, Agi: 0, Cha: 0, Int: 0},
  attributePriority: [],
  PD: 10,
  AD: 10,
  check: 4,
  damage: 1,
  AP: 4,
  speed: 5,
  MP: 0,
  resistances: { damage: [], condition: [] },
  vulnerabilities: { damage: [], condition: [] },
  immunities: { damage: [], condition: [] },
  senses: [],
  featureActions: [],
  featurePassives: [],
  skills: [],
  selectedFeatures: [],
  deltas: {},
  shortDescription: '',
  longDescription: '',
}

//---- TRAIT CONSTANTS ----
const DAMAGE_TYPES = [
  'Bludgeoning',
  'Piercing',
  'Slashing',
  'Cold',
  'Corrosion',
  'Fire',
  'Lightning',
  'Poison',
  'Sonic',
  'Psychic',
  'Radiant',
  'Umbral'
];

const CONDITION_TYPES = [
  'Bleeding',
  'Blinded',
  'Burning',
  'Charmed',
  'Dazed',
  'Deafened',
  'Disoriented',
  'Doomed',
  'Exhaustion',
  'Exposed',
  'Frightened',
  'Hindered',
  'Immobilized',
  'Impaired',
  'Incapacitated',
  'Intimidated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Restrained',
  'Slowed',
  'Stunned',
  'Surprised',
  'Taunted',
  'Terrified',
  'Tethered',
  'Unconscious',
  'Weakened'
];

const ATTRIBUTE_KEYS = ['Mig', 'Agi', 'Cha', 'Int'];
const NUMERIC_DELTA_FIELDS = ['HP', 'PD', 'AD', 'damage', 'check', 'saveDC', 'AP', 'speed'];

//---- UTILITY HELPERS ----
// Formats a string so it displays with an initial capital letter.
function toTitleCase(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Returns the currently selected radio value for a given input group.
function getSelectedRadioValue(groupName) {
  const checked = document.querySelector(`input[name="${groupName}"]:checked`);
  return checked ? checked.value : null;
}

function normalizeAttributeKey(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return ATTRIBUTE_KEYS.find((attribute) => attribute.toLowerCase() === normalized) ?? null;
}

function normalizeAttributePriority(candidate, fallback) {
  const resolved = [];
  const attemptOrder = Array.isArray(candidate) ? candidate : [];
  const fallbackOrder = Array.isArray(fallback) ? fallback : ATTRIBUTE_KEYS;

  const enqueue = (attribute) => {
    const normalized = normalizeAttributeKey(attribute);
    if (normalized && !resolved.includes(normalized)) {
      resolved.push(normalized);
    }
  };

  attemptOrder.forEach(enqueue);
  fallbackOrder.forEach(enqueue);
  return resolved;
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeRankValueDeltas(raw) {
  const normalized = {};
  if (!raw || typeof raw !== 'object') return normalized;

  Object.entries(raw).forEach(([key, value]) => {
    const index = Number(key);
    const numeric = Number(value);
    if (!Number.isNaN(index) && index >= 0 && Number.isFinite(numeric) && Math.abs(numeric) > 1e-9) {
      normalized[index] = numeric;
    }
  });
  return normalized;
}

function normalizeAttributeValueDeltas(raw) {
  const normalized = {};
  if (!raw || typeof raw !== 'object') return normalized;

  ATTRIBUTE_KEYS.forEach((attribute) => {
    const numeric = Number(raw[attribute]);
    if (Number.isFinite(numeric) && Math.abs(numeric) > 1e-9) {
      normalized[attribute] = numeric;
    }
  });
  return normalized;
}

function setRadioGroupValue(groupName, rawValue) {
  if (rawValue === undefined || rawValue === null) return;
  const value = String(rawValue);
  const directMatch = document.querySelector(`input[name="${groupName}"][value="${value}"]`);
  if (directMatch) {
    directMatch.checked = true;
    return;
  }

  const fallbackMatch = Array.from(document.querySelectorAll(`input[name="${groupName}"]`)).find(
    (input) => String(input.value).toLowerCase() === value.toLowerCase()
  );
  if (fallbackMatch) {
    fallbackMatch.checked = true;
  }
}

function encodeFirestoreValue(value) {
  if (value === undefined) return null;
  if (value === null) return { nullValue: null };
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (Array.isArray(value)) {
    const values = value
      .map((entry) => encodeFirestoreValue(entry))
      .filter(Boolean);
    return { arrayValue: { values } };
  }

  const type = typeof value;
  if (type === 'string') {
    return { stringValue: value };
  }
  if (type === 'number') {
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value)
      ? { integerValue: value.toString() }
      : { doubleValue: value };
  }
  if (type === 'boolean') {
    return { booleanValue: value };
  }
  if (type === 'object') {
    const fields = {};
    Object.entries(value).forEach(([key, entry]) => {
      const encoded = encodeFirestoreValue(entry);
      if (encoded) {
        fields[key] = encoded;
      }
    });
    return { mapValue: { fields } };
  }
  return null;
}

function encodeFirestoreDocument(data) {
  const fields = {};
  Object.entries(data).forEach(([key, value]) => {
    const encoded = encodeFirestoreValue(value);
    if (encoded) {
      fields[key] = encoded;
    }
  });
  return { fields };
}

function decodeFirestoreValue(value) {
  if (value === null || value === undefined) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('mapValue' in value && value.mapValue.fields) return decodeFirestoreFields(value.mapValue.fields);
  if ('arrayValue' in value) {
    const entries = value.arrayValue.values || [];
    return entries.map((entry) => decodeFirestoreValue(entry));
  }
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  return value;
}

function decodeFirestoreFields(fields) {
  const result = {};
  if (!fields || typeof fields !== 'object') return result;
  Object.entries(fields).forEach(([key, value]) => {
    result[key] = decodeFirestoreValue(value);
  });
  return result;
}

function decodeFirestoreDocument(doc) {
  if (!doc) return null;
  if (doc.fields) {
    return decodeFirestoreFields(doc.fields);
  }
  if (doc.document && doc.document.fields) {
    return decodeFirestoreFields(doc.document.fields);
  }
  return null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function buildCreatureDocumentId(name, ownerId) {
  const baseSlug = slugify(name) || `creature-${Date.now()}`;
  if (!ownerId) return baseSlug;
  const safeOwner = ownerId.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'owner';
  return `${safeOwner}-${baseSlug}`;
}

function setSaveStatus(message, tone = 'info', options = {}) {
  if (!saveStatus) return;

  if (!message) {
    saveStatus.textContent = '';
    saveStatus.removeAttribute('data-tone');
    delete saveStatus.dataset.sticky;
    return;
  }

  const { sticky = false } = options;
  saveStatus.textContent = message;
  saveStatus.dataset.tone = tone;
  if (sticky) {
    saveStatus.dataset.sticky = 'true';
  } else {
    delete saveStatus.dataset.sticky;
  }
}

function updateSavePromptForAuth(user) {
  if (!saveStatus) return;
  if (saveStatus.dataset.sticky === 'true' && user) return;

  if (user) {
    const label = user.displayName || user.email || 'your account';
    setSaveStatus(`Signed in as ${label}.`, 'success', { sticky: false });
  } else {
    setSaveStatus('Sign in to save your creature to Firebase.', 'info', { sticky: false });
  }
}

function updateSaveButtonState(user) {
  if (!saveToFirebaseButton) return;
  const shouldDisable = !user;
  saveToFirebaseButton.disabled = shouldDisable;
  if (shouldDisable) {
    saveToFirebaseButton.title = 'Sign in to enable saving to Firebase.';
  } else {
    saveToFirebaseButton.removeAttribute('title');
  }
}

function resetBuilderToDefaults() {
  safeRemoveItem(sessionStore, CREATURE_EDITOR_STORAGE_KEY);
  safeRemoveItem(localStore, CREATURE_EDITOR_STORAGE_KEY);
  pendingLoadedCreature = null;

  if (window.history && window.history.replaceState) {
    const { pathname, hash } = window.location;
    window.history.replaceState(null, '', `${pathname}${hash || ''}`);
  }

  if (nameInput) nameInput.value = '';
  if (levelInput) levelInput.value = '1';
  if (shortDescriptionInput) shortDescriptionInput.value = '';
  if (longDescriptionInput) longDescriptionInput.value = '';

  const defaultRadios = {
    size: 'medium',
    type: 'humanoid',
    power: 'normal',
    role: 'none',
  };

  Object.entries(defaultRadios).forEach(([group, value]) => {
    const input = document.querySelector(`input[name="${group}"][value="${value}"]`);
    if (input) input.checked = true;
  });

  document.querySelectorAll('#creatureInputs input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = false;
  });

  if (featureSearchInput) featureSearchInput.value = '';
  featureState.searchTerm = '';
  featureState.selectedIds = [];
  featureState.filteredIds = featureState.allIds.length ? [...featureState.allIds] : [];

  Object.assign(creature, {
    name: '',
    level: 1,
    attributes: { Mig: 0, Agi: 0, Cha: 0, Int: 0 },
    attributeSaves: { Mig: 0, Agi: 0, Cha: 0, Int: 0 },
    attributePriority: [],
    PD: 10,
    AD: 10,
    check: 4,
    damage: 1,
    AP: 4,
    speed: 5,
    MP: 0,
    resistances: { damage: [], condition: [] },
    vulnerabilities: { damage: [], condition: [] },
    immunities: { damage: [], condition: [] },
    senses: [],
    featureActions: [],
    featurePassives: [],
    skills: [],
    selectedFeatures: [],
    deltas: {},
    shortDescription: '',
    longDescription: '',
  });

  if (featuresLoaded) {
    renderFeatureControls();
  }

  updateStatblock();
  setSaveStatus('Inputs reset. Start fresh!', 'success', { sticky: false });
}

updateSaveButtonState(null);
updateSavePromptForAuth(null);

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateSaveButtonState(user);
  updateSavePromptForAuth(user);
});

function buildBaseProfile() {
  return {
    name: creature.name,
    level: creature.level,
    role: creature.role,
    power: creature.power,
    size: creature.size,
    type: creature.type,
    shortDescription: creature.shortDescription,
    longDescription: creature.longDescription,
    selectedFeatures: [...featureState.selectedIds],
  };
}

function buildBaselineSnapshot() {
  const attributes = {};
  const attributeSaves = {};

  ATTRIBUTE_KEYS.forEach((attribute) => {
    attributes[attribute] = creature.attributes[attribute];
    attributeSaves[attribute] = creature.attributeSaves[attribute];
  });

  return {
    attributes,
    attributeSaves,
    attributePriority: [...creature.attributePriority],
    HP: creature.HP,
    PD: creature.PD,
    AD: creature.AD,
    damage: creature.damage,
    check: creature.check,
    saveDC: creature.saveDC,
    AP: creature.AP,
    speed: creature.speed,
  };
}

function cloneCurrentDeltas() {
  if (!creature.deltas || typeof creature.deltas !== 'object') {
    return {};
  }

  const copy = {};

  Object.entries(creature.deltas).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      copy[key] = [...value];
      return;
    }

    if (typeof value === 'object') {
      copy[key] = { ...value };
      return;
    }

    copy[key] = value;
  });

  return copy;
}

function buildCreatureSavePayload() {
  const baseProfile = buildBaseProfile();
  const baselineSnapshot = buildBaselineSnapshot();
  const deltasSnapshot = cloneCurrentDeltas();
  const traits = {
    resistances: {
      damage: Array.isArray(creature.resistances?.damage) ? [...creature.resistances.damage] : [],
      condition: Array.isArray(creature.resistances?.condition) ? [...creature.resistances.condition] : [],
    },
    vulnerabilities: {
      damage: Array.isArray(creature.vulnerabilities?.damage) ? [...creature.vulnerabilities.damage] : [],
      condition: Array.isArray(creature.vulnerabilities?.condition) ? [...creature.vulnerabilities.condition] : [],
    },
    immunities: {
      damage: Array.isArray(creature.immunities?.damage) ? [...creature.immunities.damage] : [],
      condition: Array.isArray(creature.immunities?.condition) ? [...creature.immunities.condition] : [],
    },
    senses: Array.isArray(creature.senses) ? [...creature.senses] : [],
    skills: Array.isArray(creature.skills) ? [...creature.skills] : [],
  };

  const featureActions = Array.isArray(creature.featureActions)
    ? creature.featureActions.map((action) => ({ ...action }))
    : [];
  const featurePassives = Array.isArray(creature.featurePassives)
    ? creature.featurePassives.map((passive) => ({ ...passive }))
    : [];
  const ownerInfo = currentUser
    ? {
        id: currentUser.uid,
        displayName: currentUser.displayName ?? '',
        email: currentUser.email ?? '',
      }
    : null;

  return {
    name: creature.name || baseProfile.name || '',
    level: creature.level,
    role: creature.role,
    power: creature.power,
    size: creature.size,
    type: creature.type,
    shortDescription: creature.shortDescription,
    longDescription: creature.longDescription,
    ownerId: ownerInfo?.id ?? null,
    owner: ownerInfo,
    stats: {
      HP: creature.HP,
      PD: creature.PD,
      AD: creature.AD,
      check: creature.check,
      saveDC: creature.saveDC,
      AP: creature.AP,
      speed: creature.speed,
      CM: creature.CM,
      damage: creature.damage,
    },
    attributes: {
      values: { ...creature.attributes },
      saves: { ...creature.attributeSaves },
      priority: [...creature.attributePriority],
      primeAttribute: creature.primeAttribute,
    },
    traits,
    featureActions,
    featurePassives,
    selectedFeatures: [...creature.selectedFeatures],
    deltas: deltasSnapshot,
    base: baseProfile,
    baseline: baselineSnapshot,
    savedAt: new Date().toISOString(),
  };
}

function applyDraftToBuilder(draft) {
  if (!draft || typeof draft !== 'object') return;

  const base = draft.base && typeof draft.base === 'object' ? draft.base : {};

  if (nameInput && typeof base.name === 'string') {
    nameInput.value = base.name;
  }

  if (levelInput) {
    const numericLevel = Number(base.level);
    if (!Number.isNaN(numericLevel) && numericLevel >= 0) {
      levelInput.value = String(numericLevel);
    }
  }

  if (shortDescriptionInput) {
    shortDescriptionInput.value = typeof base.shortDescription === 'string' ? base.shortDescription : '';
  }

  if (longDescriptionInput) {
    longDescriptionInput.value = typeof base.longDescription === 'string' ? base.longDescription : '';
  }

  setRadioGroupValue('size', base.size);
  setRadioGroupValue('type', base.type);
  setRadioGroupValue('power', base.power);
  setRadioGroupValue('role', base.role);

  const storedFeatures = Array.isArray(draft.features) ? draft.features : [];
  const fallbackFeatures = Array.isArray(base.selectedFeatures) ? base.selectedFeatures : [];
  const featureIds = storedFeatures.length ? storedFeatures : fallbackFeatures;
  featureState.selectedIds = Array.from(
    new Set(
      featureIds
        .filter((id) => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );
  if (featuresLoaded) {
    ensureSelectedFeatureDependencies();
  }

  const attributePriority =
    Array.isArray(draft.attributePriority) && draft.attributePriority.length
      ? draft.attributePriority
      : Array.isArray(draft.baseline?.attributePriority)
        ? draft.baseline.attributePriority
        : null;

  const mergedDeltas =
    draft.deltas && typeof draft.deltas === 'object' ? { ...draft.deltas } : {};
  const normalizedPriority = Array.isArray(attributePriority) && attributePriority.length
    ? normalizeAttributePriority(attributePriority, ATTRIBUTE_KEYS)
    : null;

  const baseRole = typeof base.role === 'string' && base.role ? base.role : 'none';
  const defaultPriority = normalizeAttributePriority(
    roleModifiersData[baseRole]?.AttributePriority || ATTRIBUTE_KEYS,
    ATTRIBUTE_KEYS
  );

  const isCustomPriority =
    normalizedPriority &&
    normalizedPriority.length === defaultPriority.length &&
    !arraysEqual(normalizedPriority, defaultPriority);

  if (isCustomPriority) {
    mergedDeltas.attributePriority = normalizedPriority.slice();
    mergedDeltas.attributePriorityCustom = true;
  } else {
    delete mergedDeltas.attributePriority;
    delete mergedDeltas.attributePriorityCustom;
  }

  const normalizedRankDeltas = normalizeRankValueDeltas(draft.rankValueDeltas || mergedDeltas.rankValueDeltas);
  if (Object.keys(normalizedRankDeltas).length) {
    mergedDeltas.rankValueDeltas = normalizedRankDeltas;
  } else {
    delete mergedDeltas.rankValueDeltas;
  }

  creature.deltas = mergedDeltas;
}

const restoredDraft = hasRequestedCreature ? null : loadStoredCreatureDraft();
if (restoredDraft) {
  applyDraftToBuilder(restoredDraft);
}

function sanitizeTraitGroup(group) {
  return {
    damage: Array.isArray(group?.damage) ? [...group.damage] : [],
    condition: Array.isArray(group?.condition) ? [...group.condition] : [],
  };
}

function applySavedCreatureToBuilder(saved) {
  if (!saved || typeof saved !== 'object') return;
  if (!featuresLoaded) {
    pendingLoadedCreature = saved;
    return;
  }

  applyDraftToBuilder(saved);

  const traits = saved.traits && typeof saved.traits === 'object' ? saved.traits : {};
  creature.resistances = sanitizeTraitGroup(traits.resistances);
  creature.vulnerabilities = sanitizeTraitGroup(traits.vulnerabilities);
  creature.immunities = sanitizeTraitGroup(traits.immunities);

  syncTraitCheckboxes('resistances', creature.resistances);
  syncTraitCheckboxes('vulnerabilities', creature.vulnerabilities);
  syncTraitCheckboxes('immunities', creature.immunities);

  if (!featureState.filteredIds.length && featureState.allIds.length) {
    featureState.filteredIds = [...featureState.allIds];
  }

  ensureSelectedFeatureDependencies();

  renderFeatureControls();
  updateStatblock();

  const loadedName = saved.name || saved.base?.name || '';
  if (loadedName) {
    setSaveStatus(`Loaded ${loadedName}.`, 'success', { sticky: false });
  } else {
    setSaveStatus('Loaded saved creature.', 'success', { sticky: false });
  }
}

async function fetchCreatureById(documentId) {
  if (!documentId) return null;
  const trimmedId = documentId.trim();
  if (!trimmedId) return null;

  const documentUrl = `${CREATURE_FIRESTORE_ENDPOINT}/${encodeURIComponent(trimmedId)}?key=${FIRESTORE_API_KEY}`;
  const response = await fetch(documentUrl);
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore fetch failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const data = decodeFirestoreDocument(payload);
  if (!data) return null;

  return {
    id: payload.name ? payload.name.split('/').pop() : trimmedId,
    ...data,
  };
}

function maybeApplyPendingCreature() {
  if (!featuresLoaded || !pendingLoadedCreature) return;
  const saved = pendingLoadedCreature;
  pendingLoadedCreature = null;
  applySavedCreatureToBuilder(saved);
}

async function loadCreatureById(documentId) {
  if (!documentId) return;
  try {
    setSaveStatus('Loading saved creature…', 'info', { sticky: false });
    const saved = await fetchCreatureById(documentId);
    if (!saved) {
      setSaveStatus('Could not find that creature.', 'error', { sticky: true });
      return;
    }
    pendingLoadedCreature = saved;
    maybeApplyPendingCreature();
  } catch (error) {
    console.error('Failed to load creature from Firestore', error);
    setSaveStatus('Failed to load the selected creature. Try again later.', 'error', { sticky: true });
  }
}

function exportCreatureDraft() {
  updateStatblock();

  const payload = {
    base: buildBaseProfile(),
    baseline: buildBaselineSnapshot(),
    deltas: cloneCurrentDeltas(),
    attributePriority: [...creature.attributePriority],
    features: [...creature.selectedFeatures],
    savedAt: new Date().toISOString(),
  };

  const saved = persistCreatureDraft(payload);
  if (!saved) {
    console.error('Failed to store creature draft for the editor.');
    alert('Unable to open the editor because the creature data could not be saved locally.');
    return;
  }

  window.location.href = 'editCreature.html';
}

//---- TRAIT HELPERS ----
// Builds the expandable trait pickers for resistances, vulnerabilities, and immunities.
function setupTraitPickers() {
  const traitSources = {
    resistances: { damage: DAMAGE_TYPES, condition: CONDITION_TYPES },
    vulnerabilities: { damage: DAMAGE_TYPES, condition: CONDITION_TYPES },
    immunities: { damage: DAMAGE_TYPES, condition: CONDITION_TYPES }
  };

  document.querySelectorAll('.trait-picker').forEach((picker) => {
    const trait = picker.dataset.trait;
    const sources = traitSources[trait];
    if (!sources) return;

    Object.entries(sources).forEach(([category, labels]) => {
      const container = picker.querySelector(`.trait-picker-options[data-category="${category}"]`);
      if (!container) return;
      container.innerHTML = '';

      labels.forEach((label) => {
        const optionId = `${trait}-${category}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        container.insertAdjacentHTML('beforeend', `
          <input type="checkbox" id="${optionId}" name="${trait}" value="${label}" data-label="${label}" data-category="${category}">
          <label class="option-tile" for="${optionId}">${label}</label>
        `);
      });
    });

    const button = picker.querySelector('.trait-picker-toggle');
    const content = picker.querySelector('.trait-picker-content');
    if (button && content) {
      button.setAttribute('aria-expanded', 'false');
      content.setAttribute('aria-hidden', 'true');
      button.addEventListener('click', () => {
        const isOpen = picker.classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(isOpen));
        content.setAttribute('aria-hidden', String(!isOpen));
      });
    }
  });
}

// Collects the checked options for a trait group into damage/condition arrays.
function collectTraitGroup(trait) {
  const collected = { damage: [], condition: [] };

  document.querySelectorAll(`#creatureInputs input[name="${trait}"]:checked`).forEach((input) => {
    const category = input.dataset.category;
    if (category !== 'damage' && category !== 'condition') return;

    const label = input.dataset.label || input.value;
    if (!label) return;

    if (!collected[category].includes(label)) {
      collected[category].push(label);
    }
  });

  return collected;
}

// Renders a trait group (resistance/vulnerability/immunity) into the stat block.
function renderTraitGroup(container, group) {
  container.innerHTML = '';
  const row = container.closest('.statblock-trait-row');
  const addSpan = (text) => {
    const span = document.createElement('span');
    span.textContent = text;
    container.appendChild(span);
  };

  const hasDamage = group.damage.length > 0;
  const hasCondition = group.condition.length > 0;

  if (!hasDamage && !hasCondition) {
    if (row) row.style.display = 'none';
    return;
  }

  if (row) row.style.display = '';
  group.damage.forEach(addSpan);
  if (hasDamage && hasCondition) {
    const separator = document.createElement('span');
    separator.className = 'trait-separator';
    separator.textContent = '|';
    container.appendChild(separator);
  }
  group.condition.forEach(addSpan);
}

// Displays a simple list (senses, etc.) or hides the row when empty.
function renderSimpleList(container, values) {
  container.innerHTML = '';
  const row = container.closest('.statblock-trait-row');
  const entries = values && values.length ? values : ['None'];
  const validEntries = entries.filter((value) => value && value !== 'None');

  if (!validEntries.length) {
    if (row) row.style.display = 'none';
    return;
  }

  if (row) row.style.display = '';
  validEntries.forEach((value) => {
    const span = document.createElement('span');
    span.textContent = value;
    container.appendChild(span);
  });
}

// Shows creature skills plus their computed modifiers in the stat block.
function renderSkillList(container, values){
  container.innerHTML = '';
  const row = container.closest('.statblock-trait-row');
  const entries = values && values.length ? values : ['None'];
  const validEntries = entries.filter((value) => value && value !== 'None');

  if (!validEntries.length){
    if (row) row.style.display = 'none';
    return;
  }

  if (row) row.style.display = '';
  validEntries.forEach((value) => {
    const span = document.createElement('span'); 
    const attributeKey = SkillAttribute[value.toLowerCase()];
    if(attributeKey){
      const base = creature.attributes[attributeKey] ?? 0;
      const scaling = 2 * Math.ceil(creature.level / 5);
      span.textContent = `${value} (+${base + scaling})`;
    } else {
      span.textContent = value;
    }
    container.appendChild(span);
  });
}

// Lists passive and modifier features currently affecting the creature.
function renderFeatureSummary(){
  if(!statblockFeatures) return;

  statblockFeatures.innerHTML = '';
  const section = statblockFeatures.closest('.statblock-feature-section');

  const uniqueFeatures = new Map();

  if (Array.isArray(creature.featurePassives)) {
    creature.featurePassives.forEach((feature) => {
      if (feature && feature.id && !uniqueFeatures.has(feature.id)) {
        uniqueFeatures.set(feature.id, feature);
      }
    });
  }

  featureState.selectedIds.forEach((id) => {
    const feature = featureState.byId[id];
    if (feature && feature.type === FEATURE_TYPES.MODIFIER && !uniqueFeatures.has(feature.id)) {
      uniqueFeatures.set(feature.id, feature);
    }
  });

  const items = Array.from(uniqueFeatures.values());

  if(!items.length){
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = '';
  items.forEach((feature) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'statblock-feature-item';

    const name = document.createElement('div');
    name.className = 'feature-name';
    name.textContent = feature.name;

    const description = document.createElement('div');
    description.className = 'feature-description';
    const summary = getFeatureSummary(feature);
    description.textContent = summary || 'No description provided.';

    wrapper.append(name, description);
    statblockFeatures.appendChild(wrapper);
  });
}

// Filters and ranks features based on search input (names/tags weighted highest).
function applyFeatureSearch(rawTerm) {
  const term = rawTerm.trim().toLowerCase();
  featureState.searchTerm = term;

  if (!term) {
    featureState.filteredIds = [...featureState.allIds];
    renderFeatureControls();
    return;
  }

  const terms = term.split(/\s+/).filter(Boolean);
  const results = [];

  featureState.allIds.forEach((id) => {
    const feature = featureState.byId[id];
    if (!feature) return;
    const name = (feature.name || '').toLowerCase();
    const description = getFeatureSummary(feature).toLowerCase();
    const tags = Array.isArray(feature.tags) ? feature.tags.map((tag) => tag.toLowerCase()) : [];
    const type = (feature.type || '').toLowerCase();
    const actionNarrative = feature.effects?.actionDescription
      ? String(feature.effects.actionDescription).toLowerCase()
      : '';
    const effectsText = feature.effects ? JSON.stringify(feature.effects).toLowerCase() : '';

    let totalScore = 0;

    for (const keyword of terms) {
      let termScore = 0;
      if (name.includes(keyword)) termScore = Math.max(termScore, 6);
      if (tags.some((tag) => tag.includes(keyword))) termScore = Math.max(termScore, 5);
      if (type.includes(keyword)) termScore = Math.max(termScore, 3);
      if (description.includes(keyword)) termScore = Math.max(termScore, 2);
      if (actionNarrative.includes(keyword)) termScore = Math.max(termScore, 2);
      if (effectsText.includes(keyword)) termScore = Math.max(termScore, 1);

      if (termScore === 0) {
        return;
      }

      totalScore += termScore;
    }

    results.push({ id, score: totalScore });
  });

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const nameA = (featureState.byId[a.id]?.name || '').toLowerCase();
    const nameB = (featureState.byId[b.id]?.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  featureState.filteredIds = results.map((entry) => entry.id);
  renderFeatureControls();
}

// Prints the action header info and any feature-granted actions.
function renderActionSummary(){
  if (!statblockActionsHeading || !statblockActionsInfo || !statblockActionsList) return;

  // Header stats
  const ap = Number.isFinite(creature.AP) ? creature.AP : 0;
  statblockActionsHeading.textContent = `Actions (${ap})`;

  const infoItems = [
    { label: 'Attack', value: `+${creature.check ?? 0}` },
    { label: 'Save DC', value: creature.saveDC ?? 0 },
    { label: 'Speed', value: creature.speed ?? 0 },
  ];

  statblockActionsInfo.innerHTML = '';
  infoItems.forEach(({ label, value }) => {
    const span = document.createElement('span');
    span.textContent = `${label}: ${value}`;
    statblockActionsInfo.appendChild(span);
  });

  // Actions list
  statblockActionsList.innerHTML = '';

  if (!Array.isArray(creature.featureActions) || creature.featureActions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'statblock-action-item';
    empty.textContent = 'No actions available.';
    statblockActionsList.appendChild(empty);
    return;
  }

  creature.featureActions.forEach((action) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'statblock-action-item';

    // Header line
    const header = document.createElement('div');
    header.className = 'action-header';
    const title = document.createElement('strong');
    appendField(title, action.name, 'name');
    appendText(title, ' (');
    appendField(title, action.cost ?? 0, 'cost');
    appendText(title, ' AP):');
    header.appendChild(title);

    const actionTypeLabel = String(action.actionType || '').toLowerCase();
    const isUtilityAction = actionTypeLabel.includes('utility') && !actionTypeLabel.includes('check');

    if (isUtilityAction) {
      wrapper.appendChild(header);
      if (action.description) {
        const description = document.createElement('div');
        description.className = 'action-description';
        description.textContent = action.description;
        wrapper.appendChild(description);
      }
      statblockActionsList.appendChild(wrapper);
      return;
    }

    const summary = document.createElement('div');
    summary.className = 'action-summary';

    // Attack vs Defense line with damage
    const attackLine = document.createElement('div');
    appendField(attackLine, action.actionType || 'Action', 'actionType');

    if (action.targetDefense) {
      appendText(attackLine, ' vs ');
      appendField(attackLine, action.targetDefense, 'targetDefense');
    }

    if (action.check && action.check.dc != null) {
      appendText(attackLine, action.targetDefense ? ' • DC ' : ' DC ');
      appendBoldField(attackLine, action.check.dc, 'checkDc');
    }

    appendText(attackLine, '.');

    const segments = Array.isArray(action.damage) ? action.damage : [];
    if (segments.length) {
      appendText(attackLine, ' ');
      segments.forEach((segment, index) => {
        if (index > 0) appendText(attackLine, ' + ');
        appendBoldField(attackLine, segment.amount ?? 0, 'damageAmount');
        if (segment.type) {
          appendText(attackLine, ' ');
          appendBoldField(attackLine, segment.type, 'damageType');
        }
      });
      appendText(attackLine, ' damage');
    }
    summary.appendChild(attackLine);

    // Target line
    if (action.target || action.range) {
      const targetLine = document.createElement('div');
      appendText(targetLine, 'Target ');
      appendField(targetLine, action.target || 'target', 'target');
      if (action.range) {
        appendText(targetLine, ' within ');
        appendField(targetLine, action.range, 'range');
      }
      appendText(targetLine, '.');
      summary.appendChild(targetLine);
    }

    // Save line
    if (action.save) {
      if (action.save.attribute) {
        const saveLine = document.createElement('div');
        appendField(saveLine, action.save.attribute, 'saveAttribute');
        appendText(saveLine, ' Save, DC: ');
        appendBoldField(saveLine, creature.saveDC ?? 0, 'saveDC');
        appendText(saveLine, '.');
        summary.appendChild(saveLine);
      }

      if (action.save.failure) {
        const failureLine = document.createElement('div');
        appendText(failureLine, 'Failure: ');
        appendField(failureLine, action.save.failure, 'saveFailure');
        summary.appendChild(failureLine);
      }

      if (action.save.failureEach5) {
        const failureEachLine = document.createElement('div');
        appendText(failureEachLine, 'Failure (Each 5): ');
        appendField(failureEachLine, action.save.failureEach5, 'saveFailureEach5');
        summary.appendChild(failureEachLine);
      }

      if (action.save.success) {
        const successLine = document.createElement('div');
        appendText(successLine, 'Success: ');
        appendField(successLine, action.save.success, 'saveSuccess');
        summary.appendChild(successLine);
      }

      if (action.save.successEach5) {
        const successEachLine = document.createElement('div');
        appendText(successEachLine, 'Success (Each 5): ');
        appendField(successEachLine, action.save.successEach5, 'saveSuccessEach5');
        summary.appendChild(successEachLine);
      }
    }

    if (action.check) {
      if (action.check.failure) {
        const checkFailure = document.createElement('div');
        appendText(checkFailure, 'Failure: ');
        appendField(checkFailure, action.check.failure, 'checkFailure');
        summary.appendChild(checkFailure);
      }

      if (action.check.failureEach5) {
        const checkFailureEach = document.createElement('div');
        appendText(checkFailureEach, 'Failure (Each 5): ');
        appendField(checkFailureEach, action.check.failureEach5, 'checkFailureEach5');
        summary.appendChild(checkFailureEach);
      }

      if (action.check.success) {
        const checkSuccess = document.createElement('div');
        appendText(checkSuccess, 'Success: ');
        appendField(checkSuccess, action.check.success, 'checkSuccess');
        summary.appendChild(checkSuccess);
      }

      if (action.check.successEach5) {
        const checkSuccessEach = document.createElement('div');
        appendText(checkSuccessEach, 'Success (Each 5): ');
        appendField(checkSuccessEach, action.check.successEach5, 'checkSuccessEach5');
        summary.appendChild(checkSuccessEach);
      }
    }

    wrapper.appendChild(header);
    if (summary.childNodes.length) {
      wrapper.appendChild(summary);
    }

    if (action.description) {
      const description = document.createElement('div');
      description.className = 'action-description';
      description.textContent = action.description;
      wrapper.appendChild(description);
    }

    statblockActionsList.appendChild(wrapper);
  });
}
//---- RECOMMENDATIONS PANEL ----
function clampPercent(value){
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function computePlayerHitChanceVs(defense){
  // As provided: (20 - (defense / creature.AD) + 3 + floor(level/5) + ceil(level/2)) * 5
  const level = Number(creature.level) || 0;
  const denominator = Number(creature.AD) || 1; // avoid divide-by-zero
  const baseline = 3 + Math.floor(level/5) + Math.ceil(level/2);
  const raw = (20 - Number(defense) + baseline) * 5;
  return clampPercent(raw);
}

function renderRecommendations(){
  if (!recommendationsPanel) return;
  // LOL
  const level = Number(creature.level) || 0;
  const chanceVsPD = computePlayerHitChanceVs(creature.PD);
  const chanceVsPDHeavy = computePlayerHitChanceVs(creature.PD+5);
  const chanceVsPDBrutal = computePlayerHitChanceVs(creature.PD+10);
  const chanceVsAD = computePlayerHitChanceVs(creature.AD);
  const chanceVsADHeavy = computePlayerHitChanceVs(creature.AD+5);
  const chanceVsADBrutal = computePlayerHitChanceVs(creature.AD+10);

  const expectedPlayerDPT = Math.ceil((level + 4) );
  const damageDealtByPlayerAgainstThisMonster = (expectedPlayerDPT+2)*chanceVsPDBrutal/100 + (expectedPlayerDPT+1)*(chanceVsPDHeavy-chanceVsPDBrutal)/100 + (expectedPlayerDPT)*(chanceVsPD-chanceVsPDHeavy)/100 ;
  const turnsToKill = expectedPlayerDPT > 0 ? (Number(creature.HP) / damageDealtByPlayerAgainstThisMonster) : Infinity;
  const expectedDamageDealt = Math.ceil((Number(creature.damage) || 0) * 1.5 * (Number.isFinite(turnsToKill) ? turnsToKill : 0));

  const lines = [
    { label: 'To Hit chance vs PD: ', value: `${chanceVsPD}%` },
    { label: ' - Hit: ', value: `${chanceVsPD-chanceVsPDHeavy}%`},
    { label: ' - Heavy: ', value: `${chanceVsPDHeavy-chanceVsPDBrutal}%`},
    { label: ' - Brutal: ', value: `${chanceVsPDBrutal}%`},

    { label: 'Hit chance vs AD: ', value: `${chanceVsAD}%` },
    { label: ' - Hit: ', value: `${chanceVsAD-chanceVsADHeavy}%`},
    { label: ' - Heavy: ', value: `${chanceVsADHeavy-chanceVsADBrutal}%`},
    { label: ' - Brutal: ', value: `${chanceVsADBrutal}%`},

    { label: 'Avg. turns to defeat: ', value: `${Number.isFinite(turnsToKill) ? turnsToKill.toFixed(1) : '—'}` },
    { label: 'Avg. damage before death: ', value: `${expectedDamageDealt}` },
  ];

  const warnings = [];
  // 1) Low hit chance warning (<45%)
  if (chanceVsPD < 45 || chanceVsAD < 45){
    warnings.push(`Low player hit chance: PD ${chanceVsPD}%, AD ${chanceVsAD}%.`);
  }

  // 2) Too many turns to kill (>4)
  if (Number.isFinite(turnsToKill) && turnsToKill > 4){
    warnings.push(`High durability: ~${turnsToKill.toFixed(1)} turns to defeat.`);
  }

  // 3) May kill a player check against baseline
  const baseKillThreshold = Math.ceil(6 + 1.5 * level);
  let multiplier = 1;
  const power = String(creature.power || '').toLowerCase();
  if (power === 'apex') multiplier = 2;
  else if (power === 'legendary') multiplier = 4;

  if (expectedDamageDealt > (multiplier * baseKillThreshold)){
    const note = (multiplier === 1) ? '' : ` (adjusted for ${power})`;
    warnings.push(`High lethality: ${expectedDamageDealt} > ${multiplier * baseKillThreshold}${note}.`);
  }

  // Render panel
  const wrapper = document.createElement('div');
  wrapper.className = 'recommendations-content';

  const list = document.createElement('div');
  list.className = 'recommendations-list';
  lines.forEach(({label, value}) => {
    const row = document.createElement('div');
    row.className = 'recommendations-row';
    const l = document.createElement('span');
    l.className = 'recommendations-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'recommendations-value';
    v.textContent = value;
    row.append(l, v);
    list.appendChild(row);
  });
  wrapper.appendChild(list);

  const warningsBox = document.createElement('div');
  warningsBox.className = 'recommendations-warnings';
  if (warnings.length){
    const title = document.createElement('div');
    title.className = 'warnings-title';
    title.textContent = 'Warnings';
    warningsBox.appendChild(title);

    warnings.forEach((w) => {
      const item = document.createElement('div');
      item.className = 'warning-item';
      item.textContent = w;
      warningsBox.appendChild(item);
    });
  }

  recommendationsPanel.innerHTML = '<h2>Recomendations</h2>';
  recommendationsPanel.appendChild(wrapper);
  if (warnings.length){
    recommendationsPanel.appendChild(warningsBox);
  }
}

// Appends a span tagged with the source field for later editing hooks.
function appendField(parent, value, field) {
  if (value === undefined || value === null || value === '') return;
  const span = document.createElement('span');
  span.className = 'action-span';
  span.dataset.field = field;
  span.textContent = value;
  parent.appendChild(span);
}

// Appends a bold span for emphasis while keeping field metadata.
function appendBoldField(parent, value, field) {
  if (value === undefined || value === null || value === '') return;
  const strong = document.createElement('strong');
  appendField(strong, value, field);
  parent.appendChild(strong);
}

// Appends plain text/HTML snippets into the statblock output.
function appendText(parent, html) {
  if (html === undefined || html === null || html === '') return;
  const span = document.createElement('span');
  span.innerHTML = html;
  parent.appendChild(span);
}

// Syncs checkbox UI state to match trait values coming from features.
function syncTraitCheckboxes(trait, group) {
  const damageValues = (group && Array.isArray(group.damage)) ? group.damage : [];
  const conditionValues = (group && Array.isArray(group.condition)) ? group.condition : [];

  document.querySelectorAll(`#creatureInputs input[name="${trait}"]`).forEach((checkbox) => {
    const category = checkbox.dataset.category;
    const label = checkbox.dataset.label || checkbox.value;
    if (!category || !label) return;

    const isChecked = category === 'damage'
      ? damageValues.includes(label)
      : category === 'condition'
        ? conditionValues.includes(label)
        : false;

    checkbox.checked = isChecked;
  });
}

// Draws the grouped feature cards and wires up selection toggles.
function renderFeatureControls(){
  if(!featureControls) return;
  featureControls.innerHTML = '';

  const ids = featureState.filteredIds && featureState.filteredIds.length
    ? featureState.filteredIds
    : Object.keys(featureState.byId);
  if(ids.length === 0){
    featureControls.textContent = 'No features available.';
    return;
  }

  const createFeatureCard = (feature) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'feature-card';
    card.dataset.featureId = feature.id;
    if (featureState.selectedIds.includes(feature.id)) {
      card.classList.add('selected');
    }

    const name = document.createElement('div');
    name.className = 'feature-card-name';
    name.textContent = feature.name;

    const desc = document.createElement('div');
    desc.className = 'feature-card-description';
    const cardSummary = getFeatureSummary(feature);
    desc.textContent = cardSummary || 'No description available.';

    card.append(name, desc);

    card.addEventListener('click', () => {
      const isSelected = featureState.selectedIds.includes(feature.id);
      toggleFeatureSelection(feature.id, !isSelected);
      renderFeatureControls();
    });

    return card;
  };

  const actionBuckets = {
    martialAttacks: [],
    martialChecks: [],
    spellAttacks: [],
    spellChecks: [],
    utilityActions: [],
  };

  const classifyActionFeature = (feature) => {
    const actionTypeLabel = String(feature?.effects?.actionType || feature?.actionType || '').toLowerCase();

    if (actionTypeLabel.includes('martial') && actionTypeLabel.includes('attack')) return 'martialAttacks';
    if (actionTypeLabel.includes('martial') && actionTypeLabel.includes('check')) return 'martialChecks';
    if (actionTypeLabel.includes('spell') && actionTypeLabel.includes('attack')) return 'spellAttacks';
    if (actionTypeLabel.includes('spell') && actionTypeLabel.includes('check')) return 'spellChecks';
    if (actionTypeLabel.includes('utility')) return 'utilityActions';
    return 'utilityActions';
  };

  const otherGroups = new Map();

  ids.forEach((id) => {
    const feature = featureState.byId[id];
    if (!feature) return;
    const type = (feature.type || 'misc').toLowerCase();
    if (type.startsWith('action')) {
      const bucketKey = classifyActionFeature(feature);
      actionBuckets[bucketKey].push(feature);
      return;
    }

    if (!otherGroups.has(type)) otherGroups.set(type, []);
    otherGroups.get(type).push(feature);
  });

  const hasActionFeatures = Object.values(actionBuckets).some((entries) => entries.length);
  if (hasActionFeatures) {
    const actionsWrapper = document.createElement('section');
    actionsWrapper.className = 'feature-group';

    const actionsHeading = document.createElement('h1');
    actionsHeading.className = 'feature-group-title';
    actionsHeading.textContent = 'Actions';
    actionsWrapper.appendChild(actionsHeading);

    const sections = [
      {
        title: 'Martial',
        buckets: [
          { key: 'martialAttacks', title: 'Martial Attacks' },
          { key: 'martialChecks', title: 'Martial Checks' },
        ],
      },
      {
        title: 'Spell',
        buckets: [
          { key: 'spellAttacks', title: 'Spell Attacks' },
          { key: 'spellChecks', title: 'Spell Checks' },
        ],
      },
      {
        title: 'Utility Actions',
        buckets: [{ key: 'utilityActions', title: 'Utility Actions' }],
      },
    ];

    sections.forEach((section) => {
      const activeBuckets = section.buckets.filter(({ key }) => actionBuckets[key]?.length);
      if (activeBuckets.length === 0) return;

      const sectionHeading = document.createElement('h2');
      sectionHeading.className = 'feature-group-subtitle';
      sectionHeading.textContent = section.title;
      actionsWrapper.appendChild(sectionHeading);

      const showBucketHeading = activeBuckets.length > 1;
      activeBuckets.forEach(({ key, title }) => {
        const subgroup = document.createElement('div');
        subgroup.className = 'feature-subgroup';

        if (showBucketHeading) {
          const subgroupHeading = document.createElement('h3');
          subgroupHeading.className = 'feature-subgroup-title';
          subgroupHeading.textContent = title;
          subgroup.appendChild(subgroupHeading);
        }

        const grid = document.createElement('div');
        grid.className = 'feature-group-grid';
        actionBuckets[key].forEach((feature) => {
          grid.appendChild(createFeatureCard(feature));
        });

        subgroup.appendChild(grid);
        actionsWrapper.appendChild(subgroup);
      });
    });

    featureControls.appendChild(actionsWrapper);
  }

  const typeOrder = ['modifier', 'passive'];
  const typeLabels = {
    modifier: 'Modifiers',
    passive: 'Passives',
  };

  const orderedTypes = [...typeOrder, ...Array.from(otherGroups.keys()).filter((t) => !typeOrder.includes(t))];

  orderedTypes.forEach((type) => {
    const featureList = otherGroups.get(type);
    if (!featureList || !featureList.length) return;

    const groupWrapper = document.createElement('div');
    groupWrapper.className = 'feature-group';

    const heading = document.createElement('h3');
    heading.className = 'feature-group-title';
    heading.textContent = typeLabels[type] || type.charAt(0).toUpperCase() + type.slice(1);
    groupWrapper.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'feature-group-grid';

    featureList.forEach((feature) => {
      grid.appendChild(createFeatureCard(feature));
    });

    groupWrapper.appendChild(grid);
    featureControls.appendChild(groupWrapper);
  });
}

// Adds or removes a feature from the current selection state.
function normalizeFeatureId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getRequiredFeatureIds(feature) {
  if (!feature) return [];
  if (!Array.isArray(feature.required)) return [];
  return feature.required
    .map((entry) => normalizeFeatureId(entry))
    .filter(Boolean);
}

function createDependencyCollectionContext(rootId) {
  return {
    rootId,
    stack: new Set([rootId]),
    set: new Set(),
    list: [],
  };
}

function collectRequiredFeatureIds(featureId, context) {
  const feature = featureState.byId[featureId];
  if (!feature) return context.list;

  const requiredIds = getRequiredFeatureIds(feature);
  requiredIds.forEach((reqId) => {
    if (!reqId || reqId === context.rootId) return;
    if (!featureState.byId[reqId]) return;
    if (!context.set.has(reqId)) {
      context.set.add(reqId);
      if (!context.stack.has(reqId)) {
        context.stack.add(reqId);
        collectRequiredFeatureIds(reqId, context);
        context.stack.delete(reqId);
      }
      context.list.push(reqId);
    }
  });

  return context.list;
}

function selectFeatureWithDependencies(id, { includeRoot = true } = {}) {
  const normalizedId = normalizeFeatureId(id);
  if (!normalizedId) return;

  const dependencies = collectRequiredFeatureIds(
    normalizedId,
    createDependencyCollectionContext(normalizedId)
  );

  dependencies.forEach((depId) => {
    if (!featureState.selectedIds.includes(depId)) {
      featureState.selectedIds.push(depId);
    }
  });

  if (includeRoot && !featureState.selectedIds.includes(normalizedId)) {
    featureState.selectedIds.push(normalizedId);
  }
}

function ensureSelectedFeatureDependencies() {
  const queue = featureState.selectedIds
    .map((id) => normalizeFeatureId(id))
    .filter(Boolean);
  const processed = new Set();
  let changed = false;

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || processed.has(currentId)) continue;
    processed.add(currentId);

    const dependencies = collectRequiredFeatureIds(
      currentId,
      createDependencyCollectionContext(currentId)
    );
    if (!dependencies.length) continue;

    let insertIndex = featureState.selectedIds.indexOf(currentId);
    if (insertIndex === -1) {
      insertIndex = featureState.selectedIds.length;
    }

    dependencies.forEach((depId) => {
      if (!featureState.selectedIds.includes(depId)) {
        featureState.selectedIds.splice(insertIndex, 0, depId);
        queue.push(depId);
        insertIndex += 1;
        changed = true;
      }
    });
  }

  return changed;
}

function toggleFeatureSelection(id, isSelected){
  const normalizedId = normalizeFeatureId(id);
  if (!normalizedId) return;

  if(isSelected){
    selectFeatureWithDependencies(normalizedId);
  } else {
    const index = featureState.selectedIds.indexOf(normalizedId);
    if(index !== -1){
      featureState.selectedIds.splice(index, 1);
    }
  }

  updateStatblock();
}

//---- CORE COMPUTATIONS ----
// Restricts the level input to supported bounds.
function clampLevel(level) {
  const min = 0;
  const max = baseLevelStatsData[baseLevelStatsData.length - 1].level;
  return Math.min(Math.max(level, min), max);
}

// Applies role/power/size scaling to populate creature base stats.
function ScaleStats(){
  const fallbackStats = baseLevelStatsData[baseLevelStatsData.length - 1] ?? {};
  const stats =
    baseLevelStatsData[creature.level] ??
    baseLevelStatsData.find((entry) => entry.level === creature.level) ??
    fallbackStats;

  const roleScaling =
    roleModifiersData[creature.role] ?? roleModifiersData.none ?? roleModifiersData[Object.keys(roleModifiersData)[0]];
  const powerScaling =
    powerScalingFactors[creature.power] ?? powerScalingFactors.normal ?? powerScalingFactors[Object.keys(powerScalingFactors)[0]];

  const sizeKey = sizeScalingFactors[creature.size] ? creature.size : toTitleCase(creature.size);
  const sizeScaling = sizeScalingFactors[sizeKey] ?? { PDMod: 0, ADMod: 0 };

  creature.deltas = (creature.deltas && typeof creature.deltas === 'object') ? creature.deltas : {};

  //---- ATTRIBUTES ----
  const priorityDefault = Array.isArray(roleScaling.AttributePriority)
    ? [...roleScaling.AttributePriority]
    : [...ATTRIBUTE_KEYS];
  const hasCustomPriority =
    Array.isArray(creature.deltas.attributePriority) &&
    creature.deltas.attributePriorityCustom === true;
  const storedPriority = hasCustomPriority ? creature.deltas.attributePriority : null;
  const attributePriority = storedPriority
    ? normalizeAttributePriority(storedPriority, priorityDefault)
    : [...priorityDefault];

  creature.attributePriority = attributePriority;
  if (storedPriority) {
    creature.deltas.attributePriority = attributePriority.slice();
    creature.deltas.attributePriorityCustom = true;
  } else {
    if (creature.deltas.attributePriority) {
      delete creature.deltas.attributePriority;
    }
    if (creature.deltas.attributePriorityCustom) {
      delete creature.deltas.attributePriorityCustom;
    }
  }

  const rankValueDeltas = normalizeRankValueDeltas(creature.deltas.rankValueDeltas);
  if (Object.keys(rankValueDeltas).length) {
    creature.deltas.rankValueDeltas = rankValueDeltas;
  } else {
    delete creature.deltas.rankValueDeltas;
  }

  const attributeValueDeltas = normalizeAttributeValueDeltas(creature.deltas.attributes);
  if (Object.keys(attributeValueDeltas).length) {
    creature.deltas.attributes = attributeValueDeltas;
  } else {
    delete creature.deltas.attributes;
  }

  ATTRIBUTE_KEYS.forEach((attribute) => {
    creature.attributes[attribute] = 0;
    creature.attributeSaves[attribute] = 0;
  });

  const levelScoreEntry =
    attributeScoresByLevel[creature.level] ?? attributeScoresByLevel.find((entry) => entry.level === creature.level);
  const rawLevelScores = Array.isArray(levelScoreEntry?.scores) ? [...levelScoreEntry.scores] : [];
  while (rawLevelScores.length < attributePriority.length) {
    rawLevelScores.push(rawLevelScores[rawLevelScores.length - 1] ?? 0);
  }

  const assignedScores = [];

  creature.attributePriority.forEach((attribute, index) => {
    const baseScore = rawLevelScores[index] ?? rawLevelScores[rawLevelScores.length - 1] ?? 0;
    const rankAdjustment = rankValueDeltas[index] ?? 0;
    const attributeAdjustment = attributeValueDeltas[attribute] ?? 0;
    const finalScore = baseScore + rankAdjustment + attributeAdjustment;
    creature.attributes[attribute] = finalScore;
    creature.attributeSaves[attribute] = finalScore + creature.CM;
    assignedScores.push(finalScore);
  });

  creature.primeAttribute = creature.attributePriority[0] || '';
  creature.attributes.Prime = assignedScores[0] ?? rawLevelScores[0] ?? 0;
  creature.skills = Array.isArray(roleScaling.Skills) ? [...roleScaling.Skills] : [];
  
  //---- HP ----
  const scaledHP = (stats.HP ?? 1) * (roleScaling.HPFactor ?? 1) * (powerScaling.HPFactor ?? 1) * (sizeScaling.HPMod ?? 0);
  creature.HP = Math.ceil(scaledHP);

  //---- DEFENSES ----
  creature.PD = (stats.PD ?? 0) + (roleScaling.PDMod ?? 0) + (powerScaling.PDMod ?? 0) + (sizeScaling.PDMod ?? 0);
  creature.AD = (stats.AD ?? 0) + (roleScaling.ADMod ?? 0) + (powerScaling.ADMod ?? 0) + (sizeScaling.ADMod ?? 0);

  //---- DAMAGE ----
  const baseDamage = (stats.Damage ?? 0) + (roleScaling.DamageMod ?? 0) + (powerScaling.DamageMod ?? 0);
  creature.damage = Math.ceil(baseDamage);

  //---- To Hit BONUS ----
  creature.check = (stats.Check ?? 0) + (roleScaling.CheckMod ?? 0) + (powerScaling.CheckMod ?? 0);

  //---- SAVE DC ----
  creature.saveDC = (stats.SaveDC ?? 0) + (powerScaling.SaveDCMod ?? 0);

  //---- Feature Power ----
  creature.featurePower = stats.FeaturePower ?? 0;

  //---- Action Points (AP) ----
  creature.AP = (stats.AP ?? 0) + (powerScaling.APMod ?? 0);

  //---- SPEED ----
  creature.speed = (stats.Speed ?? 0) + (roleScaling.SpeedMod ?? 0);
}

function applyNumericDeltas() {
  if (!creature.deltas || typeof creature.deltas !== 'object') return;
  NUMERIC_DELTA_FIELDS.forEach((field) => {
    const adjustment = Number(creature.deltas[field]);
    if (!Number.isFinite(adjustment) || Math.abs(adjustment) <= 1e-9) return;
    const currentValue = Number(creature[field]) || 0;
    creature[field] = currentValue + adjustment;
  });
}

// Recomputes the creature snapshot and refreshes every stat block section.
function updateStatblock() {
  //---- NAME ----
  creature.name = nameInput.value.trim();
  creature.shortDescription = shortDescriptionInput ? shortDescriptionInput.value.trim() : '';
  creature.longDescription = longDescriptionInput ? longDescriptionInput.value.trim() : '';
  

  //---- LEVEL ----
  const rawLevel = parseInt(levelInput.value, 10);
  creature.level = clampLevel(Number.isNaN(rawLevel) ? 1 : rawLevel);
  if (creature.level !== rawLevel && !Number.isNaN(rawLevel)) {
    levelInput.value = creature.level;
  }
  //---- Combat Mastery ----
  creature.CM = Math.ceil(creature.level / 2);


  //---- Inputs: SIZE, TYPE, POWER, ROLE ----
  creature.size = getSelectedRadioValue('size') || 'medium';
  creature.type = getSelectedRadioValue('type') || 'humanoid';
  creature.power = getSelectedRadioValue('power') || 'normal';
  creature.role = getSelectedRadioValue('role') || 'none';

  //---- SCALE THE BASE STATS BASED ON ROLE, POWER, SIZE
  ScaleStats();
  applyNumericDeltas();

  //---- TRAITS ----
  creature.resistances = collectTraitGroup('resistances');
  creature.vulnerabilities = collectTraitGroup('vulnerabilities');
  creature.immunities = collectTraitGroup('immunities');
  creature.senses = [];
  creature.featureActions = [];
  creature.featurePassives = [];

  const selectedFeatures = featureState.selectedIds
    .map((id) => featureState.byId[id])
    .filter(Boolean);

  creature.selectedFeatures = [...featureState.selectedIds];
  applyFeatureEffects(creature, selectedFeatures);
  syncTraitCheckboxes('resistances', creature.resistances);
  syncTraitCheckboxes('vulnerabilities', creature.vulnerabilities);
  syncTraitCheckboxes('immunities', creature.immunities);


  /*
  ----------------------
  ---- DISPLAY INFO ----
  ----------------------
  */

  // Display Name:
  statblockName.textContent = creature.name || TITLE_FALLBACK;

  // Display info:
  const infoLeft = `${toTitleCase(creature.size)} ${toTitleCase(creature.type)}`.trim();
  const infoRightParts = [`Level ${creature.level}`];
  if (creature.power !== 'normal') {
    infoRightParts.push(toTitleCase(creature.power));
  }
  infoRightParts.push(toTitleCase(creature.role));
  statblockInfo.textContent = `${infoLeft} | ${infoRightParts.join(' ')}`;

  if (statblockShortDescription) {
    if (creature.shortDescription) {
      statblockShortDescription.textContent = creature.shortDescription;
      statblockShortDescription.style.display = '';
    } else {
      statblockShortDescription.textContent = '';
      statblockShortDescription.style.display = 'none';
    }
  }

  if (statblockLongDescription) {
    if (creature.longDescription) {
      statblockLongDescription.textContent = creature.longDescription;
      statblockLongDescription.style.display = '';
    } else {
      statblockLongDescription.textContent = '';
      statblockLongDescription.style.display = 'none';
    }
  }

  // Display HP:
  statblockHP.textContent = creature.HP;

  // Display PD / AD:
  statblockPD.textContent = creature.PD + " / " + (creature.PD+5) + " / " + (creature.PD+10);
  statblockAD.textContent = creature.AD + " / " + (creature.AD+5) + " / " + (creature.AD+10);

  // Display Attributes:
  statblockMIG.textContent = creature.attributes.Mig;
  statblockMIGSave.textContent = creature.attributeSaves.Mig;
  statblockAGI.textContent = creature.attributes.Agi;
  statblockAGISave.textContent = creature.attributeSaves.Agi;
  statblockCHA.textContent = creature.attributes.Cha;
  statblockCHASave.textContent = creature.attributeSaves.Cha;
  statblockINT.textContent = creature.attributes.Int;
  statblockINTSave.textContent = creature.attributeSaves.Int;

  const formattedSkills = creature.skills.map(toTitleCase);
  renderTraitGroup(statblockResistances, creature.resistances);
  renderTraitGroup(statblockVulnerabilities, creature.vulnerabilities);
  renderTraitGroup(statblockImmunities, creature.immunities);
  renderSkillList(statblockSkills, formattedSkills);
  renderSimpleList(statblockSenses, creature.senses);
  renderFeatureSummary();
  renderActionSummary();
  renderRecommendations();
}

async function SaveToFirebase() {
  if (!currentUser) {
    setSaveStatus('Sign in before saving to Firebase.', 'error', { sticky: false });
    updateSaveButtonState(currentUser);
    return;
  }

  setSaveStatus('Saving creature…', 'info', { sticky: true });
  if (saveToFirebaseButton) {
    saveToFirebaseButton.disabled = true;
  }

  try {
    updateStatblock();
    const payload = buildCreatureSavePayload();
    const documentId = buildCreatureDocumentId(payload.name, currentUser?.uid);
    const encoded = encodeFirestoreDocument({
      ...payload,
      documentId,
    });

    const postUrl = `${CREATURE_FIRESTORE_ENDPOINT}?documentId=${encodeURIComponent(documentId)}&key=${FIRESTORE_API_KEY}`;
    const patchUrl = `${CREATURE_FIRESTORE_ENDPOINT}/${encodeURIComponent(documentId)}?key=${FIRESTORE_API_KEY}`;

    let response = await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encoded),
    });

    if (response.status === 409) {
      response = await fetch(patchUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encoded),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firestore save failed (${response.status}): ${errorText}`);
    }

    setSaveStatus(`Creature saved as ${documentId}.`, 'success', { sticky: true });
    return await response.json();
  } catch (error) {
    console.error('Failed to save creature to Firebase', error);
    setSaveStatus('Failed to save creature. Check the console for details.', 'error', { sticky: true });
    throw error;
  } finally {
    updateSaveButtonState(currentUser);
  }
}

window.SaveToFirebase = SaveToFirebase;


setupTraitPickers();

loadFeatures()
  .then((featuresById) => {
    featureState.byId = featuresById;
    featureState.allIds = Object.keys(featuresById);
    ensureSelectedFeatureDependencies();
    if (featureState.searchTerm) {
      applyFeatureSearch(featureState.searchTerm);
    } else {
      featureState.filteredIds = [...featureState.allIds];
      renderFeatureControls();
    }
    featuresLoaded = true;
    maybeApplyPendingCreature();
    if (!hasRequestedCreature || !pendingLoadedCreature) {
      updateStatblock();
    }
  })
  .catch((error) => {
    console.error('Failed to load features from Firestore', error);
    featuresLoaded = true;
    maybeApplyPendingCreature();
    updateStatblock();
  });

if (featureSearchInput) {
  featureSearchInput.addEventListener('input', (event) => {
    applyFeatureSearch(event.target.value || '');
  });
}

if (editCreatureButton) {
  editCreatureButton.addEventListener('click', exportCreatureDraft);
}

if (saveToFirebaseButton) {
  saveToFirebaseButton.addEventListener('click', () => {
    SaveToFirebase().catch(() => {});
  });
}

if (hasRequestedCreature && requestedCreatureId) {
  loadCreatureById(requestedCreatureId).catch(() => {});
}

if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    signOut(auth)
      .then(() => {
        window.location.href = 'auth.html';
      })
      .catch((error) => {
        console.error('Failed to sign out', error);
        setSaveStatus('Failed to sign out. Please try again.', 'error', { sticky: false });
      });
  });
}

if (resetInputsButton) {
  resetInputsButton.addEventListener('click', resetBuilderToDefaults);
}

// Reacts to any input change so the stat block stays in sync.
const handleInputChange = (event) => {
  if (event.target.matches('input, textarea')) {
    updateStatblock();
  }
};

if (inputsContainer) {
  inputsContainer.addEventListener('input', handleInputChange);
  inputsContainer.addEventListener('change', handleInputChange);
}

updateStatblock();

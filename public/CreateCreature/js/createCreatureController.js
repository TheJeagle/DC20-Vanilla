/**
 * Creature Creator Controller
 * --------------------------
 * Orchestrates the main builder page: wires DOM events, keeps local state in sync,
 * and coordinates Firestore persistence while delegating UI details to panel modules.
 */
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { updateNavAuth } from '../../navAuth.js';
import { roleModifiersData } from '../../Rules/gameRules.js';
import { loadFeatures, applyFeatureEffects } from '../../features.js';
import { auth } from '../../firebaseClient.js';
import { buildCreatureDocumentId } from '../../utils/firestore.js';
import dom from './createCreatureDom.js';
import {
  TITLE_FALLBACK,
  CREATURE_COLLECTION,
  creature,
  featureState,
  loadStoredCreatureDraft,
  persistCreatureDraft,
  clearStoredCreatureDraft,
  getCurrentUser,
  setCurrentUser,
  isFeaturesLoaded,
  setFeaturesLoaded,
  getPendingLoadedCreature,
  setPendingLoadedCreature,
} from './createCreatureState.js';
import {
  setupTraitPickers,
  collectTraitGroup,
  syncTraitCheckboxes,
} from './createCreatureTraits.js';
import {
  computeScaledStats,
  applyNumericDeltas,
  clampLevel,
  normalizeAttributePriority,
  normalizeRankValueDeltas,
  arraysEqual,
  ATTRIBUTE_KEYS,
} from './createCreatureStats.js';
import { renderCreatureStatblock, setFeatureReorderHandler, setFeatureRemoveHandler, initStatblockSectionToggles } from './createCreatureStatblock.js';
import {
  renderFeatureControls,
  ensureSelectedFeatureDependencies,
  applyFeatureSearch,
  setFeatureSelectionChangeHandler,
  refreshFeatureFiltersForCurrentCreature,
  toggleFeatureSelection,
} from './createCreatureFeatures.js';
import { fetchCreatureDocument, saveCreatureDocument } from './createCreatureFirebase.js';
import { generateObsidianYAML } from './createCreatureExport.js';

/**
 * Convert arbitrary text into title case for display.
 * @param {string|null|undefined} value - Raw label or input value.
 * @returns {string} The value with its first character capitalised, or '' when falsy.
 */
function toTitleCase(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ----- Save banner helpers -------------------------------------------------

/**
 * Update the save-status banner shown above the controls.
 * @param {string|null} message - Message text; pass null/empty to clear the banner.
 * @param {'info'|'success'|'error'} [tone='info'] - Visual tone applied via CSS data attribute.
 * @param {{sticky?: boolean}} [options={}] - Sticky banners persist until explicitly cleared.
 */
function setSaveStatus(message, tone = 'info', options = {}) {
  const { saveStatus } = dom;
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

// Display which account is active, without overriding sticky save messages.
/**
 * Reflect Firebase authentication state in the banner.
 * @param {import('firebase/auth').User|null} user - Current Firebase Auth user (or null when signed out).
 */
function updateSavePromptForAuth(user) {
  const { saveStatus } = dom;
  if (!saveStatus) return;
  if (saveStatus.dataset.sticky === 'true' && user) return;

  if (user) {
    const label = user.displayName || user.email || 'your account';
    setSaveStatus(`Signed in as ${label}.`, 'success', { sticky: false });
  } else {
    setSaveStatus('Sign in to save your creature to Firebase.', 'info', { sticky: false });
  }
}

// Enable save button only when a user is authenticated.
/**
 * Toggle the "Save to Firebase" button based on auth state.
 * @param {import('firebase/auth').User|null} user - Firebase Auth user (null when signed out).
 */
function updateSaveButtonState(user) {
  const button = dom.saveToFirebaseButton;
  if (!button) return;
  const shouldDisable = !user;
  button.disabled = shouldDisable;
  if (shouldDisable) {
    button.title = 'Sign in to enable saving to Firebase.';
  } else {
    button.removeAttribute('title');
  }
}

// Utility: read the checked option for a radio input group.
/**
 * Read a selected radio value from the DOM.
 * @param {string} groupName - Name attribute shared by the radio inputs.
 * @returns {string|null} Value of the selected radio, or null when no input is checked.
 */
function getSelectedRadioValue(groupName) {
  const checked = document.querySelector(`input[name="${groupName}"]:checked`);
  return checked ? checked.value : null;
}

// Utility: set the checked option for a radio input group.
/**
 * Programmatically select a radio option if it exists.
 * @param {string} groupName - Name attribute shared by target radios.
 * @param {string|number|null|undefined} rawValue - Desired option value; case-insensitive fallback supported.
 */
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

// Reset all builder inputs and in-memory state to the baseline creature.
/**
 * Clear persisted drafts, reset form inputs, and rebuild the statblock from defaults.
 */
function resetBuilderToDefaults() {
  clearStoredCreatureDraft();
  setPendingLoadedCreature(null);

  if (window.history && window.history.replaceState) {
    const { pathname, hash } = window.location;
    window.history.replaceState(null, '', `${pathname}${hash || ''}`);
  }

  if (dom.nameInput) dom.nameInput.value = '';
  if (dom.levelInput) dom.levelInput.value = '1';
  if (dom.shortDescriptionInput) dom.shortDescriptionInput.value = '';
  if (dom.longDescriptionInput) dom.longDescriptionInput.value = '';

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

  if (dom.featureSearchInput) dom.featureSearchInput.value = '';
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
    featureReactions: [],
    featurePassives: [],
    skills: [],
    selectedFeatures: [],
    deltas: {},
    shortDescription: '',
    longDescription: '',
    totalLikes: 0,
    lastLikeAt: null,
  });

  if (isFeaturesLoaded()) {
    refreshFeatureFiltersForCurrentCreature(true);
  }

  updateStatblock();
  setSaveStatus('Inputs reset. Start fresh!', 'success', { sticky: false });
}

// Snapshot the minimal data the editor needs to identify the creature later.
/**
 * Construct the base profile stored with drafts and Firestore documents.
 * @returns {{name:string,level:number,role:string,power:string,size:string,type:string,shortDescription:string,longDescription:string,selectedFeatures:string[]}}
 */
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

// Snapshot the creature's derived stats so we can diff deltas later.
/**
 * Capture the computed baseline stats before deltas/feature effects apply.
 * @returns {{attributes:Record<string,number>,attributeSaves:Record<string,number>,attributePriority:string[],HP:number,PD:number,AD:number,damage:number,check:number,saveDC:number,AP:number,speed:number}}
 */
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

// Clone mutable delta structures so we can persist without shared references.
/**
 * Create a shallow clone of the deltas map so persistence doesn't mutate live state.
 * @returns {Record<string, unknown>} Copy of the current creature deltas.
 */
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

function buildStatSnapshot() {
  const pdBase = Number(creature.PD) || 0;
  const adBase = Number(creature.AD) || 0;
  return {
    HP: Number(creature.HP) || 0,
    PD: pdBase,
    PDHeavy: pdBase + 5,
    PDBrutal: pdBase + 10,
    AD: adBase,
    ADHeavy: adBase + 5,
    ADBrutal: adBase + 10,
    damage: Number(creature.damage) || 0,
    check: Number(creature.check) || 0,
    saveDC: Number(creature.saveDC) || 0,
    AP: Number(creature.AP) || 0,
    speed: Number(creature.speed) || 0,
    CM: Number(creature.CM) || 0,
  };
}

// Shape the Firestore payload, packaging base stats, traits, and deltas.
/**
 * Prepare a Firestore-ready payload combining base info, stats, traits, and deltas.
 * @returns {Record<string, unknown>} Plain object suitable for Firestore setDoc.
 */
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
  const featureReactions = Array.isArray(creature.featureReactions)
    ? creature.featureReactions.map((reaction) => ({ ...reaction }))
    : [];
  const featurePassives = Array.isArray(creature.featurePassives)
    ? creature.featurePassives.map((passive) => ({ ...passive }))
    : [];
  const ownerInfo = getCurrentUser()
    ? {
        id: getCurrentUser().uid,
        displayName: getCurrentUser().displayName ?? '',
        email: getCurrentUser().email ?? '',
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
    totalLikes: typeof creature.totalLikes === 'number' ? creature.totalLikes : 0,
    lastLikeAt: creature.lastLikeAt ?? null,
    stats: buildStatSnapshot(),
    attributes: {
      values: { ...creature.attributes },
      saves: { ...creature.attributeSaves },
      priority: [...creature.attributePriority],
      primeAttribute: creature.primeAttribute,
    },
    traits,
    featureActions,
    featureReactions,
    featurePassives,
    selectedFeatures: [...creature.selectedFeatures],
    deltas: deltasSnapshot,
    base: baseProfile,
    baseline: baselineSnapshot,
    savedAt: new Date().toISOString(),
  };
}

// Populate the DOM with a stored draft (local or remote) without recomputing.
/**
 * Load a persisted creature draft back into form controls and state structures.
 * @param {Record<string, any>|null} draft - Draft payload (from storage or Firestore); ignored if falsy/invalid.
 */
function applyDraftToBuilder(draft) {
  if (!draft || typeof draft !== 'object') return;

  const base = draft.base && typeof draft.base === 'object' ? draft.base : {};

  if (dom.nameInput && typeof base.name === 'string') {
    dom.nameInput.value = base.name;
  }

  if (dom.levelInput) {
    const numericLevel = Number(base.level);
    if (!Number.isNaN(numericLevel) && numericLevel >= 0) {
      dom.levelInput.value = String(numericLevel);
    }
  }

  if (dom.shortDescriptionInput) {
    dom.shortDescriptionInput.value = typeof base.shortDescription === 'string' ? base.shortDescription : '';
  }

  if (dom.longDescriptionInput) {
    dom.longDescriptionInput.value = typeof base.longDescription === 'string' ? base.longDescription : '';
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
  if (isFeaturesLoaded()) {
    ensureSelectedFeatureDependencies();
  }

  const attributePriority =
    Array.isArray(draft.attributePriority) && draft.attributePriority.length
      ? draft.attributePriority
      : Array.isArray(draft.baseline?.attributePriority)
      ? draft.baseline.attributePriority
      : null;

  const mergedDeltas = draft.deltas && typeof draft.deltas === 'object' ? { ...draft.deltas } : {};
  const normalizedPriority =
    Array.isArray(attributePriority) && attributePriority.length
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

// Ensure trait arrays are well-formed even if the source data is missing.
/**
 * Normalise trait groups pulled from drafts (handles null/undefined cases).
 * @param {{damage?: string[], condition?: string[]}|undefined|null} group - Raw trait group from persistence.
 * @returns {{damage: string[], condition: string[]}} Copy containing safe arrays.
 */
function sanitizeTraitGroup(group) {
  return {
    damage: Array.isArray(group?.damage) ? [...group.damage] : [],
    condition: Array.isArray(group?.condition) ? [...group.condition] : [],
  };
}

// Bring a Firestore document into the builder, deferring until features load.
/**
 * Apply a Firestore-stored creature to the current builder state and UI.
 * @param {Record<string, any>|null} saved - Data returned from fetchCreatureById; ignored when falsy.
 */
function applySavedCreatureToBuilder(saved) {
  if (!saved || typeof saved !== 'object') return;
  if (!isFeaturesLoaded()) {
    setPendingLoadedCreature(saved);
    return;
  }

  applyDraftToBuilder(saved);
  creature.totalLikes = typeof saved.totalLikes === 'number' ? saved.totalLikes : 0;
  creature.lastLikeAt = saved.lastLikeAt ?? null;

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

// After features arrive, render any creature that was waiting on dependencies (no params).
/**
 * When features finish loading, render any queued Firestore creature.
 */
function maybeApplyPendingCreature() {
  if (!isFeaturesLoaded()) return;
  const pending = getPendingLoadedCreature();
  if (!pending) return;
  setPendingLoadedCreature(null);
  applySavedCreatureToBuilder(pending);
}

// Light wrapper so the controller decouples from raw Firestore APIs.
/**
 * Retrieve a creature document from Firestore.
 * @param {string|null|undefined} documentId - Firestore document id (whitespace is trimmed).
 * @returns {Promise<Record<string, any>|null>} Resolves with the stored creature or null when not found.
 */
async function fetchCreatureById(documentId) {
  if (!documentId) return null;
  const trimmedId = documentId.trim();
  if (!trimmedId) return null;
  return fetchCreatureDocument(CREATURE_COLLECTION, trimmedId);
}

// Fetch a creature document and queue it for rendering.
/**
 * Load a creature from Firestore and queue it for rendering after features load.
 * @param {string|null|undefined} documentId - Creature id from the query string; ignored if falsy.
 * @returns {Promise<void>} Resolves once loading attempts complete.
 */
async function loadCreatureById(documentId) {
  if (!documentId) return;
  try {
    setSaveStatus('Loading saved creature…', 'info', { sticky: false });
    const saved = await fetchCreatureById(documentId);
    if (!saved) {
      setSaveStatus('Could not find that creature.', 'error', { sticky: true });
      return;
    }
    setPendingLoadedCreature(saved);
    maybeApplyPendingCreature();
  } catch (error) {
    console.error('Failed to load creature from Firestore', error);
    setSaveStatus('Failed to load the selected creature. Try again later.', 'error', { sticky: true });
  }
}

// Persist the current builder state to storage and open the editor view.
/**
 * Serialise the current creature into storage and redirect to editCreature.html.
 */
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

  window.location.href = '../EditCreature/editCreature.html';
}

// Read form inputs and normalise them into the creature state shape.
/**
 * Collect the latest values from the builder form controls.
 * @returns {{name:string,rawLevel:number,shortDescription:string,longDescription:string,size:string,type:string,power:string,role:string,resistances:{damage:string[],condition:string[]},vulnerabilities:{damage:string[],condition:string[]},immunities:{damage:string[],condition:string[]}}}
 */
function readCreatureInputs() {
  const name = dom.nameInput ? dom.nameInput.value.trim() : '';
  const rawLevel = dom.levelInput ? parseInt(dom.levelInput.value, 10) : Number.NaN;
  const shortDescription = dom.shortDescriptionInput ? dom.shortDescriptionInput.value.trim() : '';
  const longDescription = dom.longDescriptionInput ? dom.longDescriptionInput.value.trim() : '';

  return {
    name,
    rawLevel,
    shortDescription,
    longDescription,
    size: getSelectedRadioValue('size') || 'medium',
    type: getSelectedRadioValue('type') || 'humanoid',
    power: getSelectedRadioValue('power') || 'normal',
    role: getSelectedRadioValue('role') || 'none',
    resistances: collectTraitGroup('resistances'),
    vulnerabilities: collectTraitGroup('vulnerabilities'),
    immunities: collectTraitGroup('immunities'),
  };
}

// Apply raw form values to the in-memory creature, handling copies for arrays.
/**
 * Write form-derived values onto the live creature object.
 * @param {{name:string,rawLevel:number,shortDescription:string,longDescription:string,size:string,type:string,power:string,role:string,resistances:{damage:string[],condition:string[]},vulnerabilities:{damage:string[],condition:string[]},immunities:{damage:string[],condition:string[]}}} inputs - Structure returned by readCreatureInputs.
 */
function applyInputsToCreature(inputs) {
  creature.name = inputs.name;
  creature.shortDescription = inputs.shortDescription;
  creature.longDescription = inputs.longDescription;

  const fallbackLevel = Number.isNaN(inputs.rawLevel) ? 1 : inputs.rawLevel;
  const clampedLevel = clampLevel(fallbackLevel);
  creature.level = clampedLevel;
  if (dom.levelInput && clampedLevel !== fallbackLevel && !Number.isNaN(fallbackLevel)) {
    dom.levelInput.value = String(clampedLevel);
  }

  creature.size = inputs.size;
  creature.type = inputs.type;
  creature.power = inputs.power;
  creature.role = inputs.role;

  creature.resistances = {
    damage: [...inputs.resistances.damage],
    condition: [...inputs.resistances.condition],
  };
  creature.vulnerabilities = {
    damage: [...inputs.vulnerabilities.damage],
    condition: [...inputs.vulnerabilities.condition],
  };
  creature.immunities = {
    damage: [...inputs.immunities.damage],
    condition: [...inputs.immunities.condition],
  };
}

// Rebuild derived statistics and reapply feature effects.
/**
 * Recalculate the creature's stats based on current inputs and feature selections.
 */
function recomputeCreatureFromInputs() {
  creature.CM = Math.ceil(creature.level / 2);

  const computed = computeScaledStats({
    level: creature.level,
    role: creature.role,
    power: creature.power,
    size: creature.size,
    type: creature.type,
    deltas: creature.deltas,
    combatMastery: creature.CM,
  });

  creature.attributePriority = [...computed.attributePriority];
  creature.attributes = { ...computed.attributes };
  creature.attributeSaves = { ...computed.attributeSaves };
  creature.primeAttribute = computed.primeAttribute;
  creature.skills = [...computed.skills];
  creature.HP = computed.HP;
  creature.PD = computed.PD;
  creature.AD = computed.AD;
  creature.damage = computed.damage;
  creature.check = computed.check;
  creature.saveDC = computed.saveDC;
  creature.featurePower = computed.featurePower;
  creature.AP = computed.AP;
  creature.speed = computed.speed;
  creature.deltas = computed.deltas;

  applyNumericDeltas(creature);

  // Capture user's manually checked traits before the reset so they survive
  // the feature recompute pass (applyFeatureEffects resets and refills these arrays).
  const userTraits = {
    resistances:     { damage: [...(creature.resistances?.damage     || [])], condition: [...(creature.resistances?.condition     || [])] },
    vulnerabilities: { damage: [...(creature.vulnerabilities?.damage || [])], condition: [...(creature.vulnerabilities?.condition || [])] },
    immunities:      { damage: [...(creature.immunities?.damage      || [])], condition: [...(creature.immunities?.condition      || [])] },
  };

  creature.senses = [];
  creature.featureActions = [];
  creature.featureReactions = [];
  creature.featurePassives = [];
  creature.resistances = { damage: [], condition: [] };
  creature.vulnerabilities = { damage: [], condition: [] };
  creature.immunities = { damage: [], condition: [] };

  const selectedFeatures = featureState.selectedIds
    .map((id) => featureState.byId[id])
    .filter(Boolean);

  creature.selectedFeatures = [...featureState.selectedIds];
  applyFeatureEffects(creature, selectedFeatures);

  // Merge user-selected traits back in (feature-granted ones are already present).
  const mergeTraits = (target, userPicked) => {
    userPicked.damage   .forEach(v => { if (!target.damage   .includes(v)) target.damage   .push(v); });
    userPicked.condition.forEach(v => { if (!target.condition.includes(v)) target.condition.push(v); });
  };
  mergeTraits(creature.resistances,     userTraits.resistances);
  mergeTraits(creature.vulnerabilities, userTraits.vulnerabilities);
  mergeTraits(creature.immunities,      userTraits.immunities);

  syncTraitCheckboxes('resistances',     creature.resistances);
  syncTraitCheckboxes('vulnerabilities', creature.vulnerabilities);
  syncTraitCheckboxes('immunities',      creature.immunities);
}

// High-level flow: read inputs → update state → refresh UI.
/**
 * Run the full stat update pipeline based on current form values.
 */
function updateStatblock() {
  const inputs = readCreatureInputs();
  applyInputsToCreature(inputs);
  refreshFeatureFiltersForCurrentCreature();
  recomputeCreatureFromInputs();
  renderCreatureStatblock();
}

// Save the current creature to Firestore, showing optimistic UI feedback.
/**
 * Persist the current creature to Firestore for the logged-in user.
 * @returns {Promise<Record<string, any>>} Resolves with the saved payload metadata.
 */
async function saveToFirebase() {
  const user = getCurrentUser();
  if (!user) {
    setSaveStatus('Sign in before saving to Firebase.', 'error', { sticky: false });
    updateSaveButtonState(user);
    return;
  }

  setSaveStatus('Saving creature…', 'info', { sticky: true });
  if (dom.saveToFirebaseButton) {
    dom.saveToFirebaseButton.disabled = true;
  }

  try {
    updateStatblock();
    const payload = buildCreatureSavePayload();
    const documentId = buildCreatureDocumentId(payload.name, user?.uid);
    await saveCreatureDocument(CREATURE_COLLECTION, documentId, payload);
    setSaveStatus(`Creature saved as ${documentId}.`, 'success', { sticky: true });
    return { id: documentId, ...payload, documentId };
  } catch (error) {
    console.error('Failed to save creature to Firebase', error);
    setSaveStatus('Failed to save creature. Check the console for details.', 'error', { sticky: true });
    throw error;
  } finally {
    updateSaveButtonState(getCurrentUser());
  }
}

// Wire auth state to the UI whenever Firebase reports sign-in/sign-out.
/**
 * Subscribe to Firebase Auth state changes and keep UI reflective of sign-in state.
 */
function initializeAuthHandling() {
  updateSaveButtonState(null);
  updateSavePromptForAuth(null);

  onAuthStateChanged(auth, (user) => {
    setCurrentUser(user);
    updateNavAuth(user);
    updateSaveButtonState(user);
    updateSavePromptForAuth(user);
  });
}

// Register DOM listeners for search, edit, save, logout, reset, and inputs.
/**
 * Attach all DOM event listeners required by the builder page.
 */
function initializeEventHandlers() {
  if (dom.featureSearchInput) {
    dom.featureSearchInput.addEventListener('input', (event) => {
      applyFeatureSearch(event.target.value || '');
    });
  }

  if (dom.editCreatureButton) {
    dom.editCreatureButton.addEventListener('click', exportCreatureDraft);
  }

  if (dom.saveToFirebaseButton) {
    dom.saveToFirebaseButton.addEventListener('click', () => {
      saveToFirebase().catch(() => {});
    });
  }

  if (dom.printStatblockButton) {
    dom.printStatblockButton.addEventListener('click', () => {
      updateStatblock();
      window.print();
    });
  }

  if (dom.copyObsidianButton) {
    dom.copyObsidianButton.addEventListener('click', async () => {
      updateStatblock();
      const yaml = generateObsidianYAML();
      try {
        await navigator.clipboard.writeText(yaml);
        setSaveStatus('Copied Obsidian statblock to clipboard!', 'success', { sticky: false });
      } catch {
        setSaveStatus('Could not write to clipboard.', 'error', { sticky: false });
      }
    });
  }

  if (dom.logoutButton) {
    dom.logoutButton.addEventListener('click', () => {
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

  if (dom.resetInputsButton) {
    dom.resetInputsButton.addEventListener('click', resetBuilderToDefaults);
  }

  if (dom.inputsContainer) {
    const handleInputChange = (event) => {
      if (event.target.matches('input, textarea')) {
        updateStatblock();
      }
    };
    dom.inputsContainer.addEventListener('input', handleInputChange);
    dom.inputsContainer.addEventListener('change', handleInputChange);
  }

  setFeatureSelectionChangeHandler(() => {
    updateStatblock();
  });

  setFeatureReorderHandler(() => {
    updateStatblock();
  });

  setFeatureRemoveHandler((featureId) => {
    toggleFeatureSelection(featureId, false);
    renderFeatureControls();
  });

  initStatblockSectionToggles();

  window.SaveToFirebase = saveToFirebase;
}

// Fetch feature catalogue, then render any pending creature once ready.
/**
 * Load features from Firestore and trigger initial rendering.
 * @param {string|null} requestedCreatureId - Creature id requested via query parameters (optional).
 */
function initializeFeatureLoading(requestedCreatureId) {
  loadFeatures()
    .then((featuresById) => {
      featureState.byId = featuresById;
      const PINNED_IDS = ['common-melee', 'common-ranged-attack'];
      const allKeys = Object.keys(featuresById);
      featureState.allIds = [
        ...PINNED_IDS.filter((id) => featuresById[id]),
        ...allKeys.filter((id) => !PINNED_IDS.includes(id)),
      ];
      setFeaturesLoaded(true);

      ensureSelectedFeatureDependencies();
      refreshFeatureFiltersForCurrentCreature(true);

      maybeApplyPendingCreature();
      if (!requestedCreatureId || !getPendingLoadedCreature()) {
        updateStatblock();
      }
    })
    .catch((error) => {
      console.error('Failed to load features from Firestore', error);
      setFeaturesLoaded(true);
      maybeApplyPendingCreature();
      updateStatblock();
    });
}

// Load any local draft unless a specific Firestore creature was requested.
/**
 * Restore a locally saved draft when we're not about to load one from Firestore.
 * @param {string|null} requestedCreatureId - Creature id from query params; skip local restore when provided.
 */
function initializeStoredDraft(requestedCreatureId) {
  const restoredDraft = requestedCreatureId ? null : loadStoredCreatureDraft();
  if (restoredDraft) {
    applyDraftToBuilder(restoredDraft);
  }
}

// If a creatureId was provided via query param, fetch it after init.
/**
 * Kick off Firestore loading of a specific creature when requested via URL.
 * @param {string|null} requestedCreatureId - Creature id from query params (may be null).
 */
function initializePendingLoad(requestedCreatureId) {
  if (requestedCreatureId) {
    loadCreatureById(requestedCreatureId).catch(() => {});
  }
}

// Entry point – wire everything up once per page load.
/**
 * Main bootstrap function invoked by public/index.js to initialise the builder.
 */
export function initializeCreatureCreator() {
  setupTraitPickers();
  initializeEventHandlers();
  initializeAuthHandling();

  const urlParams = new URLSearchParams(window.location.search);
  const requestedCreatureId = urlParams.get('creatureId');

  initializeStoredDraft(requestedCreatureId);
  initializeFeatureLoading(requestedCreatureId);
  initializePendingLoad(requestedCreatureId);

  updateStatblock();
}

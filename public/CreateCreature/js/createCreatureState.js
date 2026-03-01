import { loadJson, saveJson, removeItem } from '../../utils/storage.js';

const TITLE_FALLBACK = 'Creature Name';
const CREATURE_COLLECTION = 'VanillaCreatures';
const CREATURE_EDITOR_STORAGE_KEY = 'dc20-creature-editor';

const creature = {
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
  customFeatures: [],
  deltas: {},
  shortDescription: '',
  longDescription: '',
};

const featureState = {
  byId: {},
  allIds: [],
  filteredIds: [],
  searchTerm: '',
  selectedIds: [],
  bankFeatures: [],
  communityFeatures: [],
  communityFeaturesLoaded: false,
  activeTab: 'library',
  likedFeatureIds: new Set(),
};

const controllerState = {
  currentUser: null,
  featuresLoaded: false,
  pendingLoadedCreature: null,
};

function getCurrentUser() {
  return controllerState.currentUser;
}

function setCurrentUser(user) {
  controllerState.currentUser = user;
}

function isFeaturesLoaded() {
  return controllerState.featuresLoaded;
}

function setFeaturesLoaded(value) {
  controllerState.featuresLoaded = Boolean(value);
}

function getPendingLoadedCreature() {
  return controllerState.pendingLoadedCreature;
}

function setPendingLoadedCreature(value) {
  controllerState.pendingLoadedCreature = value;
}

function loadStoredCreatureDraft() {
  return loadJson(CREATURE_EDITOR_STORAGE_KEY);
}

function persistCreatureDraft(payload) {
  if (!payload) return false;
  return saveJson(CREATURE_EDITOR_STORAGE_KEY, payload);
}

function clearStoredCreatureDraft() {
  removeItem(CREATURE_EDITOR_STORAGE_KEY);
}

function setBankFeatures(features) {
  featureState.bankFeatures = Array.isArray(features) ? features : [];
}

function setCommunityFeatures(features) {
  featureState.communityFeatures = Array.isArray(features) ? features : [];
  featureState.communityFeaturesLoaded = true;
}

function setLikedFeatureIds(ids) {
  featureState.likedFeatureIds = ids instanceof Set ? ids : new Set(Array.isArray(ids) ? ids : []);
}

export {
  TITLE_FALLBACK,
  CREATURE_COLLECTION,
  creature,
  featureState,
  controllerState,
  getCurrentUser,
  setCurrentUser,
  isFeaturesLoaded,
  setFeaturesLoaded,
  getPendingLoadedCreature,
  setPendingLoadedCreature,
  loadStoredCreatureDraft,
  persistCreatureDraft,
  clearStoredCreatureDraft,
  setBankFeatures,
  setCommunityFeatures,
  setLikedFeatureIds,
};

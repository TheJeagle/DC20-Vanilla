import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { loadFeatures } from './features.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCgdyE834tp64B2flcR9VUzbIvXwPdwQ-k',
  authDomain: 'dc20-creature-creator.firebaseapp.com',
  projectId: 'dc20-creature-creator',
  storageBucket: 'dc20-creature-creator.firebasestorage.app',
  messagingSenderId: '638039342508',
  appId: '1:638039342508:web:a80d7ddaecdab47b1b8e09',
  measurementId: 'G-2BEL1FHFPP',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const CREATURES_COLLECTION = 'VanillaCreatures';

const pageStatus = document.querySelector('#pageStatus');
const creaturesList = document.querySelector('#creaturesList');
const logoutButton = document.querySelector('#logoutButton');
const sortButtons = document.querySelectorAll('.sort-button');
const tableBody = document.querySelector('#creaturesTableBody');
const tableContainer = document.querySelector('.table-container');
const sortHeaders = document.querySelectorAll('.creatures-table th[data-sort-key]');
const filterForm = document.querySelector('#filterForm');
const filterClearButton = document.querySelector('#filterClear');
const filterLevelMinInput = document.querySelector('#filterLevelMin');
const filterLevelMaxInput = document.querySelector('#filterLevelMax');

let cachedFeatures = {};
const featuresPromise = loadFeatures()
  .then((features) => {
    cachedFeatures = features || {};
    return cachedFeatures;
  })
  .catch((error) => {
    console.error('Failed to load features for My Creatures page', error);
    cachedFeatures = {};
    return {};
  });

let currentUser = null;
let isLoading = false;
let currentCreatures = [];
let currentFeatures = {};

const sortState = {
  key: 'name',
  direction: 'asc',
};

const defaultFilterState = {
  levelMin: null,
  levelMax: null,
  power: '',
  role: '',
  type: '',
  size: '',
};

let filterState = { ...defaultFilterState };

function setStatus(variant, message) {
  if (!pageStatus) return;
  if (!message) {
    pageStatus.textContent = '';
    delete pageStatus.dataset.variant;
    return;
  }

  pageStatus.dataset.variant = variant || 'info';
  pageStatus.textContent = message;
}

function ensureListEmptyState(isEmpty) {
  if (!creaturesList) return;
  creaturesList.dataset.empty = isEmpty ? 'true' : 'false';
}

function formatLabel(value, fallback = '—') {
  if (!value) return fallback;
  const label = String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!label) return fallback;
  return label.replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveFeatureNames(selectedIds, featuresById) {
  const ids = Array.isArray(selectedIds) ? selectedIds.filter(Boolean) : [];
  if (!ids.length) return [];

  return ids.map((id) => {
    const featureName = featuresById[id]?.name || id;
    return featureName || formatLabel(id);
  });
}

function buildSubtitle(creature) {
  const size = formatLabel(creature.size);
  const type = formatLabel(creature.type);
  const levelValue = Number(creature.level);
  const level = Number.isFinite(levelValue) ? levelValue : '—';
  const power = formatLabel(creature.power || 'normal');
  const role = formatLabel(creature.role || 'none');
  return `${size} ${type} - Level ${level} ${power} ${role}`.trim();
}

function createCreatureCard(creature, featuresById) {
  const card = document.createElement('article');
  card.className = 'creature-card';
  card.dataset.creatureId = creature.id;

  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = creature.name || 'Unnamed Creature';

  const subtitle = document.createElement('p');
  subtitle.className = 'card-subtitle';
  subtitle.textContent = buildSubtitle(creature);

  const featuresWrapper = document.createElement('div');
  featuresWrapper.className = 'card-features';
  const featureNames = resolveFeatureNames(creature.selectedFeatures, featuresById);
  if (featureNames.length) {
    featureNames.forEach((name) => {
      const pill = document.createElement('span');
      pill.className = 'feature-pill';
      pill.textContent = name;
      featuresWrapper.appendChild(pill);
    });
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'feature-pill';
    placeholder.textContent = 'No features selected';
    featuresWrapper.appendChild(placeholder);
  }

  const description = document.createElement('p');
  description.className = 'card-description';
  if (creature.shortDescription) {
    description.textContent = `"${creature.shortDescription}"`;
  } else {
    description.textContent = 'No short description yet.';
    description.dataset.placeholder = 'true';
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'open-button';
  openButton.textContent = 'Open in Builder';
  openButton.addEventListener('click', () => {
    window.location.href = `index.html?creatureId=${encodeURIComponent(creature.id)}`;
  });

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete-button';
  deleteButton.textContent = 'Delete Creature';
  deleteButton.addEventListener('click', () => {
    handleDeleteCreature(creature, deleteButton, openButton).catch(() => {});
  });

  actions.append(openButton, deleteButton);

  card.append(title, subtitle, featuresWrapper, description, actions);
  return card;
}

function compareStrings(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
}

function normalizeMatchValue(value) {
  return value ? String(value).trim().toLowerCase() : '';
}

function parseLevelValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getFilteredCreatures() {
  const min = parseLevelValue(filterState.levelMin);
  const max = parseLevelValue(filterState.levelMax);
  const roleFilter = normalizeMatchValue(filterState.role);
  const sizeFilter = normalizeMatchValue(filterState.size);
  const typeFilter = normalizeMatchValue(filterState.type);
  const powerFilter = normalizeMatchValue(filterState.power);

  return currentCreatures.filter((creature) => {
    const creatureLevel = parseLevelValue(creature.level);
    if (min !== null) {
      if (creatureLevel === null || creatureLevel < min) {
        return false;
      }
    }
    if (max !== null) {
      if (creatureLevel === null || creatureLevel > max) {
        return false;
      }
    }

    const creatureRole = normalizeMatchValue(creature.role || creature.base?.role);
    if (roleFilter && creatureRole !== roleFilter) {
      return false;
    }

    const creatureSize = normalizeMatchValue(creature.size || creature.base?.size);
    if (sizeFilter && creatureSize !== sizeFilter) {
      return false;
    }

    const creatureType = normalizeMatchValue(creature.type || creature.base?.type);
    if (typeFilter && creatureType !== typeFilter) {
      return false;
    }

    const creaturePower = normalizeMatchValue(creature.power || creature.base?.power);
    if (powerFilter && creaturePower !== powerFilter) {
      return false;
    }

    return true;
  });
}

function sortCreatures(creatures) {
  const { key, direction } = sortState;
  const multiplier = direction === 'desc' ? -1 : 1;

  return creatures.sort((a, b) => {
    let result = 0;
    if (key === 'level') {
      const levelAValue = Number(a.level);
      const levelBValue = Number(b.level);
      const levelA = Number.isFinite(levelAValue) ? levelAValue : -Infinity;
      const levelB = Number.isFinite(levelBValue) ? levelBValue : -Infinity;
      result = levelA - levelB;
    } else if (key === 'size') {
      result = compareStrings(formatLabel(a.size || ''), formatLabel(b.size || ''));
    } else if (key === 'power') {
      result = compareStrings(formatLabel(a.power || ''), formatLabel(b.power || ''));
    } else if (key === 'role') {
      result = compareStrings(formatLabel(a.role || ''), formatLabel(b.role || ''));
    } else if (key === 'type') {
      result = compareStrings(formatLabel(a.type || ''), formatLabel(b.type || ''));
    } else {
      result = compareStrings((a.name || '').toString(), (b.name || '').toString());
    }

    if (result === 0 && a.id && b.id) {
      return a.id.localeCompare(b.id) * multiplier;
    }

    return result * multiplier;
  });
}

function updateSortIndicators() {
  sortButtons.forEach((button) => {
    const key = button.dataset.sortKey;
    if (!key) return;
    if (key === sortState.key) {
      button.dataset.direction = sortState.direction;
      button.dataset.indicator = sortState.direction === 'asc' ? '↑' : '↓';
    } else {
      delete button.dataset.direction;
      delete button.dataset.indicator;
    }
  });

  sortHeaders.forEach((header) => {
    const key = header.dataset.sortKey;
    if (!key) return;
    if (key === sortState.key) {
      header.dataset.direction = sortState.direction;
      header.dataset.indicator = sortState.direction === 'asc' ? '↑' : '↓';
    } else {
      delete header.dataset.direction;
      delete header.dataset.indicator;
    }
  });
}

function applySortAndRender() {
  const filtered = getFilteredCreatures();
  const dataset = sortCreatures([...filtered]);
  renderCreatureList(dataset, currentFeatures);
  renderCreatureTable(dataset, currentFeatures);
  updateSortIndicators();
  if (currentCreatures.length && dataset.length === 0) {
    if (pageStatus && pageStatus.dataset.variant !== 'error' && pageStatus.dataset.variant !== 'success') {
      setStatus('info', 'No creatures match the current filters.');
    }
  } else if (pageStatus && pageStatus.dataset.variant === 'info' && pageStatus.textContent === 'No creatures match the current filters.') {
    setStatus();
  }
}

async function loadUserCreatures(user, { showLoading = true } = {}) {
  if (!user || isLoading) return;
  isLoading = true;

  if (showLoading) {
    setStatus('info', 'Loading your creatures…');
  }
  ensureListEmptyState(true);
  if (creaturesList) creaturesList.innerHTML = '';

  try {
    const [featuresById, snapshot] = await Promise.all([
      featuresPromise,
      getDocs(query(collection(db, CREATURES_COLLECTION), where('ownerId', '==', user.uid))),
    ]);

    currentFeatures = featuresById;
    currentCreatures = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    applySortAndRender();
    if (currentCreatures.length === 0) {
      setStatus('info', 'No creatures yet. Save one from the builder to see it here.');
    } else if (showLoading) {
      setStatus();
    }
  } catch (error) {
    console.error('Failed to load creatures', error);
    setStatus('error', 'Failed to load your creatures. Please try again later.');
    ensureListEmptyState(true);
    if (tableContainer) tableContainer.dataset.empty = 'true';
  } finally {
    isLoading = false;
  }
}

function renderCreatureList(creatures, featuresById) {
  if (!creaturesList) return;

  creaturesList.innerHTML = '';

  const hasCreatures = Array.isArray(creatures) && creatures.length > 0;
  ensureListEmptyState(!hasCreatures);
  if (!hasCreatures) return;

  creatures.forEach((creature) => {
    creaturesList.appendChild(createCreatureCard(creature, featuresById));
  });
}

function renderCreatureTable(creatures, featuresById) {
  if (!tableBody || !tableContainer) return;

  tableBody.innerHTML = '';

  const hasCreatures = Array.isArray(creatures) && creatures.length > 0;
  tableContainer.dataset.empty = hasCreatures ? 'false' : 'true';

  if (!hasCreatures) return;

  creatures.forEach((creature) => {
    const row = document.createElement('tr');
    const levelValue = Number(creature.level);
    const levelDisplay = Number.isFinite(levelValue) ? levelValue : '—';

    const cells = [
      creature.name || 'Unnamed Creature',
      formatLabel(creature.size),
      formatLabel(creature.type),
      levelDisplay,
      formatLabel(creature.power || 'normal'),
      formatLabel(creature.role || 'none'),
    ];

    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions-cell';

    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'table-actions';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'open-button';
    openButton.textContent = 'Open';
    openButton.addEventListener('click', () => {
      window.location.href = `index.html?creatureId=${encodeURIComponent(creature.id)}`;
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      handleDeleteCreature(creature, deleteButton, openButton).catch(() => {});
    });

    actionsWrapper.append(openButton, deleteButton);
    actionsCell.appendChild(actionsWrapper);
    row.appendChild(actionsCell);

    tableBody.appendChild(row);
  });
}

async function handleDeleteCreature(creature, deleteButton, openButton) {
  if (!creature || !creature.id) return;
  const creatureName = creature.name || 'this creature';
  const confirmed = window.confirm(`Delete ${creatureName}? This cannot be undone.`);
  if (!confirmed) return;

  deleteButton.disabled = true;
  if (openButton) openButton.disabled = true;
  try {
    setStatus('info', `Deleting ${creatureName}…`);
    await deleteDoc(doc(db, CREATURES_COLLECTION, creature.id));
    await loadUserCreatures(currentUser, { showLoading: false });
    setStatus('success', `Deleted ${creatureName}.`);
  } catch (error) {
    console.error('Failed to delete creature', error);
    setStatus('error', `Could not delete ${creatureName}. Please try again.`);
    deleteButton.disabled = false;
    if (openButton) openButton.disabled = false;
  }
}

sortButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.sortKey;
    if (!key) return;

    if (sortState.key === key) {
      sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.key = key;
      sortState.direction = 'asc';
    }

    applySortAndRender();
  });
});

updateSortIndicators();

function handleFilterInput(event) {
  const target = event.target;
  if (!target || !target.name) return;
  const { name } = target;

  if (name === 'levelMin' || name === 'levelMax') {
    const numeric = parseLevelValue(target.value);
    filterState[name === 'levelMin' ? 'levelMin' : 'levelMax'] = numeric;
    applySortAndRender();
    return;
  }

  if (name === 'filterPower') {
    filterState.power = target.value || '';
    applySortAndRender();
    return;
  }

  if (name === 'filterRole') {
    filterState.role = target.value || '';
    applySortAndRender();
    return;
  }

  if (name === 'filterType') {
    filterState.type = target.value || '';
    applySortAndRender();
    return;
  }

  if (name === 'filterSize') {
    filterState.size = target.value || '';
    applySortAndRender();
  }
}

if (filterForm) {
  filterForm.addEventListener('change', handleFilterInput);
  filterForm.addEventListener('input', handleFilterInput);
}

if (filterClearButton) {
  filterClearButton.addEventListener('click', () => {
    filterState = { ...defaultFilterState };
    if (filterForm) {
      filterForm.reset();
    }
    if (filterLevelMinInput) filterLevelMinInput.value = '';
    if (filterLevelMaxInput) filterLevelMaxInput.value = '';
    applySortAndRender();
  });
}

if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    signOut(auth)
      .then(() => {
        window.location.href = 'auth.html';
      })
      .catch((error) => {
        console.error('Sign out failed', error);
        setStatus('error', 'Could not sign out. Please try again.');
      });
  });
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!user) {
    setStatus('info', 'Sign in to view your saved creatures.');
    if (creaturesList) {
      creaturesList.innerHTML = '';
    }
    ensureListEmptyState(true);
    return;
  }

  loadUserCreatures(user).catch(() => {});
});

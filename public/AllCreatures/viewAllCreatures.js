import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { auth, db } from '../firebaseClient.js';

const CREATURES_COLLECTION = 'VanillaCreatures';
const CREATURE_LIKES_SUBCOLLECTION = 'likes';
const DEFAULT_FETCH_LIMIT = 200;

const dom = {
  footerYear: document.getElementById('footerYear'),
  resultsMeta: document.getElementById('resultsMeta'),
  resultsLoading: document.getElementById('resultsLoading'),
  resultsEmpty: document.getElementById('resultsEmpty'),
  creatureGrid: document.getElementById('creatureGrid'),
  searchInput: document.getElementById('filterSearch'),
  levelMin: document.getElementById('filterLevelMin'),
  levelMax: document.getElementById('filterLevelMax'),
  roleSelect: document.getElementById('filterRole'),
  powerSelect: document.getElementById('filterPower'),
  sizeSelect: document.getElementById('filterSize'),
  typeSelect: document.getElementById('filterType'),
  likedCheckbox: document.getElementById('filterLiked'),
  clearFiltersButton: document.getElementById('clearFilters'),
  sortSelect: document.getElementById('sortSelect'),
  logoutButton: document.getElementById('logoutButton'),
};

const defaultFilters = {
  search: '',
  role: '',
  power: '',
  size: '',
  type: '',
  levelMin: null,
  levelMax: null,
  onlyLiked: false,
  sort: 'newest',
};

const state = {
  filters: { ...defaultFilters },
  creatures: [],
  filtered: [],
  isLoading: false,
  currentUser: null,
};

let searchDebounceId = null;

function setFooterYear() {
  if (dom.footerYear) {
    dom.footerYear.textContent = new Date().getFullYear();
  }
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  if (dom.resultsLoading) {
    dom.resultsLoading.classList.toggle('is-hidden', !isLoading);
  }
}

function resolveLikeCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
}

function formatLabel(value) {
  if (!value) return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function coerceNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normaliseString(value) {
  return value ? String(value).toLowerCase() : '';
}

function updateLikeButton(button, creature) {
  if (!button) return;
  const likes = resolveLikeCount(creature?.totalLikes);
  const hasCreature = Boolean(creature && creature.id);
  const isLiked = Boolean(creature?.isLikedByCurrentUser);
  button.dataset.creatureId = hasCreature ? creature.id : '';
  button.dataset.liked = isLiked ? 'true' : 'false';
  button.setAttribute('aria-pressed', isLiked ? 'true' : 'false');
  const actionLabel = isLiked ? `Unlike (${likes} likes)` : `Like (${likes} likes)`;
  button.setAttribute('aria-label', actionLabel);
  button.title = actionLabel;
  button.textContent = `${isLiked ? '♥' : '♡'} ${likes}`;
  button.disabled = !hasCreature;
}

function createLikeButton(creature) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'creature-like-button';
  updateLikeButton(button, creature);
  button.addEventListener('click', () => handleToggleLike(creature, button));
  return button;
}

async function handleToggleLike(creature, button) {
  if (!creature || !creature.id) return;
  if (!state.currentUser) {
    window.location.href = '../Auth/auth.html';
    return;
  }

  if (button) button.disabled = true;

  let updatedState = null;
  try {
    await runTransaction(db, async (tx) => {
      const creatureRef = doc(db, CREATURES_COLLECTION, creature.id);
      const likeRef = doc(
        db,
        CREATURES_COLLECTION,
        creature.id,
        CREATURE_LIKES_SUBCOLLECTION,
        state.currentUser.uid
      );

      const creatureSnap = await tx.get(creatureRef);
      if (!creatureSnap.exists()) {
        throw new Error('Creature document does not exist.');
      }

      const existingData = creatureSnap.data() || {};
      const currentLikes = resolveLikeCount(existingData.totalLikes);
      const likeSnap = await tx.get(likeRef);

      if (likeSnap.exists()) {
        const nextLikes = Math.max(0, currentLikes - 1);
        tx.delete(likeRef);
        tx.update(creatureRef, { totalLikes: nextLikes });
        updatedState = { totalLikes: nextLikes, isLiked: false };
      } else {
        const nextLikes = currentLikes + 1;
        tx.set(likeRef, {
          userId: state.currentUser.uid,
          createdAt: serverTimestamp(),
        });
        tx.update(creatureRef, {
          totalLikes: nextLikes,
          lastLikeAt: serverTimestamp(),
        });
        updatedState = { totalLikes: nextLikes, isLiked: true };
      }
    });
  } catch (error) {
    console.error('Failed to toggle like', error);
    updatedState = null;
  } finally {
    if (button) button.disabled = false;
  }

  if (updatedState) {
    creature.totalLikes = updatedState.totalLikes;
    creature.isLikedByCurrentUser = updatedState.isLiked;
    applyFilters();
  }
}

async function annotateLikesForCreatures(user) {
  if (!user) {
    state.creatures.forEach((creature) => {
      creature.isLikedByCurrentUser = false;
    });
    applyFilters();
    return;
  }

  const tasks = state.creatures.map((creature) => {
    if (!creature?.id) return Promise.resolve();
    const likeRef = doc(
      db,
      CREATURES_COLLECTION,
      creature.id,
      CREATURE_LIKES_SUBCOLLECTION,
      user.uid
    );
    return getDoc(likeRef)
      .then((likeSnap) => {
        creature.isLikedByCurrentUser = likeSnap.exists();
      })
      .catch(() => {
        creature.isLikedByCurrentUser = false;
      });
  });

  await Promise.all(tasks);
  applyFilters();
}

function formatCreatureDoc(docSnap) {
  if (!docSnap) return null;
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    name: data.name || 'Unnamed Creature',
    shortDescription: data.shortDescription || data.base?.shortDescription || '',
    longDescription: data.longDescription || data.base?.longDescription || '',
    level: coerceNumber(data.level ?? data.base?.level),
    role: data.role || data.base?.role || '',
    power: data.power || data.base?.power || '',
    size: data.size || data.base?.size || '',
    type: data.type || data.base?.type || '',
    totalLikes: resolveLikeCount(data.totalLikes),
    savedAt: data.savedAt ?? null,
    lastLikeAt: data.lastLikeAt ?? null,
    stats: data.stats || {},
    traits: data.traits || data.base?.traits || {},
    selectedFeatures: Array.isArray(data.selectedFeatures) ? data.selectedFeatures : [],
    isLikedByCurrentUser: false,
  };
}

async function fetchCreatures() {
  setLoading(true);
  dom.resultsMeta.textContent = 'Fetching community creatures…';
  console.debug('[AllCreatures] fetchCreatures invoked');

  try {
    console.debug('[AllCreatures] Building creatures query', {
      collection: CREATURES_COLLECTION,
      orderBy: 'savedAt desc',
      limit: DEFAULT_FETCH_LIMIT,
    });
    const creaturesQuery = query(
      collection(db, CREATURES_COLLECTION),
      orderBy('savedAt', 'desc'),
      limit(DEFAULT_FETCH_LIMIT)
    );
    console.debug('[AllCreatures] Executing query…');
    const snapshot = await getDocs(creaturesQuery);
    console.debug('[AllCreatures] Query returned', { size: snapshot.size, empty: snapshot.empty });
    state.creatures = snapshot.docs.map(formatCreatureDoc).filter(Boolean);
    console.debug('[AllCreatures] Parsed creature docs', {
      parsedCount: state.creatures.length,
      first: state.creatures[0],
    });
    dom.resultsMeta.textContent = `Loaded ${state.creatures.length} creatures.`;
  } catch (error) {
    console.error('[AllCreatures] Failed to fetch creatures', error);
    dom.resultsMeta.textContent = 'Failed to load creatures. Please try again.';
  } finally {
    console.debug('[AllCreatures] fetchCreatures complete');
    setLoading(false);
  }
}

function collectFilters() {
  state.filters.search = dom.searchInput?.value.trim() ?? '';
  state.filters.role = dom.roleSelect?.value ?? '';
  state.filters.power = dom.powerSelect?.value ?? '';
  state.filters.size = dom.sizeSelect?.value ?? '';
  state.filters.type = dom.typeSelect?.value ?? '';
  state.filters.onlyLiked = dom.likedCheckbox?.checked ?? false;
  state.filters.levelMin = coerceNumber(dom.levelMin?.value);
  state.filters.levelMax = coerceNumber(dom.levelMax?.value);
  state.filters.sort = dom.sortSelect?.value ?? 'newest';
}

function passesLevelFilter(creature, minLevel, maxLevel) {
  const level = coerceNumber(creature.level);
  if (minLevel != null && (level == null || level < minLevel)) return false;
  if (maxLevel != null && (level == null || level > maxLevel)) return false;
  return true;
}

function matchesSearch(creature, term) {
  if (!term) return true;
  const haystack = [
    creature.name,
    creature.shortDescription,
    creature.longDescription,
    creature.role,
    creature.power,
    creature.type,
    creature.size,
    ...(creature.selectedFeatures || []),
    ...(creature.traits?.resistances?.damage || []),
    ...(creature.traits?.resistances?.condition || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(term.toLowerCase());
}

function applyFilters() {
  collectFilters();

  let filtered = [...state.creatures];
  console.debug('[AllCreatures] applyFilters', {
    filters: state.filters,
    totalCreatures: state.creatures.length,
  });
  const {
    search,
    role,
    power,
    size,
    type,
    onlyLiked,
    levelMin,
    levelMax,
    sort,
  } = state.filters;

  if (onlyLiked) {
    console.debug('[AllCreatures] Filtering liked only');
    filtered = filtered.filter((creature) => creature.isLikedByCurrentUser);
  }

  const trimmedSearch = search?.trim() ?? '';
  if (trimmedSearch.length >= 2) {
    console.debug('[AllCreatures] Filtering by search', trimmedSearch);
    filtered = filtered.filter((creature) => matchesSearch(creature, trimmedSearch));
  } else if (trimmedSearch.length > 0 && trimmedSearch.length < 2) {
    console.debug('[AllCreatures] Ignoring search shorter than 2 chars', trimmedSearch);
  }

  if (role) {
    console.debug('[AllCreatures] Filtering by role', role);
    const normalisedRole = normaliseString(role);
    filtered = filtered.filter((creature) => normaliseString(creature.role) === normalisedRole);
  }

  if (power) {
    console.debug('[AllCreatures] Filtering by power', power);
    const normalisedPower = normaliseString(power);
    filtered = filtered.filter((creature) => normaliseString(creature.power) === normalisedPower);
  }

  if (size) {
    console.debug('[AllCreatures] Filtering by size', size);
    const normalisedSize = normaliseString(size);
    filtered = filtered.filter((creature) => normaliseString(creature.size) === normalisedSize);
  }

  if (type) {
    console.debug('[AllCreatures] Filtering by type', type);
    const normalisedType = normaliseString(type);
    filtered = filtered.filter((creature) => normaliseString(creature.type) === normalisedType);
  }

  if (levelMin != null || levelMax != null) {
    console.debug('[AllCreatures] Filtering by level range', { levelMin, levelMax });
    filtered = filtered.filter((creature) => passesLevelFilter(creature, levelMin, levelMax));
  }

  switch (sort) {
    case 'likes':
      console.debug('[AllCreatures] Sorting by likes');
      filtered.sort((a, b) => b.totalLikes - a.totalLikes || compareSavedAt(b, a));
      break;
    case 'levelDesc':
      console.debug('[AllCreatures] Sorting by level desc');
      filtered.sort(
        (a, b) => (coerceNumber(b.level) ?? 0) - (coerceNumber(a.level) ?? 0) || compareSavedAt(b, a)
      );
      break;
    case 'levelAsc':
      console.debug('[AllCreatures] Sorting by level asc');
      filtered.sort(
        (a, b) => (coerceNumber(a.level) ?? 0) - (coerceNumber(b.level) ?? 0) || compareSavedAt(b, a)
      );
      break;
    case 'newest':
    default:
      console.debug('[AllCreatures] Sorting by newest');
      filtered.sort((a, b) => compareSavedAt(b, a));
      break;
  }

  state.filtered = filtered;
  console.debug('[AllCreatures] Filtered results', {
    visible: filtered.length,
    first: filtered[0],
  });
  renderCreatures();
}

function compareSavedAt(a, b) {
  const dateA = toDate(a.savedAt)?.getTime() ?? 0;
  const dateB = toDate(b.savedAt)?.getTime() ?? 0;
  return dateA - dateB;
}

function renderCreatures() {
  const total = state.creatures.length;
  const visible = state.filtered.length;

  if (dom.resultsMeta) {
    if (!total && !state.isLoading) {
      dom.resultsMeta.textContent = 'No community creatures have been published yet.';
    } else {
      dom.resultsMeta.textContent = `Showing ${visible} of ${total} creatures`;
    }
  }

  if (!dom.creatureGrid) return;

  dom.creatureGrid.innerHTML = '';

  if (!visible && !state.isLoading) {
    dom.resultsEmpty?.classList.remove('is-hidden');
  } else {
    dom.resultsEmpty?.classList.add('is-hidden');
  }

  state.filtered.forEach((creature) => {
    dom.creatureGrid.appendChild(createCreatureCard(creature));
  });
}

function createCreatureCard(creature) {
  const card = document.createElement('article');
  card.className = 'creature-card';

  const header = document.createElement('header');
  header.className = 'creature-card__header';

  const title = document.createElement('h3');
  title.textContent = creature.name || 'Unnamed Creature';
  header.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'creature-card__meta';
  meta.textContent = createMetaLine(creature);
  header.appendChild(meta);

  const badges = document.createElement('div');
  badges.className = 'badge-row';
  [creature.role, creature.power, creature.size, creature.type]
    .filter(Boolean)
    .forEach((value) => {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = formatLabel(value);
      badges.appendChild(badge);
    });

  if (badges.childElementCount) {
    header.appendChild(badges);
  }

  card.appendChild(header);

  const description = document.createElement('p');
  description.className = 'creature-description';
  description.textContent =
    creature.shortDescription || 'No short description has been provided yet.';
  card.appendChild(description);

  const statline = document.createElement('div');
  statline.className = 'creature-statline';
  const stats = creature.stats || {};
  const statEntries = [
    ['HP', stats.HP ?? '—'],
    ['PD', formatDefense(summaryDefense(stats.PD, stats.PDHeavy, stats.PDBrutal))],
    ['AD', formatDefense(summaryDefense(stats.AD, stats.ADHeavy, stats.ADBrutal))],
    ['DMG', stats.damage ?? creature.damage ?? '—'],
    ['SPD', stats.speed ?? creature.speed ?? '—'],
    ['AP', stats.AP ?? creature.AP ?? '—'],
  ];
  statEntries.forEach(([label, value]) => {
    const span = document.createElement('span');
    span.textContent = `${label}: ${value}`;
    statline.appendChild(span);
  });
  card.appendChild(statline);

  const actions = document.createElement('div');
  actions.className = 'creature-actions';

  const likeButton = createLikeButton(creature);
  actions.appendChild(likeButton);

  const viewLink = document.createElement('a');
  viewLink.className = 'creature-view-button';
  viewLink.textContent = 'View in Builder';
  if (creature.id) {
    viewLink.href = `../CreateCreature/createCreature.html?creatureId=${encodeURIComponent(
      creature.id
    )}`;
  } else {
    viewLink.href = '../CreateCreature/createCreature.html';
  }
  actions.appendChild(viewLink);

  card.appendChild(actions);

  return card;
}

function createMetaLine(creature) {
  const level = coerceNumber(creature.level);
  const parts = [];
  if (level != null) {
    parts.push(`Level ${level}`);
  }

  if (creature.role) {
    parts.push(formatLabel(creature.role));
  }

  if (creature.power) {
    parts.push(formatLabel(creature.power));
  }

  const saved = toDate(creature.savedAt);
  if (saved) {
    parts.push(`Saved ${saved.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  }

  return parts.join(' • ');
}

function summaryDefense(base, heavy, brutal) {
  if (base == null) return null;
  const baseValue = Number(base) || 0;
  const heavyValue = Number.isFinite(Number(heavy)) ? Number(heavy) : baseValue + 5;
  const brutalValue = Number.isFinite(Number(brutal)) ? Number(brutal) : baseValue + 10;
  return [baseValue, heavyValue, brutalValue];
}

function formatDefense(values) {
  if (!values) return '-- / -- / --';
  return values.join(' / ');
}

function attachEventListeners() {
  if (dom.searchInput) {
    dom.searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceId);
      searchDebounceId = setTimeout(applyFilters, 200);
    });
  }

  [
    dom.levelMin,
    dom.levelMax,
    dom.roleSelect,
    dom.powerSelect,
    dom.sizeSelect,
    dom.typeSelect,
    dom.likedCheckbox,
    dom.sortSelect,
  ]
    .filter(Boolean)
    .forEach((input) => {
      input.addEventListener('change', applyFilters);
    });

  if (dom.logoutButton) {
    dom.logoutButton.addEventListener('click', () => {
      signOut(auth).then(() => { window.location.href = '../Auth/auth.html'; });
    });
  }

  if (dom.clearFiltersButton) {
    dom.clearFiltersButton.addEventListener('click', () => {
      Object.assign(state.filters, { ...defaultFilters });
      if (dom.searchInput) dom.searchInput.value = '';
      if (dom.levelMin) dom.levelMin.value = '';
      if (dom.levelMax) dom.levelMax.value = '';
      if (dom.roleSelect) dom.roleSelect.value = '';
      if (dom.powerSelect) dom.powerSelect.value = '';
      if (dom.sizeSelect) dom.sizeSelect.value = '';
      if (dom.typeSelect) dom.typeSelect.value = '';
      if (dom.likedCheckbox) dom.likedCheckbox.checked = false;
      if (dom.sortSelect) dom.sortSelect.value = 'newest';
      applyFilters();
    });
  }
}

function initializeAuthListener() {
  onAuthStateChanged(auth, (user) => {
    state.currentUser = user;
    annotateLikesForCreatures(user).catch((error) =>
      console.warn('Failed to refresh like annotations', error)
    );
  });
}

async function bootstrap() {
  console.debug('[AllCreatures] bootstrap start');
  setFooterYear();
  attachEventListeners();
  initializeAuthListener();
  await fetchCreatures();
  await annotateLikesForCreatures(state.currentUser);
  applyFilters();
  console.debug('[AllCreatures] bootstrap complete');
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap creature library', error);
  setLoading(false);
  if (dom.resultsMeta) {
    dom.resultsMeta.textContent = 'Unable to load the creature library right now.';
  }
});

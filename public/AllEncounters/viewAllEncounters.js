/**
 * viewAllEncounters.js
 * Community encounter browse page — fetch, filter, and render.
 */
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { auth, db } from '../firebaseClient.js';
import { updateNavAuth } from '../navAuth.js';
import { loadPublicEncounters } from '../Encounters/js/encounterFirebase.js';
import { ENVIRONMENT_TAGS } from '../constants/encounterTags.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const dom = {
  footerYear:      document.getElementById('footerYear'),
  resultsMeta:     document.getElementById('resultsMeta'),
  resultsLoading:  document.getElementById('resultsLoading'),
  resultsEmpty:    document.getElementById('resultsEmpty'),
  encounterGrid:   document.getElementById('encounterGrid'),
  filterSearch:    document.getElementById('filterSearch'),
  filterDifficulty:document.getElementById('filterDifficulty'),
  filterMonsterMin:document.getElementById('filterMonsterMin'),
  filterMonsterMax:document.getElementById('filterMonsterMax'),
  filterBoss:      document.getElementById('filterBoss'),
  filterApex:      document.getElementById('filterApex'),
  filterEnvTags:   document.getElementById('filterEnvTags'),
  clearFilters:    document.getElementById('clearFilters'),
  logoutButton:    document.getElementById('logoutButton'),
};

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  encounters: [],
  activeEnvTags: new Set(),
  currentUser: null,
};

let searchDebounceId = null;

// ── Power multipliers (mirrors encounterBudget.js) ────────────────────────────

const POWER_MULT = { minion: 0.5, weak: 0.7, normal: 1.0, apex: 2.0, legendary: 4.0 };

function computeBudget(enc) {
  const partyBudget = (enc.party || []).reduce((s, p) => s + (Number(p.level) || 0), 0);
  const monsterTotal = (enc.monsters || []).reduce((s, m) => {
    const mult = POWER_MULT[m.power] ?? 1.0;
    const lvl  = Math.max(0, (m.baseLevel || 0) + (m.levelDelta || 0));
    return s + lvl * mult;
  }, 0);
  const pct = partyBudget > 0 ? (monsterTotal / partyBudget) * 100 : 0;
  let difficulty;
  if (pct < 75)       difficulty = 'easy';
  else if (pct < 125) difficulty = 'fair';
  else if (pct < 175) difficulty = 'hard';
  else                difficulty = 'deadly';
  return { partyBudget, monsterTotal, pct, difficulty };
}

function getAutoTags(enc) {
  const powers = (enc.monsters || []).map(m => m.power);
  const tags = [];
  if (powers.includes('legendary')) tags.push('Boss');
  if (powers.includes('apex'))      tags.push('Apex');
  return tags;
}

// ── Env tag chip setup ────────────────────────────────────────────────────────

function buildEnvTagFilter() {
  const container = dom.filterEnvTags;
  if (!container) return;

  for (const tag of ENVIRONMENT_TAGS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'enc-env-tag-chip';
    chip.textContent = tag.label;
    chip.dataset.tagValue = tag.value;

    chip.addEventListener('click', () => {
      if (state.activeEnvTags.has(tag.value)) {
        state.activeEnvTags.delete(tag.value);
        chip.classList.remove('is-active');
      } else {
        state.activeEnvTags.add(tag.value);
        chip.classList.add('is-active');
      }
      applyFilters();
    });

    container.appendChild(chip);
  }
}

function clearEnvTagChips() {
  state.activeEnvTags.clear();
  dom.filterEnvTags?.querySelectorAll('.enc-env-tag-chip').forEach(c => c.classList.remove('is-active'));
}

// ── Filtering ─────────────────────────────────────────────────────────────────

function applyFilters() {
  const search     = dom.filterSearch?.value.trim().toLowerCase() ?? '';
  const difficulty = dom.filterDifficulty?.value ?? '';
  const monsterMin = Number(dom.filterMonsterMin?.value) || 0;
  const monsterMax = Number(dom.filterMonsterMax?.value) || 0;
  const bossOnly   = dom.filterBoss?.checked ?? false;
  const apexOnly   = dom.filterApex?.checked ?? false;
  const envTags    = [...state.activeEnvTags];

  let filtered = state.encounters.filter(enc => {
    // Text search
    if (search.length >= 2) {
      const haystack = [enc.name, enc.description].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    // Environment tags (any match)
    if (envTags.length) {
      const encTags = enc.tags || [];
      if (!envTags.some(t => encTags.includes(t))) return false;
    }

    // Auto-tags
    const auto = getAutoTags(enc);
    if (bossOnly && !auto.includes('Boss')) return false;
    if (apexOnly && !auto.includes('Apex')) return false;

    // Difficulty
    if (difficulty) {
      const { difficulty: diff } = computeBudget(enc);
      if (diff !== difficulty) return false;
    }

    // Monster count
    const mc = (enc.monsters || []).length;
    if (monsterMin && mc < monsterMin) return false;
    if (monsterMax && mc > monsterMax) return false;

    return true;
  });

  renderEncounters(filtered);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderEncounters(filtered) {
  const total   = state.encounters.length;
  const visible = filtered.length;

  if (dom.resultsMeta) {
    if (!total) {
      dom.resultsMeta.textContent = 'No public encounters have been shared yet.';
    } else {
      dom.resultsMeta.textContent = `Showing ${visible} of ${total} encounters`;
    }
  }

  if (!dom.encounterGrid) return;
  dom.encounterGrid.innerHTML = '';

  if (!visible) {
    dom.resultsEmpty?.classList.remove('is-hidden');
  } else {
    dom.resultsEmpty?.classList.add('is-hidden');
  }

  for (const enc of filtered) {
    dom.encounterGrid.appendChild(buildCard(enc));
  }
}

function buildCard(enc) {
  const { difficulty } = computeBudget(enc);
  const autoTags    = getAutoTags(enc);
  const envTags     = enc.tags || [];
  const monCount    = (enc.monsters || []).length;
  const playerCount = (enc.party || []).length;

  const card = document.createElement('article');
  card.className = 'enc-community-card';

  // Header
  const header = document.createElement('header');
  header.className = 'enc-community-card__header';

  const title = document.createElement('h3');
  title.textContent = enc.name || 'Unnamed Encounter';
  header.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'enc-card-meta';
  const parts = [];
  if (playerCount) parts.push(`${playerCount} player${playerCount !== 1 ? 's' : ''}`);
  if (monCount)    parts.push(`${monCount} monster${monCount !== 1 ? 's' : ''}`);
  if (enc.owner?.displayName) parts.push(`by ${enc.owner.displayName}`);
  meta.textContent = parts.join(' · ');
  header.appendChild(meta);

  // Badge row: difficulty + auto-tags + env tags
  const badgeRow = document.createElement('div');
  badgeRow.className = 'enc-badge-row';

  const diffBadge = document.createElement('span');
  diffBadge.className = `enc-badge enc-badge--difficulty-${difficulty}`;
  diffBadge.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  badgeRow.appendChild(diffBadge);

  for (const at of autoTags) {
    const b = document.createElement('span');
    b.className = `enc-badge enc-badge--${at.toLowerCase()}`;
    b.textContent = at;
    badgeRow.appendChild(b);
  }

  // Find env tag labels
  const tagLabelMap = Object.fromEntries(ENVIRONMENT_TAGS.map(t => [t.value, t.label]));
  for (const tagValue of envTags) {
    const b = document.createElement('span');
    b.className = 'enc-badge enc-badge--env';
    b.textContent = tagLabelMap[tagValue] || tagValue;
    badgeRow.appendChild(b);
  }

  header.appendChild(badgeRow);
  card.appendChild(header);

  // Description
  if (enc.description) {
    const desc = document.createElement('p');
    desc.className = 'enc-card-description';
    desc.textContent = enc.description;
    card.appendChild(desc);
  }

  // Footer: owner + open link
  const footer = document.createElement('div');
  footer.className = 'enc-card-footer';

  const saved = enc.savedAt ? new Date(enc.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const footerMeta = document.createElement('span');
  footerMeta.textContent = saved;
  footer.appendChild(footerMeta);

  const openBtn = document.createElement('a');
  openBtn.className = 'enc-card-open-btn';
  openBtn.textContent = 'Open in Builder';
  openBtn.href = `../Encounters/encounters.html?encounterId=${encodeURIComponent(enc.id)}`;
  footer.appendChild(openBtn);

  const runBtn = document.createElement('a');
  runBtn.className = 'enc-card-run-btn';
  runBtn.textContent = '▶ Run';
  runBtn.href = `../RunEncounter/runEncounter.html?encounterId=${encodeURIComponent(enc.id)}`;
  footer.appendChild(runBtn);

  card.appendChild(footer);

  return card;
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function fetchEncounters() {
  dom.resultsLoading?.classList.remove('is-hidden');
  dom.resultsEmpty?.classList.add('is-hidden');

  try {
    state.encounters = await loadPublicEncounters();
    dom.resultsMeta.textContent = `Loaded ${state.encounters.length} encounters.`;
  } catch (err) {
    console.error('[AllEncounters] Failed to fetch', err);
    if (dom.resultsMeta) dom.resultsMeta.textContent = 'Failed to load encounters. Please try again.';
  } finally {
    dom.resultsLoading?.classList.add('is-hidden');
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

function attachListeners() {
  if (dom.filterSearch) {
    dom.filterSearch.addEventListener('input', () => {
      clearTimeout(searchDebounceId);
      searchDebounceId = setTimeout(applyFilters, 200);
    });
  }

  [dom.filterDifficulty, dom.filterBoss, dom.filterApex].filter(Boolean).forEach(el => {
    el.addEventListener('change', applyFilters);
  });

  [dom.filterMonsterMin, dom.filterMonsterMax].filter(Boolean).forEach(el => {
    el.addEventListener('input', applyFilters);
  });

  if (dom.clearFilters) {
    dom.clearFilters.addEventListener('click', () => {
      if (dom.filterSearch)      dom.filterSearch.value = '';
      if (dom.filterDifficulty)  dom.filterDifficulty.value = '';
      if (dom.filterMonsterMin)  dom.filterMonsterMin.value = '';
      if (dom.filterMonsterMax)  dom.filterMonsterMax.value = '';
      if (dom.filterBoss)        dom.filterBoss.checked = false;
      if (dom.filterApex)        dom.filterApex.checked = false;
      clearEnvTagChips();
      applyFilters();
    });
  }

  if (dom.logoutButton) {
    dom.logoutButton.addEventListener('click', () => {
      signOut(auth).then(() => { window.location.href = '../Auth/auth.html'; });
    });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  if (dom.footerYear) dom.footerYear.textContent = new Date().getFullYear();

  buildEnvTagFilter();
  attachListeners();

  onAuthStateChanged(auth, user => {
    state.currentUser = user;
    updateNavAuth(user, db);
  });

  await fetchEncounters();
  applyFilters();
}

bootstrap().catch(err => {
  console.error('[AllEncounters] bootstrap failed', err);
  dom.resultsLoading?.classList.add('is-hidden');
  if (dom.resultsMeta) dom.resultsMeta.textContent = 'Unable to load the encounter library right now.';
});

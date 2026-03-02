import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { updateNavAuth } from '../navAuth.js';
import { ENVIRONMENT_TAGS } from '../constants/encounterTags.js';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { auth, db } from '../firebaseClient.js';

const ENCOUNTERS_COL = 'VanillaEncounters';

const POWER_MULT = { minion: 0.5, weak: 0.7, normal: 1.0, apex: 2.0, legendary: 4.0 };

const ENV_TAG_LABELS = Object.fromEntries(ENVIRONMENT_TAGS.map(t => [t.value, t.label]));

function getAutoTags(enc) {
  const powers = (enc.monsters || []).map(m => m.power);
  const tags = [];
  if (powers.includes('legendary')) tags.push('Boss');
  if (powers.includes('apex'))      tags.push('Apex');
  return tags;
}

const pageStatus  = document.querySelector('#pageStatus');
const encounterList = document.querySelector('#encounterList');
const logoutButton  = document.querySelector('#logoutButton');

let currentUser = null;

// ── Status helpers ─────────────────────────────────────────────────────────────

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

// ── Budget calculation ─────────────────────────────────────────────────────────

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

// ── Monster grouping helpers ───────────────────────────────────────────────────

function buildMonsterSummary(enc) {
  const groupMap   = {};
  const lone       = [];
  const groupNames = {};

  for (const g of enc.groups || []) {
    groupNames[g.id] = g.name;
  }

  for (const m of enc.monsters || []) {
    if (m.groupId) {
      if (!groupMap[m.groupId]) groupMap[m.groupId] = [];
      groupMap[m.groupId].push(m);
    } else {
      lone.push(m);
    }
  }

  const parts = [];
  for (const [gId, members] of Object.entries(groupMap)) {
    const gName = groupNames[gId] || gId;
    parts.push(`${members[0].name} ×${members.length} (${gName})`);
  }
  for (const m of lone) {
    parts.push(m.name);
  }

  return parts.join(', ') || 'None';
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderEncounterList(encounters) {
  if (!encounterList) return;
  encounterList.innerHTML = '';

  if (encounters.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:#6b4e8a;font-style:italic;';
    empty.textContent = 'No encounters yet. Create one!';
    encounterList.appendChild(empty);
    return;
  }

  for (const enc of encounters) {
    encounterList.appendChild(buildEncRow(enc, encounters));
  }
}

function buildEncRow(enc, allEncounters) {
  const { partyBudget, monsterTotal, pct, difficulty } = computeBudget(enc);
  const monsterCount = (enc.monsters || []).length;
  const playerCount  = (enc.party || []).length;
  const monDisplay   = Number.isInteger(monsterTotal) ? monsterTotal : monsterTotal.toFixed(1);

  const row = document.createElement('div');
  row.className = 'enc-row';
  row.dataset.encId = enc.id;

  // ── Header (click to expand) ────────────────────────────
  const header = document.createElement('div');
  header.className = 'enc-row-header';

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'enc-toggle-icon';
  toggleIcon.textContent = '▶';
  toggleIcon.setAttribute('aria-hidden', 'true');

  const name = document.createElement('div');
  name.className = 'enc-row-name';
  name.textContent = enc.name || 'Unnamed Encounter';

  const badge = document.createElement('span');
  badge.className = `budget-difficulty budget-difficulty--${difficulty}`;
  badge.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  const meta = document.createElement('div');
  meta.className = 'enc-row-meta';
  meta.textContent = `${playerCount} player${playerCount !== 1 ? 's' : ''} · ${monsterCount} monster${monsterCount !== 1 ? 's' : ''}`;

  const actions = document.createElement('div');
  actions.className = 'enc-row-actions';

  const editBtn = document.createElement('a');
  editBtn.className = 'enc-action-btn';
  editBtn.href = `../Encounters/encounters.html?encounterId=${encodeURIComponent(enc.id)}`;
  editBtn.textContent = 'Edit';

  const runBtn = document.createElement('a');
  runBtn.className = 'enc-action-btn';
  runBtn.href = `../RunEncounter/runEncounter.html?encounterId=${encodeURIComponent(enc.id)}`;
  runBtn.textContent = 'Run';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'enc-action-btn enc-action-btn--danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDelete(enc, row, allEncounters).catch(() => {});
  });

  actions.append(editBtn, runBtn, deleteBtn);

  // Tag chips: auto-tags + environment tags
  const tagChips = document.createElement('div');
  tagChips.className = 'enc-row-tags';
  for (const at of getAutoTags(enc)) {
    const chip = document.createElement('span');
    chip.className = `enc-tag-chip enc-tag-chip--auto enc-tag-chip--${at.toLowerCase()}`;
    chip.textContent = at;
    tagChips.appendChild(chip);
  }
  for (const tagValue of (enc.tags || [])) {
    const chip = document.createElement('span');
    chip.className = 'enc-tag-chip enc-tag-chip--env';
    chip.textContent = ENV_TAG_LABELS[tagValue] || tagValue;
    tagChips.appendChild(chip);
  }

  header.append(toggleIcon, name, badge, meta, tagChips, actions);

  // ── Details (hidden until expanded) ─────────────────────
  const details = document.createElement('div');
  details.className = 'enc-row-details';

  // Party
  const partyLine = document.createElement('div');
  partyLine.className = 'enc-detail-line';
  const partyText = (enc.party || []).map(p => `${p.name || '(unnamed)'} Lv${p.level || 0}`).join(', ') || 'None';
  partyLine.innerHTML = `<span class="enc-detail-label">Party:</span> ${escapeHtml(partyText)}`;

  // Monsters
  const monsterLine = document.createElement('div');
  monsterLine.className = 'enc-detail-line';
  monsterLine.innerHTML = `<span class="enc-detail-label">Monsters:</span> ${escapeHtml(buildMonsterSummary(enc))}`;

  // Budget
  const budgetLine = document.createElement('div');
  budgetLine.className = 'enc-detail-line enc-detail-budget';
  const budgetBadge = document.createElement('span');
  budgetBadge.className = `budget-difficulty budget-difficulty--${difficulty}`;
  budgetBadge.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  const budgetLabel = document.createElement('span');
  budgetLabel.className = 'enc-detail-label';
  budgetLabel.textContent = 'Budget:';
  const budgetNumbers = document.createElement('span');
  budgetNumbers.textContent = `${monDisplay} / ${partyBudget} (${Math.round(pct)}%)`;
  budgetLine.append(budgetLabel, budgetNumbers, budgetBadge);

  details.append(partyLine, monsterLine, budgetLine);

  if (enc.description) {
    const descLine = document.createElement('p');
    descLine.className = 'enc-detail-desc';
    descLine.textContent = `"${enc.description}"`;
    details.appendChild(descLine);
  }

  row.append(header, details);

  // Toggle expand on header click
  header.addEventListener('click', (e) => {
    // Don't toggle if clicking action buttons/links
    if (e.target.closest('.enc-row-actions')) return;
    row.classList.toggle('is-open');
  });

  return row;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Delete ─────────────────────────────────────────────────────────────────────

async function handleDelete(enc, rowEl, allEncounters) {
  const name = enc.name || 'this encounter';
  if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;

  try {
    setStatus('info', `Deleting "${name}"…`);
    await deleteDoc(doc(db, ENCOUNTERS_COL, enc.id));
    rowEl.remove();
    const idx = allEncounters.indexOf(enc);
    if (idx !== -1) allEncounters.splice(idx, 1);
    if (allEncounters.length === 0) {
      renderEncounterList([]);
    }
    setStatus('success', `Deleted "${name}".`);
  } catch (err) {
    console.error('Failed to delete encounter', err);
    setStatus('error', `Could not delete "${name}". Please try again.`);
  }
}

// ── Load ───────────────────────────────────────────────────────────────────────

async function loadEncounters(user) {
  setStatus('info', 'Loading your encounters…');
  try {
    const q    = query(collection(db, ENCOUNTERS_COL), where('ownerId', '==', user.uid));
    const snap = await getDocs(q);

    const encounters = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));

    setStatus();

    if (encounters.length === 0) {
      setStatus('info', 'No encounters yet. Create one!');
    }

    renderEncounterList(encounters);
  } catch (err) {
    console.error('Failed to load encounters', err);
    setStatus('error', 'Failed to load your encounters. Please try again.');
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────────

if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    signOut(auth)
      .then(() => { window.location.href = '../Auth/auth.html'; })
      .catch(err => {
        console.error('Sign out failed', err);
        setStatus('error', 'Could not sign out. Please try again.');
      });
  });
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateNavAuth(user, db);
  if (!user) {
    setStatus('info', 'Sign in to view your saved encounters.');
    if (encounterList) encounterList.innerHTML = '';
    return;
  }
  loadEncounters(user).catch(() => {});
});

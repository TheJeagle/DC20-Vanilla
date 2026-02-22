/**
 * runEncounter.js
 * Entry point for the Run Encounter page.
 * Loads encounter + creatures, builds bench, wires combat panel.
 */
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { auth } from '../firebaseClient.js';
import { state } from './js/runState.js';
import { loadEncounterForRun, fetchCreatures } from './js/runFirebase.js';
import { buildBench, renderBench } from './js/runBench.js';
import { initCombat } from './js/runCombat.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const encounterTitle  = document.querySelector('#encounterTitle');
const difficultyBadge = document.querySelector('#difficultyBadge');
const dcInput         = document.querySelector('#encounterDcInput');
const descAccordion   = document.querySelector('#descAccordion');
const descText        = document.querySelector('#descText');
const notesAccordion  = document.querySelector('#notesAccordion');
const notesText       = document.querySelector('#notesText');
const rewardsAccordion = document.querySelector('#rewardsAccordion');
const rewardsText     = document.querySelector('#rewardsText');
const benchPanel      = document.querySelector('#benchPanel');
const combatPanel     = document.querySelector('#combatPanel');
const statusEl        = document.querySelector('#runStatus');
const logoutButton    = document.querySelector('#logoutButton');

const POWER_MULT = { minion: 0.5, weak: 0.7, normal: 1.0, apex: 2.0, legendary: 4.0 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(msg, tone) {
  if (!statusEl) return;
  statusEl.textContent = msg || '';
  statusEl.dataset.tone = tone || '';
  statusEl.hidden = !msg;
}

function computeDifficulty(enc) {
  const partyBudget   = (enc.party || []).reduce((s, p) => s + (Number(p.level) || 0), 0);
  const monsterTotal  = (enc.monsters || []).reduce((s, m) => {
    const mult = POWER_MULT[m.power] ?? 1.0;
    const lvl  = Math.max(0, (m.baseLevel || 0) + (m.levelDelta || 0));
    return s + lvl * mult;
  }, 0);
  const pct = partyBudget > 0 ? (monsterTotal / partyBudget) * 100 : 0;
  if (pct < 75)       return 'easy';
  if (pct < 125)      return 'fair';
  if (pct < 175)      return 'hard';
  return 'deadly';
}

function refreshBench() {
  renderBench(benchPanel);
}

// ── Render header ─────────────────────────────────────────────────────────────

function renderHeader(enc) {
  if (encounterTitle)  encounterTitle.textContent = enc.name || 'Unnamed Encounter';

  if (difficultyBadge) {
    const diff = computeDifficulty(enc);
    const label = diff.charAt(0).toUpperCase() + diff.slice(1);
    difficultyBadge.textContent = label;
    difficultyBadge.className   = `budget-difficulty budget-difficulty--${diff}`;
  }

  // Accordions — only show non-empty fields
  if (descAccordion && descText) {
    if (enc.description) {
      descText.textContent  = enc.description;
      descAccordion.hidden  = false;
    } else {
      descAccordion.hidden = true;
    }
  }

  if (notesAccordion && notesText) {
    if (enc.info) {
      notesText.textContent  = enc.info;
      notesAccordion.hidden  = false;
    } else {
      notesAccordion.hidden = true;
    }
  }

  if (rewardsAccordion && rewardsText) {
    if (enc.rewards) {
      rewardsText.textContent  = enc.rewards;
      rewardsAccordion.hidden  = false;
    } else {
      rewardsAccordion.hidden = true;
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const params      = new URLSearchParams(window.location.search);
  const encounterId = params.get('encounterId');

  if (!encounterId) {
    setStatus('No encounter ID provided. Return to My Encounters and try again.', 'error');
    return;
  }

  setStatus('Loading encounter…');

  try {
    const enc = await loadEncounterForRun(encounterId);
    if (!enc) {
      setStatus('Encounter not found.', 'error');
      return;
    }

    state.encounter = enc;

    // Collect all unique creatureIds from monsters
    const creatureIds = [...new Set(
      (enc.monsters || []).map(m => m.creatureId).filter(Boolean)
    )];

    state.creatures = await fetchCreatures(creatureIds);

    setStatus();

    renderHeader(enc);
    buildBench();
    renderBench(benchPanel);
    initCombat(combatPanel, refreshBench);

  } catch (err) {
    console.error('Failed to load encounter for run', err);
    setStatus('Failed to load encounter. Please try again.', 'error');
  }
}

// ── DC input ──────────────────────────────────────────────────────────────────

if (dcInput) {
  dcInput.value = state.encounterDc;
  dcInput.addEventListener('input', () => {
    state.encounterDc = Number(dcInput.value) || 10;
  });
}

// ── Auth / nav ────────────────────────────────────────────────────────────────

if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    signOut(auth)
      .then(() => { window.location.href = '../Auth/auth.html'; })
      .catch(err => console.error('Sign out failed', err));
  });
}

onAuthStateChanged(auth, () => {
  // Auth state is observed but not required to view the page
  // (encounter may be public; auth guard can be added later if needed)
});

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('Run encounter init failed', err);
    setStatus('Unexpected error loading encounter.', 'error');
  });
});

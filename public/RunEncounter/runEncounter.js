/**
 * runEncounter.js
 * Entry point for the Run Encounter page.
 * Loads encounter + creatures, builds bench, wires combat panel.
 */
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { auth } from '../firebaseClient.js';
import { updateNavAuth } from '../navAuth.js';
import { state } from './js/runState.js';
import { loadEncounterForRun, fetchCreatures } from './js/runFirebase.js';
import { buildBench, renderBench } from './js/runBench.js';
import { initCombat, addCombatant, renderCombat } from './js/runCombat.js';
import { downloadEncounterMd, printEncounterPdf, downloadEncounterFoundryVTT, downloadEncounterNotion } from './js/runExport.js';

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

// Encounter DC table (Normal column) — indexed by level 1–20
const NORMAL_DC = [0, 13, 13, 14, 14, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 22, 22, 23, 23, 24, 24];

function getNormalDcForParty(party) {
  if (!party || party.length === 0) return null;
  const avgLevel = party.reduce((s, p) => s + (Number(p.level) || 0), 0) / party.length;
  const level    = Math.min(20, Math.max(1, Math.round(avgLevel)));
  return NORMAL_DC[level];
}

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
  renderBench(benchPanel, onAddFromBench);
}

function onAddFromBench(benchId) {
  const benchItem = state.bench.find(b => b.id === benchId);
  if (!benchItem || benchItem.inCombat) return;
  benchItem.inCombat = true;
  addCombatant(benchItem);
  refreshBench();
  renderCombat(combatPanel, refreshBench);
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

  // Pre-populate DC from the Normal column of the Encounter DC table
  if (dcInput && state.encounterDc === 10) { // only if still at default
    const normalDc = getNormalDcForParty(enc.party);
    if (normalDc) {
      state.encounterDc = normalDc;
      dcInput.value = normalDc;
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
    renderBench(benchPanel, onAddFromBench);
    initCombat(combatPanel, refreshBench);

    document.getElementById('exportMdBtn')?.addEventListener('click',
      () => downloadEncounterMd(state.encounter, state.creatures));
    document.getElementById('exportNotionBtn')?.addEventListener('click',
      () => downloadEncounterNotion(state.encounter, state.creatures));
    document.getElementById('exportPdfBtn')?.addEventListener('click',
      () => printEncounterPdf(state.encounter, state.creatures));
    document.getElementById('exportFoundryBtn')?.addEventListener('click',
      () => downloadEncounterFoundryVTT(state.encounter, state.creatures));

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

onAuthStateChanged(auth, (user) => {
  updateNavAuth(user);
});

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('Run encounter init failed', err);
    setStatus('Unexpected error loading encounter.', 'error');
  });
});

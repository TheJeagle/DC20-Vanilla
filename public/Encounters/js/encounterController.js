/**
 * encounterController.js
 * Orchestrates the encounter builder: wires DOM events, manages auth state,
 * and coordinates all sub-modules.
 */
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { auth } from '../../firebaseClient.js';
import { updateNavAuth } from '../../navAuth.js';
import { encounter, ui } from './encounterState.js';
import dom from './encounterDom.js';
import { renderSlots } from './encounterSlots.js';
import { renderBudget } from './encounterBudget.js';
import {
  renderPartyRows,
  addPlayer,
  openSavePartyDialog,
  confirmSaveParty,
  loadUserParties,
  applySelectedParty,
} from './encounterParty.js';
import {
  loadMyCreatures,
  loadPublicCreatures,
  switchSource,
  renderMonsterLibrary,
  applyFilters,
} from './encounterMonsters.js';
import { saveEncounter, loadEncounter } from './encounterFirebase.js';

// ── Init ──────────────────────────────────────────────────────────────────────

let currentEncounterId = null;

export function initController() {
  wireNav();
  wireMeta();
  wireParty();
  wireMonsterLibrary();
  wireSave();
  wireRun();
  wirePartyDialog();

  // Auth listener
  onAuthStateChanged(auth, user => {
    ui.currentUser = user;
    updateNavAuth(user);
    onAuthChange(user);
  });

  // Check for ?encounterId= param to load an existing encounter
  const params      = new URLSearchParams(window.location.search);
  const encounterId = params.get('encounterId');
  if (encounterId) {
    currentEncounterId = encounterId;
    updateRunButton();
    loadEncounterById(encounterId);
  }

  // Initial render
  renderSlots();
  renderBudget();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function onAuthChange(user) {
  if (user) {
    await loadUserParties(user.uid);
    await loadMyCreatures(user.uid);
    loadPublicCreatures(); // fire-and-forget for community tab
  } else {
    // Not signed in — still allow community creatures to load
    loadPublicCreatures();
    renderMonsterLibrary();
  }
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function wireNav() {
  const logoutBtn = dom.logoutButton();
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOut(auth);
      window.location.href = '../Auth/auth.html';
    });
  }
}

// ── Metadata form ─────────────────────────────────────────────────────────────

function wireMeta() {
  const fields = [
    { el: dom.encounterName,        key: 'name' },
    { el: dom.encounterDescription, key: 'description' },
    { el: dom.encounterInfo,        key: 'info' },
    { el: dom.encounterRewards,     key: 'rewards' },
  ];

  fields.forEach(({ el, key }) => {
    const input = el();
    if (!input) return;
    input.addEventListener('input', () => {
      encounter[key] = input.value;
      updateSaveButton();
    });
  });

  const pubCheck = dom.encounterPublic();
  if (pubCheck) {
    pubCheck.addEventListener('change', () => {
      encounter.isPublic = pubCheck.checked;
    });
  }
}

function updateSaveButton() {
  const btn = dom.saveEncounterBtn();
  if (!btn) return;
  btn.disabled = !encounter.name.trim();
}

function updateRunButton() {
  const btn = dom.runEncounterBtn();
  if (!btn) return;
  btn.disabled = !currentEncounterId;
}

function wireRun() {
  const btn = dom.runEncounterBtn();
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!currentEncounterId) return;
    window.location.href = `../RunEncounter/runEncounter.html?encounterId=${currentEncounterId}`;
  });
}

// ── Party panel ───────────────────────────────────────────────────────────────

function wireParty() {
  const addBtn = dom.addPlayerBtn();
  if (addBtn) addBtn.addEventListener('click', addPlayer);

  const loadBtn = dom.loadPartyBtn();
  if (loadBtn) loadBtn.addEventListener('click', applySelectedParty);

  const saveBtn = dom.savePartyBtn();
  if (saveBtn) saveBtn.addEventListener('click', openSavePartyDialog);
}

// ── Monster library ───────────────────────────────────────────────────────────

function wireMonsterLibrary() {
  const tabMine      = dom.tabMine();
  const tabCommunity = dom.tabCommunity();

  if (tabMine)      tabMine.addEventListener('click',      () => switchSource('mine'));
  if (tabCommunity) tabCommunity.addEventListener('click', () => switchSource('community'));

  // Search
  const search = dom.monsterSearch();
  if (search) {
    search.addEventListener('input', () => {
      ui.monsterSearchTerm = search.value.trim();
      applyFilters();
    });
  }

  // Level range
  const levelMin = dom.monsterLevelMin();
  const levelMax = dom.monsterLevelMax();
  if (levelMin) levelMin.addEventListener('input', () => {
    ui.monsterFilterLevelMin = Number(levelMin.value) || 0;
    applyFilters();
  });
  if (levelMax) levelMax.addEventListener('input', () => {
    ui.monsterFilterLevelMax = Number(levelMax.value) || 10;
    applyFilters();
  });

  // Role radio pills
  document.querySelectorAll('input[name="mRole"]').forEach(radio => {
    radio.addEventListener('change', () => {
      ui.monsterFilterRole = radio.value;
      applyFilters();
    });
  });

  // Power radio pills
  document.querySelectorAll('input[name="mPower"]').forEach(radio => {
    radio.addEventListener('change', () => {
      ui.monsterFilterPower = radio.value;
      applyFilters();
    });
  });
}

// ── Save ──────────────────────────────────────────────────────────────────────

function wireSave() {
  const btn = dom.saveEncounterBtn();
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!ui.currentUser) {
      setStatus('Sign in to save encounters.', 'error');
      return;
    }
    if (!encounter.name.trim()) {
      setStatus('Enter an encounter name first.', 'error');
      return;
    }

    btn.disabled = true;
    setStatus('Saving…', '');

    try {
      const { computeBudget } = await import('./encounterBudget.js');
      const budget = computeBudget();

      const docId = await saveEncounter(ui.currentUser.uid, ui.currentUser, {
        name:        encounter.name,
        description: encounter.description,
        info:        encounter.info,
        rewards:     encounter.rewards,
        isPublic:    encounter.isPublic,
        partyId:     encounter.partyId,
        party:       encounter.party,
        monsters:    encounter.monsters,
        groups:      encounter.groups,
        budget,
      });

      setStatus('Saved!', 'success');
      currentEncounterId = docId;
      updateRunButton();
      // Update URL so a reload reloads the same encounter
      const url = new URL(window.location.href);
      url.searchParams.set('encounterId', docId);
      window.history.replaceState({}, '', url.toString());
    } catch (err) {
      console.error('Save encounter failed:', err);
      setStatus('Save failed. Please try again.', 'error');
    } finally {
      btn.disabled = !encounter.name.trim();
    }
  });
}

function setStatus(msg, tone) {
  const el = dom.saveStatus();
  if (!el) return;
  el.textContent  = msg;
  el.dataset.tone = tone;
}

// ── Party dialog ──────────────────────────────────────────────────────────────

function wirePartyDialog() {
  const cancel = dom.savePartyCancel();
  if (cancel) cancel.addEventListener('click', () => dom.savePartyDialog()?.close());

  const confirm = dom.savePartyConfirm();
  if (confirm) confirm.addEventListener('click', confirmSaveParty);
}

// ── Load existing encounter ───────────────────────────────────────────────────

async function loadEncounterById(encounterId) {
  try {
    const data = await loadEncounter(encounterId);
    if (!data) return;

    encounter.name        = data.name        || '';
    encounter.description = data.description || '';
    encounter.info        = data.info        || '';
    encounter.rewards     = data.rewards     || '';
    encounter.isPublic    = data.isPublic    !== false;
    encounter.party       = data.party       || [];
    encounter.partyId     = data.partyId     || null;
    encounter.monsters    = data.monsters    || [];
    encounter.groups      = data.groups      || [];

    // Sync form fields
    const setVal = (getter, val) => { const el = getter(); if (el) el.value = val; };
    setVal(dom.encounterName,        encounter.name);
    setVal(dom.encounterDescription, encounter.description);
    setVal(dom.encounterInfo,        encounter.info);
    setVal(dom.encounterRewards,     encounter.rewards);
    const pubCheck = dom.encounterPublic();
    if (pubCheck) pubCheck.checked = encounter.isPublic;

    renderPartyRows();
    renderSlots();
    updateSaveButton();
  } catch (err) {
    console.error('Load encounter failed:', err);
  }
}

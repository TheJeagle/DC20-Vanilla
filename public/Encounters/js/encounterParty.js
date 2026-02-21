/**
 * encounterParty.js
 * Party CRUD, row rendering, save/load party to/from VanillaParties.
 */
import { encounter, ui, makeId } from './encounterState.js';
import dom from './encounterDom.js';
import { renderSlots } from './encounterSlots.js';
import { saveParty, loadUserParties as fetchUserParties } from './encounterFirebase.js';

// ── Render ────────────────────────────────────────────────────────────────────

export function renderPartyRows() {
  const container = dom.partyRows();
  if (!container) return;
  container.innerHTML = '';

  if (encounter.party.length === 0) return;

  // Column header labels
  const labels = document.createElement('div');
  labels.className = 'party-row-labels';
  ['Name', 'Class', 'Lv', 'HP', 'PD', 'AD', ''].forEach(t => {
    const s = document.createElement('span');
    s.textContent = t;
    labels.appendChild(s);
  });
  container.appendChild(labels);

  encounter.party.forEach(p => {
    container.appendChild(buildPartyRow(p));
  });
}

function buildPartyRow(p) {
  const row = document.createElement('div');
  row.className = 'party-row';
  row.dataset.playerId = p.id;

  const fields = [
    { key: 'name',  type: 'text',   ph: 'Name' },
    { key: 'class', type: 'text',   ph: 'Class' },
    { key: 'level', type: 'number', ph: '1', min: 0, max: 20 },
    { key: 'hp',    type: 'number', ph: 'HP',  min: 0 },
    { key: 'pd',    type: 'number', ph: 'PD',  min: 0 },
    { key: 'ad',    type: 'number', ph: 'AD',  min: 0 },
  ];

  fields.forEach(({ key, type, ph, min, max }) => {
    const input = document.createElement('input');
    input.type = type;
    input.placeholder = ph;
    input.value = p[key] ?? '';
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    input.addEventListener('input', () => {
      p[key] = type === 'number' ? Number(input.value) || 0 : input.value;
      // Budget depends on level; re-render budget through slots
      if (key === 'level') renderSlots();
    });
    row.appendChild(input);
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'party-remove-btn';
  removeBtn.type = 'button';
  removeBtn.title = 'Remove player';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => removePlayer(p.id));
  row.appendChild(removeBtn);

  return row;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function addPlayer() {
  encounter.party.push({
    id:    makeId(),
    name:  '',
    class: '',
    level: 1,
    hp:    0,
    pd:    0,
    ad:    0,
  });
  renderPartyRows();
  renderSlots();
}

function removePlayer(id) {
  const idx = encounter.party.findIndex(p => p.id === id);
  if (idx !== -1) encounter.party.splice(idx, 1);
  renderPartyRows();
  renderSlots();
}

// ── Save / Load parties ───────────────────────────────────────────────────────

export async function openSavePartyDialog() {
  const dialog = dom.savePartyDialog();
  if (!dialog) return;
  dom.savePartyName().value = '';
  dialog.showModal();
}

export async function confirmSaveParty() {
  const nameInput = dom.savePartyName();
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    nameInput && (nameInput.setCustomValidity('Enter a name'));
    nameInput && nameInput.reportValidity();
    return;
  }
  if (!ui.currentUser) {
    alert('Sign in to save parties.');
    return;
  }
  try {
    await saveParty(ui.currentUser.uid, name, encounter.party);
    await loadUserParties(ui.currentUser.uid);
    dom.savePartyDialog()?.close();
  } catch (err) {
    console.error('Save party failed:', err);
    alert('Failed to save party. Please try again.');
  }
}

export async function loadUserParties(uid) {
  const parties = await fetchUserParties(uid);
  const sel = dom.partySelect();
  if (!sel) return;

  // Clear existing options except the placeholder
  while (sel.options.length > 1) sel.remove(1);

  parties.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    opt.dataset.party = JSON.stringify(p.members || []);
    sel.appendChild(opt);
  });
}

export function applySelectedParty() {
  const sel = dom.partySelect();
  if (!sel || !sel.value) return;
  const opt = sel.options[sel.selectedIndex];
  try {
    const members = JSON.parse(opt.dataset.party || '[]');
    encounter.party = members.map(m => ({
      id:    m.id || makeId(),
      name:  m.name  || '',
      class: m.class || '',
      level: Number(m.level) || 1,
      hp:    Number(m.hp)    || 0,
      pd:    Number(m.pd)    || 0,
      ad:    Number(m.ad)    || 0,
    }));
    encounter.partyId = sel.value;
    renderPartyRows();
    renderSlots();
  } catch (err) {
    console.error('Failed to apply party:', err);
  }
}

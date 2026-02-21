/**
 * encounterSlots.js
 * Center-column slot render + drag-to-group logic.
 */
import { encounter, makeId } from './encounterState.js';
import dom from './encounterDom.js';
import { renderBudget } from './encounterBudget.js';

let _dragSlotId = null;

/** Full re-render of both party and monster slot rows. */
export function renderSlots() {
  renderPartySlots();
  renderMonsterSlots();
  renderBudget();
}

// ── Party slots ───────────────────────────────────────────────────────────────

function renderPartySlots() {
  const container = dom.partySlots();
  const empty     = dom.partySlotsEmpty();
  if (!container || !empty) return;

  container.innerHTML = '';

  if (encounter.party.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  encounter.party.forEach(p => {
    const card = document.createElement('div');
    card.className = 'party-slot-card';

    const name = document.createElement('div');
    name.className = 'party-slot-name';
    name.textContent = p.name || '(unnamed)';

    const meta = document.createElement('div');
    meta.className = 'party-slot-meta';
    meta.textContent = [p.class, `Lv ${p.level || 0}`].filter(Boolean).join(' · ');

    card.append(name, meta);
    container.appendChild(card);
  });
}

// ── Monster slots ─────────────────────────────────────────────────────────────

function renderMonsterSlots() {
  const container = dom.monsterSlots();
  const empty     = dom.monsterSlotsEmpty();
  if (!container || !empty) return;

  container.innerHTML = '';

  if (encounter.monsters.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  // Determine which slotIds belong to groups
  const groupedSlotIds = new Set(
    encounter.monsters.filter(m => m.groupId).map(m => m.slotId)
  );

  // Track which groups we've already rendered
  const renderedGroups = new Set();

  encounter.monsters.forEach(m => {
    if (m.groupId) {
      if (renderedGroups.has(m.groupId)) return; // already rendered this group
      renderedGroups.add(m.groupId);
      container.appendChild(buildGroupCard(m.groupId));
    } else {
      container.appendChild(buildMonsterCard(m));
    }
  });
}

// ── Individual monster card ───────────────────────────────────────────────────

function buildMonsterCard(m) {
  const card = document.createElement('div');
  card.className = 'monster-slot-card';
  card.dataset.slotId = m.slotId;
  card.draggable = true;

  // Header row: drag handle + name + remove
  const header = document.createElement('div');
  header.className = 'monster-slot-header';

  const drag = document.createElement('span');
  drag.className = 'monster-slot-drag';
  drag.textContent = '⠿';
  drag.title = 'Drag to group with another monster';

  const name = document.createElement('div');
  name.className = 'monster-slot-name';
  name.title = m.name;
  name.textContent = m.name;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'monster-slot-remove';
  removeBtn.type = 'button';
  removeBtn.title = 'Remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    removeMonster(m.slotId);
  });

  header.append(drag, name, removeBtn);

  // Role chip
  const roleEl = document.createElement('div');
  roleEl.className = 'monster-slot-role';
  const roleParts = [];
  if (m.power && m.power !== 'normal') roleParts.push(cap(m.power));
  if (m.role  && m.role  !== 'none')  roleParts.push(cap(m.role));
  roleEl.textContent = roleParts.join(' ') || 'Normal';

  // Level adjust row
  const levelRow = document.createElement('div');
  levelRow.className = 'monster-slot-level-row';

  const minusBtn = document.createElement('button');
  minusBtn.className = 'level-adj-btn';
  minusBtn.type = 'button';
  minusBtn.textContent = '−';
  minusBtn.addEventListener('click', () => adjustLevel(m.slotId, -1));

  const levelDisplay = document.createElement('span');
  levelDisplay.className = 'level-display';
  const effective = Math.max(0, (m.baseLevel || 0) + (m.levelDelta || 0));
  const deltaStr  = m.levelDelta > 0 ? `+${m.levelDelta}` : m.levelDelta < 0 ? `${m.levelDelta}` : '';
  levelDisplay.textContent = `Lv ${effective}${deltaStr ? ` (${deltaStr})` : ''}`;

  const plusBtn = document.createElement('button');
  plusBtn.className = 'level-adj-btn';
  plusBtn.type = 'button';
  plusBtn.textContent = '+';
  plusBtn.addEventListener('click', () => adjustLevel(m.slotId, +1));

  levelRow.append(minusBtn, levelDisplay, plusBtn);

  card.append(header, roleEl, levelRow);

  // Drag-to-group handlers
  attachDragHandlers(card, m.slotId);

  return card;
}

// ── Group card ────────────────────────────────────────────────────────────────

function buildGroupCard(groupId) {
  const group   = encounter.groups.find(g => g.id === groupId);
  const members = encounter.monsters.filter(m => m.groupId === groupId);

  const card = document.createElement('div');
  card.className = 'group-slot-card';
  card.dataset.groupId = groupId;

  // Header
  const header = document.createElement('div');
  header.className = 'group-slot-header';

  const gName = document.createElement('div');
  gName.className = 'group-slot-name';
  gName.textContent = group ? group.name : 'Group';

  const gTotal = document.createElement('div');
  gTotal.className = 'group-slot-total';
  const combinedLevel = members.reduce((s, m) => {
    return s + Math.max(0, (m.baseLevel || 0) + (m.levelDelta || 0));
  }, 0);
  gTotal.textContent = `Combined Lv ${combinedLevel}`;

  header.append(gName, gTotal);
  card.appendChild(header);

  // Member rows
  members.forEach(m => {
    const row = document.createElement('div');
    row.className = 'group-member-row';

    const mName = document.createElement('span');
    mName.textContent = m.name;
    mName.style.flex = '1';

    // Mini level adjust
    const levelRow = document.createElement('div');
    levelRow.className = 'group-member-level-row';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'level-adj-btn';
    minusBtn.type = 'button';
    minusBtn.textContent = '−';
    minusBtn.addEventListener('click', () => adjustLevel(m.slotId, -1));

    const effective = Math.max(0, (m.baseLevel || 0) + (m.levelDelta || 0));
    const levelSpan = document.createElement('span');
    levelSpan.className = 'level-display';
    levelSpan.textContent = `Lv ${effective}`;

    const plusBtn = document.createElement('button');
    plusBtn.className = 'level-adj-btn';
    plusBtn.type = 'button';
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', () => adjustLevel(m.slotId, +1));

    levelRow.append(minusBtn, levelSpan, plusBtn);
    row.append(mName, levelRow);
    card.appendChild(row);
  });

  // Actions row
  const actions = document.createElement('div');
  actions.className = 'group-actions';

  const ungroupBtn = document.createElement('button');
  ungroupBtn.className = 'group-ungroup-btn';
  ungroupBtn.type = 'button';
  ungroupBtn.textContent = 'Ungroup';
  ungroupBtn.addEventListener('click', () => disbandGroup(groupId));

  const removeBtn = document.createElement('button');
  removeBtn.className = 'group-remove-btn';
  removeBtn.type = 'button';
  removeBtn.textContent = 'Remove all';
  removeBtn.addEventListener('click', () => removeGroup(groupId));

  actions.append(ungroupBtn, removeBtn);
  card.appendChild(actions);

  return card;
}

// ── Drag-to-group ─────────────────────────────────────────────────────────────

function attachDragHandlers(el, slotId) {
  el.addEventListener('dragstart', e => {
    _dragSlotId = slotId;
    el.classList.add('drag-source');
    e.dataTransfer.effectAllowed = 'move';
  });

  el.addEventListener('dragend', () => {
    _dragSlotId = null;
    el.classList.remove('drag-source');
  });

  el.addEventListener('dragover', e => {
    if (_dragSlotId && _dragSlotId !== slotId) {
      e.preventDefault();
      el.classList.add('drag-over');
    }
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('drag-over');
  });

  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (_dragSlotId && _dragSlotId !== slotId) {
      groupMonsters(_dragSlotId, slotId);
    }
  });
}

// ── State mutations ───────────────────────────────────────────────────────────

/** Group dragId monster with dropId monster (creates or joins a group). */
function groupMonsters(dragSlotId, dropSlotId) {
  const dragM = encounter.monsters.find(m => m.slotId === dragSlotId);
  const dropM = encounter.monsters.find(m => m.slotId === dropSlotId);
  if (!dragM || !dropM) return;

  // If drop target already in a group, add drag to that group
  if (dropM.groupId) {
    dragM.groupId = dropM.groupId;
  } else if (dragM.groupId) {
    // Add drop to drag's group
    dropM.groupId = dragM.groupId;
  } else {
    // Create new group
    const groupId = makeId();
    const groupName = `Group ${encounter.groups.length + 1}`;
    encounter.groups.push({ id: groupId, name: groupName });
    dragM.groupId = groupId;
    dropM.groupId = groupId;
  }

  renderSlots();
}

/** Remove a single monster slot. */
function removeMonster(slotId) {
  const idx = encounter.monsters.findIndex(m => m.slotId === slotId);
  if (idx === -1) return;

  const m = encounter.monsters[idx];
  encounter.monsters.splice(idx, 1);

  // If it was in a group, check if group is now empty or singleton
  if (m.groupId) {
    const remaining = encounter.monsters.filter(r => r.groupId === m.groupId);
    if (remaining.length <= 1) {
      // Disband the group
      remaining.forEach(r => { r.groupId = null; });
      encounter.groups = encounter.groups.filter(g => g.id !== m.groupId);
    }
  }

  renderSlots();
}

/** Disband a group (keep members, clear their groupId). */
function disbandGroup(groupId) {
  encounter.monsters.forEach(m => {
    if (m.groupId === groupId) m.groupId = null;
  });
  encounter.groups = encounter.groups.filter(g => g.id !== groupId);
  renderSlots();
}

/** Remove all monsters in a group. */
function removeGroup(groupId) {
  encounter.monsters = encounter.monsters.filter(m => m.groupId !== groupId);
  encounter.groups   = encounter.groups.filter(g => g.id !== groupId);
  renderSlots();
}

/** Adjust a monster's level delta. */
function adjustLevel(slotId, delta) {
  const m = encounter.monsters.find(m => m.slotId === slotId);
  if (!m) return;
  const newDelta = (m.levelDelta || 0) + delta;
  // Clamp so effective level never goes below 0
  m.levelDelta = Math.max(-(m.baseLevel || 0), newDelta);
  renderSlots();
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

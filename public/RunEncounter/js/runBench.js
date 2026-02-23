/**
 * runBench.js
 * Build bench items from encounter data and render the bench panel.
 * Handles drag-source logic.
 */
import { state } from './runState.js';

/** Currently dragged bench item id (module-level, read by runCombat). */
let _dragId = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build state.bench from state.encounter.
 * Call once after the encounter doc is loaded.
 */
export function buildBench() {
  const enc = state.encounter;
  if (!enc) return;

  const bench = [];

  // Players — one bench item per party member
  for (const p of enc.party || []) {
    bench.push({
      type: 'player',
      id: `player-${p.id}`,
      label: p.name || '(unnamed)',
      sublabel: `Lv${p.level || 0}${p.class ? ` · ${p.class}` : ''}`,
      sourceData: p,
      isGroup: false,
      groupId: null,
      inCombat: false,
    });
  }

  // Monsters — grouped by groupId, lone monsters individually
  const groupMap   = {}; // groupId → [monster]
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

  for (const [gId, members] of Object.entries(groupMap)) {
    const gName = groupNames[gId] || members[0].name;
    const effectiveLevels = members.map(m =>
      Math.max(0, (m.baseLevel || 0) + (m.levelDelta || 0))
    );
    const lvlText = effectiveLevels.every(l => l === effectiveLevels[0])
      ? `Lv${effectiveLevels[0]}`
      : `Lv${Math.min(...effectiveLevels)}–${Math.max(...effectiveLevels)}`;
    bench.push({
      type: 'monster',
      id: `group-${gId}`,
      label: gName,
      sublabel: `${buildGroupSublabel(members)} · ${lvlText}`,
      sourceData: members,
      isGroup: true,
      groupId: gId,
      inCombat: false,
    });
  }

  for (const m of lone) {
    const effectiveLv = Math.max(0, (m.baseLevel || 0) + (m.levelDelta || 0));
    bench.push({
      type: 'monster',
      id: `monster-${m.slotId}`,
      label: m.name,
      sublabel: `Lv${effectiveLv}${m.role ? ` · ${m.role}` : ''}`,
      sourceData: m,
      isGroup: false,
      groupId: null,
      inCombat: false,
    });
  }

  state.bench = bench;
}

/** Return the id of the currently dragged bench item (null if none). */
export function getDragId() {
  return _dragId;
}

/**
 * Render the bench panel into `container`.
 * @param {HTMLElement} container
 * @param {((benchId: string) => void) | null} [onAdd] - called when the + button is clicked
 */
export function renderBench(container, onAdd = null) {
  if (!container) return;
  container.innerHTML = '';

  const players  = state.bench.filter(b => b.type === 'player');
  const monsters = state.bench.filter(b => b.type === 'monster');

  appendBenchSection(container, 'PARTY',    players,  onAdd);
  appendBenchSection(container, 'MONSTERS', monsters, onAdd);
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Build a sublabel string listing each distinct creature name with its count. */
function buildGroupSublabel(members) {
  const counts = {};
  for (const m of members) {
    const n = m.name || '?';
    counts[n] = (counts[n] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => count > 1 ? `${name} ×${count}` : name)
    .join(' · ');
}

function appendBenchSection(container, title, items, onAdd) {
  const section = document.createElement('div');
  section.className = 'bench-section';

  const heading = document.createElement('div');
  heading.className = 'bench-section-heading';
  heading.textContent = title;
  section.appendChild(heading);

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'bench-empty';
    empty.textContent = 'None';
    section.appendChild(empty);
  } else {
    for (const item of items) {
      section.appendChild(buildBenchItem(item, onAdd));
    }
  }

  container.appendChild(section);
}

function buildBenchItem(item, onAdd) {
  const el = document.createElement('div');
  el.className = 'bench-item';
  if (item.inCombat) el.classList.add('is-in-combat');
  el.draggable = !item.inCombat;
  el.dataset.benchId = item.id;

  const handle = document.createElement('span');
  handle.className = 'bench-drag-handle';
  handle.textContent = '⠿';
  handle.setAttribute('aria-hidden', 'true');

  const info = document.createElement('div');
  info.className = 'bench-item-info';

  const label = document.createElement('div');
  label.className = 'bench-item-label';
  label.textContent = item.label;

  const sublabel = document.createElement('div');
  sublabel.className = 'bench-item-sublabel';
  sublabel.textContent = item.sublabel;

  info.append(label, sublabel);
  el.append(handle, info);

  if (item.inCombat) {
    const badge = document.createElement('span');
    badge.className = 'bench-in-combat-badge';
    badge.textContent = 'In combat';
    el.appendChild(badge);
  } else if (onAdd) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'bench-add-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Add to combat';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onAdd(item.id);
    });
    el.appendChild(addBtn);
  }

  el.addEventListener('dragstart', (e) => {
    if (item.inCombat) { e.preventDefault(); return; }
    _dragId = item.id;
    el.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  el.addEventListener('dragend', () => {
    _dragId = null;
    el.classList.remove('is-dragging');
  });

  return el;
}

/**
 * runCombat.js
 * Combat pane: drag-drop targets, combatant cards, stat inputs, remove logic.
 */
import { state } from './runState.js';
import { getDragId } from './runBench.js';
import { buildStatblockEl } from './runStatblock.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wire up the combat panel as a drag-drop target and do an initial render.
 * @param {HTMLElement} combatContainer
 * @param {Function}    refreshBench   - callback to re-render bench after drop/remove
 */
export function initCombat(combatContainer, refreshBench) {
  if (!combatContainer) return;

  combatContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    combatContainer.classList.add('drag-over');
  });

  combatContainer.addEventListener('dragleave', () => {
    combatContainer.classList.remove('drag-over');
  });

  combatContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    combatContainer.classList.remove('drag-over');

    const id = getDragId();
    if (!id) return;

    const benchItem = state.bench.find(b => b.id === id);
    if (!benchItem || benchItem.inCombat) return;

    benchItem.inCombat = true;
    addCombatant(benchItem);
    refreshBench();
    renderCombat(combatContainer, refreshBench);
  });

  renderCombat(combatContainer, refreshBench);
}

/**
 * Re-render the entire combat panel.
 * @param {HTMLElement} container
 * @param {Function}    refreshBench
 */
export function renderCombat(container, refreshBench) {
  if (!container) return;
  container.innerHTML = '';

  if (state.combat.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'combat-empty';
    empty.textContent = 'Drag combatants from the bench to add them.';
    container.appendChild(empty);
    return;
  }

  // Render each combatant; pass index so remove splices correctly
  for (let i = 0; i < state.combat.length; i++) {
    container.appendChild(
      buildCombatCard(state.combat[i], container, refreshBench)
    );
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function addCombatant(benchItem) {
  if (benchItem.type === 'player') {
    const p = benchItem.sourceData;
    state.combat.push({
      type: 'player',
      benchId: benchItem.id,
      label: benchItem.label,
      sublabel: benchItem.sublabel,
      currentHp: Number(p.hp) || 0,
      sourceData: p,
    });
  } else {
    // Monster (lone or group) — use first member's creature for base stats
    const members   = benchItem.isGroup ? benchItem.sourceData : [benchItem.sourceData];
    const first     = members[0];
    const creature  = state.creatures[first.creatureId] || null;
    const stats     = creature?.stats             || {};
    const attrVals  = creature?.attributes?.values || {};

    state.combat.push({
      type: 'monster',
      benchId: benchItem.id,
      label: benchItem.label,
      sublabel: benchItem.sublabel,
      currentHp:  stats.HP  ?? 0,
      currentPd:  stats.PD  ?? 0,
      currentAd:  stats.AD  ?? 0,
      currentMig: attrVals.mig ?? 0,
      currentAgi: attrVals.agi ?? 0,
      currentCha: attrVals.cha ?? 0,
      currentInt: attrVals.int ?? 0,
      expanded:   false,
      sourceData: benchItem.sourceData,
      creatureId: first.creatureId,
    });
  }
}

function buildCombatCard(combatant, container, refreshBench) {
  const card = document.createElement('div');
  card.className = `combat-card combat-card--${combatant.type}`;

  // ── Header ──────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'combat-card-header';

  const nameEl = document.createElement('div');
  nameEl.className = 'combat-card-name';
  nameEl.textContent = combatant.label;

  if (combatant.sublabel) {
    const sub = document.createElement('div');
    sub.className = 'combat-card-sublabel';
    sub.textContent = combatant.sublabel;
    nameEl.appendChild(sub);
  }

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'combat-remove-btn';
  removeBtn.textContent = '× Remove';
  removeBtn.addEventListener('click', () => {
    // Return to bench
    const benchItem = state.bench.find(b => b.id === combatant.benchId);
    if (benchItem) benchItem.inCombat = false;
    const idx = state.combat.indexOf(combatant);
    if (idx !== -1) state.combat.splice(idx, 1);
    refreshBench();
    renderCombat(container, refreshBench);
  });

  header.append(nameEl, removeBtn);
  card.appendChild(header);

  // ── Player card body ──────────────────────────────────
  if (combatant.type === 'player') {
    if (combatant.sourceData.class) {
      const chip = document.createElement('span');
      chip.className = 'combat-class-chip';
      chip.textContent = combatant.sourceData.class;
      card.appendChild(chip);
    }

    card.appendChild(buildStatRow([{ key: 'currentHp', label: 'HP', allowNegative: true }], combatant));

  // ── Monster card body ─────────────────────────────────
  } else {
    const statsGrid = document.createElement('div');
    statsGrid.className = 'combat-stats-grid';

    const statDefs = [
      { key: 'currentHp',  label: 'HP',  allowNegative: true },
      { key: 'currentPd',  label: 'PD' },
      { key: 'currentAd',  label: 'AD' },
      { key: 'currentMig', label: 'Mig' },
      { key: 'currentAgi', label: 'Agi' },
      { key: 'currentCha', label: 'Cha' },
      { key: 'currentInt', label: 'Int' },
    ];

    for (const def of statDefs) {
      const cell = document.createElement('div');
      cell.className = 'combat-stat-cell';

      const lbl = document.createElement('label');
      lbl.className = 'combat-stat-label';
      lbl.textContent = def.label;

      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'combat-stat-input';
      inp.value = combatant[def.key];
      inp.step = 1;
      if (!def.allowNegative) inp.min = 0;
      inp.addEventListener('input', () => {
        combatant[def.key] = Number(inp.value) || 0;
      });

      cell.append(lbl, inp);
      statsGrid.appendChild(cell);
    }
    card.appendChild(statsGrid);

    // Statblock expand/collapse
    const creature = state.creatures[combatant.creatureId];
    if (creature) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'combat-expand-btn';
      toggleBtn.textContent = combatant.expanded ? '▼ Statblock' : '▶ Statblock';

      const sbWrapper = document.createElement('div');
      sbWrapper.className = 'combat-statblock-wrapper';
      sbWrapper.hidden = !combatant.expanded;

      if (combatant.expanded) {
        sbWrapper.appendChild(buildStatblockEl(creature));
      }

      toggleBtn.addEventListener('click', () => {
        combatant.expanded = !combatant.expanded;
        toggleBtn.textContent = combatant.expanded ? '▼ Statblock' : '▶ Statblock';
        if (combatant.expanded) {
          sbWrapper.innerHTML = '';
          sbWrapper.appendChild(buildStatblockEl(creature));
        }
        sbWrapper.hidden = !combatant.expanded;
      });

      card.append(toggleBtn, sbWrapper);
    }
  }

  return card;
}

/** Build a simple label + number-input row for player cards. */
function buildStatRow(defs, combatant) {
  const row = document.createElement('div');
  row.className = 'combat-stat-row';

  for (const { key, label, allowNegative } of defs) {
    const lbl = document.createElement('label');
    lbl.className = 'combat-stat-label';
    lbl.textContent = label;

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'combat-stat-input';
    inp.value = combatant[key];
    inp.step = 1;
    if (!allowNegative) inp.min = 0;
    inp.addEventListener('input', () => {
      combatant[key] = Number(inp.value) || 0;
    });

    row.append(lbl, inp);
  }

  return row;
}

/**
 * runCombat.js
 * Combat pane: bench drops, drag-to-reorder, HP sliders, statblock with
 * editable PD / AD / attribute fields.
 */
import { state } from './runState.js';
import { getDragId } from './runBench.js';
import { buildStatblockEl } from './runStatblock.js';

// ── Module-level drag state ───────────────────────────────────────────────────

/** Index in state.combat being dragged for reorder (null = not reordering). */
let _reorderIdx = null;
/** Index where the dragged card will be inserted. */
let _dropIdx    = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function initCombat(combatContainer, refreshBench) {
  if (!combatContainer) return;

  combatContainer.addEventListener('dragover', (e) => {
    e.preventDefault();

    if (_reorderIdx !== null) {
      // Reorder drag — find insertion point
      e.dataTransfer.dropEffect = 'move';
      updateDropIndicator(e, combatContainer);
    } else {
      // Bench drag
      e.dataTransfer.dropEffect = 'move';
      combatContainer.classList.add('drag-over');
    }
  });

  combatContainer.addEventListener('dragleave', (e) => {
    if (!combatContainer.contains(e.relatedTarget)) {
      combatContainer.classList.remove('drag-over');
      clearDropIndicators(combatContainer);
    }
  });

  combatContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    combatContainer.classList.remove('drag-over');
    clearDropIndicators(combatContainer);

    if (_reorderIdx !== null) {
      // Reorder drop
      const toIdx = _dropIdx ?? state.combat.length;
      reorderCombat(_reorderIdx, toIdx);
      _reorderIdx = null;
      _dropIdx    = null;
      renderCombat(combatContainer, refreshBench);
      return;
    }

    // Bench drop
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

  state.combat.forEach((combatant, i) => {
    container.appendChild(buildCombatCard(combatant, i, container, refreshBench));
  });
}

// ── Reorder helpers ───────────────────────────────────────────────────────────

function updateDropIndicator(e, container) {
  const cards = [...container.querySelectorAll('.combat-card')];
  let newIdx = state.combat.length;

  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      newIdx = i;
      break;
    }
  }

  if (newIdx !== _dropIdx) {
    _dropIdx = newIdx;
    cards.forEach((c, i) => {
      c.classList.toggle('drop-before', i === newIdx);
    });
  }
}

function clearDropIndicators(container) {
  container.querySelectorAll('.drop-before').forEach(el =>
    el.classList.remove('drop-before')
  );
}

function reorderCombat(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const [moved] = state.combat.splice(fromIdx, 1);
  const dest = toIdx > fromIdx ? toIdx - 1 : toIdx;
  state.combat.splice(dest, 0, moved);
}

// ── Add combatant from bench ──────────────────────────────────────────────────

function addCombatant(benchItem) {
  if (benchItem.type === 'player') {
    const p = benchItem.sourceData;
    const maxHp = Number(p.hp) || 20;
    state.combat.push({
      type:      'player',
      benchId:   benchItem.id,
      label:     benchItem.label,
      sublabel:  benchItem.sublabel,
      currentHp: maxHp,
      maxHp,
      sourceData: p,
    });
  } else {
    const members  = benchItem.isGroup ? benchItem.sourceData : [benchItem.sourceData];
    const first    = members[0];
    const creature = state.creatures[first.creatureId] || null;
    const stats    = creature?.stats             || {};
    const attrVals = creature?.attributes?.values || {};  // keys: Mig, Agi, Cha, Int
    const maxHp    = stats.HP ?? 0;

    state.combat.push({
      type:       'monster',
      benchId:    benchItem.id,
      label:      benchItem.label,
      sublabel:   benchItem.sublabel,
      currentHp:  maxHp,
      maxHp,
      currentPd:  stats.PD  ?? 0,
      currentAd:  stats.AD  ?? 0,
      currentMig: attrVals.Mig ?? 0,
      currentAgi: attrVals.Agi ?? 0,
      currentCha: attrVals.Cha ?? 0,
      currentInt: attrVals.Int ?? 0,
      expanded:   true,
      sourceData: benchItem.sourceData,
      creatureId: first.creatureId,
    });
  }
}

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCombatCard(combatant, index, container, refreshBench) {
  const card = document.createElement('div');
  card.className = `combat-card combat-card--${combatant.type}`;
  card.draggable = false; // enabled only when dragging from the handle

  card.addEventListener('dragstart', (e) => {
    _reorderIdx = index;
    card.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation(); // don't let bench panel pick this up
  });

  card.addEventListener('dragend', () => {
    _reorderIdx = null;
    _dropIdx    = null;
    card.draggable = false;
    card.classList.remove('is-dragging');
  });

  // ── Header ──────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'combat-card-header';

  const handle = document.createElement('div');
  handle.className = 'combat-drag-handle';
  handle.textContent = '⠿';
  handle.title = 'Drag to reorder';
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('mousedown', () => {
    card.draggable = true;
    document.addEventListener('mouseup', () => { card.draggable = false; }, { once: true });
  });

  const nameWrap = document.createElement('div');
  nameWrap.className = 'combat-card-name';
  nameWrap.textContent = combatant.label;
  if (combatant.sublabel) {
    const sub = document.createElement('div');
    sub.className = 'combat-card-sublabel';
    sub.textContent = combatant.sublabel;
    nameWrap.appendChild(sub);
  }

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'combat-remove-btn';
  removeBtn.textContent = '← Bench';
  removeBtn.title = 'Return to bench';
  removeBtn.addEventListener('click', () => {
    const benchItem = state.bench.find(b => b.id === combatant.benchId);
    if (benchItem) benchItem.inCombat = false;
    const idx = state.combat.indexOf(combatant);
    if (idx !== -1) state.combat.splice(idx, 1);
    refreshBench();
    renderCombat(container, refreshBench);
  });

  header.append(handle, nameWrap, removeBtn);
  card.appendChild(header);

  // ── Player ───────────────────────────────────────────────
  if (combatant.type === 'player') {
    if (combatant.sourceData.class) {
      const chip = document.createElement('span');
      chip.className = 'combat-class-chip';
      chip.textContent = combatant.sourceData.class;
      card.appendChild(chip);
    }
    card.appendChild(buildHpRow(combatant));

  // ── Monster ──────────────────────────────────────────────
  } else {
    card.appendChild(buildHpRow(combatant));

    const creature = state.creatures[combatant.creatureId];
    if (creature) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'combat-expand-btn';
      toggleBtn.textContent = combatant.expanded ? '▼ Statblock' : '▶ Statblock';

      const sbWrapper = document.createElement('div');
      sbWrapper.className = 'combat-statblock-wrapper';
      sbWrapper.hidden = !combatant.expanded;

      const buildSb = () => {
        sbWrapper.innerHTML = '';
        sbWrapper.appendChild(buildStatblockEl(creature, combatant));
      };

      if (combatant.expanded) buildSb();

      toggleBtn.addEventListener('click', () => {
        combatant.expanded = !combatant.expanded;
        toggleBtn.textContent = combatant.expanded ? '▼ Statblock' : '▶ Statblock';
        if (combatant.expanded) buildSb();
        sbWrapper.hidden = !combatant.expanded;
      });

      card.append(toggleBtn, sbWrapper);
    }
  }

  return card;
}

// ── HP slider + number input (synced) ─────────────────────────────────────────

function buildHpRow(combatant) {
  const row = document.createElement('div');
  row.className = 'combat-hp-row';

  const label = document.createElement('span');
  label.className = 'combat-hp-label';
  label.textContent = 'HP';

  const maxHp = combatant.maxHp || 20;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'combat-hp-slider';
  slider.min = 0;
  slider.max = maxHp;
  slider.value = Math.max(0, combatant.currentHp);

  const numInput = document.createElement('input');
  numInput.type = 'number';
  numInput.className = 'combat-hp-number';
  numInput.value = combatant.currentHp;
  numInput.step = 1;

  slider.addEventListener('input', () => {
    combatant.currentHp = Number(slider.value);
    numInput.value = slider.value;
  });

  numInput.addEventListener('input', () => {
    const val = Number(numInput.value) || 0;
    combatant.currentHp = val;
    slider.value = Math.max(0, Math.min(maxHp, val));
  });

  row.append(label, slider, numInput);
  return row;
}

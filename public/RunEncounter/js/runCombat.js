/**
 * runCombat.js
 * Combat pane: bench drops, drag-to-reorder, HP sliders, statblock with
 * editable PD / AD / attribute fields.
 */
import { state } from './runState.js';
import { getDragId } from './runBench.js';
import { buildStatblockEl } from './runStatblock.js';
import { computeScaledStats, applyNumericDeltas } from '../../CreateCreature/js/createCreatureStats.js';

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

  // Keep currentTurnIdx in bounds if combatants were removed mid-combat
  if (state.combatActive && state.currentTurnIdx >= state.combat.length) {
    state.currentTurnIdx = Math.max(0, state.combat.length - 1);
  }

  const controls = buildTurnControls(container, refreshBench);
  if (controls) container.appendChild(controls);

  if (state.combat.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'combat-empty';
    empty.textContent = 'Drag combatants from the bench to add them.';
    container.appendChild(empty);
    return;
  }

  state.combat.forEach((combatant, i) => {
    const card = buildCombatCard(combatant, i, container, refreshBench);
    if (state.combatActive && i === state.currentTurnIdx) {
      card.classList.add('is-active-turn');
      const cardNextBtn = document.createElement('button');
      cardNextBtn.type = 'button';
      cardNextBtn.className = 'combat-card-next-btn';
      cardNextBtn.textContent = 'Next Turn →';
      cardNextBtn.addEventListener('click', () => advanceTurn(container, refreshBench));
      card.appendChild(cardNextBtn);
    }
    container.appendChild(card);
  });

  // Scroll active card into view after layout settles
  if (state.combatActive) {
    requestAnimationFrame(() => {
      container.querySelector('.is-active-turn')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
}

// ── Turn advancement ──────────────────────────────────────────────────────────

function advanceTurn(container, refreshBench) {
  const outgoing = state.combat[state.currentTurnIdx];
  resetCombatantAp(outgoing);
  if (outgoing?.type === 'monster') outgoing.expanded = false;
  state.currentTurnIdx = (state.currentTurnIdx + 1) % state.combat.length;
  const incoming = state.combat[state.currentTurnIdx];
  resetCombatantAp(incoming);
  if (incoming?.type === 'monster') { incoming.expanded = true; incoming.dodgeState = 0; }
  renderCombat(container, refreshBench);
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

// ── Level scaling ─────────────────────────────────────────────────────────────

/**
 * Return a deep-cloned creature with all stats recomputed at targetLevel.
 * applyNumericDeltas operates on top-level fields, so we use a flat proxy
 * object and then assemble creature.stats from the result.
 */
function rescaleCreature(creature, targetLevel) {
  const c  = JSON.parse(JSON.stringify(creature)); // deep clone — never mutate state.creatures
  const cm = Math.ceil(targetLevel / 2);

  const scaled = computeScaledStats({
    level:         targetLevel,
    role:          c.role,
    power:         c.power,
    size:          c.size,
    type:          c.type,
    deltas:        c.deltas,
    combatMastery: cm,
  });

  // applyNumericDeltas reads/writes top-level fields (HP, PD, …) so use a flat proxy
  const flat = {
    HP:     scaled.HP,
    PD:     scaled.PD,
    AD:     scaled.AD,
    damage: scaled.damage,
    check:  scaled.check,
    saveDC: scaled.saveDC,
    AP:     scaled.AP,
    speed:  scaled.speed,
    deltas: scaled.deltas,
  };
  applyNumericDeltas(flat);

  const pd = flat.PD;
  const ad = flat.AD;
  c.level = targetLevel;
  c.stats = {
    HP:       flat.HP,
    PD:       pd,
    PDHeavy:  pd + 5,
    PDBrutal: pd + 10,
    AD:       ad,
    ADHeavy:  ad + 5,
    ADBrutal: ad + 10,
    damage:   flat.damage,
    check:    flat.check,
    saveDC:   flat.saveDC,
    AP:       flat.AP,
    speed:    flat.speed,
    CM:       cm,
  };
  c.attributes = {
    values:         scaled.attributes,
    saves:          scaled.attributeSaves,
    priority:       scaled.attributePriority,
    primeAttribute: scaled.primeAttribute,
  };
  // featureActions/featureReactions/featurePassives remain as stored
  return c;
}

// ── Add combatant from bench ──────────────────────────────────────────────────

export function addCombatant(benchItem) {
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
    const members = benchItem.isGroup ? benchItem.sourceData : [benchItem.sourceData];
    for (const member of members) {
      let creature = state.creatures[member.creatureId] || null;
      if (creature) {
        const baseLevel      = creature.level ?? 0;
        const effectiveLevel = Math.max(0, (member.baseLevel ?? baseLevel) + (member.levelDelta ?? 0));
        if (effectiveLevel !== baseLevel) {
          creature = rescaleCreature(creature, effectiveLevel);
        }
      }
      const stats    = creature?.stats             || {};
      const attrVals = creature?.attributes?.values || {};  // keys: Mig, Agi, Cha, Int
      const maxHp    = stats.HP ?? 0;
      const maxAp    = stats.AP ?? 2;
      const effectiveLv   = Math.max(0, (member.baseLevel || 0) + (member.levelDelta || 0));
      const sublabelParts = [`Lv${effectiveLv}`];
      if (member.role && member.role !== 'none') sublabelParts.push(member.role);

      state.combat.push({
        type:       'monster',
        benchId:    benchItem.id,
        label:      member.name || creature?.name || 'Monster',
        sublabel:   sublabelParts.join(' · '),
        currentHp:  maxHp,
        maxHp,
        currentPd:  stats.PD  ?? 0,
        currentAd:  stats.AD  ?? 0,
        currentMig: attrVals.Mig ?? 0,
        currentAgi: attrVals.Agi ?? 0,
        currentCha: attrVals.Cha ?? 0,
        currentInt: attrVals.Int ?? 0,
        maxAp,
        currentAp:  maxAp,
        dodgeState: 0,   // 0 = none, 1 = dodging, 2 = full dodge
        expanded:   false,
        sourceData: member,
        creatureId: member.creatureId,
        creature,         // rescaled (or original) creature doc for statblock rendering
      });
    }
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
    const idx = state.combat.indexOf(combatant);
    if (idx !== -1) state.combat.splice(idx, 1);
    // Only return the bench item when no more entries from this group remain in combat
    const anyLeft = state.combat.some(c => c.benchId === combatant.benchId);
    if (!anyLeft) {
      const benchItem = state.bench.find(b => b.id === combatant.benchId);
      if (benchItem) benchItem.inCombat = false;
    }
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
    // Dodge status banner — sits between header and HP row
    const dodgeObj = buildDodgeIndicator(combatant);
    card.appendChild(dodgeObj.el);

    card.appendChild(buildHpRow(combatant));

    const creature = combatant.creature ?? state.creatures[combatant.creatureId];
    if (creature) {
      // AP pips — always visible so GM can track spending during the turn
      const apRowObj = buildApRow(combatant);
      card.appendChild(apRowObj.el);

      const onApSpend = (cost) => {
        if (combatant.currentAp >= cost) {
          combatant.currentAp -= cost;
          apRowObj.update();
        } else {
          apRowObj.flash();
        }
      };

      // Dodge cycles 0→1→2→0; costs 1 AP each activation step
      const onDodge = () => {
        if (combatant.currentAp >= 1) {
          combatant.currentAp -= 1;
          apRowObj.update();
          combatant.dodgeState = combatant.dodgeState >= 2 ? 0 : combatant.dodgeState + 1;
          dodgeObj.update();
        } else {
          apRowObj.flash();
        }
      };

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'combat-expand-btn';
      toggleBtn.textContent = combatant.expanded ? '▼ Statblock' : '▶ Statblock';

      const sbWrapper = document.createElement('div');
      sbWrapper.className = 'combat-statblock-wrapper';
      sbWrapper.hidden = !combatant.expanded;

      const buildSb = () => {
        sbWrapper.innerHTML = '';
        sbWrapper.appendChild(buildStatblockEl(creature, combatant, { onApSpend, onDodge }));
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

// ── Turn tracker ──────────────────────────────────────────────────────────────

function buildTurnControls(container, refreshBench) {
  if (state.combat.length === 0) return null;

  const bar = document.createElement('div');
  bar.className = 'combat-turn-controls';

  if (!state.combatActive) {
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'combat-turn-btn combat-turn-btn--start';
    startBtn.textContent = '▶ Start Combat';
    startBtn.addEventListener('click', () => {
      state.combatActive   = true;
      state.currentTurnIdx = 0;
      const first = state.combat[0];
      resetCombatantAp(first);
      if (first?.type === 'monster') { first.expanded = true; first.dodgeState = 0; }
      renderCombat(container, refreshBench);
    });
    bar.appendChild(startBtn);
  } else {
    const name = state.combat[state.currentTurnIdx]?.label || '—';

    const label = document.createElement('span');
    label.className   = 'combat-turn-label';
    label.textContent = `${name}'s Turn`;
    bar.appendChild(label);

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'combat-turn-btn combat-turn-btn--next';
    nextBtn.textContent = 'Next Turn →';
    nextBtn.addEventListener('click', () => advanceTurn(container, refreshBench));
    bar.appendChild(nextBtn);

    const endBtn = document.createElement('button');
    endBtn.type = 'button';
    endBtn.className = 'combat-turn-btn combat-turn-btn--end';
    endBtn.textContent = '✕ End Combat';
    endBtn.addEventListener('click', () => {
      state.combatActive   = false;
      state.currentTurnIdx = 0;
      renderCombat(container, refreshBench);
    });
    bar.appendChild(endBtn);
  }

  return bar;
}

function resetCombatantAp(combatant) {
  if (combatant?.type === 'monster') {
    combatant.currentAp = combatant.maxAp;
  }
}

// ── Dodge status indicator ─────────────────────────────────────────────────────

const DODGE_MESSAGES = [
  null,
  'Dodging! Next attack against me has DisAdvantage!',
  'Full Dodge! All attacks against me have DisAdvantage!',
];

function buildDodgeIndicator(combatant) {
  const el = document.createElement('div');
  el.className = 'combat-dodge-indicator';
  el.title = 'Click to dismiss';

  function update() {
    const msg = DODGE_MESSAGES[combatant.dodgeState] ?? null;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      el.removeAttribute('data-state');
    } else {
      el.hidden = false;
      el.textContent = msg;
      el.dataset.state = combatant.dodgeState;
    }
  }

  el.addEventListener('click', () => {
    combatant.dodgeState = 0;
    update();
  });

  update();
  return { el, update };
}

// ── AP pip row ─────────────────────────────────────────────────────────────────

function buildApRow(combatant) {
  const row = document.createElement('div');
  row.className = 'combat-ap-row';

  const label = document.createElement('span');
  label.className   = 'combat-ap-label';
  label.textContent = 'AP';
  row.appendChild(label);

  const pipsEl = document.createElement('div');
  pipsEl.className = 'combat-ap-pips';
  row.appendChild(pipsEl);

  function update() {
    pipsEl.innerHTML = '';
    const max = combatant.maxAp || 0;
    const cur = Math.max(0, combatant.currentAp ?? max);
    for (let i = 0; i < max; i++) {
      const pip = document.createElement('span');
      pip.className = 'combat-ap-pip' + (i < cur ? ' combat-ap-pip--filled' : '');
      pip.title = `Set AP to ${i + 1}`;
      pip.addEventListener('click', () => {
        combatant.currentAp = i + 1;
        update();
      });
      pipsEl.appendChild(pip);
    }
  }

  function flash() {
    pipsEl.classList.remove('combat-ap-pips--flash');
    void pipsEl.offsetWidth; // force reflow to restart animation
    pipsEl.classList.add('combat-ap-pips--flash');
    pipsEl.addEventListener('animationend', () => {
      pipsEl.classList.remove('combat-ap-pips--flash');
    }, { once: true });
  }

  update();
  return { el: row, update, flash };
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

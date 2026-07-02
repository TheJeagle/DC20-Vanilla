import dom from './createCreatureDom.js';
import { creature, featureState, TITLE_FALLBACK } from './createCreatureState.js';
import { FEATURE_TYPES, getFeatureSummary } from '../../features.js';
import { SkillAttribute } from '../../Rules/gameRules.js';
import {
  createActionCardElement as sharedCreateActionCardElement,
  appendField, appendBoldField, appendText,
  createActionBadges, hasHalfDamage,
} from '../../actionCardRenderer.js';
import { creatureFromState, evaluateCreature } from '../../Rules/combatSim.js';

let dragSourceId = null;
let onFeatureReorder = () => {};

export function setFeatureReorderHandler(cb) {
  onFeatureReorder = typeof cb === 'function' ? cb : () => {};
}

let onFeatureRemove = () => {};
export function setFeatureRemoveHandler(cb) {
  onFeatureRemove = typeof cb === 'function' ? cb : () => {};
}

/** Called when a custom feature's ✏ edit button is clicked. Receives the feature object. */
let onCustomFeatureEdit = () => {};
export function setCustomFeatureEditHandler(cb) {
  onCustomFeatureEdit = typeof cb === 'function' ? cb : () => {};
}

/** Called when a "+" add button is clicked on a statblock section. Receives a type hint object. */
let onCustomFeatureAdd = () => {};
export function setCustomFeatureAddHandler(cb) {
  onCustomFeatureAdd = typeof cb === 'function' ? cb : () => {};
}

/** Called when a custom feature's bank (★) button is clicked. Receives the feature object. */
let onSaveToBank = () => {};
export function setSaveToBankHandler(cb) {
  onSaveToBank = typeof cb === 'function' ? cb : () => {};
}

/** Called when a sim fix "Apply" button is clicked. Receives a deltas object, e.g. { PD: 1 }. */
let onApplyFix = () => {};
export function setApplyFixHandler(cb) {
  onApplyFix = typeof cb === 'function' ? cb : () => {};
}

export function initStatblockSectionToggles() {
  const featureSection = dom.statblockFeatures?.closest('.statblock-feature-section');
  const featureHeading = featureSection?.querySelector('.statblock-feature-heading');
  const actionsSection = dom.statblockActionsHeading?.closest('.statblock-actions-section');
  const reactionsHeading = dom.statblockReactionsSection?.querySelector('.statblock-actions-heading');

  [
    { heading: featureHeading,            section: featureSection },
    { heading: dom.statblockActionsHeading, section: actionsSection },
    { heading: reactionsHeading,           section: dom.statblockReactionsSection },
  ].forEach(({ heading, section }) => {
    if (!heading || !section) return;
    heading.addEventListener('click', () => section.classList.toggle('is-collapsed'));
  });
}

function reorderFeatureById(dragId, dropId) {
  const ids = featureState.selectedIds;
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(dropId);
  if (from === -1 || to === -1 || from === to) return;
  ids.splice(from, 1);
  ids.splice(to, 0, dragId);
}

function attachDragHandlers(el, featureId) {
  el.draggable = true;
  el.addEventListener('dragstart', () => { dragSourceId = featureId; });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (dragSourceId && dragSourceId !== featureId) {
      reorderFeatureById(dragSourceId, featureId);
      onFeatureReorder();
    }
  });
}

const POWER_DISPLAY_LABELS = { apex: 'Epic' };
function powerDisplayLabel(power) {
  const key = String(power || '').toLowerCase();
  return POWER_DISPLAY_LABELS[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

function toDisplayInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return Math.round(value);
}

function toDisplayDamage(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return value >= 0 ? Math.floor(value) : Math.ceil(value);
}

function toSignedDisplayInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded}`;
}

function renderTraitGroup(container, group) {
  container.innerHTML = '';
  const row = container.closest('.statblock-trait-row');
  const addSpan = (text) => {
    const span = document.createElement('span');
    span.textContent = text;
    container.appendChild(span);
  };

  const hasDamage = group.damage.length > 0;
  const hasCondition = group.condition.length > 0;

  if (!hasDamage && !hasCondition) {
    if (row) row.style.display = 'none';
    return;
  }

  if (row) row.style.display = '';
  group.damage.forEach(addSpan);
  if (hasDamage && hasCondition) {
    const separator = document.createElement('span');
    separator.className = 'trait-separator';
    separator.textContent = '|';
    container.appendChild(separator);
  }
  group.condition.forEach(addSpan);
}

function renderSimpleList(container, values) {
  container.innerHTML = '';
  const row = container.closest('.statblock-trait-row');
  const entries = values && values.length ? values : ['None'];
  const validEntries = entries.filter((value) => value && value !== 'None');

  if (!validEntries.length) {
    if (row) row.style.display = 'none';
    return;
  }

  if (row) row.style.display = '';
  validEntries.forEach((value) => {
    const span = document.createElement('span');
    span.textContent = value;
    container.appendChild(span);
  });
}

function renderSkillList(container, values) {
  container.innerHTML = '';
  const row = container.closest('.statblock-trait-row');
  const entries = values && values.length ? values : ['None'];
  const validEntries = entries.filter((value) => value && value !== 'None');

  if (!validEntries.length) {
    if (row) row.style.display = 'none';
    return;
  }

  if (row) row.style.display = '';
  validEntries.forEach((value) => {
    const span = document.createElement('span');
    const attributeKey = SkillAttribute[value.toLowerCase()];
    if (attributeKey) {
      const base = creature.attributes[attributeKey] ?? 0;
      const scaling = 2 * Math.ceil(creature.level / 5);
      const total = toSignedDisplayInteger(base + scaling);
      span.textContent = `${value} (${total})`;
    } else {
      span.textContent = value;
    }
    container.appendChild(span);
  });
}

function makeAddButton(hintType, hintReaction = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'statblock-add-custom-btn';
  btn.title = 'Add custom feature';
  btn.textContent = '+';
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // Don't collapse the section
    onCustomFeatureAdd({ type: hintType, isReaction: hintReaction });
  });
  return btn;
}

function renderFeatureSummary() {
  const { statblockFeatures } = dom;
  if (!statblockFeatures) return;

  statblockFeatures.innerHTML = '';
  const section = statblockFeatures.closest('.statblock-feature-section');

  // Wire "+" button into section heading
  const heading = section?.querySelector('.statblock-feature-heading');
  if (heading) {
    // Wrap heading text + "+" into a flex row (only once)
    if (!heading.classList.contains('statblock-section-header')) {
      heading.classList.add('statblock-section-header');
      const text = heading.textContent;
      heading.textContent = '';
      const textSpan = document.createElement('span');
      textSpan.textContent = text;
      heading.appendChild(textSpan);
      heading.appendChild(makeAddButton('passive'));
    }
  }

  const uniqueFeatures = new Map();

  if (Array.isArray(creature.featurePassives)) {
    creature.featurePassives.forEach((feature) => {
      if (feature && feature.id && !uniqueFeatures.has(feature.id)) {
        uniqueFeatures.set(feature.id, feature);
      }
    });
  }

  featureState.selectedIds.forEach((id) => {
    const feature = featureState.byId[id];
    if (feature && feature.type === FEATURE_TYPES.MODIFIER && !uniqueFeatures.has(feature.id)) {
      uniqueFeatures.set(feature.id, feature);
    }
  });

  const items = Array.from(uniqueFeatures.values());

  // Always show the features section so the "+" add button is discoverable.
  if (section) section.style.display = '';
  items.forEach((feature) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'statblock-feature-item';
    wrapper.dataset.featureId = feature.id;

    const isCustom = Boolean(feature.isCustom);

    if (isCustom) {
      // Custom features: edit + remove buttons, no drag handle
      const nameRow = document.createElement('div');
      nameRow.className = 'feature-name';
      nameRow.textContent = feature.name;
      const badge = document.createElement('span');
      badge.className = 'custom-feature-badge';
      badge.textContent = 'custom';
      nameRow.appendChild(badge);

      const description = document.createElement('div');
      description.className = 'feature-description';
      description.textContent = getFeatureSummary(feature) || 'No description provided.';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'statblock-edit-btn';
      editBtn.title = 'Edit custom feature';
      editBtn.textContent = '✏';
      editBtn.addEventListener('click', (e) => { e.stopPropagation(); onCustomFeatureEdit(feature); });

      const bankBtn = document.createElement('button');
      bankBtn.type = 'button';
      bankBtn.className = 'statblock-bank-btn';
      bankBtn.title = 'Save to my feature bank';
      bankBtn.textContent = '★';
      bankBtn.addEventListener('click', (e) => { e.stopPropagation(); onSaveToBank(feature); });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'statblock-remove-btn';
      removeBtn.title = 'Remove feature';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => { e.stopPropagation(); onFeatureRemove(feature.id); });

      wrapper.append(nameRow, description, editBtn, bankBtn, removeBtn);
    } else {
      // Library features: drag handle + remove button
      attachDragHandlers(wrapper, feature.id);

      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.textContent = '⠿';

      const name = document.createElement('div');
      name.className = 'feature-name';
      name.textContent = feature.name;

      const description = document.createElement('div');
      description.className = 'feature-description';
      description.textContent = getFeatureSummary(feature) || 'No description provided.';

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'statblock-remove-btn';
      removeBtn.title = 'Remove feature';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => { e.stopPropagation(); onFeatureRemove(feature.id); });

      wrapper.append(handle, name, description, removeBtn);
    }

    statblockFeatures.appendChild(wrapper);
  });
}



function createActionCardElement(action, { showTrigger = false, baseDamage = 0 } = {}) {
  const isCustom = Boolean(action.isCustom);
  const card = sharedCreateActionCardElement(action, creature.saveDC ?? 0, baseDamage, {
    showTrigger,
    showDragHandle: !isCustom,
    showRemoveButton: true,
    showEditButton: isCustom,
    showBankButton: isCustom,
    showCustomBadge: isCustom,
    onRemove: () => onFeatureRemove(action.id),
    onEdit: () => {
      const orig = (creature.customFeatures || []).find((f) => f.id === action.id);
      onCustomFeatureEdit(orig || action);
    },
    onBank: () => {
      const orig = (creature.customFeatures || []).find((f) => f.id === action.id);
      onSaveToBank(orig || action);
    },
  });
  if (!isCustom) attachDragHandlers(card, action.id);
  return card;
}

function renderActionList(target, actions, { emptyMessage = 'No actions available.', showTrigger = false, baseDamage = 0 } = {}) {
  if (!target) return;
  target.innerHTML = '';

  if (!Array.isArray(actions) || actions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'statblock-action-item';
    empty.textContent = emptyMessage;
    target.appendChild(empty);
    return;
  }

  actions.forEach((action) => {
    const card = createActionCardElement(action, { showTrigger, baseDamage });
    if (card) target.appendChild(card);
  });
}
function renderActionSummary() {
  const {
    statblockActionsHeading,
    statblockActionsInfo,
    statblockActionsList,
    statblockReactionsSection,
    statblockReactionsList,
  } = dom;
  if (!statblockActionsHeading || !statblockActionsInfo || !statblockActionsList) return;

  const ap = Number.isFinite(creature.AP) ? toDisplayInteger(creature.AP) : 0;
  const rp = Number.isFinite(creature.RP) ? toDisplayInteger(creature.RP) : 0;

  // Build "Actions (N) +" header
  if (!statblockActionsHeading.classList.contains('statblock-section-header')) {
    statblockActionsHeading.classList.add('statblock-section-header');
  }
  statblockActionsHeading.innerHTML = '';
  const actionsTextSpan = document.createElement('span');
  actionsTextSpan.textContent = `Actions (${ap})`;
  statblockActionsHeading.appendChild(actionsTextSpan);
  statblockActionsHeading.appendChild(makeAddButton('action', false));

  const baseDamage = Number.isFinite(creature.damage)
    ? creature.damage
    : Number.isFinite(creature.stats?.damage)
      ? creature.stats.damage
      : 0;

  const effectiveBaseDamage = baseDamage;

  const infoItems = [
    { label: 'Attack', value: toSignedDisplayInteger(Number(creature.check) || 0) },
    { label: 'Attack Damage', value: toDisplayDamage(effectiveBaseDamage) },
    { label: 'Save DC', value: toDisplayInteger(Number(creature.saveDC) || 0) },
    { label: 'Speed', value: toDisplayInteger(Number(creature.speed) || 0) },
    ...(rp > 0 ? [{ label: 'Reaction Points', value: rp }] : []),
  ];

  statblockActionsInfo.innerHTML = '';
  infoItems.forEach(({ label, value }) => {
    const span = document.createElement('span');
    span.textContent = `${label}: ${value}`;
    statblockActionsInfo.appendChild(span);
  });

  renderActionList(statblockActionsList, creature.featureActions, {
    emptyMessage: 'No actions available.',
    baseDamage: effectiveBaseDamage,
  });

  if (statblockReactionsSection && statblockReactionsList) {
    const reactions = Array.isArray(creature.featureReactions) ? creature.featureReactions : [];

    // Add "+" button to Reactions heading
    const reactionsHeading = statblockReactionsSection.querySelector('.statblock-actions-heading');
    if (reactionsHeading && !reactionsHeading.classList.contains('statblock-section-header')) {
      reactionsHeading.classList.add('statblock-section-header');
      const origText = reactionsHeading.textContent;
      reactionsHeading.textContent = '';
      const rTextSpan = document.createElement('span');
      rTextSpan.textContent = origText;
      reactionsHeading.appendChild(rTextSpan);
      reactionsHeading.appendChild(makeAddButton('action', true));
    }

    // Always show the reactions section so users can see the "+" button to add a custom reaction.
    statblockReactionsSection.style.display = '';
    renderActionList(statblockReactionsList, reactions, {
      emptyMessage: 'No reactions — use + to add one.',
      showTrigger: true,
      baseDamage: effectiveBaseDamage,
    });
  }
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function computePlayerHitChanceVs(defense) {
  const isNovice = creature.level === 'novice';
  const level = isNovice ? 0 : (Number(creature.level) || 0);
  // Novice-level PCs have Attack Bonus +2; level 0+ use the standard formula
  const baseline = isNovice ? 2 : 3 + Math.floor(level / 5) + Math.ceil(level / 2);
  const raw = (20 - Number(defense) + baseline) * 5;
  return clampPercent(raw);
}

function renderRecommendations() {
  const { recommendationsPanel } = dom;
  if (!recommendationsPanel) return;

  // ── Convert creature to sim format and run evaluation ──
  const simInput = creatureFromState(creature);
  const report = evaluateCreature(simInput);

  const s = report.survivability;
  const t = report.threat;

  // ── Trait Value budget ──
  const traitBudget = Number.isFinite(creature.traitValue) ? creature.traitValue : 0;
  const traitSpent = computeSpentTraitValue();

  // ── Attack target coverage ──
  const allActions = [
    ...(Array.isArray(creature.featureActions) ? creature.featureActions : []),
    ...(Array.isArray(creature.featureReactions) ? creature.featureReactions : []),
  ];
  const targetedDefenses = [...new Set(allActions.map((a) => a.targetDefense).filter(Boolean))];

  // ── Build the DOM ──
  recommendationsPanel.innerHTML = '';

  // ── Header row: difficulty badge + trait budget ──
  const header = document.createElement('div');
  header.className = 'bal-header';

  const badge = document.createElement('div');
  badge.className = `bal-difficulty ${difficultyColorClass(report.difficulty)}`;
  badge.innerHTML = `<span class="bal-diff-label">${report.difficulty}</span>`;
  header.appendChild(badge);

  // Trait budget bar
  const traitSection = document.createElement('div');
  traitSection.className = 'bal-trait-budget';
  const traitLabel = document.createElement('div');
  traitLabel.className = 'bal-trait-label';
  traitLabel.textContent = `Trait Value: ${traitSpent} / ${traitBudget}`;
  traitSection.appendChild(traitLabel);
  const traitBar = document.createElement('div');
  traitBar.className = 'bal-trait-bar';
  const pct = traitBudget > 0 ? Math.min((traitSpent / traitBudget) * 100, 100) : 0;
  const overBudget = traitSpent > traitBudget;
  const traitFill = document.createElement('div');
  traitFill.className = `bal-trait-fill${overBudget ? ' bal-trait-over' : ''}`;
  traitFill.style.width = `${pct}%`;
  traitBar.appendChild(traitFill);
  if (overBudget) {
    const overPct = Math.min(((traitSpent - traitBudget) / traitBudget) * 100, 100);
    const overFill = document.createElement('div');
    overFill.className = 'bal-trait-overflow';
    overFill.style.width = `${overPct}%`;
    traitBar.appendChild(overFill);
  }
  traitSection.appendChild(traitBar);
  header.appendChild(traitSection);
  recommendationsPanel.appendChild(header);

  // ── Offense / Defense split cards ──
  const splitRow = document.createElement('div');
  splitRow.className = 'bal-split';

  const pcCount = report.balance.pcCount || 1;
  const pcLabel = pcCount > 1 ? `(${pcCount} PCs)` : '(1 PC)';

  // Defense card
  const defCard = buildStatCard('Defense', report.defenseDifficulty, [
    { label: 'Effective HP', value: s.effectiveHP, sub: `raw ${s.rawHP}` },
    { label: `Rounds to Kill ${pcLabel}`, value: report.balance.roundsToKill, target: 3.0, unit: '', better: 'high' },
  ]);
  splitRow.appendChild(defCard);

  // Offense card
  const offStats = [
    { label: 'Focus DPR', value: t.focusDPR, sub: t.focusCondValue > 0 ? `+${t.focusCondValue} cond` : null },
    { label: `Rounds to Down ${pcLabel}`, value: report.balance.roundsToDownPC, target: report.balance.targetRTD, unit: '', better: 'low' },
  ];
  if (t.rp > 0) {
    offStats.splice(1, 0, { label: `RP Damage (${t.rp} RP, 75%)`, value: t.rpDmgPerRound, sub: 'per round' });
  }
  const offCard = buildStatCard('Offense', report.offenseDifficulty, offStats);
  splitRow.appendChild(offCard);
  recommendationsPanel.appendChild(splitRow);

  // ── Accuracy section: creature hit + player hit bars ──
  const accSection = document.createElement('div');
  accSection.className = 'bal-accuracy';

  // Creature accuracy row
  const creatureAcc = document.createElement('div');
  creatureAcc.className = 'bal-acc-row';
  creatureAcc.innerHTML = `<span class="bal-acc-label">Creature hit chance</span>`
    + `<span class="bal-acc-value">${t.hitChance}%</span>`;
  if (t.saveFailChance > 0) {
    creatureAcc.innerHTML += `<span class="bal-acc-sep">|</span>`
      + `<span class="bal-acc-label">Save fail</span>`
      + `<span class="bal-acc-value">${t.saveFailChance}%</span>`;
  }
  accSection.appendChild(creatureAcc);

  // Player hit chance bars
  const makeBar = (label, defense) => {
    const miss = 100 - computePlayerHitChanceVs(defense);
    const hit = computePlayerHitChanceVs(defense) - computePlayerHitChanceVs(defense + 5);
    const heavy = computePlayerHitChanceVs(defense + 5) - computePlayerHitChanceVs(defense + 10);
    const brutal = computePlayerHitChanceVs(defense + 10);
    return { label, segments: [
      { key: 'miss', text: `${miss}%`, flex: miss },
      { key: 'hit', text: `${hit}%`, flex: hit },
      { key: 'heavy', text: `${heavy}%`, flex: heavy },
      { key: 'brutal', text: `${brutal}%`, flex: brutal },
    ]};
  };

  for (const bar of [makeBar('vs PD', creature.PD), makeBar('vs AD', creature.AD)]) {
    const row = document.createElement('div');
    row.className = 'bal-hitbar-row';
    const l = document.createElement('span');
    l.className = 'bal-hitbar-label';
    l.textContent = bar.label;
    row.appendChild(l);

    const barEl = document.createElement('div');
    barEl.className = 'hit-chance-bar';
    for (const { key, text, flex } of bar.segments) {
      if (flex <= 0) continue;
      const seg = document.createElement('div');
      seg.className = `hc-segment hc-${key}`;
      seg.style.flex = String(flex);
      seg.title = `${text} ${key.charAt(0).toUpperCase() + key.slice(1)}`;
      seg.textContent = flex >= 12 ? text : '';
      barEl.appendChild(seg);
    }
    row.appendChild(barEl);
    accSection.appendChild(row);
  }

  // Hit chance bar legend
  const legend = document.createElement('div');
  legend.className = 'bal-hitbar-legend';
  legend.innerHTML = '<span class="hc-legend-dot hc-miss"></span>Miss '
    + '<span class="hc-legend-dot hc-hit"></span>Hit '
    + '<span class="hc-legend-dot hc-heavy"></span>Heavy '
    + '<span class="hc-legend-dot hc-brutal"></span>Brutal';
  accSection.appendChild(legend);

  recommendationsPanel.appendChild(accSection);

  // ── Round 1 rotation (collapsible) ──
  if (t.focusRotation && t.focusRotation.length > 0) {
    const rotSection = document.createElement('details');
    rotSection.className = 'bal-rotation';
    const rotSummary = document.createElement('summary');
    rotSummary.className = 'bal-rotation-summary';
    rotSummary.textContent = `Round 1 Rotation (${t.focusRotation.length} actions)`;
    rotSection.appendChild(rotSummary);
    for (const line of t.focusRotation) {
      const el = document.createElement('div');
      el.className = 'bal-rotation-line';
      el.textContent = line;
      rotSection.appendChild(el);
    }
    recommendationsPanel.appendChild(rotSection);
  }

  // ── Warnings ──
  const allWarnings = [...report.warnings];
  if (!targetedDefenses.includes('PD')) {
    allWarnings.push('No attacks target PD.');
  }
  if (!targetedDefenses.includes('AD')) {
    allWarnings.push('No attacks target AD.');
  }

  if (allWarnings.length > 0) {
    const warningsBox = document.createElement('div');
    warningsBox.className = 'bal-warnings';
    for (const w of allWarnings) {
      const item = document.createElement('div');
      item.className = 'bal-warning-item';
      item.textContent = w;
      warningsBox.appendChild(item);
    }
    recommendationsPanel.appendChild(warningsBox);
  }

  // ── Fix suggestions ──
  if (report.difficulty !== 'Medium') {
    const fixes = computeFixSuggestions(simInput, report);
    if (fixes.length > 0) {
      const fixSection = document.createElement('div');
      fixSection.className = 'bal-fixes';
      const fixTitle = document.createElement('div');
      fixTitle.className = 'bal-fixes-title';
      fixTitle.textContent = 'Suggested Fixes';
      fixSection.appendChild(fixTitle);

      for (const fix of fixes) {
        const row = document.createElement('div');
        row.className = 'bal-fix-row';
        const desc = document.createElement('span');
        desc.className = 'bal-fix-desc';
        desc.textContent = fix.description;
        const resultSpan = document.createElement('span');
        resultSpan.className = `bal-fix-result ${difficultyColorClass(fix.resultDifficulty)}`;
        resultSpan.textContent = fix.resultDifficulty;
        const btn = document.createElement('button');
        btn.className = 'bal-fix-btn';
        btn.textContent = 'Apply';
        btn.type = 'button';
        btn.addEventListener('click', () => onApplyFix(fix.deltas));
        row.append(desc, resultSpan, btn);
        fixSection.appendChild(row);
      }
      recommendationsPanel.appendChild(fixSection);
    }
  }
}

/** Build a stat card for the offense/defense split */
function buildStatCard(title, difficulty, stats) {
  const card = document.createElement('div');
  card.className = `bal-card ${difficultyColorClass(difficulty)}`;
  const hdr = document.createElement('div');
  hdr.className = 'bal-card-header';
  hdr.innerHTML = `<span class="bal-card-title">${title}</span>`
    + `<span class="bal-card-diff">${difficulty}</span>`;
  card.appendChild(hdr);

  for (const stat of stats) {
    const row = document.createElement('div');
    row.className = 'bal-card-stat';
    const lbl = document.createElement('span');
    lbl.className = 'bal-card-stat-label';
    lbl.textContent = stat.label;
    const val = document.createElement('span');
    val.className = 'bal-card-stat-value';
    val.textContent = stat.value;
    if (stat.sub) {
      const sub = document.createElement('span');
      sub.className = 'bal-card-stat-sub';
      sub.textContent = stat.sub;
      val.appendChild(sub);
    }
    row.append(lbl, val);
    if (stat.target != null) {
      // Deviation indicator
      const dev = ((stat.value - stat.target) / stat.target * 100);
      const devSign = dev > 0 ? '+' : '';
      const devEl = document.createElement('span');
      devEl.className = 'bal-card-stat-dev';
      const isGood = (stat.better === 'high' && dev >= 0) || (stat.better === 'low' && dev <= 0) || Math.abs(dev) < 15;
      devEl.classList.add(isGood ? 'bal-dev-ok' : 'bal-dev-warn');
      devEl.textContent = `${devSign}${Math.round(dev)}%`;
      row.appendChild(devEl);
    }
    card.appendChild(row);
  }
  return card;
}

/**
 * Compute fix suggestions by running "what if" simulations with stat tweaks.
 * Returns an array of { description, deltas, resultDifficulty } sorted by
 * how close they bring the creature to Medium.
 */
function computeFixSuggestions(baseSimInput, baseReport) {
  const isTooStrong = ['Hard', 'Very Hard', 'Deadly'].includes(baseReport.difficulty);
  const sign = isTooStrong ? -1 : 1;

  // Candidate tweaks: [description, delta field, amount]
  const candidates = [];

  // Defense tweaks (PD, AD, HP)
  if (baseReport.defenseDifficulty !== 'Medium') {
    const defTooHigh = ['Hard', 'Very Hard', 'Deadly'].includes(baseReport.defenseDifficulty);
    const dSign = defTooHigh ? -1 : 1;
    for (const step of [1, 2, 3]) {
      candidates.push([`${dSign * step > 0 ? '+' : ''}${dSign * step} PD`, 'PD', dSign * step]);
      candidates.push([`${dSign * step > 0 ? '+' : ''}${dSign * step} AD`, 'AD', dSign * step]);
    }
    // HP tweaks in larger increments
    const hpStep = Math.max(1, Math.round(baseSimInput.hp * 0.15));
    for (const mult of [1, 2]) {
      const amt = dSign * hpStep * mult;
      candidates.push([`${amt > 0 ? '+' : ''}${amt} HP`, 'HP', amt]);
    }
  }

  // Offense tweaks (damage, check/attackBonus)
  if (baseReport.offenseDifficulty !== 'Medium') {
    const offTooHigh = ['Hard', 'Very Hard', 'Deadly'].includes(baseReport.offenseDifficulty);
    const oSign = offTooHigh ? -1 : 1;
    for (const step of [1, 2, 3]) {
      candidates.push([`${oSign * step > 0 ? '+' : ''}${oSign * step} Check`, 'check', oSign * step]);
    }
    // Damage comes from the base damage stat
    const dmgBase = baseSimInput.damage || 1;
    for (const step of [0.5, 1, 2]) {
      const amt = oSign * step;
      if (dmgBase + amt < 0) continue;
      candidates.push([`${amt > 0 ? '+' : ''}${amt} Damage`, 'damage', amt]);
    }
  }

  // Evaluate each candidate
  const results = [];
  const seenDescriptions = new Set();
  for (const [desc, field, amount] of candidates) {
    if (seenDescriptions.has(desc)) continue;
    seenDescriptions.add(desc);

    // Build tweaked creature
    const tweaked = { ...baseSimInput };
    const deltaField = field;
    switch (field) {
      case 'PD': tweaked.pd = baseSimInput.pd + amount; break;
      case 'AD': tweaked.ad = baseSimInput.ad + amount; break;
      case 'HP': tweaked.hp = baseSimInput.hp + amount; break;
      case 'check': tweaked.attackBonus = baseSimInput.attackBonus + amount; break;
      case 'damage':
        tweaked.damage = baseSimInput.damage + amount;
        // Also adjust attacks if they exist
        if (tweaked.attacks) {
          tweaked.attacks = baseSimInput.attacks.map(a => ({
            ...a,
            damage: Math.max(0, a.damage + amount),
          }));
        }
        break;
    }

    const tweakedReport = evaluateCreature(tweaked);

    // Only suggest if it moves toward Medium
    const baseDist = difficultyDistance(baseReport.difficulty);
    const tweakedDist = difficultyDistance(tweakedReport.difficulty);
    if (tweakedDist < baseDist) {
      results.push({
        description: desc,
        deltas: { [deltaField]: amount },
        resultDifficulty: tweakedReport.difficulty,
        distance: tweakedDist,
      });
    }
  }

  // Sort by closest to Medium, then by smallest change
  results.sort((a, b) => a.distance - b.distance || Math.abs(Object.values(a.deltas)[0]) - Math.abs(Object.values(b.deltas)[0]));

  // Return top 5 distinct suggestions
  return results.slice(0, 5);
}

/** Distance from Medium: 0 = Medium, 1 = Easy/Hard, 2 = Very Hard, 3 = Deadly */
function difficultyDistance(label) {
  const map = { 'Very Easy': 2, 'Easy': 1, 'Medium': 0, 'Hard': 1, 'Very Hard': 2, 'Deadly': 3 };
  return map[label] ?? 2;
}

/** CSS class for difficulty coloring */
function difficultyColorClass(label) {
  const map = {
    'Very Easy': 'diff-veryeasy', 'Easy': 'diff-easy', 'Medium': 'diff-medium',
    'Hard': 'diff-hard', 'Very Hard': 'diff-veryhard', 'Deadly': 'diff-deadly',
  };
  return map[label] || 'diff-medium';
}

function computeSpentTraitValue() {
  const selectedIds = featureState.selectedIds ?? [];
  return selectedIds.reduce((sum, id) => {
    const f = featureState.byId[id];
    return sum + (f?.featureCost ?? 0);
  }, 0);
}

function renderCreatureStatblock() {
  const {
    statblockName,
    statblockInfo,
    statblockShortDescription,
    statblockLongDescription,
    statblockHP,
    statblockPD,
    statblockAD,
    statblockMIG,
    statblockMIGSave,
    statblockAGI,
    statblockAGISave,
    statblockCHA,
    statblockCHASave,
    statblockINT,
    statblockINTSave,
    statblockResistances,
    statblockVulnerabilities,
    statblockImmunities,
    statblockSkills,
    statblockSenses,
  } = dom;

  statblockName.textContent = creature.name || TITLE_FALLBACK;

  const typeDisplay = creature.type && creature.type !== 'none'
    ? creature.type.charAt(0).toUpperCase() + creature.type.slice(1)
    : '';
  const infoLeft = `${creature.size.charAt(0).toUpperCase() + creature.size.slice(1)} ${typeDisplay}`.trim();
  const infoRightParts = [`Level ${creature.level}`];
  if (creature.power !== 'normal') {
    infoRightParts.push(powerDisplayLabel(creature.power));
  }
  infoRightParts.push(creature.role.charAt(0).toUpperCase() + creature.role.slice(1));
  statblockInfo.textContent = `${infoLeft} | ${infoRightParts.join(' ')}`;

  if (statblockShortDescription) {
    if (creature.shortDescription) {
      statblockShortDescription.textContent = creature.shortDescription;
      statblockShortDescription.style.display = '';
    } else {
      statblockShortDescription.textContent = '';
      statblockShortDescription.style.display = 'none';
    }
  }

  if (statblockLongDescription) {
    if (creature.longDescription) {
      statblockLongDescription.textContent = creature.longDescription;
      statblockLongDescription.style.display = '';
    } else {
      statblockLongDescription.textContent = '';
      statblockLongDescription.style.display = 'none';
    }
  }

  const hp = Number.isFinite(creature.HP) ? toDisplayInteger(creature.HP) : 0;
  const pd = Number.isFinite(creature.PD) ? toDisplayInteger(creature.PD) : 0;
  const ad = Number.isFinite(creature.AD) ? toDisplayInteger(creature.AD) : 0;
  statblockHP.textContent = hp;
  statblockPD.textContent = `${pd} / ${pd + 5} / ${pd + 10}`;
  statblockAD.textContent = `${ad} / ${ad + 5} / ${ad + 10}`;
  const traitBudget = Number.isFinite(creature.traitValue) ? creature.traitValue : 0;
  const traitSpent = computeSpentTraitValue();
  if (dom.featureTraitValue) {
    const remaining = traitBudget - traitSpent;
    dom.featureTraitValue.textContent = `Trait Value: ${traitSpent} / ${traitBudget} (${remaining} remaining)`;
    dom.featureTraitValue.classList.toggle('feature-trait-value--over', traitSpent > traitBudget);
  }

  statblockMIG.textContent = toDisplayInteger(creature.attributes.Mig ?? 0);
  statblockMIGSave.textContent = toDisplayInteger(creature.attributeSaves.Mig ?? 0);
  statblockAGI.textContent = toDisplayInteger(creature.attributes.Agi ?? 0);
  statblockAGISave.textContent = toDisplayInteger(creature.attributeSaves.Agi ?? 0);
  statblockCHA.textContent = toDisplayInteger(creature.attributes.Cha ?? 0);
  statblockCHASave.textContent = toDisplayInteger(creature.attributeSaves.Cha ?? 0);
  statblockINT.textContent = toDisplayInteger(creature.attributes.Int ?? 0);
  statblockINTSave.textContent = toDisplayInteger(creature.attributeSaves.Int ?? 0);

  const formattedSkills = creature.skills.map((skill) => skill.charAt(0).toUpperCase() + skill.slice(1));
  renderTraitGroup(statblockResistances, creature.resistances);
  renderTraitGroup(statblockVulnerabilities, creature.vulnerabilities);
  renderTraitGroup(statblockImmunities, creature.immunities);
  renderSkillList(statblockSkills, formattedSkills);
  renderSimpleList(statblockSenses, creature.senses);
  renderFeatureSummary();
  renderActionSummary();
  renderRecommendations();
}

export { renderCreatureStatblock };

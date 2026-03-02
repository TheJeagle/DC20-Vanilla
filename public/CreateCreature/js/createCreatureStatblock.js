import dom from './createCreatureDom.js';
import { creature, featureState, TITLE_FALLBACK } from './createCreatureState.js';
import { FEATURE_TYPES, getFeatureSummary } from '../../features.js';
import { SkillAttribute } from '../../Rules/gameRules.js';
import {
  createActionCardElement as sharedCreateActionCardElement,
  appendField, appendBoldField, appendText,
  createActionBadges, hasHalfDamage,
} from '../../actionCardRenderer.js';

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

  const infoItems = [
    { label: 'Attack', value: toSignedDisplayInteger(Number(creature.check) || 0) },
    { label: 'Base Damage', value: toDisplayDamage(baseDamage) },
    { label: 'Save DC', value: toDisplayInteger(Number(creature.saveDC) || 0) },
    { label: 'Speed', value: toDisplayInteger(Number(creature.speed) || 0) },
  ];

  statblockActionsInfo.innerHTML = '';
  infoItems.forEach(({ label, value }) => {
    const span = document.createElement('span');
    span.textContent = `${label}: ${value}`;
    statblockActionsInfo.appendChild(span);
  });

  renderActionList(statblockActionsList, creature.featureActions, {
    emptyMessage: 'No actions available.',
    baseDamage,
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
      baseDamage,
    });
  }
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function computePlayerHitChanceVs(defense) {
  const level = Number(creature.level) || 0;
  const baseline = 3 + Math.floor(level / 5) + Math.ceil(level / 2);
  const raw = (20 - Number(defense) + baseline) * 5;
  return clampPercent(raw);
}

const CRIT_CHANCE = 0.05;
const CRIT_BONUS_DAMAGE = 2;

function computeExpectedDamagePerAttack(defense, baseDamage) {
  const hitChance = computePlayerHitChanceVs(defense) / 100;
  let bonusChance = 0;
  for (let bonus = 5; bonus <= 20; bonus += 5) {
    bonusChance += computePlayerHitChanceVs(defense + bonus) / 100;
  }
  return baseDamage * hitChance + bonusChance + CRIT_CHANCE * CRIT_BONUS_DAMAGE;
}

function renderRecommendations() {
  const { recommendationsPanel } = dom;
  if (!recommendationsPanel) return;

  const chanceVsPD = computePlayerHitChanceVs(creature.PD);
  const chanceVsPDHeavy = computePlayerHitChanceVs(creature.PD + 5);
  const chanceVsPDBrutal = computePlayerHitChanceVs(creature.PD + 10);
  const chanceVsAD = computePlayerHitChanceVs(creature.AD);
  const chanceVsADHeavy = computePlayerHitChanceVs(creature.AD + 5);
  const chanceVsADBrutal = computePlayerHitChanceVs(creature.AD + 10);

  const level = Number(creature.level) || 0;
  const expectedPlayerDPT = Math.ceil(level + 4);
  const expectedPlayerDamagePerAttack = expectedPlayerDPT / 2;
  const expectedDamageVsPDPerAttack = computeExpectedDamagePerAttack(
    creature.PD,
    expectedPlayerDamagePerAttack,
  );
  const expectedDamageVsADPerAttack = computeExpectedDamagePerAttack(
    creature.AD,
    expectedPlayerDamagePerAttack,
  );
  const expectedDamageVsPDPerRound = expectedDamageVsPDPerAttack * 2;
  const expectedDamageVsADPerRound = expectedDamageVsADPerAttack;
  const turnsToKill =
    expectedDamageVsPDPerRound > 0 ? Number(creature.HP) / expectedDamageVsPDPerRound : Infinity;
  const expectedDamageDealt = Math.ceil((Number(creature.damage) || 0) * 1.3 * (Number.isFinite(turnsToKill) ? turnsToKill : 0));
  const expectedDamageVsPDPerRoundDisplay = Number.isFinite(expectedDamageVsPDPerRound)
    ? toDisplayDamage(expectedDamageVsPDPerRound)
    : 0;
  const expectedDamageVsADPerRoundDisplay = Number.isFinite(expectedDamageVsADPerRound)
    ? toDisplayDamage(expectedDamageVsADPerRound)
    : 0;
  const turnsToKillDisplay = Number.isFinite(turnsToKill) ? toDisplayInteger(turnsToKill) : 'ƒ?"';

  const allActions = [
    ...(Array.isArray(creature.featureActions) ? creature.featureActions : []),
    ...(Array.isArray(creature.featureReactions) ? creature.featureReactions : []),
  ];
  const targetedDefenses = [...new Set(allActions.map((a) => a.targetDefense).filter(Boolean))];
  const attackTargetsDisplay = targetedDefenses.length ? targetedDefenses.join(', ') : 'None';

  const missPD   = 100 - chanceVsPD;
  const hitPD    = chanceVsPD - chanceVsPDHeavy;
  const heavyPD  = chanceVsPDHeavy - chanceVsPDBrutal;
  const brutalPD = chanceVsPDBrutal;

  const missAD   = 100 - chanceVsAD;
  const hitAD    = chanceVsAD - chanceVsADHeavy;
  const heavyAD  = chanceVsADHeavy - chanceVsADBrutal;
  const brutalAD = chanceVsADBrutal;

  const makeBar = (label, miss, hit, heavy, brutal) => ({
    type: 'bar',
    label,
    segments: [
      { key: 'miss',   text: `${miss}% Miss`,   flex: miss },
      { key: 'hit',    text: `${hit}% Hit`,     flex: hit },
      { key: 'heavy',  text: `${heavy}% Heavy`, flex: heavy },
      { key: 'brutal', text: `${brutal}% Brutal`, flex: brutal },
    ],
  });

  const lines = [
    { label: 'Attack targets: ', value: attackTargetsDisplay },
    makeBar('Player hit vs PD (equal level):', missPD, hitPD, heavyPD, brutalPD),
    makeBar('Player hit vs AD (equal level):', missAD, hitAD, heavyAD, brutalAD),
    {
      label: 'Est. PD damage per player per round: ',
      value: `${expectedDamageVsPDPerRoundDisplay}`,
    },
    {
      label: 'Est. AD damage per player per round: ',
      value: `${expectedDamageVsADPerRoundDisplay}`,
    },
    {
      label: 'Avg. turns to defeat (PD): ',
      value: `${turnsToKillDisplay}`,
    },
    { label: 'Avg. damage before death: ', value: `${expectedDamageDealt}` },
  ];

  const warnings = [];
  if (!targetedDefenses.includes('PD')) {
    warnings.push('No attacks target PD — characters who invest in Precision Defense gain no benefit against this creature.');
  }
  if (!targetedDefenses.includes('AD')) {
    warnings.push('No attacks target AD — characters who invest in Area Defense gain no benefit against this creature.');
  }

  const pdMissHigh = missPD > 50;
  const pdMissLow  = missPD < 40;
  const adMissHigh = missAD > 50;
  const adMissLow  = missAD < 40;

  if (pdMissHigh) {
    if (adMissLow) {
      warnings.push(`Player Hit Chance vs PD is low: ${chanceVsPD}%, but offset by a high Player Hit Chance vs AD: ${chanceVsAD}% — only balanced if the party can target both defenses.`);
    } else {
      warnings.push(`Player Hit Chance vs PD is low: ${chanceVsPD}% — This creature may be too durable against Precision Attacks.`);
    }
  } else if (pdMissLow) {
    if (adMissHigh) {
      warnings.push(`Player Hit Chance vs PD is high: ${chanceVsPD}%, but offset by a low Player Hit Chance vs AD: ${chanceVsAD}% — only balanced if the party can target both defenses.`);
    } else {
      warnings.push(`Player Hit Chance vs PD is high: ${chanceVsPD}% — This creature may be too fragile against Precision Attacks.`);
    }
  }

  if (adMissHigh && !pdMissLow) {
    warnings.push(`Player Hit Chance vs AD is low: ${chanceVsAD}% — This creature may be too durable against Area Attacks.`);
  } else if (adMissLow && !pdMissHigh) {
    warnings.push(`Player Hit Chance vs AD is high: ${chanceVsAD}% — This creature may be too fragile against Area Attacks.`);
  }

  if (Number.isFinite(turnsToKill) && turnsToKill > 4) {
    warnings.push(`High durability: ~${turnsToKillDisplay} turns to defeat.`);
  }

  const baseKillThreshold = Math.ceil(6 + 1.5 * level);
  let multiplier = 1;
  const power = String(creature.power || '').toLowerCase();
  if (power === 'apex') multiplier = 2;
  else if (power === 'legendary') multiplier = 4;

  if (expectedDamageDealt > multiplier * baseKillThreshold) {
    const note = multiplier === 1 ? '' : ` (adjusted for ${power})`;
    warnings.push(`High lethality: ${expectedDamageDealt} > ${multiplier * baseKillThreshold}${note}.`);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'recommendations-content';

  const list = document.createElement('div');
  list.className = 'recommendations-list';
  lines.forEach(({ type, label, value, segments }) => {
    const row = document.createElement('div');
    row.className = 'recommendations-row';

    if (type === 'bar') {
      row.classList.add('recommendations-row--bar');
      const l = document.createElement('span');
      l.className = 'recommendations-label';
      l.textContent = label;
      row.appendChild(l);

      const bar = document.createElement('div');
      bar.className = 'hit-chance-bar';
      segments.forEach(({ key, text, flex }) => {
        if (flex <= 0) return;
        const seg = document.createElement('div');
        seg.className = `hc-segment hc-${key}`;
        seg.style.flex = String(flex);
        seg.title = text;
        seg.textContent = flex >= 15 ? text : `${flex}%`;
        bar.appendChild(seg);
      });
      row.appendChild(bar);
    } else {
      const l = document.createElement('span');
      l.className = 'recommendations-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'recommendations-value';
      v.textContent = value;
      row.append(l, v);
    }

    list.appendChild(row);
  });
  wrapper.appendChild(list);

  const warningsBox = document.createElement('div');
  warningsBox.className = 'recommendations-warnings';
  if (warnings.length) {
    const title = document.createElement('div');
    title.className = 'warnings-title';
    title.textContent = 'Warnings';
    warningsBox.appendChild(title);

    warnings.forEach((warning) => {
      const item = document.createElement('div');
      item.className = 'warning-item';
      item.textContent = warning;
      warningsBox.appendChild(item);
    });
  }

  recommendationsPanel.innerHTML = '<h2>Recommendations</h2>';
  if (warnings.length) {
    recommendationsPanel.appendChild(warningsBox);
  }
  recommendationsPanel.appendChild(wrapper);
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

  const infoLeft = `${creature.size.charAt(0).toUpperCase() + creature.size.slice(1)} ${creature.type.charAt(0).toUpperCase() + creature.type.slice(1)}`.trim();
  const infoRightParts = [`Level ${creature.level}`];
  if (creature.power !== 'normal') {
    infoRightParts.push(creature.power.charAt(0).toUpperCase() + creature.power.slice(1));
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

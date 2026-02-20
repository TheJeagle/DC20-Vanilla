import dom from './createCreatureDom.js';
import { creature, featureState, TITLE_FALLBACK } from './createCreatureState.js';
import { FEATURE_TYPES, getFeatureSummary } from '../../features.js';
import { SkillAttribute } from '../../Rules/gameRules.js';

let dragSourceId = null;
let onFeatureReorder = () => {};

export function setFeatureReorderHandler(cb) {
  onFeatureReorder = typeof cb === 'function' ? cb : () => {};
}

let onFeatureRemove = () => {};
export function setFeatureRemoveHandler(cb) {
  onFeatureRemove = typeof cb === 'function' ? cb : () => {};
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

function appendField(parent, value, field) {
  if (value === undefined || value === null || value === '') return;
  const span = document.createElement('span');
  span.className = 'action-span';
  span.dataset.field = field;
  span.textContent = formatDisplayValue(value, field);
  parent.appendChild(span);
}

function appendBoldField(parent, value, field) {
  if (value === undefined || value === null || value === '') return;
  const strong = document.createElement('strong');
  appendField(strong, value, field);
  parent.appendChild(strong);
}

function appendText(parent, html) {
  if (html === undefined || html === null || html === '') return;
  const span = document.createElement('span');
  span.innerHTML = html;
  parent.appendChild(span);
}

function toDisplayInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return Math.round(value);
}

function toSignedDisplayInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded}`;
}

function toDisplayDamage(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return value >= 0 ? Math.floor(value) : Math.ceil(value);
}

function formatDisplayValue(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (field === 'damageAmount') return toDisplayDamage(value);
  return toDisplayInteger(value);
}

function hasHalfDamage(segments) {
  return segments.some((segment) => {
    const amount = Number(segment?.amount);
    if (!Number.isFinite(amount)) return false;
    const remainder = Math.abs(amount % 1);
    return Math.abs(remainder - 0.5) < 1e-9;
  });
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

function renderFeatureSummary() {
  const { statblockFeatures } = dom;
  if (!statblockFeatures) return;

  statblockFeatures.innerHTML = '';
  const section = statblockFeatures.closest('.statblock-feature-section');

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

  if (!items.length) {
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = '';
  items.forEach((feature) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'statblock-feature-item';
    wrapper.dataset.featureId = feature.id;
    attachDragHandlers(wrapper, feature.id);

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';

    const name = document.createElement('div');
    name.className = 'feature-name';
    name.textContent = feature.name;

    const description = document.createElement('div');
    description.className = 'feature-description';
    const summary = getFeatureSummary(feature);
    description.textContent = summary || 'No description provided.';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'statblock-remove-btn';
    removeBtn.title = 'Remove feature';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); onFeatureRemove(feature.id); });

    wrapper.append(handle, name, description, removeBtn);
    statblockFeatures.appendChild(wrapper);
  });
}

function createActionBadges(action) {
  const badges = [];
  if (action.isLegendaryAction) badges.push('Legendary Action');
  if (action.isApexAction) badges.push('Apex Action');
  if (!badges.length) return null;
  const row = document.createElement('div');
  row.className = 'action-badges';
  badges.forEach((label) => {
    const badge = document.createElement('span');
    badge.className = 'action-badge';
    badge.textContent = label;
    row.appendChild(badge);
  });
  return row;
}

function createActionCardElement(action, { showTrigger = false } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'statblock-action-item';
  wrapper.dataset.featureId = action.id;
  attachDragHandlers(wrapper, action.id);

  const handle = document.createElement('div');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  wrapper.appendChild(handle);

  const header = document.createElement('div');
  header.className = 'action-header';
  const title = document.createElement('strong');
  appendField(title, action.name, 'name');
  appendText(title, ' (');
  appendField(title, action.cost ?? 0, 'cost');
  appendText(title, ' AP):');
  header.appendChild(title);
  wrapper.appendChild(header);

  const badgesRow = createActionBadges(action);
  if (badgesRow) wrapper.appendChild(badgesRow);

  if (showTrigger && action.reactionTrigger) {
    const triggerLine = document.createElement('div');
    triggerLine.className = 'action-trigger';
    triggerLine.textContent = `Trigger: ${action.reactionTrigger}`;
    wrapper.appendChild(triggerLine);
  }

  const actionTypeLabel = String(action.actionType || '').toLowerCase();
  const isUtilityAction = actionTypeLabel.includes('utility') && !actionTypeLabel.includes('check');

  if (isUtilityAction) {
    if (action.description) {
      const description = document.createElement('div');
      description.className = 'action-description';
      description.textContent = action.description;
      wrapper.appendChild(description);
    }
    const utilRemoveBtn = document.createElement('button');
    utilRemoveBtn.type = 'button';
    utilRemoveBtn.className = 'statblock-remove-btn';
    utilRemoveBtn.title = 'Remove feature';
    utilRemoveBtn.textContent = '×';
    utilRemoveBtn.addEventListener('click', (e) => { e.stopPropagation(); onFeatureRemove(action.id); });
    wrapper.appendChild(utilRemoveBtn);
    return wrapper;
  }

  const summary = document.createElement('div');
  summary.className = 'action-summary';

  const attackLine = document.createElement('div');
  appendField(attackLine, action.actionType || 'Action', 'actionType');

  if (action.targetDefense) {
    appendText(attackLine, ' vs ');
    appendField(attackLine, action.targetDefense, 'targetDefense');
  }

  if (action.check && action.check.dc != null) {
    appendText(attackLine, action.targetDefense ? ' • DC ' : ' DC ');
    appendBoldField(attackLine, action.check.dc, 'checkDc');
  }

  appendText(attackLine, '.');

  const segments = Array.isArray(action.damage) ? action.damage : [];
  if (segments.length) {
    const showHeavyHitBonus =
      actionTypeLabel.includes('attack') &&
      (actionTypeLabel.includes('melee') || actionTypeLabel.includes('ranged')) &&
      hasHalfDamage(segments);
    appendText(attackLine, ' ');
    segments.forEach((segment, index) => {
      if (index > 0) appendText(attackLine, ' + ');
      appendBoldField(attackLine, segment.amount ?? 0, 'damageAmount');
      if (segment.type) {
        appendText(attackLine, ' ');
        appendBoldField(attackLine, segment.type, 'damageType');
      }
    });
    appendText(attackLine, ' damage');
    if (showHeavyHitBonus) {
      appendText(attackLine, ', +1 on heavy hits.');
    }
  }
  summary.appendChild(attackLine);

  if (action.target || action.range) {
    const targetLine = document.createElement('div');
    appendText(targetLine, 'Target ');
    appendField(targetLine, action.target || 'target', 'target');
    if (action.range) {
      appendText(targetLine, ' within ');
      appendField(targetLine, action.range, 'range');
    }
    appendText(targetLine, '.');
    summary.appendChild(targetLine);
  }

  if (action.save) {
    if (action.save.attribute) {
      const saveLine = document.createElement('div');
      appendField(saveLine, action.save.attribute, 'saveAttribute');
      appendText(saveLine, ' Save, DC: ');
      appendBoldField(saveLine, action.save.dc ?? action.dc ?? creature.saveDC, 'saveDc');
      appendText(saveLine, '.');
      summary.appendChild(saveLine);
    }

    if (action.save.failure) {
      const failureLine = document.createElement('div');
      appendText(failureLine, 'Failure: ');
      appendField(failureLine, action.save.failure, 'saveFailure');
      summary.appendChild(failureLine);
    }

    if (action.save.failureEach5) {
      const failureEachLine = document.createElement('div');
      appendText(failureEachLine, 'Failure (Each 5): ');
      appendField(failureEachLine, action.save.failureEach5, 'saveFailureEach5');
      summary.appendChild(failureEachLine);
    }

    if (action.save.success) {
      const successLine = document.createElement('div');
      appendText(successLine, 'Success: ');
      appendField(successLine, action.save.success, 'saveSuccess');
      summary.appendChild(successLine);
    }

    if (action.save.successEach5) {
      const successEachLine = document.createElement('div');
      appendText(successEachLine, 'Success (Each 5): ');
      appendField(successEachLine, action.save.successEach5, 'saveSuccessEach5');
      summary.appendChild(successEachLine);
    }
  }

  if (action.check) {
    if (action.check.failure) {
      const checkFailure = document.createElement('div');
      appendText(checkFailure, 'Failure: ');
      appendField(checkFailure, action.check.failure, 'checkFailure');
      summary.appendChild(checkFailure);
    }

    if (action.check.failureEach5) {
      const checkFailureEach = document.createElement('div');
      appendText(checkFailureEach, 'Failure (Each 5): ');
      appendField(checkFailureEach, action.check.failureEach5, 'checkFailureEach5');
      summary.appendChild(checkFailureEach);
    }

    if (action.check.success) {
      const checkSuccess = document.createElement('div');
      appendText(checkSuccess, 'Success: ');
      appendField(checkSuccess, action.check.success, 'checkSuccess');
      summary.appendChild(checkSuccess);
    }

    if (action.check.successEach5) {
      const checkSuccessEach = document.createElement('div');
      appendText(checkSuccessEach, 'Success (Each 5): ');
      appendField(checkSuccessEach, action.check.successEach5, 'checkSuccessEach5');
      summary.appendChild(checkSuccessEach);
    }
  }

  if (action.description) {
    const description = document.createElement('div');
    description.className = 'action-description';
    description.textContent = action.description;
    summary.appendChild(description);
  }

  wrapper.appendChild(summary);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'statblock-remove-btn';
  removeBtn.title = 'Remove feature';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', (e) => { e.stopPropagation(); onFeatureRemove(action.id); });
  wrapper.appendChild(removeBtn);

  return wrapper;
}

function renderActionList(target, actions, { emptyMessage = 'No actions available.', showTrigger = false } = {}) {
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
    const card = createActionCardElement(action, { showTrigger });
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
  statblockActionsHeading.textContent = `Actions (${ap})`;

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
  });

  if (statblockReactionsSection && statblockReactionsList) {
    const reactions = Array.isArray(creature.featureReactions) ? creature.featureReactions : [];
    if (!reactions.length) {
      statblockReactionsSection.style.display = 'none';
      statblockReactionsList.innerHTML = '';
    } else {
      statblockReactionsSection.style.display = '';
      renderActionList(statblockReactionsList, reactions, {
        emptyMessage: 'No reactions available.',
        showTrigger: true,
      });
    }
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

  const lines = [
    { label: 'To Hit chance vs PD: ', value: `${chanceVsPD}%` },
    { label: ' - Hit: ', value: `${chanceVsPD - chanceVsPDHeavy}%` },
    { label: ' - Heavy: ', value: `${chanceVsPDHeavy - chanceVsPDBrutal}%` },
    { label: ' - Brutal: ', value: `${chanceVsPDBrutal}%` },
    { label: 'Hit chance vs AD: ', value: `${chanceVsAD}%` },
    { label: ' - Hit: ', value: `${chanceVsAD - chanceVsADHeavy}%` },
    { label: ' - Heavy: ', value: `${chanceVsADHeavy - chanceVsADBrutal}%` },
    { label: ' - Brutal: ', value: `${chanceVsADBrutal}%` },
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
  if (chanceVsPD < 45 || chanceVsAD < 45) {
    warnings.push(`Low player hit chance: PD ${chanceVsPD}%, AD ${chanceVsAD}%.`);
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
  lines.forEach(({ label, value }) => {
    const row = document.createElement('div');
    row.className = 'recommendations-row';
    const l = document.createElement('span');
    l.className = 'recommendations-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'recommendations-value';
    v.textContent = value;
    row.append(l, v);
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
  recommendationsPanel.appendChild(wrapper);
  if (warnings.length) {
    recommendationsPanel.appendChild(warningsBox);
  }
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

/**
 * actionCardRenderer.js
 * Shared action card renderer used by all statblock views.
 *
 * Exports helpers + the single canonical createActionCardElement() function.
 * All statblock pages (CreateCreature, Admin, Landing, RunEncounter) import
 * from here so rendering is identical everywhere.
 */

// ─── Display helpers ──────────────────────────────────────────────────────────

function formatDisplayValue(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (field === 'damageAmount') return value >= 0 ? Math.floor(value) : Math.ceil(value);
  return Math.round(value);
}

export function appendField(parent, value, field) {
  if (value === undefined || value === null || value === '') return;
  const span = document.createElement('span');
  span.className = 'action-span';
  span.dataset.field = field;
  span.textContent = formatDisplayValue(value, field);
  parent.appendChild(span);
}

export function appendBoldField(parent, value, field) {
  if (value === undefined || value === null || value === '') return;
  const strong = document.createElement('strong');
  appendField(strong, value, field);
  parent.appendChild(strong);
}

export function appendText(parent, text) {
  if (text === undefined || text === null || text === '') return;
  const span = document.createElement('span');
  span.textContent = text;
  parent.appendChild(span);
}

export function createActionBadges(action) {
  const badges = [];
  if (action?.isLegendaryAction) badges.push('Legendary Action');
  if (action?.isApexAction) badges.push('Apex Action');
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

export function hasHalfDamage(segments, baseDamage) {
  return segments.some((segment) => {
    const amount = segment.useBase !== undefined
      ? (segment.useBase ? baseDamage : 0) + (Number(segment.modifier) || 0)
      : Number(segment?.amount);
    if (!Number.isFinite(amount)) return false;
    const remainder = Math.abs(amount % 1);
    return Math.abs(remainder - 0.5) < 1e-9;
  });
}

// ─── Action card ──────────────────────────────────────────────────────────────

/**
 * Creates a complete action card element.
 *
 * @param {object} action       – built action object from buildAction()
 * @param {number} saveDC       – creature's saveDC stat (for Dynamic Attack Save)
 * @param {number} baseDamage   – creature's base damage (for useBase segments)
 * @param {object} [opts]
 * @param {boolean}  [opts.showTrigger=false]      – show reaction trigger line
 * @param {boolean}  [opts.showDragHandle=false]   – prepend drag-handle div
 * @param {boolean}  [opts.showRemoveButton=false] – show × remove button
 * @param {boolean}  [opts.showEditButton=false]   – show ✏ edit button
 * @param {boolean}  [opts.showBankButton=false]   – show ★ bank button
 * @param {boolean}  [opts.showCustomBadge=false]  – show 'custom' badge on name
 * @param {Function} [opts.onRemove]               – () => void
 * @param {Function} [opts.onEdit]                 – () => void
 * @param {Function} [opts.onBank]                 – () => void
 * @param {Function} [opts.onApSpend]              – (cost: number) => void
 * @returns {HTMLDivElement}
 */
export function createActionCardElement(action, saveDC, baseDamage, {
  showTrigger = false,
  showDragHandle = false,
  showRemoveButton = false,
  showEditButton = false,
  showBankButton = false,
  showCustomBadge = false,
  onRemove = null,
  onEdit = null,
  onBank = null,
  onApSpend = null,
} = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'statblock-action-item';
  wrapper.dataset.featureId = action.id;

  if (onApSpend) {
    wrapper.classList.add('action-clickable');
    const cost = Number(action.cost) || 0;
    wrapper.title = cost > 0 ? `Click to spend ${cost} AP` : 'Click to use';
    wrapper.addEventListener('click', () => { if (cost > 0) onApSpend(cost); });
  }

  if (showDragHandle) {
    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    wrapper.appendChild(handle);
  }

  // ── Header ────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'action-header';
  const title = document.createElement('strong');
  appendField(title, action.name, 'name');
  if (showCustomBadge) {
    const badge = document.createElement('span');
    badge.className = 'custom-feature-badge';
    badge.textContent = 'custom';
    title.appendChild(badge);
  }
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

  // ── Body ──────────────────────────────────────────────────────────────────
  const actionTypeLabel = String(action.actionType || '').toLowerCase();
  // Utility actions: description first, then save/check outcomes below.
  // Attack/Check actions: attack line first, then target/range, then save/check, then description.
  const isUtilityAction = actionTypeLabel.includes('utility') && !actionTypeLabel.includes('check');

  const summary = document.createElement('div');
  summary.className = 'action-summary';

  if (isUtilityAction) {
    if (action.description) {
      const description = document.createElement('div');
      description.className = 'action-description';
      description.textContent = action.description;
      summary.appendChild(description);
    }
    // Check vs DC utility action — show "ActionType DC n." before outcomes
    if (action.check && action.check.dc != null) {
      const dcLine = document.createElement('div');
      appendField(dcLine, action.actionType || 'Check', 'actionType');
      appendText(dcLine, ' DC ');
      appendBoldField(dcLine, action.check.dc, 'checkDc');
      appendText(dcLine, '.');
      summary.appendChild(dcLine);
    }
  } else {
    // Attack line: [actionType] [vs defense] [• DC n]. [damage]
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
    if (segments.length && action.targetDefense) {
      const showHeavyHitBonus =
        actionTypeLabel.includes('attack') &&
        action.targetDefense === 'PD' &&
        hasHalfDamage(segments, baseDamage);
      appendText(attackLine, ' ');
      segments.forEach((segment, index) => {
        if (index > 0) appendText(attackLine, ' + ');
        const raw = segment.useBase !== undefined
          ? (segment.useBase ? baseDamage : 0) + (Number(segment.modifier) || 0)
          : Number(segment.amount) || 0;
        appendBoldField(attackLine, Math.floor(raw), 'damageAmount');
        if (segment.type) {
          appendText(attackLine, ' ');
          appendBoldField(attackLine, segment.type, 'damageType');
        }
      });
      appendText(attackLine, ' damage');
      if (showHeavyHitBonus) appendText(attackLine, ', +1 on heavy hits.');
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
  }

  // ── Save block ────────────────────────────────────────────────────────────
  if (action.save) {
    if (action.save.attribute) {
      const saveLine = document.createElement('div');
      if (action.save.repeatable) appendText(saveLine, 'Repeatable ');
      appendField(saveLine, action.save.attribute, 'saveAttribute');
      appendText(saveLine, ' Save');
      if (action.targetDefense) {
        // Dynamic Attack Save: target saves vs creature's saveDC
        appendText(saveLine, ' vs Save DC ');
        appendBoldField(saveLine, saveDC, 'saveDc');
      }
      appendText(saveLine, '.');
      summary.appendChild(saveLine);
    }
    if (action.save.failure) {
      const line = document.createElement('div');
      appendText(line, 'Failure: ');
      appendField(line, action.save.failure, 'saveFailure');
      summary.appendChild(line);
    }
    if (action.save.failureEach5) {
      const line = document.createElement('div');
      appendText(line, 'Failure (Each 5): ');
      appendField(line, action.save.failureEach5, 'saveFailureEach5');
      summary.appendChild(line);
    }
    if (action.save.success) {
      const line = document.createElement('div');
      appendText(line, 'Success: ');
      appendField(line, action.save.success, 'saveSuccess');
      summary.appendChild(line);
    }
    if (action.save.successEach5) {
      const line = document.createElement('div');
      appendText(line, 'Success (Each 5): ');
      appendField(line, action.save.successEach5, 'saveSuccessEach5');
      summary.appendChild(line);
    }
    if (action.save.duration) {
      const line = document.createElement('div');
      appendText(line, 'Duration: ');
      appendField(line, action.save.duration, 'saveDuration');
      appendText(line, '.');
      summary.appendChild(line);
    }
  }

  // ── Check outcomes ────────────────────────────────────────────────────────
  if (action.check) {
    if (action.check.failure) {
      const line = document.createElement('div');
      appendText(line, 'Failure: ');
      appendField(line, action.check.failure, 'checkFailure');
      summary.appendChild(line);
    }
    if (action.check.failureEach5) {
      const line = document.createElement('div');
      appendText(line, 'Failure (Each 5): ');
      appendField(line, action.check.failureEach5, 'checkFailureEach5');
      summary.appendChild(line);
    }
    if (action.check.success) {
      const line = document.createElement('div');
      appendText(line, 'Success: ');
      appendField(line, action.check.success, 'checkSuccess');
      summary.appendChild(line);
    }
    if (action.check.successEach5) {
      const line = document.createElement('div');
      appendText(line, 'Success (Each 5): ');
      appendField(line, action.check.successEach5, 'checkSuccessEach5');
      summary.appendChild(line);
    }
  }

  // ── Description (attack/check path only; utility already rendered it at top)
  if (!isUtilityAction && action.description) {
    const description = document.createElement('div');
    description.className = 'action-description';
    description.textContent = action.description;
    summary.appendChild(description);
  }

  // ── Enhancements ──────────────────────────────────────────────────────────
  const enhancements = Array.isArray(action.enhancements) ? action.enhancements : [];
  if (enhancements.length) {
    const enhList = document.createElement('div');
    enhList.className = 'action-enhancements';
    enhancements.forEach((enh) => {
      if (!enh) return;
      const line = document.createElement('div');
      line.className = 'action-enhancement';
      appendText(line, `\u2022 (+${enh.cost ?? 1}) ${enh.name || 'Enhancement'}: `);
      if (enh.save && enh.save.attribute) {
        const savePrefix = enh.save.repeatable ? 'Repeatable ' : '';
        appendText(line, `${savePrefix}${enh.save.attribute} Save. Failure: ${enh.save.failure ?? ''}`);
        if (enh.save.failureEach5) appendText(line, ` Failure (Each 5): ${enh.save.failureEach5}.`);
        if (enh.save.success) appendText(line, ` Success: ${enh.save.success}.`);
        if (enh.save.duration) appendText(line, ` Duration: ${enh.save.duration}.`);
      } else if (Array.isArray(enh.damageSegments) && enh.damageSegments.length) {
        enh.damageSegments.forEach((seg, i) => {
          if (i > 0) appendText(line, ' + ');
          const raw = seg.useBase !== undefined
            ? (seg.useBase ? baseDamage : 0) + (Number(seg.modifier) || 0)
            : Number(seg.amount) || 0;
          appendBoldField(line, Math.floor(raw), 'damageAmount');
          if (seg.type) { appendText(line, ' '); appendBoldField(line, seg.type, 'damageType'); }
        });
        appendText(line, ' damage.');
      } else if (enh.description) {
        appendText(line, enh.description);
      }
      enhList.appendChild(line);
    });
    summary.appendChild(enhList);
  }

  wrapper.appendChild(summary);

  // ── Buttons ───────────────────────────────────────────────────────────────
  if (showEditButton && onEdit) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'statblock-edit-btn'; btn.title = 'Edit custom feature'; btn.textContent = '✏';
    btn.addEventListener('click', (e) => { e.stopPropagation(); onEdit(); });
    wrapper.appendChild(btn);
  }

  if (showBankButton && onBank) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'statblock-bank-btn'; btn.title = 'Save to my feature bank'; btn.textContent = '★';
    btn.addEventListener('click', (e) => { e.stopPropagation(); onBank(); });
    wrapper.appendChild(btn);
  }

  if (showRemoveButton && onRemove) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'statblock-remove-btn'; btn.title = 'Remove feature'; btn.textContent = '×';
    btn.addEventListener('click', (e) => { e.stopPropagation(); onRemove(); });
    wrapper.appendChild(btn);
  }

  return wrapper;
}

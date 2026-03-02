/**
 * runStatblock.js
 * Build a statblock DOM element from a decoded creature doc.
 *
 * When `combatant` is provided (run-encounter mode):
 *  - PD and AD render as editable inputs wired to combatant state
 *  - Mig / Agi / Cha / Int render as editable inputs
 *  - HP is NOT shown here (it lives in the card header's slider row)
 *
 * Attribute keys in the Firestore doc are capitalised: Mig, Agi, Cha, Int.
 */

import { createActionCardElement } from '../../actionCardRenderer.js';

const ATTR_DEFS = [
  { dataKey: 'Mig', label: 'Might',        combatKey: 'currentMig' },
  { dataKey: 'Agi', label: 'Agility',      combatKey: 'currentAgi' },
  { dataKey: 'Cha', label: 'Charisma',     combatKey: 'currentCha' },
  { dataKey: 'Int', label: 'Intelligence', combatKey: 'currentInt' },
];

/**
 * @param {object}      creature  - VanillaCreatures document data
 * @param {object|null} combatant - run-encounter combatant state (optional)
 * @returns {HTMLDivElement}
 */
// Normalize a raw feature object (from VanillaFeatures) into the built-action
// shape expected by buildActionItem. Raw features are recognisable by having an
// `effects` field; properly built actions do not. This handles creatures that
// were saved before buildAction() was applied at persist time.
function coerceToBuiltAction(raw) {
  if (!raw || !raw.effects) return raw; // already a built action

  const e = raw.effects;
  const actionType = raw.actionType ?? e.actionType ?? 'Attack';
  const actionTypeLabel = String(actionType).toLowerCase();
  const isAttackType = actionTypeLabel.includes('attack');

  const segments = Array.isArray(e.damageSegments) ? e.damageSegments : [];
  const mappedSegments = segments
    .map((seg) =>
      typeof seg.amount === 'number'
        ? { amount: seg.amount, type: seg.type ?? '' }
        : { useBase: Boolean(seg.useBase), modifier: Number(seg.modifier) || 0, type: seg.type ?? '' }
    )
    .filter((seg) => seg.useBase || (seg.modifier ?? 0) !== 0 || seg.type || seg.amount != null);
  const damage =
    mappedSegments.length > 0
      ? mappedSegments
      : isAttackType
        ? [{ useBase: true, modifier: 0, type: e.damageType ?? '' }]
        : [];

  const description =
    (typeof e.actionDescription === 'string' ? e.actionDescription : null) ??
    (typeof raw.description === 'string' ? raw.description : null) ??
    (typeof raw.featureDescription === 'string' ? raw.featureDescription : null) ??
    '';

  return {
    id: raw.id,
    name: raw.name || raw.id || 'Unnamed Action',
    description: description.trim(),
    cost: typeof e.cost === 'number' ? e.cost : Number(e.cost) || 0,
    actionType,
    damage,
    targetDefense: e.targetDefense ?? (isAttackType ? 'PD' : ''),
    target: e.target ?? '',
    range: e.range ?? '',
    dc: e.dc ?? null,
    check: e.check
      ? {
          dc: typeof e.check.dc === 'number' ? e.check.dc : Number(e.check.dc) || null,
          failure:      e.check.failure      ?? '',
          failureEach5: e.check.failureEach5 ?? '',
          success:      e.check.success      ?? '',
          successEach5: e.check.successEach5 ?? '',
        }
      : null,
    save: e.save
      ? {
          attribute:    e.save.attribute ?? '',
          dc:           null, // creature saveDC used at render time
          failure:      e.save.failure ?? e.save.effect ?? '',
          failureEach5: e.save.failureEach5 ?? '',
          success:      e.save.success ?? '',
          successEach5: e.save.successEach5 ?? '',
        }
      : null,
    featureCost:       raw.featureCost ?? 0,
    isReaction:        Boolean(raw.isReaction        || e.isReaction),
    reactionTrigger:   raw.reactionTrigger ?? e.reactionTrigger ?? '',
    isLegendaryAction: Boolean(raw.isLegendaryAction || e.isLegendaryAction),
    isApexAction:      Boolean(raw.isApexAction      || e.isApexAction),
  };
}

export function buildStatblockEl(creature, combatant = null, { onApSpend = null, onDodge = null } = {}) {
  const stats    = creature.stats     || {};
  const attrVals = creature.attributes?.values || {}; // keys: Mig, Agi, Cha, Int
  const saves    = creature.attributes?.saves  || {}; // keys: Mig, Agi, Cha, Int
  const traits   = creature.traits    || {};
  const passives  = creature.featurePassives  || [];
  const actions   = (creature.featureActions   || []).map(coerceToBuiltAction);
  const reactions = (creature.featureReactions || []).map(coerceToBuiltAction);

  const el = document.createElement('div');
  el.className = 'statblock statblock--condensed';

  // ── Name ────────────────────────────────────────────────
  const nameEl = document.createElement('div');
  nameEl.className = 'statblock-name';
  nameEl.textContent = creature.name || 'Unknown';
  el.appendChild(nameEl);

  // ── Info line ───────────────────────────────────────────
  const info = document.createElement('div');
  info.className = 'statblock-info';
  const infoParts = [];
  if (creature.size)  infoParts.push(cap(creature.size));
  if (creature.type)  infoParts.push(cap(creature.type));
  if (creature.level !== undefined) infoParts.push(`Level ${creature.level}`);
  if (creature.power && creature.power !== 'normal') infoParts.push(cap(creature.power));
  if (creature.role && creature.role !== 'none')     infoParts.push(cap(creature.role));
  info.textContent = infoParts.join(' · ');
  el.appendChild(info);

  el.appendChild(makeDivider());

  // ── Vitals ──────────────────────────────────────────────
  // In combat mode: PD and AD are editable; HP is omitted (shown in card above).
  // In static mode: show HP / PD (with heavy/brutal) / AD (with heavy/brutal).

  if (combatant) {
    const vitalsRow = document.createElement('div');
    vitalsRow.className = 'statblock-vitals-edit';

    appendEditableVital(vitalsRow, 'PD',     combatant, 'currentPd');
    appendEditableVital(vitalsRow, 'AD',     combatant, 'currentAd');
    appendStaticVital(vitalsRow,  'Speed',   stats.speed   ?? '—');
    appendStaticVital(vitalsRow,  'AP',      stats.AP      ?? '—');
    appendStaticVital(vitalsRow,  'Save DC', stats.saveDC  ?? '—');
    appendStaticVital(vitalsRow,  'Damage',  formatDamage(stats.damage));
    el.appendChild(vitalsRow);
  } else {
    const v1 = document.createElement('div');
    v1.className = 'statblock-vitals';
    appendStaticVital(v1, 'HP', stats.HP ?? '—');
    appendStaticVital(v1, 'PD',
      stats.PD !== undefined ? `${stats.PD} / ${stats.PDHeavy} / ${stats.PDBrutal}` : '—');
    appendStaticVital(v1, 'AD',
      stats.AD !== undefined ? `${stats.AD} / ${stats.ADHeavy} / ${stats.ADBrutal}` : '—');
    el.appendChild(v1);

    const v2 = document.createElement('div');
    v2.className = 'statblock-vitals';
    appendStaticVital(v2, 'Speed',   stats.speed   ?? '—');
    appendStaticVital(v2, 'AP',      stats.AP      ?? '—');
    appendStaticVital(v2, 'Save DC', stats.saveDC  ?? '—');
    el.appendChild(v2);
  }

  el.appendChild(makeRule());

  // ── Attributes ──────────────────────────────────────────
  const attrGrid = document.createElement('div');
  attrGrid.className = 'statblock-attributes';

  for (const { dataKey, label, combatKey } of ATTR_DEFS) {
    const card = document.createElement('div');
    card.className = 'attribute-card';

    const lbl = document.createElement('span');
    lbl.className = 'attribute-label';
    lbl.textContent = label;

    const rawVal  = attrVals[dataKey] ?? 0;
    const saveVal = saves[dataKey]    ?? 0;

    if (combatant) {
      const inp = document.createElement('input');
      inp.type      = 'number';
      inp.className = 'statblock-editable-attr';
      inp.value     = combatant[combatKey] ?? rawVal;
      inp.step      = 1;
      inp.title     = label;
      inp.addEventListener('input', () => {
        combatant[combatKey] = Number(inp.value) || 0;
      });

      const saveLbl = document.createElement('span');
      saveLbl.className   = 'attribute-save';
      saveLbl.textContent = `(${fmtMod(saveVal)})`;

      card.append(lbl, inp, saveLbl);
    } else {
      const val = document.createElement('span');
      val.className   = 'attribute-value';
      val.textContent = fmtMod(rawVal);

      const saveLbl = document.createElement('span');
      saveLbl.className   = 'attribute-save';
      saveLbl.textContent = `(${fmtMod(saveVal)})`;

      card.append(lbl, val, saveLbl);
    }

    attrGrid.appendChild(card);
  }
  el.appendChild(attrGrid);

  // ── Trait rows ──────────────────────────────────────────
  const traitDefs = [
    { label: 'Resistances',     values: [...(traits.resistances?.damage    || []), ...(traits.resistances?.condition    || [])] },
    { label: 'Vulnerabilities', values: [...(traits.vulnerabilities?.damage || []), ...(traits.vulnerabilities?.condition || [])] },
    { label: 'Immunities',      values: [...(traits.immunities?.damage     || []), ...(traits.immunities?.condition     || [])] },
    { label: 'Senses',          values: traits.senses || [] },
    { label: 'Skills',          values: traits.skills || [] },
  ];

  const traitSection = document.createElement('div');
  traitSection.className = 'statblock-trait-section';

  for (const { label, values } of traitDefs) {
    const row = document.createElement('div');
    row.className = 'statblock-trait-row';

    const lbl = document.createElement('span');
    lbl.className   = 'statblock-trait-label';
    lbl.textContent = `${label}:`;

    const valWrap = document.createElement('span');
    valWrap.className = 'statblock-trait-values';

    if (values.length === 0) {
      const em = document.createElement('span');
      em.className   = 'trait-empty';
      em.textContent = '—';
      valWrap.appendChild(em);
    } else {
      values.forEach((v, i) => {
        if (i > 0) {
          const sep = document.createElement('span');
          sep.className   = 'trait-separator';
          sep.textContent = ', ';
          valWrap.appendChild(sep);
        }
        const s = document.createElement('span');
        s.textContent = cap(v);
        valWrap.appendChild(s);
      });
    }
    row.append(lbl, valWrap);
    traitSection.appendChild(row);
  }
  el.appendChild(traitSection);

  // ── Feature passives ────────────────────────────────────
  if (passives.length > 0) {
    const sec = makeSection('Features');
    const list = document.createElement('div');
    list.className = 'statblock-feature-list';

    for (const f of passives) {
      const item = document.createElement('div');
      item.className = 'statblock-feature-item';

      const fName = document.createElement('div');
      fName.className   = 'feature-name';
      fName.textContent = f.name || '';

      const fDesc = document.createElement('div');
      fDesc.className   = 'feature-description';
      fDesc.textContent = f.description || '';

      item.append(fName, fDesc);
      list.appendChild(item);
    }
    sec.appendChild(list);
    el.appendChild(sec);
  }

  // ── Actions ─────────────────────────────────────────────
  if (actions.length > 0) {
    el.appendChild(buildActionsSection('Actions', actions, onApSpend, stats.check ?? null, onDodge, stats.damage ?? 0, stats.saveDC ?? null));
  }

  // ── Reactions ───────────────────────────────────────────
  if (reactions.length > 0) {
    el.appendChild(buildActionsSection('Reactions', reactions, onApSpend, null, null, stats.damage ?? 0, stats.saveDC ?? null));
  }

  return el;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDamage(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return '—';
  const base  = Math.floor(n);
  const heavy = Math.ceil(n) - base;
  return heavy > 0 ? `${base} (+${heavy} heavy)` : String(base);
}

function cap(str) {
  if (!str) return '';
  return String(str).replace(/\b\w/g, c => c.toUpperCase());
}

function fmtMod(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

function makeDivider() {
  const d = document.createElement('div');
  d.className = 'statblock-divider';
  return d;
}

function makeRule() {
  const hr = document.createElement('hr');
  hr.className = 'statblock-rule';
  return hr;
}

function makeSection(title) {
  const sec = document.createElement('div');
  sec.className = 'statblock-feature-section';

  const h = document.createElement('div');
  h.className   = 'statblock-feature-heading';
  h.textContent = title;
  sec.appendChild(h);

  return sec;
}

function appendStaticVital(container, label, value) {
  const lbl = document.createElement('span');
  lbl.className   = 'statblock-label';
  lbl.textContent = label;

  const val = document.createElement('span');
  val.className   = 'statblock-value';
  val.textContent = value;

  container.append(lbl, val);
}

function appendEditableVital(container, label, combatant, key) {
  const lbl = document.createElement('span');
  lbl.className   = 'statblock-label';
  lbl.textContent = label;

  const inp = document.createElement('input');
  inp.type      = 'number';
  inp.className = 'statblock-editable';
  inp.value     = combatant[key] ?? 0;
  inp.step      = 1;
  inp.min       = 0;
  inp.addEventListener('input', () => {
    combatant[key] = Number(inp.value) || 0;
  });

  container.append(lbl, inp);
}

const COMMON_ACTIONS = ['Move', 'Advantage', 'Dodge', 'Grapple', 'Hide', 'Help', 'Hold Action'];

// ── Actions section ───────────────────────────────────────────────────────────

function buildActionsSection(title, items, onApSpend, checkBonus = null, onDodge = null, baseDamage = 0, saveDC = null) {
  const sec = document.createElement('div');
  sec.className = 'statblock-actions-section';

  const heading = document.createElement('div');
  heading.className = 'statblock-actions-heading';

  const titleSpan = document.createElement('span');
  titleSpan.textContent = `${title} (${items.length})`;
  heading.appendChild(titleSpan);

  if (checkBonus != null) {
    const hitSpan = document.createElement('span');
    hitSpan.className   = 'statblock-actions-hit-bonus';
    hitSpan.textContent = `To Hit: ${fmtMod(checkBonus)}`;
    heading.appendChild(hitSpan);
  }

  sec.appendChild(heading);

  // Common 1-AP actions row (only shown for the Actions section, not Reactions)
  if (title === 'Actions') {
    const commonRow = document.createElement('div');
    commonRow.className = 'statblock-common-actions';
    for (const name of COMMON_ACTIONS) {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'statblock-common-btn';
      btn.textContent = name;
      btn.title = '1 AP';
      if (name === 'Dodge' && onDodge) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onDodge();
        });
      } else if (onApSpend) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onApSpend(1);
        });
      }
      commonRow.appendChild(btn);
    }
    sec.appendChild(commonRow);
  }

  const list = document.createElement('div');
  list.className = 'statblock-actions-list';

  for (const action of items) {
    list.appendChild(buildActionItem(action, onApSpend, baseDamage, saveDC));
  }

  sec.appendChild(list);
  return sec;
}

function buildActionItem(action, onApSpend, baseDamage = 0, saveDC = null) {
  return createActionCardElement(action, saveDC ?? 0, baseDamage, {
    showTrigger: true,
    onApSpend,
  });
}

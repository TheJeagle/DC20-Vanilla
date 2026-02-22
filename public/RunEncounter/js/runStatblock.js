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
export function buildStatblockEl(creature, combatant = null, { onApSpend = null, onDodge = null } = {}) {
  const stats    = creature.stats     || {};
  const attrVals = creature.attributes?.values || {}; // keys: Mig, Agi, Cha, Int
  const saves    = creature.attributes?.saves  || {}; // keys: Mig, Agi, Cha, Int
  const traits   = creature.traits    || {};
  const passives  = creature.featurePassives  || [];
  const actions   = creature.featureActions   || [];
  const reactions = creature.featureReactions || [];

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
    appendStaticVital(vitalsRow,  'Damage',  stats.damage  ?? '—');
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
    el.appendChild(buildActionsSection('Actions', actions, onApSpend, stats.check ?? null, onDodge));
  }

  // ── Reactions ───────────────────────────────────────────
  if (reactions.length > 0) {
    el.appendChild(buildActionsSection('Reactions', reactions, onApSpend));
  }

  return el;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function buildActionsSection(title, items, onApSpend, checkBonus = null, onDodge = null) {
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
    list.appendChild(buildActionItem(action, onApSpend));
  }

  sec.appendChild(list);
  return sec;
}

function buildActionItem(action, onApSpend) {
  const item = document.createElement('div');
  item.className = 'statblock-action-item';

  if (onApSpend) {
    item.classList.add('action-clickable');
    const cost = Number(action.cost) || 0;
    item.title = cost > 0 ? `Click to spend ${cost} AP` : 'Click to use';
    item.addEventListener('click', () => {
      if (cost > 0) onApSpend(cost);
    });
  }

  // ── Name row: name + AP cost badge ──────────────────────
  const topRow = document.createElement('div');
  topRow.className = 'action-top-row';

  const nameEl = document.createElement('div');
  nameEl.className   = 'action-name';
  nameEl.textContent = action.name || 'Action';
  topRow.appendChild(nameEl);

  if (action.cost != null && action.cost !== '') {
    const badge = document.createElement('span');
    badge.className   = 'action-badge';
    badge.textContent = `${action.cost} AP`;
    topRow.appendChild(badge);
  }

  item.appendChild(topRow);

  // ── Trigger ──────────────────────────────────────────────
  const triggerText = action.reactionTrigger || action.trigger || '';
  if (triggerText) {
    const trig = document.createElement('div');
    trig.className   = 'action-trigger';
    trig.textContent = `Trigger: ${triggerText}`;
    item.appendChild(trig);
  }

  // ── Prose summary line ───────────────────────────────────
  // e.g. "Ranged Martial Attack vs PD of a creature within 10 / 15 Spaces,
  //        3 Piercing damage on hit."
  const actionTypeLabel = String(action.actionType || '').toLowerCase();
  const isUtility = actionTypeLabel.includes('utility') && !actionTypeLabel.includes('check');

  if (!isUtility) {
    const parts = [];

    // "{actionType} vs {targetDefense}"
    let attackPart = action.actionType || '';
    if (action.targetDefense) attackPart += ` vs ${action.targetDefense}`;
    if (attackPart) parts.push(attackPart);

    // "of {target} within/in {range}"
    if (action.target || action.range) {
      let locationPart = '';
      if (action.target) locationPart += `of ${action.target}`;
      if (action.range) {
        const preposition = actionTypeLabel.includes('area') ? 'within' : 'within';
        locationPart += locationPart ? ` ${preposition} ${action.range}` : `${preposition} ${action.range}`;
      }
      if (locationPart) parts.push(locationPart);
    }

    // damage
    const segments = Array.isArray(action.damage) ? action.damage.filter(d => d.amount) : [];
    if (segments.length) {
      let heavyBonus = 0;
      const dmgStr = segments
        .map(d => {
          const raw  = Number(d.amount) || 0;
          const base = Math.floor(raw);
          heavyBonus += Math.ceil(raw) - base;
          return d.type ? `${base} ${cap(d.type)}` : String(base);
        })
        .join(' + ');
      let onHit = `${dmgStr} damage on hit`;
      if (heavyBonus > 0) onHit += `, +${heavyBonus} on heavy hits`;
      parts.push(onHit);
    }

    // check DC inline (e.g. "DC 14 check")
    if (action.check?.dc != null && !action.targetDefense) {
      parts.push(`DC ${action.check.dc}`);
    }

    if (parts.length) {
      const summary = document.createElement('div');
      summary.className   = 'action-stats';
      summary.textContent = parts.join(', ') + '.';
      item.appendChild(summary);
    }

    // ── Save block ─────────────────────────────────────────
    if (action.save?.attribute) {
      const saveLine = document.createElement('div');
      saveLine.className = 'action-stats';
      let s = `${action.save.attribute} Save DC ${action.save.dc ?? '—'}.`;
      if (action.save.failure)     s += ` Failure: ${action.save.failure}.`;
      if (action.save.failureEach5) s += ` Failure (each 5): ${action.save.failureEach5}.`;
      if (action.save.success)     s += ` Success: ${action.save.success}.`;
      saveLine.textContent = s;
      item.appendChild(saveLine);
    }

    // ── Check failure/success (when there's a targetDefense check combo) ──
    if (action.check?.dc != null && action.targetDefense) {
      const checkLine = document.createElement('div');
      checkLine.className = 'action-stats';
      let c = `DC ${action.check.dc} check.`;
      if (action.check.failure) c += ` Failure: ${action.check.failure}.`;
      if (action.check.success) c += ` Success: ${action.check.success}.`;
      checkLine.textContent = c;
      item.appendChild(checkLine);
    }
  }

  // ── Description (utility actions and any extra flavour text) ──
  const descText = action.description || action.effect || action.text || '';
  if (descText) {
    const desc = document.createElement('p');
    desc.className   = 'action-description';
    desc.textContent = descText;
    item.appendChild(desc);
  }

  return item;
}

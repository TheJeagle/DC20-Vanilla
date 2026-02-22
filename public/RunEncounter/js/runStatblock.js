/**
 * runStatblock.js
 * Build a statblock DOM element from a decoded creature doc.
 * Returns a <div> with .statblock CSS classes (styles in runEncounter.css).
 */

/**
 * @param {object} creature - VanillaCreatures document data
 * @returns {HTMLDivElement}
 */
export function buildStatblockEl(creature) {
  const stats    = creature.stats     || {};
  const attrs    = creature.attributes?.values || {};
  const saves    = creature.attributes?.saves  || {};
  const traits   = creature.traits    || {};
  const passives  = creature.featurePassives  || [];
  const actions   = creature.featureActions   || [];
  const reactions = creature.featureReactions || [];

  const el = document.createElement('div');
  el.className = 'statblock statblock--condensed';

  // Name
  const nameEl = document.createElement('div');
  nameEl.className = 'statblock-name';
  nameEl.textContent = creature.name || 'Unknown';
  el.appendChild(nameEl);

  // Info line
  const info = document.createElement('div');
  info.className = 'statblock-info';
  const infoParts = [];
  if (creature.size)  infoParts.push(cap(creature.size));
  if (creature.type)  infoParts.push(cap(creature.type));
  if (creature.level !== undefined) infoParts.push(`Lv${creature.level}`);
  if (creature.power) infoParts.push(cap(creature.power));
  if (creature.role)  infoParts.push(cap(creature.role));
  info.textContent = infoParts.join(' · ');
  el.appendChild(info);

  el.appendChild(makeDivider());

  // Vitals row 1: HP, PD, AD
  const vitals1 = document.createElement('div');
  vitals1.className = 'statblock-vitals';
  appendVital(vitals1, 'HP',    stats.HP  ?? '—');
  appendVital(vitals1, 'PD',    stats.PD  !== undefined
    ? `${stats.PD} / ${stats.PDHeavy} / ${stats.PDBrutal}` : '—');
  appendVital(vitals1, 'AD',    stats.AD  !== undefined
    ? `${stats.AD} / ${stats.ADHeavy} / ${stats.ADBrutal}` : '—');
  el.appendChild(vitals1);

  // Vitals row 2: Speed, AP, Save DC
  const vitals2 = document.createElement('div');
  vitals2.className = 'statblock-vitals';
  appendVital(vitals2, 'Speed',   stats.speed   ?? '—');
  appendVital(vitals2, 'AP',      stats.AP      ?? '—');
  appendVital(vitals2, 'Save DC', stats.saveDC  ?? '—');
  el.appendChild(vitals2);

  el.appendChild(makeRule());

  // Attributes
  const attrGrid = document.createElement('div');
  attrGrid.className = 'statblock-attributes';
  for (const [key, label] of [['mig','Mig'],['agi','Agi'],['cha','Cha'],['int','Int']]) {
    const card = document.createElement('div');
    card.className = 'attribute-card';

    const lbl = document.createElement('span');
    lbl.className = 'attribute-label';
    lbl.textContent = label;

    const v = attrs[key] ?? 0;
    const val = document.createElement('span');
    val.className = 'attribute-value';
    val.textContent = v >= 0 ? `+${v}` : `${v}`;

    const s = saves[key] ?? 0;
    const save = document.createElement('span');
    save.className = 'attribute-save';
    save.textContent = `(${s >= 0 ? '+' : ''}${s})`;

    card.append(lbl, val, save);
    attrGrid.appendChild(card);
  }
  el.appendChild(attrGrid);

  // Trait rows (resistances, vulnerabilities, immunities, senses, skills)
  const traitDefs = [
    { label: 'Resistances',    values: [...(traits.resistances?.damage || []),    ...(traits.resistances?.condition || [])] },
    { label: 'Vulnerabilities',values: [...(traits.vulnerabilities?.damage || []),...(traits.vulnerabilities?.condition || [])] },
    { label: 'Immunities',     values: [...(traits.immunities?.damage || []),      ...(traits.immunities?.condition || [])] },
    { label: 'Senses',         values: traits.senses || [] },
    { label: 'Skills',         values: traits.skills || [] },
  ];

  const traitSection = document.createElement('div');
  traitSection.className = 'statblock-trait-section';

  for (const { label, values } of traitDefs) {
    const row = document.createElement('div');
    row.className = 'statblock-trait-row';

    const lbl = document.createElement('span');
    lbl.className = 'statblock-trait-label';
    lbl.textContent = `${label}:`;

    const valWrap = document.createElement('span');
    valWrap.className = 'statblock-trait-values';

    if (values.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'trait-empty';
      empty.textContent = '—';
      valWrap.appendChild(empty);
    } else {
      values.forEach((v, i) => {
        if (i > 0) {
          const sep = document.createElement('span');
          sep.className = 'trait-separator';
          sep.textContent = ',';
          valWrap.appendChild(sep);
        }
        const span = document.createElement('span');
        span.textContent = cap(v);
        valWrap.appendChild(span);
      });
    }

    row.append(lbl, valWrap);
    traitSection.appendChild(row);
  }
  el.appendChild(traitSection);

  // Feature passives
  if (passives.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'statblock-feature-section';

    const heading = document.createElement('div');
    heading.className = 'statblock-feature-heading';
    heading.textContent = 'Features';
    sec.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'statblock-feature-list';

    for (const f of passives) {
      const item = document.createElement('div');
      item.className = 'statblock-feature-item';

      const fName = document.createElement('div');
      fName.className = 'feature-name';
      fName.textContent = f.name || '';

      const fDesc = document.createElement('div');
      fDesc.className = 'feature-description';
      fDesc.textContent = f.description || '';

      item.append(fName, fDesc);
      list.appendChild(item);
    }
    sec.appendChild(list);
    el.appendChild(sec);
  }

  // Actions
  if (actions.length > 0) {
    el.appendChild(buildActionsSection('Actions', actions));
  }

  // Reactions
  if (reactions.length > 0) {
    el.appendChild(buildActionsSection('Reactions', reactions));
  }

  return el;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cap(str) {
  if (!str) return '';
  return String(str).replace(/\b\w/g, c => c.toUpperCase());
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

function appendVital(container, label, value) {
  const lbl = document.createElement('span');
  lbl.className = 'statblock-label';
  lbl.textContent = label;

  const val = document.createElement('span');
  val.className = 'statblock-value';
  val.textContent = value;

  container.append(lbl, val);
}

function buildActionsSection(title, items) {
  const sec = document.createElement('div');
  sec.className = 'statblock-actions-section';

  const heading = document.createElement('div');
  heading.className = 'statblock-actions-heading';
  heading.textContent = `${title} (${items.length})`;
  sec.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'statblock-actions-list';

  for (const action of items) {
    const item = document.createElement('div');
    item.className = 'statblock-action-item';

    const badges = document.createElement('div');
    badges.className = 'action-badges';

    const nameBadge = document.createElement('span');
    nameBadge.className = 'action-badge';
    nameBadge.textContent = action.name || 'Action';
    badges.appendChild(nameBadge);

    if (action.cost) {
      const costBadge = document.createElement('span');
      costBadge.className = 'action-badge';
      costBadge.textContent = action.cost;
      badges.appendChild(costBadge);
    }

    item.appendChild(badges);

    if (action.trigger) {
      const trigger = document.createElement('div');
      trigger.className = 'action-trigger';
      trigger.textContent = `Trigger: ${action.trigger}`;
      item.appendChild(trigger);
    }

    if (action.description) {
      const desc = document.createElement('p');
      desc.className = 'action-description';
      desc.textContent = action.description;
      item.appendChild(desc);
    }

    list.appendChild(item);
  }

  sec.appendChild(list);
  return sec;
}

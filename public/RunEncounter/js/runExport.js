/**
 * runExport.js
 * Encounter export helpers for the RunEncounter page.
 * Creature stats are recalculated for the effective level (baseLevel + levelDelta)
 * so that user-adjusted levels produce correct HP/PD/AD/damage/etc.
 *
 * Action damage — two formats:
 *   New: {useBase, modifier, type}  → (useBase ? baseDamage : 0) + modifier
 *   Old: {amount, type}             → amount
 */
import {
  computeScaledStats,
  applyNumericDeltas,
} from '../../CreateCreature/js/createCreatureStats.js';

const POWER_MULT = { minion: 0.5, weak: 0.7, normal: 1.0, apex: 2.0, legendary: 4.0 };

// ── Private helpers ────────────────────────────────────────────────────────────

function toTitleCase(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toSigned(n) {
  const v = Math.round(Number(n) || 0);
  return `${v >= 0 ? '+' : ''}${v}`;
}

function yamlQuote(str) {
  return '"' + String(str ?? '').replace(/"/g, '\\"') + '"';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function computeDifficulty(enc) {
  const partyBudget  = (enc.party || []).reduce((s, p) => s + (Number(p.level) || 0), 0);
  const monsterTotal = (enc.monsters || []).reduce((s, m) => {
    const mult = POWER_MULT[m.power] ?? 1.0;
    const lvl  = Math.max(0, (m.baseLevel || 0) + (m.levelDelta || 0));
    return s + lvl * mult;
  }, 0);
  const pct = partyBudget > 0 ? (monsterTotal / partyBudget) * 100 : 0;
  if (pct < 75)  return 'easy';
  if (pct < 125) return 'fair';
  if (pct < 175) return 'hard';
  return 'deadly';
}

function effectiveLvl(monsterSlot, creature) {
  if (monsterSlot) {
    return Math.max(0, (monsterSlot.baseLevel || 0) + (monsterSlot.levelDelta || 0));
  }
  return creature.level ?? 1;
}

/**
 * Recalculate creature stats for the effective level of a monster slot.
 *
 * The Firestore creature doc stores stats at the level it was originally saved.
 * When the user changes the level in the encounter (via levelDelta), those stored
 * stats are stale. This function:
 *   1. Computes base stats at the original saved level.
 *   2. Derives the "feature bonus" = stored stat − computed base (flat bonus from
 *      modifier-type features that were baked into the stored stats at save time).
 *   3. Computes base stats at the effective level.
 *   4. Adds the preserved feature bonus back, yielding correct fully-scaled stats.
 *
 * @param {object} creature  Decoded Firestore creature doc
 * @param {object} monsterSlot  Encounter monster slot (has baseLevel, levelDelta, role, power)
 * @returns {{HP,PD,PDHeavy,PDBrutal,AD,ADHeavy,ADBrutal,damage,check,saveDC,AP,speed,attributes,attributeSaves}}
 */
function recalcStats(creature, monsterSlot) {
  const stored   = creature.stats || {};
  const origLevel = Number(creature.level) || 1;
  const newLevel  = effectiveLvl(monsterSlot, creature);
  const role   = (monsterSlot?.role  || creature.role  || 'none');
  const power  = (monsterSlot?.power || creature.power || 'normal');
  const size   = creature.size  || 'medium';
  const type   = creature.type  || 'humanoid';
  const deltas = creature.deltas || {};

  function baseAt(level) {
    const CM = Math.ceil(level / 2);
    const computed = computeScaledStats({ level, role, power, size, type, deltas, combatMastery: CM });
    const s = {
      HP: computed.HP, PD: computed.PD, AD: computed.AD,
      damage: computed.damage, check: computed.check,
      saveDC: computed.saveDC, AP: computed.AP, speed: computed.speed,
      deltas: computed.deltas,
    };
    applyNumericDeltas(s);
    return { s, computed };
  }

  const { s: origBase } = baseAt(origLevel);
  const { s: newBase, computed: newComputed } = baseAt(newLevel);

  // Flat bonus that modifier-type features contributed at save time
  const bonus = field => (Number(stored[field]) || 0) - origBase[field];

  const HP     = newBase.HP     + bonus('HP');
  const PD     = newBase.PD     + bonus('PD');
  const AD     = newBase.AD     + bonus('AD');
  const damage = newBase.damage + bonus('damage');
  const check  = newBase.check  + bonus('check');
  const saveDC = newBase.saveDC + bonus('saveDC');
  const AP     = newBase.AP     + bonus('AP');
  const speed  = newBase.speed  + bonus('speed');

  return {
    HP:       Math.round(HP),
    PD:       Math.round(PD),
    PDHeavy:  Math.round(PD + 5),
    PDBrutal: Math.round(PD + 10),
    AD:       Math.round(AD),
    ADHeavy:  Math.round(AD + 5),
    ADBrutal: Math.round(AD + 10),
    damage,
    check,
    saveDC:   Math.round(saveDC),
    AP:       Math.round(AP),
    speed:    Math.round(speed),
    attributes:     newComputed.attributes,
    attributeSaves: newComputed.attributeSaves,
  };
}

/**
 * Build action description string.
 * Handles both new damage format {useBase, modifier, type} and old {amount, type}.
 */
function buildActionDesc(action, fallbackSaveDC, baseDamage) {
  const parts = [];
  if (action.actionType)    parts.push(action.actionType);
  if (action.targetDefense) parts.push(`vs ${action.targetDefense}`);
  if (action.target)        parts.push(action.target);
  if (action.range)         parts.push(action.range);

  const segments = Array.isArray(action.damage) ? action.damage : [];
  if (segments.length) {
    const base = Number(baseDamage) || 0;
    let heavyHit = false;
    const dmg = segments.map(d => {
      const amt = d.useBase !== undefined
        ? (d.useBase ? base : 0) + (Number(d.modifier) || 0)
        : Number(d.amount) || 0;
      if (amt % 1 !== 0) heavyHit = true;
      return d.type ? `${Math.floor(amt)} ${d.type}` : String(Math.floor(amt));
    }).join(' + ');
    parts.push(`${dmg} damage on hit${heavyHit ? ', +1 on heavy hits' : ''}`);
  }

  if (action.save?.attribute) {
    const dc = action.save.dc ?? fallbackSaveDC;
    parts.push(`${action.save.attribute} Save DC ${dc}`);
    if (action.save.failure)      parts.push(`Failure: ${action.save.failure}`);
    if (action.save.failureEach5) parts.push(`Failure (Each 5): ${action.save.failureEach5}`);
    if (action.save.success)      parts.push(`Success: ${action.save.success}`);
    if (action.save.successEach5) parts.push(`Success (Each 5): ${action.save.successEach5}`);
  }

  if (action.check?.dc != null) {
    parts.push(`DC ${action.check.dc}`);
    if (action.check.failure)      parts.push(`Failure: ${action.check.failure}`);
    if (action.check.failureEach5) parts.push(`Failure (Each 5): ${action.check.failureEach5}`);
    if (action.check.success)      parts.push(`Success: ${action.check.success}`);
    if (action.check.successEach5) parts.push(`Success (Each 5): ${action.check.successEach5}`);
  }

  if (action.reactionTrigger) parts.push(`Trigger: ${action.reactionTrigger}`);
  if (action.description)     parts.push(action.description);

  return parts.filter(Boolean).join(', ');
}

function buildActionEntry(action, fallbackSaveDC, baseDamage) {
  const cost = action.cost != null ? ` (${action.cost})` : '';
  const name = `${action.name || 'Action'}${cost}`;
  const desc = buildActionDesc(action, fallbackSaveDC, baseDamage);
  return `  - name: ${name}\n    desc: ${yamlQuote(desc)}`;
}

// ── Obsidian YAML statblock ────────────────────────────────────────────────────

function buildCreatureYaml(creature, monsterSlot) {
  const rs       = recalcStats(creature, monsterSlot);
  const attrVals = rs.attributes;
  const traits   = creature.traits || {};

  const name    = monsterSlot?.name || creature.name || 'Unknown';
  const level   = effectiveLvl(monsterSlot, creature);
  const pd      = rs.PD;
  const pdH     = rs.PDHeavy;
  const pdB     = rs.PDBrutal;
  const ad      = rs.AD;
  const adH     = rs.ADHeavy;
  const adB     = rs.ADBrutal;
  const hp      = rs.HP;
  const ap      = rs.AP;
  const speed   = rs.speed;
  const saveDC  = rs.saveDC;
  const attack  = toSigned(rs.check);
  const mig     = Math.round(Number(attrVals.Mig) || 0);
  const agi     = Math.round(Number(attrVals.Agi) || 0);
  const cha     = Math.round(Number(attrVals.Cha) || 0);
  const int_    = Math.round(Number(attrVals.Int) || 0);
  const baseDmg = rs.damage;

  const lines = [];
  lines.push('```statblock');
  lines.push('layout: DC20 Adversary');
  lines.push(`name: ${name}`);
  lines.push(`size: ${toTitleCase(creature.size)}`);
  lines.push(`type: ${toTitleCase(creature.type)}`);
  lines.push(`level: ${level}`);
  lines.push(`hp: ${hp}`);
  lines.push(`pd: ${pd}/${pdH}/${pdB}`);
  lines.push(`ad: ${ad}/${adH}/${adB}`);
  lines.push(`mig: ${mig}`);
  lines.push(`agi: ${agi}`);
  lines.push(`cha: ${cha}`);
  lines.push(`int: ${int_}`);
  lines.push(`attack: ${attack}`);
  lines.push(`save_dc: ${saveDC}`);
  lines.push(`speed: ${speed}`);
  lines.push(`actions: ${ap}`);

  // Characteristics
  const charEntries = [];
  const pushTraitGroup = (label, group) => {
    const all = [...(group?.damage || []), ...(group?.condition || [])].filter(Boolean);
    if (all.length) charEntries.push({ name: label, desc: all.join(', ') });
  };
  pushTraitGroup('Resistances',     traits.resistances);
  pushTraitGroup('Vulnerabilities', traits.vulnerabilities);
  pushTraitGroup('Immunities',      traits.immunities);
  if (Array.isArray(traits.skills) && traits.skills.length) {
    charEntries.push({ name: 'Skills', desc: traits.skills.map(toTitleCase).join(', ') });
  }
  if (Array.isArray(traits.senses) && traits.senses.length) {
    charEntries.push({ name: 'Senses', desc: traits.senses.join(', ') });
  }
  if (charEntries.length) {
    lines.push('characteristics:');
    charEntries.forEach(({ name: n, desc }) => {
      lines.push(`- name: ${n}`);
      lines.push(`  desc: ${yamlQuote(desc)}`);
    });
  }

  // Passives
  const passives = Array.isArray(creature.featurePassives) ? creature.featurePassives : [];
  if (passives.length) {
    lines.push('features:');
    passives.forEach(f => {
      lines.push(`- name: ${f.name || 'Feature'}`);
      lines.push(`  desc: ${yamlQuote(f.description || '')}`);
    });
  }

  // Actions
  const allActions   = Array.isArray(creature.featureActions)   ? creature.featureActions   : [];
  const allReactions = Array.isArray(creature.featureReactions) ? creature.featureReactions : [];
  const regular   = allActions.filter(a => !a.isLegendaryAction && !a.isApexAction);
  const legendary = allActions.filter(a => a.isLegendaryAction);
  const apex      = allActions.filter(a => a.isApexAction);

  if (regular.length) {
    lines.push('attacks_spells:');
    regular.forEach(a => lines.push(buildActionEntry(a, saveDC, baseDmg)));
  }
  if (allReactions.length) {
    lines.push('reactions:');
    allReactions.forEach(a => lines.push(buildActionEntry(a, saveDC, baseDmg)));
  }
  if (legendary.length) {
    lines.push('legendary_actions:');
    legendary.forEach(a => lines.push(buildActionEntry(a, saveDC, baseDmg)));
  }
  if (apex.length) {
    lines.push('apex_actions:');
    apex.forEach(a => lines.push(buildActionEntry(a, saveDC, baseDmg)));
  }

  lines.push('```');
  return lines.join('\n');
}

// ── Unique monster group helpers ───────────────────────────────────────────────

/**
 * Build an array of unique monster entries grouped by (creatureId, effectiveLevel).
 * Entries with multiple monsters at the same level get a "×N" count appended.
 * Different levels of the same creature each produce a separate entry.
 */
function buildUniqueMonsterEntries(enc, creaturesMap) {
  // Count occurrences per (creatureId, effectiveLevel) key
  const groupMap = new Map();
  for (const m of enc.monsters || []) {
    if (!m.creatureId) continue;
    const creature = creaturesMap[m.creatureId];
    if (!creature) continue;
    const lvl = effectiveLvl(m, creature);
    const key = `${m.creatureId}:${lvl}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { creature, slot: m, count: 0, level: lvl });
    }
    groupMap.get(key).count++;
  }

  // Build display entries
  const entries = [];
  for (const { creature, slot, count } of groupMap.values()) {
    const baseName = slot.name || creature.name || 'Unknown';
    const displayName = count > 1 ? `${baseName} ×${count}` : baseName;
    const displaySlot = { ...slot, name: displayName };
    entries.push({ creature, slot: displaySlot });
  }
  return entries;
}

// ── Obsidian .md export ────────────────────────────────────────────────────────

function generateEncounterMd(enc, creaturesMap) {
  const lines = [];
  lines.push(`# ${enc.name || 'Unnamed Encounter'}`);
  lines.push('');

  if (enc.description) {
    lines.push('## Description');
    lines.push('');
    lines.push(enc.description);
    lines.push('');
  }

  if (enc.info) {
    lines.push('## GM Notes');
    lines.push('');
    lines.push(enc.info);
    lines.push('');
  }

  if (enc.rewards) {
    lines.push('## Rewards');
    lines.push('');
    lines.push(enc.rewards);
    lines.push('');
  }

  for (const { creature, slot } of buildUniqueMonsterEntries(enc, creaturesMap)) {
    lines.push('---');
    lines.push('');
    lines.push(buildCreatureYaml(creature, slot));
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadEncounterMd(enc, creaturesMap) {
  const md   = generateEncounterMd(enc, creaturesMap);
  const slug = (enc.name || 'encounter')
    .replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '-').toLowerCase()
    || 'encounter';
  const blob = new Blob([md], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF (print window) ────────────────────────────────────────────────────────

/** Build a single action's inline summary text (joined with · like the creator's print mode). */
function buildActionSummary(action, saveDC, baseDmg) {
  const parts = [];

  const typeParts = [];
  if (action.actionType) typeParts.push(escapeHtml(action.actionType));
  if (action.targetDefense) typeParts.push(`vs <strong>${escapeHtml(action.targetDefense)}</strong>`);

  const segments = Array.isArray(action.damage) ? action.damage : [];
  if (segments.length) {
    const base = Number(baseDmg) || 0;
    let heavyHit = false;
    const dmgStr = segments.map(d => {
      const amt = d.useBase !== undefined
        ? (d.useBase ? base : 0) + (Number(d.modifier) || 0)
        : Number(d.amount) || 0;
      if (amt % 1 !== 0) heavyHit = true;
      return `<strong>${Math.floor(amt)}${d.type ? ' ' + escapeHtml(d.type) : ''}</strong>`;
    }).join(' + ');
    typeParts.push(`${dmgStr} damage on hit${heavyHit ? ', +1 on heavy hits' : ''}`);
  }
  if (typeParts.length) parts.push(typeParts.join(' '));

  if (action.target || action.range) {
    const t = ['Target'];
    if (action.target) t.push(escapeHtml(action.target));
    if (action.range)  t.push(`within ${escapeHtml(action.range)}`);
    parts.push(t.join(' '));
  }

  if (action.reactionTrigger) parts.push(`<em>Trigger:</em> ${escapeHtml(action.reactionTrigger)}`);

  if (action.save?.attribute) {
    const dc = action.save.dc ?? saveDC;
    parts.push(`${escapeHtml(action.save.attribute)} Save DC <strong>${dc}</strong>`);
    if (action.save.failure)      parts.push(`Failure: ${escapeHtml(action.save.failure)}`);
    if (action.save.failureEach5) parts.push(`Each 5: ${escapeHtml(action.save.failureEach5)}`);
    if (action.save.success)      parts.push(`Success: ${escapeHtml(action.save.success)}`);
    if (action.save.successEach5) parts.push(`Success Each 5: ${escapeHtml(action.save.successEach5)}`);
  }

  if (action.check?.dc != null) {
    parts.push(`Check DC <strong>${action.check.dc}</strong>`);
    if (action.check.failure)      parts.push(`Failure: ${escapeHtml(action.check.failure)}`);
    if (action.check.failureEach5) parts.push(`Each 5: ${escapeHtml(action.check.failureEach5)}`);
    if (action.check.success)      parts.push(`Success: ${escapeHtml(action.check.success)}`);
    if (action.check.successEach5) parts.push(`Success Each 5: ${escapeHtml(action.check.successEach5)}`);
  }

  if (action.description) parts.push(escapeHtml(action.description));

  return parts.join(' · ');
}

function buildStatblockHtml(creature, monsterSlot) {
  const rs        = recalcStats(creature, monsterSlot);
  const attrVals  = rs.attributes;
  const attrSaves = rs.attributeSaves;
  const traits    = creature.traits || {};

  const name    = monsterSlot?.name || creature.name || 'Unknown';
  const level   = effectiveLvl(monsterSlot, creature);
  const pd      = rs.PD;
  const pdH     = rs.PDHeavy;
  const pdB     = rs.PDBrutal;
  const ad      = rs.AD;
  const adH     = rs.ADHeavy;
  const adB     = rs.ADBrutal;
  const hp      = rs.HP;
  const ap      = rs.AP;
  const speed   = rs.speed;
  const saveDC  = rs.saveDC;
  const attack  = toSigned(rs.check);
  const baseDmg = rs.damage;
  const mig     = Math.round(Number(attrVals.Mig)   || 0);
  const agi     = Math.round(Number(attrVals.Agi)   || 0);
  const cha     = Math.round(Number(attrVals.Cha)   || 0);
  const int_    = Math.round(Number(attrVals.Int)   || 0);
  const migSave = Math.round(Number(attrSaves.Mig)  || 0);
  const agiSave = Math.round(Number(attrSaves.Agi)  || 0);
  const chaSave = Math.round(Number(attrSaves.Cha)  || 0);
  const intSave = Math.round(Number(attrSaves.Int)  || 0);
  const size    = toTitleCase(creature.size);
  const type    = toTitleCase(creature.type);
  const power   = toTitleCase(monsterSlot?.power || creature.power || 'normal');
  const role    = toTitleCase(monsterSlot?.role  || creature.role  || '');

  const signed = n => `${n >= 0 ? '+' : ''}${n}`;

  // Traits section
  function traitRow(label, group) {
    const all = [...(group?.damage || []), ...(group?.condition || [])].filter(Boolean);
    if (!all.length) return '';
    const pills = all.map(v => `<span>${escapeHtml(v)}</span>`).join('');
    return `<div class="statblock-trait-row"><span class="statblock-trait-label">${label}:</span><span class="statblock-trait-values">${pills}</span></div>`;
  }
  function simpleRow(label, arr) {
    if (!Array.isArray(arr) || !arr.length) return '';
    const pills = arr.map(v => `<span>${escapeHtml(toTitleCase(v))}</span>`).join('');
    return `<div class="statblock-trait-row"><span class="statblock-trait-label">${label}:</span><span class="statblock-trait-values">${pills}</span></div>`;
  }
  const traitsInner = [
    traitRow('Resistances',     traits.resistances),
    traitRow('Vulnerabilities', traits.vulnerabilities),
    traitRow('Immunities',      traits.immunities),
    simpleRow('Skills',  traits.skills),
    simpleRow('Senses',  traits.senses),
  ].filter(Boolean).join('');
  const traitsHtml = traitsInner
    ? `<hr class="statblock-rule"><div class="statblock-traits statblock-trait-section">${traitsInner}</div>`
    : '';

  // Passives
  const passives = Array.isArray(creature.featurePassives) ? creature.featurePassives : [];
  const passivesHtml = passives.length
    ? `<div class="statblock-feature-section">
        <span class="statblock-feature-heading">Features</span>
        <div class="statblock-feature-list">${passives.map(f => `
          <div class="statblock-feature-item">
            <div class="feature-name">${escapeHtml(f.name || '')}</div>
            <div class="feature-description">${escapeHtml(f.description || '')}</div>
          </div>`).join('')}
        </div>
      </div>`
    : '';

  // Actions
  const allActions   = Array.isArray(creature.featureActions)   ? creature.featureActions   : [];
  const allReactions = Array.isArray(creature.featureReactions) ? creature.featureReactions : [];
  const regular   = allActions.filter(a => !a.isLegendaryAction && !a.isApexAction);
  const legendary = allActions.filter(a => a.isLegendaryAction);
  const apex      = allActions.filter(a => a.isApexAction);

  function renderActionItem(a) {
    const cost = a.cost != null ? ` (${a.cost} AP)` : '';
    const summary = buildActionSummary(a, saveDC, baseDmg);
    return `<div class="statblock-action-item">
      <strong>${escapeHtml((a.name || 'Action') + cost)}:</strong>
      <div class="action-summary">${summary}</div>
    </div>`;
  }
  function renderActionSection(actions, heading) {
    if (!actions.length) return '';
    return `<div class="statblock-actions-section">
      <div class="statblock-actions-heading">${escapeHtml(heading)}</div>
      <div class="statblock-actions-list">${actions.map(renderActionItem).join('')}</div>
    </div>`;
  }

  const actionsBarHtml = `<div class="statblock-actions-bar">
    <span>Attack: ${attack}</span>
    <span>Base Dmg: ${Math.floor(baseDmg)}</span>
    <span>Save DC: ${saveDC}</span>
    <span>Speed: ${speed}</span>
  </div>`;

  const regularHtml = regular.length
    ? `<div class="statblock-actions-section">
        <div class="statblock-actions-heading">Actions (${ap} AP)</div>
        ${actionsBarHtml}
        <div class="statblock-actions-list">${regular.map(renderActionItem).join('')}</div>
      </div>`
    : '';

  const infoLeft  = `${size} ${type}`.trim();
  const infoRight = `Level ${level}${power && power !== 'Normal' ? ` ${power}` : ''}${role ? ` ${role}` : ''}`;

  return `<div class="statblock">
  <div class="statblock-name">${escapeHtml(name)}</div>
  <div class="statblock-info">${escapeHtml(infoLeft)} | ${escapeHtml(infoRight)}</div>
  <div class="statblock-divider"></div>
  <div class="statblock-vitals">
    <span class="statblock-label">HP</span><span class="statblock-value">${hp}</span>
    <span class="statblock-label">PD</span><span class="statblock-value">${pd} / ${pdH} / ${pdB}</span>
    <span class="statblock-label">AD</span><span class="statblock-value">${ad} / ${adH} / ${adB}</span>
  </div>
  <div class="statblock-attributes">
    <div class="attribute-card"><span class="attribute-label">MIG</span><span class="attribute-value">${signed(mig)}</span><span class="attribute-save">(${signed(migSave)})</span></div>
    <div class="attribute-card"><span class="attribute-label">AGI</span><span class="attribute-value">${signed(agi)}</span><span class="attribute-save">(${signed(agiSave)})</span></div>
    <div class="attribute-card"><span class="attribute-label">CHA</span><span class="attribute-value">${signed(cha)}</span><span class="attribute-save">(${signed(chaSave)})</span></div>
    <div class="attribute-card"><span class="attribute-label">INT</span><span class="attribute-value">${signed(int_)}</span><span class="attribute-save">(${signed(intSave)})</span></div>
  </div>
  ${traitsHtml}
  ${passivesHtml}
  ${regularHtml}
  ${renderActionSection(allReactions, 'Reactions')}
  ${renderActionSection(legendary,    'Legendary Actions')}
  ${renderActionSection(apex,         'Apex Actions')}
</div>`;
}

export function printEncounterPdf(enc, creaturesMap) {
  const encName   = escapeHtml(enc.name || 'Unnamed Encounter');
  const diff      = computeDifficulty(enc);
  const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);

  // ── Encounter info page ──────────────────────────────────────────────────
  let textContent = `<h1 class="enc-title">${encName}</h1>`;
  textContent += `<div class="enc-badges"><span class="enc-badge enc-badge--${diff}">${diffLabel} Encounter</span></div>`;

  if (enc.description) textContent += `<h2>Description</h2><p>${escapeHtml(enc.description).replace(/\n/g, '<br>')}</p>`;
  if (enc.info)        textContent += `<h2>GM Notes</h2><p>${escapeHtml(enc.info).replace(/\n/g, '<br>')}</p>`;
  if (enc.rewards)     textContent += `<h2>Rewards</h2><p>${escapeHtml(enc.rewards).replace(/\n/g, '<br>')}</p>`;

  // Party table
  const party = enc.party || [];
  if (party.length) {
    textContent += `<h2>Party (${party.length})</h2>`;
    textContent += `<table class="info-table"><thead><tr><th>Name</th><th>Class</th><th>Level</th><th>HP</th><th>PD</th><th>AD</th></tr></thead><tbody>`;
    party.forEach(p => {
      textContent += `<tr><td>${escapeHtml(p.name || '—')}</td><td>${escapeHtml(p.class || '—')}</td><td>${p.level ?? '—'}</td><td>${p.hp ?? '—'}</td><td>${p.pd ?? '—'}</td><td>${p.ad ?? '—'}</td></tr>`;
    });
    textContent += `</tbody></table>`;
  }

  // Monster summary table (unique groups with counts)
  const uniqueEntries = buildUniqueMonsterEntries(enc, creaturesMap);
  if (uniqueEntries.length) {
    textContent += `<h2>Monsters</h2>`;
    textContent += `<table class="info-table"><thead><tr><th>Name</th><th>Level</th><th>Power</th><th>Role</th><th>HP</th><th>PD</th><th>AD</th></tr></thead><tbody>`;
    uniqueEntries.forEach(({ creature, slot }) => {
      const stats = creature.stats || {};
      const lvl   = effectiveLvl(slot, creature);
      const power = toTitleCase(slot.power || creature.power || '');
      const role  = toTitleCase(slot.role  || creature.role  || '');
      textContent += `<tr><td>${escapeHtml(slot.name || creature.name || '—')}</td><td>${lvl}</td><td>${escapeHtml(power)}</td><td>${escapeHtml(role)}</td><td>${Math.round(Number(stats.HP) || 0)}</td><td>${Math.round(Number(stats.PD) || 0)}</td><td>${Math.round(Number(stats.AD) || 0)}</td></tr>`;
    });
    textContent += `</tbody></table>`;
  }

  // ── Statblock pages ──────────────────────────────────────────────────────
  let monsterPagesHtml = '';
  for (let i = 0; i < uniqueEntries.length; i += 2) {
    const pair = uniqueEntries.slice(i, i + 2);
    monsterPagesHtml += `<div class="monster-page">
  <div class="monster-pair">
    ${pair.map(({ creature, slot }) => buildStatblockHtml(creature, slot)).join('\n    ')}
  </div>
</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${encName} — DC20 Encounter</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 10pt; color: #101010; background: #fff; }

    /* ── Encounter info page ── */
    .text-page { padding: 1.5cm 2cm; }
    .enc-title  { font-size: 20pt; font-weight: 700; color: #5b2c6f; border-bottom: 4px solid #5b2c6f; padding-bottom: 6px; margin-bottom: 10px; border-radius: 2px; }
    .enc-badges { margin-bottom: 14px; }
    .enc-badge  { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .enc-badge--easy   { background: #d4edda; color: #155724; }
    .enc-badge--fair   { background: #fff3cd; color: #856404; }
    .enc-badge--hard   { background: #ffe0b2; color: #7a3800; }
    .enc-badge--deadly { background: #f8d7da; color: #721c24; }
    h2 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #5b2c6f; margin: 14px 0 5px; border-bottom: 1px solid #c9a7dd; padding-bottom: 2px; }
    p  { line-height: 1.5; margin-bottom: 6px; font-size: 9pt; }
    .info-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 8px; }
    .info-table th { background: #5b2c6f; color: #fff; padding: 4px 8px; text-align: left; font-weight: 700; }
    .info-table td { padding: 3px 8px; border-bottom: 1px solid #e0d5f0; }
    .info-table tr:nth-child(even) td { background: #f8f5fc; }

    /* ── Monster pages ── */
    .monster-page { page-break-before: always; padding: 1cm; }
    .monster-pair { display: flex; gap: 0.8cm; align-items: flex-start; }
    .monster-pair > .statblock { flex: 0 0 calc(50% - 0.4cm); min-width: 0; }

    /* ── Statblock — mirrors createCreature.css ── */
    .statblock { display: flex; flex-direction: column; gap: 0.3rem; font-size: 7.5pt; color: #101010; page-break-inside: avoid; }

    .statblock-name { background: #5b2c6f; color: #fff; padding: 0.35rem 0.6rem; border-radius: 4px; font-size: 11pt; font-weight: 700; }
    .statblock-info { font-weight: 600; letter-spacing: 0.02em; font-size: 7.5pt; }
    .statblock-divider { height: 0; border-bottom: 4px solid #5b2c6f; border-radius: 4px; }

    .statblock-vitals { display: grid; grid-template-columns: auto auto auto auto auto auto; gap: 0.2rem; align-items: center; }
    .statblock-label  { font-weight: 700; text-transform: uppercase; white-space: nowrap; }
    .statblock-value  { background: #f5f5f5; padding: 0.2rem 0.4rem; border-radius: 4px; white-space: nowrap; }

    .statblock-attributes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.2rem; }
    .attribute-card  { background: #f5f5f5; border-radius: 4px; padding: 0.2rem 0.4rem; display: flex; flex-direction: row; align-items: baseline; gap: 0.3rem; }
    .attribute-label { font-weight: 700; text-transform: uppercase; font-size: 6.5pt; }
    .attribute-value { font-size: 7.5pt; }
    .attribute-save  { font-size: 6.5pt; color: #555; }

    .statblock-rule  { border: none; border-top: 2px solid #d0d0d0; margin: 0; }

    .statblock-traits { display: flex; flex-direction: column; gap: 0.2rem; }
    .statblock-trait-section { padding-bottom: 0.3rem; border-bottom: 4px solid #5b2c6f; border-radius: 2px; }
    .statblock-trait-row    { display: flex; gap: 0.25rem; align-items: baseline; flex-wrap: nowrap; }
    .statblock-trait-label  { font-weight: 700; white-space: nowrap; }
    .statblock-trait-values { display: flex; flex-wrap: wrap; gap: 0.2rem; }
    .statblock-trait-values span { background: #f5f5f5; border-radius: 3px; padding: 0.1rem 0.25rem; }

    .statblock-feature-section  { display: flex; flex-direction: column; gap: 0.2rem; padding-top: 0.25rem; border-bottom: 4px solid #5b2c6f; border-radius: 2px; }
    .statblock-feature-heading  { font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 7pt; }
    .statblock-feature-list     { display: flex; flex-direction: column; gap: 0.2rem; }
    .statblock-feature-item     { background: #f5f5f5; border-radius: 4px; padding: 0.2rem 0.4rem; }
    .feature-name               { font-weight: 600; }
    .feature-description        { color: #333; line-height: 1.3; }

    .statblock-actions-section  { display: flex; flex-direction: column; gap: 0.25rem; padding-top: 0.25rem; border-bottom: 4px solid #5b2c6f; border-radius: 2px; }
    .statblock-actions-heading  { font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 7pt; }
    .statblock-actions-bar      { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: space-between; background: #efe6f4; border: 1px solid #c9a7dd; border-radius: 4px; padding: 0.2rem 0.4rem; font-weight: 600; color: #3a2750; font-size: 7pt; }
    .statblock-actions-list     { display: flex; flex-direction: column; gap: 0.25rem; }
    .statblock-action-item      { background: #f8f6ff; border: 1px solid #d8c9f0; border-radius: 4px; padding: 0.2rem 0.4rem; color: #2d1f3b; line-height: 1.35; }
    .action-summary             { margin-top: 1px; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .text-page { page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="text-page">
    ${textContent}
  </div>
  ${monsterPagesHtml}
  <script>window.addEventListener('load', () => window.print());</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

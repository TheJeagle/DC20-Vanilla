/**
 * runExport.js
 * Encounter export helpers for the RunEncounter page.
 * Reads from decoded Firestore creature docs (state.creatures map) — no extra fetches needed.
 *
 * Firestore creature shape used here:
 *   creature.stats.{HP, PD, PDHeavy, PDBrutal, AD, ADHeavy, ADBrutal, speed, AP, saveDC, check, damage}
 *   creature.attributes.values.{Mig, Agi, Cha, Int}
 *   creature.traits.{resistances, vulnerabilities, immunities, senses, skills}
 *   creature.featurePassives[], featureActions[], featureReactions[]
 *
 * Action damage — two formats:
 *   New: {useBase, modifier, type}  → (useBase ? baseDamage : 0) + modifier
 *   Old: {amount, type}             → amount
 */

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
    const dmg = segments.map(d => {
      const amt = d.useBase !== undefined
        ? (d.useBase ? base : 0) + (Number(d.modifier) || 0)
        : Number(d.amount) || 0;
      return d.type ? `${Math.floor(amt)} ${d.type}` : String(Math.floor(amt));
    }).join(' + ');
    parts.push(`${dmg} damage on hit`);
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
  const stats    = creature.stats     || {};
  const attrVals = creature.attributes?.values || {};
  const traits   = creature.traits    || {};

  const name   = monsterSlot?.name || creature.name || 'Unknown';
  const level  = effectiveLvl(monsterSlot, creature);
  const pd     = Math.round(Number(stats.PD)       || 0);
  const pdH    = Math.round(Number(stats.PDHeavy)  || pd + 5);
  const pdB    = Math.round(Number(stats.PDBrutal) || pd + 10);
  const ad     = Math.round(Number(stats.AD)       || 0);
  const adH    = Math.round(Number(stats.ADHeavy)  || ad + 5);
  const adB    = Math.round(Number(stats.ADBrutal) || ad + 10);
  const hp     = Math.round(Number(stats.HP)       || 0);
  const ap     = Math.round(Number(stats.AP)       || 0);
  const speed  = Math.round(Number(stats.speed)    || 0);
  const saveDC = Math.round(Number(stats.saveDC)   || 0);
  const attack = toSigned(stats.check);
  const mig    = Math.round(Number(attrVals.Mig)   || 0);
  const agi    = Math.round(Number(attrVals.Agi)   || 0);
  const cha    = Math.round(Number(attrVals.Cha)   || 0);
  const int_   = Math.round(Number(attrVals.Int)   || 0);
  const baseDmg = Number(stats.damage) || 0;

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

function buildActionHtml(action, saveDC, baseDmg) {
  const cost = action.cost != null ? ` (${action.cost} AP)` : '';
  const nameHtml = escapeHtml(`${action.name || 'Action'}${cost}`);

  const lines = [];

  // Attack / type line
  const typeParts = [];
  if (action.actionType) typeParts.push(escapeHtml(action.actionType));
  if (action.targetDefense) typeParts.push(`vs <strong>${escapeHtml(action.targetDefense)}</strong>`);
  if (action.check?.dc != null && !action.targetDefense) typeParts.push(`DC <strong>${action.check.dc}</strong>`);

  const segments = Array.isArray(action.damage) ? action.damage : [];
  if (segments.length) {
    const base = Number(baseDmg) || 0;
    const dmgStr = segments.map(d => {
      const amt = d.useBase !== undefined
        ? (d.useBase ? base : 0) + (Number(d.modifier) || 0)
        : Number(d.amount) || 0;
      const type = d.type ? ` ${escapeHtml(d.type)}` : '';
      return `<strong>${Math.floor(amt)}${type}</strong>`;
    }).join(' + ');
    typeParts.push(`${dmgStr} damage on hit`);
  }
  if (typeParts.length) lines.push(typeParts.join('. ') + '.');

  // Target / range line
  if (action.target || action.range) {
    const parts = ['Target'];
    if (action.target) parts.push(escapeHtml(action.target));
    if (action.range) parts.push(`within ${escapeHtml(action.range)}`);
    lines.push(parts.join(' ') + '.');
  }

  // Reaction trigger
  if (action.reactionTrigger) lines.push(`<em>Trigger:</em> ${escapeHtml(action.reactionTrigger)}`);

  // Save block
  if (action.save?.attribute) {
    const dc = action.save.dc ?? saveDC;
    lines.push(`${escapeHtml(action.save.attribute)} Save, DC: <strong>${dc}</strong>.`);
    if (action.save.failure) lines.push(`<em>Failure:</em> ${escapeHtml(action.save.failure)}`);
    if (action.save.failureEach5) lines.push(`<em>Failure (Each 5):</em> ${escapeHtml(action.save.failureEach5)}`);
    if (action.save.success) lines.push(`<em>Success:</em> ${escapeHtml(action.save.success)}`);
    if (action.save.successEach5) lines.push(`<em>Success (Each 5):</em> ${escapeHtml(action.save.successEach5)}`);
  }

  // Check block
  if (action.check?.dc != null && action.targetDefense) {
    lines.push(`Check DC: <strong>${action.check.dc}</strong>.`);
  }
  if (action.check) {
    if (action.check.failure) lines.push(`<em>Failure:</em> ${escapeHtml(action.check.failure)}`);
    if (action.check.failureEach5) lines.push(`<em>Failure (Each 5):</em> ${escapeHtml(action.check.failureEach5)}`);
    if (action.check.success) lines.push(`<em>Success:</em> ${escapeHtml(action.check.success)}`);
    if (action.check.successEach5) lines.push(`<em>Success (Each 5):</em> ${escapeHtml(action.check.successEach5)}`);
  }

  // Description
  if (action.description) lines.push(escapeHtml(action.description));

  const bodyHtml = lines.map(l => `<div class="sb-action-line">${l}</div>`).join('');
  return `<p class="sb-action"><span class="sb-action-name">${nameHtml}:</span>${bodyHtml}</p>`;
}

function buildStatblockHtml(creature, monsterSlot) {
  const stats    = creature.stats     || {};
  const attrVals = creature.attributes?.values || {};
  const traits   = creature.traits    || {};

  const name   = monsterSlot?.name || creature.name || 'Unknown';
  const level  = effectiveLvl(monsterSlot, creature);
  const pd     = Math.round(Number(stats.PD)       || 0);
  const pdH    = Math.round(Number(stats.PDHeavy)  || pd + 5);
  const pdB    = Math.round(Number(stats.PDBrutal) || pd + 10);
  const ad     = Math.round(Number(stats.AD)       || 0);
  const adH    = Math.round(Number(stats.ADHeavy)  || ad + 5);
  const adB    = Math.round(Number(stats.ADBrutal) || ad + 10);
  const hp     = Math.round(Number(stats.HP)       || 0);
  const ap     = Math.round(Number(stats.AP)       || 0);
  const speed  = Math.round(Number(stats.speed)    || 0);
  const saveDC = Math.round(Number(stats.saveDC)   || 0);
  const attack = toSigned(stats.check);
  const mig    = Math.round(Number(attrVals.Mig)   || 0);
  const agi    = Math.round(Number(attrVals.Agi)   || 0);
  const cha    = Math.round(Number(attrVals.Cha)   || 0);
  const int_   = Math.round(Number(attrVals.Int)   || 0);
  const baseDmg = Number(stats.damage) || 0;
  const size   = toTitleCase(creature.size);
  const type   = toTitleCase(creature.type);
  const power  = toTitleCase(monsterSlot?.power || creature.power || 'normal');
  const role   = toTitleCase(monsterSlot?.role  || creature.role  || '');

  const allActions   = Array.isArray(creature.featureActions)   ? creature.featureActions   : [];
  const allReactions = Array.isArray(creature.featureReactions) ? creature.featureReactions : [];
  const regular   = allActions.filter(a => !a.isLegendaryAction && !a.isApexAction);
  const legendary = allActions.filter(a => a.isLegendaryAction);
  const apex      = allActions.filter(a => a.isApexAction);
  const passives  = Array.isArray(creature.featurePassives) ? creature.featurePassives : [];

  function renderActionGroup(actions, title) {
    if (!actions.length) return '';
    const rows = actions.map(a => buildActionHtml(a, saveDC, baseDmg)).join('');
    return `<div class="sb-divider"></div><p class="sb-section-title">${title}</p>${rows}`;
  }

  // Characteristics
  const charParts = [];
  const pushTraitGroup = (label, group) => {
    const all = [...(group?.damage || []), ...(group?.condition || [])].filter(Boolean);
    if (all.length) charParts.push(`<strong>${label}:</strong> ${escapeHtml(all.join(', '))}`);
  };
  pushTraitGroup('Resistances',     traits.resistances);
  pushTraitGroup('Vulnerabilities', traits.vulnerabilities);
  pushTraitGroup('Immunities',      traits.immunities);
  if (Array.isArray(traits.skills) && traits.skills.length) {
    charParts.push(`<strong>Skills:</strong> ${escapeHtml(traits.skills.map(toTitleCase).join(', '))}`);
  }
  if (Array.isArray(traits.senses) && traits.senses.length) {
    charParts.push(`<strong>Senses:</strong> ${escapeHtml(traits.senses.join(', '))}`);
  }
  const charHtml = charParts.length
    ? `<div class="sb-divider"></div><div class="sb-chars">${charParts.join(' &nbsp;·&nbsp; ')}</div>`
    : '';

  const passivesHtml = passives.length
    ? `<div class="sb-divider"></div>${passives.map(f =>
        `<p class="sb-passive"><span class="sb-passive-name">${escapeHtml(f.name || '')}.</span> ${escapeHtml(f.description || '')}</p>`
      ).join('')}`
    : '';

  return `<div class="statblock">
  <div class="sb-header">
    <div class="sb-name">${escapeHtml(name)}</div>
    <div class="sb-subtitle">${escapeHtml(size)} ${escapeHtml(type)} — Level ${level} ${escapeHtml(power)}${role ? ` ${escapeHtml(role)}` : ''}</div>
  </div>
  <div class="sb-divider"></div>
  <div class="sb-core-row">
    <div class="sb-core-block"><div class="sb-core-val">${hp}</div><div class="sb-core-lbl">HP</div></div>
    <div class="sb-core-block"><div class="sb-core-val">${pd}/${pdH}/${pdB}</div><div class="sb-core-lbl">PD</div></div>
    <div class="sb-core-block"><div class="sb-core-val">${ad}/${adH}/${adB}</div><div class="sb-core-lbl">AD</div></div>
    <div class="sb-core-block"><div class="sb-core-val">${ap}</div><div class="sb-core-lbl">AP</div></div>
    <div class="sb-core-block"><div class="sb-core-val">${speed}</div><div class="sb-core-lbl">Speed</div></div>
    <div class="sb-core-block"><div class="sb-core-val">${attack}</div><div class="sb-core-lbl">Attack</div></div>
    <div class="sb-core-block"><div class="sb-core-val">${saveDC}</div><div class="sb-core-lbl">Save DC</div></div>
  </div>
  <div class="sb-divider"></div>
  <div class="sb-attrs">
    <div class="sb-attr"><span class="sb-attr-lbl">Mig</span> ${mig >= 0 ? '+' : ''}${mig}</div>
    <div class="sb-attr"><span class="sb-attr-lbl">Agi</span> ${agi >= 0 ? '+' : ''}${agi}</div>
    <div class="sb-attr"><span class="sb-attr-lbl">Cha</span> ${cha >= 0 ? '+' : ''}${cha}</div>
    <div class="sb-attr"><span class="sb-attr-lbl">Int</span> ${int_ >= 0 ? '+' : ''}${int_}</div>
  </div>
  ${charHtml}
  ${passivesHtml}
  ${renderActionGroup(regular,      'Actions')}
  ${renderActionGroup(allReactions, 'Reactions')}
  ${renderActionGroup(legendary,    'Legendary Actions')}
  ${renderActionGroup(apex,         'Apex Actions')}
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
    body { font-family: Georgia, serif; font-size: 10pt; color: #1a1a1a; background: #fff; }

    /* ── Encounter info page ── */
    .text-page { padding: 2cm; }
    .enc-title { font-size: 20pt; font-weight: bold; color: #8c2a2a; border-bottom: 3px solid #8c2a2a; padding-bottom: 6px; margin-bottom: 12px; }
    .enc-badges { margin-bottom: 16px; }
    .enc-badge { display: inline-block; padding: 3px 10px; border-radius: 3px; font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
    .enc-badge--easy    { background: #d4edda; color: #155724; }
    .enc-badge--fair    { background: #fff3cd; color: #856404; }
    .enc-badge--hard    { background: #ffe0b2; color: #7a3800; }
    .enc-badge--deadly  { background: #f8d7da; color: #721c24; }
    h2 { font-size: 11pt; font-weight: bold; color: #8c2a2a; margin: 16px 0 6px; border-bottom: 1px solid #c8a0a0; padding-bottom: 3px; }
    p  { line-height: 1.6; margin-bottom: 6px; }
    .info-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
    .info-table th { background: #8c2a2a; color: #fff; padding: 4px 8px; text-align: left; font-weight: bold; }
    .info-table td { padding: 3px 8px; border-bottom: 1px solid #e8d8d0; }
    .info-table tr:nth-child(even) td { background: #fdf6ee; }

    /* ── Monster pages ── */
    .monster-page { page-break-before: always; padding: 1cm; }
    .monster-pair { display: flex; gap: 0.8cm; align-items: flex-start; }
    .monster-pair > .statblock { flex: 1; min-width: 0; }

    /* ── Statblock ── */
    .statblock { border: 2px solid #8c2a2a; background: #fdf6ee; font-size: 8pt; page-break-inside: avoid; }
    .sb-header   { background: #8c2a2a; color: #fff; padding: 6px 10px; }
    .sb-name     { font-size: 11pt; font-weight: bold; }
    .sb-subtitle { font-size: 7pt; font-style: italic; opacity: 0.9; margin-top: 2px; }
    .sb-divider  { height: 2px; background: #8c2a2a; }
    .sb-core-row { display: flex; background: #f5e8d0; padding: 5px 2px; }
    .sb-core-block { flex: 1; text-align: center; min-width: 0; }
    .sb-core-val { font-size: 9pt; font-weight: bold; color: #8c2a2a; line-height: 1.2; white-space: nowrap; }
    .sb-core-lbl { font-size: 5.5pt; text-transform: uppercase; letter-spacing: 0.3px; color: #666; }
    .sb-attrs    { display: flex; gap: 12px; padding: 3px 10px; background: #f5e8d0; font-size: 8pt; }
    .sb-attr-lbl { font-weight: bold; color: #8c2a2a; }
    .sb-chars    { padding: 3px 10px; font-size: 7.5pt; color: #333; line-height: 1.5; }
    .sb-section-title { font-variant: small-caps; font-weight: bold; color: #8c2a2a; font-size: 8pt; padding: 3px 10px 1px; }
    .sb-action   { padding: 2px 10px 3px; margin: 0; line-height: 1.4; }
    .sb-passive  { padding: 2px 10px 3px; margin: 0; line-height: 1.4; }
    .sb-action-name  { font-weight: bold; font-style: italic; }
    .sb-passive-name { font-weight: bold; font-style: italic; }
    .sb-action-line  { margin: 0; }
    .sb-action-line + .sb-action-line { margin-top: 1px; }

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

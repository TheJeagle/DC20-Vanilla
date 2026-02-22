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

  const seen = new Set();
  for (const m of enc.monsters || []) {
    if (!m.creatureId || seen.has(m.creatureId)) continue;
    seen.add(m.creatureId);
    const creature = creaturesMap[m.creatureId];
    if (!creature) continue;

    lines.push('---');
    lines.push('');
    lines.push(buildCreatureYaml(creature, m));
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

function buildStatblockHtml(creature, monsterSlot) {
  const stats    = creature.stats     || {};
  const attrVals = creature.attributes?.values || {};
  const traits   = creature.traits    || {};

  const name   = monsterSlot?.name || creature.name || 'Unknown';
  const level  = effectiveLvl(monsterSlot, creature);
  const pd     = Math.round(Number(stats.PD)       || 0);
  const ad     = Math.round(Number(stats.AD)       || 0);
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
    const rows = actions.map(a => {
      const cost = a.cost != null ? ` (${a.cost} AP)` : '';
      return `<p class="sb-action"><span class="sb-action-name">${escapeHtml((a.name || 'Action') + cost)}.</span> ${escapeHtml(buildActionDesc(a, saveDC, baseDmg))}</p>`;
    }).join('');
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
    <div class="sb-core-block"><div class="sb-core-val">${pd}</div><div class="sb-core-lbl">PD</div></div>
    <div class="sb-core-block"><div class="sb-core-val">${ad}</div><div class="sb-core-lbl">AD</div></div>
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

  let textContent = `<h1 class="enc-title">${encName}</h1>`;
  textContent += `<p class="enc-meta">${diffLabel} Encounter &nbsp;·&nbsp; ${(enc.party || []).length} Players &nbsp;·&nbsp; ${(enc.monsters || []).length} Monsters</p>`;

  if (enc.description) textContent += `<h2>Description</h2><p>${escapeHtml(enc.description)}</p>`;
  if (enc.info)        textContent += `<h2>GM Notes</h2><p>${escapeHtml(enc.info).replace(/\n/g, '<br>')}</p>`;
  if (enc.rewards)     textContent += `<h2>Rewards</h2><p>${escapeHtml(enc.rewards)}</p>`;

  const uniqueMonsters = [];
  const seen = new Set();
  for (const m of enc.monsters || []) {
    if (!m.creatureId || seen.has(m.creatureId)) continue;
    seen.add(m.creatureId);
    const c = creaturesMap[m.creatureId];
    if (c) uniqueMonsters.push({ creature: c, slot: m });
  }

  let monsterPagesHtml = '';
  for (let i = 0; i < uniqueMonsters.length; i += 2) {
    const pair = uniqueMonsters.slice(i, i + 2);
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

    /* Encounter text page */
    .text-page { padding: 2cm; }
    .enc-title { font-size: 22pt; color: #4a1a6a; border-bottom: 2px solid #4a1a6a; padding-bottom: 6px; margin-bottom: 14px; }
    .enc-meta  { font-size: 9pt; color: #555; margin-bottom: 18px; font-style: italic; }
    h2 { font-size: 12pt; color: #4a1a6a; margin: 18px 0 6px; border-bottom: 1px solid #c8a0e0; padding-bottom: 3px; }
    p  { line-height: 1.6; }

    /* Monster pages */
    .monster-page { page-break-before: always; padding: 1cm; }
    .monster-pair { display: flex; gap: 1cm; align-items: flex-start; }
    .monster-pair > .statblock { flex: 1; }

    /* Statblock */
    .statblock { border: 2px solid #8c2a2a; background: #fdf6ee; font-size: 8.5pt; }
    .sb-header  { background: #8c2a2a; color: #fff; padding: 6px 10px; }
    .sb-name    { font-size: 12pt; font-weight: bold; }
    .sb-subtitle { font-size: 7pt; font-style: italic; opacity: 0.9; margin-top: 1px; }
    .sb-divider { height: 2px; background: #8c2a2a; }
    .sb-core-row { display: flex; background: #f5e8d0; padding: 6px 2px; }
    .sb-core-block { flex: 1; text-align: center; }
    .sb-core-val { font-size: 11pt; font-weight: bold; color: #8c2a2a; line-height: 1.1; }
    .sb-core-lbl { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.4px; color: #666; }
    .sb-attrs { display: flex; gap: 16px; padding: 4px 10px; background: #f5e8d0; }
    .sb-attr-lbl { font-weight: bold; color: #8c2a2a; }
    .sb-chars { padding: 3px 10px; font-size: 7.5pt; color: #333; line-height: 1.5; }
    .sb-section-title { font-variant: small-caps; font-weight: bold; color: #8c2a2a; font-size: 8.5pt; padding: 3px 10px 0; }
    .sb-action, .sb-passive { padding: 2px 10px; margin: 1px 0; line-height: 1.4; }
    .sb-action-name, .sb-passive-name { font-weight: bold; font-style: italic; }

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

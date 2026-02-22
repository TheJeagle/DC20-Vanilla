/**
 * encounterExport.js
 * Encounter export helpers — Obsidian (.md download) and PDF (print window).
 * Both require fetching full creature docs from Firestore to build statblocks.
 */
import {
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { db } from '../../firebaseClient.js';

const CREATURES_COL = 'VanillaCreatures';

const POWER_MULT = { minion: 0.5, weak: 0.7, normal: 1.0, apex: 2.0, legendary: 4.0 };

// ── Firestore fetch ───────────────────────────────────────────────────────────

/**
 * Fetch all unique creature documents referenced by enc.monsters[].creatureId.
 * Returns a map of { creatureId: creatureData }.
 */
export async function fetchCreaturesForEncounter(enc) {
  const ids = [...new Set(
    (enc.monsters || []).map(m => m.creatureId).filter(Boolean)
  )];
  if (ids.length === 0) return {};

  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, CREATURES_COL, id));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
      } catch {
        return null;
      }
    })
  );

  const map = {};
  for (const c of results) {
    if (c) map[c.id] = c;
  }
  return map;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function toTitleCase(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toSigned(value) {
  const n = Math.round(Number(value) || 0);
  return `${n >= 0 ? '+' : ''}${n}`;
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

function computeEncounterDifficulty(enc) {
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

function buildActionDesc(action, fallbackSaveDC) {
  const parts = [];
  if (action.actionType)     parts.push(action.actionType);
  if (action.targetDefense)  parts.push(`vs ${action.targetDefense}`);
  if (action.target)         parts.push(action.target);
  if (action.range)          parts.push(action.range);

  if (Array.isArray(action.damage) && action.damage.length) {
    const dmg = action.damage
      .map(d => {
        const amt = Math.floor(Number(d.amount) || 0);
        return d.type ? `${amt} ${d.type}` : String(amt);
      })
      .join(' + ');
    parts.push(`${dmg} damage`);
  }

  if (action.save?.attribute) {
    const dc = action.save.dc ?? fallbackSaveDC;
    parts.push(`${action.save.attribute} Save DC ${dc}`);
    if (action.save.failure)     parts.push(`Failure: ${action.save.failure}`);
    if (action.save.failureEach5) parts.push(`Failure (Each 5): ${action.save.failureEach5}`);
    if (action.save.success)     parts.push(`Success: ${action.save.success}`);
    if (action.save.successEach5) parts.push(`Success (Each 5): ${action.save.successEach5}`);
  }

  if (action.check?.dc != null) {
    parts.push(`DC ${action.check.dc}`);
    if (action.check.failure)     parts.push(`Failure: ${action.check.failure}`);
    if (action.check.failureEach5) parts.push(`Failure (Each 5): ${action.check.failureEach5}`);
    if (action.check.success)     parts.push(`Success: ${action.check.success}`);
    if (action.check.successEach5) parts.push(`Success (Each 5): ${action.check.successEach5}`);
  }

  if (action.reactionTrigger) parts.push(`Trigger: ${action.reactionTrigger}`);
  if (action.description)     parts.push(action.description);

  return parts.filter(Boolean).join(', ');
}

function buildActionEntry(action, fallbackSaveDC) {
  const cost = action.cost != null ? ` (${action.cost})` : '';
  const name = `${action.name || 'Action'}${cost}`;
  const desc = buildActionDesc(action, fallbackSaveDC);
  return `  - name: ${name}\n    desc: ${yamlQuote(desc)}`;
}

/** Returns effective level for a monster slot. */
function effectiveLevel(monsterSlot, creature) {
  if (monsterSlot) {
    return Math.max(0, (monsterSlot.baseLevel || 0) + (monsterSlot.levelDelta || 0));
  }
  return creature.level ?? 1;
}

// ── Obsidian YAML statblock ───────────────────────────────────────────────────

function buildCreatureStatblockYaml(creature, monsterSlot) {
  const name   = monsterSlot?.name || creature.name || 'Unknown';
  const level  = effectiveLevel(monsterSlot, creature);
  const pd     = Math.round(Number(creature.PD)     || 0);
  const ad     = Math.round(Number(creature.AD)     || 0);
  const hp     = Math.round(Number(creature.HP)     || 0);
  const ap     = Math.round(Number(creature.AP)     || 0);
  const speed  = Math.round(Number(creature.speed)  || 0);
  const saveDC = Math.round(Number(creature.saveDC) || 0);
  const attack = toSigned(creature.check);
  const mig    = Math.round(Number(creature.attributes?.Mig) || 0);
  const agi    = Math.round(Number(creature.attributes?.Agi) || 0);
  const cha    = Math.round(Number(creature.attributes?.Cha) || 0);
  const int_   = Math.round(Number(creature.attributes?.Int) || 0);

  const lines = [];
  lines.push('```statblock');
  lines.push('layout: DC20 Adversary');
  lines.push(`name: ${name}`);
  lines.push(`size: ${toTitleCase(creature.size)}`);
  lines.push(`type: ${toTitleCase(creature.type)}`);
  lines.push(`level: ${level}`);
  lines.push(`hp: ${hp}`);
  lines.push(`pd: ${pd}/${pd + 5}/${pd + 10}`);
  lines.push(`ad: ${ad}/${ad + 5}/${ad + 10}`);
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
  pushTraitGroup('Resistances',    creature.resistances);
  pushTraitGroup('Vulnerabilities', creature.vulnerabilities);
  pushTraitGroup('Immunities',     creature.immunities);
  if (Array.isArray(creature.skills) && creature.skills.length) {
    charEntries.push({ name: 'Skills', desc: creature.skills.map(toTitleCase).join(', ') });
  }
  if (Array.isArray(creature.senses) && creature.senses.length) {
    charEntries.push({ name: 'Senses', desc: creature.senses.join(', ') });
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
    regular.forEach(a => lines.push(buildActionEntry(a, saveDC)));
  }
  if (allReactions.length) {
    lines.push('reactions:');
    allReactions.forEach(a => lines.push(buildActionEntry(a, saveDC)));
  }
  if (legendary.length) {
    lines.push('legendary_actions:');
    legendary.forEach(a => lines.push(buildActionEntry(a, saveDC)));
  }
  if (apex.length) {
    lines.push('apex_actions:');
    apex.forEach(a => lines.push(buildActionEntry(a, saveDC)));
  }

  lines.push('```');
  return lines.join('\n');
}

// ── Obsidian export ───────────────────────────────────────────────────────────

export function generateEncounterObsidianMd(enc, creaturesMap) {
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

  // One statblock per unique creature
  const seen = new Set();
  for (const m of enc.monsters || []) {
    if (!m.creatureId || seen.has(m.creatureId)) continue;
    seen.add(m.creatureId);
    const creature = creaturesMap[m.creatureId];
    if (!creature) continue;

    lines.push('---');
    lines.push('');
    lines.push(buildCreatureStatblockYaml(creature, m));
    lines.push('');
  }

  return lines.join('\n');
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadEncounterObsidian(enc, creaturesMap) {
  const md   = generateEncounterObsidianMd(enc, creaturesMap);
  const slug = (enc.name || 'encounter')
    .replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '-').toLowerCase()
    || 'encounter';
  downloadText(`${slug}.md`, md);
}

// ── PDF (print window) ────────────────────────────────────────────────────────

function buildStatblockHtml(creature, monsterSlot) {
  const name   = monsterSlot?.name || creature.name || 'Unknown';
  const level  = effectiveLevel(monsterSlot, creature);
  const pd     = Math.round(Number(creature.PD)     || 0);
  const ad     = Math.round(Number(creature.AD)     || 0);
  const hp     = Math.round(Number(creature.HP)     || 0);
  const ap     = Math.round(Number(creature.AP)     || 0);
  const speed  = Math.round(Number(creature.speed)  || 0);
  const saveDC = Math.round(Number(creature.saveDC) || 0);
  const attack = toSigned(creature.check);
  const mig    = Math.round(Number(creature.attributes?.Mig) || 0);
  const agi    = Math.round(Number(creature.attributes?.Agi) || 0);
  const cha    = Math.round(Number(creature.attributes?.Cha) || 0);
  const int_   = Math.round(Number(creature.attributes?.Int) || 0);
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
      return `<p class="sb-action"><span class="sb-action-name">${escapeHtml((a.name || 'Action') + cost)}.</span> ${escapeHtml(buildActionDesc(a, saveDC))}</p>`;
    }).join('');
    return `<div class="sb-divider"></div><p class="sb-section-title">${title}</p>${rows}`;
  }

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
  ${passivesHtml}
  ${renderActionGroup(regular,   'Actions')}
  ${renderActionGroup(allReactions, 'Reactions')}
  ${renderActionGroup(legendary, 'Legendary Actions')}
  ${renderActionGroup(apex,      'Apex Actions')}
</div>`;
}

export function printEncounterPdf(enc, creaturesMap) {
  const encName = escapeHtml(enc.name || 'Unnamed Encounter');
  const diff    = computeEncounterDifficulty(enc);
  const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);

  // Page 1: encounter text
  let textContent = `<h1 class="enc-title">${encName}</h1>`;
  textContent += `<p class="enc-meta">${diffLabel} Encounter &nbsp;·&nbsp; ${(enc.party || []).length} Players &nbsp;·&nbsp; ${(enc.monsters || []).length} Monsters</p>`;

  if (enc.description) {
    textContent += `<h2>Description</h2><p>${escapeHtml(enc.description)}</p>`;
  }
  if (enc.info) {
    textContent += `<h2>GM Notes</h2><p>${escapeHtml(enc.info).replace(/\n/g, '<br>')}</p>`;
  }
  if (enc.rewards) {
    textContent += `<h2>Rewards</h2><p>${escapeHtml(enc.rewards)}</p>`;
  }

  // Subsequent pages: two monsters per page
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

    /* ── Encounter text page ── */
    .text-page { padding: 2cm; }
    .enc-title { font-size: 22pt; color: #4a1a6a; border-bottom: 2px solid #4a1a6a; padding-bottom: 6px; margin-bottom: 14px; }
    .enc-meta  { font-size: 9pt; color: #555; margin-bottom: 18px; font-style: italic; }
    h2 { font-size: 12pt; color: #4a1a6a; margin: 18px 0 6px; border-bottom: 1px solid #c8a0e0; padding-bottom: 3px; }
    p  { line-height: 1.6; }

    /* ── Monster pages ── */
    .monster-page { page-break-before: always; padding: 1cm; }
    .monster-pair { display: flex; gap: 1cm; align-items: flex-start; }
    .monster-pair > .statblock { flex: 1; }

    /* ── Statblock ── */
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

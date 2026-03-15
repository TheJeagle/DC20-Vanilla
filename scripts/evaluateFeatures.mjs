#!/usr/bin/env node
/**
 * Feature power evaluator.
 * Reads public/data/features.json, computes a featureCost estimate for each feature,
 * and prints a report sorted by discrepancy (worst offenders first).
 *
 * Usage: node scripts/evaluateFeatures.mjs [--json]
 *   --json   Also write raw results to scripts/evaluateFeatures.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  DAMAGE_PER_MODIFIER,
  DURATION_FACTORS,
  SAVE_FACTORS,
  CONDITION_BASE_VALUES,
  MODIFIER_SCALES,
  RESISTANCE_COST,
  IMMUNITY_COST,
  VULNERABILITY_COST,
  CONDITION_IMMUNITY_COST,
  CONDITION_RESISTANCE_COST,
  REACTION_TAX,
  MAX_RESISTANCES_WITHOUT_FLAG,
} from './evaluationConstants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const featuresPath = join(__dirname, '../public/data/features.json');
const features = JSON.parse(readFileSync(featuresPath, 'utf8'));

const isAoe = (actionType) => actionType && actionType.includes('Area');

// ---- Condition detection ----
// Scans a failure/success text string for known condition keywords.
// Returns array of { conditionName, stacks } found.
const CONDITION_NAMES = Object.keys(CONDITION_BASE_VALUES);

function detectConditions(text) {
  if (!text) return [];
  const found = [];
  for (const name of CONDITION_NAMES) {
    const regex = new RegExp(`\\b${name}(?:\\s+(\\d+))?\\b`, 'i');
    const match = text.match(regex);
    if (match) {
      const stacks = match[1] ? parseInt(match[1], 10) : 1;
      found.push({ name, stacks });
    }
  }
  return found;
}

// ---- Duration factor lookup ----
function getDurationFactor(save) {
  const duration = (save.duration || '').trim();
  if (!duration || duration === '') {
    return DURATION_FACTORS[''];
  }
  if (duration === 'until the end of its next turn') return DURATION_FACTORS['until the end of its next turn'];
  if (duration === 'until the end of your next turn') return DURATION_FACTORS['until the end of your next turn'];
  if (duration === 'for 1 minute') {
    return save.repeatable ? DURATION_FACTORS['for 1 minute (repeatable)'] : DURATION_FACTORS['for 1 minute'];
  }
  if (duration === 'until removed') {
    // Distinguish easy removal (spend AP) vs hard removal by checking for Grapple/Prone/Bleeding keywords
    // in the failure text. These are the canonical "spend AP to escape" conditions.
    const easyRemoveConditions = ['Prone', 'Bleeding', 'Burning', 'Grappled'];
    const failure = save.failure || '';
    const isEasy = easyRemoveConditions.some(c => failure.includes(c));
    return isEasy ? DURATION_FACTORS['until removed (ap)'] : DURATION_FACTORS['until removed'];
  }
  if (/short rest/i.test(duration)) return DURATION_FACTORS['until end of short rest'];
  if (/long rest/i.test(duration)) return DURATION_FACTORS['until end of long rest'];
  // Unknown duration — default to 1 minute with repeatable
  return DURATION_FACTORS['for 1 minute (repeatable)'];
}

// ---- Save factor lookup ----
function getSaveFactor(save) {
  if (!save || !save.attribute) return SAVE_FACTORS.none;
  return SAVE_FACTORS[save.attribute] ?? SAVE_FACTORS.none;
}

// ---- Score a single save block ----
function scoreSaveBlock(save) {
  if (!save) return 0;
  const durationFactor = getDurationFactor(save);
  const saveFactor = getSaveFactor(save);
  const conditions = detectConditions(save.failure || '');
  let cost = 0;
  for (const { name, stacks } of conditions) {
    const baseValue = CONDITION_BASE_VALUES[name] ?? 0;
    cost += baseValue * stacks * durationFactor * saveFactor;
  }
  return cost;
}

// ---- Score all damage segments for one action effects block ----
function scoreDamageSegments(segments, aoe) {
  if (!segments || segments.length === 0) return 0;
  const baseline = aoe ? -1 : 0; // AoE baseline: modifier -1 = free
  let cost = 0;
  for (const seg of segments) {
    if (seg.useBase !== false && seg.amount == null) {
      // useBase segment: cost is (modifier - baseline) * DAMAGE_PER_MODIFIER
      const modifier = seg.modifier ?? 0;
      cost += (modifier - baseline) * DAMAGE_PER_MODIFIER;
    } else if (seg.amount != null) {
      // Fixed flat damage: amount × DAMAGE_PER_MODIFIER
      cost += seg.amount * DAMAGE_PER_MODIFIER;
    }
  }
  return cost;
}

// ---- AP flag check for a single action effects block ----
function checkApFlags(effects, actionType) {
  const flags = [];
  const ap = effects.cost;
  const aoe = isAoe(actionType);
  const hasDefense = !!effects.targetDefense;
  const hasSave = !!effects.save;
  const hasCheck = !!effects.check;

  if (ap >= 4) {
    flags.push(`${ap} AP action — needs individual review`);
  }

  // 2+ AP single-target vs defense with only base damage and no condition
  if (!aoe && hasDefense && ap >= 2 && !hasSave) {
    const segments = effects.damageSegments || [];
    const isOnlyBaseDamage = segments.every(
      s => s.useBase !== false && s.amount == null && (s.modifier ?? 0) === 0
    );
    if (isOnlyBaseDamage) {
      flags.push(`${ap} AP single-target vs ${effects.targetDefense}, only base damage, no condition — consider 1 AP or add featureCost 0 tag`);
    }
  }

  // AoE damage well below baseline (< -1 modifier) is a design error
  if (aoe) {
    const segments = effects.damageSegments || [];
    for (const seg of segments) {
      if (seg.useBase !== false && seg.amount == null) {
        const modifier = seg.modifier ?? 0;
        if (modifier < -1) {
          flags.push(`AoE damage modifier ${modifier} is below the AoE baseline of -1 — design error`);
        }
      }
    }
  }

  return flags;
}

// ---- Score damage and conditions for all actions on a feature ----
function scoreDamageAndConditions(feature) {
  const effects = feature.effects;
  if (!effects) return { damageCost: 0, conditionCost: 0, flags: [] };

  const actionType = feature.actionType || '';
  const aoe = isAoe(actionType);
  let damageCost = 0;
  let conditionCost = 0;
  const flags = [];

  if (effects.cost != null) {
    // This is an action/reaction feature
    damageCost += scoreDamageSegments(effects.damageSegments, aoe);
    conditionCost += scoreSaveBlock(effects.save);
    flags.push(...checkApFlags(effects, actionType));

    // Score enhancements
    for (const enh of (effects.enhancements || [])) {
      const enhAoe = isAoe(actionType); // enhancements inherit parent action type
      damageCost += scoreDamageSegments(enh.damageSegments, enhAoe);
      conditionCost += scoreSaveBlock(enh.save);
    }
  }

  return { damageCost, conditionCost, flags };
}

// ---- Score modifier effects ----
function scoreModifiers(feature) {
  const effects = feature.effects;
  if (!effects) return { modifierCost: 0, flags: [] };

  let modifierCost = 0;
  const flags = [];

  // Numeric stat modifiers
  for (const [stat, scale] of Object.entries(MODIFIER_SCALES)) {
    const val = effects[stat];
    if (val) modifierCost += val * scale;
  }

  // Damage resistances
  const resistances = effects.resistances?.damage || [];
  modifierCost += resistances.length * RESISTANCE_COST;

  // Damage immunities
  const immunities = effects.immunities?.damage || [];
  modifierCost += immunities.length * IMMUNITY_COST;

  // Damage vulnerabilities
  const vulnerabilities = effects.vulnerabilities?.damage || [];
  modifierCost += vulnerabilities.length * VULNERABILITY_COST;

  // Condition immunities
  const condImmunities = effects.immunities?.condition || [];
  modifierCost += condImmunities.length * CONDITION_IMMUNITY_COST;

  // Condition resistances (ADV vs condition)
  const condResistances = effects.resistances?.condition || [];
  modifierCost += condResistances.length * CONDITION_RESISTANCE_COST;

  // Flag too many resistances with no vulnerabilities
  if (resistances.length > MAX_RESISTANCES_WITHOUT_FLAG && vulnerabilities.length === 0) {
    flags.push(`${resistances.length} damage resistances with no vulnerabilities — consider adding vulnerabilities`);
  }

  return { modifierCost, flags };
}

// ---- Main evaluation for one feature ----
function evaluateFeature(feature) {
  const { damageCost, conditionCost, flags: actionFlags } = scoreDamageAndConditions(feature);
  const { modifierCost, flags: modifierFlags } = scoreModifiers(feature);
  const reactionTax = feature.isReaction ? REACTION_TAX : 0;

  const computed = damageCost + conditionCost + modifierCost + reactionTax;
  const stored = feature.featureCost ?? 0;
  const delta = computed - stored;

  const allFlags = [...actionFlags, ...modifierFlags];

  let status;
  if (allFlags.some(f => f.includes('review'))) {
    status = 'FLAG';
  } else if (Math.abs(delta) <= 0.5) {
    status = 'OK';
  } else if (delta > 0) {
    status = 'UNDERPRICED';
  } else {
    status = 'OVERPRICED';
  }

  return {
    id: feature.id,
    name: feature.name,
    type: feature.type,
    stored,
    computed: Math.round(computed * 10) / 10,
    delta: Math.round(delta * 10) / 10,
    status,
    breakdown: { damageCost, conditionCost, modifierCost, reactionTax },
    flags: allFlags,
  };
}

// ---- Run and report ----
const results = features.map(evaluateFeature);

// Sort by absolute delta descending (worst offenders first), then by name
results.sort((a, b) => {
  const da = Math.abs(a.delta);
  const db = Math.abs(b.delta);
  if (db !== da) return db - da;
  return a.name.localeCompare(b.name);
});

// Summary counts
const counts = { OK: 0, UNDERPRICED: 0, OVERPRICED: 0, FLAG: 0 };
for (const r of results) counts[r.status]++;

// Print
console.log('\n=== FEATURE COST EVALUATION REPORT ===\n');
console.log(`Total: ${results.length} features`);
console.log(`  OK: ${counts.OK}  UNDERPRICED: ${counts.UNDERPRICED}  OVERPRICED: ${counts.OVERPRICED}  FLAG: ${counts.FLAG}\n`);

const STATUS_COLORS = {
  OK: '\x1b[32m',       // green
  UNDERPRICED: '\x1b[33m',  // yellow
  OVERPRICED: '\x1b[36m',   // cyan
  FLAG: '\x1b[31m',    // red
};
const RESET = '\x1b[0m';

// Column widths
const W_NAME = 36;
const W_ID = 30;
const W_STATUS = 12;
const W_STORED = 8;
const W_COMPUTED = 10;
const W_DELTA = 8;
const W_BREAKDOWN = 30;

function pad(str, width) {
  return String(str).padEnd(width).slice(0, width);
}

function rpad(str, width) {
  return String(str).padStart(width).slice(-width);
}

const header = [
  pad('Name', W_NAME),
  pad('ID', W_ID),
  pad('Status', W_STATUS),
  rpad('Stored', W_STORED),
  rpad('Computed', W_COMPUTED),
  rpad('Delta', W_DELTA),
  pad('Breakdown (dmg/cond/mod/rxn)', W_BREAKDOWN),
].join('  ');
console.log(header);
console.log('-'.repeat(header.length));

for (const r of results) {
  if (r.status === 'OK' && r.flags.length === 0) continue; // Skip clean OK features for brevity
  const color = STATUS_COLORS[r.status] || '';
  const breakdown = `${r.breakdown.damageCost}/${r.breakdown.conditionCost.toFixed(1)}/${r.breakdown.modifierCost.toFixed(1)}/${r.breakdown.reactionTax}`;
  const line = [
    pad(r.name, W_NAME),
    pad(r.id, W_ID),
    color + pad(r.status, W_STATUS) + RESET,
    rpad(r.stored, W_STORED),
    rpad(r.computed, W_COMPUTED),
    rpad((r.delta >= 0 ? '+' : '') + r.delta, W_DELTA),
    pad(breakdown, W_BREAKDOWN),
  ].join('  ');
  console.log(line);
  for (const flag of r.flags) {
    console.log(`  ${color}⚑${RESET} ${flag}`);
  }
}

console.log('\n--- OK features (no flags) ---');
let okCount = 0;
for (const r of results) {
  if (r.status === 'OK' && r.flags.length === 0) {
    const line = [
      pad(r.name, W_NAME),
      pad(r.id, W_ID),
      '\x1b[32m' + pad('OK', W_STATUS) + RESET,
      rpad(r.stored, W_STORED),
      rpad(r.computed, W_COMPUTED),
      rpad((r.delta >= 0 ? '+' : '') + r.delta, W_DELTA),
    ].join('  ');
    console.log(line);
    okCount++;
  }
}
if (okCount === 0) console.log('  (none)');

// HTML report (always generated)
const htmlPath = join(__dirname, 'evaluateFeatures-report.html');
writeFileSync(htmlPath, buildHtml(results));
console.log(`\nHTML report: ${htmlPath}\n`);

// Optional JSON output
if (process.argv.includes('--json')) {
  const outPath = join(__dirname, 'evaluateFeatures.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`JSON written to ${outPath}`);
}

function buildHtml(results) {
  const rows = results.map(r => {
    const bd = r.breakdown;
    const breakdownStr = `dmg: ${bd.damageCost} / cond: ${bd.conditionCost.toFixed(1)} / mod: ${bd.modifierCost.toFixed(1)} / rxn: ${bd.reactionTax}`;
    const flagsHtml = r.flags.map(f => `<div class="flag">⚑ ${f}</div>`).join('');
    const deltaStr = (r.delta >= 0 ? '+' : '') + r.delta;
    return `<tr class="status-${r.status.toLowerCase()}" data-status="${r.status}" data-delta="${Math.abs(r.delta)}" data-name="${r.name}">
      <td>${r.name}</td>
      <td class="mono small">${r.id}</td>
      <td>${r.type}</td>
      <td class="center"><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
      <td class="center mono">${r.stored}</td>
      <td class="center mono">${r.computed}</td>
      <td class="center mono ${r.delta > 0 ? 'pos' : r.delta < 0 ? 'neg' : ''}">${deltaStr}</td>
      <td class="small">${breakdownStr}${flagsHtml}</td>
    </tr>`;
  }).join('\n');

  const summary = `OK: ${counts.OK} &nbsp; UNDERPRICED: ${counts.UNDERPRICED} &nbsp; OVERPRICED: ${counts.OVERPRICED} &nbsp; FLAG: ${counts.FLAG}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Feature Cost Evaluation</title>
<style>
  :root {
    --bg: #1a1a2e; --surface: #16213e; --surface2: #0f3460;
    --text: #e0e0e0; --muted: #888;
    --ok: #4caf50; --under: #ff9800; --over: #2196f3; --flag: #f44336;
    --ok-bg: #1b3a1f; --under-bg: #3a2a00; --over-bg: #0d2a3a; --flag-bg: #3a0d0d;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px; font-size: 14px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .summary { color: var(--muted); margin-bottom: 16px; font-size: 13px; }
  .controls { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
  .controls label { font-size: 12px; color: var(--muted); }
  input[type=text] { background: var(--surface); border: 1px solid var(--surface2); color: var(--text); padding: 6px 10px; border-radius: 4px; font-size: 13px; width: 220px; }
  .filter-btns { display: flex; gap: 6px; }
  .filter-btns button { padding: 5px 12px; border: 1px solid var(--surface2); border-radius: 4px; background: var(--surface); color: var(--muted); cursor: pointer; font-size: 12px; }
  .filter-btns button.active { color: var(--text); border-color: var(--text); }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 6px; overflow: hidden; }
  thead { background: var(--surface2); }
  th { padding: 10px 12px; text-align: left; font-size: 12px; color: var(--muted); cursor: pointer; user-select: none; white-space: nowrap; }
  th:hover { color: var(--text); }
  th.sorted-asc::after { content: ' ↑'; color: var(--text); }
  th.sorted-desc::after { content: ' ↓'; color: var(--text); }
  td { padding: 8px 12px; border-bottom: 1px solid #1a1a2e; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr.status-underpriced td { background: var(--under-bg); }
  tr.status-overpriced td { background: var(--over-bg); }
  tr.status-flag td { background: var(--flag-bg); }
  .badge { padding: 2px 7px; border-radius: 3px; font-size: 11px; font-weight: 600; }
  .badge-ok { background: var(--ok-bg); color: var(--ok); }
  .badge-underpriced { background: var(--under-bg); color: var(--under); }
  .badge-overpriced { background: var(--over-bg); color: var(--over); }
  .badge-flag { background: var(--flag-bg); color: var(--flag); }
  .mono { font-family: monospace; }
  .small { font-size: 12px; color: var(--muted); }
  .center { text-align: center; }
  .pos { color: var(--under); }
  .neg { color: var(--over); }
  .flag { color: var(--flag); font-size: 11px; margin-top: 3px; }
  .hidden { display: none; }
  .count { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
</style>
</head>
<body>
<h1>Feature Cost Evaluation Report</h1>
<div class="summary">${results.length} features &nbsp;|&nbsp; ${summary}</div>
<div class="controls">
  <div>
    <label>Filter by name/ID</label><br>
    <input type="text" id="search" placeholder="Search...">
  </div>
  <div>
    <label>Status</label><br>
    <div class="filter-btns">
      <button class="active" data-filter="all">All</button>
      <button data-filter="OK">OK</button>
      <button data-filter="UNDERPRICED">Underpriced</button>
      <button data-filter="OVERPRICED">Overpriced</button>
      <button data-filter="FLAG">Flag</button>
    </div>
  </div>
</div>
<div class="count" id="rowCount"></div>
<table id="tbl">
  <thead>
    <tr>
      <th data-col="name">Name</th>
      <th data-col="id">ID</th>
      <th data-col="type">Type</th>
      <th data-col="status" class="center">Status</th>
      <th data-col="stored" class="center">Stored</th>
      <th data-col="computed" class="center">Computed</th>
      <th data-col="delta" class="center sorted-desc">Delta</th>
      <th>Breakdown / Flags</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<script>
  let sortCol = 'delta', sortDir = -1, filterStatus = 'all', searchStr = '';

  function val(row, col) {
    if (col === 'delta') return parseFloat(row.dataset.delta) * (row.querySelector('.pos') ? 1 : row.querySelector('.neg') ? -1 : 0);
    if (col === 'stored') return parseFloat(row.cells[4].textContent);
    if (col === 'computed') return parseFloat(row.cells[5].textContent);
    if (col === 'name') return row.dataset.name.toLowerCase();
    if (col === 'status') return row.dataset.status;
    if (col === 'id') return row.cells[1].textContent;
    if (col === 'type') return row.cells[2].textContent;
    return '';
  }

  function refresh() {
    const tbody = document.querySelector('#tbl tbody');
    const rows = [...tbody.querySelectorAll('tr')];
    rows.forEach(r => {
      const statusMatch = filterStatus === 'all' || r.dataset.status === filterStatus;
      const name = r.dataset.name.toLowerCase();
      const id = r.cells[1].textContent.toLowerCase();
      const searchMatch = !searchStr || name.includes(searchStr) || id.includes(searchStr);
      r.classList.toggle('hidden', !statusMatch || !searchMatch);
    });
    const visible = rows.filter(r => !r.classList.contains('hidden'));
    visible.sort((a, b) => {
      const av = val(a, sortCol), bv = val(b, sortCol);
      return typeof av === 'string' ? av.localeCompare(bv) * sortDir : (bv - av) * -sortDir;
    });
    visible.forEach(r => tbody.appendChild(r));
    document.getElementById('rowCount').textContent = visible.length + ' of ' + rows.length + ' features';
  }

  document.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) { sortDir *= -1; }
      else { sortCol = col; sortDir = -1; }
      document.querySelectorAll('th').forEach(t => t.classList.remove('sorted-asc', 'sorted-desc'));
      th.classList.add(sortDir === -1 ? 'sorted-desc' : 'sorted-asc');
      refresh();
    });
  });

  document.querySelectorAll('.filter-btns button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btns button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterStatus = btn.dataset.filter;
      refresh();
    });
  });

  document.getElementById('search').addEventListener('input', e => {
    searchStr = e.target.value.toLowerCase().trim();
    refresh();
  });

  refresh();
</script>
</body>
</html>`;
}

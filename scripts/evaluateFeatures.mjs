#!/usr/bin/env node
/**
 * Feature power evaluator.
 * Reads public/data/features.json, computes a featureCost estimate for each feature,
 * and generates scripts/evaluateFeatures-report.html — open in browser.
 *
 * Usage: node scripts/evaluateFeatures.mjs
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
function getDurationKey(save) {
  const duration = (save.duration || '').trim();
  if (!duration) return '';
  if (duration === 'until the end of its next turn') return 'until the end of its next turn';
  if (duration === 'until the end of your next turn') return 'until the end of your next turn';
  if (duration === 'for 1 minute') return save.repeatable ? 'for 1 minute (repeatable)' : 'for 1 minute';
  if (duration === 'until removed') {
    const easyRemoveConditions = ['Prone', 'Bleeding', 'Burning', 'Grappled'];
    const failure = save.failure || '';
    return easyRemoveConditions.some(c => failure.includes(c)) ? 'until removed (ap)' : 'until removed';
  }
  if (/short rest/i.test(duration)) return 'until end of short rest';
  if (/long rest/i.test(duration)) return 'until end of long rest';
  return 'for 1 minute (repeatable)';
}

function getDurationFactor(save) {
  return DURATION_FACTORS[getDurationKey(save)] ?? 1.0;
}

function getSaveKey(save) {
  if (!save || !save.attribute) return 'none';
  return save.attribute;
}

function getSaveFactor(save) {
  return SAVE_FACTORS[getSaveKey(save)] ?? SAVE_FACTORS.none;
}

// ---- Score a single save block — returns { cost, reasons[] } ----
function scoreSaveBlock(save, label) {
  if (!save) return { cost: 0, reasons: [] };
  const durationKey = getDurationKey(save);
  const durationFactor = getDurationFactor(save);
  const saveKey = getSaveKey(save);
  const saveFactor = getSaveFactor(save);
  const conditions = detectConditions(save.failure || '');
  const reasons = [];
  let cost = 0;

  if (conditions.length === 0 && save.failure) {
    reasons.push(`${label}: failure text "${save.failure.slice(0, 60)}" — no recognised condition detected (scores 0)`);
  }

  for (const { name, stacks } of conditions) {
    const baseValue = CONDITION_BASE_VALUES[name] ?? 0;
    const contribution = baseValue * stacks * durationFactor * saveFactor;
    cost += contribution;
    reasons.push(
      `${label}: ${name}${stacks > 1 ? ` ×${stacks}` : ''} (base ${baseValue}) × duration "${durationKey || 'instant'}" (${durationFactor}) × save ${saveKey} (${saveFactor}) = ${contribution.toFixed(2)}`
    );
  }
  return { cost, reasons };
}

// ---- Score damage segments — returns { cost, reasons[] } ----
function scoreDamageSegments(segments, aoe, label) {
  if (!segments || segments.length === 0) return { cost: 0, reasons: [] };
  const baseline = aoe ? -1 : 0;
  const baselineLabel = aoe ? 'AoE baseline −1' : 'single-target baseline 0';
  let cost = 0;
  const reasons = [];

  for (const seg of segments) {
    if (seg.useBase !== false && seg.amount == null) {
      const modifier = seg.modifier ?? 0;
      const contribution = (modifier - baseline) * DAMAGE_PER_MODIFIER;
      cost += contribution;
      if (contribution !== 0) {
        reasons.push(`${label}: ${seg.type} modifier ${modifier > 0 ? '+' : ''}${modifier} vs ${baselineLabel} → (${modifier} − ${baseline}) × ${DAMAGE_PER_MODIFIER} = ${contribution.toFixed(1)}`);
      } else {
        reasons.push(`${label}: ${seg.type} modifier ${modifier} = free baseline (0)`);
      }
    } else if (seg.amount != null) {
      const contribution = seg.amount * DAMAGE_PER_MODIFIER;
      cost += contribution;
      reasons.push(`${label}: flat ${seg.amount} ${seg.type} damage × ${DAMAGE_PER_MODIFIER} = ${contribution.toFixed(1)}`);
    }
  }
  return { cost, reasons };
}

// ---- AP flag check ----
function checkApFlags(effects, actionType) {
  const flags = [];
  const ap = effects.cost;
  const aoe = isAoe(actionType);
  const hasDefense = !!effects.targetDefense;
  const hasSave = !!effects.save;

  if (ap >= 4) flags.push(`${ap} AP action — needs individual review`);

  if (!aoe && hasDefense && ap >= 2 && !hasSave) {
    const segments = effects.damageSegments || [];
    const isOnlyBaseDamage = segments.every(
      s => s.useBase !== false && s.amount == null && (s.modifier ?? 0) === 0
    );
    if (isOnlyBaseDamage) {
      flags.push(`${ap} AP single-target vs ${effects.targetDefense}, only base damage, no condition — consider reducing to 1 AP`);
    }
  }

  if (aoe) {
    for (const seg of (effects.damageSegments || [])) {
      if (seg.useBase !== false && seg.amount == null && (seg.modifier ?? 0) < -1) {
        flags.push(`AoE damage modifier ${seg.modifier} is below the AoE baseline of −1 — design error`);
      }
    }
  }

  return flags;
}

// ---- Score all actions on a feature ----
function scoreDamageAndConditions(feature) {
  const effects = feature.effects;
  if (!effects) return { damageCost: 0, conditionCost: 0, reasons: [], flags: [] };

  const actionType = feature.actionType || '';
  const aoe = isAoe(actionType);
  let damageCost = 0, conditionCost = 0;
  const reasons = [], flags = [];

  if (effects.cost != null) {
    const dmg = scoreDamageSegments(effects.damageSegments, aoe, 'Main action');
    damageCost += dmg.cost;
    reasons.push(...dmg.reasons);

    const cond = scoreSaveBlock(effects.save, 'Main save');
    conditionCost += cond.cost;
    reasons.push(...cond.reasons);

    flags.push(...checkApFlags(effects, actionType));

    for (const [i, enh] of (effects.enhancements || []).entries()) {
      const label = `Enhancement "${enh.name}"`;
      const eDmg = scoreDamageSegments(enh.damageSegments, aoe, `${label} damage`);
      damageCost += eDmg.cost;
      reasons.push(...eDmg.reasons);

      const eCond = scoreSaveBlock(enh.save, `${label} save`);
      conditionCost += eCond.cost;
      reasons.push(...eCond.reasons);
    }
  }

  return { damageCost, conditionCost, reasons, flags };
}

// ---- Score modifier effects ----
function scoreModifiers(feature) {
  const effects = feature.effects;
  if (!effects) return { modifierCost: 0, reasons: [], flags: [] };

  let modifierCost = 0;
  const reasons = [], flags = [];

  for (const [stat, scale] of Object.entries(MODIFIER_SCALES)) {
    const val = effects[stat];
    if (val) {
      const contribution = val * scale;
      modifierCost += contribution;
      reasons.push(`${stat}: ${val > 0 ? '+' : ''}${val} × ${scale} = ${contribution.toFixed(1)}`);
    }
  }

  const resistances = effects.resistances?.damage || [];
  if (resistances.length) {
    const contribution = resistances.length * RESISTANCE_COST;
    modifierCost += contribution;
    reasons.push(`Damage resistances: ${resistances.join(', ')} (${resistances.length} × ${RESISTANCE_COST}) = ${contribution.toFixed(1)}`);
  }

  const immunities = effects.immunities?.damage || [];
  if (immunities.length) {
    const contribution = immunities.length * IMMUNITY_COST;
    modifierCost += contribution;
    reasons.push(`Damage immunities: ${immunities.join(', ')} (${immunities.length} × ${IMMUNITY_COST}) = ${contribution.toFixed(1)}`);
  }

  const vulnerabilities = effects.vulnerabilities?.damage || [];
  if (vulnerabilities.length) {
    const contribution = vulnerabilities.length * VULNERABILITY_COST;
    modifierCost += contribution;
    reasons.push(`Damage vulnerabilities: ${vulnerabilities.join(', ')} (${vulnerabilities.length} × ${VULNERABILITY_COST}) = ${contribution.toFixed(1)}`);
  }

  const condImmunities = effects.immunities?.condition || [];
  if (condImmunities.length) {
    const contribution = condImmunities.length * CONDITION_IMMUNITY_COST;
    modifierCost += contribution;
    reasons.push(`Condition immunities: ${condImmunities.join(', ')} (${condImmunities.length} × ${CONDITION_IMMUNITY_COST}) = ${contribution.toFixed(1)}`);
  }

  const condResistances = effects.resistances?.condition || [];
  if (condResistances.length) {
    const contribution = condResistances.length * CONDITION_RESISTANCE_COST;
    modifierCost += contribution;
    reasons.push(`Condition resistances: ${condResistances.join(', ')} (${condResistances.length} × ${CONDITION_RESISTANCE_COST}) = ${contribution.toFixed(1)}`);
  }

  if (resistances.length > MAX_RESISTANCES_WITHOUT_FLAG && vulnerabilities.length === 0) {
    flags.push(`${resistances.length} damage resistances with no vulnerabilities — consider adding vulnerabilities`);
  }

  return { modifierCost, reasons, flags };
}

// ---- Main evaluation ----
function evaluateFeature(feature) {
  const { damageCost, conditionCost, reasons: actionReasons, flags: actionFlags } = scoreDamageAndConditions(feature);
  const { modifierCost, reasons: modReasons, flags: modFlags } = scoreModifiers(feature);
  const reactionTax = feature.isReaction ? REACTION_TAX : 0;

  const computed = damageCost + conditionCost + modifierCost + reactionTax;
  const stored = feature.featureCost ?? 0;
  const delta = computed - stored;
  const allFlags = [...actionFlags, ...modFlags];
  const allReasons = [...actionReasons, ...modReasons];
  if (reactionTax) allReasons.push(`Reaction tax: +${REACTION_TAX}`);

  let status;
  if (allFlags.some(f => f.includes('review'))) status = 'FLAG';
  else if (Math.abs(delta) <= 0.5) status = 'OK';
  else if (delta > 0) status = 'UNDERPRICED';
  else status = 'OVERPRICED';

  return {
    id: feature.id,
    name: feature.name,
    type: feature.type,
    stored,
    computed: Math.round(computed * 10) / 10,
    delta: Math.round(delta * 10) / 10,
    status,
    breakdown: { damageCost, conditionCost, modifierCost, reactionTax },
    reasons: allReasons,
    flags: allFlags,
    feature, // full original feature for editing
  };
}

// ---- Run ----
const results = features.map(evaluateFeature);
results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));

const counts = { OK: 0, UNDERPRICED: 0, OVERPRICED: 0, FLAG: 0 };
for (const r of results) counts[r.status]++;

// ---- Console summary ----
console.log('\n=== FEATURE COST EVALUATION REPORT ===');
console.log(`Total: ${results.length}  OK: ${counts.OK}  UNDERPRICED: ${counts.UNDERPRICED}  OVERPRICED: ${counts.OVERPRICED}  FLAG: ${counts.FLAG}`);

// ---- HTML report ----
const htmlPath = join(__dirname, 'evaluateFeatures-report.html');
writeFileSync(htmlPath, buildHtml(results));
console.log(`HTML report: ${htmlPath}\n`);

function buildHtml(results) {
  // Embed data for the editor panel — strip the circular `feature` ref cleanly
  const tableData = results.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    stored: r.stored,
    computed: r.computed,
    delta: r.delta,
    status: r.status,
    breakdown: r.breakdown,
    reasons: r.reasons,
    flags: r.flags,
    feature: r.feature,
  }));

  const rows = results.map((r, i) => {
    const bd = r.breakdown;
    const breakdownStr = `dmg ${bd.damageCost} / cond ${bd.conditionCost.toFixed(1)} / mod ${bd.modifierCost.toFixed(1)} / rxn ${bd.reactionTax}`;
    const flagsHtml = r.flags.map(f => `<span class="flag">⚑ ${f}</span>`).join('');
    const deltaStr = (r.delta >= 0 ? '+' : '') + r.delta;
    return `<tr class="status-${r.status.toLowerCase()}" data-idx="${i}" data-status="${r.status}" data-delta="${Math.abs(r.delta)}" data-name="${r.name.replace(/"/g, '&quot;')}">
      <td>${r.name}</td>
      <td class="mono small">${r.id}</td>
      <td class="small">${r.type}</td>
      <td class="center"><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
      <td class="center mono" id="stored-${i}">${r.stored}</td>
      <td class="center mono">${r.computed}</td>
      <td class="center mono ${r.delta > 0 ? 'pos' : r.delta < 0 ? 'neg' : ''}" id="delta-${i}">${deltaStr}</td>
      <td class="small">${breakdownStr}${flagsHtml ? '<br>' + flagsHtml : ''}</td>
    </tr>`;
  }).join('\n');

  const summary = `OK: ${counts.OK} &nbsp;|&nbsp; UNDERPRICED: ${counts.UNDERPRICED} &nbsp;|&nbsp; OVERPRICED: ${counts.OVERPRICED} &nbsp;|&nbsp; FLAG: ${counts.FLAG}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Feature Cost Evaluation</title>
<style>
  :root {
    --bg: #12131a; --surface: #1c1e2a; --surface2: #252840; --surface3: #2e3150;
    --border: #333655;
    --text: #e0e0e0; --muted: #777; --subtle: #555;
    --ok: #4caf50; --under: #ff9800; --over: #2196f3; --flag: #f44336;
    --ok-bg: #162318; --under-bg: #2e1e00; --over-bg: #0c2035; --flag-bg: #2e0d0d;
    --panel-w: 480px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  #topbar { padding: 16px 20px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; display: flex; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
  h1 { font-size: 17px; margin-bottom: 2px; }
  .summary { color: var(--muted); font-size: 12px; }
  .controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  label { font-size: 11px; color: var(--muted); display: block; margin-bottom: 3px; }
  input[type=text] { background: var(--surface2); border: 1px solid var(--border); color: var(--text); padding: 5px 9px; border-radius: 4px; font-size: 13px; width: 200px; }
  .filter-btns { display: flex; gap: 4px; }
  .filter-btns button { padding: 4px 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface2); color: var(--muted); cursor: pointer; font-size: 12px; }
  .filter-btns button.active { color: var(--text); border-color: #8888bb; background: var(--surface3); }
  .btn-download { padding: 6px 14px; border: 1px solid #4caf50; border-radius: 4px; background: #162318; color: #4caf50; cursor: pointer; font-size: 12px; font-weight: 600; }
  .btn-download:hover { background: #1e3320; }
  #main { display: flex; flex: 1; overflow: hidden; }
  #table-wrap { flex: 1; overflow-y: auto; }
  .count { font-size: 11px; color: var(--muted); padding: 6px 16px 4px; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: var(--surface2); position: sticky; top: 0; z-index: 2; }
  th { padding: 8px 12px; text-align: left; font-size: 11px; color: var(--muted); cursor: pointer; user-select: none; white-space: nowrap; border-bottom: 1px solid var(--border); }
  th:hover { color: var(--text); }
  th.sorted-asc::after { content: ' ↑'; color: var(--text); }
  th.sorted-desc::after { content: ' ↓'; color: var(--text); }
  td { padding: 7px 12px; border-bottom: 1px solid #1a1b26; vertical-align: top; }
  tbody tr { cursor: pointer; transition: filter 0.1s; }
  tbody tr:hover { filter: brightness(1.25); }
  tbody tr.selected { outline: 2px solid #6666cc; outline-offset: -2px; }
  tr.status-underpriced td { background: var(--under-bg); }
  tr.status-overpriced td { background: var(--over-bg); }
  tr.status-flag td { background: var(--flag-bg); }
  .badge { padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.3px; }
  .badge-ok { background: var(--ok-bg); color: var(--ok); border: 1px solid #2a5e2e; }
  .badge-underpriced { background: var(--under-bg); color: var(--under); border: 1px solid #5e3a00; }
  .badge-overpriced { background: var(--over-bg); color: var(--over); border: 1px solid #1a4060; }
  .badge-flag { background: var(--flag-bg); color: var(--flag); border: 1px solid #5e1a1a; }
  .mono { font-family: monospace; }
  .small { font-size: 12px; }
  .center { text-align: center; }
  .pos { color: var(--under); }
  .neg { color: var(--over); }
  .flag { color: var(--flag); font-size: 11px; display: inline-block; margin-top: 2px; }
  /* Detail panel */
  #panel { width: var(--panel-w); flex-shrink: 0; border-left: 1px solid var(--border); background: var(--surface); display: flex; flex-direction: column; overflow: hidden; transition: width 0.2s; }
  #panel.hidden { width: 0; border-left: none; overflow: hidden; }
  #panel-inner { padding: 16px; overflow-y: auto; flex: 1; }
  #panel h2 { font-size: 15px; margin-bottom: 2px; }
  #panel .panel-meta { font-size: 11px; color: var(--muted); margin-bottom: 14px; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: var(--muted); text-transform: uppercase; margin-bottom: 6px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  .reason { font-size: 12px; color: var(--text); padding: 3px 0; border-bottom: 1px solid #1e2030; line-height: 1.5; }
  .reason.flag-item { color: var(--flag); }
  .reason.zero { color: var(--subtle); }
  .edit-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .edit-row label { font-size: 12px; color: var(--muted); min-width: 110px; margin: 0; }
  .edit-row input[type=number], .edit-row input[type=text], .edit-row textarea { background: var(--surface2); border: 1px solid var(--border); color: var(--text); padding: 5px 8px; border-radius: 4px; font-size: 13px; }
  .edit-row input[type=number] { width: 80px; }
  .edit-row input[type=text] { flex: 1; }
  textarea#editDesc { background: var(--surface2); border: 1px solid var(--border); color: var(--text); padding: 6px 8px; border-radius: 4px; font-size: 12px; width: 100%; min-height: 70px; resize: vertical; }
  .panel-actions { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); flex-shrink: 0; }
  .btn { padding: 7px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; border: 1px solid; }
  .btn-apply { background: #1a2e40; border-color: var(--over); color: var(--over); }
  .btn-apply:hover { background: #1e3850; }
  .btn-cancel { background: var(--surface2); border-color: var(--border); color: var(--muted); }
  .btn-cancel:hover { color: var(--text); }
  #json-block { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 10px; font-family: monospace; font-size: 11px; white-space: pre-wrap; color: #aaa; max-height: 300px; overflow-y: auto; }
  .hidden { display: none !important; }
  .changed-mark { color: var(--under); font-size: 10px; margin-left: 4px; }
</style>
</head>
<body>
<div id="topbar">
  <div>
    <h1>Feature Cost Evaluation</h1>
    <div class="summary">${results.length} features &nbsp;|&nbsp; ${summary}</div>
  </div>
  <div class="controls">
    <div>
      <label>Search</label>
      <input type="text" id="search" placeholder="Name or ID...">
    </div>
    <div>
      <label>Status</label>
      <div class="filter-btns">
        <button class="active" data-filter="all">All</button>
        <button data-filter="OK">OK</button>
        <button data-filter="UNDERPRICED">Underpriced</button>
        <button data-filter="OVERPRICED">Overpriced</button>
        <button data-filter="FLAG">Flag</button>
      </div>
    </div>
    <div style="margin-top:14px">
      <button class="btn-download" onclick="downloadJson()">⬇ Download features.json</button>
    </div>
  </div>
</div>
<div id="main">
  <div id="table-wrap">
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
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div id="panel" class="hidden">
    <div id="panel-inner">
      <h2 id="panel-name"></h2>
      <div class="panel-meta" id="panel-meta"></div>
      <div class="section" id="section-flags" style="display:none">
        <div class="section-title">Design Flags</div>
        <div id="panel-flags"></div>
      </div>
      <div class="section">
        <div class="section-title">Score Breakdown</div>
        <div id="panel-reasons"></div>
      </div>
      <div class="section">
        <div class="section-title">Edit</div>
        <div class="edit-row">
          <label>featureCost</label>
          <input type="number" id="editCost" min="0" step="1">
        </div>
        <div class="edit-row" style="align-items:flex-start">
          <label style="padding-top:4px">featureDescription</label>
          <textarea id="editDesc"></textarea>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Raw JSON</div>
        <div id="json-block"></div>
      </div>
    </div>
    <div class="panel-actions">
      <button class="btn btn-apply" onclick="applyEdit()">Apply changes</button>
      <button class="btn btn-cancel" onclick="closePanel()">Close</button>
    </div>
  </div>
</div>
<script>
const DATA = ${JSON.stringify(tableData)};
// Mutable working copy of all features (for download)
const features = DATA.map(r => JSON.parse(JSON.stringify(r.feature)));
// Track which rows have been edited
const edited = new Set();

let sortCol = 'delta', sortDir = -1, filterStatus = 'all', searchStr = '';
let selectedIdx = null;

function val(row, col) {
  const d = DATA[parseInt(row.dataset.idx)];
  if (col === 'delta') return Math.abs(d.delta) * (d.delta >= 0 ? 1 : -1);
  if (col === 'stored') return parseFloat(document.getElementById('stored-' + row.dataset.idx)?.textContent ?? d.stored);
  if (col === 'computed') return d.computed;
  if (col === 'name') return d.name.toLowerCase();
  if (col === 'id') return d.id;
  if (col === 'type') return d.type;
  if (col === 'status') return d.status;
  return '';
}

function refresh() {
  const tbody = document.querySelector('#tbl tbody');
  const rows = [...tbody.querySelectorAll('tr')];
  rows.forEach(r => {
    const d = DATA[parseInt(r.dataset.idx)];
    const statusMatch = filterStatus === 'all' || r.dataset.status === filterStatus;
    const name = d.name.toLowerCase(), id = d.id.toLowerCase();
    const searchMatch = !searchStr || name.includes(searchStr) || id.includes(searchStr);
    r.classList.toggle('hidden', !statusMatch || !searchMatch);
  });
  const visible = rows.filter(r => !r.classList.contains('hidden'));
  visible.sort((a, b) => {
    const av = val(a, sortCol), bv = val(b, sortCol);
    if (sortCol === 'delta') return (Math.abs(bv) - Math.abs(av)) * sortDir * -1 || 0;
    return typeof av === 'string' ? av.localeCompare(bv) * sortDir : (av - bv) * sortDir;
  });
  visible.forEach(r => tbody.appendChild(r));
  document.getElementById('rowCount').textContent = visible.length + ' of ' + rows.length + ' features shown';
}

// Sorting
document.querySelectorAll('th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    sortDir = sortCol === col ? sortDir * -1 : -1;
    sortCol = col;
    document.querySelectorAll('th').forEach(t => t.classList.remove('sorted-asc', 'sorted-desc'));
    th.classList.add(sortDir === -1 ? 'sorted-desc' : 'sorted-asc');
    refresh();
  });
});

// Filters
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

// Row click — open panel
document.querySelector('#tbl tbody').addEventListener('click', e => {
  const row = e.target.closest('tr');
  if (!row) return;
  const idx = parseInt(row.dataset.idx);
  if (selectedIdx === idx) { closePanel(); return; }
  openPanel(idx);
  document.querySelectorAll('#tbl tbody tr').forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');
  selectedIdx = idx;
});

function openPanel(idx) {
  const d = DATA[idx];
  const f = features[idx];
  document.getElementById('panel-name').textContent = d.name;
  document.getElementById('panel-meta').textContent = 'ID: ' + d.id + '  |  Type: ' + d.type + '  |  Computed: ' + d.computed + '  |  Stored: ' + d.stored;

  // Flags
  const flagsEl = document.getElementById('panel-flags');
  const secFlags = document.getElementById('section-flags');
  if (d.flags.length) {
    flagsEl.innerHTML = d.flags.map(f => '<div class="reason flag-item">⚑ ' + esc(f) + '</div>').join('');
    secFlags.style.display = '';
  } else {
    secFlags.style.display = 'none';
  }

  // Reasons
  const reasonsEl = document.getElementById('panel-reasons');
  if (d.reasons.length) {
    reasonsEl.innerHTML = d.reasons.map(r => {
      const isZero = r.includes('= 0') || r.includes('free baseline');
      return '<div class="reason' + (isZero ? ' zero' : '') + '">' + esc(r) + '</div>';
    }).join('');
  } else {
    reasonsEl.innerHTML = '<div class="reason zero">No mechanical components detected (passive/text feature)</div>';
  }

  // Edit fields — use live feature data
  document.getElementById('editCost').value = f.featureCost ?? 0;
  document.getElementById('editDesc').value = f.featureDescription ?? '';

  // JSON
  document.getElementById('json-block').textContent = JSON.stringify(f, null, 2);

  document.getElementById('panel').classList.remove('hidden');
  selectedIdx = idx;
}

function closePanel() {
  document.getElementById('panel').classList.add('hidden');
  document.querySelectorAll('#tbl tbody tr').forEach(r => r.classList.remove('selected'));
  selectedIdx = null;
}

function applyEdit() {
  if (selectedIdx == null) return;
  const newCost = parseFloat(document.getElementById('editCost').value);
  const newDesc = document.getElementById('editDesc').value.trim();

  // Update working features copy
  features[selectedIdx].featureCost = newCost;
  features[selectedIdx].featureDescription = newDesc;

  // Update DATA stored value for display
  DATA[selectedIdx].stored = newCost;

  // Update table cell
  const storedCell = document.getElementById('stored-' + selectedIdx);
  if (storedCell) {
    storedCell.textContent = newCost;
    if (!storedCell.querySelector('.changed-mark')) {
      storedCell.insertAdjacentHTML('beforeend', '<span class="changed-mark">✎</span>');
    }
  }

  // Update delta cell
  const deltaCell = document.getElementById('delta-' + selectedIdx);
  const newDelta = DATA[selectedIdx].computed - newCost;
  if (deltaCell) {
    deltaCell.textContent = (newDelta >= 0 ? '+' : '') + Math.round(newDelta * 10) / 10;
    deltaCell.className = 'center mono ' + (newDelta > 0 ? 'pos' : newDelta < 0 ? 'neg' : '');
  }

  // Update JSON preview
  document.getElementById('json-block').textContent = JSON.stringify(features[selectedIdx], null, 2);

  // Update panel meta
  document.getElementById('panel-meta').textContent = 'ID: ' + DATA[selectedIdx].id + '  |  Type: ' + DATA[selectedIdx].type + '  |  Computed: ' + DATA[selectedIdx].computed + '  |  Stored: ' + newCost;

  edited.add(selectedIdx);
}

function downloadJson() {
  const json = JSON.stringify(features, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'features.json';
  a.click();
  URL.revokeObjectURL(url);
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

refresh();
</script>
</body>
</html>`;
}

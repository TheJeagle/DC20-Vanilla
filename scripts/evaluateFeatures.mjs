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
    const statusLc = r.status.toLowerCase();
    return `<tr class="status-${statusLc}" data-idx="${i}" data-status="${r.status}" data-name="${r.name.replace(/"/g, '&quot;')}">
      <td>${r.name}</td>
      <td class="mono small">${r.id}</td>
      <td class="small">${r.type}</td>
      <td class="center"><span class="badge badge-${statusLc}" id="badge-${i}">${r.status}</span></td>
      <td class="center mono" id="stored-${i}">${r.stored}</td>
      <td class="center mono" id="computed-${i}">${r.computed}</td>
      <td class="center mono ${r.delta > 0 ? 'pos' : r.delta < 0 ? 'neg' : ''}" id="delta-${i}">${deltaStr}</td>
      <td class="small" id="breakdown-${i}">${breakdownStr}${flagsHtml ? '<br>' + flagsHtml : ''}</td>
    </tr>`;
  }).join('\n');

  const summary = `OK: ${counts.OK} &nbsp;|&nbsp; UNDERPRICED: ${counts.UNDERPRICED} &nbsp;|&nbsp; OVERPRICED: ${counts.OVERPRICED} &nbsp;|&nbsp; FLAG: ${counts.FLAG}`;

  // Scoring constants — injected verbatim so browser JS can recalculate
  const CONSTANTS_JS = `
const DAMAGE_PER_MODIFIER = ${DAMAGE_PER_MODIFIER};
const DURATION_FACTORS = ${JSON.stringify(DURATION_FACTORS)};
const SAVE_FACTORS = ${JSON.stringify(SAVE_FACTORS)};
const CONDITION_BASE_VALUES = ${JSON.stringify(CONDITION_BASE_VALUES)};
const MODIFIER_SCALES = ${JSON.stringify(MODIFIER_SCALES)};
const RESISTANCE_COST = ${RESISTANCE_COST};
const IMMUNITY_COST = ${IMMUNITY_COST};
const VULNERABILITY_COST = ${VULNERABILITY_COST};
const CONDITION_IMMUNITY_COST = ${CONDITION_IMMUNITY_COST};
const CONDITION_RESISTANCE_COST = ${CONDITION_RESISTANCE_COST};
const REACTION_TAX = ${REACTION_TAX};
const MAX_RESISTANCES_WITHOUT_FLAG = ${MAX_RESISTANCES_WITHOUT_FLAG};
const CONDITION_NAMES = Object.keys(CONDITION_BASE_VALUES);
`;

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
    --panel-w: 520px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  #topbar { padding: 14px 20px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; display: flex; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
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
  /* Panel */
  #panel { width: var(--panel-w); flex-shrink: 0; border-left: 1px solid var(--border); background: var(--surface); display: flex; flex-direction: column; overflow: hidden; }
  #panel.hidden { width: 0; border-left: none; }
  #panel-inner { padding: 14px 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 14px; }
  #panel h2 { font-size: 15px; }
  .panel-meta { font-size: 11px; color: var(--muted); }
  .panel-score { font-size: 13px; font-weight: 600; }
  .section-title { font-size: 10px; font-weight: 700; letter-spacing: 0.6px; color: var(--muted); text-transform: uppercase; margin-bottom: 5px; border-bottom: 1px solid var(--border); padding-bottom: 3px; }
  .reason { font-size: 12px; color: var(--text); padding: 3px 0; border-bottom: 1px solid #1e2030; line-height: 1.5; }
  .reason.flag-item { color: var(--flag); }
  .reason.zero { color: var(--subtle); }
  #json-editor { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 10px; font-family: monospace; font-size: 11px; color: #ccc; width: 100%; min-height: 260px; resize: vertical; line-height: 1.5; }
  #json-editor.error { border-color: var(--flag); }
  #parse-error { color: var(--flag); font-size: 11px; min-height: 16px; }
  .panel-actions { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border); flex-shrink: 0; }
  .btn { padding: 7px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; border: 1px solid; }
  .btn-recalc { background: #1e2e1e; border-color: var(--ok); color: var(--ok); }
  .btn-recalc:hover { background: #243e24; }
  .btn-close { background: var(--surface2); border-color: var(--border); color: var(--muted); }
  .btn-close:hover { color: var(--text); }
  .changed-mark { color: var(--under); font-size: 10px; margin-left: 4px; }
  [hidden] { display: none !important; }
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
      <thead><tr>
        <th data-col="name">Name</th>
        <th data-col="id">ID</th>
        <th data-col="type">Type</th>
        <th data-col="status" class="center">Status</th>
        <th data-col="stored" class="center">Stored</th>
        <th data-col="computed" class="center">Computed</th>
        <th data-col="delta" class="center sorted-desc">Delta</th>
        <th>Breakdown / Flags</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div id="panel" class="hidden">
    <div id="panel-inner">
      <div>
        <h2 id="panel-name"></h2>
        <div class="panel-meta" id="panel-meta"></div>
        <div class="panel-score" id="panel-score"></div>
      </div>
      <div id="section-flags" hidden>
        <div class="section-title">Design Flags</div>
        <div id="panel-flags"></div>
      </div>
      <div>
        <div class="section-title">Score Breakdown</div>
        <div id="panel-reasons"></div>
      </div>
      <div>
        <div class="section-title">Edit JSON — change any field, then Recalculate</div>
        <textarea id="json-editor" spellcheck="false"></textarea>
        <div id="parse-error"></div>
      </div>
    </div>
    <div class="panel-actions">
      <button class="btn btn-recalc" onclick="recalculate()">⟳ Recalculate &amp; Apply</button>
      <button class="btn btn-close" onclick="closePanel()">Close</button>
    </div>
  </div>
</div>

<script>
${CONSTANTS_JS}

// ---- Scoring functions (mirrored from evaluateFeatures.mjs) ----
function detectConditions(text) {
  if (!text) return [];
  const found = [];
  for (const name of CONDITION_NAMES) {
    const regex = new RegExp('\\\\b' + name + '(?:\\\\s+(\\\\d+))?\\\\b', 'i');
    const match = text.match(regex);
    if (match) found.push({ name, stacks: match[1] ? parseInt(match[1], 10) : 1 });
  }
  return found;
}

function getDurationKey(save) {
  const duration = (save.duration || '').trim();
  if (!duration) return '';
  if (duration === 'until the end of its next turn') return 'until the end of its next turn';
  if (duration === 'until the end of your next turn') return 'until the end of your next turn';
  if (duration === 'for 1 minute') return save.repeatable ? 'for 1 minute (repeatable)' : 'for 1 minute';
  if (duration === 'until removed') {
    const easy = ['Prone','Bleeding','Burning','Grappled'];
    return easy.some(c => (save.failure||'').includes(c)) ? 'until removed (ap)' : 'until removed';
  }
  if (/short rest/i.test(duration)) return 'until end of short rest';
  if (/long rest/i.test(duration)) return 'until end of long rest';
  return 'for 1 minute (repeatable)';
}

function scoreSaveBlock(save, label) {
  if (!save) return { cost: 0, reasons: [] };
  const durationKey = getDurationKey(save);
  const durationFactor = DURATION_FACTORS[durationKey] ?? 1.0;
  const saveKey = save?.attribute || 'none';
  const saveFactor = SAVE_FACTORS[saveKey] ?? SAVE_FACTORS.none;
  const conditions = detectConditions(save.failure || '');
  const reasons = [];
  let cost = 0;
  if (conditions.length === 0 && save.failure) {
    reasons.push(label + ': failure "' + save.failure.slice(0,60) + '" — no recognised condition (scores 0)');
  }
  for (const { name, stacks } of conditions) {
    const baseValue = CONDITION_BASE_VALUES[name] ?? 0;
    const c = baseValue * stacks * durationFactor * saveFactor;
    cost += c;
    reasons.push(label + ': ' + name + (stacks > 1 ? ' ×' + stacks : '') + ' (base ' + baseValue + ') × "' + (durationKey||'instant') + '" (' + durationFactor + ') × save ' + saveKey + ' (' + saveFactor + ') = ' + c.toFixed(2));
  }
  return { cost, reasons };
}

function scoreDamageSegments(segments, aoe, label) {
  if (!segments || !segments.length) return { cost: 0, reasons: [] };
  const baseline = aoe ? -1 : 0;
  const baselineLabel = aoe ? 'AoE baseline −1' : 'single-target baseline 0';
  let cost = 0;
  const reasons = [];
  for (const seg of segments) {
    if (seg.useBase !== false && seg.amount == null) {
      const modifier = seg.modifier ?? 0;
      const c = (modifier - baseline) * DAMAGE_PER_MODIFIER;
      cost += c;
      if (c !== 0) reasons.push(label + ': ' + seg.type + ' modifier ' + (modifier>=0?'+':'') + modifier + ' vs ' + baselineLabel + ' → (' + modifier + ' − ' + baseline + ') × ' + DAMAGE_PER_MODIFIER + ' = ' + c.toFixed(1));
      else reasons.push(label + ': ' + seg.type + ' modifier ' + modifier + ' = free baseline (0)');
    } else if (seg.amount != null) {
      const c = seg.amount * DAMAGE_PER_MODIFIER;
      cost += c;
      reasons.push(label + ': flat ' + seg.amount + ' ' + seg.type + ' × ' + DAMAGE_PER_MODIFIER + ' = ' + c.toFixed(1));
    }
  }
  return { cost, reasons };
}

function checkApFlags(effects, actionType) {
  const flags = [];
  const ap = effects.cost;
  const aoe = actionType && actionType.includes('Area');
  if (ap >= 4) flags.push(ap + ' AP action — needs individual review');
  if (!aoe && effects.targetDefense && ap >= 2 && !effects.save) {
    const segs = effects.damageSegments || [];
    if (segs.every(s => s.useBase !== false && s.amount == null && (s.modifier ?? 0) === 0))
      flags.push(ap + ' AP single-target vs ' + effects.targetDefense + ', only base damage, no condition — consider reducing to 1 AP');
  }
  if (aoe) {
    for (const seg of (effects.damageSegments || []))
      if (seg.useBase !== false && seg.amount == null && (seg.modifier ?? 0) < -1)
        flags.push('AoE damage modifier ' + seg.modifier + ' is below AoE baseline of −1 — design error');
  }
  return flags;
}

function scoreFeature(feature) {
  const effects = feature.effects || {};
  const actionType = feature.actionType || '';
  const aoe = actionType.includes('Area');
  let damageCost = 0, conditionCost = 0, modifierCost = 0;
  const reasons = [], flags = [];

  if (effects.cost != null) {
    const dmg = scoreDamageSegments(effects.damageSegments, aoe, 'Main action');
    damageCost += dmg.cost; reasons.push(...dmg.reasons);
    const cond = scoreSaveBlock(effects.save, 'Main save');
    conditionCost += cond.cost; reasons.push(...cond.reasons);
    flags.push(...checkApFlags(effects, actionType));
    for (const enh of (effects.enhancements || [])) {
      const label = 'Enhancement "' + enh.name + '"';
      const ed = scoreDamageSegments(enh.damageSegments, aoe, label + ' damage');
      damageCost += ed.cost; reasons.push(...ed.reasons);
      const ec = scoreSaveBlock(enh.save, label + ' save');
      conditionCost += ec.cost; reasons.push(...ec.reasons);
    }
  }

  // Modifiers
  for (const [stat, scale] of Object.entries(MODIFIER_SCALES)) {
    const v = effects[stat];
    if (v) { const c = v * scale; modifierCost += c; reasons.push(stat + ': ' + (v>0?'+':'') + v + ' × ' + scale + ' = ' + c.toFixed(1)); }
  }
  const res = effects.resistances?.damage || [];
  if (res.length) { const c = res.length * RESISTANCE_COST; modifierCost += c; reasons.push('Damage resistances: ' + res.join(', ') + ' (' + res.length + ' × ' + RESISTANCE_COST + ') = ' + c.toFixed(1)); }
  const imm = effects.immunities?.damage || [];
  if (imm.length) { const c = imm.length * IMMUNITY_COST; modifierCost += c; reasons.push('Damage immunities: ' + imm.join(', ') + ' (' + imm.length + ' × ' + IMMUNITY_COST + ') = ' + c.toFixed(1)); }
  const vul = effects.vulnerabilities?.damage || [];
  if (vul.length) { const c = vul.length * VULNERABILITY_COST; modifierCost += c; reasons.push('Damage vulnerabilities: ' + vul.join(', ') + ' (' + vul.length + ' × ' + VULNERABILITY_COST + ') = ' + c.toFixed(1)); }
  const ci = effects.immunities?.condition || [];
  if (ci.length) { const c = ci.length * CONDITION_IMMUNITY_COST; modifierCost += c; reasons.push('Condition immunities: ' + ci.join(', ') + ' (' + ci.length + ' × ' + CONDITION_IMMUNITY_COST + ') = ' + c.toFixed(1)); }
  const cr = effects.resistances?.condition || [];
  if (cr.length) { const c = cr.length * CONDITION_RESISTANCE_COST; modifierCost += c; reasons.push('Condition resistances: ' + cr.join(', ') + ' (' + cr.length + ' × ' + CONDITION_RESISTANCE_COST + ') = ' + c.toFixed(1)); }
  if (res.length > MAX_RESISTANCES_WITHOUT_FLAG && vul.length === 0)
    flags.push(res.length + ' damage resistances with no vulnerabilities — consider adding vulnerabilities');

  const reactionTax = feature.isReaction ? REACTION_TAX : 0;
  if (reactionTax) reasons.push('Reaction tax: +' + REACTION_TAX);

  const computed = Math.round((damageCost + conditionCost + modifierCost + reactionTax) * 10) / 10;
  const stored = feature.featureCost ?? 0;
  const delta = Math.round((computed - stored) * 10) / 10;
  let status;
  if (flags.some(f => f.includes('review'))) status = 'FLAG';
  else if (Math.abs(delta) <= 0.5) status = 'OK';
  else if (delta > 0) status = 'UNDERPRICED';
  else status = 'OVERPRICED';

  return { computed, stored, delta, status, breakdown: { damageCost, conditionCost, modifierCost, reactionTax }, reasons, flags };
}

// ---- Table state ----
const DATA = ${JSON.stringify(tableData)};
const features = DATA.map(r => JSON.parse(JSON.stringify(r.feature)));
let sortCol = 'delta', sortDir = -1, filterStatus = 'all', searchStr = '';
let selectedIdx = null;

function getStored(idx) { return parseFloat(document.getElementById('stored-' + idx)?.textContent ?? DATA[idx].stored); }
function getComputed(idx) { return parseFloat(document.getElementById('computed-' + idx)?.textContent ?? DATA[idx].computed); }

function refresh() {
  const tbody = document.querySelector('#tbl tbody');
  const rows = [...tbody.querySelectorAll('tr')];
  rows.forEach(r => {
    const d = DATA[parseInt(r.dataset.idx)];
    const statusMatch = filterStatus === 'all' || r.dataset.status === filterStatus;
    const s = searchStr;
    const searchMatch = !s || d.name.toLowerCase().includes(s) || d.id.toLowerCase().includes(s);
    r.classList.toggle('hidden', !statusMatch || !searchMatch);
  });
  const visible = rows.filter(r => !r.classList.contains('hidden'));
  visible.sort((a, b) => {
    const ia = parseInt(a.dataset.idx), ib = parseInt(b.dataset.idx);
    let av, bv;
    if (sortCol === 'delta') { av = Math.abs(getStored(ia) - getComputed(ia)); bv = Math.abs(getStored(ib) - getComputed(ib)); }
    else if (sortCol === 'stored') { av = getStored(ia); bv = getStored(ib); }
    else if (sortCol === 'computed') { av = getComputed(ia); bv = getComputed(ib); }
    else if (sortCol === 'name') { av = DATA[ia].name.toLowerCase(); bv = DATA[ib].name.toLowerCase(); }
    else if (sortCol === 'id') { av = DATA[ia].id; bv = DATA[ib].id; }
    else if (sortCol === 'type') { av = DATA[ia].type; bv = DATA[ib].type; }
    else if (sortCol === 'status') { av = a.dataset.status; bv = b.dataset.status; }
    else { av = 0; bv = 0; }
    return typeof av === 'string' ? av.localeCompare(bv) * sortDir : (av - bv) * sortDir;
  });
  visible.forEach(r => tbody.appendChild(r));
  document.getElementById('rowCount').textContent = visible.length + ' of ' + rows.length + ' features shown';
}

document.querySelectorAll('th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    sortDir = sortCol === th.dataset.col ? sortDir * -1 : -1;
    sortCol = th.dataset.col;
    document.querySelectorAll('th').forEach(t => t.classList.remove('sorted-asc','sorted-desc'));
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

// ---- Panel ----
document.querySelector('#tbl tbody').addEventListener('click', e => {
  const row = e.target.closest('tr');
  if (!row) return;
  const idx = parseInt(row.dataset.idx);
  if (selectedIdx === idx) { closePanel(); return; }
  document.querySelectorAll('#tbl tbody tr').forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');
  openPanel(idx);
});

function openPanel(idx) {
  selectedIdx = idx;
  const d = DATA[idx];
  document.getElementById('panel-name').textContent = d.name;
  document.getElementById('panel-meta').textContent = 'ID: ' + d.id + '  |  Type: ' + d.type;
  renderScore(d.computed, d.stored, d.delta, d.status);
  renderBreakdown(d.reasons, d.flags);
  document.getElementById('json-editor').value = JSON.stringify(features[idx], null, 2);
  document.getElementById('parse-error').textContent = '';
  document.getElementById('json-editor').classList.remove('error');
  document.getElementById('panel').classList.remove('hidden');
}

function renderScore(computed, stored, delta, status) {
  const colors = { OK: '#4caf50', UNDERPRICED: '#ff9800', OVERPRICED: '#2196f3', FLAG: '#f44336' };
  const sign = delta >= 0 ? '+' : '';
  document.getElementById('panel-score').innerHTML =
    'Computed: <b>' + computed + '</b> &nbsp; Stored: <b>' + stored + '</b> &nbsp; Delta: <b style="color:' + (colors[status]||'#aaa') + '">' + sign + delta + '</b> &nbsp; <span class="badge badge-' + status.toLowerCase() + '">' + status + '</span>';
}

function renderBreakdown(reasons, flags) {
  const flagsEl = document.getElementById('panel-flags');
  const secFlags = document.getElementById('section-flags');
  if (flags.length) {
    flagsEl.innerHTML = flags.map(f => '<div class="reason flag-item">⚑ ' + esc(f) + '</div>').join('');
    secFlags.hidden = false;
  } else { secFlags.hidden = true; }
  const reasonsEl = document.getElementById('panel-reasons');
  if (reasons.length) {
    reasonsEl.innerHTML = reasons.map(r => {
      const zero = r.includes('= 0') || r.includes('free baseline') || r.includes('scores 0)');
      return '<div class="reason' + (zero ? ' zero' : '') + '">' + esc(r) + '</div>';
    }).join('');
  } else {
    reasonsEl.innerHTML = '<div class="reason zero">No mechanical components detected (passive/text feature)</div>';
  }
}

function closePanel() {
  document.getElementById('panel').classList.add('hidden');
  document.querySelectorAll('#tbl tbody tr').forEach(r => r.classList.remove('selected'));
  selectedIdx = null;
}

function recalculate() {
  if (selectedIdx == null) return;
  const editor = document.getElementById('json-editor');
  const errEl = document.getElementById('parse-error');
  let parsed;
  try {
    parsed = JSON.parse(editor.value);
    editor.classList.remove('error');
    errEl.textContent = '';
  } catch (e) {
    editor.classList.add('error');
    errEl.textContent = 'JSON parse error: ' + e.message;
    return;
  }

  // Store updated feature
  features[selectedIdx] = parsed;

  // Rescore
  const result = scoreFeature(parsed);

  // Update panel header/score/breakdown
  document.getElementById('panel-name').textContent = parsed.name || DATA[selectedIdx].name;
  document.getElementById('panel-meta').textContent = 'ID: ' + (parsed.id || DATA[selectedIdx].id) + '  |  Type: ' + (parsed.type || DATA[selectedIdx].type);
  renderScore(result.computed, result.stored, result.delta, result.status);
  renderBreakdown(result.reasons, result.flags);

  // Update table row
  const idx = selectedIdx;
  const row = document.querySelector('[data-idx="' + idx + '"]');
  if (row) {
    // Status class
    row.className = row.className.replace(/status-\\S+/, 'status-' + result.status.toLowerCase());
    row.dataset.status = result.status;
    // Badge
    const badge = document.getElementById('badge-' + idx);
    if (badge) { badge.textContent = result.status; badge.className = 'badge badge-' + result.status.toLowerCase(); }
    // Stored
    const storedCell = document.getElementById('stored-' + idx);
    if (storedCell) {
      storedCell.textContent = result.stored;
      if (!storedCell.querySelector('.changed-mark')) storedCell.insertAdjacentHTML('beforeend', '<span class="changed-mark"> ✎</span>');
    }
    // Computed
    const computedCell = document.getElementById('computed-' + idx);
    if (computedCell) computedCell.textContent = result.computed;
    // Delta
    const deltaCell = document.getElementById('delta-' + idx);
    if (deltaCell) {
      deltaCell.textContent = (result.delta >= 0 ? '+' : '') + result.delta;
      deltaCell.className = 'center mono ' + (result.delta > 0 ? 'pos' : result.delta < 0 ? 'neg' : '');
    }
    // Breakdown cell
    const bd = result.breakdown;
    const bdCell = document.getElementById('breakdown-' + idx);
    if (bdCell) {
      const breakdownStr = 'dmg ' + bd.damageCost + ' / cond ' + bd.conditionCost.toFixed(1) + ' / mod ' + bd.modifierCost.toFixed(1) + ' / rxn ' + bd.reactionTax;
      const flagsHtml = result.flags.map(f => '<span class="flag">⚑ ' + esc(f) + '</span>').join('');
      bdCell.innerHTML = breakdownStr + (flagsHtml ? '<br>' + flagsHtml : '');
    }
  }

  // Update DATA for sort/filter
  DATA[idx].stored = result.stored;
  DATA[idx].computed = result.computed;
  DATA[idx].delta = result.delta;
  DATA[idx].status = result.status;
  DATA[idx].name = parsed.name || DATA[idx].name;
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(features, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'features.json'; a.click();
  URL.revokeObjectURL(url);
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

refresh();
</script>
</body>
</html>`;
}

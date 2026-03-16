#!/usr/bin/env node
/**
 * Feature power evaluator — local dev server.
 * Usage: node scripts/evaluateFeatures.mjs
 * Opens http://localhost:7799 — refresh to reload from disk, "Save" writes back.
 */

import { createServer } from 'http';
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
const PORT = 7799;
const HTML = buildHtml();

const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  } else if (req.method === 'GET' && req.url === '/api/features') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(readFileSync(featuresPath, 'utf8'));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
  } else if (req.method === 'POST' && req.url === '/api/features') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        writeFileSync(featuresPath, JSON.stringify(parsed, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        console.log('[saved] features.json (' + parsed.length + ' features)');
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, 'localhost', () => {
  console.log('\n  Feature Cost Evaluator  →  http://localhost:' + PORT + '\n');
  console.log('  Ctrl+C to stop.\n');
});

function buildHtml() {
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
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); font-size: 16px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  #topbar { padding: 14px 20px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; display: flex; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
  h1 { font-size: 17px; margin-bottom: 2px; }
  .summary { color: var(--muted); font-size: 13px; }
  .controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  label { font-size: 12px; color: var(--muted); display: block; margin-bottom: 3px; }
  input[type=text] { background: var(--surface2); border: 1px solid var(--border); color: var(--text); padding: 5px 9px; border-radius: 4px; font-size: 14px; width: 200px; }
  .filter-btns { display: flex; gap: 4px; }
  .filter-btns button { padding: 4px 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface2); color: var(--muted); cursor: pointer; font-size: 13px; }
  .filter-btns button.active { color: var(--text); border-color: #8888bb; background: var(--surface3); }
  .btn-save { padding: 6px 14px; border: 1px solid #7b9ae0; border-radius: 4px; background: #1e1e2e; color: #7b9ae0; cursor: pointer; font-size: 13px; font-weight: 600; }
  .btn-save:hover { background: #24243e; }
  .btn-download { padding: 6px 14px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface2); color: var(--muted); cursor: pointer; font-size: 13px; font-weight: 600; }
  .btn-download:hover { color: var(--text); }
  #main { display: flex; flex: 1; overflow: hidden; }
  #table-wrap { flex: 1; overflow-y: auto; }
  .count { font-size: 12px; color: var(--muted); padding: 6px 16px 4px; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: var(--surface2); position: sticky; top: 0; z-index: 2; }
  th { padding: 8px 12px; text-align: left; font-size: 12px; color: var(--muted); cursor: pointer; user-select: none; white-space: nowrap; border-bottom: 1px solid var(--border); }
  th:hover { color: var(--text); }
  th.sorted-asc::after { content: ' ↑'; color: var(--text); }
  th.sorted-desc::after { content: ' ↓'; color: var(--text); }
  td { padding: 8px 12px; border-bottom: 1px solid #1a1b26; vertical-align: top; }
  tbody tr { cursor: pointer; transition: filter 0.1s; }
  tbody tr:hover { filter: brightness(1.25); }
  tbody tr.selected { outline: 2px solid #6666cc; outline-offset: -2px; }
  tr.status-underpriced td { background: var(--under-bg); }
  tr.status-overpriced td { background: var(--over-bg); }
  tr.status-flag td { background: var(--flag-bg); }
  .badge { padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 700; letter-spacing: 0.3px; }
  .badge-ok { background: var(--ok-bg); color: var(--ok); border: 1px solid #2a5e2e; }
  .badge-underpriced { background: var(--under-bg); color: var(--under); border: 1px solid #5e3a00; }
  .badge-overpriced { background: var(--over-bg); color: var(--over); border: 1px solid #1a4060; }
  .badge-flag { background: var(--flag-bg); color: var(--flag); border: 1px solid #5e1a1a; }
  .mono { font-family: monospace; }
  .small { font-size: 13px; }
  .center { text-align: center; }
  .pos { color: var(--under); }
  .neg { color: var(--over); }
  .flag { color: var(--flag); font-size: 12px; display: inline-block; margin-top: 2px; }
  /* Panel */
  #panel { width: 660px; flex-shrink: 0; border-left: 1px solid var(--border); background: var(--surface); display: flex; flex-direction: column; overflow: hidden; }
  #panel.hidden { width: 0; border-left: none; }
  #panel-inner { padding: 14px 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 14px; }
  #panel h2 { font-size: 17px; }
  .panel-meta { font-size: 13px; color: var(--muted); }
  .panel-score { font-size: 15px; font-weight: 600; }
  .section-title { font-size: 11px; font-weight: 700; letter-spacing: 0.6px; color: var(--muted); text-transform: uppercase; margin-bottom: 5px; border-bottom: 1px solid var(--border); padding-bottom: 3px; }
  .reason { font-size: 13px; color: var(--text); padding: 3px 0; border-bottom: 1px solid #1e2030; line-height: 1.5; }
  .reason.flag-item { color: var(--flag); }
  .reason.zero { color: var(--subtle); }
  .panel-actions { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border); flex-shrink: 0; flex-wrap: wrap; }
  .btn { padding: 7px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; border: 1px solid; }
  .btn-recalc { background: #1e2e1e; border-color: var(--ok); color: var(--ok); }
  .btn-recalc:hover { background: #243e24; }
  .btn-accept { background: #1e1e2e; border-color: #7b9ae0; color: #7b9ae0; }
  .btn-accept:hover { background: #24243e; }
  .btn-close { background: var(--surface2); border-color: var(--border); color: var(--muted); }
  .btn-close:hover { color: var(--text); }
  .changed-mark { color: var(--under); font-size: 11px; margin-left: 4px; }
  /* Panel header */
  .panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .panel-nav { display: flex; gap: 4px; flex-shrink: 0; margin-top: 2px; }
  .nav-btn { padding: 3px 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface2); color: var(--muted); cursor: pointer; font-size: 14px; line-height: 1.4; }
  .nav-btn:hover { color: var(--text); border-color: #8888bb; }
  /* Form editor */
  .form-section { display: flex; flex-direction: column; gap: 6px; }
  .form-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); border-bottom: 1px solid var(--border); padding-bottom: 3px; margin-bottom: 2px; }
  .form-row { display: flex; align-items: center; gap: 8px; }
  .form-row.top-align { align-items: flex-start; }
  .form-label { font-size: 13px; color: var(--muted); white-space: nowrap; min-width: 108px; flex-shrink: 0; padding-top: 2px; }
  .form-input { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 5px 8px; font-size: 14px; flex: 1; min-width: 0; }
  .form-input-num { width: 72px !important; flex: none; }
  .form-select { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 5px 8px; font-size: 14px; flex: 1; cursor: pointer; }
  .form-textarea { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 5px 8px; font-size: 14px; flex: 1; resize: vertical; min-height: 52px; font-family: inherit; line-height: 1.4; }
  .form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: #7b9ae0; }
  .form-check { font-size: 14px; color: var(--text); display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .form-check input[type=checkbox] { width: 15px; height: 15px; cursor: pointer; flex-shrink: 0; }
  .form-mods-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .form-mod-item { display: flex; flex-direction: column; gap: 3px; }
  .form-mod-label { font-size: 12px; color: var(--muted); }
  .form-mod-item input { width: 100%; }
  .seg-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; }
  .seg-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .seg-type-input { flex: 1; min-width: 100px; }
  .enh-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
  .enh-header { display: flex; align-items: center; gap: 8px; }
  .enh-body { padding-left: 10px; border-left: 2px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
  .save-body { padding-left: 10px; border-left: 2px solid var(--border); margin-top: 4px; display: flex; flex-direction: column; gap: 6px; }
  .icon-btn { padding: 3px 9px; background: var(--surface3); border: 1px solid var(--border); border-radius: 4px; color: var(--muted); cursor: pointer; font-size: 14px; }
  .icon-btn:hover { color: var(--flag); border-color: var(--flag); }
  .form-add-btn { padding: 5px 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; color: var(--muted); cursor: pointer; font-size: 13px; align-self: flex-start; margin-top: 2px; }
  .form-add-btn:hover { color: var(--text); border-color: #8888bb; }
  .kbd-hint { font-size: 11px; color: var(--subtle); padding: 6px 16px; border-top: 1px solid var(--border); flex-shrink: 0; display: flex; gap: 14px; flex-wrap: wrap; }
  .kbd-hint kbd { background: var(--surface2); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; font-family: monospace; font-size: 10px; color: var(--muted); }
  .reviewed-mark { color: var(--ok); font-size: 12px; margin-left: 5px; }
  tr.is-reviewed td { opacity: 0.6; }
  tr.is-reviewed:hover td { opacity: 1; }
  .balance-note { color: #9999cc; font-size: 12px; font-style: italic; margin-top: 3px; }
  #toast { position: fixed; bottom: 24px; right: 24px; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 600; z-index: 1000; opacity: 0; pointer-events: none; transition: opacity 0.4s; border: 1px solid transparent; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div id="topbar">
  <div>
    <h1>Feature Cost Evaluation</h1>
    <div class="summary" id="summary">Loading\u2026</div>
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
        <button data-filter="unreviewed">Unreviewed</button>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn-save" onclick="saveToFile()">\uD83D\uDCBE Save to features.json</button>
      <button class="btn-download" onclick="downloadJson()">\u2B07 Download</button>
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
      <tbody></tbody>
    </table>
  </div>

  <div id="panel" class="hidden">
    <div id="panel-inner">
      <div>
        <div class="panel-header">
          <div>
            <h2 id="panel-name"></h2>
            <div class="panel-meta" id="panel-meta"></div>
          </div>
          <div class="panel-nav">
            <button class="nav-btn" onclick="navigatePanel(-1)" title="Previous (K / \u2191)">\u25C4</button>
            <button class="nav-btn" onclick="navigatePanel(1)" title="Next (J / \u2193)">\u25BA</button>
          </div>
        </div>
        <div class="panel-score" id="panel-score" style="margin-top:6px"></div>
      </div>
      <div id="section-flags" hidden>
        <div class="section-title">Design Flags</div>
        <div id="panel-flags"></div>
      </div>
      <div>
        <div class="section-title">Score Breakdown</div>
        <div id="panel-reasons"></div>
      </div>
      <div id="form-editor" style="display:flex;flex-direction:column;gap:14px"></div>
    </div>
    <div class="panel-actions">
      <button class="btn btn-recalc" onclick="recalculate()">\u27F3 Recalculate</button>
      <button class="btn btn-accept" onclick="applyComputed()">\u2713 Set to Computed</button>
      <button class="btn btn-close" onclick="closePanel()">\u2715 Close</button>
    </div>
    <div class="kbd-hint">
      <span><kbd>J</kbd>/<kbd>\u2193</kbd> next</span>
      <span><kbd>K</kbd>/<kbd>\u2191</kbd> prev</span>
      <span><kbd>Esc</kbd> close</span>
      <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> recalc</span>
    </div>
  </div>
</div>
<div id="toast"></div>

<script>
${CONSTANTS_JS}

// ---- Scoring (browser-side) ----
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
  if (!conditions.length) {
    reasons.push(label + ': no recognised condition in failure text (scores 0) \u2014 review manually');
  } else {
    for (const { name, stacks } of conditions) {
      const baseVal = CONDITION_BASE_VALUES[name] ?? 0;
      const c = baseVal * stacks * durationFactor * saveFactor;
      cost += c;
      reasons.push(label + ': ' + name + (stacks > 1 ? ' \xD7' + stacks : '') + ' \u2014 base ' + baseVal + ' \xD7 dur ' + durationFactor + ' \xD7 save ' + saveFactor + ' = ' + c.toFixed(1));
    }
  }
  return { cost, reasons };
}

function scoreDamageSegments(segments, aoe, label) {
  if (!segments || !segments.length) return { cost: 0, reasons: [] };
  let cost = 0;
  const reasons = [];
  const freeBaseline = aoe ? -1 : 0;
  for (const seg of segments) {
    if (seg.useBase !== false && seg.amount == null) {
      const modifier = seg.modifier ?? 0;
      const above = modifier - freeBaseline;
      const c = above * DAMAGE_PER_MODIFIER;
      cost += c;
      if (above === 0) reasons.push(label + ': base' + (modifier !== 0 ? (modifier > 0 ? '+' : '') + modifier : '') + ' ' + seg.type + ' (free baseline, damageCost = 0)');
      else reasons.push(label + ': modifier ' + (modifier >= 0 ? '+' : '') + modifier + ' ' + seg.type + ' \u2014 ' + above + ' above baseline \xD7 ' + DAMAGE_PER_MODIFIER + ' = ' + c.toFixed(1));
    } else if (seg.amount != null) {
      const c = seg.amount * DAMAGE_PER_MODIFIER;
      cost += c;
      reasons.push(label + ': flat ' + seg.amount + ' ' + seg.type + ' \xD7 ' + DAMAGE_PER_MODIFIER + ' = ' + c.toFixed(1));
    }
  }
  return { cost, reasons };
}

function checkApFlags(effects, actionType) {
  const flags = [];
  const ap = effects.cost;
  const aoe = actionType && actionType.includes('Area');
  if (ap >= 4) flags.push(ap + ' AP action \u2014 needs individual review');
  if (!aoe && effects.targetDefense && ap >= 2 && !effects.save) {
    const segs = effects.damageSegments || [];
    if (segs.every(s => s.useBase !== false && s.amount == null && (s.modifier ?? 0) === 0))
      flags.push(ap + ' AP single-target vs ' + effects.targetDefense + ', only base damage, no condition \u2014 consider reducing to 1 AP');
  }
  if (aoe) {
    for (const seg of (effects.damageSegments || []))
      if (seg.useBase !== false && seg.amount == null && (seg.modifier ?? 0) < -1)
        flags.push('AoE damage modifier ' + seg.modifier + ' is below AoE baseline of \u22121 \u2014 design error');
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
    // AP cost scaling: if actual AP differs from the normal AP for this attack type,
    // scale the action cost proportionally (Y/X where Y=normal, X=actual).
    const normalAP = aoe ? 2 : 1;
    const actualAP = effects.cost;
    if (actualAP > 0 && actualAP !== normalAP) {
      const apFactor = normalAP / actualAP;
      const before = damageCost + conditionCost;
      damageCost *= apFactor;
      conditionCost *= apFactor;
      reasons.push('AP scaling: ' + normalAP + ' normal / ' + actualAP + ' actual = \xD7' + apFactor.toFixed(2) + ' (action cost ' + before.toFixed(1) + ' \u2192 ' + (before * apFactor).toFixed(1) + ')');
    }
  }

  for (const [stat, scale] of Object.entries(MODIFIER_SCALES)) {
    const v = effects[stat];
    if (v) { const c = v * scale; modifierCost += c; reasons.push(stat + ': ' + (v>0?'+':'') + v + ' \xD7 ' + scale + ' = ' + c.toFixed(1)); }
  }
  const res = effects.resistances?.damage || [];
  if (res.length) { const c = res.length * RESISTANCE_COST; modifierCost += c; reasons.push('Damage resistances: ' + res.join(', ') + ' (' + res.length + ' \xD7 ' + RESISTANCE_COST + ') = ' + c.toFixed(1)); }
  const imm = effects.immunities?.damage || [];
  if (imm.length) { const c = imm.length * IMMUNITY_COST; modifierCost += c; reasons.push('Damage immunities: ' + imm.join(', ') + ' (' + imm.length + ' \xD7 ' + IMMUNITY_COST + ') = ' + c.toFixed(1)); }
  const vul = effects.vulnerabilities?.damage || [];
  if (vul.length) { const c = vul.length * VULNERABILITY_COST; modifierCost += c; reasons.push('Damage vulnerabilities: ' + vul.join(', ') + ' (' + vul.length + ' \xD7 ' + VULNERABILITY_COST + ') = ' + c.toFixed(1)); }
  const ci = effects.immunities?.condition || [];
  if (ci.length) { const c = ci.length * CONDITION_IMMUNITY_COST; modifierCost += c; reasons.push('Condition immunities: ' + ci.join(', ') + ' (' + ci.length + ' \xD7 ' + CONDITION_IMMUNITY_COST + ') = ' + c.toFixed(1)); }
  const cr = effects.resistances?.condition || [];
  if (cr.length) { const c = cr.length * CONDITION_RESISTANCE_COST; modifierCost += c; reasons.push('Condition resistances: ' + cr.join(', ') + ' (' + cr.length + ' \xD7 ' + CONDITION_RESISTANCE_COST + ') = ' + c.toFixed(1)); }
  if (res.length > MAX_RESISTANCES_WITHOUT_FLAG && vul.length === 0)
    flags.push(res.length + ' damage resistances with no vulnerabilities \u2014 consider adding vulnerabilities');

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

// ---- Data ----
let rawFeatures = [], features = [], DATA = [];

async function init() {
  try {
    rawFeatures = await fetch('/api/features').then(r => r.json());
    loadFeatures(rawFeatures);
  } catch(e) {
    document.getElementById('summary').textContent = 'Error loading features: ' + e.message;
  }
}

function loadFeatures(featureData) {
  if (selectedIdx != null) closePanel();
  const scored = featureData.map((f, origIdx) => {
    const s = scoreFeature(f);
    return { ...s, origIdx, id: f.id, name: f.name, type: f.type, reviewed: !!f.reviewed };
  });
  scored.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));
  DATA = scored.map((r, i) => ({ ...r, idx: i }));
  features = DATA.map(d => JSON.parse(JSON.stringify(featureData[d.origIdx])));
  renderTable();
}

function renderTable() {
  const tbody = document.querySelector('#tbl tbody');
  tbody.innerHTML = DATA.map(d => {
    const bd = d.breakdown;
    const bStr = 'dmg ' + bd.damageCost + ' / cond ' + bd.conditionCost.toFixed(1) + ' / mod ' + bd.modifierCost.toFixed(1) + ' / rxn ' + bd.reactionTax;
    const fHtml = d.flags.map(f => '<span class="flag">\u2691 ' + esc(f) + '</span>').join('');
    const deltaStr = (d.delta >= 0 ? '+' : '') + d.delta;
    const slc = d.status.toLowerCase();
    const f = features[d.idx];
    const reviewedMark = d.reviewed ? ' <span class="reviewed-mark" title="Reviewed">\u2713</span>' : '';
    const noteHtml = f?.balanceNote ? '<div class="balance-note">' + esc(f.balanceNote) + '</div>' : '';
    return '<tr class="status-' + slc + (d.reviewed ? ' is-reviewed' : '') + '" data-idx="' + d.idx + '" data-status="' + d.status + '" data-reviewed="' + d.reviewed + '" data-name="' + esc(d.name) + '">' +
      '<td>' + esc(d.name) + reviewedMark + '</td>' +
      '<td class="mono small">' + esc(d.id) + '</td>' +
      '<td class="small">' + esc(d.type) + '</td>' +
      '<td class="center"><span class="badge badge-' + slc + '" id="badge-' + d.idx + '">' + d.status + '</span></td>' +
      '<td class="center mono" id="stored-' + d.idx + '">' + d.stored + '</td>' +
      '<td class="center mono" id="computed-' + d.idx + '">' + d.computed + '</td>' +
      '<td class="center mono ' + (d.delta > 0 ? 'pos' : d.delta < 0 ? 'neg' : '') + '" id="delta-' + d.idx + '">' + deltaStr + '</td>' +
      '<td class="small" id="breakdown-' + d.idx + '">' + bStr + (fHtml ? '<br>' + fHtml : '') + noteHtml + '</td>' +
      '</tr>';
  }).join('');
  updateSummary();
  refresh();
}

function updateSummary() {
  const counts = { OK: 0, UNDERPRICED: 0, OVERPRICED: 0, FLAG: 0 };
  DATA.forEach(d => counts[d.status]++);
  document.getElementById('summary').innerHTML =
    DATA.length + ' features &nbsp;|&nbsp; OK: ' + counts.OK + ' &nbsp;|&nbsp; UNDERPRICED: ' + counts.UNDERPRICED + ' &nbsp;|&nbsp; OVERPRICED: ' + counts.OVERPRICED + ' &nbsp;|&nbsp; FLAG: ' + counts.FLAG;
}

// ---- Save / Download ----
async function saveToFile() {
  const ordered = new Array(rawFeatures.length);
  DATA.forEach((d, i) => { ordered[d.origIdx] = features[i]; });
  try {
    const res = await fetch('/api/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ordered, null, 2),
    });
    if (!res.ok) throw new Error(await res.text());
    rawFeatures = ordered;
    showToast('\u2713 Saved to features.json');
  } catch(e) {
    showToast('\u2717 ' + e.message, true);
  }
}

function downloadJson() {
  const ordered = new Array(rawFeatures.length);
  DATA.forEach((d, i) => { ordered[d.origIdx] = features[i]; });
  const blob = new Blob([JSON.stringify(ordered, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'features.json'; a.click();
  URL.revokeObjectURL(url);
}

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = isError ? '#2e0d0d' : '#162318';
  t.style.color = isError ? '#f44336' : '#4caf50';
  t.style.borderColor = isError ? '#f44336' : '#4caf50';
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

// ---- Table state ----
let sortCol = 'delta', sortDir = -1, filterStatus = 'all', searchStr = '';
let selectedIdx = null;

function getStored(idx) { return parseFloat(document.getElementById('stored-' + idx)?.textContent ?? DATA[idx].stored); }
function getComputed(idx) { return parseFloat(document.getElementById('computed-' + idx)?.textContent ?? DATA[idx].computed); }

function refresh() {
  const tbody = document.querySelector('#tbl tbody');
  const rows = [...tbody.querySelectorAll('tr')];
  rows.forEach(r => {
    const d = DATA[parseInt(r.dataset.idx)];
    const statusMatch = filterStatus === 'all' || filterStatus === 'unreviewed' ? filterStatus !== 'unreviewed' || r.dataset.reviewed !== 'true' : r.dataset.status === filterStatus;
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

document.querySelector('#tbl tbody').addEventListener('click', e => {
  const row = e.target.closest('tr');
  if (!row) return;
  const idx = parseInt(row.dataset.idx);
  if (selectedIdx === idx) { closePanel(); return; }
  document.querySelectorAll('#tbl tbody tr').forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');
  openPanel(idx);
});

// ---- Form management ----
let editingFeature = null;
let recalcTimer = null;

const TYPE_OPTS = ['action-attack','modifier','action-check-utility','passive'];
const ACTION_TYPE_OPTS = ['','Melee Martial Attack','Ranged Martial Attack','Area Martial Attack','Melee Spell Attack','Ranged Spell Attack','Area Spell Attack','Martial Utility','Spell Utility','Martial Check','Spell Check'];
const DEFENSE_OPTS = ['','PD','AD'];
const ATTR_OPTS = ['','Mig','Agi','Cha','Int','Physical','Mental'];
const DURATION_OPTS = ['','until the end of its next turn','until the end of your next turn','for 1 minute','until removed','until end of short rest','until end of long rest'];

function mk(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function fInp(val, setter) { const e = mk('input','form-input'); e.value = val ?? ''; e.oninput = () => { setter(e.value); scheduleRecalc(); }; return e; }
function fNum(val, setter) { const e = mk('input','form-input form-input-num'); e.type='number'; e.value = val ?? ''; e.oninput = () => { setter(e.value === '' ? undefined : parseFloat(e.value)); scheduleRecalc(); }; return e; }
function fSel(opts, val, setter) { const e = mk('select','form-select'); opts.forEach(o => { const op = mk('option'); op.value=o; op.textContent=o||'\u2014'; e.appendChild(op); }); e.value = val ?? ''; e.onchange = () => { setter(e.value); scheduleRecalc(); }; return e; }
function fTA(val, setter) { const e = mk('textarea','form-textarea'); e.value = val ?? ''; e.oninput = () => { setter(e.value); scheduleRecalc(); }; return e; }
function fCB(checked, label, setter) { const wrap = mk('label','form-check'); const cb = mk('input'); cb.type='checkbox'; cb.checked=!!checked; cb.onchange = () => { setter(cb.checked); scheduleRecalc(); }; wrap.appendChild(cb); wrap.appendChild(document.createTextNode(' '+label)); return wrap; }
function fSec(title) { const s = mk('div','form-section'); if (title) { const h = mk('div','form-section-title'); h.textContent=title; s.appendChild(h); } return s; }
function addRow(parent, label, child) { const r = mk('div','form-row'); const l = mk('label','form-label'); l.textContent=label; r.appendChild(l); r.appendChild(child); parent.appendChild(r); return r; }
function addTopRow(parent, label, child) { const r = addRow(parent, label, child); r.classList.add('top-align'); return r; }
function commaInp(arr, setter) { return fInp((arr||[]).join(', '), v => setter(v.split(',').map(s=>s.trim()).filter(Boolean))); }

function renderSegCard(seg, i, getArr, onRefresh) {
  const card = mk('div','seg-card');
  const srow = mk('div','seg-row');
  const typeI = fInp(seg.type, v => seg.type = v);
  typeI.className = 'form-input seg-type-input'; typeI.placeholder = 'Damage type...';
  const isBase = seg.useBase !== false;
  const modWrap = mk('span'); modWrap.appendChild(document.createTextNode('mod '));
  const modI = fNum(seg.modifier ?? 0, v => seg.modifier = v ?? 0); modI.style.width='70px';
  modWrap.appendChild(modI); modWrap.style.display = isBase ? '' : 'none';
  const amtWrap = mk('span'); amtWrap.appendChild(document.createTextNode('amt '));
  const amtI = fNum(seg.amount, v => seg.amount = v ?? 0); amtI.style.width='70px';
  amtWrap.appendChild(amtI); amtWrap.style.display = isBase ? 'none' : '';
  const baseCB = fCB(isBase, 'Base', checked => { seg.useBase = checked; modWrap.style.display = checked?'':'none'; amtWrap.style.display = checked?'none':''; });
  const rmBtn = mk('button','icon-btn'); rmBtn.textContent='\xD7'; rmBtn.title='Remove segment';
  rmBtn.onclick = () => { const a = getArr(); a.splice(i,1); onRefresh(); scheduleRecalc(); };
  srow.appendChild(typeI); srow.appendChild(baseCB); srow.appendChild(modWrap); srow.appendChild(amtWrap); srow.appendChild(rmBtn);
  card.appendChild(srow);
  return card;
}

function renderSegList(container, getArr, setArr, label) {
  container.innerHTML = '';
  if (label) { const t = mk('div','form-section-title'); t.textContent=label; container.appendChild(t); }
  const arr = getArr() || [];
  arr.forEach((seg, i) => container.appendChild(renderSegCard(seg, i, getArr, () => renderSegList(container, getArr, setArr, label))));
  const addBtn = mk('button','form-add-btn'); addBtn.textContent = '+ Add Segment';
  addBtn.onclick = () => { let a = getArr(); if (!a) { a = []; setArr(a); } a.push({ useBase: true, modifier: 0, type: 'Physical' }); renderSegList(container, getArr, setArr, label); scheduleRecalc(); };
  container.appendChild(addBtn);
}

function renderSaveSection(container, getSave, setSave) {
  container.innerHTML = '';
  const hasSave = !!getSave();
  const cb = fCB(hasSave, 'Save block', checked => { setSave(checked ? { attribute: '', failure: '', duration: '', repeatable: false } : undefined); renderSaveSection(container, getSave, setSave); });
  container.appendChild(cb);
  const save = getSave(); if (!save) return;
  const body = mk('div','save-body');
  addRow(body, 'Attribute', fSel(ATTR_OPTS, save.attribute, v => save.attribute = v));
  addTopRow(body, 'Failure', fTA(save.failure, v => save.failure = v));
  const fe5 = fInp(save.failureEach5, v => save.failureEach5 = v||undefined); fe5.placeholder='optional'; addRow(body, 'Fail each 5', fe5);
  const suc = fInp(save.success, v => save.success = v||undefined); suc.placeholder='optional'; addRow(body, 'Success', suc);
  const se5 = fInp(save.successEach5, v => save.successEach5 = v||undefined); se5.placeholder='optional'; addRow(body, 'Succ each 5', se5);
  addRow(body, 'Duration', fSel(DURATION_OPTS, save.duration, v => save.duration = v));
  body.appendChild(fCB(save.repeatable, 'Repeatable', v => save.repeatable = v));
  container.appendChild(body);
}

function renderEnhCard(enh, i, arr, onRefresh) {
  const card = mk('div','enh-card');
  const header = mk('div','enh-header');
  const nameI = fInp(enh.name, v => enh.name = v); nameI.placeholder='Enhancement name'; nameI.style.flex='1';
  const costLabel = mk('span','form-label'); costLabel.textContent='AP'; costLabel.style.minWidth='auto';
  const costI = fNum(enh.cost, v => enh.cost = v); costI.style.width='55px';
  const rmBtn = mk('button','icon-btn'); rmBtn.textContent='\xD7'; rmBtn.title='Remove enhancement';
  rmBtn.onclick = () => { arr.splice(i,1); onRefresh(); scheduleRecalc(); };
  header.appendChild(nameI); header.appendChild(costLabel); header.appendChild(costI); header.appendChild(rmBtn);
  card.appendChild(header);
  const body = mk('div','enh-body');
  const segCont = mk('div');
  renderSegList(segCont, () => enh.damageSegments, v => enh.damageSegments = v, 'Damage Segments');
  body.appendChild(segCont);
  const saveCont = mk('div'); const saveTitleEl = mk('div','form-section-title'); saveTitleEl.textContent='Save'; saveCont.appendChild(saveTitleEl);
  renderSaveSection(saveCont, () => enh.save, v => enh.save = v);
  body.appendChild(saveCont);
  const descRow = mk('div','form-row top-align'); const descLabel = mk('label','form-label'); descLabel.textContent='Description';
  descRow.appendChild(descLabel); descRow.appendChild(fTA(enh.description, v => enh.description = v||undefined));
  body.appendChild(descRow);
  card.appendChild(body);
  return card;
}

function renderEnhList(container, getArr, setArr) {
  container.innerHTML = '';
  const arr = getArr() || [];
  arr.forEach((enh, i) => container.appendChild(renderEnhCard(enh, i, arr, () => renderEnhList(container, getArr, setArr))));
  const addBtn = mk('button','form-add-btn'); addBtn.textContent = '+ Add Enhancement';
  addBtn.onclick = () => { let a = getArr(); if (!a) { a = []; setArr(a); } a.push({ name: '', cost: 1 }); renderEnhList(container, getArr, setArr); scheduleRecalc(); };
  container.appendChild(addBtn);
}

function renderForm(feature) {
  editingFeature = JSON.parse(JSON.stringify(feature));
  const ef = editingFeature;
  const effects = ef.effects || (ef.effects = {});
  const c = document.getElementById('form-editor');
  c.innerHTML = '';

  const infoSec = fSec('Feature');
  addRow(infoSec, 'Name', fInp(ef.name, v => ef.name = v));
  addRow(infoSec, 'ID', fInp(ef.id, v => ef.id = v));
  addRow(infoSec, 'Type', fSel(TYPE_OPTS, ef.type, v => ef.type = v));
  const fcI = fNum(ef.featureCost, v => ef.featureCost = v ?? 0); fcI.style.width='80px'; addRow(infoSec, 'Feature Cost', fcI);
  addTopRow(infoSec, 'Description', fTA(ef.featureDescription, v => ef.featureDescription = v||undefined));
  infoSec.appendChild(fCB(ef.reviewed, 'Reviewed by human', v => { ef.reviewed = v||undefined; scheduleRecalc(); }));
  addTopRow(infoSec, 'Balance Note', fTA(ef.balanceNote, v => ef.balanceNote = v||undefined));
  c.appendChild(infoSec);

  const actSec = fSec('Action');
  addRow(actSec, 'AP Cost', fNum(effects.cost, v => effects.cost = v));
  addRow(actSec, 'Action Type', fSel(ACTION_TYPE_OPTS, ef.actionType, v => ef.actionType = v||undefined));
  addRow(actSec, 'Target Defense', fSel(DEFENSE_OPTS, effects.targetDefense, v => effects.targetDefense = v||undefined));
  addRow(actSec, 'Target', fInp(effects.target, v => effects.target = v||undefined));
  addRow(actSec, 'Range', fInp(effects.range, v => effects.range = v||undefined));
  addTopRow(actSec, 'Action Desc', fTA(effects.actionDescription, v => effects.actionDescription = v||undefined));
  c.appendChild(actSec);

  const segSec = fSec('');
  renderSegList(segSec, () => effects.damageSegments, v => effects.damageSegments = v, 'Damage Segments');
  c.appendChild(segSec);

  const saveSec = fSec('Save');
  renderSaveSection(saveSec, () => effects.save, v => effects.save = v);
  c.appendChild(saveSec);

  const enhSec = fSec('Enhancements');
  renderEnhList(enhSec, () => effects.enhancements, v => effects.enhancements = v);
  c.appendChild(enhSec);

  const modSec = fSec('Modifiers');
  const grid = mk('div','form-mods-grid');
  [['hp','HP'],['pd','PD'],['ad','AD'],['speed','Speed'],['damage','Damage']].forEach(([k,lbl]) => {
    const item = mk('div','form-mod-item');
    const label = mk('label','form-mod-label'); label.textContent = lbl;
    const ni = fNum(effects[k], v => { if (v != null) effects[k] = v; else delete effects[k]; });
    item.appendChild(label); item.appendChild(ni); grid.appendChild(item);
  });
  modSec.appendChild(grid);
  c.appendChild(modSec);

  const dmgTypeSec = fSec('Damage Types');
  if (!effects.resistances) effects.resistances = {};
  if (!effects.immunities) effects.immunities = {};
  if (!effects.vulnerabilities) effects.vulnerabilities = {};
  addRow(dmgTypeSec, 'Resistances', commaInp(effects.resistances.damage, v => effects.resistances.damage = v.length?v:undefined));
  addRow(dmgTypeSec, 'Immunities', commaInp(effects.immunities.damage, v => effects.immunities.damage = v.length?v:undefined));
  addRow(dmgTypeSec, 'Vulnerabilities', commaInp(effects.vulnerabilities.damage, v => effects.vulnerabilities.damage = v.length?v:undefined));
  c.appendChild(dmgTypeSec);

  const condSec = fSec('Conditions');
  addRow(condSec, 'Immunities', commaInp(effects.immunities.condition, v => effects.immunities.condition = v.length?v:undefined));
  addRow(condSec, 'Resistances', commaInp(effects.resistances.condition, v => effects.resistances.condition = v.length?v:undefined));
  c.appendChild(condSec);

  const textSec = fSec('Passive Text');
  addTopRow(textSec, 'Text', fTA(effects.text, v => effects.text = v||undefined));
  c.appendChild(textSec);

  const flagSec = fSec('Flags');
  flagSec.appendChild(fCB(ef.isReaction, 'Is Reaction', v => ef.isReaction = v||undefined));
  addRow(flagSec, 'Trigger', fInp(ef.reactionTrigger, v => ef.reactionTrigger = v||undefined));
  flagSec.appendChild(fCB(ef.isLegendaryAction, 'Is Legendary Action', v => ef.isLegendaryAction = v||undefined));
  flagSec.appendChild(fCB(ef.isApexAction, 'Is Apex Action', v => ef.isApexAction = v||undefined));
  c.appendChild(flagSec);
}

function scheduleRecalc() {
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(recalculate, 600);
}

function navigatePanel(dir) {
  if (selectedIdx == null) return;
  const visibleRows = [...document.querySelectorAll('#tbl tbody tr')].filter(r => !r.classList.contains('hidden'));
  const currentRow = document.querySelector('[data-idx="' + selectedIdx + '"]');
  const ci = visibleRows.indexOf(currentRow);
  const ni = ci + dir;
  if (ni < 0 || ni >= visibleRows.length) return;
  const newRow = visibleRows[ni];
  document.querySelectorAll('#tbl tbody tr').forEach(r => r.classList.remove('selected'));
  newRow.classList.add('selected');
  newRow.scrollIntoView({ block: 'nearest' });
  openPanel(parseInt(newRow.dataset.idx));
}

document.addEventListener('keydown', e => {
  const inInput = document.activeElement && document.activeElement.matches('input,select,textarea');
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); recalculate(); return; }
  if (inInput) return;
  if (e.key === 'Escape') { closePanel(); return; }
  if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); navigatePanel(1); return; }
  if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); navigatePanel(-1); return; }
});

function openPanel(idx) {
  selectedIdx = idx;
  const d = DATA[idx];
  document.getElementById('panel-name').textContent = d.name;
  document.getElementById('panel-meta').textContent = 'ID: ' + d.id + '  |  Type: ' + d.type;
  renderScore(d.computed, d.stored, d.delta, d.status);
  renderBreakdown(d.reasons, d.flags);
  renderForm(features[idx]);
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
    flagsEl.innerHTML = flags.map(f => '<div class="reason flag-item">\u2691 ' + esc(f) + '</div>').join('');
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
  editingFeature = null;
}

function recalculate() {
  if (selectedIdx == null || !editingFeature) return;
  const result = scoreFeature(editingFeature);
  features[selectedIdx] = editingFeature;

  document.getElementById('panel-name').textContent = editingFeature.name || DATA[selectedIdx].name;
  document.getElementById('panel-meta').textContent = 'ID: ' + (editingFeature.id || DATA[selectedIdx].id) + '  |  Type: ' + (editingFeature.type || DATA[selectedIdx].type);
  renderScore(result.computed, result.stored, result.delta, result.status);
  renderBreakdown(result.reasons, result.flags);

  const idx = selectedIdx;
  const row = document.querySelector('[data-idx="' + idx + '"]');
  if (row) {
    row.className = row.className.replace(/status-\\S+/, 'status-' + result.status.toLowerCase());
    row.dataset.status = result.status;
    const badge = document.getElementById('badge-' + idx);
    if (badge) { badge.textContent = result.status; badge.className = 'badge badge-' + result.status.toLowerCase(); }
    const storedCell = document.getElementById('stored-' + idx);
    if (storedCell) { storedCell.textContent = result.stored; if (!storedCell.querySelector('.changed-mark')) storedCell.insertAdjacentHTML('beforeend', '<span class="changed-mark"> \u270E</span>'); }
    const computedCell = document.getElementById('computed-' + idx);
    if (computedCell) computedCell.textContent = result.computed;
    const deltaCell = document.getElementById('delta-' + idx);
    if (deltaCell) { deltaCell.textContent = (result.delta >= 0 ? '+' : '') + result.delta; deltaCell.className = 'center mono ' + (result.delta > 0 ? 'pos' : result.delta < 0 ? 'neg' : ''); }
    const bd = result.breakdown;
    const bdCell = document.getElementById('breakdown-' + idx);
    if (bdCell) { const bStr = 'dmg ' + bd.damageCost + ' / cond ' + bd.conditionCost.toFixed(1) + ' / mod ' + bd.modifierCost.toFixed(1) + ' / rxn ' + bd.reactionTax; const fHtml = result.flags.map(f => '<span class="flag">\u2691 ' + esc(f) + '</span>').join(''); const noteHtml = editingFeature.balanceNote ? '<div class="balance-note">' + esc(editingFeature.balanceNote) + '</div>' : ''; bdCell.innerHTML = bStr + (fHtml ? '<br>' + fHtml : '') + noteHtml; }
    // Sync reviewed state
    const reviewed = !!editingFeature.reviewed;
    row.dataset.reviewed = reviewed;
    row.classList.toggle('is-reviewed', reviewed);
    const nameCell = row.querySelector('td:first-child');
    if (nameCell) { const existing = nameCell.querySelector('.reviewed-mark'); if (existing) existing.remove(); if (reviewed) { const mark = document.createElement('span'); mark.className = 'reviewed-mark'; mark.title = 'Reviewed'; mark.textContent = '\u2713'; nameCell.appendChild(mark); } }
  }
  DATA[idx].stored = result.stored;
  DATA[idx].computed = result.computed;
  DATA[idx].delta = result.delta;
  DATA[idx].status = result.status;
  DATA[idx].name = editingFeature.name || DATA[idx].name;
  DATA[idx].reviewed = !!editingFeature.reviewed;
  updateSummary();
}

function applyComputed() {
  if (selectedIdx == null || !editingFeature) return;
  const result = scoreFeature(editingFeature);
  editingFeature.featureCost = Math.round(result.computed);
  renderForm(editingFeature);
  recalculate();
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

init();
</script>
</body>
</html>`;
}

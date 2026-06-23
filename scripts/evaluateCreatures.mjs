/**
 * scripts/evaluateCreatures.mjs
 *
 * Generates an at-a-glance HTML balance report for the monster generator,
 * measuring the creatures our multiplicative model produces against the official
 * DC20 Monster Collection design targets (see scripts/designTargets.mjs).
 *
 *   node scripts/evaluateCreatures.mjs
 *   → writes scripts/evaluateCreatures-report.html  (open in a browser)
 *
 * Pairs with tests/conformance.test.mjs (pass/fail). This report is for tuning:
 * it shows rounds-to-kill per role/level, damage difficulty classification, and
 * how the power/type/size flavour axes drift the numbers.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  baseLevelStatsData,
  powerScalingFactors,
  typeScalingFactors,
  sizeScalingFactors,
} from '../public/Rules/gameRules.js';
import { computeScaledStats } from '../public/CreateCreature/js/createCreatureStats.js';
import {
  DESIGN, ROLE_BANDS, DIFFICULTY_LABELS, LEVELS,
  roundsToKill, classifyDamage,
} from './designTargets.mjs';

const ROLES = ['none', 'soldier', 'brute', 'defender', 'leader', 'striker', 'tactician'];
const r2 = (n) => Math.round(n * 100) / 100;

function build(level, { role = 'none', power = 'normal', size = 'medium', type = 'none' } = {}) {
  const cm = level === 'novice' ? 0 : Math.max(1, Math.ceil(Number(level) / 2));
  return computeScaledStats({ level, role, power, size, type, deltas: {}, combatMastery: cm });
}

function band(role) { return ROLE_BANDS[role] ?? ROLE_BANDS.none; }

function survivalStatus(role, rounds) {
  const [lo, hi] = band(role);
  if (rounds < lo - 1e-9 || rounds > hi + 1e-9) return 'bad';
  if (rounds <= lo + (hi - lo) * 0.15 || rounds >= hi - (hi - lo) * 0.15) return 'warn';
  return 'ok';
}

function cell(value, status) { return `<td class="${status}">${value}</td>`; }

// ── Section 1: role × level survivability + offense ──────────────────────────
function roleMatrix() {
  const numericLevels = LEVELS;
  let rows = '';
  for (const level of numericLevels) {
    let cells = `<th class="lvl">${level}</th>`;
    for (const role of ROLES) {
      const s = build(level, { role });
      const dmgClass = classifyDamage(level, s.damage);
      let rounds = null, status = 'na';
      if (level !== 'novice') {
        rounds = roundsToKill({ hp: s.HP, defense: s.PD, level });
        status = survivalStatus(role, rounds);
      }
      const offStatus = dmgClass.inEnvelope ? 'ok' : 'bad';
      const roundsTxt = rounds === null ? '—' : r2(rounds);
      const html = `<div class="big">${roundsTxt}<span class="sub">rds</span></div>`
        + `<div class="meta">HP ${s.HP} · PD ${s.PD}</div>`
        + `<div class="meta ${offStatus}">dmg ${r2(s.damage)} · ${DIFFICULTY_LABELS[dmgClass.nearest]}</div>`;
      cells += cell(html, status);
    }
    rows += `<tr>${cells}</tr>`;
  }
  const head = `<th>Lvl</th>` + ROLES.map((r) => `<th>${r}</th>`).join('');
  return `<table class="matrix"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Section 2: flavour-axis drift at a sample level ──────────────────────────
function driftTable(level, axisName, keys, opts) {
  let rows = '';
  for (const key of keys) {
    const s = build(level, { ...opts(key) });
    const dmgClass = classifyDamage(level, s.damage);
    const rounds = roundsToKill({ hp: s.HP, defense: s.PD, level });
    const sane = rounds >= 2 && rounds <= 5 ? 'ok' : 'warn';
    const off = dmgClass.inEnvelope ? 'ok' : 'bad';
    rows += `<tr><th>${key}</th>`
      + `<td>${s.HP}</td><td>${s.PD}</td><td>${s.AD}</td><td>${r2(s.damage)}</td>`
      + `<td class="${off}">${DIFFICULTY_LABELS[dmgClass.nearest]}</td>`
      + cell(r2(rounds), sane) + `</tr>`;
  }
  return `<h3>${axisName} drift @ Level ${level} (role none)</h3>`
    + `<table class="drift"><thead><tr><th>${axisName}</th><th>HP</th><th>PD</th><th>AD</th>`
    + `<th>dmg</th><th>nearest</th><th>PC kill rds</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const SAMPLE = 5;
const sections = [
  driftTable(SAMPLE, 'Power', Object.keys(powerScalingFactors), (k) => ({ power: k })),
  driftTable(SAMPLE, 'Type',  Object.keys(typeScalingFactors),  (k) => ({ type: k })),
  driftTable(SAMPLE, 'Size',  Object.keys(sizeScalingFactors),  (k) => ({ size: k })),
].join('\n');

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>DC20 Creature Conformance Report</title>
<style>
  :root { color-scheme: dark; }
  body { font: 14px/1.4 system-ui, sans-serif; background:#1b1b22; color:#e6e6ee; margin:0; padding:24px; }
  h1 { margin:0 0 4px; } h3 { margin:28px 0 8px; }
  .lead { color:#a9a9ba; margin:0 0 20px; max-width:70ch; }
  .legend span { display:inline-block; padding:2px 8px; border-radius:4px; margin-right:8px; font-size:12px; }
  table { border-collapse:collapse; width:100%; margin-bottom:8px; }
  th, td { border:1px solid #34343f; padding:6px 8px; text-align:center; vertical-align:middle; }
  thead th { background:#2a2a33; position:sticky; top:0; }
  .matrix td { min-width:96px; }
  .matrix .lvl, .matrix th.lvl { background:#2a2a33; font-weight:700; }
  .big { font-size:17px; font-weight:700; } .big .sub { font-size:10px; color:#9a9aab; margin-left:3px; }
  .meta { font-size:11px; color:#b9b9c8; }
  td.ok   { background:#16331f; } td.ok.meta, .ok { color:#7ad08e; }
  td.warn { background:#3a3318; } .warn { color:#e0c46a; }
  td.bad  { background:#3a1c1c; } td.bad, .bad { color:#e88; }
  td.na   { background:#26262e; color:#777; }
  .drift th:first-child { text-align:left; }
  code { background:#2a2a33; padding:1px 5px; border-radius:3px; }
</style></head><body>
<h1>DC20 Creature Conformance Report</h1>
<p class="lead">Our multiplicative generator measured against the official Monster Collection
targets. Anchor: a same-level PC kills a same-level <b>Medium</b> monster in
<b>${DESIGN.TARGET_ROUNDS} rounds</b> (${DESIGN.ATTACKS_PER_ROUND} atk/round, ${Math.round(DESIGN.BASELINE_HIT * 100)}% hit).
Cells show PC <b>rounds-to-kill</b>, the monster's HP/PD, and its per-attack damage with the
nearest difficulty band. Green = within role band; amber = near edge; red = outside.</p>
<p class="legend">
  <span class="ok">in band</span><span class="warn">edge</span><span class="bad">out of band</span>
  &nbsp; Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}
</p>
<h3>Role × Level — survivability &amp; offense</h3>
${roleMatrix()}
${sections}
<p class="lead" style="margin-top:24px">Targets &amp; tolerances live in <code>scripts/designTargets.mjs</code>.
Run <code>node tests/conformance.test.mjs</code> for pass/fail.</p>
</body></html>`;

const outPath = join(dirname(fileURLToPath(import.meta.url)), 'evaluateCreatures-report.html');
writeFileSync(outPath, html, 'utf8');
console.log(`Wrote ${outPath}`);

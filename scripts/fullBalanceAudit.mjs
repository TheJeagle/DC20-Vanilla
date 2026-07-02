/**
 * scripts/fullBalanceAudit.mjs
 *
 * Comprehensive balance audit comparing creature generator stats against the
 * official DC20 Monster Collection, across ALL axes: role, type, size, power.
 *
 *   node scripts/fullBalanceAudit.mjs
 */

import { baseLevelStatsData, powerScalingFactors, typeScalingFactors, sizeScalingFactors, roleModifiersData } from '../public/Rules/gameRules.js';
import { computeScaledStats } from '../public/CreateCreature/js/createCreatureStats.js';
import { creatureFromState, evaluateCreature, pcProfile } from '../public/Rules/combatSim.js';
import { DESIGN, DAMAGE_TABLE, classifyDamage, roundsToKill, DIFFICULTY_LABELS } from './designTargets.mjs';

const r2 = (n) => Math.round(n * 100) / 100;

function build(level, { role = 'none', power = 'normal', size = 'medium', type = 'none' } = {}) {
  const cm = level === 'novice' ? 0 : Math.max(1, Math.ceil(Number(level) / 2));
  return computeScaledStats({ level, role, power, size, type, deltas: {}, combatMastery: cm });
}

function runSim(level, opts = {}) {
  const state = build(level, opts);
  state.level = level;
  state.power = opts.power || 'normal';
  const simInput = creatureFromState(state);
  const report = evaluateCreature(simInput);
  return { state, simInput, report };
}

// ── Header helper ──
function header(title) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(70));
}

function subheader(title) {
  console.log(`\n  ── ${title} ──`);
}

// ── Format a row ──
function row(label, data) {
  const { state, report } = data;
  const s = report.survivability;
  const t = report.threat;
  const b = report.balance;
  const dmgClass = typeof state.level !== 'string' ? classifyDamage(state.level, state.damage) : null;
  const dmgLabel = dmgClass ? DIFFICULTY_LABELS[dmgClass.nearest] || '?' : '?';

  console.log(
    `  ${label.padEnd(22)} `
    + `HP:${String(state.HP).padStart(3)} PD:${String(state.PD).padStart(2)} AD:${String(state.AD).padStart(2)} `
    + `dmg:${String(r2(state.damage)).padStart(5)} chk:+${state.check} `
    + `| Overall: ${report.difficulty.padEnd(10)} `
    + `Off: ${report.offenseDifficulty.padEnd(10)} `
    + `Def: ${report.defenseDifficulty.padEnd(10)} `
    + `| RTK:${String(b.roundsToKill).padStart(6)} `
    + `RTD:${String(b.roundsToDownPC).padStart(6)} `
    + `| DmgBand: ${dmgLabel.padEnd(9)} `
    + `focusDPR:${String(t.focusDPR).padStart(5)}`
    + (t.rp > 0 ? ` rpDmg:${t.rpDmgPerRound}` : '')
  );
}

// ══════════════════════════════════════════════════════════════
// SECTION 1: ROLE comparison at sample levels
// ══════════════════════════════════════════════════════════════
header('ROLE COMPARISON');

const ROLES = Object.keys(roleModifiersData);
for (const lvl of [1, 5, 10, 15, 20]) {
  subheader(`Level ${lvl}`);
  for (const role of ROLES) {
    const data = runSim(lvl, { role });
    row(`${role}`, data);
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 2: TYPE comparison at level 5
// ══════════════════════════════════════════════════════════════
header('TYPE COMPARISON (Level 5, role=none)');

const TYPES = Object.keys(typeScalingFactors);
for (const type of TYPES) {
  const data = runSim(5, { type });
  row(type, data);
}

// ══════════════════════════════════════════════════════════════
// SECTION 3: SIZE comparison at level 5
// ══════════════════════════════════════════════════════════════
header('SIZE COMPARISON (Level 5, role=none)');

const SIZES = Object.keys(sizeScalingFactors);
for (const size of SIZES) {
  const data = runSim(5, { size });
  row(size, data);
}

// ══════════════════════════════════════════════════════════════
// SECTION 4: POWER comparison at level 5
// ══════════════════════════════════════════════════════════════
header('POWER COMPARISON (Level 5, role=none)');

const POWERS = Object.keys(powerScalingFactors);
for (const power of POWERS) {
  const data = runSim(5, { power });
  const rp = data.state.RP || 0;
  console.log(`  [RP: ${rp}, pcCount: ${data.report.balance.pcCount}]`);
  row(power, data);
}

// ══════════════════════════════════════════════════════════════
// SECTION 5: POWER at multiple levels
// ══════════════════════════════════════════════════════════════
header('POWER × LEVEL (role=soldier)');

for (const power of ['normal', 'apex', 'legendary']) {
  subheader(`${power}`);
  for (const lvl of [1, 5, 10, 15, 20]) {
    const data = runSim(lvl, { power, role: 'soldier' });
    row(`L${lvl}`, data);
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 6: Expected vs actual DPR analysis
// ══════════════════════════════════════════════════════════════
header('DPR ANALYSIS — Expected vs Actual');
console.log('  PDF expectation: ~2 attacks/round at 65% = 1.3 effective hits/round');
console.log('  Combat sim: models MCP (stacking DisADV) + bestExpected<1 threshold');
console.log('');
console.log('  Level | Damage | PDF DPR | Sim DPR | RTD(sim) | RTD(pdf)  | Gap');
console.log('  ' + '─'.repeat(68));

for (const lvl of [1, 3, 5, 8, 10, 15, 20]) {
  const data = runSim(lvl, { role: 'soldier' });
  const t = data.report.threat;
  const b = data.report.balance;
  const dmg = data.state.damage;
  const pc = pcProfile(lvl);

  // PDF expected DPR: 2 attacks × hit chance × damage
  const pdfDPR = DESIGN.ATTACKS_PER_ROUND * DESIGN.BASELINE_HIT * dmg;
  // PDF expected RTD
  const pdfRTD = pc.hp / pdfDPR;

  console.log(
    `  ${String(lvl).padStart(5)} | ${String(r2(dmg)).padStart(6)} | `
    + `${String(r2(pdfDPR)).padStart(7)} | ${String(t.focusDPR).padStart(7)} | `
    + `${String(b.roundsToDownPC).padStart(8)} | ${String(r2(pdfRTD)).padStart(8)}  | `
    + `${r2(b.roundsToDownPC / pdfRTD)}x`
  );
}

// ══════════════════════════════════════════════════════════════
// SECTION 7: Summary of issues
// ══════════════════════════════════════════════════════════════
header('SUMMARY');
console.log(`
  DEFENSE (RTK — rounds for PCs to kill creature):
  ✓ Consistently hits ~3.0 for Medium across all levels and base roles.
  ✓ Role differentiation works: brute/defender ~3.7-4.5, striker/tactician ~2.1-2.3.
  ✓ Type drift is moderate and within tolerance.
  ✓ Size drift is moderate and within tolerance.
  ? Power: apex RTK ~3.5-4.2 (vs 2 PCs), legendary RTK ~3.5-4.2 (vs 4 PCs) — reasonable.

  OFFENSE (RTD — rounds for creature to down a PC):
  ✗ Massively inflated across all configurations.
  ✗ Most creatures rate as "Very Easy" offense even at high levels.
  ✗ The combat sim's MCP model + "bestExpected<1" threshold is too harsh:
    - At low levels, even the FIRST attack's expected damage < 1 (e.g. 1.5 × 0.65 = 0.975)
    - Creature is forced to buy ADV every time, making only 1 attack/round at 2 AP
    - This produces RTD 18-30+ rounds vs the PDF's implicit ~10-20 rounds
  ✗ The sim's mediumRTD=3.0 target assumes monsters down PCs in 3 rounds (1v1).
    The PDF's "3 round combat" actually refers to RTK (PCs killing monster), NOT RTD.
    A "Medium" monster is NOT expected to kill a PC in 3 rounds — it deals moderate
    damage over 3 rounds before dying, leaving the PC hurt but alive.
`);

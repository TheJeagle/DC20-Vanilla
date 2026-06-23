/**
 * tests/conformance.test.mjs
 *
 * Behavioural conformance of our multiplicative generator against the official
 * DC20 Monster Collection design targets. We keep our own scaling model; these
 * tests verify the creatures it produces still land within tolerance of the
 * book's pacing goals — above all the ~3-round combat invariant.
 *
 * Targets & math live in scripts/designTargets.mjs.
 *
 * Run with: node tests/conformance.test.mjs
 */

import { baseLevelStatsData } from '../public/Rules/gameRules.js';
import { computeScaledStats } from '../public/CreateCreature/js/createCreatureStats.js';
import {
  DAMAGE_TABLE,
  ROLE_BANDS,
  DESIGN,
  roundsToKill,
  classifyDamage,
  attackBonusForLevel,
  LEVELS,
} from '../scripts/designTargets.mjs';

// ─── Minimal test harness (matches tests/stats.test.mjs) ─────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ ${label}`); failed++; }
}

function assertBetween(actual, lo, hi, label) {
  if (actual >= lo - 1e-9 && actual <= hi + 1e-9) {
    console.log(`  ✓ ${label}  (${round(actual)} ∈ [${lo}, ${hi}])`);
    passed++;
  } else {
    console.error(`  ✗ ${label}  (${round(actual)} ∉ [${lo}, ${hi}])`);
    failed++;
  }
}

function assertClose(actual, expected, label, tol = 0.001) {
  if (Math.abs(actual - expected) <= tol) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ ${label}  (expected ≈${expected}, got ${actual})`); failed++; }
}

function section(name) { console.log(`\n${name}`); }
function round(n) { return Math.round(n * 100) / 100; }

// ─── Helper: build neutral baseline creatures (isolate role effect) ──────────
// power=normal, size=medium, type=none → no flavour scaling, so role is the only
// variable. This is the configuration the design bands are calibrated against.

function makeNeutral(level, role) {
  const cm = level === 'novice' ? 0 : Math.max(1, Math.ceil(Number(level) / 2));
  return computeScaledStats({
    level, role, power: 'normal', size: 'medium', type: 'none', deltas: {}, combatMastery: cm,
  });
}

const ROLES = ['none', 'soldier', 'brute', 'defender', 'leader', 'striker', 'tactician'];
const NUMERIC_LEVELS = LEVELS.filter((l) => l !== 'novice'); // hit-math uses numeric levels

// ─────────────────────────────────────────────────────────────────────────────
// 1. Design-target table integrity
// ─────────────────────────────────────────────────────────────────────────────

section('designTargets — DAMAGE_TABLE Medium column equals base table Damage');

baseLevelStatsData.forEach((row) => {
  const t = DAMAGE_TABLE[row.level];
  assert(t !== undefined, `damage table has a row for level "${row.level}"`);
  if (t) assertClose(t.medium, row.Damage, `level ${row.level}: Medium damage = base Damage (${row.Damage})`);
});

section('designTargets — difficulty columns strictly increase per level');

Object.entries(DAMAGE_TABLE).forEach(([lvl, row]) => {
  const ok = row.easy <= row.medium && row.medium <= row.hard
          && row.hard <= row.veryHard && row.veryHard <= row.deadly;
  assert(ok, `level ${lvl}: Easy ≤ Medium ≤ Hard ≤ Very Hard ≤ Deadly`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Static conformance — vanilla creature matches the published base table
// ─────────────────────────────────────────────────────────────────────────────

section('static — vanilla (none/normal/medium/none) matches base level table');

baseLevelStatsData.forEach((row) => {
  const s = makeNeutral(row.level, 'none');
  assertClose(s.HP, row.HP,            `level ${row.level}: HP = ${row.HP}`);
  assertClose(s.PD, row.PD,            `level ${row.level}: PD = ${row.PD}`);
  assertClose(s.AD, row.AD,            `level ${row.level}: AD = ${row.AD}`);
  assertClose(s.check, row.Check,      `level ${row.level}: Attack Bonus = ${row.Check}`);
  assertClose(s.saveDC, row.SaveDC,    `level ${row.level}: Save DC = ${row.SaveDC}`);
  assertClose(s.damage, row.Damage,    `level ${row.level}: Damage = ${row.Damage}`);
  assertClose(s.traitValue, row.TraitValue, `level ${row.level}: Trait Value = ${row.TraitValue}`);
  assertClose(s.AP, row.AP,            `level ${row.level}: AP = ${row.AP}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. The 3-round invariant — PC kills a same-level monster in ~3 Rounds
// ─────────────────────────────────────────────────────────────────────────────

section('3-round — vanilla Medium monster dies in exactly 3 Rounds (calibration anchor)');

NUMERIC_LEVELS.forEach((level) => {
  const s = makeNeutral(level, 'none');
  const r = roundsToKill({ hp: s.HP, defense: s.PD, level });
  assertClose(r, DESIGN.TARGET_ROUNDS, `level ${level}: rounds-to-kill = 3`, 0.05);
});

section('3-round — each role stays within its survivability band (all levels)');

ROLES.forEach((role) => {
  const [lo, hi] = ROLE_BANDS[role];
  let worstLo = Infinity, worstHi = -Infinity, worstLevel = null;
  NUMERIC_LEVELS.forEach((level) => {
    const s = makeNeutral(level, role);
    const r = roundsToKill({ hp: s.HP, defense: s.PD, level });
    if (r < worstLo) { worstLo = r; }
    if (r > worstHi) { worstHi = r; worstLevel = level; }
  });
  // Assert the full observed range fits the band.
  assertBetween(worstLo, lo, hi, `${role}: min rounds-to-kill across levels`);
  assertBetween(worstHi, lo, hi, `${role}: max rounds-to-kill across levels (worst at L${worstLevel})`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Offense — generated damage stays within the [Easy, Deadly] envelope
// ─────────────────────────────────────────────────────────────────────────────

section('offense — role × level damage stays within [Easy, Deadly] for that level');

ROLES.forEach((role) => {
  LEVELS.forEach((level) => {
    const s = makeNeutral(level, role);
    const { inEnvelope, row } = classifyDamage(level, s.damage);
    assert(inEnvelope, `${role} L${level}: damage ${round(s.damage)} within [${row.easy}, ${row.deadly}]`);
  });
});

section('offense — role "none" damage equals the Medium column exactly');

LEVELS.forEach((level) => {
  const s = makeNeutral(level, 'none');
  assertClose(s.damage, DAMAGE_TABLE[level].medium, `L${level}: none damage = Medium`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(55)}`);
console.log(`Conformance: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

/**
 * tests/stats.test.mjs
 *
 * Tests for gameRules.js data integrity and createCreatureStats.js calculation
 * logic introduced in the Beta 0.10.5 monster-system update.
 *
 * Run with: node tests/stats.test.mjs
 */

import {
  baseLevelStatsData,
  attributeScoresByLevel,
  roleModifiersData,
  powerScalingFactors,
  typeScalingFactors,
  sizeScalingFactors,
} from '../public/Rules/gameRules.js';

import {
  clampLevel,
  computeScaledStats,
  applyNumericDeltas,
  ATTRIBUTE_KEYS,
} from '../public/CreateCreature/js/createCreatureStats.js';

// ─── Minimal test harness ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    failed++;
  }
}

function assertClose(actual, expected, label, tol = 0.001) {
  if (Math.abs(actual - expected) <= tol) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}  (expected ≈${expected}, got ${actual})`);
    failed++;
  }
}

function section(name) {
  console.log(`\n${name}`);
}

// ─── Helper: build a minimal creature for computeScaledStats ────────────────

function makeCreature({ level = 1, role = 'none', power = 'normal', size = 'medium', type = 'humanoid', deltas = {}, combatMastery } = {}) {
  const cm = combatMastery ?? (level === 'novice' ? 0 : Math.max(1, Math.ceil(Number(level) / 2)));
  return computeScaledStats({ level, role, power, size, type, deltas, combatMastery: cm });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. gameRules.js — data-integrity checks
// ─────────────────────────────────────────────────────────────────────────────

section('gameRules — baseLevelStatsData coverage');

const EXPECTED_LEVELS = ['novice', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
assertEqual(baseLevelStatsData.length, 22, 'has 22 entries (Novice + 0–20)');
EXPECTED_LEVELS.forEach((lvl) => {
  assert(
    baseLevelStatsData.some((e) => e.level === lvl),
    `entry exists for level "${lvl}"`,
  );
});

section('gameRules — baseLevelStatsData spot-check design-doc values');

const novice = baseLevelStatsData.find((e) => e.level === 'novice');
assertEqual(novice.HP,       7,    'Novice HP = 7');
assertEqual(novice.PD,       10,   'Novice PD = 10');
assertEqual(novice.AD,       10,   'Novice AD = 10');
assertEqual(novice.TraitValue, 2,  'Novice TraitValue = 2');
assertEqual(novice.Damage,   0.25, 'Novice Damage = 0.25');

const lvl5 = baseLevelStatsData.find((e) => e.level === 5);
assertEqual(lvl5.HP,       24,  'Level 5 HP = 24');
assertEqual(lvl5.PD,       15,  'Level 5 PD = 15');
assertEqual(lvl5.AD,       15,  'Level 5 AD = 15');
assertEqual(lvl5.TraitValue, 14, 'Level 5 TraitValue = 14');

const lvl10 = baseLevelStatsData.find((e) => e.level === 10);
assertEqual(lvl10.HP,       36,  'Level 10 HP = 36');
assertEqual(lvl10.Damage,   3,   'Level 10 Damage = 3');
assertEqual(lvl10.TraitValue, 24, 'Level 10 TraitValue = 24');

const lvl20 = baseLevelStatsData.find((e) => e.level === 20);
assertEqual(lvl20.HP,       62,  'Level 20 HP = 62');
assertEqual(lvl20.PD,       25,  'Level 20 PD = 25');
assertEqual(lvl20.TraitValue, 44, 'Level 20 TraitValue = 44');

section('gameRules — attributeScoresByLevel');

assertEqual(attributeScoresByLevel.length, 22, 'has 22 attribute score entries');
const noviceScores = attributeScoresByLevel.find((e) => e.level === 'novice');
assert(Array.isArray(noviceScores?.scores), 'Novice has a scores array');
assert(noviceScores.scores[0] === 2, 'Novice prime score = 2');

const lvl20Scores = attributeScoresByLevel.find((e) => e.level === 20);
assert(lvl20Scores.scores[0] === 7, 'Level 20 prime score = 7');
assert(lvl20Scores.scores[1] === 5, 'Level 20 secondary score = 5');

section('gameRules — roleModifiersData has exactly 7 entries (6 roles + none)');

const roleKeys = Object.keys(roleModifiersData);
assertEqual(roleKeys.length, 7, 'roleModifiersData has 7 keys');
['brute', 'defender', 'leader', 'soldier', 'striker', 'tactician', 'none'].forEach((r) => {
  assert(roleKeys.includes(r), `role "${r}" present`);
});

section('gameRules — role-specific values from design doc');

assertEqual(roleModifiersData.brute.HPFactor,     1.25, 'brute HPFactor = 1.25');
assertEqual(roleModifiersData.brute.DamageFactor, 1.25, 'brute DamageFactor = 1.25');
assertEqual(roleModifiersData.brute.SpeedMod,     1,    'brute SpeedMod = 1');

assertEqual(roleModifiersData.defender.PDMod,     2,    'defender PDMod = +2');
assertEqual(roleModifiersData.defender.ADMod,     2,    'defender ADMod = +2');
assertEqual(roleModifiersData.defender.CheckMod, -1,    'defender CheckMod = -1');

assertEqual(roleModifiersData.striker.HPFactor,     0.75, 'striker HPFactor = 0.75');
assertEqual(roleModifiersData.striker.PDMod,        -1,   'striker PDMod = -1');
assertEqual(roleModifiersData.striker.ADMod,        -1,   'striker ADMod = -1');
assertEqual(roleModifiersData.striker.DamageFactor,  1.5, 'striker DamageFactor = 1.5');

assertEqual(roleModifiersData.leader.TraitValueBonus,    4, 'leader TraitValueBonus = 4');
assertEqual(roleModifiersData.tactician.TraitValueBonus, 8, 'tactician TraitValueBonus = 8');
assertEqual(roleModifiersData.tactician.isCaster,     true, 'tactician isCaster = true');

assert(
  JSON.stringify(roleModifiersData.tactician.AttributePriority) === JSON.stringify(['Int', 'Cha', 'Agi', 'Mig']),
  'tactician AttributePriority is [Int, Cha, Agi, Mig]',
);

section('gameRules — power/type DamageFactor (no DamageMod)');

Object.entries(powerScalingFactors).forEach(([key, v]) => {
  assert(!('DamageMod' in v), `powerScalingFactors.${key} has no DamageMod`);
  assert('DamageFactor' in v, `powerScalingFactors.${key} has DamageFactor`);
});

Object.entries(typeScalingFactors).forEach(([key, v]) => {
  assert(!('DamageMod' in v), `typeScalingFactors.${key} has no DamageMod`);
  assert('DamageFactor' in v, `typeScalingFactors.${key} has DamageFactor`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. clampLevel
// ─────────────────────────────────────────────────────────────────────────────

section('clampLevel');

assertEqual(clampLevel('novice'), 'novice', 'clampLevel("novice") → "novice"');
assertEqual(clampLevel(0),         0,        'clampLevel(0) → 0');
assertEqual(clampLevel(10),        10,       'clampLevel(10) → 10');
assertEqual(clampLevel(20),        20,       'clampLevel(20) → 20');
assertEqual(clampLevel(21),        20,       'clampLevel(21) clamps to 20');
assertEqual(clampLevel(-1),        0,        'clampLevel(-1) clamps to 0');
assertEqual(clampLevel('5'),       5,        'clampLevel("5") → 5 (string coercion)');
assertEqual(clampLevel('bad'),     0,        'clampLevel("bad") → 0 (NaN fallback)');

// ─────────────────────────────────────────────────────────────────────────────
// 3. computeScaledStats — HP calculations (from plan verification section)
// ─────────────────────────────────────────────────────────────────────────────

section('computeScaledStats — HP');

{
  // Brute level 10: base 36 × HPFactor 1.25 × HPFactor 1.0 (normal power) × HPFactor 1.0 (humanoid) × HPMod 1 (medium)
  const s = makeCreature({ level: 10, role: 'brute', power: 'normal', size: 'medium', type: 'humanoid' });
  assertClose(s.HP, Math.ceil(36 * 1.25 * 1.0 * 1.0 * 1), 'brute level 10 HP ≈ 45');
}

{
  // Striker level 10: base 36 × 0.75 × 1.0 × 1.0 × 1 = 27
  const s = makeCreature({ level: 10, role: 'striker', power: 'normal', size: 'medium', type: 'humanoid' });
  assertClose(s.HP, Math.ceil(36 * 0.75 * 1.0 * 1.0 * 1), 'striker level 10 HP ≈ 27');
}

{
  // Novice none humanoid normal medium: base 7 × 1 × 1 × 1 × 1 = 7
  const s = makeCreature({ level: 'novice', role: 'none', power: 'normal', size: 'medium', type: 'humanoid' });
  assertClose(s.HP, 7, 'Novice HP = 7');
}

section('computeScaledStats — PD and AD (defender / striker separation)');

{
  // Defender level 5: base PD 15 + role +2 + power 0 + type +2 (humanoid) + size 0 (medium) = 19
  const s = makeCreature({ level: 5, role: 'defender', power: 'normal', size: 'medium', type: 'humanoid' });
  assertEqual(s.PD, 15 + 2 + 0 + 2 + 0, 'defender level 5 PD = 19');
  assertEqual(s.AD, 15 + 2 + 0 + 0 + 0, 'defender level 5 AD = 17');
}

{
  // Striker level 5: PD 15 + role -1 + type +2 (humanoid) = 16, AD 15 -1 + 0 = 14
  const s = makeCreature({ level: 5, role: 'striker', power: 'normal', size: 'medium', type: 'humanoid' });
  assertEqual(s.PD, 15 - 1 + 0 + 2 + 0, 'striker level 5 PD = 16');
  assertEqual(s.AD, 15 - 1 + 0 + 0 + 0, 'striker level 5 AD = 14');
}

section('computeScaledStats — damage (multiplicative)');

{
  // Striker level 10: base damage 3 × role 1.5 × power 1.0 × type 1.0 (humanoid) = 4.5
  const s = makeCreature({ level: 10, role: 'striker', power: 'normal', size: 'medium', type: 'humanoid' });
  assertClose(s.damage, 3 * 1.5 * 1.0 * 1.0, 'striker level 10 damage = 4.5');
}

{
  // Brute level 5 dragon apex: base 1.5 × 1.25 × 1.5 × 1.3
  const s = makeCreature({ level: 5, role: 'brute', power: 'apex', size: 'medium', type: 'dragon' });
  assertClose(s.damage, 1.5 * 1.25 * 1.5 * 1.3, 'brute level 5 dragon apex damage');
}

{
  // Novice damage: 0.25 × 1 × 1 × 1 = 0.25
  const s = makeCreature({ level: 'novice' });
  assertClose(s.damage, 0.25 * 1.0 * 1.0 * 1.0, 'Novice damage = 0.25');
}

section('computeScaledStats — TraitValue');

{
  // Leader level 5: base TraitValue 14 + TraitValueBonus 4 = 18
  const s = makeCreature({ level: 5, role: 'leader' });
  assertEqual(s.traitValue, 14 + 4, 'leader level 5 traitValue = 18');
}

{
  // Tactician level 10: base 24 + bonus 8 = 32
  const s = makeCreature({ level: 10, role: 'tactician' });
  assertEqual(s.traitValue, 24 + 8, 'tactician level 10 traitValue = 32');
}

{
  // Brute level 0: base 4 + bonus 0 = 4
  const s = makeCreature({ level: 0, role: 'brute' });
  assertEqual(s.traitValue, 4, 'brute level 0 traitValue = 4');
}

section('computeScaledStats — Novice level handling');

{
  const s = makeCreature({ level: 'novice', role: 'none', power: 'normal', size: 'medium', type: 'humanoid' });
  assert(s !== undefined, 'Novice creature computes without error');
  assertEqual(s.traitValue, 2, 'Novice traitValue = 2');
}

section('computeScaledStats — attributePriority follows role');

{
  const s = makeCreature({ level: 5, role: 'tactician' });
  assertEqual(s.attributePriority[0], 'Int', 'tactician prime attribute = Int');
  assertEqual(s.attributePriority[1], 'Cha', 'tactician secondary = Cha');
}

{
  const s = makeCreature({ level: 5, role: 'striker' });
  assertEqual(s.attributePriority[0], 'Agi', 'striker prime attribute = Agi');
}

section('computeScaledStats — attributeSaves include combatMastery');

{
  const cm = Math.ceil(5 / 2); // = 3
  const s = computeScaledStats({ level: 5, role: 'none', power: 'normal', size: 'medium', type: 'humanoid', deltas: {}, combatMastery: cm });
  // Prime attribute score at level 5 = 4; save = 4 + CM 3 = 7
  assertEqual(s.attributeSaves['Mig'], s.attributes['Mig'] + cm, 'save = attribute + combatMastery');
}

section('applyNumericDeltas');

{
  const creature = { HP: 10, PD: 12, AD: 12, damage: 2, check: 5, saveDC: 14, AP: 4, speed: 5, deltas: { HP: 3, PD: -1 } };
  applyNumericDeltas(creature);
  assertEqual(creature.HP, 13, 'applyNumericDeltas adds HP delta');
  assertEqual(creature.PD, 11, 'applyNumericDeltas subtracts PD delta');
  assertEqual(creature.AD, 12, 'applyNumericDeltas leaves untouched fields alone');
}

{
  // No deltas object — should not throw
  const creature = { HP: 10 };
  applyNumericDeltas(creature);
  assertEqual(creature.HP, 10, 'applyNumericDeltas is a no-op when no deltas');
}

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(55)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

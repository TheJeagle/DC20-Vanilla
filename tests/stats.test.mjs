/**
 * stats.test.mjs
 *
 * Tests for the creature stat scaling pipeline:
 *   - clampLevel()                  — bounds-check level to [0, 10]
 *   - arraysEqual()                 — strict array comparison
 *   - normalizeAttributePriority()  — merge + deduplicate attribute orderings
 *   - normalizeRankValueDeltas()    — coerce/filter rank-indexed adjustments
 *   - normalizeAttributeValueDeltas() — coerce/filter per-attribute adjustments
 *   - computeScaledStats()          — full stat scaling across level/role/power/type/size
 *   - applyNumericDeltas()          — apply manual HP/PD/AD/etc. overrides in-place
 *
 * Run with:  node tests/stats.test.mjs
 *
 * No extra dependencies — uses Node's built-in assert module.
 * The import chain (createCreatureStats.js → gameRules.js) has no Firebase or
 * DOM dependencies so it loads cleanly in Node.js.
 *
 * ── How to verify expected values ────────────────────────────────────────────
 *
 * HP  = ceil( baseHP × roleHPFactor × powerHPFactor × typeHPFactor × sizeHPMod )
 * PD  = basePD  + rolePDMod  + powerPDMod  + typePDMod  + sizePDMod
 * AD  = baseAD  + roleADMod  + powerADMod  + typeADMod  + sizeADMod
 * dmg = baseDmg + roleDmgMod + powerDmgMod + typeDmgMod
 * chk = baseChk + roleChkMod + powerChkMod + typeChkMod
 * DC  = baseDC  + powerDCMod + typeDCMod
 * AP  = baseAP  + powerAPMod
 * spd = baseSpd + roleSpeedMod
 *
 * Attribute scores are assigned from attributeScoresByLevel[level].scores in
 * role-priority order, then shifted by rankValueDeltas and attributeValueDeltas.
 * attributeSaves[attr] = score + combatMastery.
 */

import assert from 'node:assert/strict';
import {
  clampLevel,
  arraysEqual,
  normalizeAttributePriority,
  normalizeRankValueDeltas,
  normalizeAttributeValueDeltas,
  computeScaledStats,
  applyNumericDeltas,
} from '../public/CreateCreature/js/createCreatureStats.js';

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

function section(name) { console.log(`\n${name}`); }

// ── Shorthand for a default computeScaledStats call ──────────────────────────

function scaled(overrides = {}) {
  return computeScaledStats({
    level: 5,
    role: 'none',
    power: 'normal',
    size: 'medium',
    type: 'humanoid',
    deltas: {},
    combatMastery: 0,
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// clampLevel
// ═══════════════════════════════════════════════════════════════════════════════

section('clampLevel');

test('level 0 stays at 0',  () => assert.equal(clampLevel(0),   0));
test('level 5 is unchanged', () => assert.equal(clampLevel(5),   5));
test('level 10 stays at 10', () => assert.equal(clampLevel(10), 10));
test('negative clamped to 0',   () => assert.equal(clampLevel(-3), 0));
test('above max clamped to 10', () => assert.equal(clampLevel(99), 10));

// ═══════════════════════════════════════════════════════════════════════════════
// arraysEqual
// ═══════════════════════════════════════════════════════════════════════════════

section('arraysEqual');

test('identical arrays',          () => assert.equal(arraysEqual(['Mig', 'Agi'], ['Mig', 'Agi']), true));
test('different values',          () => assert.equal(arraysEqual(['Mig', 'Agi'], ['Mig', 'Int']), false));
test('different lengths',         () => assert.equal(arraysEqual([1, 2], [1, 2, 3]), false));
test('empty arrays equal',        () => assert.equal(arraysEqual([], []), true));
test('null first arg → false',    () => assert.equal(arraysEqual(null, []), false));
test('null second arg → false',   () => assert.equal(arraysEqual([], null), false));
test('order matters',             () => assert.equal(arraysEqual(['Agi', 'Mig'], ['Mig', 'Agi']), false));

// ═══════════════════════════════════════════════════════════════════════════════
// normalizeAttributePriority
// ═══════════════════════════════════════════════════════════════════════════════

section('normalizeAttributePriority');

test('candidate comes first, fallback fills the rest', () => {
  const result = normalizeAttributePriority(['Cha', 'Mig'], ['Mig', 'Agi', 'Cha', 'Int']);
  assert.deepEqual(result, ['Cha', 'Mig', 'Agi', 'Int']);
});

test('case-insensitive normalisation', () => {
  const result = normalizeAttributePriority(['cha', 'mig'], ['Mig', 'Agi', 'Cha', 'Int']);
  assert.deepEqual(result, ['Cha', 'Mig', 'Agi', 'Int']);
});

test('duplicates in candidate are silently dropped', () => {
  const result = normalizeAttributePriority(['Mig', 'Mig', 'Agi'], ['Mig', 'Agi', 'Cha', 'Int']);
  assert.deepEqual(result, ['Mig', 'Agi', 'Cha', 'Int']);
});

test('unknown keys in candidate are skipped', () => {
  const result = normalizeAttributePriority(['UNKNOWN', 'Cha'], ['Mig', 'Agi', 'Cha', 'Int']);
  assert.deepEqual(result, ['Cha', 'Mig', 'Agi', 'Int']);
});

test('non-array candidate falls back to full fallback order', () => {
  const result = normalizeAttributePriority(null, ['Mig', 'Agi', 'Cha', 'Int']);
  assert.deepEqual(result, ['Mig', 'Agi', 'Cha', 'Int']);
});

test('empty candidate returns fallback order', () => {
  const result = normalizeAttributePriority([], ['Mig', 'Agi', 'Cha', 'Int']);
  assert.deepEqual(result, ['Mig', 'Agi', 'Cha', 'Int']);
});

test('full candidate replaces fallback (no extras needed)', () => {
  const result = normalizeAttributePriority(['Int', 'Cha', 'Agi', 'Mig'], ['Mig', 'Agi', 'Cha', 'Int']);
  assert.deepEqual(result, ['Int', 'Cha', 'Agi', 'Mig']);
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalizeRankValueDeltas
// ═══════════════════════════════════════════════════════════════════════════════

section('normalizeRankValueDeltas');

test('valid numeric entries are kept', () => {
  assert.deepEqual(normalizeRankValueDeltas({ 0: 2, 1: -1 }), { 0: 2, 1: -1 });
});

test('zero values are filtered out', () => {
  assert.deepEqual(normalizeRankValueDeltas({ 0: 2, 1: 0 }), { 0: 2 });
});

test('near-zero (< 1e-9) values are filtered out', () => {
  assert.deepEqual(normalizeRankValueDeltas({ 0: 1e-10 }), {});
});

test('string keys and values are coerced to numbers', () => {
  assert.deepEqual(normalizeRankValueDeltas({ '0': '3' }), { 0: 3 });
});

test('negative index filtered out', () => {
  assert.deepEqual(normalizeRankValueDeltas({ '-1': 2, 0: 1 }), { 0: 1 });
});

test('NaN values are filtered out', () => {
  assert.deepEqual(normalizeRankValueDeltas({ 0: 'abc' }), {});
});

test('null input returns empty object', () => {
  assert.deepEqual(normalizeRankValueDeltas(null), {});
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalizeAttributeValueDeltas
// ═══════════════════════════════════════════════════════════════════════════════

section('normalizeAttributeValueDeltas');

test('valid adjustments for known attributes are kept', () => {
  assert.deepEqual(normalizeAttributeValueDeltas({ Mig: 2, Agi: -1 }), { Mig: 2, Agi: -1 });
});

test('zero values filtered out', () => {
  assert.deepEqual(normalizeAttributeValueDeltas({ Mig: 2, Agi: 0 }), { Mig: 2 });
});

test('near-zero values filtered out', () => {
  assert.deepEqual(normalizeAttributeValueDeltas({ Mig: 1e-10 }), {});
});

test('unknown attribute keys are ignored', () => {
  assert.deepEqual(normalizeAttributeValueDeltas({ Mig: 1, Str: 5 }), { Mig: 1 });
});

test('string values are coerced to numbers', () => {
  assert.deepEqual(normalizeAttributeValueDeltas({ Mig: '3' }), { Mig: 3 });
});

test('null input returns empty object', () => {
  assert.deepEqual(normalizeAttributeValueDeltas(null), {});
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — baseline
//
// Level 5, none role, normal power, medium size, humanoid type, combatMastery 0
//   base:  HP=20, PD=14, AD=14, Check=6, Damage=3, AP=4, Speed=5, SaveDC=17
//   role (none):    HPFactor=1, PDMod=0, ADMod=0, CheckMod=0, SpeedMod=0, DamageMod=0
//   power (normal): HPFactor=1, PDMod=0, ADMod=0, CheckMod=0, SaveDCMod=0, DamageMod=0, APMod=0
//   type (humanoid):HPFactor=1, PDMod=2, ADMod=0, CheckMod=1, SaveDCMod=0, DamageMod=0
//   size (medium):  PDMod=0, ADMod=0, HPMod=1
//
//   HP  = ceil(20 × 1 × 1 × 1 × 1) = 20
//   PD  = 14 + 0 + 0 + 2 + 0 = 16
//   AD  = 14 + 0 + 0 + 0 + 0 = 14
//   dmg = 3  + 0 + 0 + 0 = 3
//   chk = 6  + 0 + 0 + 1 = 7
//   DC  = 17 + 0 + 0 = 17
//   AP  = 4  + 0 = 4
//   spd = 5  + 0 = 5
//   attributePriority (none): ['Mig','Agi','Cha','Int']
//   level-5 scores: [4, 2, 2, -1] → Mig=4, Agi=2, Cha=2, Int=-1
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — baseline (level 5, none/normal/medium/humanoid)');

test('HP calculated correctly', () => assert.equal(scaled().HP,     20));
test('PD calculated correctly', () => assert.equal(scaled().PD,     16));
test('AD calculated correctly', () => assert.equal(scaled().AD,     14));
test('damage calculated correctly', () => assert.equal(scaled().damage, 3));
test('check calculated correctly',  () => assert.equal(scaled().check,  7));
test('saveDC calculated correctly', () => assert.equal(scaled().saveDC, 17));
test('AP calculated correctly',     () => assert.equal(scaled().AP,     4));
test('speed calculated correctly',  () => assert.equal(scaled().speed,  5));

test('attribute priority follows role default', () => {
  assert.deepEqual(scaled().attributePriority, ['Mig', 'Agi', 'Cha', 'Int']);
});

test('attributes assigned in priority order from level-5 scores', () => {
  const { attributes } = scaled();
  assert.equal(attributes.Mig,  4);
  assert.equal(attributes.Agi,  2);
  assert.equal(attributes.Cha,  2);
  assert.equal(attributes.Int, -1);
});

test('Prime equals the score of the first-priority attribute', () => {
  assert.equal(scaled().attributes.Prime, 4);
  assert.equal(scaled().primeAttribute,   'Mig');
});

test('attributeSaves = score + combatMastery (0 here)', () => {
  const { attributeSaves } = scaled();
  assert.equal(attributeSaves.Mig,  4);
  assert.equal(attributeSaves.Int, -1);
});

test('attributeSaves include combatMastery bonus', () => {
  const { attributeSaves } = scaled({ combatMastery: 3 });
  assert.equal(attributeSaves.Mig, 7);  // 4 + 3
  assert.equal(attributeSaves.Int, 2);  // -1 + 3
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — role modifiers
//
// Brute: HPFactor=1.3, PDMod=-3, ADMod=0, CheckMod=0, SpeedMod=1, DamageMod=1
//   AttributePriority: ['Mig','Agi','Cha','Int']
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — role modifiers (brute, level 5)');

test('brute HPFactor increases HP', () => {
  // HP = ceil(20 × 1.3 × 1 × 1 × 1) = ceil(26) = 26
  assert.equal(scaled({ role: 'brute' }).HP, 26);
});

test('brute PDMod reduces PD', () => {
  // PD = 14 + (-3) + 0 + 2 + 0 = 13
  assert.equal(scaled({ role: 'brute' }).PD, 13);
});

test('brute DamageMod increases damage', () => {
  // dmg = 3 + 1 + 0 + 0 = 4
  assert.equal(scaled({ role: 'brute' }).damage, 4);
});

test('brute SpeedMod increases speed', () => {
  // speed = 5 + 1 = 6
  assert.equal(scaled({ role: 'brute' }).speed, 6);
});

test('artillerist attribute priority is Agi-first', () => {
  const { attributePriority, attributes } = scaled({ role: 'artillerist' });
  assert.deepEqual(attributePriority, ['Agi', 'Int', 'Cha', 'Mig']);
  // Level-5 scores [4, 2, 2, -1] assigned to [Agi, Int, Cha, Mig]
  assert.equal(attributes.Agi, 4);
  assert.equal(attributes.Mig, -1);
});

test('defender has negative damage modifier', () => {
  // dmg = 3 + (-1) + 0 + 0 = 2
  assert.equal(scaled({ role: 'defender' }).damage, 2);
});

test('defender has positive PD modifier', () => {
  // PD = 14 + 2 + 0 + 2 + 0 = 18
  assert.equal(scaled({ role: 'defender' }).PD, 18);
});

test('unknown role falls back to "none" modifiers', () => {
  const unknown = scaled({ role: 'wizard' });
  const none    = scaled({ role: 'none' });
  assert.equal(unknown.HP,    none.HP);
  assert.equal(unknown.PD,    none.PD);
  assert.equal(unknown.speed, none.speed);
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — power tiers (level 5, none/medium/humanoid)
//
// minion:    HPFactor=0.5, PDMod=-4, ADMod=-4, CheckMod=-1, SaveDCMod=-1, DamageMod=-1, APMod=-1
// weak:      HPFactor=0.7, PDMod=-2, ADMod=-2, CheckMod=-1, SaveDCMod=-1, DamageMod=0,  APMod=-1
// normal:    (baseline above)
// apex:      HPFactor=2.0, PDMod=2,  ADMod=2,  CheckMod=1,  SaveDCMod=1,  DamageMod=1,  APMod=0
// legendary: HPFactor=4.0, PDMod=2,  ADMod=2,  CheckMod=1,  SaveDCMod=1,  DamageMod=1,  APMod=0
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — power tiers');

test('minion: HP = ceil(20 × 0.5 × 1 × 1) = 10', () => {
  assert.equal(scaled({ power: 'minion' }).HP, 10);
});
test('minion: PD = 14 + (-4) + 2 = 12', () => {
  assert.equal(scaled({ power: 'minion' }).PD, 12);
});
test('minion: AP = 4 + (-1) = 3', () => {
  assert.equal(scaled({ power: 'minion' }).AP, 3);
});
test('minion: saveDC = 17 + (-1) + 0 = 16', () => {
  assert.equal(scaled({ power: 'minion' }).saveDC, 16);
});
test('minion: damage = 3 + (-1) + 0 = 2', () => {
  assert.equal(scaled({ power: 'minion' }).damage, 2);
});

test('apex: HP = ceil(20 × 2.0 × 1 × 1) = 40', () => {
  assert.equal(scaled({ power: 'apex' }).HP, 40);
});
test('apex: PD = 14 + 2 + 2 + 0 = 18', () => {
  assert.equal(scaled({ power: 'apex' }).PD, 18);
});
test('apex: saveDC = 17 + 1 + 0 = 18', () => {
  assert.equal(scaled({ power: 'apex' }).saveDC, 18);
});

test('legendary: HP = ceil(20 × 4.0 × 1 × 1) = 80', () => {
  assert.equal(scaled({ power: 'legendary' }).HP, 80);
});
test('legendary: damage = 3 + 1 + 0 = 4', () => {
  assert.equal(scaled({ power: 'legendary' }).damage, 4);
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — size scaling (level 5, none/normal/humanoid)
//
// tiny:       PDMod=2,  ADMod=-2, HPMod=0.6
// small:      PDMod=1,  ADMod=-1, HPMod=0.8
// large:      PDMod=-1, ADMod=1,  HPMod=1.2
// gargantuan: PDMod=-4, ADMod=4,  HPMod=1.6
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — size scaling');

test('tiny:       HP = ceil(20 × 0.6) = 12', () => {
  assert.equal(scaled({ size: 'tiny' }).HP, 12);
});
test('tiny:       PD = 14 + 2 + 2 = 18', () => {
  assert.equal(scaled({ size: 'tiny' }).PD, 18);
});
test('tiny:       AD = 14 + (-2) + 0 = 12', () => {
  assert.equal(scaled({ size: 'tiny' }).AD, 12);
});

test('large:      HP = ceil(20 × 1.2) = 24', () => {
  assert.equal(scaled({ size: 'large' }).HP, 24);
});
test('large:      PD = 14 + (-1) + 2 = 15', () => {
  assert.equal(scaled({ size: 'large' }).PD, 15);
});
test('large:      AD = 14 + 1 + 0 = 15', () => {
  assert.equal(scaled({ size: 'large' }).AD, 15);
});

test('gargantuan: HP = ceil(20 × 1.6) = 32', () => {
  assert.equal(scaled({ size: 'gargantuan' }).HP, 32);
});
test('gargantuan: PD = 14 + (-4) + 2 = 12', () => {
  assert.equal(scaled({ size: 'gargantuan' }).PD, 12);
});
test('gargantuan: AD = 14 + 4 + 0 = 18', () => {
  assert.equal(scaled({ size: 'gargantuan' }).AD, 18);
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — type modifiers (level 5, none/normal/medium)
//
// beast:  HPFactor=1.2, PDMod=1, ADMod=1, DamageMod=0.5
// dragon: HPFactor=1.3, PDMod=1, ADMod=1, DamageMod=1
// ooze:   HPFactor=1.5, PDMod=-2, ADMod=2, CheckMod=-1
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — type modifiers');

test('beast:  HP = ceil(20 × 1.2) = 24', () => {
  assert.equal(scaled({ type: 'beast' }).HP, 24);
});
test('beast:  damage = 3 + 0.5 = 3.5', () => {
  assert.equal(scaled({ type: 'beast' }).damage, 3.5);
});

test('dragon: HP = ceil(20 × 1.3) = 26', () => {
  assert.equal(scaled({ type: 'dragon' }).HP, 26);
});
test('dragon: damage = 3 + 1 = 4', () => {
  assert.equal(scaled({ type: 'dragon' }).damage, 4);
});
test('dragon: PD = 14 + 1 + 0 = 15 (humanoid type removed)', () => {
  // With type='dragon': typeScaling.PDMod=1 (not humanoid's 2)
  assert.equal(scaled({ type: 'dragon' }).PD, 15);
});

test('ooze: HP = ceil(20 × 1.5) = 30', () => {
  assert.equal(scaled({ type: 'ooze' }).HP, 30);
});
test('ooze: check penalised by -1 (CheckMod=-1)', () => {
  // chk = 6 + 0 + 0 + (-1) = 5
  assert.equal(scaled({ type: 'ooze' }).check, 5);
});

test('unknown type falls back to neutral factors', () => {
  // HP = ceil(20 × 1.0) = 20 (no HPFactor boost)
  const result = scaled({ type: 'treant' });
  assert.equal(result.HP,     20);
  assert.equal(result.damage, 3);
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — level scaling
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — level scaling');

test('level 0: HP = ceil(7 × 1 × 1 × 1 × 1) = 7', () => {
  assert.equal(scaled({ level: 0 }).HP, 7);
});
test('level 0: PD = 10 + 2 = 12', () => {
  assert.equal(scaled({ level: 0 }).PD, 12);
});
test('level 0: attribute prime = 2 (level-0 score)', () => {
  assert.equal(scaled({ level: 0 }).attributes.Mig, 2);
});

test('level 10: HP = ceil(34 × 1 × 1 × 1) = 34', () => {
  assert.equal(scaled({ level: 10 }).HP, 34);
});
test('level 10: saveDC = 20', () => {
  assert.equal(scaled({ level: 10 }).saveDC, 20);
});
test('level 10: attribute prime = 5', () => {
  assert.equal(scaled({ level: 10 }).attributes.Mig, 5);
});

test('level-1 PD = 11 + 2 = 13', () => {
  assert.equal(scaled({ level: 1 }).PD, 13);
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — HP ceiling
//
// HP uses Math.ceil so fractional results always round UP.
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — HP ceiling (fractional factors)');

test('level 3, brute, normal, large, beast: HP = ceil(14 × 1.3 × 1.0 × 1.2 × 1.2) = 27', () => {
  // 14 × 1.3 × 1.2 × 1.2 = 14 × 1.872 = 26.208 → ceil = 27
  assert.equal(computeScaledStats({ level: 3, role: 'brute', power: 'normal', size: 'large', type: 'beast', deltas: {}, combatMastery: 0 }).HP, 27);
});

test('level 2, minion, small, none/humanoid: HP ceiling applied correctly', () => {
  // base HP=12; power minion HPFactor=0.5; size small HPMod=0.8; role HPFactor=1; type HPFactor=1
  // 12 × 0.5 × 0.8 = 4.8 → ceil = 5
  assert.equal(computeScaledStats({ level: 2, role: 'none', power: 'minion', size: 'small', type: 'humanoid', deltas: {}, combatMastery: 0 }).HP, 5);
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — deltas: attribute priority override
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — custom attribute priority');

test('custom priority reorders attribute score assignment', () => {
  // Default none-role priority: Mig, Agi, Cha, Int → Mig gets prime score
  // Custom: Cha first → Cha gets level-5 prime score (4)
  const result = scaled({
    deltas: { attributePriority: ['Cha', 'Mig', 'Agi', 'Int'], attributePriorityCustom: true },
  });
  assert.deepEqual(result.attributePriority, ['Cha', 'Mig', 'Agi', 'Int']);
  assert.equal(result.attributes.Cha, 4);   // prime score
  assert.equal(result.attributes.Mig, 2);   // secondary score
  assert.equal(result.primeAttribute,  'Cha');
});

test('custom priority without attributePriorityCustom flag is ignored', () => {
  // Missing attributePriorityCustom:true means no custom priority
  const result = scaled({
    deltas: { attributePriority: ['Cha', 'Mig', 'Agi', 'Int'] }, // no Custom flag
  });
  assert.deepEqual(result.attributePriority, ['Mig', 'Agi', 'Cha', 'Int']); // default
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — deltas: rank value deltas
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — rank value deltas');

test('rank 0 delta boosts prime attribute score', () => {
  // Level 5: Mig base = 4; rankValueDelta[0] = +2 → Mig = 6
  const result = scaled({ deltas: { rankValueDeltas: { 0: 2 } } });
  assert.equal(result.attributes.Mig, 6);
  assert.equal(result.attributes.Agi, 2); // unaffected
});

test('rank 3 delta adjusts quaternary attribute', () => {
  // Level 5: Int base = -1; rankValueDelta[3] = +3 → Int = 2
  const result = scaled({ deltas: { rankValueDeltas: { 3: 3 } } });
  assert.equal(result.attributes.Int, 2);
});

test('negative rank delta reduces attribute score', () => {
  // Level 5: Mig = 4; delta[0] = -2 → Mig = 2
  const result = scaled({ deltas: { rankValueDeltas: { 0: -2 } } });
  assert.equal(result.attributes.Mig, 2);
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — deltas: attribute value deltas
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — attribute value deltas');

test('direct attribute delta adjusts specific attribute', () => {
  // Level 5: Agi base = 2; delta.Agi = +3 → Agi = 5
  const result = scaled({ deltas: { attributes: { Agi: 3 } } });
  assert.equal(result.attributes.Agi, 5);
  assert.equal(result.attributes.Mig, 4); // unaffected
});

test('attribute delta stacks with rank delta', () => {
  // Mig: base=4, rankDelta[0]=1, attrDelta.Mig=2 → Mig = 7
  const result = scaled({ deltas: { rankValueDeltas: { 0: 1 }, attributes: { Mig: 2 } } });
  assert.equal(result.attributes.Mig, 7);
});

// ═══════════════════════════════════════════════════════════════════════════════
// computeScaledStats — skills
// ═══════════════════════════════════════════════════════════════════════════════

section('computeScaledStats — skills');

test('none role returns empty skills array', () => {
  assert.deepEqual(scaled({ role: 'none' }).skills, []);
});

test('brute role returns correct skills', () => {
  assert.deepEqual(scaled({ role: 'brute' }).skills, ['athletics', 'awareness', 'survival']);
});

test('lurker role includes stealth', () => {
  assert.ok(scaled({ role: 'lurker' }).skills.includes('stealth'));
});

// ═══════════════════════════════════════════════════════════════════════════════
// applyNumericDeltas
// ═══════════════════════════════════════════════════════════════════════════════

section('applyNumericDeltas');

function makeCreature(overrides = {}) {
  return { HP: 20, PD: 16, AD: 14, damage: 3, check: 7, saveDC: 17, AP: 4, speed: 5, ...overrides };
}

test('applies positive deltas to all numeric fields', () => {
  const c = makeCreature({ deltas: { HP: 5, PD: 2, damage: 1 } });
  applyNumericDeltas(c);
  assert.equal(c.HP,     25);
  assert.equal(c.PD,     18);
  assert.equal(c.damage,  4);
  assert.equal(c.AD,     14); // untouched
});

test('applies negative deltas', () => {
  const c = makeCreature({ deltas: { HP: -5, PD: -2 } });
  applyNumericDeltas(c);
  assert.equal(c.HP, 15);
  assert.equal(c.PD, 14);
});

test('zero delta is skipped (no change)', () => {
  const c = makeCreature({ deltas: { HP: 0, PD: 2 } });
  applyNumericDeltas(c);
  assert.equal(c.HP, 20); // unchanged
  assert.equal(c.PD, 18);
});

test('near-zero delta (< 1e-9 abs) is skipped', () => {
  const c = makeCreature({ deltas: { HP: 1e-10 } });
  applyNumericDeltas(c);
  assert.equal(c.HP, 20);
});

test('fractional deltas are applied as-is (no rounding)', () => {
  const c = makeCreature({ deltas: { damage: 0.5 } });
  applyNumericDeltas(c);
  assert.equal(c.damage, 3.5);
});

test('no deltas object → no change', () => {
  const c = makeCreature();
  applyNumericDeltas(c);
  assert.equal(c.HP, 20);
});

test('non-object deltas → no change', () => {
  const c = makeCreature({ deltas: 'invalid' });
  applyNumericDeltas(c);
  assert.equal(c.HP, 20);
});

test('all eight numeric delta fields are applied', () => {
  const c = makeCreature({
    deltas: { HP: 1, PD: 1, AD: 1, damage: 1, check: 1, saveDC: 1, AP: 1, speed: 1 },
  });
  applyNumericDeltas(c);
  assert.equal(c.HP,     21);
  assert.equal(c.PD,     17);
  assert.equal(c.AD,     15);
  assert.equal(c.damage,  4);
  assert.equal(c.check,   8);
  assert.equal(c.saveDC, 18);
  assert.equal(c.AP,      5);
  assert.equal(c.speed,   6);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n${'─'.repeat(55)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

/**
 * features.test.mjs
 *
 * Tests for the feature drawing pipeline:
 *   - buildAction()          pure transform: raw feature data → action object
 *   - applyFeatureEffects()  applies features (modifiers/actions/passives) to a creature
 *   - hasHalfDamage()        detects .5 damage values (heavy-hit bonus indicator)
 *   - createActionCardElement() DOM rendering for all four DC20 mechanic types
 *
 * Run with:  node tests/features.test.mjs
 *
 * No extra dependencies — uses Node's built-in assert module.
 * actionCardRenderer.js is imported directly; it only touches `document` inside
 * function bodies (never at module-evaluation time) so the global mock below
 * is set up before any rendering function is called.
 */

import assert from 'node:assert/strict';
import { createActionCardElement, hasHalfDamage, createActionBadges } from '../public/actionCardRenderer.js';

// ── Minimal DOM mock ──────────────────────────────────────────────────────────
// createActionCardElement uses document.createElement and standard node APIs.
// This lightweight mock produces a traversable tree so we can inspect output.

function createMockNode(tag) {
  return {
    tag,
    className: '',
    dataset: {},
    textContent: '',
    title: '',
    type: '',
    children: [],
    classList: {
      _classes: new Set(),
      add(cls) { this._classes.add(cls); },
      contains(cls) { return this._classes.has(cls); },
    },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(event, fn) {
      (this._listeners ??= {})[event] ??= [];
      this._listeners[event].push(fn);
    },
  };
}

global.document = { createElement: (tag) => createMockNode(tag) };

// Recursively concatenate all text from a mock node tree.
// Handles numeric textContent (e.g. damage amounts stored as numbers).
function getFullText(node) {
  if (!node || typeof node !== 'object') return '';
  let text = '';
  const tc = node.textContent;
  if (tc !== '' && tc !== undefined && tc !== null) text += String(tc);
  for (const child of node.children ?? []) text += getFullText(child);
  return text;
}

// Find the first descendant (or self) whose className matches.
function findByClass(node, cls) {
  if (!node || typeof node !== 'object') return null;
  if (node.className === cls) return node;
  for (const child of node.children ?? []) {
    const found = findByClass(child, cls);
    if (found) return found;
  }
  return null;
}

// ── Inlined pure functions from features.js ───────────────────────────────────
// features.js imports Firebase CDN URLs so it cannot be loaded in Node.js.
// The functions below are verbatim copies of the pure, DOM-free helpers.

const FEATURE_TYPES = Object.freeze({ MODIFIER: 'modifier', PASSIVE: 'passive', ACTION: 'action' });

function normalizeFeatureType(type) {
  const value = String(type ?? '').toLowerCase();
  if (!value) return value;
  if (value === FEATURE_TYPES.ACTION)   return FEATURE_TYPES.ACTION;
  if (value === FEATURE_TYPES.MODIFIER) return FEATURE_TYPES.MODIFIER;
  if (value === FEATURE_TYPES.PASSIVE)  return FEATURE_TYPES.PASSIVE;
  if (value.startsWith('action'))       return FEATURE_TYPES.ACTION;
  return value;
}

function getActionDescription(feature) {
  if (!feature) return '';
  const effects = feature.effects ?? {};
  const d = effects.actionDescription ?? feature.description ?? feature.featureDescription ?? '';
  return typeof d === 'string' ? d.trim() : '';
}

function buildAction(creature, feature) {
  if (!feature.effects) return null;
  const { effects } = feature;
  const actionType        = feature.actionType ?? effects.actionType ?? 'Attack';
  const isReaction        = Boolean(feature.isReaction        || effects.isReaction);
  const reactionTrigger   = feature.reactionTrigger   ?? effects.reactionTrigger   ?? '';
  const isLegendaryAction = Boolean(feature.isLegendaryAction || effects.isLegendaryAction);
  const isApexAction      = Boolean(feature.isApexAction      || effects.isApexAction);
  const baseDamage        = creature.damage ?? 0;
  const segments          = Array.isArray(effects.damageSegments) ? effects.damageSegments : [];
  const actionTypeLabel   = typeof actionType === 'string' ? actionType.toLowerCase() : '';
  const isAttackType      = actionTypeLabel.includes('attack');

  const mappedSegments = segments.length
    ? segments
        .map((seg) => {
          if (typeof seg.amount === 'number') return { amount: seg.amount, type: seg.type ?? '' };
          return {
            useBase:  Boolean(seg.useBase),
            modifier: typeof seg.modifier === 'number' ? seg.modifier : 0,
            type:     seg.type ?? '',
          };
        })
        .filter((seg) => seg.useBase || (seg.modifier ?? 0) !== 0 || seg.type || seg.amount != null)
    : [];

  const damage =
    mappedSegments.length > 0
      ? mappedSegments
      : isAttackType
        ? [{ useBase: true, modifier: 0, type: effects.damageType ?? '' }]
        : [];

  const check = effects.check
    ? {
        dc:           typeof effects.check.dc === 'number' ? effects.check.dc : Number(effects.check.dc) || null,
        failure:      effects.check.failure      ?? '',
        failureEach5: effects.check.failureEach5 ?? '',
        success:      effects.check.success      ?? '',
        successEach5: effects.check.successEach5 ?? '',
      }
    : null;

  return {
    id:               feature.id,
    isCustom:         Boolean(feature.isCustom),
    name:             feature.name || feature.id || 'Unnamed Action',
    description:      getActionDescription(feature),
    cost:             typeof effects.cost === 'number' ? effects.cost : Number(effects.cost) || 0,
    actionType,
    damage,
    targetDefense:    effects.targetDefense ?? (isAttackType ? 'PD' : ''),
    target:           effects.target ?? '',
    range:            effects.range  ?? '',
    dc:               effects.dc ?? (check ? check.dc : null),
    check,
    save: effects.save
      ? {
          attribute:    effects.save.attribute    ?? '',
          failure:      effects.save.failure      ?? effects.save.effect ?? '',
          failureEach5: effects.save.failureEach5 ?? '',
          success:      effects.save.success      ?? '',
          successEach5: effects.save.successEach5 ?? '',
          repeatable:   Boolean(effects.save.repeatable),
          duration:     effects.save.duration     ?? '',
        }
      : null,
    saveDC:           typeof creature.saveDC === 'number' ? creature.saveDC : Number(creature.saveDC) || 0,
    featureCost:      feature.featureCost ?? 0,
    isReaction,
    reactionTrigger:  reactionTrigger ? String(reactionTrigger).trim() : '',
    isLegendaryAction,
    isApexAction,
    enhancements:     Array.isArray(effects.enhancements) ? effects.enhancements : [],
  };
}

function mergeTraits(target, source) {
  if (!source) return;
  if (Array.isArray(source.damage))    source.damage.forEach((e)    => { if (!target.damage.includes(e))    target.damage.push(e); });
  if (Array.isArray(source.condition)) source.condition.forEach((e) => { if (!target.condition.includes(e)) target.condition.push(e); });
}

function mergeTraitGroup(target, additions) {
  if (!target || !additions) return;
  additions.damage.forEach((e)    => { if (!target.damage.includes(e))    target.damage.push(e); });
  additions.condition.forEach((e) => { if (!target.condition.includes(e)) target.condition.push(e); });
}

function applyModifier(bucket, effects) {
  if (typeof effects.hp     === 'number') bucket.hp     += effects.hp;
  if (typeof effects.pd     === 'number') bucket.pd     += effects.pd;
  if (typeof effects.ad     === 'number') bucket.ad     += effects.ad;
  if (typeof effects.speed  === 'number') bucket.speed  += effects.speed;
  if (typeof effects.damage === 'number') bucket.damage += effects.damage;
  mergeTraits(bucket.resistances,    effects.resistances);
  mergeTraits(bucket.vulnerabilities, effects.vulnerabilities);
  mergeTraits(bucket.immunities,     effects.immunities);
  if (Array.isArray(effects.senses)) bucket.senses.push(...effects.senses);
}

function applyModifiersToCreature(creature, modifiers) {
  creature.HP     += modifiers.hp;
  creature.PD     += modifiers.pd;
  creature.AD     += modifiers.ad;
  creature.speed  += modifiers.speed;
  creature.damage += modifiers.damage;
  mergeTraitGroup(creature.resistances,     modifiers.resistances);
  mergeTraitGroup(creature.vulnerabilities, modifiers.vulnerabilities);
  mergeTraitGroup(creature.immunities,      modifiers.immunities);
  if (Array.isArray(modifiers.senses) && modifiers.senses.length) {
    creature.senses ??= [];
    modifiers.senses.forEach((s) => { if (!creature.senses.includes(s)) creature.senses.push(s); });
  }
}

function applyFeatureEffects(creature, features, customFeatures = []) {
  const allFeatures = [...(features || []), ...(customFeatures || [])];
  if (!allFeatures.length) {
    creature.featureActions   = [];
    creature.featureReactions = [];
    creature.featurePassives  = [];
    return;
  }
  const modifiers = {
    hp: 0, pd: 0, ad: 0, speed: 0, damage: 0,
    resistances:    { damage: [], condition: [] },
    vulnerabilities:{ damage: [], condition: [] },
    immunities:     { damage: [], condition: [] },
    senses: [],
  };
  const actionFeatures = [];
  const passives       = [];
  allFeatures.forEach((feature) => {
    if (!feature) return;
    const { effects } = feature;
    const type = normalizeFeatureType(feature.type);
    if (!effects) return;
    if      (type === FEATURE_TYPES.MODIFIER) { applyModifier(modifiers, effects); if (feature.isCustom) passives.push(feature); }
    else if (type === FEATURE_TYPES.ACTION)   actionFeatures.push(feature);
    else if (type === FEATURE_TYPES.PASSIVE)  passives.push(feature);
  });
  applyModifiersToCreature(creature, modifiers);
  const builtActions = actionFeatures.map((f) => buildAction(creature, f)).filter(Boolean);
  creature.featureActions   = builtActions.filter((a) => !a.isReaction);
  creature.featureReactions = builtActions.filter((a) =>  a.isReaction);
  creature.featurePassives  = passives;
}

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

// ── Fixture ───────────────────────────────────────────────────────────────────

function baseCreature(overrides = {}) {
  return {
    HP: 10, PD: 10, AD: 10, speed: 5, damage: 3, saveDC: 12,
    resistances:    { damage: [], condition: [] },
    vulnerabilities:{ damage: [], condition: [] },
    immunities:     { damage: [], condition: [] },
    senses: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// buildAction — core fields
// ═══════════════════════════════════════════════════════════════════════════════

section('buildAction — core fields');

test('name falls through id to "Unnamed Action" when both absent', () => {
  const action = buildAction(baseCreature(), { effects: {} });
  assert.equal(action.name, 'Unnamed Action');
});

test('name uses feature.name when provided', () => {
  const action = buildAction(baseCreature(), { effects: {}, name: 'Fireball' });
  assert.equal(action.name, 'Fireball');
});

test('name falls back to id when name is absent', () => {
  const action = buildAction(baseCreature(), { effects: {}, id: 'my-id' });
  assert.equal(action.name, 'my-id');
});

test('cost defaults to 0', () => {
  assert.equal(buildAction(baseCreature(), { effects: {} }).cost, 0);
});

test('cost parsed from effects.cost', () => {
  assert.equal(buildAction(baseCreature(), { effects: { cost: 2 } }).cost, 2);
});

test('saveDC is taken from creature', () => {
  assert.equal(buildAction(baseCreature({ saveDC: 15 }), { effects: {} }).saveDC, 15);
});

test('returns null when effects is absent', () => {
  assert.equal(buildAction(baseCreature(), {}), null);
});

test('isCustom flag propagated', () => {
  assert.equal(buildAction(baseCreature(), { effects: {}, isCustom: true }).isCustom, true);
  assert.equal(buildAction(baseCreature(), { effects: {} }).isCustom, false);
});

test('description prefers effects.actionDescription over feature.featureDescription', () => {
  const action = buildAction(baseCreature(), {
    featureDescription: 'outer desc',
    effects: { actionDescription: 'inner desc' },
  });
  assert.equal(action.description, 'inner desc');
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildAction — Mechanic type 1: Check vs Defense (attack, no save)
// ═══════════════════════════════════════════════════════════════════════════════

section('buildAction — mechanic type 1: Check vs Defense');

test('targetDefense PD is set; save is null', () => {
  const action = buildAction(baseCreature(), {
    actionType: 'Melee Martial Attack',
    effects: { cost: 1, targetDefense: 'PD' },
  });
  assert.equal(action.targetDefense, 'PD');
  assert.equal(action.save, null);
});

test('damage defaults to one useBase segment for attack types', () => {
  const action = buildAction(baseCreature(), {
    actionType: 'Melee Martial Attack',
    effects: { targetDefense: 'PD' },
  });
  assert.equal(action.damage.length, 1);
  assert.equal(action.damage[0].useBase, true);
  assert.equal(action.damage[0].modifier, 0);
});

test('explicit damageSegments override the default', () => {
  const action = buildAction(baseCreature(), {
    actionType: 'Melee Martial Attack',
    effects: {
      targetDefense: 'PD',
      damageSegments: [
        { useBase: true, modifier: 1, type: 'Slashing' },
        { amount: 3,                  type: 'Fire'     },
      ],
    },
  });
  assert.equal(action.damage.length, 2);
  assert.equal(action.damage[0].modifier, 1);
  assert.equal(action.damage[0].type,     'Slashing');
  assert.equal(action.damage[1].amount,   3);
  assert.equal(action.damage[1].type,     'Fire');
});

test('AD defense is preserved', () => {
  const action = buildAction(baseCreature(), {
    actionType: 'Arcane Attack',
    effects: { targetDefense: 'AD' },
  });
  assert.equal(action.targetDefense, 'AD');
});

test('attack type infers PD targetDefense when none given', () => {
  const action = buildAction(baseCreature(), {
    actionType: 'Ranged Martial Attack',
    effects: {},
  });
  assert.equal(action.targetDefense, 'PD');
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildAction — Mechanic type 2: Check vs Save (effect only, no targetDefense)
// ═══════════════════════════════════════════════════════════════════════════════

section('buildAction — mechanic type 2: Check vs Save');

test('save block built correctly', () => {
  const action = buildAction(baseCreature(), {
    actionType: 'Mig Save',
    effects: {
      save: {
        attribute:    'Mig',
        failure:      'Prone',
        failureEach5: 'Stunned',
        success:      'Half speed',
        repeatable:   true,
        duration:     'until the end of its next turn',
      },
    },
  });
  assert.equal(action.targetDefense, '');
  assert.deepEqual(action.save, {
    attribute:    'Mig',
    failure:      'Prone',
    failureEach5: 'Stunned',
    success:      'Half speed',
    successEach5: '',
    repeatable:   true,
    duration:     'until the end of its next turn',
  });
  // Non-attack type with no explicit damageSegments → no damage
  assert.equal(action.damage.length, 0);
});

test('save.effect alias maps to save.failure', () => {
  const action = buildAction(baseCreature(), {
    effects: { save: { attribute: 'Agi', effect: 'Knocked back' } },
  });
  assert.equal(action.save.failure, 'Knocked back');
});

test('targetDefense is absent when only save is present (non-attack actionType)', () => {
  // Without an explicit actionType the code defaults to 'Attack', which infers PD.
  // A true Check vs Save feature must use a non-attack actionType.
  const action = buildAction(baseCreature(), {
    actionType: 'Int Save',
    effects: { save: { attribute: 'Int', failure: 'Blinded' } },
  });
  assert.equal(action.targetDefense, '');
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildAction — Mechanic type 3: Check vs DC (utility/buff)
// ═══════════════════════════════════════════════════════════════════════════════

section('buildAction — mechanic type 3: Check vs DC (utility)');

test('check block parsed; no targetDefense, no save', () => {
  const action = buildAction(baseCreature(), {
    actionType: 'Utility',
    effects: {
      check: { dc: 14, failure: 'No effect', success: 'Ally gains benefit', failureEach5: 'Setback' },
    },
  });
  assert.equal(action.targetDefense, '');
  assert.equal(action.save,          null);
  assert.equal(action.check.dc,           14);
  assert.equal(action.check.failure,      'No effect');
  assert.equal(action.check.success,      'Ally gains benefit');
  assert.equal(action.check.failureEach5, 'Setback');
});

test('check.dc parsed from string', () => {
  const action = buildAction(baseCreature(), {
    effects: { check: { dc: '12', failure: 'x', success: 'y' } },
  });
  assert.equal(action.check.dc, 12);
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildAction — Mechanic type 4: Dynamic Attack Save (damage + condition)
// ═══════════════════════════════════════════════════════════════════════════════

section('buildAction — mechanic type 4: Dynamic Attack Save');

test('both targetDefense and save are set', () => {
  const action = buildAction(baseCreature({ saveDC: 13 }), {
    actionType: 'Melee Martial Attack',
    effects: {
      targetDefense: 'PD',
      save: { attribute: 'Agi', failure: 'Knocked back 2 spaces' },
    },
  });
  assert.equal(action.targetDefense,   'PD');
  assert.ok(action.save !== null,      'save block present');
  assert.equal(action.save.attribute,  'Agi');
  assert.equal(action.save.failure,    'Knocked back 2 spaces');
  assert.equal(action.saveDC,          13);
  assert.ok(action.damage.length > 0, 'damage segments present');
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildAction — reaction flags
// ═══════════════════════════════════════════════════════════════════════════════

section('buildAction — reaction flags');

test('isReaction from feature level', () => {
  assert.equal(buildAction(baseCreature(), { effects: {}, isReaction: true }).isReaction, true);
});

test('isReaction from effects level', () => {
  assert.equal(buildAction(baseCreature(), { effects: { isReaction: true } }).isReaction, true);
});

test('reactionTrigger is trimmed', () => {
  const action = buildAction(baseCreature(), {
    effects: {}, isReaction: true, reactionTrigger: '  When hit  ',
  });
  assert.equal(action.reactionTrigger, 'When hit');
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildAction — legendary / apex flags
// ═══════════════════════════════════════════════════════════════════════════════

section('buildAction — legendary/apex flags');

test('isLegendaryAction from feature', () => {
  assert.equal(buildAction(baseCreature(), { effects: {}, isLegendaryAction: true }).isLegendaryAction, true);
});

test('isApexAction from effects', () => {
  assert.equal(buildAction(baseCreature(), { effects: { isApexAction: true } }).isApexAction, true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildAction — enhancements
// ═══════════════════════════════════════════════════════════════════════════════

section('buildAction — enhancements');

test('enhancements array passed through as-is', () => {
  const enh = [{ name: 'Empower', cost: 1, description: 'Add 2d6 fire.' }];
  assert.deepEqual(buildAction(baseCreature(), { effects: { enhancements: enh } }).enhancements, enh);
});

test('missing enhancements defaults to empty array', () => {
  assert.deepEqual(buildAction(baseCreature(), { effects: {} }).enhancements, []);
});

// ═══════════════════════════════════════════════════════════════════════════════
// applyFeatureEffects — modifiers
// ═══════════════════════════════════════════════════════════════════════════════

section('applyFeatureEffects — stat modifiers');

test('HP/PD/AD/speed/damage modifiers are summed', () => {
  const c = baseCreature({ HP: 10, PD: 10, AD: 10, speed: 5, damage: 3 });
  applyFeatureEffects(c, [
    { type: 'modifier', effects: { hp: 5, pd: 2, ad: 1, speed: 1, damage: 1 } },
    { type: 'modifier', effects: { hp: 3, damage: 2 } },
  ]);
  assert.equal(c.HP,     18);
  assert.equal(c.PD,     12);
  assert.equal(c.AD,     11);
  assert.equal(c.speed,   6);
  assert.equal(c.damage,  6);
});

test('resistance/vulnerability/immunity arrays merged without duplicates', () => {
  const c = baseCreature();
  applyFeatureEffects(c, [
    { type: 'modifier', effects: { resistances: { damage: ['Fire', 'Cold'], condition: ['Prone'] }, immunities: { damage: ['Poison'], condition: [] } } },
    { type: 'modifier', effects: { resistances: { damage: ['Fire'], condition: [] } } }, // 'Fire' duplicate
  ]);
  assert.deepEqual(c.resistances.damage,    ['Fire', 'Cold']);
  assert.deepEqual(c.resistances.condition, ['Prone']);
  assert.deepEqual(c.immunities.damage,     ['Poison']);
});

test('senses merged without duplicates', () => {
  const c = baseCreature();
  applyFeatureEffects(c, [
    { type: 'modifier', effects: { senses: ['Darkvision 60'] } },
    { type: 'modifier', effects: { senses: ['Darkvision 60', 'Blindsight 30'] } },
  ]);
  assert.deepEqual(c.senses, ['Darkvision 60', 'Blindsight 30']);
});

// ═══════════════════════════════════════════════════════════════════════════════
// applyFeatureEffects — routing to the right arrays
// ═══════════════════════════════════════════════════════════════════════════════

section('applyFeatureEffects — feature routing');

test('action features → featureActions', () => {
  const c = baseCreature();
  applyFeatureEffects(c, [
    { type: 'action', name: 'Slash', actionType: 'Melee Martial Attack', effects: { cost: 1, targetDefense: 'PD' } },
  ]);
  assert.equal(c.featureActions.length,   1);
  assert.equal(c.featureActions[0].name,  'Slash');
  assert.equal(c.featureReactions.length, 0);
});

test('reaction features → featureReactions', () => {
  const c = baseCreature();
  applyFeatureEffects(c, [
    { type: 'action', name: 'Parry', isReaction: true, reactionTrigger: 'When hit by melee', effects: { cost: 0 } },
  ]);
  assert.equal(c.featureReactions.length,            1);
  assert.equal(c.featureReactions[0].name,           'Parry');
  assert.equal(c.featureReactions[0].reactionTrigger,'When hit by melee');
  assert.equal(c.featureActions.length,              0);
});

test('passive features → featurePassives', () => {
  const c = baseCreature();
  applyFeatureEffects(c, [
    { type: 'passive', name: 'Keen Senses', effects: { text: 'Advantage on Perception.' } },
  ]);
  assert.equal(c.featurePassives.length,  1);
  assert.equal(c.featurePassives[0].name, 'Keen Senses');
});

test('"action-attack" type prefix is treated as action', () => {
  const c = baseCreature();
  applyFeatureEffects(c, [
    { type: 'action-attack', name: 'Bite', actionType: 'Melee Martial Attack', effects: { cost: 1, targetDefense: 'PD' } },
  ]);
  assert.equal(c.featureActions.length, 1);
});

test('empty feature list zeros out all feature arrays', () => {
  const c = baseCreature();
  c.featureActions = [{}];
  applyFeatureEffects(c, []);
  assert.deepEqual(c.featureActions,   []);
  assert.deepEqual(c.featureReactions, []);
  assert.deepEqual(c.featurePassives,  []);
});

test('custom modifier applies stat change AND appears in featurePassives', () => {
  const c = baseCreature();
  applyFeatureEffects(c, [
    { type: 'modifier', isCustom: true, name: 'Big Wings', effects: { speed: 3 } },
  ]);
  assert.equal(c.speed,                  8);
  assert.equal(c.featurePassives.length, 1);
  assert.equal(c.featurePassives[0].name,'Big Wings');
});

test('null entries in feature list are silently skipped', () => {
  const c = baseCreature();
  applyFeatureEffects(c, [null, undefined, { type: 'passive', name: 'Sharp Claws', effects: {} }]);
  assert.equal(c.featurePassives.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// hasHalfDamage
// ═══════════════════════════════════════════════════════════════════════════════

section('hasHalfDamage');

test('false for whole-number useBase segment', () => {
  assert.equal(hasHalfDamage([{ useBase: true, modifier: 0 }], 4), false);
});

test('true when useBase segment resolves to X.5', () => {
  // baseDamage=3, modifier=0.5 → 3.5
  assert.equal(hasHalfDamage([{ useBase: true, modifier: 0.5 }], 3), true);
});

test('true for explicit amount ending in .5', () => {
  assert.equal(hasHalfDamage([{ amount: 2.5 }], 0), true);
});

test('false for empty segments array', () => {
  assert.equal(hasHalfDamage([], 5), false);
});

test('only the .5 segment needs to match; others can be whole', () => {
  assert.equal(hasHalfDamage([{ amount: 4 }, { amount: 1.5 }], 0), true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// createActionCardElement — structure
// ═══════════════════════════════════════════════════════════════════════════════

section('createActionCardElement — card structure');

test('wrapper has class "statblock-action-item"', () => {
  const action = buildAction(baseCreature(), { name: 'Test', effects: {} });
  const card   = createActionCardElement(action, 12, 3);
  assert.equal(card.className, 'statblock-action-item');
});

test('dataset.featureId is set from action.id', () => {
  const action = buildAction(baseCreature(), { id: 'slash-01', effects: {} });
  const card   = createActionCardElement(action, 12, 3);
  assert.equal(card.dataset.featureId, 'slash-01');
});

test('header contains action name and AP cost', () => {
  const action = buildAction(baseCreature(), { name: 'Slash', effects: { cost: 2 } });
  const text   = getFullText(createActionCardElement(action, 12, 3));
  assert.ok(text.includes('Slash'), 'name present');
  assert.ok(text.includes('2'),     'cost present');
  assert.ok(text.includes('AP'),    'AP label present');
});

test('drag handle rendered when showDragHandle is true', () => {
  const action = buildAction(baseCreature(), { name: 'T', effects: {} });
  const card   = createActionCardElement(action, 12, 3, { showDragHandle: true });
  const handle = findByClass(card, 'drag-handle');
  assert.ok(handle,                      'drag-handle element present');
  assert.equal(handle.textContent, '⠿', 'drag handle symbol correct');
});

test('no drag handle by default', () => {
  const action = buildAction(baseCreature(), { name: 'T', effects: {} });
  const card   = createActionCardElement(action, 12, 3);
  assert.equal(findByClass(card, 'drag-handle'), null);
});

test('reaction trigger rendered when showTrigger is true', () => {
  const action = buildAction(baseCreature(), {
    name: 'Parry', isReaction: true, reactionTrigger: 'When hit by a melee attack', effects: {},
  });
  const card    = createActionCardElement(action, 12, 3, { showTrigger: true });
  const trigger = findByClass(card, 'action-trigger');
  assert.ok(trigger,                                          'trigger element present');
  assert.ok(trigger.textContent.includes('When hit by a melee attack'), 'trigger text correct');
});

test('trigger NOT rendered when showTrigger is false (default)', () => {
  const action = buildAction(baseCreature(), {
    name: 'Parry', isReaction: true, reactionTrigger: 'When hit', effects: {},
  });
  const card = createActionCardElement(action, 12, 3);
  assert.equal(findByClass(card, 'action-trigger'), null);
});

test('Legendary and Apex badges rendered when flags are set', () => {
  const action   = buildAction(baseCreature(), { name: 'Nuke', isLegendaryAction: true, isApexAction: true, effects: {} });
  const card     = createActionCardElement(action, 12, 3);
  const badgeRow = findByClass(card, 'action-badges');
  assert.ok(badgeRow, 'badge row present');
  const labels = badgeRow.children.map((b) => b.textContent);
  // DC20 Monster Collection terminology: Legendary monsters use Reaction Points (RP);
  // Epic (internally "apex") monsters use Round Actions.
  assert.ok(labels.includes('RP Action'),    'RP Action badge (Legendary)');
  assert.ok(labels.includes('Round Action'), 'Round Action badge (Epic/Apex)');
});

test('no badge row when neither flag is set', () => {
  const action = buildAction(baseCreature(), { name: 'Normal', effects: {} });
  const card   = createActionCardElement(action, 12, 3);
  assert.equal(findByClass(card, 'action-badges'), null);
});

// ═══════════════════════════════════════════════════════════════════════════════
// createActionCardElement — mechanic type 1: Check vs Defense
// ═══════════════════════════════════════════════════════════════════════════════

section('createActionCardElement — type 1: Check vs Defense');

test('renders action type, defense, damage, target, range', () => {
  const action = buildAction(baseCreature({ damage: 5 }), {
    name: 'Slash',
    actionType: 'Melee Martial Attack',
    effects: { cost: 1, targetDefense: 'PD', target: 'a creature', range: '1 Space' },
  });
  const text = getFullText(createActionCardElement(action, 12, 5));
  assert.ok(text.includes('Melee Martial Attack'), 'action type');
  assert.ok(text.includes('PD'),                  'target defense');
  assert.ok(text.includes('5'),                   'damage amount');
  assert.ok(text.includes('a creature'),           'target');
  assert.ok(text.includes('1 Space'),              'range');
});

test('two damage segments both appear', () => {
  const action = buildAction(baseCreature({ damage: 4 }), {
    actionType: 'Melee Martial Attack',
    effects: {
      targetDefense:  'PD',
      damageSegments: [
        { useBase: true, modifier: 0, type: 'Slashing' },
        { amount: 3,                  type: 'Fire'     },
      ],
    },
  });
  const text = getFullText(createActionCardElement(action, 12, 4));
  assert.ok(text.includes('Slashing'), 'first damage type');
  assert.ok(text.includes('Fire'),     'second damage type');
  assert.ok(text.includes('3'),        'fixed damage amount');
});

test('heavy-hit bonus text appended when a segment resolves to .5 on PD attack', () => {
  // baseDamage=4, modifier=0.5 → 4.5; hasHalfDamage=true for PD martial attack
  const action = buildAction(baseCreature({ damage: 4 }), {
    actionType: 'Melee Martial Attack',
    effects: {
      targetDefense:  'PD',
      damageSegments: [{ useBase: true, modifier: 0.5, type: 'Piercing' }],
    },
  });
  const text = getFullText(createActionCardElement(action, 12, 4));
  assert.ok(text.includes('heavy hits'), 'heavy-hit bonus text present');
});

test('no heavy-hit text for AD attacks', () => {
  const action = buildAction(baseCreature({ damage: 4 }), {
    actionType: 'Arcane Attack',
    effects: {
      targetDefense:  'AD',
      damageSegments: [{ useBase: true, modifier: 0.5, type: 'Fire' }],
    },
  });
  const text = getFullText(createActionCardElement(action, 12, 4));
  assert.ok(!text.includes('heavy hits'), 'no heavy-hit text for AD attacks');
});

test('heavy-hit text shown for area PD attacks with a .5 damage value', () => {
  // The Impact property (+1 on Heavy Hit) comes from the .5 damage increment and
  // applies to Area Attacks too — per the DC20 Monster Collection bestiary, e.g.
  // Animated Armor "Pathcarver", Molten Glass Ooze "Radiate Heat", Earth Tortoise
  // "Rampage" are all Area Attacks that grant +1 extra damage on a Heavy Hit.
  const action = buildAction(baseCreature({ damage: 4 }), {
    actionType: 'Area Martial Attack',
    effects: {
      targetDefense:  'PD',
      damageSegments: [{ useBase: true, modifier: 0.5, type: 'Bludgeoning' }],
    },
  });
  const text = getFullText(createActionCardElement(action, 12, 4));
  assert.ok(text.includes('heavy hits'), 'heavy-hit text present for area PD attacks');
});

// ═══════════════════════════════════════════════════════════════════════════════
// createActionCardElement — mechanic type 2: Check vs Save
// ═══════════════════════════════════════════════════════════════════════════════

section('createActionCardElement — type 2: Check vs Save');

test('save attribute and failure text rendered', () => {
  const action = buildAction(baseCreature(), {
    name: 'Slam',
    actionType: 'Melee Martial Attack',
    effects: { save: { attribute: 'Mig', failure: 'Prone', duration: 'until the end of its next turn' } },
  });
  const text = getFullText(createActionCardElement(action, 12, 5));
  assert.ok(text.includes('Mig'),                           'save attribute');
  assert.ok(text.includes('Prone'),                         'failure text');
  assert.ok(text.includes('until the end of its next turn'),'duration text');
});

test('"Repeatable" prefix appears for repeatable saves', () => {
  const action = buildAction(baseCreature(), {
    name: 'Curse', actionType: 'Mig Save',
    effects: { save: { attribute: 'Mig', failure: 'Blinded', repeatable: true } },
  });
  const text = getFullText(createActionCardElement(action, 12, 5));
  assert.ok(text.includes('Repeatable'), 'Repeatable prefix');
});

test('no "Repeatable" prefix for non-repeatable saves', () => {
  const action = buildAction(baseCreature(), {
    effects: { save: { attribute: 'Agi', failure: 'Prone', repeatable: false } },
  });
  const text = getFullText(createActionCardElement(action, 12, 5));
  assert.ok(!text.includes('Repeatable'), 'no Repeatable prefix');
});

test('no " vs Save DC" shown for pure save (no targetDefense)', () => {
  // Must use a non-attack actionType; otherwise the code infers targetDefense:'PD'
  // and renders the creature's saveDC on the save line.
  const action = buildAction(baseCreature({ saveDC: 13 }), {
    actionType: 'Mig Save',
    effects: { save: { attribute: 'Mig', failure: 'Prone' } },
  });
  const text = getFullText(createActionCardElement(action, 13, 5));
  assert.ok(!text.includes('Save DC'), 'no fixed DC on pure save line');
});

test('all save sub-fields render', () => {
  const action = buildAction(baseCreature(), {
    effects: {
      save: {
        attribute:    'Int',
        failure:      'Confused',
        failureEach5: 'Stunned',
        success:      'Shaken off',
        successEach5: 'Immune',
        duration:     'for 1 minute',
      },
    },
  });
  const text = getFullText(createActionCardElement(action, 12, 5));
  assert.ok(text.includes('Confused'),    'failure');
  assert.ok(text.includes('Stunned'),     'failureEach5');
  assert.ok(text.includes('Shaken off'), 'success');
  assert.ok(text.includes('Immune'),      'successEach5');
  assert.ok(text.includes('for 1 minute'),'duration');
});

// ═══════════════════════════════════════════════════════════════════════════════
// createActionCardElement — mechanic type 3: Check vs DC (utility)
// ═══════════════════════════════════════════════════════════════════════════════

section('createActionCardElement — type 3: Check vs DC (utility)');

test('description renders before the DC line for utility actions', () => {
  const action = buildAction(baseCreature(), {
    name: 'Inspire',
    actionType: 'Utility',
    effects: {
      actionDescription: 'Grant an ally +2 to their next check.',
      check: { dc: 14, success: 'Ally gains bonus', failure: 'No effect' },
    },
  });
  const text = getFullText(createActionCardElement(action, 12, 5));
  assert.ok(text.includes('Grant an ally'), 'description present');
  assert.ok(text.includes('14'),            'DC present');
  assert.ok(text.includes('Ally gains bonus'), 'success outcome');
  assert.ok(text.includes('No effect'),     'failure outcome');
  // Description should appear before DC text in the string
  assert.ok(text.indexOf('Grant an ally') < text.indexOf('14'), 'description before DC');
});

test('"utility check" action type does NOT use the utility path', () => {
  // "utility check" contains both "utility" AND "check" → attack path, not utility path
  const action = buildAction(baseCreature(), {
    name: 'Tricky',
    actionType: 'Utility Check',
    effects: { check: { dc: 12, failure: 'Miss', success: 'Hit' } },
  });
  const text = getFullText(createActionCardElement(action, 12, 5));
  // In the attack path the action type appears on the attack line first (before description)
  assert.ok(text.includes('Utility Check'), 'action type present');
});

// ═══════════════════════════════════════════════════════════════════════════════
// createActionCardElement — mechanic type 4: Dynamic Attack Save
// ═══════════════════════════════════════════════════════════════════════════════

section('createActionCardElement — type 4: Dynamic Attack Save');

test('shows attack line with PD, damage, then save block with creature saveDC', () => {
  const action = buildAction(baseCreature({ saveDC: 13, damage: 4 }), {
    name: 'Power Slam',
    actionType: 'Melee Martial Attack',
    effects: {
      targetDefense: 'PD',
      save: { attribute: 'Agi', failure: 'Knocked Prone' },
    },
  });
  const text = getFullText(createActionCardElement(action, 13, 4));
  assert.ok(text.includes('PD'),           'defense on attack line');
  assert.ok(text.includes('4'),            'damage amount');
  assert.ok(text.includes('Agi'),          'save attribute');
  assert.ok(text.includes('Save DC'),      '"Save DC" label present');
  assert.ok(text.includes('13'),           'saveDC value');
  assert.ok(text.includes('Knocked Prone'),'save failure text');
});

// ═══════════════════════════════════════════════════════════════════════════════
// createActionCardElement — enhancements
// ═══════════════════════════════════════════════════════════════════════════════

section('createActionCardElement — enhancements');

test('enhancement with description renders name, cost, and description', () => {
  const action = buildAction(baseCreature(), {
    name: 'Fireball',
    effects: { enhancements: [{ name: 'Empower', cost: 1, description: 'Deal extra damage.' }] },
  });
  const text = getFullText(createActionCardElement(action, 12, 5));
  assert.ok(text.includes('Empower'),          'enhancement name');
  assert.ok(text.includes('+1'),               'enhancement cost');
  assert.ok(text.includes('Deal extra damage.'),'enhancement description');
});

test('enhancement with save block renders save text', () => {
  const action = buildAction(baseCreature(), {
    name: 'Slam',
    effects: {
      enhancements: [{
        name: 'Trip', cost: 1,
        save: { attribute: 'Agi', failure: 'Prone', repeatable: false },
      }],
    },
  });
  const text = getFullText(createActionCardElement(action, 12, 5));
  assert.ok(text.includes('Trip'),  'enhancement name');
  assert.ok(text.includes('Agi'),   'save attribute in enhancement');
  assert.ok(text.includes('Prone'), 'failure in enhancement');
});

test('enhancement save successEach5 is rendered (regression: was silently dropped)', () => {
  const action = buildAction(baseCreature(), {
    name: 'Slam',
    effects: {
      enhancements: [{
        name: 'Overpower', cost: 2,
        save: { attribute: 'Mig', failure: 'Prone', success: 'Pushed back', successEach5: 'Knocked out' },
      }],
    },
  });
  const text = getFullText(createActionCardElement(action, 12, 5));
  assert.ok(text.includes('Knocked out'), 'successEach5 rendered in enhancement save');
});

test('enhancement with damageSegments renders damage', () => {
  const action = buildAction(baseCreature({ damage: 3 }), {
    name: 'Strike',
    effects: {
      targetDefense: 'PD',
      enhancements: [{
        name: 'Burn', cost: 1,
        damageSegments: [{ amount: 2, type: 'Fire' }],
      }],
    },
  });
  const text = getFullText(createActionCardElement(action, 12, 3));
  assert.ok(text.includes('Burn'), 'enhancement name');
  assert.ok(text.includes('Fire'), 'damage type in enhancement');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n${'─'.repeat(55)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

/**
 * scripts/designTargets.mjs
 *
 * Single source of truth for the official DC20 Monster Collection design targets
 * that our (intentionally different) multiplicative generator is measured against.
 *
 * We do NOT change gameRules.js to match the book — these targets exist so the
 * conformance harness (tests/conformance.test.mjs) and the balance report
 * (scripts/evaluateCreatures.mjs) can check that the creatures we actually
 * generate land within a sane tolerance of the book's pacing goals.
 *
 * Anchor invariant (Monster Collection p.3, p.7):
 *   A same-level PC kills a same-level Medium monster in ~3 Rounds, and vice-versa.
 */

import { baseLevelStatsData } from '../public/Rules/gameRules.js';

// ── Official design constants ────────────────────────────────────────────────
export const DESIGN = {
  ATTACKS_PER_ROUND: 2,   // p.3 example, p.7 HP math
  BASELINE_HIT: 0.65,     // 65% hit at a monster's average defense (p.3)
  TARGET_ROUNDS: 3,       // Medium combat lasts ~3 Rounds (p.3 DC Tip)
};

// ── Monster offense: damage PER ATTACK by level × difficulty (p.5 table) ──────
// The Medium column equals baseLevelStatsData[].Damage by design.
export const DAMAGE_TABLE = {
  //         Easy  Medium  Hard  VeryHard Deadly
  novice: { easy: 0.25, medium: 0.25, hard: 0.5, veryHard: 1.5, deadly: 2 },
  0:      { easy: 0.25, medium: 0.5,  hard: 1,   veryHard: 2,   deadly: 2.5 },
  1:      { easy: 0.25, medium: 0.5,  hard: 1,   veryHard: 2,   deadly: 3 },
  2:      { easy: 0.5,  medium: 1,    hard: 1.5, veryHard: 3,   deadly: 4 },
  3:      { easy: 0.5,  medium: 1,    hard: 2,   veryHard: 3.5, deadly: 5 },
  4:      { easy: 1,    medium: 1.5,  hard: 2.5, veryHard: 4,   deadly: 6 },
  5:      { easy: 1,    medium: 1.5,  hard: 2.5, veryHard: 4.5, deadly: 6.5 },
  6:      { easy: 1.5,  medium: 2,    hard: 3,   veryHard: 5.5, deadly: 7.5 },
  7:      { easy: 1.5,  medium: 2,    hard: 3.5, veryHard: 5.5, deadly: 8 },
  8:      { easy: 1.5,  medium: 2.5,  hard: 4,   veryHard: 6,   deadly: 9 },
  9:      { easy: 1.5,  medium: 2.5,  hard: 4,   veryHard: 7,   deadly: 10 },
  10:     { easy: 2,    medium: 3,    hard: 5,   veryHard: 8,   deadly: 11 },
  11:     { easy: 2,    medium: 3.5,  hard: 5,   veryHard: 8.5, deadly: 12 },
  12:     { easy: 2.5,  medium: 4,    hard: 5.5, veryHard: 9,   deadly: 13 },
  13:     { easy: 2.5,  medium: 4,    hard: 6,   veryHard: 9.5, deadly: 14 },
  14:     { easy: 3,    medium: 4.5,  hard: 6.5, veryHard: 10,  deadly: 14.5 },
  15:     { easy: 3,    medium: 4.5,  hard: 6.5, veryHard: 10.5,deadly: 15.5 },
  16:     { easy: 3.5,  medium: 5,    hard: 7,   veryHard: 11.5,deadly: 16 },
  17:     { easy: 3.5,  medium: 5,    hard: 7.5, veryHard: 12,  deadly: 17 },
  18:     { easy: 4,    medium: 5.5,  hard: 8,   veryHard: 12.5,deadly: 18 },
  19:     { easy: 4,    medium: 5.5,  hard: 8,   veryHard: 13,  deadly: 18.5 },
  20:     { easy: 4.5,  medium: 6,    hard: 9,   veryHard: 13.5,deadly: 20 },
};

export const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'veryHard', 'deadly'];
export const DIFFICULTY_LABELS = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard', veryHard: 'Very Hard', deadly: 'Deadly',
};

// ── Rounds-to-kill role bands (PC kills monster) ─────────────────────────────
// Soldier/none are the 3-round baseline; other roles trade survivability per the
// book's "raise HP → lower Defense / glass-cannon" design. Loose on purpose:
// these guard against absurd outliers, not enforce a single number. Tune freely.
export const ROLE_BANDS = {
  none:      [2.5, 3.5],
  soldier:   [2.5, 3.5],
  brute:     [2.75, 4.0],
  // Defender upper bound is 4.75 (not the book's ~3.5) because our model keeps
  // Defender HP ×1.25 where the book uses ×1.0; combined with +2 Defenses and
  // HP ceil-rounding it peaks at ~4.64 rounds at L1. Intentional divergence —
  // tighten to ~3.6 here if Defender HPFactor is ever dropped to 1.0.
  defender:  [3.0, 4.75],
  leader:    [2.5, 4.0],
  striker:   [1.5, 3.0],
  tactician: [1.5, 3.0],
};

// Absolute slack on the [Easy, Deadly] damage envelope. At the very bottom of
// the table (Novice, ~0.25 dmg) a −25% role multiplier dips a hair under the
// Easy floor (0.19 < 0.25); the book treats sub-1 damage as special-cased
// (Impact / 2-AP attacks) anyway, so this much drift is noise, not a failure.
export const ENVELOPE_TOL = 0.1;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Base (Medium) row for a level, from the shared game-rules table. */
function baseRow(level) {
  return baseLevelStatsData.find((e) => e.level === level)
      ?? baseLevelStatsData[baseLevelStatsData.length - 1];
}

/** Same-level PC's attack bonus — uses the monster Attack Bonus column (symmetry). */
export function attackBonusForLevel(level) {
  return baseRow(level).Check ?? 0;
}

/**
 * PC damage per hit, calibrated so a vanilla Medium monster dies in exactly
 * TARGET_ROUNDS: HP_medium / (rounds × attacks × hit). Self-consistent with our
 * own HP table rather than depending on a separately-modeled PC.
 */
export function pcDamagePerHit(level) {
  const hp = baseRow(level).HP ?? 1;
  return hp / (DESIGN.TARGET_ROUNDS * DESIGN.ATTACKS_PER_ROUND * DESIGN.BASELINE_HIT);
}

/** Probability a same-level PC hits a defense, per p.7, clamped 5–95%. */
export function hitChance(defense, level) {
  const raw = (21 - (defense - attackBonusForLevel(level))) / 20;
  return Math.min(0.95, Math.max(0.05, raw));
}

/** Expected Rounds for a same-level PC to kill a monster with given HP & defense. */
export function roundsToKill({ hp, defense, level }) {
  const dpr = DESIGN.ATTACKS_PER_ROUND * hitChance(defense, level) * pcDamagePerHit(level);
  return dpr > 0 ? hp / dpr : Infinity;
}

/**
 * Classify a monster's per-attack damage into the nearest difficulty band for
 * its level, and whether it's within the sane [Easy, Deadly] envelope.
 */
export function classifyDamage(level, damage) {
  const row = DAMAGE_TABLE[level] ?? DAMAGE_TABLE[20];
  let nearest = DIFFICULTY_ORDER[0];
  let bestDelta = Infinity;
  for (const key of DIFFICULTY_ORDER) {
    const delta = Math.abs(damage - row[key]);
    if (delta < bestDelta) { bestDelta = delta; nearest = key; }
  }
  const inEnvelope = damage >= row.easy - ENVELOPE_TOL && damage <= row.deadly + ENVELOPE_TOL;
  return { nearest, inEnvelope, row };
}

/** Levels present in the base table, in order (Novice + 0–20). */
export const LEVELS = baseLevelStatsData.map((e) => e.level);

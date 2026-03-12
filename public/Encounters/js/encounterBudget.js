/**
 * encounterBudget.js
 * Budget calculation and progress-bar rendering.
 */
import { encounter } from './encounterState.js';
import dom from './encounterDom.js';

// ── Encounter DC lookup table ─────────────────────────────────────────────────
// Indexed by level 1–20. Source: DC20 Encounter DC Table.

const ENCOUNTER_DC_TABLE = [
  null,                              // 0 — unused
  { easy: 11, normal: 13, hard: 15 }, // 1
  { easy: 11, normal: 13, hard: 15 }, // 2
  { easy: 12, normal: 14, hard: 16 }, // 3
  { easy: 12, normal: 14, hard: 16 }, // 4
  { easy: 14, normal: 16, hard: 18 }, // 5
  { easy: 14, normal: 16, hard: 18 }, // 6
  { easy: 15, normal: 17, hard: 19 }, // 7
  { easy: 15, normal: 17, hard: 19 }, // 8
  { easy: 16, normal: 18, hard: 20 }, // 9
  { easy: 16, normal: 18, hard: 20 }, // 10
  { easy: 17, normal: 19, hard: 21 }, // 11
  { easy: 17, normal: 19, hard: 21 }, // 12
  { easy: 18, normal: 20, hard: 22 }, // 13
  { easy: 18, normal: 20, hard: 22 }, // 14
  { easy: 20, normal: 22, hard: 24 }, // 15
  { easy: 20, normal: 22, hard: 24 }, // 16
  { easy: 21, normal: 23, hard: 25 }, // 17
  { easy: 21, normal: 23, hard: 25 }, // 18
  { easy: 22, normal: 24, hard: 26 }, // 19
  { easy: 22, normal: 24, hard: 26 }, // 20
];

/**
 * Return the Encounter DC row for a given average party level.
 * @param {number} avgLevel
 * @returns {{ easy: number, normal: number, hard: number }}
 */
export function getEncounterDc(avgLevel) {
  const level = Math.min(20, Math.max(1, Math.round(avgLevel)));
  return ENCOUNTER_DC_TABLE[level] || { easy: 11, normal: 13, hard: 15 };
}

const TIER_MULTIPLIERS = {
  minion:    0.5,
  weak:      0.7,
  normal:    1.0,
  apex:      2.0,
  legendary: 4.0,
};

/**
 * Compute current budget totals.
 *
 * Difficulty tiers per DC20 design doc (Budget = sum of PC levels, AvgLevel = Budget / partyCount):
 *   Easy      ≈ Budget − AvgLevel
 *   Medium    ≈ Budget
 *   Hard      ≈ Budget + AvgLevel
 *   Very Hard ≈ Budget + 2 × AvgLevel
 *   Deadly    ≈ Budget + 4 × AvgLevel
 *
 * Boundaries sit at the midpoint between each tier's target value.
 *
 * @returns {{ partyBudget: number, monsterTotal: number, pct: number, difficulty: string }}
 */
export function computeBudget() {
  const partyBudget = encounter.party.reduce((s, p) => s + (Number(p.level) || 0), 0);
  const partyCount  = encounter.party.length;

  const monsterTotal = encounter.monsters.reduce((s, m) => {
    const mult = TIER_MULTIPLIERS[m.power] ?? 1.0;
    const effectiveLevel = Math.max(0, (m.baseLevel || 0) + (m.levelDelta || 0));
    return s + effectiveLevel * mult;
  }, 0);

  const pct = partyBudget > 0 ? (monsterTotal / partyBudget) * 100 : 0;

  let difficulty;
  const avgLevel = partyCount > 0 ? partyBudget / partyCount : 0;
  if (avgLevel <= 0) {
    difficulty = monsterTotal <= partyBudget ? 'medium' : 'deadly';
  } else {
    // Midpoints between tier targets
    if      (monsterTotal < partyBudget - avgLevel * 0.5)  difficulty = 'easy';
    else if (monsterTotal < partyBudget + avgLevel * 0.5)  difficulty = 'medium';
    else if (monsterTotal < partyBudget + avgLevel * 1.5)  difficulty = 'hard';
    else if (monsterTotal < partyBudget + avgLevel * 3.0)  difficulty = 'very-hard';
    else                                                    difficulty = 'deadly';
  }

  return { partyBudget, monsterTotal, pct, difficulty };
}

/** Re-render the budget bar and labels. */
export function renderBudget() {
  const { partyBudget, monsterTotal, pct, difficulty } = computeBudget();

  const fill  = dom.budgetFill();
  const label = dom.budgetDifficulty();
  const nums  = dom.budgetNumbers();

  if (!fill || !label || !nums) return;

  // Fill width: cap visual at 200% (deadly can go past 175% but bar maxes at 100%)
  const barPct = Math.min(pct, 200) / 2;
  fill.style.width = `${barPct}%`;

  // Class-based colour
  fill.className = 'budget-fill';
  if (difficulty !== 'easy') fill.classList.add(`budget-fill--${difficulty}`);

  // Difficulty chip
  const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', 'very-hard': 'Very Hard', deadly: 'Deadly' };
  label.textContent = DIFFICULTY_LABELS[difficulty] ?? difficulty;
  label.className = `budget-difficulty budget-difficulty--${difficulty}`;

  // Numbers
  const monsterDisplay = Number.isInteger(monsterTotal) ? monsterTotal : monsterTotal.toFixed(1);
  nums.textContent = `${monsterDisplay} / ${partyBudget} (${Math.round(pct)}%)`;

  // Encounter DC display
  const dcEl = dom.encounterDcDisplay();
  if (dcEl) {
    const partyCount = encounter.party.length;
    if (partyCount === 0) {
      dcEl.textContent = 'Encounter DC — add players to calculate';
    } else {
      const avgLevel = partyBudget / partyCount;
      const dc = getEncounterDc(avgLevel);
      dcEl.textContent = `Encounter DC — Easy: ${dc.easy} · Normal: ${dc.normal} · Hard: ${dc.hard}`;
    }
  }
}

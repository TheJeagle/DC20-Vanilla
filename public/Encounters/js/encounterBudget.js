/**
 * encounterBudget.js
 * Budget calculation and progress-bar rendering.
 */
import { encounter } from './encounterState.js';
import dom from './encounterDom.js';

const TIER_MULTIPLIERS = {
  minion:    0.5,
  weak:      0.7,
  normal:    1.0,
  apex:      2.0,
  legendary: 4.0,
};

/**
 * Compute current budget totals.
 * @returns {{ partyBudget: number, monsterTotal: number, pct: number, difficulty: string }}
 */
export function computeBudget() {
  const partyBudget = encounter.party.reduce((s, p) => s + (Number(p.level) || 0), 0);

  const monsterTotal = encounter.monsters.reduce((s, m) => {
    const mult = TIER_MULTIPLIERS[m.power] ?? 1.0;
    const effectiveLevel = Math.max(0, (m.baseLevel || 0) + (m.levelDelta || 0));
    return s + effectiveLevel * mult;
  }, 0);

  const pct = partyBudget > 0 ? (monsterTotal / partyBudget) * 100 : 0;

  let difficulty;
  if (pct < 75)       difficulty = 'easy';
  else if (pct < 125) difficulty = 'fair';
  else if (pct < 175) difficulty = 'hard';
  else                difficulty = 'deadly';

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
  label.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  label.className = `budget-difficulty budget-difficulty--${difficulty}`;

  // Numbers
  const monsterDisplay = Number.isInteger(monsterTotal) ? monsterTotal : monsterTotal.toFixed(1);
  nums.textContent = `${monsterDisplay} / ${partyBudget} (${Math.round(pct)}%)`;
}

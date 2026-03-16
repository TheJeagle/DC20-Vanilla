// Tunable constants for the feature evaluation system.
// All values are in featureCost units (1 ancestryValue = 1 featureCost).

// ----- DAMAGE -----
// Each +1 modifier above the free baseline = DAMAGE_PER_MODIFIER featureCost.
// Single-target baseline: modifier 0 = free. AoE baseline: modifier -1 = free.
export const DAMAGE_PER_MODIFIER = 3;

// ----- DURATION FACTORS -----
// Multiply condition baseValue by this based on how long the condition lasts.
export const DURATION_FACTORS = {
  '': 1.0,
  'until the end of its next turn': 1.0,
  'until the end of your next turn': 1.0,
  'for 1 minute (repeatable)': 1.5,   // repeatable: true
  'for 1 minute': 2.0,                 // repeatable: false / absent
  'until removed (ap)': 1.5,           // Spend AP to escape: Grapple, Prone, Bleeding
  'until removed': 4.0,                // Requires spell / special action
  'until end of short rest': 3.0,
  'until end of long rest': 5.0,
};

// ----- SAVE FACTORS -----
// Multiply condition baseValue by this based on how hard the save is.
export const SAVE_FACTORS = {
  Physical: 0.5,   // composite — target uses higher of Mig/Agi
  Mental: 0.5,     // composite — target uses higher of Int/Cha
  Mig: 1.0,
  Agi: 1.0,
  Cha: 1.0,
  Int: 1.0,
  none: 2.0,       // no save — guaranteed
};

// ----- CONDITION BASE VALUES -----
// Stacking conditions: value per 1 stack.
// Flat conditions: absolute value.
export const CONDITION_BASE_VALUES = {
  // Stacking
  Bleeding: 1.5,
  Burning: 2.0,
  Stunned: 3.5,
  Slowed: 1.0,
  Hindered: 1.5,
  Exposed: 2.0,
  Dazed: 1.0,
  Disoriented: 1.0,
  Impaired: 1.0,
  Weakened: 1.0,
  Doomed: 2.5,
  Exhaustion: 3.0,
  // Flat
  Blinded: 3.0,
  Charmed: 2.5,
  Deafened: 1.0,
  Frightened: 2.0,
  Intimidated: 1.5,
  Immobilized: 2.5,
  Incapacitated: 6.0,
  Paralyzed: 8.0,
  Petrified: 9.0,
  Prone: 1.5,
  Restrained: 3.5,
  Taunted: 1.0,
  Terrified: 3.5,
  Tethered: 1.0,
  Unconscious: 10.0,
};

// ----- MODIFIER SCALES -----
// featureCost per unit of each numeric stat.
export const MODIFIER_SCALES = {
  hp: 0.5,
  pd: 2.0,
  ad: 2.0,
  speed: 1.0,
  damage: 3.0,
};

// featureCost per damage type resistance / immunity / vulnerability.
export const RESISTANCE_COST = 1.0;
export const IMMUNITY_COST = 3.0;
export const VULNERABILITY_COST = -1.5;

// featureCost per condition immunity / resistance-ADV entry.
export const CONDITION_IMMUNITY_COST = 1.0;
export const CONDITION_RESISTANCE_COST = 0.5;

// ----- REACTION TAX -----
export const REACTION_TAX = 1.0;

// ----- DESIGN FLAGS -----
// Max damage resistances before flagging for too many (with no vulnerabilities).
export const MAX_RESISTANCES_WITHOUT_FLAG = 4;

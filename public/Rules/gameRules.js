// src/data/gameRules.js

// Corresponds to your creatureLevelStats
// Level 'novice' is a special string level below 0
export const baseLevelStatsData = [
    { level: 'novice', HP: 7,  PD: 10, AD: 10, Check: 2,  Damage: 0.25, AP: 4, Speed: 5, SaveDC: 12, TraitValue: 2 },
    { level: 0,  HP: 11, PD: 11, AD: 11, Check: 3,  Damage: 0.5,  AP: 4, Speed: 5, SaveDC: 13, TraitValue: 4 },
    { level: 1,  HP: 13, PD: 12, AD: 12, Check: 4,  Damage: 0.5,  AP: 4, Speed: 5, SaveDC: 14, TraitValue: 6 },
    { level: 2,  HP: 15, PD: 12, AD: 12, Check: 4,  Damage: 1,    AP: 4, Speed: 5, SaveDC: 14, TraitValue: 8 },
    { level: 3,  HP: 19, PD: 13, AD: 13, Check: 5,  Damage: 1,    AP: 4, Speed: 5, SaveDC: 15, TraitValue: 10 },
    { level: 4,  HP: 20, PD: 13, AD: 13, Check: 5,  Damage: 1.5,  AP: 4, Speed: 5, SaveDC: 15, TraitValue: 12 },
    { level: 5,  HP: 24, PD: 15, AD: 15, Check: 7,  Damage: 1.5,  AP: 4, Speed: 5, SaveDC: 17, TraitValue: 14 },
    { level: 6,  HP: 25, PD: 15, AD: 15, Check: 7,  Damage: 2,    AP: 4, Speed: 5, SaveDC: 17, TraitValue: 16 },
    { level: 7,  HP: 28, PD: 16, AD: 16, Check: 8,  Damage: 2,    AP: 4, Speed: 5, SaveDC: 18, TraitValue: 18 },
    { level: 8,  HP: 30, PD: 16, AD: 16, Check: 8,  Damage: 2.5,  AP: 4, Speed: 5, SaveDC: 18, TraitValue: 20 },
    { level: 9,  HP: 34, PD: 17, AD: 17, Check: 9,  Damage: 2.5,  AP: 4, Speed: 5, SaveDC: 19, TraitValue: 22 },
    { level: 10, HP: 36, PD: 18, AD: 18, Check: 10, Damage: 3,    AP: 4, Speed: 5, SaveDC: 20, TraitValue: 24 },
    { level: 11, HP: 40, PD: 19, AD: 19, Check: 11, Damage: 3.5,  AP: 4, Speed: 5, SaveDC: 21, TraitValue: 26 },
    { level: 12, HP: 42, PD: 19, AD: 19, Check: 11, Damage: 4,    AP: 4, Speed: 5, SaveDC: 21, TraitValue: 28 },
    { level: 13, HP: 44, PD: 20, AD: 20, Check: 12, Damage: 4,    AP: 4, Speed: 5, SaveDC: 22, TraitValue: 30 },
    { level: 14, HP: 46, PD: 20, AD: 20, Check: 12, Damage: 4.5,  AP: 4, Speed: 5, SaveDC: 22, TraitValue: 32 },
    { level: 15, HP: 50, PD: 22, AD: 22, Check: 14, Damage: 4.5,  AP: 4, Speed: 5, SaveDC: 24, TraitValue: 34 },
    { level: 16, HP: 51, PD: 22, AD: 22, Check: 14, Damage: 5,    AP: 4, Speed: 5, SaveDC: 24, TraitValue: 36 },
    { level: 17, HP: 55, PD: 23, AD: 23, Check: 15, Damage: 5,    AP: 4, Speed: 5, SaveDC: 25, TraitValue: 38 },
    { level: 18, HP: 56, PD: 23, AD: 23, Check: 15, Damage: 5.5,  AP: 4, Speed: 5, SaveDC: 25, TraitValue: 40 },
    { level: 19, HP: 60, PD: 24, AD: 24, Check: 16, Damage: 5.5,  AP: 4, Speed: 5, SaveDC: 26, TraitValue: 42 },
    { level: 20, HP: 62, PD: 25, AD: 25, Check: 17, Damage: 6,    AP: 4, Speed: 5, SaveDC: 27, TraitValue: 44 },
];

// Corresponds to your statsPerLevel (for MIG, AGI, CHA, INT in order)
export const attributeScoresByLevel = [
    { level: 'novice', scores: [2, 1, 1, -2] },
    { level: 0,  scores: [2, 1, 1, -2] }, // [Prime, Secondary, Tertiary, Quaternary]
    { level: 1,  scores: [3, 2, 1, -2] },
    { level: 2,  scores: [3, 2, 2, -2] },
    { level: 3,  scores: [3, 2, 2, -2] },
    { level: 4,  scores: [3, 2, 2, -1] },
    { level: 5,  scores: [4, 2, 2, -1] },
    { level: 6,  scores: [4, 2, 2, -1] },
    { level: 7,  scores: [4, 3, 2, -1] },
    { level: 8,  scores: [4, 3, 2, -1] },
    { level: 9,  scores: [4, 3, 2,  0] },
    { level: 10, scores: [5, 3, 2,  0] },
    { level: 11, scores: [5, 3, 3,  0] },
    { level: 12, scores: [5, 3, 3,  0] },
    { level: 13, scores: [5, 3, 3,  0] },
    { level: 14, scores: [6, 4, 3,  0] },
    { level: 15, scores: [6, 4, 3,  1] },
    { level: 16, scores: [6, 4, 3,  1] },
    { level: 17, scores: [6, 4, 3,  1] },
    { level: 18, scores: [6, 4, 4,  1] },
    { level: 19, scores: [7, 4, 4,  1] },
    { level: 20, scores: [7, 5, 4,  1] },
];

// Corresponds to your roleStats
// DamageFactor: multiplicative damage modifier (1.0 = no change, 1.25 = +25%, etc.)
// TraitValueBonus: added to the level's base TraitValue budget
export const roleModifiersData = {
    brute: {
        HPFactor: 1.25, PDMod: 0, ADMod: 0, CheckMod: 0, SpeedMod: 1, DamageFactor: 1.25, TraitValueBonus: 0,
        SavesProficient: ["Mig", "Agi", "Cha", "Int"],
        AttributePriority: ["Mig", "Agi", "Cha", "Int"],
        Skills: ["athletics", "awareness", "survival"],
    },
    defender: {
        HPFactor: 1.25, PDMod: 2, ADMod: 2, CheckMod: -1, SpeedMod: 0, DamageFactor: 1.0, TraitValueBonus: 0,
        SavesProficient: ["Mig", "Agi", "Cha", "Int"],
        AttributePriority: ["Mig", "Agi", "Cha", "Int"],
        Skills: ["athletics"],
    },
    leader: {
        HPFactor: 1.0, PDMod: 0, ADMod: 0, CheckMod: 0, SpeedMod: 0, DamageFactor: 0.75, TraitValueBonus: 4,
        SavesProficient: ["Cha", "Int", "Mig", "Agi"],
        AttributePriority: ["Cha", "Agi", "Int", "Mig"],
        Skills: ["insight", "awareness", "influence", "intimidation"],
    },
    soldier: {
        HPFactor: 1.0, PDMod: 0, ADMod: 0, CheckMod: 0, SpeedMod: 1, DamageFactor: 1.0, TraitValueBonus: 0,
        SavesProficient: ["Mig", "Agi", "Cha", "Int"],
        AttributePriority: ["Mig", "Agi", "Cha", "Int"],
        Skills: ["athletics", "awareness"],
    },
    striker: {
        HPFactor: 0.75, PDMod: -1, ADMod: -1, CheckMod: 0, SpeedMod: 1, DamageFactor: 1.5, TraitValueBonus: 0,
        SavesProficient: ["Agi", "Mig", "Cha", "Int"],
        AttributePriority: ["Agi", "Mig", "Cha", "Int"],
        Skills: ["stealth", "awareness", "acrobatics"],
    },
    tactician: {
        HPFactor: 0.75, PDMod: 0, ADMod: 0, CheckMod: 0, SpeedMod: 0, DamageFactor: 0.75, TraitValueBonus: 8,
        SavesProficient: ["Int", "Cha", "Mig", "Agi"],
        AttributePriority: ["Int", "Cha", "Agi", "Mig"],
        Skills: ["awareness", "insight", "influence", "trickery"],
        isCaster: true,
    },
    none: { // Default if no role is selected or for generic creatures
        HPFactor: 1.0, PDMod: 0, ADMod: 0, CheckMod: 0, SpeedMod: 0, DamageFactor: 1.0, TraitValueBonus: 0,
        SavesProficient: ["Mig", "Agi", "Cha", "Int"],
        AttributePriority: ["Mig", "Agi", "Cha", "Int"],
        Skills: [],
    }
};

// Scaling factors based on monster power level
// RP: baseline Reaction Points pool (Epic = 2, Legendary = 4; others = 0)
export const powerScalingFactors = {
    minion:     { HPFactor: 0.5, PDMod: -4, ADMod: -4, CheckMod: -1, SaveDCMod: -1, DamageFactor: 0.5,  APMod: -1, RP: 0 },
    weak:       { HPFactor: 0.7, PDMod: -2, ADMod: -2, CheckMod: -1, SaveDCMod: -1, DamageFactor: 0.75, APMod: -1, RP: 0 },
    normal:     { HPFactor: 1.0, PDMod: 0,  ADMod: 0,  CheckMod: 0,  SaveDCMod: 0,  DamageFactor: 1.0,  APMod: 0,  RP: 0 },
    apex:       { HPFactor: 2.0, PDMod: 2,  ADMod: 2,  CheckMod: 1,  SaveDCMod: 1,  DamageFactor: 1.5,  APMod: 0,  RP: 2 },
    legendary:  { HPFactor: 4.0, PDMod: 2,  ADMod: 2,  CheckMod: 1,  SaveDCMod: 1,  DamageFactor: 1.5,  APMod: 0,  RP: 4 },
};

// Type flavor: humanoid (armored), beast (tough hide), dragon (deadly and durable),
// construct (durable, less accurate), undead (easy to hit, strong saves),
// elemental (high AD), fiend (strong saves), aberration (hard-hitting),
// plant (very tough, high HP), giant (high HP/AD, lower PD, hard-hitting),
// fey (elusive/high PD, potent saves), ooze (very high HP/AD, low PD, mindless),
// celestial (balanced resilience, +PD/AD/SaveDC).
export const typeScalingFactors = {
    humanoid:  {HPFactor: 1.0, PDMod:  2, ADMod: 0, CheckMod:  1,   SaveDCMod: 0, DamageFactor: 1.0},
    beast:     {HPFactor: 1.2, PDMod:  1, ADMod: 1, CheckMod:  0,   SaveDCMod: 0, DamageFactor: 1.1},
    dragon:    {HPFactor: 1.3, PDMod:  1, ADMod: 1, CheckMod:  0,   SaveDCMod: 0, DamageFactor: 1.3},
    construct: {HPFactor: 1.3, PDMod:  0, ADMod: 2, CheckMod: -0.5, SaveDCMod: 1, DamageFactor: 1.0},
    undead:    {HPFactor: 1.0, PDMod:  0, ADMod: 0, CheckMod:  1,   SaveDCMod: 1, DamageFactor: 1.1},
    elemental: {HPFactor: 1.2, PDMod:  0, ADMod: 2, CheckMod:  1,   SaveDCMod: 0, DamageFactor: 1.1},
    fiend:     {HPFactor: 1.0, PDMod:  1, ADMod: 1, CheckMod:  1,   SaveDCMod: 1, DamageFactor: 1.1},
    aberration:{HPFactor: 1.0, PDMod:  0, ADMod: 0, CheckMod:  1,   SaveDCMod: 1, DamageFactor: 1.2},
    plant:     {HPFactor: 1.5, PDMod:  2, ADMod: 0, CheckMod:  0,   SaveDCMod: 0, DamageFactor: 1.0},
    giant:     {HPFactor: 1.4, PDMod: -2, ADMod: 2, CheckMod:  0,   SaveDCMod: 0, DamageFactor: 1.2},
    fey:       {HPFactor: 1.0, PDMod:  1, ADMod: 0, CheckMod:  1,   SaveDCMod: 2, DamageFactor: 1.0},
    ooze:      {HPFactor: 1.5, PDMod: -2, ADMod: 2, CheckMod: -1,   SaveDCMod: 0, DamageFactor: 1.1},
    celestial: {HPFactor: 1.0, PDMod:  1, ADMod: 1, CheckMod:  1,   SaveDCMod: 1, DamageFactor: 1.0},
    none:      {HPFactor: 1.0, PDMod:  0, ADMod: 0, CheckMod:  0,   SaveDCMod: 0, DamageFactor: 1.0},
}


export const sizeScalingFactors = {
    tiny:       {PDMod: 2,  ADMod: -2, HPMod: 0.6},
    small:      {PDMod: 1,  ADMod: -1, HPMod: .8},
    medium:     {PDMod: 0,  ADMod: 0 , HPMod: 1},
    large:      {PDMod: -1, ADMod: 1 , HPMod: 1.2},
    huge:       {PDMod: -2, ADMod: 2 , HPMod: 1.4},
    gargantuan: {PDMod: -4, ADMod: 4 , HPMod: 1.6}
}

export const SkillAttribute = {
    awareness: "Prime",
    athletics: "Mig",
    intimidation: "Mig",
    acrobatics: "Agi",
    trickery: "Agi",
    stealth: "Agi",
    animal: "Cha",
    insight: "Cha",
    influence: "Cha",
    investigation: "Int",
    medicine: "Int",
    survival: "Int"
};

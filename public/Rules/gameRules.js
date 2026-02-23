// src/data/gameRules.js

// Corresponds to your creatureLevelStats
export const baseLevelStatsData = [
    { level: 0, HP: 7,   PD: 10, AD: 10, Check: 2,  Damage: 0.5, AP: 4, Speed: 5, SaveDC: 13, FeaturePower: 1 },
    { level: 1, HP: 9,  PD: 11, AD: 11, Check: 3,  Damage: 1,   AP: 4, Speed: 5, SaveDC: 14, FeaturePower: 1 },
    { level: 2, HP: 12,  PD: 11, AD: 11, Check: 3,  Damage: 1.5, AP: 4, Speed: 5, SaveDC: 14, FeaturePower: 2 },
    { level: 3, HP: 14,  PD: 12, AD: 12, Check: 4,  Damage: 2, AP: 4, Speed: 5, SaveDC: 15, FeaturePower: 2 },
    { level: 4, HP: 17,  PD: 12, AD: 12, Check: 4,  Damage: 2.5,   AP: 4, Speed: 5, SaveDC: 15, FeaturePower: 3 },
    { level: 5, HP: 20,  PD: 14, AD: 14, Check: 6,  Damage: 3,   AP: 4, Speed: 5, SaveDC: 17, FeaturePower: 3 },
    { level: 6, HP: 23,  PD: 14, AD: 14, Check: 6,  Damage: 3.5, AP: 4, Speed: 5, SaveDC: 17, FeaturePower: 4 },
    { level: 7, HP: 25,  PD: 15, AD: 15, Check: 7,  Damage: 4,   AP: 4, Speed: 5, SaveDC: 18, FeaturePower: 4 },
    { level: 8, HP: 28,  PD: 15, AD: 15, Check: 7,  Damage: 4.5, AP: 4, Speed: 5, SaveDC: 18, FeaturePower: 5 },
    { level: 9, HP: 31,  PD: 16, AD: 16, Check: 8,  Damage: 5,   AP: 4, Speed: 5, SaveDC: 19, FeaturePower: 5 },
    { level: 10, HP: 34, PD: 17, AD: 17, Check: 9,  Damage: 5.5, AP: 4, Speed: 5, SaveDC: 20, FeaturePower: 6 }
];
// Corresponds to your statsPerLevel (for MIG, AGI, CHA, INT in order)
export const attributeScoresByLevel = [
    { level: 0, scores: [2, 1, 1, -2] }, // [Prime, Secondary, Tertiary, Quaternary]
    { level: 1, scores: [3, 2, 1, -2] },
    { level: 2, scores: [3, 2, 2, -2] },
    { level: 3, scores: [3, 2, 2, -2] },
    { level: 4, scores: [3, 2, 2, -1] },
    { level: 5, scores: [4, 2, 2, -1] },
    { level: 6, scores: [4, 2, 2, -1] },
    { level: 7, scores: [4, 3, 2, -1] },
    { level: 8, scores: [4, 3, 2, -1] },
    { level: 9, scores: [4, 3, 2, 0] },
    { level: 10, scores: [5, 3, 2, 0] }
];

// Corresponds to your roleStats
export const roleModifiersData = {
    artillerist: {
        HPFactor: 0.7, PDMod: -2, ADMod: 2, CheckMod: 1, SpeedMod: -1, DamageMod: 0, MPMod: 0,
        SavesProficient: ["Int", "Cha", "Mig", "Agi"], // Attributes for proficient saves
        AttributePriority: ["Agi", "Int", "Cha", "Mig"], // Order for assigning from attributeScoresByLevel
        Skills: ["stealth", "awareness", "acrobatics", "trickery"], Range: "15/30 Spaces",
        isCaster: false, // Could be true for some artillerists
    },
    brute: {
        HPFactor: 1.3, PDMod: -3, ADMod: 0, CheckMod: 0, SpeedMod: 1, DamageMod: 1, MPMod: 0,
        SavesProficient: ["Int", "Cha", "Mig", "Agi"], AttributePriority: ["Mig", "Agi", "Cha", "Int"],
        Skills: ["athletics", "awareness", "survival"],
    },
    controller: {
        HPFactor: 1, PDMod: 0, ADMod: 2, CheckMod: 0, SpeedMod: 0, DamageMod: 0, MPMod: 6,
        SavesProficient: ["Int", "Cha", "Mig", "Agi"], AttributePriority: ["Cha", "Int", "Mig", "Agi"],
        Skills: ["awareness", "insight", "trickery", "influence"], Range: "5/10 Spaces", isCaster: true,
    },
    defender: {
        HPFactor: 1.2, PDMod: 2, ADMod: 0, CheckMod: -1, SpeedMod: 0, DamageMod: -1, MPMod: 0,
        SavesProficient: ["Int", "Cha", "Mig", "Agi"], AttributePriority: ["Mig", "Agi", "Cha", "Int"],
        Skills: ["athletics"],
    },
    leader: {
        HPFactor: 1, PDMod: 0, ADMod: 2, CheckMod: 1, SpeedMod: 0, DamageMod: 0, MPMod: 0,
        SavesProficient: ["Int", "Cha", "Mig", "Agi"], AttributePriority: ["Cha", "Agi", "Int", "Mig"],
        Skills: ["insight", "awareness", "influence", "intimidation"], Range: "5/10 Spaces", isCaster: true,
    },
    lurker: {
        HPFactor: 0.8, PDMod: -2, ADMod: 0, CheckMod: 1, SpeedMod: 0, DamageMod: 1, MPMod: 0,
        SavesProficient: ["Int", "Cha", "Mig", "Agi"], AttributePriority: ["Agi", "Cha", "Int", "Mig"],
        Skills: ["stealth", "awareness", "acrobatics", "trickery"], Range: "10/20 Saces",
    },
    skirmisher: {
        HPFactor: 1, PDMod: 0, ADMod: 0, CheckMod: 0, SpeedMod: 1, DamageMod: 0, MPMod: 0,
        SavesProficient: ["Int", "Cha", "Mig", "Agi"], AttributePriority: ["Agi", "Mig", "Cha", "Int"],
        Skills: ["acrobatics", "survival", "stealth"],
    },
    support: {
        HPFactor: 0.8, PDMod: 0, ADMod: 2, CheckMod: 0, SpeedMod: 0, DamageMod: 0, MPMod: 6,
        SavesProficient: ["Cha", "Agi"], AttributePriority: ["Cha", "Agi", "Int", "Mig"],
        Skills: ["awareness", "influence", "insight"], isCaster: true, Range: "5/10 Spaces"
    },
    caster: {
        HPFactor: 0.7, PDMod: -1, ADMod: 0, CheckMod: 0, SpeedMod: 0, DamageMod: 0, MPMod: 6,
        SavesProficient: ["Int", "Cha", "Mig", "Agi"], AttributePriority: ["Int", "Cha", "Agi", "Mig"],
        Skills: ["awareness"], isCaster: true, Range: "10/20 Spaces"
    },
    none: { // Default if no role is selected or for generic creatures
        HPFactor: 1, PDMod: 0, ADMod: 0, CheckMod: 0, SpeedMod: 0, DamageMod: 0, MPMod: 0,
        SavesProficient: ["Int", "Cha", "Mig", "Agi"], AttributePriority: ["Mig", "Agi", "Cha", "Int"],
        Skills: [],
    }
};

// Scaling factors based on monster power level
export const powerScalingFactors = {
    minion:     { HPFactor: 0.5, PDMod: -4, ADMod: -4, CheckMod: -1, SaveDCMod: -1, DamageMod: -1, APMod: -1},
    weak:       { HPFactor: 0.7, PDMod: -2, ADMod: -2, CheckMod: -1, SaveDCMod: -1, DamageMod: 0,  APMod: -1},
    normal:     { HPFactor: 1.0, PDMod: 0,  ADMod: 0,  CheckMod: 0,  SaveDCMod: 0,  DamageMod: 0,  APMod: 0},
    apex:       { HPFactor: 2.0, PDMod: 2,  ADMod: 2,  CheckMod: 1,  SaveDCMod: 1,  DamageMod: 1,  APMod: 0},
    legendary:  { HPFactor: 4.0, PDMod: 2,  ADMod: 2,  CheckMod: 1,  SaveDCMod: 1,  DamageMod: 1,  APMod: 0},
};

// Type flavor: humanoid (armored), beast (tough hide), dragon (deadly and durable),
// construct (durable, less accurate), undead (easy to hit, strong saves),
// elemental (high AD), fiend (strong saves), aberration (hard-hitting),
// plant (very tough, high HP), giant (high HP/AD, lower PD, hard-hitting),
// fey (elusive/high PD, potent saves), ooze (very high HP/AD, low PD, mindless),
// celestial (balanced resilience, +PD/AD/SaveDC).
export const typeScalingFactors = {
    humanoid:  {HPFactor: 1.0, PDMod:  2, ADMod: 0, CheckMod:  1,   SaveDCMod: 0, DamageMod: 0},
    beast:     {HPFactor: 1.2, PDMod:  1, ADMod: 1, CheckMod:  0,   SaveDCMod: 0, DamageMod: 0.5},
    dragon:    {HPFactor: 1.3, PDMod:  1, ADMod: 1, CheckMod:  0,   SaveDCMod: 0, DamageMod: 1},
    construct: {HPFactor: 1.3, PDMod:  0, ADMod: 2, CheckMod: -0.5, SaveDCMod: 1, DamageMod: 0},
    undead:    {HPFactor: 1.0, PDMod:  0, ADMod: 0, CheckMod:  1,   SaveDCMod: 1, DamageMod: 0.5},
    elemental: {HPFactor: 1.2, PDMod:  0, ADMod: 2, CheckMod:  1,   SaveDCMod: 0, DamageMod: 0.5},
    fiend:     {HPFactor: 1.0, PDMod:  1, ADMod: 1, CheckMod:  1,   SaveDCMod: 1, DamageMod: 0.5},
    aberration:{HPFactor: 1.0, PDMod:  0, ADMod: 0, CheckMod:  1,   SaveDCMod: 1, DamageMod: 1},
    plant:     {HPFactor: 1.5, PDMod:  2, ADMod: 0, CheckMod:  0,   SaveDCMod: 0, DamageMod: 0},
    giant:     {HPFactor: 1.4, PDMod: -2, ADMod: 2, CheckMod:  0,   SaveDCMod: 0, DamageMod: 1},
    fey:       {HPFactor: 1.0, PDMod:  1, ADMod: 0, CheckMod:  1,   SaveDCMod: 2, DamageMod: 0},
    ooze:      {HPFactor: 1.5, PDMod: -2, ADMod: 2, CheckMod: -1,   SaveDCMod: 0, DamageMod: 0.5},
    celestial: {HPFactor: 1.0, PDMod:  1, ADMod: 1, CheckMod:  1,   SaveDCMod: 1, DamageMod: 0},
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

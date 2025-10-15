// src/data/gameRules.js

// Corresponds to your creatureLevelStats
export const baseLevelStatsData = [
    { level: 0, HP: 8,   PD: 11, AD: 11, Check: 3,  Damage: 1,   AP: 4, Speed: 5, SaveDC: 13, FeaturePower: 1 },
    { level: 1, HP: 10,  PD: 12, AD: 12, Check: 4,  Damage: 1.5, AP: 4, Speed: 5, SaveDC: 14, FeaturePower: 1 },
    { level: 2, HP: 13,  PD: 12, AD: 12, Check: 4,  Damage: 2,   AP: 4, Speed: 5, SaveDC: 14, FeaturePower: 2 },
    { level: 3, HP: 15,  PD: 13, AD: 13, Check: 5,  Damage: 3,   AP: 4, Speed: 5, SaveDC: 15, FeaturePower: 2 },
    { level: 4, HP: 18,  PD: 13, AD: 13, Check: 5,  Damage: 3.5, AP: 4, Speed: 5, SaveDC: 15, FeaturePower: 3 },
    { level: 5, HP: 21,  PD: 15, AD: 15, Check: 7,  Damage: 4.5, AP: 4, Speed: 5, SaveDC: 17, FeaturePower: 3 },
    { level: 6, HP: 24,  PD: 15, AD: 15, Check: 7,  Damage: 5,   AP: 4, Speed: 5, SaveDC: 17, FeaturePower: 4 },
    { level: 7, HP: 26,  PD: 16, AD: 16, Check: 8,  Damage: 5.5, AP: 4, Speed: 5, SaveDC: 18, FeaturePower: 4 },
    { level: 8, HP: 29,  PD: 16, AD: 16, Check: 8,  Damage: 6,   AP: 4, Speed: 5, SaveDC: 18, FeaturePower: 5 },
    { level: 9, HP: 32,  PD: 17, AD: 17, Check: 9,  Damage: 6.5, AP: 4, Speed: 5, SaveDC: 19, FeaturePower: 5 },
    { level: 10, HP: 35, PD: 18, AD: 18, Check: 10, Damage: 7,   AP: 4, Speed: 5, SaveDC: 20, FeaturePower: 6 }
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
        HPFactor: 1.3, PDMod: -4, ADMod: -2, CheckMod: 0, SpeedMod: 1, DamageMod: 1, MPMod: 0,
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
        HPFactor: 1, PDMod: 0, ADMod: 2, CheckMod: 0, SpeedMod: 0, DamageMod: 0, MPMod: 0,
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

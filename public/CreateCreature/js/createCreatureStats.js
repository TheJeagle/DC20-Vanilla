import {
  baseLevelStatsData,
  powerScalingFactors,
  roleModifiersData,
  attributeScoresByLevel,
  sizeScalingFactors,
  typeScalingFactors,
} from '../../Rules/gameRules.js';

const ATTRIBUTE_KEYS = ['Mig', 'Agi', 'Cha', 'Int'];
const NUMERIC_DELTA_FIELDS = ['HP', 'PD', 'AD', 'damage', 'check', 'saveDC', 'AP', 'speed'];

function toTitleCase(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeAttributeKey(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return ATTRIBUTE_KEYS.find((attribute) => attribute.toLowerCase() === normalized) ?? null;
}

function normalizeAttributePriority(candidate, fallback) {
  const resolved = [];
  const attemptOrder = Array.isArray(candidate) ? candidate : [];
  const fallbackOrder = Array.isArray(fallback) ? fallback : ATTRIBUTE_KEYS;

  const enqueue = (attribute) => {
    const normalized = normalizeAttributeKey(attribute);
    if (normalized && !resolved.includes(normalized)) {
      resolved.push(normalized);
    }
  };

  attemptOrder.forEach(enqueue);
  fallbackOrder.forEach(enqueue);
  return resolved;
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeRankValueDeltas(raw) {
  const normalized = {};
  if (!raw || typeof raw !== 'object') return normalized;

  Object.entries(raw).forEach(([key, value]) => {
    const index = Number(key);
    const numeric = Number(value);
    if (!Number.isNaN(index) && index >= 0 && Number.isFinite(numeric) && Math.abs(numeric) > 1e-9) {
      normalized[index] = numeric;
    }
  });
  return normalized;
}

function normalizeAttributeValueDeltas(raw) {
  const normalized = {};
  if (!raw || typeof raw !== 'object') return normalized;

  ATTRIBUTE_KEYS.forEach((attribute) => {
    const numeric = Number(raw[attribute]);
    if (Number.isFinite(numeric) && Math.abs(numeric) > 1e-9) {
      normalized[attribute] = numeric;
    }
  });
  return normalized;
}

function clampLevel(level) {
  const min = 0;
  const max = baseLevelStatsData[baseLevelStatsData.length - 1].level;
  return Math.min(Math.max(level, min), max);
}

function computeScaledStats({
  level,
  role,
  power,
  size,
  type,
  deltas,
  combatMastery,
}) {
  const fallbackStats = baseLevelStatsData[baseLevelStatsData.length - 1] ?? {};
  const stats =
    baseLevelStatsData[level] ??
    baseLevelStatsData.find((entry) => entry.level === level) ??
    fallbackStats;

  const roleScaling =
    roleModifiersData[role] ??
    roleModifiersData.none ??
    roleModifiersData[Object.keys(roleModifiersData)[0]];

  const powerScaling =
    powerScalingFactors[power] ??
    powerScalingFactors.normal ??
    powerScalingFactors[Object.keys(powerScalingFactors)[0]];

  const sizeKey = sizeScalingFactors[size] ? size : toTitleCase(size);
  const sizeScaling = sizeScalingFactors[sizeKey] ?? { PDMod: 0, ADMod: 0 };

  const rawType = typeof type === 'string' ? type.trim() : type;
  const typeKey = typeScalingFactors[rawType] ? rawType : String(rawType ?? '').trim().toLowerCase();
  const typeScaling = typeScalingFactors[typeKey] ?? {
    HPFactor: 1,
    PDMod: 0,
    ADMod: 0,
    CheckMod: 0,
    SaveDCMod: 0,
    DamageMod: 0,
  };

  const workingDeltas = deltas && typeof deltas === 'object' ? { ...deltas } : {};

  const priorityDefault = Array.isArray(roleScaling.AttributePriority)
    ? [...roleScaling.AttributePriority]
    : [...ATTRIBUTE_KEYS];

  const hasCustomPriority =
    Array.isArray(workingDeltas.attributePriority) && workingDeltas.attributePriorityCustom === true;
  const storedPriority = hasCustomPriority ? workingDeltas.attributePriority : null;
  const attributePriority = storedPriority
    ? normalizeAttributePriority(storedPriority, priorityDefault)
    : [...priorityDefault];

  if (storedPriority) {
    workingDeltas.attributePriority = attributePriority.slice();
    workingDeltas.attributePriorityCustom = true;
  } else {
    delete workingDeltas.attributePriority;
    delete workingDeltas.attributePriorityCustom;
  }

  const rankValueDeltas = normalizeRankValueDeltas(workingDeltas.rankValueDeltas);
  if (Object.keys(rankValueDeltas).length) {
    workingDeltas.rankValueDeltas = rankValueDeltas;
  } else {
    delete workingDeltas.rankValueDeltas;
  }

  const attributeValueDeltas = normalizeAttributeValueDeltas(workingDeltas.attributes);
  if (Object.keys(attributeValueDeltas).length) {
    workingDeltas.attributes = attributeValueDeltas;
  } else {
    delete workingDeltas.attributes;
  }

  const attributes = {};
  const attributeSaves = {};
  ATTRIBUTE_KEYS.forEach((attribute) => {
    attributes[attribute] = 0;
    attributeSaves[attribute] = 0;
  });

  const levelScoreEntry =
    attributeScoresByLevel[level] ??
    attributeScoresByLevel.find((entry) => entry.level === level);
  const rawLevelScores = Array.isArray(levelScoreEntry?.scores) ? [...levelScoreEntry.scores] : [];
  while (rawLevelScores.length < attributePriority.length) {
    rawLevelScores.push(rawLevelScores[rawLevelScores.length - 1] ?? 0);
  }

  const assignedScores = [];

  attributePriority.forEach((attribute, index) => {
    const baseScore = rawLevelScores[index] ?? rawLevelScores[rawLevelScores.length - 1] ?? 0;
    const rankAdjustment = rankValueDeltas[index] ?? 0;
    const attributeAdjustment = attributeValueDeltas[attribute] ?? 0;
    const finalScore = baseScore + rankAdjustment + attributeAdjustment;
    attributes[attribute] = finalScore;
    attributeSaves[attribute] = finalScore + combatMastery;
    assignedScores.push(finalScore);
  });

  const primeAttribute = attributePriority[0] || '';
  attributes.Prime = assignedScores[0] ?? rawLevelScores[0] ?? 0;
  const skills = Array.isArray(roleScaling.Skills) ? [...roleScaling.Skills] : [];

  const scaledHP =
    (stats.HP ?? 1) *
    (roleScaling.HPFactor ?? 1) *
    (powerScaling.HPFactor ?? 1) *
    (typeScaling.HPFactor ?? 1) *
    (sizeScaling.HPMod ?? 0);
  const HP = Math.ceil(scaledHP);

  const PD =
    (stats.PD ?? 0) +
    (roleScaling.PDMod ?? 0) +
    (powerScaling.PDMod ?? 0) +
    (typeScaling.PDMod ?? 0) +
    (sizeScaling.PDMod ?? 0);
  const AD =
    (stats.AD ?? 0) +
    (roleScaling.ADMod ?? 0) +
    (powerScaling.ADMod ?? 0) +
    (typeScaling.ADMod ?? 0) +
    (sizeScaling.ADMod ?? 0);

  const baseDamage =
    (stats.Damage ?? 0) +
    (roleScaling.DamageMod ?? 0) +
    (powerScaling.DamageMod ?? 0) +
    (typeScaling.DamageMod ?? 0);
  const damage = baseDamage;

  const check =
    (stats.Check ?? 0) +
    (roleScaling.CheckMod ?? 0) +
    (powerScaling.CheckMod ?? 0) +
    (typeScaling.CheckMod ?? 0);
  const saveDC = (stats.SaveDC ?? 0) + (powerScaling.SaveDCMod ?? 0) + (typeScaling.SaveDCMod ?? 0);
  const featurePower = stats.FeaturePower ?? 0;
  const AP = (stats.AP ?? 0) + (powerScaling.APMod ?? 0);
  const speed = (stats.Speed ?? 0) + (roleScaling.SpeedMod ?? 0);

  return {
    attributePriority,
    attributes,
    attributeSaves,
    primeAttribute,
    skills,
    HP,
    PD,
    AD,
    damage,
    check,
    saveDC,
    featurePower,
    AP,
    speed,
    deltas: workingDeltas,
  };
}

function applyNumericDeltas(creature) {
  if (!creature.deltas || typeof creature.deltas !== 'object') return;
  NUMERIC_DELTA_FIELDS.forEach((field) => {
    const adjustment = Number(creature.deltas[field]);
    if (!Number.isFinite(adjustment) || Math.abs(adjustment) <= 1e-9) return;
    const currentValue = Number(creature[field]) || 0;
    creature[field] = currentValue + adjustment;
  });
}

export {
  ATTRIBUTE_KEYS,
  NUMERIC_DELTA_FIELDS,
  arraysEqual,
  clampLevel,
  computeScaledStats,
  normalizeAttributePriority,
  normalizeAttributeValueDeltas,
  normalizeRankValueDeltas,
  applyNumericDeltas,
};

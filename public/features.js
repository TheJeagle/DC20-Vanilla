import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { featureTypes as FEATURE_TYPES } from './constants/featureTypes.js';
import { db } from './firebaseClient.js';

const FEATURE_COLLECTION = 'VanillaFeatures';

export async function loadFeatures() {
  try {
    const byId = {};
    const snapshot = await getDocs(collection(db, FEATURE_COLLECTION));
    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      if (!data) return;
      const id = data.id || docSnapshot.id;
      if (!id) return;
      byId[id] = { id, ...data };
    });
    return byId;
  } catch (error) {
    console.error('Failed to load features from Firestore', error);
    return {};
  }
}

function normalizeFeatureType(type) {
  const value = String(type ?? '').toLowerCase();
  if (!value) return value;
  if (value === FEATURE_TYPES.ACTION) return FEATURE_TYPES.ACTION;
  if (value === FEATURE_TYPES.MODIFIER) return FEATURE_TYPES.MODIFIER;
  if (value === FEATURE_TYPES.PASSIVE) return FEATURE_TYPES.PASSIVE;
  if (value.startsWith('action')) return FEATURE_TYPES.ACTION;
  return value;
}

function getFeatureSummary(feature) {
  if (!feature) return '';
  const effects = feature.effects ?? {};
  const summary =
    effects.text ??
    feature.description ??
    feature.featureDescription ??
    effects.actionDescription ??
    '';
  return typeof summary === 'string' ? summary.trim() : '';
}

function getActionDescription(feature) {
  if (!feature) return '';
  const effects = feature.effects ?? {};
  const description =
    effects.actionDescription ??
    feature.description ??
    feature.featureDescription ??
    '';
  return typeof description === 'string' ? description.trim() : '';
}

export function applyFeatureEffects(creature, features) {
  if (!features || features.length === 0) {
    creature.featureActions = [];
    creature.featureReactions = [];
    creature.featurePassives = [];
    return;
  }

  const modifiers = {
    hp: 0,
    pd: 0,
    ad: 0,
    speed: 0,
    damage: 0,
    resistances: { damage: [], condition: [] },
    vulnerabilities: { damage: [], condition: [] },
    immunities: { damage: [], condition: [] },
    senses: [],
  };

  const actionFeatures = [];
  const passives = [];

  features.forEach((feature) => {
    if (!feature) return;
    const { effects } = feature;
    const type = normalizeFeatureType(feature.type);
    if (!effects) return;

    if (type === FEATURE_TYPES.MODIFIER) {
      applyModifier(modifiers, effects);
    } else if (type === FEATURE_TYPES.ACTION) {
      actionFeatures.push(feature);
    } else if (type === FEATURE_TYPES.PASSIVE) {
      passives.push(feature);
    }
  });

  applyModifiersToCreature(creature, modifiers);
  const builtActions = actionFeatures
    .map((feature) => buildAction(creature, feature))
    .filter(Boolean);
  creature.featureActions = builtActions.filter((action) => !action.isReaction);
  creature.featureReactions = builtActions.filter((action) => action.isReaction);
  creature.featurePassives = passives;
}

function applyModifier(bucket, effects) {
  if (typeof effects.hp === 'number') bucket.hp += effects.hp;
  if (typeof effects.pd === 'number') bucket.pd += effects.pd;
  if (typeof effects.ad === 'number') bucket.ad += effects.ad;
  if (typeof effects.speed === 'number') bucket.speed += effects.speed;
  if (typeof effects.damage === 'number') bucket.damage += effects.damage;

  mergeTraits(bucket.resistances, effects.resistances);
  mergeTraits(bucket.vulnerabilities, effects.vulnerabilities);
  mergeTraits(bucket.immunities, effects.immunities);

  if (Array.isArray(effects.senses)) {
    bucket.senses.push(...effects.senses);
  }
}

function mergeTraits(target, source) {
  if (!source) return;
  if (Array.isArray(source.damage)) {
    source.damage.forEach((entry) => {
      if (!target.damage.includes(entry)) target.damage.push(entry);
    });
  }
  if (Array.isArray(source.condition)) {
    source.condition.forEach((entry) => {
      if (!target.condition.includes(entry)) target.condition.push(entry);
    });
  }
}

function applyModifiersToCreature(creature, modifiers) {
  creature.HP += modifiers.hp;
  creature.PD += modifiers.pd;
  creature.AD += modifiers.ad;
  creature.speed += modifiers.speed;
  creature.damage += modifiers.damage;

  mergeTraitGroup(creature.resistances, modifiers.resistances);
  mergeTraitGroup(creature.vulnerabilities, modifiers.vulnerabilities);
  mergeTraitGroup(creature.immunities, modifiers.immunities);

  if (Array.isArray(modifiers.senses) && modifiers.senses.length) {
    if (!Array.isArray(creature.senses)) {
      creature.senses = [];
    }
    modifiers.senses.forEach((sense) => {
      if (!creature.senses.includes(sense)) creature.senses.push(sense);
    });
  }
}

function mergeTraitGroup(target, additions) {
  if (!target || !additions) return;
  additions.damage.forEach((entry) => {
    if (!target.damage.includes(entry)) target.damage.push(entry);
  });
  additions.condition.forEach((entry) => {
    if (!target.condition.includes(entry)) target.condition.push(entry);
  });
}

function buildAction(creature, feature) {
  if (!feature.effects) return null;

  const { effects } = feature;
  const actionType = feature.actionType ?? effects.actionType ?? 'Attack';
  const isReaction = Boolean(feature.isReaction || effects.isReaction);
  const reactionTrigger = feature.reactionTrigger ?? effects.reactionTrigger ?? '';
  const isLegendaryAction = Boolean(feature.isLegendaryAction || effects.isLegendaryAction);
  const isApexAction = Boolean(feature.isApexAction || effects.isApexAction);
  const baseDamage = creature.damage ?? 0;
  const segments = Array.isArray(effects.damageSegments) ? effects.damageSegments : [];
  const actionTypeLabel = typeof actionType === 'string' ? actionType.toLowerCase() : '';
  const isAttackType = actionTypeLabel.includes('attack');

  const mappedSegments = segments.length
    ? segments
        .map((segment) => {
          // Explicit fixed amount (not relative to creature damage) — store as-is
          if (typeof segment.amount === 'number') {
            return { amount: segment.amount, type: segment.type ?? '' };
          }
          // Delta-based: preserve useBase + modifier so renderers compute from live stats
          return {
            useBase:  Boolean(segment.useBase),
            modifier: typeof segment.modifier === 'number' ? segment.modifier : 0,
            type:     segment.type ?? '',
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
        dc: typeof effects.check.dc === 'number' ? effects.check.dc : Number(effects.check.dc) || null,
        failure: effects.check.failure ?? '',
        failureEach5: effects.check.failureEach5 ?? '',
        success: effects.check.success ?? '',
        successEach5: effects.check.successEach5 ?? '',
      }
    : null;

  return {
    id: feature.id,
    name: feature.name || feature.id || 'Unnamed Action',
    description: getActionDescription(feature),
    cost: typeof effects.cost === 'number' ? effects.cost : Number(effects.cost) || 0,
    actionType,
    damage,
    targetDefense: effects.targetDefense ?? (isAttackType ? 'PD' : ''),
    target: effects.target ?? '',
    range: effects.range ?? '',
    dc: effects.dc ?? (check ? check.dc : null),
    check,
    save: effects.save
      ? {
          attribute: effects.save.attribute ?? '',
          dc:
            typeof effects.save.dc === 'number'
              ? effects.save.dc
              : Number(effects.save.dc) || effects.dc || null,
          failure: effects.save.failure ?? effects.save.effect ?? '',
          failureEach5: effects.save.failureEach5 ?? '',
          success: effects.save.success ?? '',
          successEach5: effects.save.successEach5 ?? '',
        }
      : null,
    featureCost: feature.featureCost ?? 0,
    isReaction,
    reactionTrigger: reactionTrigger ? String(reactionTrigger).trim() : '',
    isLegendaryAction,
    isApexAction,
  };
}

export { FEATURE_TYPES, getFeatureSummary };

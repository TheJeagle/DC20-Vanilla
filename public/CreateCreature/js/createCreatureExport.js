import { FEATURE_TYPES, getFeatureSummary } from '../../features.js';
import { creature, featureState } from './createCreatureState.js';

function toTitleCase(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toSigned(value) {
  const n = Math.round(Number(value) || 0);
  return `${n >= 0 ? '+' : ''}${n}`;
}

/** Wrap a string in double quotes, escaping any internal double quotes. */
function yamlQuote(str) {
  return '"' + String(str ?? '').replace(/"/g, '\\"') + '"';
}

function buildActionDesc(action, fallbackSaveDC, baseDamage) {
  const parts = [];

  if (action.actionType) parts.push(action.actionType);
  if (action.targetDefense) parts.push(`vs ${action.targetDefense}`);
  if (action.target) parts.push(action.target);
  if (action.range) parts.push(action.range);

  if (Array.isArray(action.damage) && action.damage.length) {
    const base = Number(baseDamage) || 0;
    let heavyHit = false;
    const dmg = action.damage
      .map((d) => {
        const amt = d.useBase !== undefined
          ? (d.useBase ? base : 0) + (Number(d.modifier) || 0)
          : Number(d.amount) || 0;
        if (amt % 1 !== 0) heavyHit = true;
        return d.type ? `${Math.floor(amt)} ${d.type}` : String(Math.floor(amt));
      })
      .join(' + ');
    parts.push(`${dmg} damage${heavyHit ? ', +1 on heavy hits' : ''}`);
  }

  if (action.save?.attribute) {
    const dc = action.save.dc ?? fallbackSaveDC;
    parts.push(`${action.save.attribute} Save DC ${dc}`);
    if (action.save.failure) parts.push(`Failure: ${action.save.failure}`);
    if (action.save.failureEach5) parts.push(`Failure (Each 5): ${action.save.failureEach5}`);
    if (action.save.success) parts.push(`Success: ${action.save.success}`);
  }

  if (action.check?.dc != null) {
    parts.push(`DC ${action.check.dc}`);
    if (action.check.failure) parts.push(`Failure: ${action.check.failure}`);
    if (action.check.success) parts.push(`Success: ${action.check.success}`);
  }

  if (action.reactionTrigger) parts.push(`Trigger: ${action.reactionTrigger}`);
  if (action.description) parts.push(action.description);

  return parts.filter(Boolean).join(', ');
}

function buildActionEntry(action, fallbackSaveDC, baseDamage) {
  const cost = action.cost != null ? ` (${action.cost})` : '';
  const name = `${action.name || 'Action'}${cost}`;
  let desc = buildActionDesc(action, fallbackSaveDC, baseDamage);

  // Parse enhancements based on the Firebase JSON structure
  if (Array.isArray(action.enhancements) && action.enhancements.length > 0) {
    const enhStrings = action.enhancements.map(enh => {
      if (!enh) return '';
      const eCost = enh.cost ?? 1;
      const eName = enh.name || 'Enhancement';
      let parts = [];
      
      // 1. Handle Save block
      if (enh.save && enh.save.attribute) {
        const savePrefix = enh.save.repeatable ? 'Repeatable ' : '';
        let s = `${savePrefix}${enh.save.attribute} Save. Failure: ${enh.save.failure || ''}`;
        if (enh.save.failureEach5) s += ` Failure (Each 5): ${enh.save.failureEach5}.`;
        if (enh.save.success) s += ` Success: ${enh.save.success}.`;
        if (enh.save.successEach5) s += ` Success (Each 5): ${enh.save.successEach5}.`;
        if (enh.save.duration) s += ` Duration: ${enh.save.duration}.`;
        parts.push(s.trim());
      } 
      // 2. Handle Damage Segments
      else if (Array.isArray(enh.damageSegments) && enh.damageSegments.length > 0) {
        let dmgParts = enh.damageSegments.map(seg => {
          const raw = seg.useBase !== undefined
            ? (seg.useBase ? baseDamage : 0) + (Number(seg.modifier) || 0)
            : Number(seg.amount) || 0;
          const rounded = Math.floor(raw);
          return seg.type ? `${rounded} ${seg.type}` : `${rounded}`;
        });
        parts.push(dmgParts.join(' + ') + ' damage.');
      } 
      // 3. Handle Fallback Description
      else if (enh.description) {
        parts.push(enh.description);
      }

      return `• (+${eCost}) ${eName}: ${parts.join(' ')}`;
    }).filter(Boolean);

    // Append enhancements to the action description
    if (enhStrings.length > 0) {
      // We use \\n here so that the yamlQuote function outputs literal "\n" characters
      // inside the double-quoted string. The YAML parser reads this as a true line break.
      desc += "\\n" + enhStrings.join("\\n");
    }
  }

  return `  - name: ${name}\n    desc: ${yamlQuote(desc)}`;
}

// ---------------------------------------------------------------------------
// Foundry VTT JSON export
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFoundryActionDescription(action, fallbackSaveDC, baseDamage) {
  const headerParts = [];
  if (action.actionType) headerParts.push(escapeHtml(action.actionType));
  if (action.targetDefense) headerParts.push(`vs ${action.targetDefense}`);
  if (action.target) headerParts.push(`Target: ${escapeHtml(action.target)}`);
  if (action.range) headerParts.push(`Range: ${escapeHtml(action.range)}`);
  if (action.cost != null) headerParts.push(`${action.cost} AP`);

  const descParts = [];
  if (headerParts.length) descParts.push(`<p><strong>${headerParts.join(' | ')}</strong></p>`);

  if (Array.isArray(action.damage) && action.damage.length) {
    const base = Number(baseDamage) || 0;
    let heavyHit = false;
    const dmgStrs = action.damage.map((d) => {
      const amt = d.useBase !== undefined
        ? (d.useBase ? base : 0) + (Number(d.modifier) || 0)
        : Number(d.amount) || 0;
      if (amt % 1 !== 0) heavyHit = true;
      return d.type ? `${Math.floor(amt)} ${escapeHtml(d.type)}` : String(Math.floor(amt));
    });
    descParts.push(`<p>${dmgStrs.join(' + ')} damage on hit${heavyHit ? ', +1 on heavy hits' : ''}.</p>`);
  }

  if (action.save?.attribute) {
    const dc = action.save.dc ?? fallbackSaveDC;
    let t = `<p>${escapeHtml(action.save.attribute)} Save DC ${dc}.`;
    if (action.save.failure) t += ` <strong>Failure:</strong> ${escapeHtml(action.save.failure)}.`;
    if (action.save.failureEach5) t += ` <strong>Failure (each 5):</strong> ${escapeHtml(action.save.failureEach5)}.`;
    if (action.save.success) t += ` <strong>Success:</strong> ${escapeHtml(action.save.success)}.`;
    t += '</p>';
    descParts.push(t);
  }

  if (action.check?.dc != null) {
    let t = `<p>DC ${action.check.dc} Check.`;
    if (action.check.failure) t += ` <strong>Failure:</strong> ${escapeHtml(action.check.failure)}.`;
    if (action.check.success) t += ` <strong>Success:</strong> ${escapeHtml(action.check.success)}.`;
    t += '</p>';
    descParts.push(t);
  }

  if (action.reactionTrigger) descParts.push(`<p><strong>Trigger:</strong> ${escapeHtml(action.reactionTrigger)}</p>`);
  if (action.description) descParts.push(`<p>${escapeHtml(action.description)}</p>`);

  return descParts.join('');
}

function buildFoundryActionItem(action, fallbackSaveDC, baseDmg, forceReaction) {
  const isAttack = action.targetDefense != null;
  const isMelee = (action.actionType || '').toLowerCase().includes('melee');
  const isSpell = (action.actionType || '').toLowerCase().includes('spell');
  const targetDefence = action.targetDefense === 'AD' ? 'area' : 'precision';

  // Primary damage formula for Foundry's dice roller
  let formulasObj = {};
  if (isAttack && Array.isArray(action.damage) && action.damage.length) {
    const base = Number(baseDmg) || 0;
    const d = action.damage[0];
    const amt = d.useBase !== undefined
      ? (d.useBase ? base : 0) + (Number(d.modifier) || 0)
      : Number(d.amount) || 0;
    formulasObj['fnd0'] = {
      formula: String(Math.floor(amt)),
      type: (d.type || 'physical').toLowerCase(),
      category: 'damage',
      fail: false, failFormula: '',
      each5: false, each5Formula: '',
      overrideDefence: '',
    };
  }

  return {
    name: action.name || 'Action',
    type: 'feature',
    img: 'icons/svg/sword.svg',
    system: {
      description: buildFoundryActionDescription(action, fallbackSaveDC, baseDmg),
      tableName: 'action',
      source: '',
      isReaction: !!(forceReaction || action.isReaction),
      actionType: isAttack ? 'attack' : (action.cost ? 'other' : ''),
      attackFormula: {
        rangeType: isMelee ? 'melee' : 'ranged',
        checkType: isSpell ? 'spellAttack' : 'attack',
        targetDefence,
        rollBonus: 0,
        combatMastery: true,
        critThreshold: 20,
        formulaMod: '',
        halfDmgOnMiss: false,
        skipBonusDamage: { heavy: false, brutal: false, crit: false, conditionals: false },
        ignoreCloseQuarters: false,
      },
      costs: {
        resources: {
          ap: action.cost ?? 1,
          actionPoint: null, stamina: null, mana: null, health: null,
          custom: {}, grit: null, restPoints: null,
        },
        charges: {
          current: null, max: null, maxChargesFormula: '', overriden: false,
          rechargeFormula: '', rechargeDice: '', requiredTotalMinimum: null,
          reset: '', showAsResource: false, subtract: 1, deleteOnZero: false,
        },
      },
      formulas: formulasObj,
      enhancements: {},
      featureType: 'monster',
    },
  };
}

function buildFoundryPassiveItem(f) {
  return {
    name: f.name || 'Feature',
    type: 'feature',
    img: 'icons/svg/book.svg',
    system: {
      description: `<p>${escapeHtml(getFeatureSummary(f) || '')}</p>`,
      tableName: '',
      source: '',
      isReaction: false,
      actionType: '',
      costs: {
        resources: {
          ap: null,
          actionPoint: null, stamina: null, mana: null, health: null,
          custom: {}, grit: null, restPoints: null,
        },
      },
      formulas: {},
      enhancements: {},
      featureType: 'monster',
    },
  };
}

const FOUNDRY_SKILLS = [
  { key: 'awa', label: 'Awareness',     baseAttribute: 'prime' },
  { key: 'acr', label: 'Acrobatics',    baseAttribute: 'agi'   },
  { key: 'ani', label: 'Animal',        baseAttribute: 'cha'   },
  { key: 'ath', label: 'Athletics',     baseAttribute: 'mig'   },
  { key: 'inf', label: 'Influence',     baseAttribute: 'cha'   },
  { key: 'inm', label: 'Intimidation',  baseAttribute: 'mig'   },
  { key: 'ins', label: 'Insight',       baseAttribute: 'cha'   },
  { key: 'inv', label: 'Investigation', baseAttribute: 'int'   },
  { key: 'med', label: 'Medicine',      baseAttribute: 'int'   },
  { key: 'ste', label: 'Stealth',       baseAttribute: 'agi'   },
  { key: 'sur', label: 'Survival',      baseAttribute: 'int'   },
  { key: 'tri', label: 'Trickery',      baseAttribute: 'agi'   },
];

function buildFoundrySkills(creatureSkills, attrMap) {
  const trainedSet = new Set(
    (creatureSkills || []).map((s) => s.trim().toLowerCase())
  );
  const result = {};
  for (const { key, label, baseAttribute } of FOUNDRY_SKILLS) {
    const mastery = trainedSet.has(label.toLowerCase()) ? 1 : 0;
    const attrVal = attrMap[baseAttribute] ?? attrMap.prime ?? 0;
    result[key] = {
      modifier: attrVal + mastery * 2,
      baseAttribute,
      bonus: 0,
      mastery,
      label,
    };
  }
  return result;
}

export function generateFoundryJSON() {
  const pd     = Math.round(Number(creature.PD) || 0);
  const ad     = Math.round(Number(creature.AD) || 0);
  const hp     = Math.round(Number(creature.HP) || 0);
  const ap     = Math.round(Number(creature.AP) || 0);
  const speed  = Math.round(Number(creature.speed) || 0);
  const saveDC = Math.round(Number(creature.saveDC) || 0);
  const check  = Math.round(Number(creature.check) || 0);
  const mig    = Math.round(Number(creature.attributes?.Mig) || 0);
  const agi    = Math.round(Number(creature.attributes?.Agi) || 0);
  const cha    = Math.round(Number(creature.attributes?.Cha) || 0);
  const int_   = Math.round(Number(creature.attributes?.Int) || 0);
  const rawBaseDmg = Number(creature.damage) || 0;
  const baseDmg = rawBaseDmg > 0 && rawBaseDmg < 1 ? rawBaseDmg * 2 : rawBaseDmg;

  // All attributes get combat mastery added to saves in DC20, so saveMastery is always true.
  const migSave = true;
  const agiSave = true;
  const chaSave = true;
  const intSave = true;

  // Journal / description
  const journalParts = [];
  if (creature.shortDescription) journalParts.push(`<p><em>${escapeHtml(creature.shortDescription)}</em></p>`);
  if (creature.longDescription) journalParts.push(`<p>${escapeHtml(creature.longDescription)}</p>`);

  // Collect passive features (same dedup logic as Obsidian export)
  const uniqueFeatures = new Map();
  if (Array.isArray(creature.featurePassives)) {
    creature.featurePassives.forEach((f) => {
      if (f?.id && !uniqueFeatures.has(f.id)) uniqueFeatures.set(f.id, f);
    });
  }
  featureState.selectedIds.forEach((id) => {
    const f = featureState.byId[id];
    if (f?.type === FEATURE_TYPES.MODIFIER && !uniqueFeatures.has(f.id)) {
      uniqueFeatures.set(f.id, f);
    }
  });

  // Build items array
  const items = [];
  const allActions   = Array.isArray(creature.featureActions)   ? creature.featureActions   : [];
  const allReactions = Array.isArray(creature.featureReactions) ? creature.featureReactions : [];
  allActions.forEach((a)   => items.push(buildFoundryActionItem(a, saveDC, baseDmg, false)));
  allReactions.forEach((a) => items.push(buildFoundryActionItem(a, saveDC, baseDmg, true)));
  uniqueFeatures.forEach((f) => items.push(buildFoundryPassiveItem(f)));

  const makeAttr = (current, saveMastery, label) => ({
    saveMastery,
    value: 0,
    current,
    save: 0,
    bonuses: { check: 0, value: 0, save: 0 },
    label,
    check: 0,
  });

  const makeMovement = (value, label, extraFields) => ({
    useCustom: true, current: value, value, bonus: 0, label, ...extraFields,
  });

  const doc = {
    name: creature.name || 'Unnamed',
    type: 'npc',
    img: 'icons/svg/mystery-man.svg',
    system: {
      defences: {
        precision: {
          normal: pd, formulaKey: 'flat', customFormula: '',
          value: pd, heavy: pd + 5, brutal: pd + 10,
          label: 'dc20rpg.defence.precision',
          bonuses: { noArmor: 0, noHeavy: 0, always: 0 },
        },
        area: {
          normal: ad, formulaKey: 'flat', customFormula: '',
          value: ad, heavy: ad + 5, brutal: ad + 10,
          label: 'dc20rpg.defence.area',
          bonuses: { noArmor: 0, noHeavy: 0, always: 0 },
        },
      },
      details: {
        level: creature.level ?? 1,
        combatMastery: 0,
        creatureType: (creature.type || '').toLowerCase(),
        aligment: '',
        role: toTitleCase(creature.role || ''),
      },
      size: {
        fromAncestry: false,
        size: (creature.size || 'medium').toLowerCase(),
        spaceOccupation: null,
      },
      resources: {
        health: {
          bonus: 0, value: hp, current: hp, max: hp, temp: 0, useFlat: true, reset: '',
        },
        ap: {
          bonus: 0, value: ap, max: ap, label: 'dc20rpg.resource.ap', reset: 'roundEnd',
        },
        custom: {},
      },
      jump: {
        current: agi, value: agi, bonus: 0, key: 'flat', label: 'dc20rpg.speed.jump', multiplier: 1,
      },
      movement: {
        ground:   makeMovement(speed, 'dc20rpg.speed.ground'),
        climbing: makeMovement(0, 'dc20rpg.speed.climbing', { fullSpeed: false, halfSpeed: false }),
        swimming: makeMovement(0, 'dc20rpg.speed.swimming', { fullSpeed: false, halfSpeed: false }),
        burrow:   makeMovement(0, 'dc20rpg.speed.burrow',   { fullSpeed: false, halfSpeed: false }),
        glide:    makeMovement(0, 'dc20rpg.speed.glide',    { fullSpeed: false, halfSpeed: false }),
        flying:   makeMovement(0, 'dc20rpg.speed.flying',   { fullSpeed: false, halfSpeed: false }),
      },
      saveDC: {
        value: { spell: saveDC, martial: saveDC },
        bonus: { spell: 0, martial: 0 },
        flat: false,
      },
      attackMod: {
        value: { spell: check, martial: check },
        bonus: { spell: 0, martial: 0 },
        flat: false,
      },
      attributes: {
        mig: makeAttr(mig, migSave, 'dc20rpg.attributes.mig'),
        agi: makeAttr(agi, agiSave, 'dc20rpg.attributes.agi'),
        cha: makeAttr(cha, chaSave, 'dc20rpg.attributes.cha'),
        int: makeAttr(int_, intSave, 'dc20rpg.attributes.int'),
      },
      skills: buildFoundrySkills(creature.skills, { mig, agi, cha, int: int_, prime: Math.round(Number(creature.attributes?.Prime) || 0) }),
      journal: journalParts.join('') || '',
    },
    items,
    effects: [],
    flags: {},
    ownership: { default: 0 },
  };

  return JSON.stringify(doc, null, 2);
}

// ---------------------------------------------------------------------------
// Notion Markdown export
// ---------------------------------------------------------------------------

function buildNotionActionDesc(action, fallbackSaveDC, baseDamage) {
  const mechanical = [];

  if (action.actionType)    mechanical.push(action.actionType);
  if (action.targetDefense) mechanical.push(`vs ${action.targetDefense}`);
  if (action.target)        mechanical.push(action.target);
  if (action.range)         mechanical.push(action.range);

  if (Array.isArray(action.damage) && action.damage.length) {
    const base = Number(baseDamage) || 0;
    let heavyHit = false;
    const dmg = action.damage.map((d) => {
      const amt = d.useBase !== undefined
        ? (d.useBase ? base : 0) + (Number(d.modifier) || 0)
        : Number(d.amount) || 0;
      if (amt % 1 !== 0) heavyHit = true;
      return d.type ? `${Math.floor(amt)} ${d.type}` : String(Math.floor(amt));
    }).join(' + ');
    mechanical.push(`${dmg} damage on hit${heavyHit ? ', +1 on heavy hits' : ''}`);
  }

  if (action.reactionTrigger) mechanical.push(`Trigger: ${action.reactionTrigger}`);

  const results = [];

  if (action.save?.attribute) {
    const dc = action.save.dc ?? fallbackSaveDC;
    mechanical.push(`target makes ${action.save.attribute} Save DC ${dc}`);
    if (action.save.failure)      results.push(`**Failure:** ${action.save.failure}`);
    if (action.save.failureEach5) results.push(`**Failure (Each 5):** ${action.save.failureEach5}`);
    if (action.save.success)      results.push(`**Success:** ${action.save.success}`);
    if (action.save.successEach5) results.push(`**Success (Each 5):** ${action.save.successEach5}`);
  }

  if (action.check?.dc != null) {
    mechanical.push(`Check DC ${action.check.dc}`);
    if (action.check.failure)      results.push(`**Failure:** ${action.check.failure}`);
    if (action.check.failureEach5) results.push(`**Failure (Each 5):** ${action.check.failureEach5}`);
    if (action.check.success)      results.push(`**Success:** ${action.check.success}`);
    if (action.check.successEach5) results.push(`**Success (Each 5):** ${action.check.successEach5}`);
  }

  if (action.description) results.push(action.description);

  const parts = [];
  if (mechanical.length) parts.push(mechanical.join(', '));
  if (results.length)    parts.push(results.join('. '));
  return parts.filter(Boolean).join('. ');
}

export function generateNotionMarkdown() {
  const pd      = Math.round(Number(creature.PD) || 0);
  const ad      = Math.round(Number(creature.AD) || 0);
  const hp      = Math.round(Number(creature.HP) || 0);
  const ap      = Math.round(Number(creature.AP) || 0);
  const speed   = Math.round(Number(creature.speed) || 0);
  const saveDC  = Math.round(Number(creature.saveDC) || 0);
  const attack  = toSigned(creature.check);
  const mig     = Math.round(Number(creature.attributes?.Mig) || 0);
  const agi     = Math.round(Number(creature.attributes?.Agi) || 0);
  const cha     = Math.round(Number(creature.attributes?.Cha) || 0);
  const int_    = Math.round(Number(creature.attributes?.Int) || 0);
  const migSave = Math.round(Number(creature.attributeSaves?.Mig) || 0);
  const agiSave = Math.round(Number(creature.attributeSaves?.Agi) || 0);
  const chaSave = Math.round(Number(creature.attributeSaves?.Cha) || 0);
  const intSave = Math.round(Number(creature.attributeSaves?.Int) || 0);
  const rawBaseDmg = Number(creature.damage) || 0;
  const baseDmg = rawBaseDmg > 0 && rawBaseDmg < 1 ? rawBaseDmg * 2 : rawBaseDmg;

  const name  = creature.name || 'Unnamed';
  const size  = toTitleCase(creature.size);
  const type  = toTitleCase(creature.type);
  const level = creature.level ?? 1;
  const role  = toTitleCase(creature.role);
  const power = toTitleCase(creature.power);
  const signed = n => `${n >= 0 ? '+' : ''}${n}`;

  const lines = [];

  // ── Description block ─────────────────────────────────────────────────────
  lines.push(`## ${name}`);
  lines.push('');
  if (creature.shortDescription) lines.push(`**Description:** ${creature.shortDescription}`);
  if (creature.longDescription)  lines.push(`**Lore:** ${creature.longDescription}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Stat block ────────────────────────────────────────────────────────────
  lines.push(`### ${name}`);
  lines.push('');
  const infoRight = `Level ${level}${power && power !== 'Normal' ? ` ${power}` : ''}${role ? ` ${role}` : ''}`;
  lines.push(`${size} ${type} | *${infoRight}*`.trim());
  lines.push('');
  lines.push(`**HP:** ${hp}   **PD:** ${pd}/${pd + 5}/${pd + 10}   **AD:** ${ad}/${ad + 5}/${ad + 10}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`**MIG** ${signed(mig)} (${signed(migSave)})   **AGI** ${signed(agi)} (${signed(agiSave)})   **CHA** ${signed(cha)} (${signed(chaSave)})   **INT** ${signed(int_)} (${signed(intSave)})`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Traits ────────────────────────────────────────────────────────────────
  const pushTrait = (label, group) => {
    const all = [...(group?.damage || []), ...(group?.condition || [])].filter(Boolean);
    if (all.length) lines.push(`**${label}:** ${all.join(', ')}`);
  };
  pushTrait('Resistances',     creature.resistances);
  pushTrait('Vulnerabilities', creature.vulnerabilities);
  pushTrait('Immunities',      creature.immunities);
  if (Array.isArray(creature.skills) && creature.skills.length) {
    lines.push(`**Skills:** ${creature.skills.map(toTitleCase).join(', ')}`);
  }
  if (Array.isArray(creature.senses) && creature.senses.length) {
    lines.push(`**Senses:** ${creature.senses.join(', ')}`);
  }
  lines.push('');

  // ── Features (passives + modifier summaries) ──────────────────────────────
  const uniqueFeatures = new Map();
  if (Array.isArray(creature.featurePassives)) {
    creature.featurePassives.forEach((f) => {
      if (f?.id && !uniqueFeatures.has(f.id)) uniqueFeatures.set(f.id, f);
    });
  }
  featureState.selectedIds.forEach((id) => {
    const f = featureState.byId[id];
    if (f?.type === FEATURE_TYPES.MODIFIER && !uniqueFeatures.has(f.id)) {
      uniqueFeatures.set(f.id, f);
    }
  });
  const features = Array.from(uniqueFeatures.values());
  if (features.length) {
    lines.push('### Features');
    lines.push('');
    features.forEach((f) => {
      lines.push(`**${f.name}:** ${getFeatureSummary(f) || ''}`);
    });
    lines.push('');
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const allActions   = Array.isArray(creature.featureActions)   ? creature.featureActions   : [];
  const allReactions = Array.isArray(creature.featureReactions) ? creature.featureReactions : [];
  const regular   = allActions.filter((a) => !a.isLegendaryAction && !a.isApexAction);
  const legendary = allActions.filter((a) => a.isLegendaryAction);
  const apex      = allActions.filter((a) => a.isApexAction);

  if (regular.length || legendary.length) {
    let heading = `### Actions (${ap} AP)`;
    if (legendary.length) heading += ` | RP Actions (${legendary.length})`;
    lines.push(heading);
    lines.push('');
    lines.push(`**Attack:** ${attack}   **Save DC:** ${saveDC}   **Speed:** ${speed}`);
    lines.push('');
    [...regular, ...legendary].forEach((a) => {
      const prefix = a.cost != null ? `(${a.cost}) ` : '';
      lines.push(`**${prefix}${a.name || 'Action'}:** ${buildNotionActionDesc(a, saveDC, baseDmg)}`);
    });
    lines.push('');
  }

  if (allReactions.length) {
    lines.push('### Reactions');
    lines.push('');
    allReactions.forEach((a) => {
      const prefix = a.cost != null ? `(${a.cost}) ` : '';
      lines.push(`**${prefix}${a.name || 'Action'}:** ${buildNotionActionDesc(a, saveDC, baseDmg)}`);
    });
    lines.push('');
  }

  if (apex.length) {
    lines.push('### Round Actions *(see glossary)*');
    lines.push('');
    apex.forEach((a) => {
      const prefix = a.cost != null ? `(${a.cost}) ` : '';
      lines.push(`**${prefix}${a.name || 'Action'}:** ${buildNotionActionDesc(a, saveDC, baseDmg)}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

export function generateObsidianYAML() {
  const pd     = Math.round(Number(creature.PD) || 0);
  const ad     = Math.round(Number(creature.AD) || 0);
  const hp     = Math.round(Number(creature.HP) || 0);
  const ap     = Math.round(Number(creature.AP) || 0);
  const speed  = Math.round(Number(creature.speed) || 0);
  const saveDC = Math.round(Number(creature.saveDC) || 0);
  const attack = toSigned(creature.check);
  const mig    = Math.round(Number(creature.attributes?.Mig) || 0);
  const agi    = Math.round(Number(creature.attributes?.Agi) || 0);
  const cha    = Math.round(Number(creature.attributes?.Cha) || 0);
  const int_   = Math.round(Number(creature.attributes?.Int) || 0);
  const rawBaseDmg = Number(creature.damage) || 0;
  const baseDmg = rawBaseDmg > 0 && rawBaseDmg < 1 ? rawBaseDmg * 2 : rawBaseDmg;

  const lines = [];
  lines.push('```statblock');
  lines.push('layout: DC20 Adversary');
  lines.push(`name: ${creature.name || 'Unnamed'}`);
  lines.push(`size: ${toTitleCase(creature.size)}`);
  lines.push(`type: ${toTitleCase(creature.type)}`);
  lines.push(`level: ${creature.level ?? 1}`);
  lines.push(`hp: ${hp}`);
  lines.push(`pd: ${pd}/${pd + 5}/${pd + 10}`);
  lines.push(`ad: ${ad}/${ad + 5}/${ad + 10}`);
  lines.push(`mig: ${mig}`);
  lines.push(`agi: ${agi}`);
  lines.push(`cha: ${cha}`);
  lines.push(`int: ${int_}`);
  lines.push(`attack: ${attack}`);
  lines.push(`save_dc: ${saveDC}`);
  lines.push(`speed: ${speed}`);
  lines.push(`actions: ${ap}`);

  // characteristics (resistances, vulnerabilities, immunities, skills, senses)
  const charEntries = [];

  const pushTraitGroup = (label, group) => {
    const all = [...(group?.damage || []), ...(group?.condition || [])].filter(Boolean);
    if (all.length) charEntries.push({ name: label, desc: all.join(', ') });
  };

  pushTraitGroup('Resistances', creature.resistances);
  pushTraitGroup('Vulnerabilities', creature.vulnerabilities);
  pushTraitGroup('Immunities', creature.immunities);

  if (Array.isArray(creature.skills) && creature.skills.length) {
    charEntries.push({ name: 'Skills', desc: creature.skills.map(toTitleCase).join(', ') });
  }
  if (Array.isArray(creature.senses) && creature.senses.length) {
    charEntries.push({ name: 'Senses', desc: creature.senses.join(', ') });
  }

  if (charEntries.length) {
    lines.push('characteristics:');
    charEntries.forEach(({ name, desc }) => {
      lines.push(`- name: ${name}`);
      lines.push(`  desc: ${yamlQuote(desc)}`);
    });
  }

  // features: passives + modifiers (mirrors renderFeatureSummary logic)
  const uniqueFeatures = new Map();
  if (Array.isArray(creature.featurePassives)) {
    creature.featurePassives.forEach((f) => {
      if (f?.id && !uniqueFeatures.has(f.id)) uniqueFeatures.set(f.id, f);
    });
  }
  featureState.selectedIds.forEach((id) => {
    const f = featureState.byId[id];
    if (f?.type === FEATURE_TYPES.MODIFIER && !uniqueFeatures.has(f.id)) {
      uniqueFeatures.set(f.id, f);
    }
  });

  const features = Array.from(uniqueFeatures.values());
  if (features.length) {
    lines.push('features:');
    features.forEach((f) => {
      lines.push(`- name: ${f.name}`);
      lines.push(`  desc: ${yamlQuote(getFeatureSummary(f) || '')}`);
    });
  }

  // split actions by category
  const allActions   = Array.isArray(creature.featureActions) ? creature.featureActions : [];
  const allReactions = Array.isArray(creature.featureReactions) ? creature.featureReactions : [];
  const regular     = allActions.filter((a) => !a.isLegendaryAction && !a.isApexAction);
  const legendary   = allActions.filter((a) => a.isLegendaryAction);
  const apex        = allActions.filter((a) => a.isApexAction);

  if (regular.length) {
    lines.push('attacks_spells:');
    regular.forEach((a) => lines.push(buildActionEntry(a, saveDC, baseDmg)));
  }

  if (allReactions.length) {
    lines.push('reactions:');
    allReactions.forEach((a) => lines.push(buildActionEntry(a, saveDC, baseDmg)));
  }

  if (legendary.length) {
    lines.push('legendary_actions:');
    legendary.forEach((a) => lines.push(buildActionEntry(a, saveDC, baseDmg)));
  }

  if (apex.length) {
    lines.push('apex_actions:');
    apex.forEach((a) => lines.push(buildActionEntry(a, saveDC, baseDmg)));
  }

  lines.push('```');
  return lines.join('\n');
}

import { creature, featureState } from './createCreatureState.js';
import { FEATURE_TYPES, getFeatureSummary } from '../../features.js';

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

function buildActionDesc(action, fallbackSaveDC) {
  const parts = [];

  if (action.actionType) parts.push(action.actionType);
  if (action.targetDefense) parts.push(`vs ${action.targetDefense}`);
  if (action.target) parts.push(action.target);
  if (action.range) parts.push(action.range);

  if (Array.isArray(action.damage) && action.damage.length) {
    const dmg = action.damage
      .map((d) => {
        const amt = Math.floor(Number(d.amount) || 0);
        return d.type ? `${amt} ${d.type}` : String(amt);
      })
      .join(' + ');
    parts.push(`${dmg} damage`);
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

function buildActionEntry(action, fallbackSaveDC) {
  const cost = action.cost != null ? ` (${action.cost})` : '';
  const name = `${action.name || 'Action'}${cost}`;
  const desc = buildActionDesc(action, fallbackSaveDC);
  return `  - name: ${name}\n    desc: ${yamlQuote(desc)}`;
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
    regular.forEach((a) => lines.push(buildActionEntry(a, saveDC)));
  }

  if (allReactions.length) {
    lines.push('reactions:');
    allReactions.forEach((a) => lines.push(buildActionEntry(a, saveDC)));
  }

  if (legendary.length) {
    lines.push('legendary_actions:');
    legendary.forEach((a) => lines.push(buildActionEntry(a, saveDC)));
  }

  if (apex.length) {
    lines.push('apex_actions:');
    apex.forEach((a) => lines.push(buildActionEntry(a, saveDC)));
  }

  lines.push('```');
  return lines.join('\n');
}

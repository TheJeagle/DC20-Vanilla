export const tag = Object.freeze({
  ROLE: Object.freeze({
    ARTILLERIST: 'role/artillerist',
    BRUTE: 'role/brute',
    CONTROLLER: 'role/controller',
    DEFENDER: 'role/defender',
    LEADER: 'role/leader',
    LURKER: 'role/lurker',
    SKIRMISHER: 'role/skirmisher',
    SUPPORT: 'role/support',
    CASTER: 'role/caster',
    NONE: 'role/none',
  }),
  CREATURE: Object.freeze({
    HUMANOID: 'creature/humanoid',
    BEAST: 'creature/beast',
    UNDEAD: 'creature/undead',
    CONSTRUCT: 'creature/construct',
    ELEMENTAL: 'creature/elemental',
    MONSTROSITY: 'creature/monstrosity',
  }),
  FEATURE_COST: Object.freeze({
    F0: 'feature-cost/0',
    F1: 'feature-cost/1',
    F2: 'feature-cost/2',
    F3: 'feature-cost/3',
    F4: 'feature-cost/4',
  }),
  AP_COST: Object.freeze({
    AP0: 'ap-cost/0',
    AP1: 'ap-cost/1',
    AP2: 'ap-cost/2',
    AP3: 'ap-cost/3',
    AP4: 'ap-cost/4',
  }),
  ATTACK: Object.freeze({
    MARTIAL: 'attack/martial',
    SPELLCASTER: 'attack/spellcaster',
    AOE: 'attack/aoe',
    SINGLE_TARGET: 'attack/single-target',
  }),
  TARGET: Object.freeze({
    PD: 'target/pd',
    AD: 'target/ad',
  }),
  STATUS: Object.freeze({
    BLEEDING: 'status/bleeding',
    BLINDED: 'status/blinded',
    BURNING: 'status/burning',
    CHARMED: 'status/charmed',
    DAZED: 'status/dazed',
    DEAFENED: 'status/deafened',
    DISORIENTED: 'status/disoriented',
    DOOMED: 'status/doomed',
    EXHAUSTION: 'status/exhaustion',
    EXPOSED: 'status/exposed',
    FRIGHTENED: 'status/frightened',
    HINDERED: 'status/hindered',
    IMMOBILIZED: 'status/immobilized',
    IMPAIRED: 'status/impaired',
    INCAPACITATED: 'status/incapacitated',
    INTIMIDATED: 'status/intimidated',
    INVISIBLE: 'status/invisible',
    PARALYZED: 'status/paralyzed',
    PETRIFIED: 'status/petrified',
    POISONED: 'status/poisoned',
    RESTRAINED: 'status/restrained',
    SLOWED: 'status/slowed',
    STUNNED: 'status/stunned',
    SURPRISED: 'status/surprised',
    TAUNTED: 'status/taunted',
    TERRIFIED: 'status/terrified',
    TETHERED: 'status/tethered',
    UNCONSCIOUS: 'status/unconscious',
    WEAKENED: 'status/weakened',
  }),
  TIER: Object.freeze({
    APEX: 'tier/apex',
    LEGENDARY: 'tier/legendary',
  }),
});

export const flatTags = Object.freeze(
  Object.values(tag).reduce((acc, group) => {
    Object.assign(acc, group);
    return acc;
  }, {})
);

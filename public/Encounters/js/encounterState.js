/**
 * encounterState.js
 * Mutable encounter state shared across all encounter modules.
 */

/** @type {EncounterDoc} */
export const encounter = {
  name: '',
  description: '',
  info: '',
  rewards: '',
  isPublic: true,
  tags: [],       // environment tag slugs e.g. ['dungeon', 'forest']
  party: [],      // [{ id, name, class, level, hp, pd, ad }]
  partyId: null,
  monsters: [],   // [{ slotId, creatureId, name, baseLevel, levelDelta, power, role, groupId }]
  groups: [],     // [{ id, name }]
};

/** Transient UI state (not persisted to Firestore). */
export const ui = {
  monsterSource: 'mine',          // 'mine' | 'community'
  monsterSearchTerm: '',
  monsterFilterLevelMin: 0,
  monsterFilterLevelMax: 10,
  monsterFilterRole: '',          // '' = any
  monsterFilterPower: '',         // '' = any
  myCreatures: [],                // raw docs from Firestore
  communityCreatures: [],
  currentUser: null,              // Firebase User object
};

/** Generate a short random id for slots / groups. */
export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * runState.js
 * Session-only state for the Run Encounter page. Nothing is persisted.
 */

export const state = {
  /** Raw VanillaEncounters doc data (loaded on page init). */
  encounter: null,

  /**
   * Decoded creature docs keyed by creatureId.
   * { [creatureId]: { name, stats, attributes, traits, featureActions, featureReactions, featurePassives, … } }
   */
  creatures: {},

  /**
   * Bench items — one per party member or monster group / lone monster.
   * {
   *   type: 'player' | 'monster',
   *   id: string,           // unique bench item id
   *   label: string,        // display name
   *   sublabel: string,     // secondary info (level, class, group size…)
   *   sourceData: object|array,  // party member object or monster slot(s)
   *   isGroup: boolean,     // true if grouped monsters
   *   groupId: string|null,
   *   inCombat: boolean,
   * }
   */
  bench: [],

  /**
   * Active combatants.
   * Players: { type:'player', benchId, label, sublabel, currentHp, sourceData }
   * Monsters: { type:'monster', benchId, label, sublabel, currentHp, currentPd, currentAd,
   *             currentMig, currentAgi, currentCha, currentInt, expanded, sourceData, creatureId }
   */
  combat: [],

  /** Editable encounter DC shown in the header. */
  encounterDc: 10,

  /** Whether the turn tracker is running. */
  combatActive: false,

  /** Index into state.combat of whose turn it is. */
  currentTurnIdx: 0,
};

/**
 * encounterDom.js
 * Cached references to all DOM elements used by the encounter builder.
 */
const dom = {
  // Party panel
  partyRows:        () => document.getElementById('partyRows'),
  addPlayerBtn:     () => document.getElementById('addPlayerBtn'),
  partySelect:      () => document.getElementById('partySelect'),
  loadPartyBtn:     () => document.getElementById('loadPartyBtn'),
  savePartyBtn:     () => document.getElementById('savePartyBtn'),

  // Monster library
  tabMine:          () => document.getElementById('tabMine'),
  tabCommunity:     () => document.getElementById('tabCommunity'),
  monsterSearch:    () => document.getElementById('monsterSearch'),
  monsterLevelMin:  () => document.getElementById('monsterLevelMin'),
  monsterLevelMax:  () => document.getElementById('monsterLevelMax'),
  monsterLibList:   () => document.getElementById('monsterLibraryList'),

  // Center column — slots
  partySlots:          () => document.getElementById('partySlots'),
  partySlotsEmpty:     () => document.getElementById('partySlotsEmpty'),
  monsterSlots:        () => document.getElementById('monsterSlots'),
  monsterSlotsEmpty:   () => document.getElementById('monsterSlotsEmpty'),

  // Right column — metadata
  encounterName:        () => document.getElementById('encounterName'),
  encounterDescription: () => document.getElementById('encounterDescription'),
  encounterInfo:        () => document.getElementById('encounterInfo'),
  encounterRewards:     () => document.getElementById('encounterRewards'),
  encounterPublic:      () => document.getElementById('encounterPublic'),

  // Budget
  budgetFill:       () => document.getElementById('budgetFill'),
  budgetDifficulty: () => document.getElementById('budgetDifficulty'),
  budgetNumbers:    () => document.getElementById('budgetNumbers'),

  // Save
  saveEncounterBtn: () => document.getElementById('saveEncounterBtn'),
  saveStatus:       () => document.getElementById('saveStatus'),

  // Save Party dialog
  savePartyDialog:  () => document.getElementById('savePartyDialog'),
  savePartyName:    () => document.getElementById('savePartyName'),
  savePartyConfirm: () => document.getElementById('savePartyConfirm'),
  savePartyCancel:  () => document.getElementById('savePartyCancel'),

  // Nav
  logoutButton:     () => document.getElementById('logoutButton'),
};

export default dom;

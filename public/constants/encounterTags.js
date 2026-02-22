/**
 * encounterTags.js
 * Predefined environment tags for encounters.
 * Each tag has a human-readable label and a slug value stored in Firestore.
 */

/** @type {{ label: string, value: string }[]} */
export const ENVIRONMENT_TAGS = [
  { label: 'Dungeon',        value: 'dungeon' },
  { label: 'Forest',         value: 'forest' },
  { label: 'Urban',          value: 'urban' },
  { label: 'Ocean / Coastal', value: 'ocean' },
  { label: 'Arctic',         value: 'arctic' },
  { label: 'Desert',         value: 'desert' },
  { label: 'Mountains',      value: 'mountains' },
  { label: 'Underdark',      value: 'underdark' },
  { label: 'Swamp',          value: 'swamp' },
  { label: 'Plains',         value: 'plains' },
  { label: 'Ruins',          value: 'ruins' },
  { label: 'Planar',         value: 'planar' },
];

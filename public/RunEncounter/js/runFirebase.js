/**
 * runFirebase.js
 * Load encounter and creature documents for the Run Encounter page.
 * Uses the Firebase SDK; data is plain JS (no encode/decode needed).
 */
import {
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { db } from '../../firebaseClient.js';

const ENCOUNTERS_COL = 'VanillaEncounters';
const CREATURES_COL  = 'VanillaCreatures';

/**
 * Load a VanillaEncounters document by ID.
 * @param {string} encounterId
 * @returns {Promise<object|null>}
 */
export async function loadEncounterForRun(encounterId) {
  const snap = await getDoc(doc(db, ENCOUNTERS_COL, encounterId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Batch-fetch VanillaCreatures documents for all unique creatureIds.
 * @param {string[]} creatureIds
 * @returns {Promise<{ [creatureId]: object }>}
 */
export async function fetchCreatures(creatureIds) {
  const unique = [...new Set(creatureIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const results = await Promise.all(
    unique.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, CREATURES_COL, id));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
      } catch (err) {
        console.warn(`Could not load creature ${id}:`, err);
        return null;
      }
    })
  );

  const map = {};
  for (const c of results) {
    if (c) map[c.id] = c;
  }
  return map;
}

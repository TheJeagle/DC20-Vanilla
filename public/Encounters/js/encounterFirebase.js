/**
 * encounterFirebase.js
 * Firestore persistence for encounters and parties.
 * Uses the Firebase SDK (same pattern as existing modules).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { db } from '../../firebaseClient.js';
import { slugify } from '../../utils/firestore.js';

const ENCOUNTERS_COL = 'VanillaEncounters';
const PARTIES_COL    = 'VanillaParties';
const CREATURES_COL  = 'VanillaCreatures';

// ── Document ID helpers ───────────────────────────────────────────────────────

function buildEncounterDocId(name, ownerId) {
  const baseSlug = slugify(name) || `encounter-${Date.now()}`;
  const safeOwner = String(ownerId).replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'owner';
  return `${safeOwner}-${baseSlug}`;
}

function buildPartyDocId(name, ownerId) {
  const baseSlug = slugify(name) || `party-${Date.now()}`;
  const safeOwner = String(ownerId).replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'owner';
  return `${safeOwner}-${baseSlug}`;
}

// ── Encounters ────────────────────────────────────────────────────────────────

/**
 * Save an encounter document to Firestore.
 * @param {string} uid
 * @param {{ displayName: string, email: string }} user
 * @param {object} encounterData - Full encounter state
 * @returns {Promise<string>} The saved document ID
 */
export async function saveEncounter(uid, user, encounterData) {
  const docId  = buildEncounterDocId(encounterData.name, uid);
  const docRef = doc(db, ENCOUNTERS_COL, docId);

  const payload = {
    ...encounterData,
    ownerId: uid,
    owner: {
      id:          uid,
      displayName: user.displayName || '',
      email:       user.email || '',
    },
    savedAt: new Date().toISOString(),
  };

  await setDoc(docRef, payload);
  return docId;
}

/**
 * Load an encounter document by ID.
 * @param {string} encounterId
 * @returns {Promise<object|null>}
 */
export async function loadEncounter(encounterId) {
  const docRef  = doc(db, ENCOUNTERS_COL, encounterId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

// ── Parties ───────────────────────────────────────────────────────────────────

/**
 * Save a party to VanillaParties.
 * @param {string} uid
 * @param {string} name
 * @param {Array}  members
 */
export async function saveParty(uid, name, members) {
  const docId  = buildPartyDocId(name, uid);
  const docRef = doc(db, PARTIES_COL, docId);

  await setDoc(docRef, {
    name,
    ownerId: uid,
    savedAt: new Date().toISOString(),
    members,
  });

  return docId;
}

/**
 * Load all parties owned by a user.
 * @param {string} uid
 * @returns {Promise<Array>}
 */
export async function loadUserParties(uid) {
  const q = query(
    collection(db, PARTIES_COL),
    where('ownerId', '==', uid),
    orderBy('savedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Creatures ─────────────────────────────────────────────────────────────────

/**
 * Load creatures owned by a user.
 * @param {string} uid
 * @returns {Promise<Array>}
 */
export async function loadMyCreatures(uid) {
  const q = query(
    collection(db, CREATURES_COL),
    where('ownerId', '==', uid),
    orderBy('savedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Load recent public creatures.
 * @returns {Promise<Array>}
 */
export async function loadPublicCreatures() {
  const q = query(
    collection(db, CREATURES_COL),
    where('isPublic', '==', true),
    orderBy('savedAt', 'desc'),
    limit(200)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Feature Bank
 * ------------
 * Firestore CRUD for the personal feature bank and community sharing system.
 *
 * Collections:
 *   VanillaUsermadeFeatures/{featureId}              — all publicly shared features
 *   VanillaUsermadeFeatures/{featureId}/likes/{uid}  — per-user like tracking
 *   VanillaUsers/{uid}/featureBank/{featureId}        — per-user personal bank
 */
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  orderBy,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { db } from '../../firebaseClient.js';

const COMMUNITY_COLLECTION = 'VanillaUsermadeFeatures';
const USERS_COLLECTION = 'VanillaUsers';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a clean, Firestore-safe snapshot of a feature object.
 * @param {object} feature - Raw feature object.
 * @returns {object} Plain object ready for Firestore setDoc.
 */
function buildFeatureSnapshot(feature) {
  return {
    id: feature.id,
    name: feature.name ?? '',
    type: feature.type ?? 'passive',
    effects: feature.effects ?? {},
    featureCost: feature.featureCost ?? 0,
    isReaction: Boolean(feature.isReaction),
    isLegendaryAction: Boolean(feature.isLegendaryAction),
    isApexAction: Boolean(feature.isApexAction),
    reactionTrigger: feature.reactionTrigger ?? '',
    isCustom: true,
  };
}

// ---------------------------------------------------------------------------
// Personal bank
// ---------------------------------------------------------------------------

/**
 * Save a feature to the user's personal bank (private).
 * @param {object} feature - Custom feature object (must have .id).
 * @param {import('firebase/auth').User} user - Firebase Auth user.
 * @returns {Promise<void>}
 */
export async function saveToBank(feature, user) {
  if (!user || !feature?.id) throw new Error('User and feature are required.');
  const bankRef = doc(db, USERS_COLLECTION, user.uid, 'featureBank', feature.id);
  const snapshot = buildFeatureSnapshot(feature);
  await setDoc(
    bankRef,
    {
      ...snapshot,
      savedAt: new Date().toISOString(),
      sourceFeatureId: feature.sourceFeatureId ?? null,
      isOwned: Boolean(feature.isOwned),
      isPublic: false,
      createdBy: user.uid,
      creatorName: user.displayName || user.email || '',
    },
    { merge: true }
  );
}

/**
 * Load all features from the user's personal bank.
 * @param {string} uid - Firebase Auth user id.
 * @returns {Promise<object[]>} Array of bank feature objects.
 */
export async function loadUserBank(uid) {
  if (!uid) return [];
  const bankCol = collection(db, USERS_COLLECTION, uid, 'featureBank');
  const snapshot = await getDocs(bankCol);
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
}

/**
 * Remove a feature from the user's personal bank.
 * @param {string} featureId - Feature id to remove.
 * @param {string} uid - Firebase Auth user id.
 * @returns {Promise<void>}
 */
export async function removeFromBank(featureId, uid) {
  if (!uid || !featureId) return;
  await deleteDoc(doc(db, USERS_COLLECTION, uid, 'featureBank', featureId));
}

// ---------------------------------------------------------------------------
// Community publishing
// ---------------------------------------------------------------------------

/**
 * Publish a feature to the community gallery and mark it as owned in the bank.
 * @param {object} feature - Custom feature object.
 * @param {import('firebase/auth').User} user - Firebase Auth user.
 * @returns {Promise<string>} The published feature id.
 */
export async function publishFeature(feature, user) {
  if (!user || !feature?.id) throw new Error('User and feature are required.');

  const communityRef = doc(db, COMMUNITY_COLLECTION, feature.id);
  const bankRef = doc(db, USERS_COLLECTION, user.uid, 'featureBank', feature.id);
  const snapshot = buildFeatureSnapshot(feature);

  await runTransaction(db, async (transaction) => {
    // Read first (Firestore requires all reads before writes in a transaction)
    const communitySnap = await transaction.get(communityRef);

    // Preserve totalLikes and original createdAt on re-publish
    const existingTotalLikes = communitySnap.exists() ? (communitySnap.data().totalLikes ?? 0) : 0;
    const createdAt = communitySnap.exists()
      ? communitySnap.data().createdAt
      : new Date().toISOString();

    transaction.set(communityRef, {
      ...snapshot,
      isPublic: true,
      createdBy: user.uid,
      creatorName: user.displayName || user.email || '',
      createdAt,
      totalLikes: existingTotalLikes,
    });

    transaction.set(bankRef, {
      ...snapshot,
      savedAt: new Date().toISOString(),
      sourceFeatureId: feature.id,
      isOwned: true,
      isPublic: true,
      createdBy: user.uid,
      creatorName: user.displayName || user.email || '',
    });
  });

  return feature.id;
}

// ---------------------------------------------------------------------------
// Community browsing
// ---------------------------------------------------------------------------

/**
 * Load the top 50 public community features ordered by totalLikes descending.
 *
 * NOTE: This query requires a composite Firestore index on:
 *   Collection: VanillaUsermadeFeatures
 *   Fields: isPublic (Ascending), totalLikes (Descending)
 * Create it in the Firebase Console or via firebase.indexes.json if the query fails.
 *
 * @returns {Promise<object[]>} Array of community feature objects.
 */
export async function loadCommunityFeatures() {
  const q = query(
    collection(db, COMMUNITY_COLLECTION),
    where('isPublic', '==', true),
    orderBy('totalLikes', 'desc'),
    limit(50)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
}

// ---------------------------------------------------------------------------
// Liking
// ---------------------------------------------------------------------------

/**
 * Toggle like on a community feature.
 * Runs as a Firestore transaction: increments/decrements totalLikes,
 * writes/deletes the likes subcollection, and copies the feature to the bank on like.
 *
 * @param {object} feature - Community feature object.
 * @param {import('firebase/auth').User} user - Firebase Auth user.
 * @returns {Promise<{liked: boolean, totalLikes: number}>}
 */
export async function toggleFeatureLike(feature, user) {
  if (!user || !feature?.id) throw new Error('User and feature required.');

  const featureRef = doc(db, COMMUNITY_COLLECTION, feature.id);
  const likeRef = doc(db, COMMUNITY_COLLECTION, feature.id, 'likes', user.uid);
  const bankRef = doc(db, USERS_COLLECTION, user.uid, 'featureBank', feature.id);

  return runTransaction(db, async (transaction) => {
    const featureSnap = await transaction.get(featureRef);
    const likeSnap = await transaction.get(likeRef);

    if (!featureSnap.exists()) throw new Error('Feature not found.');

    const isLiked = likeSnap.exists();
    const currentLikes = Number(featureSnap.data().totalLikes) || 0;

    if (isLiked) {
      transaction.delete(likeRef);
      transaction.update(featureRef, { totalLikes: Math.max(0, currentLikes - 1) });
      return { liked: false, totalLikes: Math.max(0, currentLikes - 1) };
    } else {
      const featureData = featureSnap.data();
      transaction.set(likeRef, { userId: user.uid, createdAt: new Date().toISOString() });
      transaction.update(featureRef, { totalLikes: currentLikes + 1 });

      const snapshot = buildFeatureSnapshot({ ...featureData, id: feature.id });
      transaction.set(bankRef, {
        ...snapshot,
        savedAt: new Date().toISOString(),
        sourceFeatureId: feature.id,
        isOwned: false,
        isPublic: false,
        createdBy: featureData.createdBy || '',
        creatorName: featureData.creatorName || '',
      });

      return { liked: true, totalLikes: currentLikes + 1 };
    }
  });
}

/**
 * Add a community feature to the user's bank without liking it.
 * @param {object} feature - Community feature object.
 * @param {import('firebase/auth').User} user - Firebase Auth user.
 * @returns {Promise<void>}
 */
export async function addToBank(feature, user) {
  if (!user || !feature?.id) throw new Error('User and feature required.');
  const bankRef = doc(db, USERS_COLLECTION, user.uid, 'featureBank', feature.id);
  const snapshot = buildFeatureSnapshot(feature);
  await setDoc(bankRef, {
    ...snapshot,
    savedAt: new Date().toISOString(),
    sourceFeatureId: feature.id,
    isOwned: false,
    isPublic: false,
    createdBy: feature.createdBy || '',
    creatorName: feature.creatorName || '',
  });
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/**
 * Return the set of feature ids from the given list that are in the user's bank.
 * @param {string[]} featureIds
 * @param {string} uid
 * @returns {Promise<Set<string>>}
 */
export async function getBankedFeatureIds(featureIds, uid) {
  if (!uid || !featureIds.length) return new Set();
  const snapshots = await Promise.all(
    featureIds.map((id) => getDoc(doc(db, USERS_COLLECTION, uid, 'featureBank', id)))
  );
  return new Set(featureIds.filter((id, i) => snapshots[i].exists()));
}

/**
 * Return the set of feature ids from the given list that the user has liked.
 * @param {string[]} featureIds
 * @param {string} uid
 * @returns {Promise<Set<string>>}
 */
export async function getLikedFeatureIds(featureIds, uid) {
  if (!uid || !featureIds.length) return new Set();
  const snapshots = await Promise.all(
    featureIds.map((id) => getDoc(doc(db, COMMUNITY_COLLECTION, id, 'likes', uid)))
  );
  return new Set(featureIds.filter((id, i) => snapshots[i].exists()));
}

// ---------------------------------------------------------------------------
// Community browser panel renderer
// ---------------------------------------------------------------------------

/**
 * Render the community browse panel contents into a container element.
 * @param {HTMLElement} container - The panel body element to render into.
 * @param {import('firebase/auth').User|null} currentUser - Current auth user.
 * @param {object} callbacks - { onAddToBank, onLike }
 */
export async function renderCommunityBrowser(container, currentUser, { onAddToBank, onLike } = {}) {
  container.innerHTML = '<div class="community-loading">Loading community features…</div>';

  let features;
  try {
    features = await loadCommunityFeatures();
  } catch (err) {
    container.innerHTML = '<div class="community-error">Failed to load community features. Please try again.</div>';
    console.error('Failed to load community features', err);
    return;
  }

  if (!features.length) {
    container.innerHTML = '<div class="community-empty">No community features published yet. Be the first!</div>';
    return;
  }

  let bankedIds = new Set();
  let likedIds = new Set();
  if (currentUser) {
    const featureIds = features.map((f) => f.id);
    [bankedIds, likedIds] = await Promise.all([
      getBankedFeatureIds(featureIds, currentUser.uid),
      getLikedFeatureIds(featureIds, currentUser.uid),
    ]);
  }

  container.innerHTML = '';

  features.forEach((feature) => {
    const card = document.createElement('div');
    card.className = 'community-feature-card';
    card.dataset.featureId = feature.id;

    const header = document.createElement('div');
    header.className = 'community-card-header';

    const name = document.createElement('span');
    name.className = 'community-card-name';
    name.textContent = feature.name || 'Unnamed Feature';

    const meta = document.createElement('span');
    meta.className = 'community-card-meta';
    meta.textContent = `by ${feature.creatorName || 'Unknown'}`;

    header.append(name, meta);
    card.appendChild(header);

    const type = document.createElement('div');
    type.className = 'community-card-type';
    type.textContent = (feature.type || 'passive').charAt(0).toUpperCase() + (feature.type || 'passive').slice(1);
    card.appendChild(type);

    const actions = document.createElement('div');
    actions.className = 'community-card-actions';

    const likeBtn = document.createElement('button');
    likeBtn.type = 'button';
    likeBtn.className = 'community-like-btn';
    const isLiked = likedIds.has(feature.id);
    likeBtn.classList.toggle('is-liked', isLiked);
    likeBtn.dataset.liked = isLiked ? 'true' : 'false';
    likeBtn.innerHTML = `${isLiked ? '♥' : '♡'} <span class="like-count">${feature.totalLikes ?? 0}</span>`;
    likeBtn.title = isLiked ? 'Unlike' : 'Like';

    if (!currentUser) {
      likeBtn.disabled = true;
      likeBtn.title = 'Sign in to like';
    }

    likeBtn.addEventListener('click', async () => {
      if (!currentUser || typeof onLike !== 'function') return;
      likeBtn.disabled = true;
      try {
        const result = await onLike(feature);
        const nowLiked = result.liked;
        likeBtn.classList.toggle('is-liked', nowLiked);
        likeBtn.dataset.liked = nowLiked ? 'true' : 'false';
        likeBtn.innerHTML = `${nowLiked ? '♥' : '♡'} <span class="like-count">${result.totalLikes}</span>`;
        likeBtn.title = nowLiked ? 'Unlike' : 'Like';
        if (nowLiked) {
          bankedIds.add(feature.id);
          bankBtn.textContent = 'In Bank';
          bankBtn.disabled = true;
        }
      } catch (err) {
        console.error('Failed to toggle like', err);
      } finally {
        likeBtn.disabled = !currentUser;
      }
    });

    const bankBtn = document.createElement('button');
    bankBtn.type = 'button';
    bankBtn.className = 'community-bank-btn';
    const isBanked = bankedIds.has(feature.id);
    bankBtn.textContent = isBanked ? 'In Bank' : 'Add to My Bank';
    bankBtn.disabled = isBanked || !currentUser;
    if (!currentUser) bankBtn.title = 'Sign in to add to bank';

    bankBtn.addEventListener('click', async () => {
      if (!currentUser || typeof onAddToBank !== 'function') return;
      bankBtn.disabled = true;
      try {
        await onAddToBank(feature);
        bankBtn.textContent = 'In Bank';
        bankedIds.add(feature.id);
      } catch (err) {
        console.error('Failed to add to bank', err);
        bankBtn.disabled = false;
      }
    });

    actions.append(likeBtn, bankBtn);
    card.appendChild(actions);

    container.appendChild(card);
  });
}

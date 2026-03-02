/**
 * navAuth.js
 * Shared helper to show/hide the Account nav dropdown based on auth state,
 * and to conditionally reveal the Admin nav link for admin users.
 * Call updateNavAuth(user, db) inside each page's onAuthStateChanged handler.
 */

import {
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const ADMIN_CACHE_KEY = 'dc20_admin';

/**
 * @param {import('https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js').User|null} user
 * @param {object|null} db - Firestore db instance (optional; omit to skip admin link check)
 * @param {Document} [root]
 */
export function updateNavAuth(user, db = null, root = document) {
  const accountDropdown = root.getElementById('navAccountDropdown');
  const signInLink = root.getElementById('navSignInLink');
  const adminLink = root.getElementById('navAdminLink');

  if (user) {
    if (accountDropdown) accountDropdown.hidden = false;
    if (signInLink) signInLink.hidden = true;
    if (adminLink && db) _updateAdminLink(user.uid, db, adminLink);
  } else {
    if (accountDropdown) accountDropdown.hidden = true;
    if (signInLink) signInLink.hidden = false;
    if (adminLink) adminLink.hidden = true;
    sessionStorage.removeItem(ADMIN_CACHE_KEY);
  }
}

async function _updateAdminLink(uid, db, adminLink) {
  const cached = sessionStorage.getItem(ADMIN_CACHE_KEY);
  if (cached !== null) {
    adminLink.hidden = cached !== 'true';
    return;
  }
  try {
    const snap = await getDoc(doc(db, 'VanillaAdmins', uid));
    const isAdmin = snap.exists();
    sessionStorage.setItem(ADMIN_CACHE_KEY, String(isAdmin));
    adminLink.hidden = !isAdmin;
  } catch {
    adminLink.hidden = true;
  }
}

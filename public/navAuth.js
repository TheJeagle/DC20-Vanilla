/**
 * navAuth.js
 * Shared helper to show/hide the Account nav dropdown based on auth state.
 * When logged out, hides the Account dropdown and reveals a Sign In link.
 * Call updateNavAuth(user) inside each page's onAuthStateChanged handler.
 */

/**
 * @param {import('https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js').User|null} user
 * @param {Document} [root]
 */
export function updateNavAuth(user, root = document) {
  const accountDropdown = root.getElementById('navAccountDropdown');
  const signInLink = root.getElementById('navSignInLink');

  if (user) {
    if (accountDropdown) accountDropdown.hidden = false;
    if (signInLink) signInLink.hidden = true;
  } else {
    if (accountDropdown) accountDropdown.hidden = true;
    if (signInLink) signInLink.hidden = false;
  }
}

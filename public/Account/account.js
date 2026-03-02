import {
  onAuthStateChanged,
  signOut,
  updateProfile,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  reauthenticateWithPopup,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { auth, db } from '../firebaseClient.js';
import { updateNavAuth } from '../navAuth.js';

const CREATURES_COL = 'VanillaCreatures';
const ENCOUNTERS_COL = 'VanillaEncounters';
const ADMINS_COL = 'VanillaAdmins';

const dom = {
  loading: document.getElementById('accountLoading'),
  notSignedIn: document.getElementById('accountNotSignedIn'),
  content: document.getElementById('accountContent'),

  adminBanner: document.getElementById('adminBanner'),

  profileEmail: document.getElementById('profileEmail'),
  profileDisplayName: document.getElementById('profileDisplayName'),
  displayNameForm: document.getElementById('displayNameForm'),
  displayNameInput: document.getElementById('displayNameInput'),
  nameMessage: document.getElementById('nameMessage'),

  statCreatures: document.getElementById('statCreatures'),
  statEncounters: document.getElementById('statEncounters'),
  statLikes: document.getElementById('statLikes'),
  statsError: document.getElementById('statsError'),

  deleteStep1: document.getElementById('deleteStep1'),
  deleteStep2: document.getElementById('deleteStep2'),
  deleteAccountBtn: document.getElementById('deleteAccountBtn'),
  deleteCancelBtn: document.getElementById('deleteCancelBtn'),
  deleteConfirmForm: document.getElementById('deleteConfirmForm'),
  deletePasswordInput: document.getElementById('deletePasswordInput'),
  deleteMessage: document.getElementById('deleteMessage'),

  logoutButton: document.getElementById('logoutButton'),
  footerYear: document.getElementById('footerYear'),
};

if (dom.footerYear) {
  dom.footerYear.textContent = new Date().getFullYear();
}

function show(el) {
  if (el) el.classList.remove('is-hidden');
}
function hide(el) {
  if (el) el.classList.add('is-hidden');
}

function setNameMessage(text, variant) {
  if (!dom.nameMessage) return;
  dom.nameMessage.textContent = text;
  dom.nameMessage.className = `form-message${variant ? ` form-message--${variant}` : ''}`;
}

function setDeleteMessage(text) {
  if (!dom.deleteMessage) return;
  dom.deleteMessage.textContent = text;
}

// ── Stats ─────────────────────────────────────────────────────────────────

async function loadStats(uid) {
  try {
    const [creaturesSnap, encountersSnap] = await Promise.all([
      getDocs(query(collection(db, CREATURES_COL), where('ownerId', '==', uid))),
      getDocs(query(collection(db, ENCOUNTERS_COL), where('ownerId', '==', uid))),
    ]);

    const creatureCount = creaturesSnap.size;
    const encounterCount = encountersSnap.size;

    let totalLikes = 0;
    creaturesSnap.forEach((d) => {
      const val = Number(d.data().totalLikes);
      if (Number.isFinite(val) && val > 0) totalLikes += Math.trunc(val);
    });

    if (dom.statCreatures) dom.statCreatures.textContent = creatureCount;
    if (dom.statEncounters) dom.statEncounters.textContent = encounterCount;
    if (dom.statLikes) dom.statLikes.textContent = totalLikes;
  } catch (err) {
    console.error('Failed to load stats', err);
    if (dom.statsError) {
      dom.statsError.textContent = 'Could not load stats.';
      show(dom.statsError);
    }
  }
}

// ── Admin check ───────────────────────────────────────────────────────────

async function checkAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, ADMINS_COL, uid));
    if (snap.exists()) {
      show(dom.adminBanner);
    }
  } catch (_) {
    // Not an admin or no permission — silently ignore
  }
}

// ── Display name change ───────────────────────────────────────────────────

function wireDisplayNameForm(user) {
  if (!dom.displayNameForm) return;

  dom.displayNameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = (dom.displayNameInput?.value ?? '').trim();
    if (!newName) {
      setNameMessage('Please enter a name.', 'error');
      return;
    }
    const submitBtn = dom.displayNameForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    setNameMessage('Saving…');
    try {
      await updateProfile(user, { displayName: newName });
      if (dom.profileDisplayName) dom.profileDisplayName.textContent = newName;
      if (dom.displayNameInput) dom.displayNameInput.value = '';
      setNameMessage('Display name updated.', 'success');
    } catch (err) {
      console.error(err);
      setNameMessage('Failed to update name. Please try again.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// ── Account deletion ──────────────────────────────────────────────────────

function wireDeleteFlow(user) {
  dom.deleteAccountBtn?.addEventListener('click', () => {
    hide(dom.deleteStep1);
    show(dom.deleteStep2);
    setDeleteMessage('');
  });

  dom.deleteCancelBtn?.addEventListener('click', () => {
    show(dom.deleteStep1);
    hide(dom.deleteStep2);
    if (dom.deletePasswordInput) dom.deletePasswordInput.value = '';
    setDeleteMessage('');
  });

  dom.deleteConfirmForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = dom.deleteConfirmForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    setDeleteMessage('');

    try {
      // Attempt direct deletion first (works if user signed in recently)
      const password = dom.deletePasswordInput?.value ?? '';
      const isGoogle = user.providerData.some((p) => p.providerId === 'google.com');

      if (password) {
        // Email/password reauth
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
      } else if (isGoogle) {
        // Google reauth via popup
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
      }
      // If no password and not Google, just try deleteUser (may fail with requires-recent-login)

      await deleteUser(user);
      // Deletion succeeded — redirect to auth page
      window.location.href = '../Auth/auth.html';
    } catch (err) {
      console.error('Delete account error', err);
      if (err.code === 'auth/requires-recent-login') {
        setDeleteMessage(
          'Your session has expired. Please sign out and sign back in, then try again.'
        );
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setDeleteMessage('Incorrect password. Please try again.');
      } else {
        setDeleteMessage('Failed to delete account. Please try again.');
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// ── Logout ────────────────────────────────────────────────────────────────

dom.logoutButton?.addEventListener('click', () => {
  signOut(auth).then(() => {
    window.location.href = '../Auth/auth.html';
  });
});

// ── Auth gate ─────────────────────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
  updateNavAuth(user);
  hide(dom.loading);

  if (!user) {
    show(dom.notSignedIn);
    return;
  }

  // Populate profile
  if (dom.profileEmail) dom.profileEmail.textContent = user.email ?? '—';
  if (dom.profileDisplayName) dom.profileDisplayName.textContent = user.displayName || '(none)';
  if (dom.displayNameInput) dom.displayNameInput.placeholder = user.displayName || 'Your display name';

  show(dom.content);

  wireDisplayNameForm(user);
  wireDeleteFlow(user);
  checkAdmin(user.uid);
  loadStats(user.uid);
});

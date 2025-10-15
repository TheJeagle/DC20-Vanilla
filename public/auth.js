import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCgdyE834tp64B2flcR9VUzbIvXwPdwQ-k',
  authDomain: 'dc20-creature-creator.firebaseapp.com',
  projectId: 'dc20-creature-creator',
  storageBucket: 'dc20-creature-creator.firebasestorage.app',
  messagingSenderId: '638039342508',
  appId: '1:638039342508:web:a80d7ddaecdab47b1b8e09',
  measurementId: 'G-2BEL1FHFPP',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const authMessage = document.querySelector('#authMessage');
const loginForm = document.querySelector('#loginForm');
const registerForm = document.querySelector('#registerForm');
const googleLoginButton = document.querySelector('#googleLogin');

const FIREBASE_ERROR_MESSAGES = {
  'auth/invalid-credential': 'Could not verify your email/password. Double-check and try again.',
  'auth/invalid-email': 'Enter a valid email address and try again.',
  'auth/email-already-in-use': 'That email is already registered. Try signing in instead.',
  'auth/weak-password': 'Passwords must be at least 6 characters.',
  'auth/popup-closed-by-user': 'Google sign-in was closed before completing.',
  'auth/cancelled-popup-request': 'Another sign-in attempt is already in progress.',
  'auth/popup-blocked': 'The sign-in popup was blocked by your browser. Allow popups and try again.',
};

function setAuthMessage(variant, text) {
  if (!authMessage) return;
  if (!text) {
    authMessage.style.display = 'none';
    authMessage.removeAttribute('data-variant');
    authMessage.textContent = '';
    return;
  }

  authMessage.style.display = 'block';
  authMessage.dataset.variant = variant;
  authMessage.textContent = text;
}

function resolveErrorMessage(error) {
  if (!error) return 'Something went wrong. Please try again.';
  if (typeof error === 'string') return error;

  const { code, message } = error;
  if (code && FIREBASE_ERROR_MESSAGES[code]) {
    return FIREBASE_ERROR_MESSAGES[code];
  }

  if (message && typeof message === 'string') {
    return message;
  }

  return 'Something went wrong. Please try again.';
}

async function handleLogin(event) {
  event.preventDefault();
  setAuthMessage();

  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!email || !password) {
    setAuthMessage('error', 'Email and password are required.');
    return;
  }

  try {
    if (submitButton) submitButton.disabled = true;
    await signInWithEmailAndPassword(auth, email, password);
    setAuthMessage('success', 'Signed in successfully. Redirecting…');
    window.setTimeout(() => {
      window.location.href = 'index.html';
    }, 800);
  } catch (error) {
    console.error('Login failed', error);
    setAuthMessage('error', resolveErrorMessage(error));
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function handleRegister(event) {
  event.preventDefault();
  setAuthMessage();

  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const displayName = form.displayName.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;

  if (!email || !password) {
    setAuthMessage('error', 'Email and password are required.');
    return;
  }

  if (password !== confirmPassword) {
    setAuthMessage('error', 'Passwords must match.');
    return;
  }

  try {
    if (submitButton) submitButton.disabled = true;
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    setAuthMessage('success', 'Account created! Redirecting…');
    window.setTimeout(() => {
      window.location.href = 'index.html';
    }, 800);
  } catch (error) {
    console.error('Registration failed', error);
    setAuthMessage('error', resolveErrorMessage(error));
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function handleGoogleLogin() {
  setAuthMessage();
  if (!googleLoginButton) return;

  try {
    googleLoginButton.disabled = true;
    await signInWithPopup(auth, provider);
    setAuthMessage('success', 'Signed in with Google. Redirecting…');
    window.setTimeout(() => {
      window.location.href = 'index.html';
    }, 800);
  } catch (error) {
    console.error('Google sign-in failed', error);
    setAuthMessage('error', resolveErrorMessage(error));
  } finally {
    googleLoginButton.disabled = false;
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', handleLogin);
}

if (registerForm) {
  registerForm.addEventListener('submit', handleRegister);
}

if (googleLoginButton) {
  googleLoginButton.addEventListener('click', handleGoogleLogin);
}

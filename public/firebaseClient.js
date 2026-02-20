import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCgdyE834tp64B2flcR9VUzbIvXwPdwQ-k',
  authDomain: 'dc20-creature-creator.firebaseapp.com',
  projectId: 'dc20-creature-creator',
  storageBucket: 'dc20-creature-creator.firebasestorage.app',
  messagingSenderId: '638039342508',
  appId: '1:638039342508:web:a80d7ddaecdab47b1b8e09',
  measurementId: 'G-2BEL1FHFPP',
};

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

export { firebaseApp, auth, db };

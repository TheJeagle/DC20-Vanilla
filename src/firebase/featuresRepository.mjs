import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore/lite';

import firebaseConfig from './config.mjs';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function fetchVanillaFeatures() {
  const snapshot = await getDocs(collection(db, 'VanillaFeatures'));
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export { db };

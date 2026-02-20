import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { db } from '../../firebaseClient.js';

async function fetchCreatureDocument(collectionName, documentId) {
  if (!collectionName || !documentId) return null;

  const docRef = doc(db, collectionName, documentId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() || {};
  return { id: docRef.id, ...data };
}

async function saveCreatureDocument(collectionName, documentId, payload) {
  if (!collectionName || !documentId) {
    throw new Error('Collection name and document id are required to save a creature.');
  }

  const docRef = doc(db, collectionName, documentId);
  await setDoc(
    docRef,
    {
      ...payload,
      documentId,
    },
    { merge: true }
  );

  return { id: documentId, ...payload, documentId };
}

export { fetchCreatureDocument, saveCreatureDocument };

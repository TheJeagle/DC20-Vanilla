#!/usr/bin/env node

import process from 'node:process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import fetch from 'node-fetch';

import firebaseConfig from '../src/firebase/config.mjs';

const DEFAULT_FEATURE_FILE = path.resolve('data/features.json');
const COLLECTION_NAME = 'VanillaFeatures';

if (!globalThis.fetch) {
  globalThis.fetch = fetch;
}

async function loadFeatures(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Feature file must contain an array.');
  }
  return parsed;
}

function initDb() {
  const app = initializeApp(firebaseConfig);
  return getFirestore(app);
}

async function uploadFeatures(db, features) {
  for (const feature of features) {
    if (!feature || !feature.id) {
      console.warn('Skipping feature without id:', feature);
      continue;
    }
    const ref = doc(db, COLLECTION_NAME, feature.id);
    await setDoc(ref, feature, { merge: true });
    console.log(`Uploaded ${feature.id}`);
  }
}

async function syncFeatures(db, features) {
  const localIds = new Set(features.map((f) => f.id).filter(Boolean));
  const snapshot = await getDocs(collection(db, COLLECTION_NAME));
  for (const docSnap of snapshot.docs) {
    if (!localIds.has(docSnap.id)) {
      await deleteDoc(doc(db, COLLECTION_NAME, docSnap.id));
      console.log(`Deleted ${docSnap.id}`);
    }
  }
}

async function main() {
  const fileFlagIndex = process.argv.findIndex((arg) => arg === '--file');
  const filePath = fileFlagIndex !== -1 ? process.argv[fileFlagIndex + 1] : DEFAULT_FEATURE_FILE;
  if (!filePath) {
    console.error('Missing path after --file flag.');
    process.exit(1);
  }
  const doSync = process.argv.includes('--sync');

  const features = await loadFeatures(filePath);
  console.log(`Loaded ${features.length} feature(s) from ${filePath}`);
  const db = initDb();
  if (doSync) await syncFeatures(db, features);
  await uploadFeatures(db, features);
  console.log('Done.');
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: node scripts/uploadFeatures.mjs [--file path/to/features.json]`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

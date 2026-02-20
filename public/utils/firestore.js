export const FIRESTORE_API_KEY = 'AIzaSyCgdyE834tp64B2flcR9VUzbIvXwPdwQ-k';
export const FIREBASE_CONFIG = {
  apiKey: FIRESTORE_API_KEY,
  authDomain: 'dc20-creature-creator.firebaseapp.com',
  projectId: 'dc20-creature-creator',
  storageBucket: 'dc20-creature-creator.firebasestorage.app',
  messagingSenderId: '638039342508',
  appId: '1:638039342508:web:a80d7ddaecdab47b1b8e09',
  measurementId: 'G-2BEL1FHFPP',
};

export const FIRESTORE_BASE_URL =
  'https://firestore.googleapis.com/v1/projects/dc20-creature-creator/databases/(default)/documents';

export function collectionUrl(collectionName) {
  return `${FIRESTORE_BASE_URL}/${collectionName}`;
}

export function documentUrl(collectionName, documentId) {
  return `${collectionUrl(collectionName)}/${encodeURIComponent(documentId)}`;
}

export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function buildCreatureDocumentId(name, ownerId) {
  const baseSlug = slugify(name) || `creature-${Date.now()}`;
  if (!ownerId) return baseSlug;
  const safeOwner = String(ownerId).replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'owner';
  return `${safeOwner}-${baseSlug}`;
}

export function encodeFirestoreValue(value) {
  if (value === undefined) return null;
  if (value === null) return { nullValue: null };

  if (Array.isArray(value)) {
    const values = value.map(encodeFirestoreValue).filter(Boolean);
    return { arrayValue: { values } };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'number':
      if (!Number.isFinite(value)) return null;
      return Number.isInteger(value)
        ? { integerValue: value.toString() }
        : { doubleValue: value };
    case 'boolean':
      return { booleanValue: value };
    case 'object': {
      const fields = {};
      Object.entries(value).forEach(([key, entry]) => {
        const encoded = encodeFirestoreValue(entry);
        if (encoded) fields[key] = encoded;
      });
      return { mapValue: { fields } };
    }
    default:
      return null;
  }
}

export function encodeFirestoreDocument(data) {
  const fields = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    const encoded = encodeFirestoreValue(value);
    if (encoded) fields[key] = encoded;
  });
  return { fields };
}

export function decodeFirestoreValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;

  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;

  if ('arrayValue' in value) {
    const items = value.arrayValue?.values ?? [];
    return items.map((item) => decodeFirestoreValue(item));
  }

  if ('mapValue' in value) {
    return decodeFirestoreFields(value.mapValue?.fields ?? {});
  }

  return value;
}

export function decodeFirestoreFields(fields) {
  const result = {};
  Object.entries(fields || {}).forEach(([key, value]) => {
    result[key] = decodeFirestoreValue(value);
  });
  return result;
}

export function decodeFirestoreDocument(doc) {
  if (!doc) return null;
  const fields = doc.fields ?? doc.document?.fields;
  if (!fields) return null;
  return decodeFirestoreFields(fields);
}

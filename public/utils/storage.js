const storageNames = ['sessionStorage', 'localStorage'];

function getAvailableStorages() {
  if (typeof window === 'undefined') {
    return [];
  }

  return storageNames
    .map((name) => {
      try {
        return window[name];
      } catch (error) {
        console.warn(`${name} is unavailable.`, error);
        return null;
      }
    })
    .filter(Boolean);
}

const storages = getAvailableStorages();

export function loadJson(key) {
  for (const store of storages) {
    try {
      const raw = store.getItem(key);
      if (!raw) continue;
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`Failed to read ${key} from storage.`, error);
    }
  }
  return null;
}

export function saveJson(key, value) {
  if (value === undefined) return false;

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    console.error(`Failed to serialise ${key} before saving.`, error);
    return false;
  }

  let saved = false;
  storages.forEach((store) => {
    try {
      if (!saved) {
        store.setItem(key, serialized);
        saved = true;
      } else {
        store.removeItem(key);
      }
    } catch (error) {
      console.warn(`Failed to write ${key} to storage.`, error);
    }
  });

  if (!saved) {
    console.error('Unable to persist data; no storage is available.');
  }

  return saved;
}

export function removeItem(key) {
  storages.forEach((store) => {
    try {
      store.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove ${key} from storage.`, error);
    }
  });
}

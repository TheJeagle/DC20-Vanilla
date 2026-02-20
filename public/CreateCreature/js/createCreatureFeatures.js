import dom from './createCreatureDom.js';
import { creature, featureState } from './createCreatureState.js';
import { FEATURE_TYPES, getFeatureSummary } from '../../features.js';

/** Callback invoked when feature selection changes. */
let onSelectionChange = () => {};

/**
 * Register a callback fired after any feature selection change.
 * @param {(nextIds: string[]) => void} callback - Invoked post-selection toggle; noop if invalid.
 */
function setFeatureSelectionChangeHandler(callback) {
  onSelectionChange = typeof callback === 'function' ? callback : () => {};
}

/**
 * Normalise user-provided ids before lookup.
 * @param {unknown} value - Raw feature id value.
 * @returns {string} Trimmed id or empty string when invalid.
 */
function normalizeFeatureId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const ROLE_TAG_PREFIX = 'role/';
const CREATURE_TAG_PREFIX = 'creature/';
const SIZE_TAG_PREFIX = 'size/';
const ANY_TAG_VALUE = 'any';
const NONE_TAG_VALUE = 'none';

const normaliseValue = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

function extractTagValues(tags, prefix) {
  const lowerPrefix = prefix.toLowerCase();
  return tags
    .filter((tag) => typeof tag === 'string' && tag.toLowerCase().startsWith(lowerPrefix))
    .map((tag) => normaliseValue(tag.slice(prefix.length)));
}

function matchesTagRequirement(tagValues, selectedValue, { allowNone = false } = {}) {
  if (!tagValues.length) return true;
  const normalisedSelected = normaliseValue(selectedValue);
  if (tagValues.includes(ANY_TAG_VALUE)) return true;
  if (allowNone && (!normalisedSelected || normalisedSelected === NONE_TAG_VALUE)) {
    return tagValues.includes(NONE_TAG_VALUE) || tagValues.includes('');
  }
  if (!normalisedSelected) return false;
  return tagValues.includes(normalisedSelected);
}

function featureMatchesCurrentCreature(feature) {
  if (!feature) return false;
  const tags = Array.isArray(feature.tags) ? feature.tags : [];
  const roleTags = extractTagValues(tags, ROLE_TAG_PREFIX);
  const typeTags = extractTagValues(tags, CREATURE_TAG_PREFIX);
  const sizeTags = extractTagValues(tags, SIZE_TAG_PREFIX);

  if (roleTags.length) {
    if (!matchesTagRequirement(roleTags, creature.role, { allowNone: true })) {
      return false;
    }
  }

  if (typeTags.length) {
    if (!matchesTagRequirement(typeTags, creature.type)) {
      return false;
    }
  }

  if (sizeTags.length) {
    if (!matchesTagRequirement(sizeTags, creature.size)) {
      return false;
    }
  }

  return true;
}

function computeVisibleFeatureIds(includeSelected = true) {
  return featureState.allIds.filter((id) => {
    const feature = featureState.byId[id];
    if (!feature) return false;
    if (includeSelected && featureState.selectedIds.includes(id)) return true;
    return featureMatchesCurrentCreature(feature);
  });
}

let lastFilterKey = '';

function buildFilterKey() {
  return [creature.role, creature.type, creature.size].map(normaliseValue).join('|');
}

function refreshFeatureFiltersForCurrentCreature(force = false) {
  const nextKey = buildFilterKey();
  if (!force && nextKey === lastFilterKey) return;
  lastFilterKey = nextKey;

  if (featureState.searchTerm) {
    applyFeatureSearch(featureState.searchTerm);
  } else {
    featureState.filteredIds = computeVisibleFeatureIds(true);
    renderFeatureControls();
  }
}

/**
 * Extract required feature ids from a feature definition.
 * @param {Record<string, any>|null} feature - Feature object containing optional `required` array.
 * @returns {string[]} Normalised list of required feature ids.
 */
function getRequiredFeatureIds(feature) {
  if (!feature) return [];
  if (!Array.isArray(feature.required)) return [];
  return feature.required
    .map((entry) => normalizeFeatureId(entry))
    .filter(Boolean);
}

/**
 * Build a dependency-collection context to avoid cycles/duplicates.
 * @param {string} rootId - The root feature id whose dependencies we gather.
 * @returns {{rootId:string, stack:Set<string>, set:Set<string>, list:string[]}}
 */
function createDependencyCollectionContext(rootId) {
  return {
    rootId,
    stack: new Set([rootId]),
    set: new Set(),
    list: [],
  };
}

/**
 * Recursively collect required feature ids for the given feature.
 * @param {string} featureId - Feature to inspect.
 * @param {{rootId:string, stack:Set<string>, set:Set<string>, list:string[]}} context - Dependency traversal state.
 * @returns {string[]} Ordered list of dependencies.
 */
function collectRequiredFeatureIds(featureId, context) {
  const feature = featureState.byId[featureId];
  if (!feature) return context.list;

  const requiredIds = getRequiredFeatureIds(feature);
  requiredIds.forEach((reqId) => {
    if (!reqId || reqId === context.rootId) return;
    if (!featureState.byId[reqId]) return;
    if (!context.set.has(reqId)) {
      context.set.add(reqId);
      if (!context.stack.has(reqId)) {
        context.stack.add(reqId);
        collectRequiredFeatureIds(reqId, context);
        context.stack.delete(reqId);
      }
      context.list.push(reqId);
    }
  });

  return context.list;
}

/**
 * Ensure a feature and all its dependencies are selected.
 * @param {string} id - Feature id to select.
 * @param {{includeRoot?: boolean}} [options={}] - Control whether the root is added.
 */
function selectFeatureWithDependencies(id, { includeRoot = true } = {}) {
  const normalizedId = normalizeFeatureId(id);
  if (!normalizedId) return;

  const dependencies = collectRequiredFeatureIds(
    normalizedId,
    createDependencyCollectionContext(normalizedId)
  );

  dependencies.forEach((depId) => {
    if (!featureState.selectedIds.includes(depId)) {
      featureState.selectedIds.push(depId);
    }
  });

  if (includeRoot && !featureState.selectedIds.includes(normalizedId)) {
    featureState.selectedIds.push(normalizedId);
  }
}

/**
 * Augment the selectedIds array with any missing dependencies.
 * @returns {boolean} True when the selection set changed.
 */
function ensureSelectedFeatureDependencies() {
  const queue = featureState.selectedIds
    .map((id) => normalizeFeatureId(id))
    .filter(Boolean);
  const processed = new Set();
  let changed = false;

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || processed.has(currentId)) continue;
    processed.add(currentId);

    const dependencies = collectRequiredFeatureIds(
      currentId,
      createDependencyCollectionContext(currentId)
    );
    if (!dependencies.length) continue;

    let insertIndex = featureState.selectedIds.indexOf(currentId);
    if (insertIndex === -1) {
      insertIndex = featureState.selectedIds.length;
    }

    dependencies.forEach((depId) => {
      if (!featureState.selectedIds.includes(depId)) {
        featureState.selectedIds.splice(insertIndex, 0, depId);
        queue.push(depId);
        insertIndex += 1;
        changed = true;
      }
    });
  }

  return changed;
}

/**
 * Toggle a feature within the current selection set.
 * @param {string} id - Feature id to toggle.
 * @param {boolean} isSelected - Desired selection state (true to select).
 */
function toggleFeatureSelection(id, isSelected) {
  const normalizedId = normalizeFeatureId(id);
  if (!normalizedId) return;

  if (isSelected) {
    selectFeatureWithDependencies(normalizedId);
  } else {
    const removedDeps = collectRequiredFeatureIds(
      normalizedId,
      createDependencyCollectionContext(normalizedId)
    );
    const remaining = featureState.selectedIds.filter((id) => id !== normalizedId);
    const stillRequired = new Set();
    remaining.forEach((otherId) => {
      collectRequiredFeatureIds(otherId, createDependencyCollectionContext(otherId)).forEach((dep) =>
        stillRequired.add(dep)
      );
    });
    const toRemove = new Set([
      normalizedId,
      ...removedDeps.filter((dep) => !stillRequired.has(dep)),
    ]);
    featureState.selectedIds = featureState.selectedIds.filter((id) => !toRemove.has(id));
  }

  onSelectionChange(featureState.selectedIds);
}

/**
 * Render the grouped feature cards (actions, modifiers, passives, etc.).
 * Reads featureState.filteredIds/byId to build the UI grid.
 */
function renderFeatureControls() {
  const { featureControls } = dom;
  if (!featureControls) return;
  featureControls.innerHTML = '';

  const baseIds = featureState.filteredIds && featureState.filteredIds.length
    ? featureState.filteredIds
    : Object.keys(featureState.byId);

  const visibleIds = baseIds.filter((id) => {
    if (featureState.selectedIds.includes(id)) return true;
    const feature = featureState.byId[id];
    return featureMatchesCurrentCreature(feature);
  });

  if (visibleIds.length === 0) {
    featureControls.textContent = 'No features available for the current filters.';
    return;
  }

  /**
   * Build an interactive feature card button.
   * @param {Record<string, any>} feature - Feature definition from featureState.
   * @returns {HTMLButtonElement} Rendered button element ready for insertion.
   */
  const createFeatureCard = (feature) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'feature-card';
    card.dataset.featureId = feature.id;
    const isSelected = featureState.selectedIds.includes(feature.id);

    if (isSelected) {
      card.classList.add('selected');
    }

    const name = document.createElement('div');
    name.className = 'feature-card-name';
    name.textContent = feature.name;

    const desc = document.createElement('div');
    desc.className = 'feature-card-description';
    const cardSummary = getFeatureSummary(feature);
    desc.textContent = cardSummary || 'No description available.';

    card.append(name, desc);

    const depIds = getRequiredFeatureIds(feature);
    if (depIds.length) {
      const depNames = depIds
        .map((depId) => featureState.byId[depId]?.name ?? depId)
        .join(', ');
      const depLine = document.createElement('div');
      depLine.className = 'feature-card-meta';
      depLine.textContent = `Requires: ${depNames}`;
      card.appendChild(depLine);
    }

    const requiredBy = featureState.selectedIds
      .filter((otherId) => otherId !== feature.id)
      .filter((otherId) => getRequiredFeatureIds(featureState.byId[otherId]).includes(feature.id));
    if (requiredBy.length) {
      const parentNames = requiredBy
        .map((otherId) => featureState.byId[otherId]?.name ?? otherId)
        .join(', ');
      const reqByLine = document.createElement('div');
      reqByLine.className = 'feature-card-meta';
      reqByLine.textContent = `Required by: ${parentNames}`;
      card.appendChild(reqByLine);
    }

    card.addEventListener('click', () => {
      const selected = featureState.selectedIds.includes(feature.id);
      toggleFeatureSelection(feature.id, !selected);
      renderFeatureControls();
    });

    return card;
  };

  const actionBuckets = {
    martialAttacks: [],
    martialChecks: [],
    spellAttacks: [],
    spellChecks: [],
    utilityActions: [],
  };

  /**
   * Classify an action feature into display buckets.
   * @param {Record<string, any>} feature - Feature that may describe an action.
   * @returns {'martialAttacks'|'martialChecks'|'spellAttacks'|'spellChecks'|'utilityActions'} Bucket key.
   */
  const classifyActionFeature = (feature) => {
    const actionTypeLabel = String(feature?.effects?.actionType || feature?.actionType || '').toLowerCase();

    if (actionTypeLabel.includes('martial') && actionTypeLabel.includes('attack')) return 'martialAttacks';
    if (actionTypeLabel.includes('martial') && actionTypeLabel.includes('check')) return 'martialChecks';
    if (actionTypeLabel.includes('spell') && actionTypeLabel.includes('attack')) return 'spellAttacks';
    if (actionTypeLabel.includes('spell') && actionTypeLabel.includes('check')) return 'spellChecks';
    if (actionTypeLabel.includes('utility')) return 'utilityActions';
    return 'utilityActions';
  };

  const otherGroups = new Map();

  visibleIds.forEach((id) => {
    const feature = featureState.byId[id];
    if (!feature) return;
    const type = (feature.type || 'misc').toLowerCase();
    if (type.startsWith('action')) {
      const bucketKey = classifyActionFeature(feature);
      actionBuckets[bucketKey].push(feature);
      return;
    }

    if (!otherGroups.has(type)) otherGroups.set(type, []);
    otherGroups.get(type).push(feature);
  });

  const hasActionFeatures = Object.values(actionBuckets).some((entries) => entries.length);
  if (hasActionFeatures) {
    const actionsWrapper = document.createElement('section');
    actionsWrapper.className = 'feature-group';

    const actionsHeading = document.createElement('h1');
    actionsHeading.className = 'feature-group-title';
    actionsHeading.textContent = 'Actions';
    actionsWrapper.appendChild(actionsHeading);

    const sections = [
      {
        title: 'Martial',
        buckets: [
          { key: 'martialAttacks', title: 'Martial Attacks' },
          { key: 'martialChecks', title: 'Martial Checks' },
        ],
      },
      {
        title: 'Spell',
        buckets: [
          { key: 'spellAttacks', title: 'Spell Attacks' },
          { key: 'spellChecks', title: 'Spell Checks' },
        ],
      },
      {
        title: 'Utility Actions',
        buckets: [{ key: 'utilityActions', title: 'Utility Actions' }],
      },
    ];

    sections.forEach((section) => {
      const activeBuckets = section.buckets.filter(({ key }) => actionBuckets[key]?.length);
      if (activeBuckets.length === 0) return;

      const sectionHeading = document.createElement('h2');
      sectionHeading.className = 'feature-group-subtitle';
      sectionHeading.textContent = section.title;
      actionsWrapper.appendChild(sectionHeading);

      const showBucketHeading = activeBuckets.length > 1;
      activeBuckets.forEach(({ key, title }) => {
        const subgroup = document.createElement('div');
        subgroup.className = 'feature-subgroup';

        if (showBucketHeading) {
          const subgroupHeading = document.createElement('h3');
          subgroupHeading.className = 'feature-subgroup-title';
          subgroupHeading.textContent = title;
          subgroup.appendChild(subgroupHeading);
        }

        const grid = document.createElement('div');
        grid.className = 'feature-group-grid';
        actionBuckets[key].forEach((feature) => {
          grid.appendChild(createFeatureCard(feature));
        });

        subgroup.appendChild(grid);
        actionsWrapper.appendChild(subgroup);
      });
    });

    featureControls.appendChild(actionsWrapper);
  }

  const typeOrder = ['modifier', 'passive'];
  const typeLabels = {
    modifier: 'Modifiers',
    passive: 'Passives',
  };

  const orderedTypes = [
    ...typeOrder,
    ...Array.from(otherGroups.keys()).filter((type) => !typeOrder.includes(type)),
  ];

  orderedTypes.forEach((type) => {
    const featureList = otherGroups.get(type);
    if (!featureList || !featureList.length) return;

    const groupWrapper = document.createElement('div');
    groupWrapper.className = 'feature-group';

    const heading = document.createElement('h3');
    heading.className = 'feature-group-title';
    heading.textContent = typeLabels[type] || type.charAt(0).toUpperCase() + type.slice(1);
    groupWrapper.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'feature-group-grid';

    featureList.forEach((feature) => {
      grid.appendChild(createFeatureCard(feature));
    });

    groupWrapper.appendChild(grid);
    featureControls.appendChild(groupWrapper);
  });
}

/**
 * Filter feature cards based on the free-text search box.
 * Scoring matches lets us order results by relevance:
 *  - Name hits (weight 6) bubble up obvious matches.
 *  - Tag hits (weight 5) allow cross-role lookups like `role/controller`.
 *  - Type hits (weight 3) and description/action text hits (weight 2) cover supporting metadata.
 *  - A final JSON string search (weight 1) is a catch-all for edge cases.
 * Terms are AND'ed together: every keyword must appear in at least one of the inspected fields.
 *
 * NOTE: While typing we ignore the normal role/type gate entirely—any feature can surface so long
 * as the text matches. Clearing the search restores the usual filtered view enforced by
 * `computeVisibleFeatureIds`.
 *
 * @param {string} rawTerm - User-entered search text.
 */
function applyFeatureSearch(rawTerm) {
  const term = rawTerm.trim().toLowerCase();
  featureState.searchTerm = term;

  if (!term) {
    featureState.filteredIds = computeVisibleFeatureIds(true);
    renderFeatureControls();
    return;
  }

  const terms = term.split(/\s+/).filter(Boolean);
  const results = [];

  featureState.allIds.forEach((id) => {
    const feature = featureState.byId[id];
    if (!feature) return;
    const name = (feature.name || '').toLowerCase();
    const description = getFeatureSummary(feature).toLowerCase();
    const tags = Array.isArray(feature.tags) ? feature.tags.map((tag) => tag.toLowerCase()) : [];
    const type = (feature.type || '').toLowerCase();
    const actionNarrative = feature.effects?.actionDescription
      ? String(feature.effects.actionDescription).toLowerCase()
      : '';
    const effectsText = feature.effects ? JSON.stringify(feature.effects).toLowerCase() : '';

    let totalScore = 0;

    for (const keyword of terms) {
      let termScore = 0;
      if (name.includes(keyword)) termScore = Math.max(termScore, 6);
      if (tags.some((tag) => tag.includes(keyword))) termScore = Math.max(termScore, 5);
      if (type.includes(keyword)) termScore = Math.max(termScore, 3);
      if (description.includes(keyword)) termScore = Math.max(termScore, 2);
      if (actionNarrative.includes(keyword)) termScore = Math.max(termScore, 2);
      if (effectsText.includes(keyword)) termScore = Math.max(termScore, 1);

      if (termScore === 0) {
        return;
      }

      totalScore += termScore;
    }

    results.push({ id, score: totalScore });
  });

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const nameA = (featureState.byId[a.id]?.name || '').toLowerCase();
    const nameB = (featureState.byId[b.id]?.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  featureState.filteredIds = results.map((entry) => entry.id);
  renderFeatureControls();
}

export {
  applyFeatureSearch,
  ensureSelectedFeatureDependencies,
  renderFeatureControls,
  setFeatureSelectionChangeHandler,
  refreshFeatureFiltersForCurrentCreature,
  toggleFeatureSelection,
};

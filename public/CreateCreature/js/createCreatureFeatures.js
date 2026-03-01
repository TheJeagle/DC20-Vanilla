import dom from './createCreatureDom.js';
import { creature, featureState } from './createCreatureState.js';
import { FEATURE_TYPES, getFeatureSummary } from '../../features.js';

/** Callback invoked when feature selection changes. */
let onSelectionChange = () => {};

/** Callback invoked when a bank/community feature is clicked to add to creature. */
let onAddBankFeature = () => {};

export function setAddBankFeatureHandler(cb) {
  onAddBankFeature = typeof cb === 'function' ? cb : () => {};
}

/** Callback invoked when an already-added bank/community card is clicked to remove it. */
let onRemoveBankFeature = () => {};

export function setRemoveBankFeatureHandler(cb) {
  onRemoveBankFeature = typeof cb === 'function' ? cb : () => {};
}

/** Callback invoked when the Browse Community button is clicked. */
let onBrowseCommunity = () => {};

export function setBrowseCommunityHandler(cb) {
  onBrowseCommunity = typeof cb === 'function' ? cb : () => {};
}

/** Callback invoked when a community feature like button is clicked. */
let onLikeCommunityFeature = () => {};

export function setLikeCommunityFeatureHandler(cb) {
  onLikeCommunityFeature = typeof cb === 'function' ? cb : () => {};
}

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

  // Role and type are OR'd: a feature is visible if it matches the creature's
  // role OR its type (so picking Ooze shows all ooze features regardless of role).
  const roleMatch = !roleTags.length || matchesTagRequirement(roleTags, creature.role, { allowNone: true });
  const typeMatch = !typeTags.length || matchesTagRequirement(typeTags, creature.type);

  if (roleTags.length && typeTags.length) {
    // Has both — show if either matches
    if (!roleMatch && !typeMatch) return false;
  } else {
    // Has only one — must match that one
    if (!roleMatch || !typeMatch) return false;
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

/** Tracks which feature group/section keys are currently collapsed. Survives re-renders. */
const collapsedGroups = new Set();

/**
 * Wire a heading as a toggle for its wrapper element.
 * Restores collapsed state from collapsedGroups and registers a click handler.
 * When collapsed and count > 0, appends "(N features)" to the heading text.
 */
function wireToggle(wrapperEl, headingEl, key, count = 0) {
  if (collapsedGroups.has(key)) {
    wrapperEl.classList.add('is-collapsed');
    if (count > 0) {
      headingEl.textContent += ` (${count})`;
    }
  }
  headingEl.addEventListener('click', () => {
    if (collapsedGroups.has(key)) collapsedGroups.delete(key);
    else collapsedGroups.add(key);
    renderFeatureControls();
  });
}

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
 * Build the footer element with role/type pills and reaction chip, matching library card footers.
 * Returns null when the feature has no tags or reaction flag to display.
 * @param {object} feature - Feature object with optional tags[] and isReaction.
 * @returns {HTMLElement|null}
 */
function createFeatureCardFooter(feature) {
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const tags = Array.isArray(feature.tags) ? feature.tags : [];
  const roleSources = tags.filter((t) => t.startsWith('role/')).map((t) => capitalize(t.slice(5)));
  const typeSources = tags.filter((t) => t.startsWith('creature/')).map((t) => capitalize(t.slice(9)));
  const isReaction = Boolean(feature.isReaction || feature.effects?.isReaction);

  if (!isReaction && !roleSources.length && !typeSources.length) return null;

  const footer = document.createElement('div');
  footer.className = 'feature-card-footer';

  if (isReaction) {
    const reactionEl = document.createElement('span');
    reactionEl.className = 'feature-card-reaction';
    reactionEl.textContent = 'Reaction';
    footer.appendChild(reactionEl);
  }

  if (roleSources.length || typeSources.length) {
    const sourcesEl = document.createElement('div');
    sourcesEl.className = 'feature-card-sources';
    for (const role of roleSources) {
      const pill = document.createElement('span');
      pill.className = 'feature-card-source feature-card-source--role';
      pill.textContent = role;
      sourcesEl.appendChild(pill);
    }
    for (const type of typeSources) {
      const pill = document.createElement('span');
      pill.className = 'feature-card-source feature-card-source--type';
      pill.textContent = type;
      sourcesEl.appendChild(pill);
    }
    footer.appendChild(sourcesEl);
  }

  return footer;
}

/**
 * Create a bank feature card button for the My Features section.
 * Clicking it copies the bank feature to creature.customFeatures and opens the builder.
 * @param {object} bankFeature - Feature object from the user's bank.
 * @returns {HTMLButtonElement}
 */
function createBankFeatureCard(bankFeature) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'feature-card feature-card--bank';

  // Show as selected when this feature is already on the creature.
  // Always use community-${id} to match the controller's stable ID scheme,
  // so owned bank features and community cards for the same feature share the same key.
  const stableId = `community-${bankFeature.id}`;
  const isAdded = Array.isArray(creature.customFeatures) && creature.customFeatures.some((f) => f.id === stableId);
  if (isAdded) card.classList.add('selected');
  card.title = isAdded ? 'Click to remove from creature' : 'Click to add to creature';

  const header = document.createElement('div');
  header.className = 'feature-card-header';

  const nameEl = document.createElement('span');
  nameEl.className = 'feature-card-name';
  nameEl.textContent = bankFeature.name || 'Unnamed';

  const bankIcon = document.createElement('span');
  bankIcon.className = 'feature-card-bank-icon';
  bankIcon.textContent = '★';
  bankIcon.title = 'From your feature bank';
  header.append(nameEl, bankIcon);

  const desc = document.createElement('div');
  desc.className = 'feature-card-description';
  desc.textContent = getFeatureSummary(bankFeature) || 'No description available.';

  const typeEl = document.createElement('div');
  typeEl.className = 'feature-card-meta feature-card-bank-type';
  typeEl.textContent = (bankFeature.type || 'passive').charAt(0).toUpperCase() + (bankFeature.type || 'passive').slice(1);

  card.append(header, desc, typeEl);

  const footer = createFeatureCardFooter(bankFeature);
  if (footer) card.appendChild(footer);

  card.addEventListener('click', () => {
    const currentlyAdded = Array.isArray(creature.customFeatures) && creature.customFeatures.some((f) => f.id === stableId);
    if (currentlyAdded) {
      onRemoveBankFeature(stableId);
    } else {
      onAddBankFeature(bankFeature);
    }
  });

  return card;
}

/**
 * Create a community feature card button for the Community tab.
 * Clicking it calls onAddBankFeature to add it as a custom feature on the creature.
 * @param {object} feature - Feature object from the community features list.
 * @returns {HTMLButtonElement}
 */
function createCommunityFeatureCard(feature) {
  // Use a div (not button) so the nested like <button> is valid HTML
  const card = document.createElement('div');
  card.className = 'feature-card feature-card--community';
  card.tabIndex = 0;

  // Show as selected when this community feature is already on the creature
  const stableId = `community-${feature.id}`;
  const isAdded = Array.isArray(creature.customFeatures) && creature.customFeatures.some((f) => f.id === stableId);
  if (isAdded) card.classList.add('selected');
  card.title = isAdded ? 'Click to remove from creature' : 'Click to add to creature';

  const header = document.createElement('div');
  header.className = 'feature-card-header';

  const nameEl = document.createElement('span');
  nameEl.className = 'feature-card-name';
  nameEl.textContent = feature.name || 'Unnamed';

  const communityIcon = document.createElement('span');
  communityIcon.className = 'feature-card-community-icon';
  communityIcon.textContent = '🌐';
  communityIcon.title = 'Community feature';
  header.append(nameEl, communityIcon);

  const desc = document.createElement('div');
  desc.className = 'feature-card-description';
  desc.textContent = getFeatureSummary(feature) || 'No description available.';

  // Meta row: creator on left, like button on right
  const metaRow = document.createElement('div');
  metaRow.className = 'feature-card-community-meta';

  const creatorEl = document.createElement('span');
  creatorEl.className = 'feature-card-meta';
  creatorEl.textContent = `by ${feature.creatorName || 'Unknown'}`;

  const isLiked = featureState.likedFeatureIds instanceof Set && featureState.likedFeatureIds.has(feature.id);
  const likeBtn = document.createElement('button');
  likeBtn.type = 'button';
  likeBtn.className = 'feature-card-like-btn' + (isLiked ? ' is-liked' : '');
  likeBtn.title = isLiked ? 'Unlike' : 'Like';
  likeBtn.innerHTML = `${isLiked ? '♥' : '♡'}&thinsp;${feature.totalLikes ?? 0}`;

  likeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onLikeCommunityFeature(feature);
    // Optimistic UI update
    const nowLiked = !featureState.likedFeatureIds.has(feature.id);
    if (nowLiked) {
      featureState.likedFeatureIds.add(feature.id);
      feature.totalLikes = (feature.totalLikes ?? 0) + 1;
    } else {
      featureState.likedFeatureIds.delete(feature.id);
      feature.totalLikes = Math.max(0, (feature.totalLikes ?? 0) - 1);
    }
    likeBtn.classList.toggle('is-liked', nowLiked);
    likeBtn.title = nowLiked ? 'Unlike' : 'Like';
    likeBtn.innerHTML = `${nowLiked ? '♥' : '♡'}&thinsp;${feature.totalLikes}`;
  });

  metaRow.append(creatorEl, likeBtn);
  card.append(header, desc, metaRow);

  const footer = createFeatureCardFooter(feature);
  if (footer) card.appendChild(footer);

  // Card body click = add/remove from creature
  const handleCardClick = () => {
    const currentlyAdded = Array.isArray(creature.customFeatures) && creature.customFeatures.some((f) => f.id === stableId);
    if (currentlyAdded) {
      onRemoveBankFeature(stableId);
    } else {
      onAddBankFeature(feature);
    }
  };
  card.addEventListener('click', handleCardClick);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); }
  });

  return card;
}

/**
 * Render the library feature groups (actions, modifiers, passives, etc.).
 * Reads featureState.filteredIds/byId to build the UI grid.
 * @param {HTMLElement} container - Element to render into.
 * @param {string[]} visibleIds - Feature ids to render.
 */
function renderLibraryFeatures(container, visibleIds) {
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

    // PD / AD border accent
    const targetDefense = feature.effects?.targetDefense;
    if (targetDefense === 'PD') card.classList.add('feature-card--target-pd');
    else if (targetDefense === 'AD') card.classList.add('feature-card--target-ad');

    // Header: name + cost badge
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const header = document.createElement('div');
    header.className = 'feature-card-header';
    const nameEl = document.createElement('span');
    nameEl.className = 'feature-card-name';
    nameEl.textContent = feature.name;
    const costEl = document.createElement('span');
    costEl.className = 'feature-card-cost';
    costEl.textContent = feature.featureCost ?? 0;
    header.append(nameEl, costEl);

    const desc = document.createElement('div');
    desc.className = 'feature-card-description';
    const cardSummary = getFeatureSummary(feature);
    desc.textContent = cardSummary || 'No description available.';

    card.append(header, desc);

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

    // Footer: reaction chip + source pills
    const tags = Array.isArray(feature.tags) ? feature.tags : [];
    const roleSources = tags.filter(t => t.startsWith('role/')).map(t => capitalize(t.slice(5)));
    const typeSources = tags.filter(t => t.startsWith('creature/')).map(t => capitalize(t.slice(9)));

    if (feature.isReaction || roleSources.length || typeSources.length) {
      const footer = document.createElement('div');
      footer.className = 'feature-card-footer';

      if (feature.isReaction) {
        const reactionEl = document.createElement('span');
        reactionEl.className = 'feature-card-reaction';
        reactionEl.textContent = 'Reaction';
        footer.appendChild(reactionEl);
      }

      if (roleSources.length || typeSources.length) {
        const sourcesEl = document.createElement('div');
        sourcesEl.className = 'feature-card-sources';
        for (const role of roleSources) {
          const pill = document.createElement('span');
          pill.className = 'feature-card-source feature-card-source--role';
          pill.textContent = role;
          sourcesEl.appendChild(pill);
        }
        for (const type of typeSources) {
          const pill = document.createElement('span');
          pill.className = 'feature-card-source feature-card-source--type';
          pill.textContent = type;
          sourcesEl.appendChild(pill);
        }
        footer.appendChild(sourcesEl);
      }

      card.appendChild(footer);
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

  const totalActionCount = Object.values(actionBuckets).reduce((sum, arr) => sum + arr.length, 0);
  const hasActionFeatures = totalActionCount > 0;
  if (hasActionFeatures) {
    const actionsWrapper = document.createElement('section');
    actionsWrapper.className = 'feature-group';

    const actionsHeading = document.createElement('h1');
    actionsHeading.className = 'feature-group-title';
    actionsHeading.textContent = 'Actions';
    actionsWrapper.appendChild(actionsHeading);
    wireToggle(actionsWrapper, actionsHeading, 'Actions', totalActionCount);

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

      const sectionWrapper = document.createElement('div');
      sectionWrapper.className = 'feature-section-wrapper';

      const sectionCount = activeBuckets.reduce((sum, { key }) => sum + actionBuckets[key].length, 0);
      const sectionHeading = document.createElement('h2');
      sectionHeading.className = 'feature-group-subtitle';
      sectionHeading.textContent = section.title;
      sectionWrapper.appendChild(sectionHeading);
      wireToggle(sectionWrapper, sectionHeading, `Actions > ${section.title}`, sectionCount);

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
        sectionWrapper.appendChild(subgroup);
      });

      actionsWrapper.appendChild(sectionWrapper);
    });

    container.appendChild(actionsWrapper);
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
    const groupLabel = typeLabels[type] || type.charAt(0).toUpperCase() + type.slice(1);
    heading.textContent = groupLabel;
    groupWrapper.appendChild(heading);
    wireToggle(groupWrapper, heading, groupLabel, featureList.length);

    const grid = document.createElement('div');
    grid.className = 'feature-group-grid';

    featureList.forEach((feature) => {
      grid.appendChild(createFeatureCard(feature));
    });

    groupWrapper.appendChild(grid);
    container.appendChild(groupWrapper);
  });
}

/**
 * Render the grouped feature cards (actions, modifiers, passives, etc.).
 * Reads featureState.filteredIds/byId to build the UI grid.
 */
function renderFeatureControls() {
  const { featureControls } = dom;
  if (!featureControls) return;
  featureControls.innerHTML = '';

  const term = featureState.searchTerm;

  // My Features bank section (always at the top, bypasses role/type filters)
  if (Array.isArray(featureState.bankFeatures) && featureState.bankFeatures.length) {
    const bankWrapper = document.createElement('section');
    bankWrapper.className = 'feature-group feature-group--bank';

    const bankHeading = document.createElement('h1');
    bankHeading.className = 'feature-group-title';
    bankHeading.textContent = '★ My Features';
    bankWrapper.appendChild(bankHeading);
    wireToggle(bankWrapper, bankHeading, '__bank__');

    const bankGrid = document.createElement('div');
    bankGrid.className = 'feature-group-grid';
    featureState.bankFeatures.forEach((bankFeature) => {
      bankGrid.appendChild(createBankFeatureCard(bankFeature));
    });

    bankWrapper.appendChild(bankGrid);
    featureControls.appendChild(bankWrapper);
  }

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'picker-tabs';

  const libraryTab = document.createElement('button');
  libraryTab.type = 'button';
  libraryTab.className = 'picker-tab' + (featureState.activeTab === 'library' ? ' active' : '');
  libraryTab.textContent = 'Library';
  libraryTab.addEventListener('click', () => {
    featureState.activeTab = 'library';
    renderFeatureControls();
  });

  const communityTab = document.createElement('button');
  communityTab.type = 'button';
  communityTab.className = 'picker-tab' + (featureState.activeTab === 'community' ? ' active' : '');
  communityTab.textContent = 'Community';
  communityTab.addEventListener('click', () => {
    featureState.activeTab = 'community';
    onBrowseCommunity();
    renderFeatureControls();
  });

  tabBar.append(libraryTab, communityTab);
  featureControls.appendChild(tabBar);

  // Combined search view — ignores active tab
  if (term) {
    // Library section
    const libraryLabel = document.createElement('div');
    libraryLabel.className = 'picker-search-section-label';
    libraryLabel.textContent = 'Library';
    featureControls.appendChild(libraryLabel);

    const baseIds = featureState.filteredIds && featureState.filteredIds.length
      ? featureState.filteredIds
      : Object.keys(featureState.byId);

    const visibleIds = baseIds.filter((id) => {
      if (featureState.selectedIds.includes(id)) return true;
      const feature = featureState.byId[id];
      return featureMatchesCurrentCreature(feature);
    });

    if (visibleIds.length > 0) {
      const libraryContainer = document.createElement('div');
      renderLibraryFeatures(libraryContainer, visibleIds);
      featureControls.appendChild(libraryContainer);
    } else {
      const noResults = document.createElement('div');
      noResults.textContent = 'No library features match.';
      noResults.style.color = 'rgba(255,255,255,0.4)';
      noResults.style.fontSize = '0.85rem';
      noResults.style.margin = '0.25rem 0 0.5rem';
      featureControls.appendChild(noResults);
    }

    // My Features section in search
    const bankLabel = document.createElement('div');
    bankLabel.className = 'picker-search-section-label';
    bankLabel.textContent = 'My Features';
    featureControls.appendChild(bankLabel);

    const matchedBank = (featureState.bankFeatures || []).filter((f) => {
      const name = (f.name || '').toLowerCase();
      const summary = getFeatureSummary(f).toLowerCase();
      return name.includes(term) || summary.includes(term);
    });

    if (matchedBank.length > 0) {
      const bankGrid = document.createElement('div');
      bankGrid.className = 'feature-group-grid';
      matchedBank.forEach((f) => bankGrid.appendChild(createBankFeatureCard(f)));
      featureControls.appendChild(bankGrid);
    } else {
      const noBank = document.createElement('div');
      noBank.textContent = 'No bank features match.';
      noBank.style.color = 'rgba(255,255,255,0.4)';
      noBank.style.fontSize = '0.85rem';
      noBank.style.margin = '0.25rem 0 0.5rem';
      featureControls.appendChild(noBank);
    }

    // Community section in search
    const communityLabel = document.createElement('div');
    communityLabel.className = 'picker-search-section-label';
    communityLabel.textContent = 'Community';
    featureControls.appendChild(communityLabel);

    const matchedCommunity = (featureState.communityFeatures || []).filter((f) => {
      const name = (f.name || '').toLowerCase();
      const summary = getFeatureSummary(f).toLowerCase();
      return name.includes(term) || summary.includes(term);
    });

    if (matchedCommunity.length > 0) {
      const communityGrid = document.createElement('div');
      communityGrid.className = 'feature-group-grid';
      matchedCommunity.forEach((f) => communityGrid.appendChild(createCommunityFeatureCard(f)));
      featureControls.appendChild(communityGrid);
    } else {
      const noCommunity = document.createElement('div');
      noCommunity.textContent = 'No community features match.';
      noCommunity.style.color = 'rgba(255,255,255,0.4)';
      noCommunity.style.fontSize = '0.85rem';
      noCommunity.style.margin = '0.25rem 0 0.5rem';
      featureControls.appendChild(noCommunity);
    }

    return;
  }

  // No search term — show active tab content
  if (featureState.activeTab === 'library') {
    const baseIds = featureState.filteredIds && featureState.filteredIds.length
      ? featureState.filteredIds
      : Object.keys(featureState.byId);

    const visibleIds = baseIds.filter((id) => {
      if (featureState.selectedIds.includes(id)) return true;
      const feature = featureState.byId[id];
      return featureMatchesCurrentCreature(feature);
    });

    if (visibleIds.length === 0) {
      const noFeatures = document.createElement('div');
      noFeatures.textContent = 'No features available for the current filters.';
      featureControls.appendChild(noFeatures);
      return;
    }

    renderLibraryFeatures(featureControls, visibleIds);
  } else {
    // Community tab
    if (!featureState.communityFeaturesLoaded) {
      const loadingEl = document.createElement('div');
      loadingEl.className = 'community-loading';
      loadingEl.textContent = 'Loading community features\u2026';
      featureControls.appendChild(loadingEl);
    } else if (!featureState.communityFeatures.length) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'community-empty';
      emptyEl.textContent = 'No community features yet. Be the first!';
      featureControls.appendChild(emptyEl);
    } else {
      const communityGrid = document.createElement('div');
      communityGrid.className = 'feature-group-grid';
      featureState.communityFeatures.forEach((feature) => {
        communityGrid.appendChild(createCommunityFeatureCard(feature));
      });
      featureControls.appendChild(communityGrid);
    }
  }
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

/**
 * Upsert a custom feature on the creature. If a feature with the same id already
 * exists it is replaced in place; otherwise it is appended.
 * @param {object} feature - Full feature object with id, name, type, effects, isCustom.
 */
function addCustomFeature(feature) {
  if (!feature || !feature.id) return;
  if (!Array.isArray(creature.customFeatures)) creature.customFeatures = [];
  const existingIndex = creature.customFeatures.findIndex((f) => f.id === feature.id);
  if (existingIndex !== -1) {
    creature.customFeatures[existingIndex] = feature;
  } else {
    creature.customFeatures.push(feature);
  }
}

/**
 * Replace an existing custom feature by id.
 * @param {string} id - Feature id to replace.
 * @param {object} feature - Updated feature object.
 */
function updateCustomFeature(id, feature) {
  if (!id || !feature) return;
  if (!Array.isArray(creature.customFeatures)) { creature.customFeatures = []; return; }
  const index = creature.customFeatures.findIndex((f) => f.id === id);
  if (index !== -1) {
    creature.customFeatures[index] = { ...feature, id };
  }
}

/**
 * Remove a custom feature by id.
 * @param {string} id - Feature id to remove.
 */
function removeCustomFeature(id) {
  if (!id || !Array.isArray(creature.customFeatures)) return;
  creature.customFeatures = creature.customFeatures.filter((f) => f.id !== id);
}

export {
  applyFeatureSearch,
  ensureSelectedFeatureDependencies,
  renderFeatureControls,
  setFeatureSelectionChangeHandler,
  refreshFeatureFiltersForCurrentCreature,
  toggleFeatureSelection,
  addCustomFeature,
  updateCustomFeature,
  removeCustomFeature,
};

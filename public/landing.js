/**
 * Landing page script structure:
 * - Firebase setup, collection constants, and lightweight state holders.
 * - DOM cache for featured creature, newest creature, and runner-up panels.
 * - Formatting utilities (dates, labels, defenses) shared across sections.
 * - Action/trait rendering helpers that mirror the builder statblock.
 * - Firestore fetch + like mutation logic powering the landing experience.
 * - Bootstrap routine that wires auth, queries, and initial renders together.
 */

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { updateNavAuth } from './navAuth.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { auth, db } from './firebaseClient.js';

const CREATURES_COLLECTION = 'VanillaCreatures';
const CREATURE_LIKES_SUBCOLLECTION = 'likes';
const RUNNER_UP_COUNT = 2;

const featuredEls = {
  card: document.getElementById('featuredCard'),
  name: document.getElementById('featuredName'),
  meta: document.getElementById('featuredMeta'),
  hp: document.getElementById('featuredHP'),
  pd: document.getElementById('featuredPD'),
  ad: document.getElementById('featuredAD'),
  attributes: {
    mig: document.getElementById('featuredMig'),
    migSave: document.getElementById('featuredMigSave'),
    agi: document.getElementById('featuredAgi'),
    agiSave: document.getElementById('featuredAgiSave'),
    cha: document.getElementById('featuredCha'),
    chaSave: document.getElementById('featuredChaSave'),
    int: document.getElementById('featuredInt'),
    intSave: document.getElementById('featuredIntSave'),
  },
  traits: {
    resistances: document.getElementById('featuredResistances'),
    vulnerabilities: document.getElementById('featuredVulnerabilities'),
    immunities: document.getElementById('featuredImmunities'),
    skills: document.getElementById('featuredSkills'),
    senses: document.getElementById('featuredSenses'),
  },
  shortDesc: document.getElementById('featuredShortDescription'),
  longDesc: document.getElementById('featuredLongDescription'),
  actionsHeading: document.getElementById('featuredActionsHeading'),
  actionsInfo: document.getElementById('featuredActionsInfo'),
  actionsList: document.getElementById('featuredActionsList'),
  reactionsSection: document.getElementById('featuredReactionsSection'),
  reactionsList: document.getElementById('featuredReactionsList'),
  featuresSection: document.getElementById('featuredFeaturesSection'),
  featuresList: document.getElementById('featuredFeaturesList'),
  likeButton: document.getElementById('featuredLikeButton'),
  link: document.getElementById('featuredLink'),
};

const runnerListEl = document.getElementById('runnerList');

const newestEls = {
  section: document.getElementById('newestSection'),
  card: document.getElementById('newestCard'),
  name: document.getElementById('newestName'),
  meta: document.getElementById('newestMeta'),
  description: document.getElementById('newestDescription'),
  likes: document.getElementById('newestLikes'),
  link: document.getElementById('newestLink'),
};

const landingState = {
  featured: null,
  newest: null,
  runners: [],
};

let currentUser = null;

/**
 * Generates a Firestore-friendly timestamp representing "now".
 * @returns {import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js').Timestamp}
 */
const nowTimestamp = () => Timestamp.fromMillis(Date.now());

/**
 * Resolves after Firebase auth returns a user (or null) so downstream
 * queries render with the correct like-state context.
 */
const authReadyPromise = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateNavAuth(user, db);
    resolve();

    if (landingState.featured || landingState.newest || landingState.runners.length) {
      annotateLandingLikes(currentUser, landingState)
        .then(() => renderLandingUI(landingState))
        .catch((error) => console.warn('Failed to refresh like status', error));
    }
  });
});

/**
 * Normalises Firestore timestamp-like values to native Date instances.
 * @param {unknown} value - Firestore Timestamp, ISO string, or millis number.
 * @returns {Date|null} Parsed date or null when invalid.
 */
const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  const parsed = new Date(value);
  // eslint-disable-next-line no-restricted-globals
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Flattens a creature Firestore document snapshot into a display-ready object.
 * @param {import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js').QueryDocumentSnapshot} docSnap
 * @returns {{id:string,totalLikes:number,savedAt:any,lastLikeAt:any}} Partial creature record merged with raw data.
 */
const formatCreatureDoc = (docSnap) => {
  if (!docSnap) return null;
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    totalLikes: typeof data.totalLikes === 'number' ? data.totalLikes : 0,
    savedAt: data.savedAt ?? null,
    lastLikeAt: data.lastLikeAt ?? null,
    ...data,
  };
};

/**
 * Converts internal enum string values into human readable labels.
 * @param {string} value - Raw string such as "apex_brute".
 * @returns {string}
 */
const formatLabel = (value) => {
  if (!value) return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

/**
 * Produces the headline metadata (size, level, power, role) for a creature card.
 * @param {Record<string, any>} creature - Document payload with base overrides.
 * @returns {string}
 */
const formatMeta = (creature) => {
  if (!creature) return '';
  const size = formatLabel(creature.size || creature.base?.size);
  const type = formatLabel(creature.type || creature.base?.type);
  const level = Number.isFinite(Number(creature.level))
    ? `Level ${Number(creature.level)}`
    : '';
  const power = formatLabel(creature.power || creature.base?.power || '');
  const role = formatLabel(creature.role || creature.base?.role || '');

  const left = [size, type].filter(Boolean).join(' ');
  const right = [level, power, role].filter(Boolean).join(' ');
  return [left, right].filter(Boolean).join(' • ');
};

/**
 * Guards like totals to ensure non-negative integers before display.
 * @param {unknown} value
 * @returns {number}
 */
const resolveLikeCount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
};

/**
 * Formats a like total with a heart prefix for UI badges.
 * @param {number} likes
 * @returns {string}
 */
const formatLikes = (likes) => `♥ ${Math.max(0, likes || 0)}`;

/**
 * Builds a "Saved" timeline string for newest/runner cards.
 * @param {unknown} dateValue - Timestamp, string, or number.
 * @returns {string}
 */
const formatDateLine = (dateValue) => {
  const date = toDate(dateValue);
  if (!date) return '';
  return `Saved on ${date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`;
};

/**
 * Formats defense spread into "Base / Heavy / Brutal" notation.
 * @param {number} base
 * @param {number} heavy
 * @param {number} brutal
 * @returns {string}
 */
const formatDefense = (base, heavy, brutal) => {
  if (base == null) return '-- / -- / --';
  const baseValue = Number(base) || 0;
  const heavyValue = Number.isFinite(Number(heavy)) ? Number(heavy) : baseValue + 5;
  const brutalValue = Number.isFinite(Number(brutal)) ? Number(brutal) : baseValue + 10;
  return `${baseValue} / ${heavyValue} / ${brutalValue}`;
};

/**
 * Removes all child nodes from the supplied element.
 * @param {HTMLElement|null} el
 */
function clearElement(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Syncs the featured like button to reflect auth state and prior likes.
 * @param {HTMLButtonElement|null} button
 * @param {Record<string, any>|null} creature
 */
function updateLikeButton(button, creature) {
  if (!button) return;
  const hasCreature = Boolean(creature && creature.id);
  const likes = resolveLikeCount(creature?.totalLikes);
  const isLiked = hasCreature && Boolean(creature?.isLikedByCurrentUser);
  button.dataset.creatureId = hasCreature ? creature.id : '';
  button.dataset.liked = isLiked ? 'true' : 'false';
  button.setAttribute('aria-pressed', isLiked ? 'true' : 'false');
  button.textContent = `${isLiked ? '♥' : '♡'} ${likes}`;
  const actionLabel = isLiked ? `Unlike (${likes} likes)` : `Like (${likes} likes)`;
  button.setAttribute('aria-label', actionLabel);
  button.title = actionLabel;
  button.disabled = !hasCreature;
}

/**
 * Builds a like toggle button for runner-up cards.
 * @param {Record<string, any>} creature
 * @returns {HTMLButtonElement}
 */
function createLikeButton(creature) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'stat-like-button stat-likes';
  updateLikeButton(button, creature);
  button.addEventListener('click', () => handleToggleLike(creature, button));
  return button;
}

/**
 * Applies a like/unlike mutation transactionally for the given creature.
 * @param {Record<string, any>} creature
 * @param {HTMLButtonElement|null} triggerButton - Button triggering the action (disabled during request).
 */
async function handleToggleLike(creature, triggerButton) {
  if (!creature || !creature.id) return;
  if (!currentUser) {
    window.location.href = './Auth/auth.html';
    return;
  }

  if (triggerButton) triggerButton.disabled = true;

  let updatedState = null;
  try {
    await runTransaction(db, async (tx) => {
      const creatureRef = doc(db, CREATURES_COLLECTION, creature.id);
      const likeRef = doc(
        db,
        CREATURES_COLLECTION,
        creature.id,
        CREATURE_LIKES_SUBCOLLECTION,
        currentUser.uid
      );

      const creatureSnap = await tx.get(creatureRef);
      if (!creatureSnap.exists()) {
        throw new Error('Creature document does not exist.');
      }

      const existingData = creatureSnap.data() || {};
      const currentLikes = resolveLikeCount(existingData.totalLikes);
      const likeSnap = await tx.get(likeRef);

      if (likeSnap.exists()) {
        const nextLikes = Math.max(0, currentLikes - 1);
        tx.delete(likeRef);
        tx.update(creatureRef, { totalLikes: nextLikes });
        updatedState = { totalLikes: nextLikes, isLiked: false };
      } else {
        const nextLikes = currentLikes + 1;
        tx.set(likeRef, {
          userId: currentUser.uid,
          createdAt: serverTimestamp(),
        });
        tx.update(creatureRef, {
          totalLikes: nextLikes,
          lastLikeAt: serverTimestamp(),
        });
        updatedState = { totalLikes: nextLikes, isLiked: true };
      }
    });
  } catch (error) {
    console.error('Failed to toggle like', error);
    updatedState = null;
  } finally {
    if (triggerButton) triggerButton.disabled = false;
  }

  if (updatedState) {
    creature.totalLikes = updatedState.totalLikes;
    creature.isLikedByCurrentUser = updatedState.isLiked;
    renderLandingUI(landingState);
  }
}

/**
 * Marks creatures in state with whether the current user has liked them.
 * @param {import('https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js').User|null} user
 * @param {{featured?:any,newest?:any,runners?:any[]}} state
 */
async function annotateLandingLikes(user, state) {
  if (!state) return;
  const tasks = [];
  const seen = new Set();

  /**
   * Tags an individual creature with a pending like lookup promise.
   * @param {Record<string, any>} creature
   */
  const annotate = (creature) => {
    if (!creature || !creature.id) return;
    creature.totalLikes = resolveLikeCount(creature.totalLikes);
    creature.isLikedByCurrentUser = false;

    if (!user) {
      return;
    }

    if (seen.has(creature.id)) return;
    seen.add(creature.id);

    const likeRef = doc(
      db,
      CREATURES_COLLECTION,
      creature.id,
      CREATURE_LIKES_SUBCOLLECTION,
      user.uid
    );

    tasks.push(
      getDoc(likeRef)
        .then((likeSnap) => {
          creature.isLikedByCurrentUser = likeSnap.exists();
        })
        .catch(() => {
          creature.isLikedByCurrentUser = false;
        })
    );
  };

  annotate(state.featured);
  annotate(state.newest);
  state.runners.forEach(annotate);

  await Promise.all(tasks);
}

/**
 * Redraws the featured, runner, and newest sections using the latest state snapshot.
 * @param {{featured:Object|null,newest:Object|null,runners:Object[]}} state
 */
function renderLandingUI(state) {
  const fallback = state.featured
    ? 'Featured creature is also the newest. Keep exploring for fresh additions!'
    : 'No recent creature yet. Why not create one?';
  const shouldShowNewest =
    state.newest && (!state.featured || state.newest.id !== state.featured.id);

  renderFeatured(state.featured);
  renderRunnerCards(state.runners);
  renderNewest(shouldShowNewest ? state.newest : null, fallback);

  window.__landingCreatures = {
    featured: state.featured,
    newest: state.newest,
    runners: state.runners,
  };
}

/**
 * Builds a badge row highlighting legendary/apex flags for an action.
 * @param {Record<string, any>} action
 * @returns {HTMLDivElement|null}
 */
function createActionBadges(action) {
  const badges = [];
  if (action?.isLegendaryAction) badges.push('Legendary Action');
  if (action?.isApexAction) badges.push('Apex Action');
  if (!badges.length) return null;

  const row = document.createElement('div');
  row.className = 'action-badges';
  badges.forEach((label) => {
    const badge = document.createElement('span');
    badge.className = 'action-badge';
    badge.textContent = label;
    row.appendChild(badge);
  });
  return row;
}

/**
 * Renders a statblock action card for the featured or runner creatures.
 * @param {Record<string, any>} action - Action or reaction payload.
 * @param {Record<string, any>} creatureContext - Creature carrying fallback stats.
 * @param {{showTrigger?:boolean}} options - Controls reaction trigger rendering.
 * @returns {HTMLDivElement}
 */
function createActionCard(action, creatureContext, options = {}) {
  const { showTrigger = false } = options;
  const wrapper = document.createElement('div');
  wrapper.className = 'statblock-action-item';

  const header = document.createElement('div');
  header.className = 'action-header';
  const title = document.createElement('strong');
  appendField(title, action?.name || 'Action', 'name');
  appendText(title, ' (');
  appendField(title, action?.cost ?? 0, 'cost');
  appendText(title, ' AP):');
  header.appendChild(title);
  wrapper.appendChild(header);

  const badgesRow = createActionBadges(action);
  if (badgesRow) wrapper.appendChild(badgesRow);

  if (showTrigger && action?.reactionTrigger) {
    const triggerLine = document.createElement('div');
    triggerLine.className = 'action-trigger';
    triggerLine.textContent = `Trigger: ${action.reactionTrigger}`;
    wrapper.appendChild(triggerLine);
  }

  const actionTypeLabel = String(action?.actionType || '').toLowerCase();
  const isUtilityAction = actionTypeLabel.includes('utility') && !actionTypeLabel.includes('check');

  if (isUtilityAction) {
    if (action?.description) {
      const description = document.createElement('div');
      description.className = 'action-description';
      description.textContent = action.description;
      wrapper.appendChild(description);
    }
    return wrapper;
  }

  const summary = document.createElement('div');
  summary.className = 'action-summary';

  const attackLine = document.createElement('div');
  appendField(attackLine, action?.actionType || 'Action', 'actionType');

  if (action?.targetDefense) {
    appendText(attackLine, ' vs ');
    appendField(attackLine, action.targetDefense, 'targetDefense');
  }

  if (action?.check && action.check.dc != null) {
    appendText(attackLine, action.targetDefense ? ' • DC ' : ' DC ');
    appendBoldField(attackLine, action.check.dc, 'checkDc');
  }

  appendText(attackLine, '.');

  const segments = Array.isArray(action?.damage) ? action.damage : [];
  if (segments.length) {
    const baseDmg = Number(creatureContext?.stats?.damage) || 0;
    appendText(attackLine, ' ');
    segments.forEach((segment, index) => {
      if (index > 0) appendText(attackLine, ' + ');
      const raw = segment.useBase !== undefined
        ? (segment.useBase ? baseDmg : 0) + (Number(segment.modifier) || 0)
        : Number(segment.amount) || 0;
      appendBoldField(attackLine, Math.floor(raw), 'damageAmount');
      if (segment.type) {
        appendText(attackLine, ' ');
        appendBoldField(attackLine, segment.type, 'damageType');
      }
    });
    appendText(attackLine, ' damage');
  }
  summary.appendChild(attackLine);

  if (action?.target || action?.range) {
    const targetLine = document.createElement('div');
    appendText(targetLine, 'Target ');
    appendField(targetLine, action.target || 'target', 'target');
    if (action.range) {
      appendText(targetLine, ' within ');
      appendField(targetLine, action.range, 'range');
    }
    appendText(targetLine, '.');
    summary.appendChild(targetLine);
  }

  const stats = creatureContext.stats || {};
  const contextSaveDC = stats.saveDC ?? creatureContext.saveDC ?? 0;

  if (action?.save) {
    const save = action.save;
    if (save.attribute) {
      const saveLine = document.createElement('div');
      appendField(saveLine, save.attribute, 'saveAttribute');
      appendText(saveLine, ' Save, DC: ');
      appendBoldField(saveLine, contextSaveDC, 'saveDC');
      appendText(saveLine, '.');
      summary.appendChild(saveLine);
    }

    if (save.failure) {
      const failureLine = document.createElement('div');
      appendText(failureLine, 'Failure: ');
      appendField(failureLine, save.failure, 'saveFailure');
      summary.appendChild(failureLine);
    }

    if (save.failureEach5) {
      const failureEachLine = document.createElement('div');
      appendText(failureEachLine, 'Failure (Each 5): ');
      appendField(failureEachLine, save.failureEach5, 'saveFailureEach5');
      summary.appendChild(failureEachLine);
    }

    if (save.success) {
      const successLine = document.createElement('div');
      appendText(successLine, 'Success: ');
      appendField(successLine, save.success, 'saveSuccess');
      summary.appendChild(successLine);
    }

    if (save.successEach5) {
      const successEachLine = document.createElement('div');
      appendText(successEachLine, 'Success (Each 5): ');
      appendField(successEachLine, save.successEach5, 'saveSuccessEach5');
      summary.appendChild(successEachLine);
    }
  }

  if (action?.check) {
    const check = action.check;
    if (check.failure) {
      const checkFailure = document.createElement('div');
      appendText(checkFailure, 'Failure: ');
      appendField(checkFailure, check.failure, 'checkFailure');
      summary.appendChild(checkFailure);
    }

    if (check.failureEach5) {
      const checkFailureEach = document.createElement('div');
      appendText(checkFailureEach, 'Failure (Each 5): ');
      appendField(checkFailureEach, check.failureEach5, 'checkFailureEach5');
      summary.appendChild(checkFailureEach);
    }

    if (check.success) {
      const checkSuccess = document.createElement('div');
      appendText(checkSuccess, 'Success: ');
      appendField(checkSuccess, check.success, 'checkSuccess');
      summary.appendChild(checkSuccess);
    }

    if (check.successEach5) {
      const checkSuccessEach = document.createElement('div');
      appendText(checkSuccessEach, 'Success (Each 5): ');
      appendField(checkSuccessEach, check.successEach5, 'checkSuccessEach5');
      summary.appendChild(checkSuccessEach);
    }
  }

  if (summary.childNodes.length) {
    wrapper.appendChild(summary);
  }

  if (action?.description) {
    const description = document.createElement('div');
    description.className = 'action-description';
    description.textContent = action.description;
    wrapper.appendChild(description);
  }

  return wrapper;
}

/**
 * Appends a span with optional dataset binding to the parent.
 * @param {HTMLElement} parent
 * @param {unknown} value
 * @param {string} [field]
 */
function appendField(parent, value, field) {
  if (value === undefined || value === null || value === '') return;
  const span = document.createElement('span');
  span.className = 'action-span';
  if (field) span.dataset.field = field;
  span.textContent = value;
  parent.appendChild(span);
}

/**
 * Appends a strong-wrapped span so the text renders emphasized.
 * @param {HTMLElement} parent
 * @param {unknown} value
 * @param {string} [field]
 */
function appendBoldField(parent, value, field) {
  if (value === undefined || value === null || value === '') return;
  const strong = document.createElement('strong');
  appendField(strong, value, field);
  parent.appendChild(strong);
}

/**
 * Appends a plain span with text content (used for punctuation/labels).
 * @param {HTMLElement} parent
 * @param {string} text
 */
function appendText(parent, text) {
  if (text === undefined || text === null || text === '') return;
  const span = document.createElement('span');
  span.textContent = text;
  parent.appendChild(span);
}

/**
 * Writes text content into an element, applying a fallback when empty.
 * @param {HTMLElement|null} el
 * @param {unknown} value
 * @param {string} [fallback='—']
 */
function writeContent(el, value, fallback = '—') {
  if (!el) return;
  const hasValue = value !== undefined && value !== null && value !== '';
  el.textContent = hasValue ? value : fallback;
}

/**
 * Formats numeric modifiers with explicit plus signs for positives.
 * @param {unknown} value
 * @returns {string}
 */
function formatSigned(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '+0';
  return num >= 0 ? `+${num}` : `${num}`;
}

/**
 * Renders resistances/vulnerabilities/immunities into the statblock rows.
 * @param {HTMLElement|null} container
 * @param {{damage?:string[],condition?:string[]}} [group={}]
 */
function renderTraitGroup(container, group = {}) {
  if (!container) return;
  clearElement(container);
  const row = container.closest('.statblock-trait-row');
  /**
   * Removes falsy or "none" markers before rendering trait chips.
   * @param {string[]} values
   * @returns {string[]}
   */
  const filterValues = (values) =>
    values.filter(
      (value) => value && String(value).toLowerCase() !== 'none'
    );
  const damage = Array.isArray(group.damage) ? filterValues(group.damage) : [];
  const condition = Array.isArray(group.condition) ? filterValues(group.condition) : [];
  if (!damage.length && !condition.length) {
    if (row) row.style.display = 'none';
    return;
  }
  if (row) row.style.display = '';
  /**
   * Adds a chip span to the container, optionally with a style override.
   * @param {string} text
   * @param {string} [className]
   */
  const append = (text, className) => {
    const span = document.createElement('span');
    if (className) span.className = className;
    span.textContent = text;
    container.appendChild(span);
  };
  damage.forEach((value) => append(value));
  if (damage.length && condition.length) {
    append('|', 'trait-separator');
  }
  condition.forEach((value) => append(value));
}

/**
 * Outputs a simple inline list (skills/senses) or hides the row when empty.
 * @param {HTMLElement|null} container
 * @param {string[]} values
 */
function renderTraitList(container, values) {
  if (!container) return;
  clearElement(container);
  const row = container.closest('.statblock-trait-row');
  const entries = Array.isArray(values)
    ? values.filter((value) => value && String(value).toLowerCase() !== 'none')
    : [];
  if (!entries.length) {
    if (row) row.style.display = 'none';
    return;
  }
  if (row) row.style.display = '';
  entries.forEach((value) => {
    const span = document.createElement('span');
    span.textContent = value;
    container.appendChild(span);
  });
}

/**
 * Populates the main featured statblock with creature data or placeholders.
 * @param {Record<string, any>|null} creature
 */
function renderFeatured(creature) {
  if (!featuredEls.card) return;
  featuredEls.card.classList.remove('is-loading');

  if (!creature) {
    if (featuredEls.name) featuredEls.name.textContent = 'No featured creature yet';
    if (featuredEls.meta) {
      featuredEls.meta.textContent = 'Check back soon for curated highlights.';
    }

    if (featuredEls.likeButton) {
      updateLikeButton(featuredEls.likeButton, null);
    }

    writeContent(featuredEls.hp, '--');
    writeContent(featuredEls.pd, '-- / -- / --');
    writeContent(featuredEls.ad, '-- / -- / --');

    Object.values(featuredEls.attributes).forEach((el) => writeContent(el, '--', '--'));

    renderTraitGroup(featuredEls.traits.resistances, {});
    renderTraitGroup(featuredEls.traits.vulnerabilities, {});
    renderTraitGroup(featuredEls.traits.immunities, {});
    renderTraitList(featuredEls.traits.skills, []);
    renderTraitList(featuredEls.traits.senses, []);

    if (featuredEls.featuresSection) featuredEls.featuresSection.hidden = true;
    if (featuredEls.featuresList) clearElement(featuredEls.featuresList);

    if (featuredEls.actionsHeading) {
      featuredEls.actionsHeading.textContent = 'Actions (0)';
    }

    if (featuredEls.actionsInfo) {
      clearElement(featuredEls.actionsInfo);
      const span = document.createElement('span');
      span.className = 'muted-text';
      span.textContent = 'No combat stats yet.';
      featuredEls.actionsInfo.appendChild(span);
    }

    if (featuredEls.actionsList) {
      clearElement(featuredEls.actionsList);
      const placeholder = document.createElement('div');
      placeholder.className = 'statblock-action-item';
      placeholder.textContent = 'No actions available.';
      featuredEls.actionsList.appendChild(placeholder);
    }
    if (featuredEls.reactionsSection) {
      featuredEls.reactionsSection.hidden = true;
    }
    if (featuredEls.reactionsList) {
      clearElement(featuredEls.reactionsList);
    }

    if (featuredEls.shortDesc) {
      featuredEls.shortDesc.textContent = 'We will spotlight community favourites right here.';
      featuredEls.shortDesc.classList.add('muted-text');
    }

    if (featuredEls.longDesc) {
      featuredEls.longDesc.textContent = 'No lore yet. Build and like creatures to see them here.';
      featuredEls.longDesc.classList.add('muted-text');
    }
    if (featuredEls.link) featuredEls.link.removeAttribute('href');
    return;
  }

  if (featuredEls.name) featuredEls.name.textContent = creature.name || 'Unnamed Creature';
  if (featuredEls.meta) featuredEls.meta.textContent = formatMeta(creature) || '—';

  if (featuredEls.likeButton) {
    updateLikeButton(featuredEls.likeButton, creature);
  }

  const stats = creature.stats || {};
  writeContent(featuredEls.hp, stats.HP, '--');
  writeContent(featuredEls.pd, formatDefense(stats.PD, stats.PDHeavy, stats.PDBrutal), '-- / -- / --');
  writeContent(featuredEls.ad, formatDefense(stats.AD, stats.ADHeavy, stats.ADBrutal), '-- / -- / --');

  const attributeValues =
    creature.attributes?.values ||
    creature.attributes ||
    creature.base?.attributes?.values ||
    {};
  const attributeSaves =
    creature.attributes?.saves ||
    creature.attributeSaves ||
    creature.base?.attributes?.saves ||
    {};

  writeContent(featuredEls.attributes.mig, attributeValues.Mig ?? attributeValues.MIG ?? '--', '--');
  writeContent(
    featuredEls.attributes.migSave,
    attributeSaves.Mig ?? attributeSaves.MIG ?? '--',
    '--'
  );
  writeContent(featuredEls.attributes.agi, attributeValues.Agi ?? attributeValues.AGI ?? '--', '--');
  writeContent(
    featuredEls.attributes.agiSave,
    attributeSaves.Agi ?? attributeSaves.AGI ?? '--',
    '--'
  );
  writeContent(featuredEls.attributes.cha, attributeValues.Cha ?? attributeValues.CHA ?? '--', '--');
  writeContent(
    featuredEls.attributes.chaSave,
    attributeSaves.Cha ?? attributeSaves.CHA ?? '--',
    '--'
  );
  writeContent(featuredEls.attributes.int, attributeValues.Int ?? attributeValues.INT ?? '--', '--');
  writeContent(
    featuredEls.attributes.intSave,
    attributeSaves.Int ?? attributeSaves.INT ?? '--',
    '--'
  );

  const traitSource = creature.traits || creature.base?.traits || {};
  renderTraitGroup(featuredEls.traits.resistances, traitSource.resistances || {});
  renderTraitGroup(featuredEls.traits.vulnerabilities, traitSource.vulnerabilities || {});
  renderTraitGroup(featuredEls.traits.immunities, traitSource.immunities || {});

  const skillValues =
    traitSource.skills ||
    creature.skills ||
    creature.base?.traits?.skills ||
    creature.base?.skills ||
    [];
  renderTraitList(featuredEls.traits.skills, skillValues);
  const senseValues =
    traitSource.senses ||
    creature.senses ||
    creature.base?.traits?.senses ||
    creature.base?.senses ||
    [];
  renderTraitList(featuredEls.traits.senses, senseValues);

  if (featuredEls.featuresSection && featuredEls.featuresList) {
    clearElement(featuredEls.featuresList);
    const passives = Array.isArray(creature.featurePassives) ? creature.featurePassives : [];
    if (!passives.length) {
      featuredEls.featuresSection.hidden = true;
    } else {
      featuredEls.featuresSection.hidden = false;
      passives.forEach((feature) => {
        const item = document.createElement('div');
        item.className = 'statblock-feature-item';
        const nameEl = document.createElement('div');
        nameEl.className = 'feature-name';
        nameEl.textContent = feature.name || '';
        item.appendChild(nameEl);
        const desc = feature.description || '';
        if (desc) {
          const descEl = document.createElement('div');
          descEl.className = 'feature-description';
          descEl.textContent = desc;
          item.appendChild(descEl);
        }
        featuredEls.featuresList.appendChild(item);
      });
    }
  }

  const apValue = stats.AP ?? creature.AP ?? 0;
  if (featuredEls.actionsHeading) {
    const parsedAp = Number(apValue);
    featuredEls.actionsHeading.textContent = `Actions (${Number.isFinite(parsedAp) ? parsedAp : 0})`;
  }

  if (featuredEls.actionsInfo) {
    clearElement(featuredEls.actionsInfo);
    const attack = stats.check ?? creature.check;
    const saveDC = stats.saveDC ?? creature.saveDC;
    const speed = stats.speed ?? creature.speed;
    const baseDamage = stats.damage ?? creature.damage;
    const infoParts = [];
    if (attack !== undefined && attack !== null && attack !== '') {
      infoParts.push(`Attack: ${formatSigned(attack)}`);
    }
    if (saveDC !== undefined && saveDC !== null && saveDC !== '') {
      infoParts.push(`Save DC: ${saveDC}`);
    }
    if (speed !== undefined && speed !== null && speed !== '') {
      infoParts.push(`Speed: ${speed}`);
    }
    if (baseDamage !== undefined && baseDamage !== null && baseDamage !== '') {
      infoParts.push(`Base Damage: ${baseDamage}`);
    }
    if (!infoParts.length) {
      const span = document.createElement('span');
      span.className = 'muted-text';
      span.textContent = 'No combat stats recorded.';
      featuredEls.actionsInfo.appendChild(span);
    } else {
      infoParts.forEach((text) => {
        const span = document.createElement('span');
        span.textContent = text;
        featuredEls.actionsInfo.appendChild(span);
      });
    }
  }

  if (featuredEls.actionsList) {
    clearElement(featuredEls.actionsList);
    const actions = Array.isArray(creature.featureActions) ? creature.featureActions : [];
    if (!actions.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'statblock-action-item';
      placeholder.textContent = 'No actions available.';
      featuredEls.actionsList.appendChild(placeholder);
    } else {
      actions.forEach((action) => {
        const card = createActionCard(action, creature);
        featuredEls.actionsList.appendChild(card);
      });
    }
  }

  if (featuredEls.reactionsSection && featuredEls.reactionsList) {
    const reactions = Array.isArray(creature.featureReactions) ? creature.featureReactions : [];
    if (!reactions.length) {
      featuredEls.reactionsSection.hidden = true;
      clearElement(featuredEls.reactionsList);
    } else {
      featuredEls.reactionsSection.hidden = false;
      clearElement(featuredEls.reactionsList);
      reactions.forEach((reaction) => {
        const card = createActionCard(reaction, creature, { showTrigger: true });
        featuredEls.reactionsList.appendChild(card);
      });
    }
  }

  if (featuredEls.shortDesc) {
    const rawShort =
      creature.shortDescription || creature.base?.shortDescription || '';
    const shortText = rawShort.trim();
    featuredEls.shortDesc.textContent = shortText || 'No short description yet.';
    featuredEls.shortDesc.classList.toggle(
      'muted-text',
      !shortText
    );
  }

  if (featuredEls.longDesc) {
    const rawLong = creature.longDescription || creature.base?.longDescription || '';
    const longText = rawLong.trim();
    featuredEls.longDesc.textContent = longText || 'No long description provided yet.';
    featuredEls.longDesc.classList.toggle('muted-text', !longText);
  }

  if (featuredEls.link) {
    if (creature.id) {
      featuredEls.link.href = `./CreateCreature/createCreature.html?creatureId=${encodeURIComponent(
        creature.id
      )}`;
    } else {
      featuredEls.link.removeAttribute('href');
    }
  }
}

/**
 * Builds the condensed runner-up statblock card.
 * @param {Record<string, any>} creature
 * @returns {HTMLElement}
 */
function createRunnerCard(creature) {
  const card = document.createElement('article');
  card.className = 'statblock statblock--condensed';

  const name = document.createElement('div');
  name.className = 'statblock-name';
  name.textContent = creature.name || 'Unnamed Creature';
  card.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'statblock-info';
  const metaLine = [formatMeta(creature), formatDateLine(creature.savedAt)]
    .filter(Boolean)
    .join(' • ');
  meta.textContent = metaLine || 'Awaiting details.';
  card.appendChild(meta);

  const divider = document.createElement('div');
  divider.className = 'statblock-divider';
  card.appendChild(divider);

  const vitals = document.createElement('div');
  vitals.className = 'statblock-vitals';
  const stats = creature.stats || {};
  /**
   * Appends a labeled value pair into the runner stats grid.
   * @param {string} label
   * @param {unknown} value
   */
  const addVital = (label, value) => {
    const labelSpan = document.createElement('span');
    labelSpan.className = 'statblock-label';
    labelSpan.textContent = label;
    vitals.appendChild(labelSpan);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'statblock-value';
    valueSpan.textContent = value !== undefined && value !== null && value !== '' ? value : '--';
    vitals.appendChild(valueSpan);
  };

  addVital('HP', stats.HP);
  addVital('PD', formatDefense(stats.PD, stats.PDHeavy, stats.PDBrutal));
  addVital('AD', formatDefense(stats.AD, stats.ADHeavy, stats.ADBrutal));
  card.appendChild(vitals);

  const actionsBar = document.createElement('div');
  actionsBar.className = 'statblock-actions-bar';
  const attack = stats.check ?? creature.check;
  const saveDC = stats.saveDC ?? creature.saveDC;
  const speed = stats.speed ?? creature.speed;
  const baseDamage = stats.damage ?? creature.damage;
  const infoParts = [];
  if (attack !== undefined && attack !== null && attack !== '') {
    infoParts.push(`Attack: ${formatSigned(attack)}`);
  }
  if (saveDC !== undefined && saveDC !== null && saveDC !== '') {
    infoParts.push(`Save DC: ${saveDC}`);
  }
  if (speed !== undefined && speed !== null && speed !== '') {
    infoParts.push(`Speed: ${speed}`);
  }
  if (baseDamage !== undefined && baseDamage !== null && baseDamage !== '') {
    infoParts.push(`Base Damage: ${baseDamage}`);
  }
  if (!infoParts.length) {
    const span = document.createElement('span');
    span.className = 'muted-text';
    span.textContent = 'No combat stats recorded.';
    actionsBar.appendChild(span);
  } else {
    infoParts.forEach((text) => {
      const span = document.createElement('span');
      span.textContent = text;
      actionsBar.appendChild(span);
    });
  }
  card.appendChild(actionsBar);

  const description = document.createElement('p');
  description.className = 'statblock-short-description';
  const rawShort =
    creature.shortDescription || creature.base?.shortDescription || '';
  const shortText = rawShort.trim();
  description.textContent = shortText || 'No short description yet.';
  description.classList.toggle(
    'muted-text',
    !shortText
  );
  card.appendChild(description);

  const footer = document.createElement('div');
  footer.className = 'statblock-footer';

  const likeButton = createLikeButton(creature);
  footer.appendChild(likeButton);

  const link = document.createElement('a');
  link.className = 'stat-link';
  link.textContent = 'View in Builder';
  if (creature.id) {
    link.href = `./CreateCreature/createCreature.html?creatureId=${encodeURIComponent(
      creature.id
    )}`;
  }
  footer.appendChild(link);

  card.appendChild(footer);
  return card;
}

/**
 * Rebuilds the runner-up list, or shows an empty-state message.
 * @param {Record<string, any>[]} runners
 */
function renderRunnerCards(runners) {
  if (!runnerListEl) return;
  clearElement(runnerListEl);

  if (!runners || !runners.length) {
    const placeholder = document.createElement('p');
    placeholder.className = 'runner-placeholder';
    placeholder.textContent = 'No community favourites yet. Build and like creatures to see them here!';
    runnerListEl.appendChild(placeholder);
    return;
  }

  runners.forEach((creature) => {
    runnerListEl.appendChild(createRunnerCard(creature));
  });
}

/**
 * Updates the "newest creature" teaser, falling back to a custom message.
 * @param {Record<string, any>|null} creature
 * @param {string} fallbackMessage
 */
function renderNewest(creature, fallbackMessage) {
  if (!newestEls.section || !newestEls.card) return;
  newestEls.card.classList.remove('is-loading');

  if (!creature) {
    if (fallbackMessage) {
      newestEls.description.textContent = fallbackMessage;
      newestEls.description.classList.add('muted-text');
    }
    newestEls.section.hidden = Boolean(!fallbackMessage);
    if (newestEls.meta) newestEls.meta.textContent = '';
    if (newestEls.likes) newestEls.likes.textContent = formatLikes(0);
    if (newestEls.link) newestEls.link.removeAttribute('href');
    return;
  }

  newestEls.section.hidden = false;
  newestEls.name.textContent = creature.name || 'Unnamed Creature';
  newestEls.meta.textContent = [formatMeta(creature), formatDateLine(creature.savedAt)]
    .filter(Boolean)
    .join(' • ');

  const descText =
    creature.shortDescription || creature.base?.shortDescription || 'No short description yet.';
  newestEls.description.textContent = descText;
  newestEls.description.classList.toggle(
    'muted-text',
    !creature.shortDescription && !creature.base?.shortDescription
  );

  newestEls.likes.textContent = formatLikes(resolveLikeCount(creature.totalLikes));
  if (creature.id) {
    newestEls.link.href = `./CreateCreature/createCreature.html?creatureId=${encodeURIComponent(
      creature.id
    )}`;
  } else {
    newestEls.link.removeAttribute('href');
  }
}

/**
 * Fetches the highest priority featured creature, skipping already used ids.
 * @param {Set<string>} excludeIds
 * @returns {Promise<import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js').QueryDocumentSnapshot|null>}
 */
async function fetchFeaturedDoc(excludeIds) {
  try {
    const featuredQuery = query(
      collection(db, CREATURES_COLLECTION),
      where('isFeaturedUntil', '>=', nowTimestamp()),
      orderBy('isFeaturedUntil', 'desc'),
      limit(5)
    );
    const snapshot = await getDocs(featuredQuery);
    for (const docSnap of snapshot.docs) {
      if (!excludeIds.has(docSnap.id)) {
        return docSnap;
      }
    }
  } catch (error) {
    console.warn('Failed to fetch featured creature', error);
  }
  return null;
}

/**
 * Retrieves the latest saved creatures to seed the "newest" slot.
 * @param {Set<string>} excludeIds
 * @param {number} [desiredCount=1]
 * @returns {Promise<import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js').QueryDocumentSnapshot[]>}
 */
async function fetchNewestDoc(excludeIds, desiredCount = 1) {
  const results = [];
  const fetchLimit = Math.max(desiredCount + excludeIds.size + 3, desiredCount);
  try {
    const newestQuery = query(
      collection(db, CREATURES_COLLECTION),
      orderBy('savedAt', 'desc'),
      limit(fetchLimit)
    );
    const snapshot = await getDocs(newestQuery);
    for (const docSnap of snapshot.docs) {
      if (!excludeIds.has(docSnap.id)) {
        results.push(docSnap);
        if (results.length >= desiredCount) break;
      }
    }
  } catch (error) {
    console.warn('Failed to fetch newest creature', error);
  }
  return results;
}

/**
 * Queries the top-liked creatures for runner-up consideration.
 * @param {Set<string>} excludeIds
 * @param {number} desiredCount
 * @returns {Promise<import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js').QueryDocumentSnapshot[]>}
 */
async function fetchTopLikedDocs(excludeIds, desiredCount) {
  const results = [];
  const fetchLimit = Math.max(desiredCount + excludeIds.size + 3, desiredCount + 3);
  try {
    const topLikedQuery = query(
      collection(db, CREATURES_COLLECTION),
      orderBy('totalLikes', 'desc'),
      limit(fetchLimit)
    );
    console.log('[Landing] fetchTopLikedDocs query', {
      fetchLimit,
      desiredCount,
      excludeCount: excludeIds.size,
    });
    const snapshot = await getDocs(topLikedQuery);
    snapshot.docs.forEach((docSnap, index) => {
      const data = docSnap.data() || {};
      console.log('[Landing] ranked candidate', {
        index,
        id: docSnap.id,
        totalLikes: data.totalLikes,
        lastLikeAt: data.lastLikeAt,
        skipped: excludeIds.has(docSnap.id),
      });
      if (!excludeIds.has(docSnap.id) && results.length < desiredCount) {
        results.push(docSnap);
        console.log('[Landing] added liked creature', { id: docSnap.id, rank: index });
      }
    });
  } catch (error) {
    console.warn('Failed to fetch most liked creatures', error);
  }
  return results;
}

/**
 * Orchestrates featured/newest/runner queries and merges results into state.
 * @returns {Promise<void>}
 */
async function loadLandingCreatures() {
  // Track documents already picked so we can avoid duplicates across sections.
  const usedIds = new Set();
  let featuredDoc = await fetchFeaturedDoc(usedIds);
  if (featuredDoc) {
    usedIds.add(featuredDoc.id);
    console.log("Found a hand picked creature to feature!");
  }

  // Pull the top liked creatures, padding the request when no featured pick exists yet.
  const topLikedDocs = await fetchTopLikedDocs(
    usedIds,
    RUNNER_UP_COUNT + (featuredDoc ? 0 : 1)
  );

  let runnerDocs = topLikedDocs.slice();

  // If we still don't have a featured doc, promote the highest-liked candidate.
  if (!featuredDoc && runnerDocs.length) {
    featuredDoc = runnerDocs.shift();
    usedIds.add(featuredDoc.id);
  }

  // Always grab a couple of newest publishes so we can show one and have a fallback.
  const newestCandidates = await fetchNewestDoc(usedIds, 2);
  let newestDoc = newestCandidates.length ? newestCandidates[0] : null;
  const initialNewestId = newestDoc?.id ?? null;
  if (newestDoc) usedIds.add(newestDoc.id);

  

  // Prefer a distinct newest creature; fall back to the second newest if needed.
  if (!featuredDoc && newestDoc) {
    featuredDoc = newestDoc;
    newestDoc = newestCandidates.length > 1 ? newestCandidates[1] : null;
    if (newestDoc) usedIds.add(newestDoc.id);
  } else if (newestCandidates.length > 1 && newestCandidates[1]) {
    const alternateNewest = newestCandidates[1];
    if (!usedIds.has(alternateNewest.id)) {
      if (initialNewestId && (!featuredDoc || initialNewestId !== featuredDoc.id)) {
        usedIds.delete(initialNewestId);
      }
      newestDoc = alternateNewest;
      usedIds.add(alternateNewest.id);
    }
  }

  // Ensure we have enough runner-ups by reusing any remaining newest candidates.
  runnerDocs = runnerDocs.filter((docSnap) => !usedIds.has(docSnap.id));
  while (runnerDocs.length < RUNNER_UP_COUNT) {
    const fallback = newestCandidates.find(
      (docSnap) => docSnap && !usedIds.has(docSnap.id)
    );
    if (!fallback) break;
    runnerDocs.push(fallback);
    usedIds.add(fallback.id);
  }

  runnerDocs = runnerDocs.slice(0, RUNNER_UP_COUNT);

  return {
    featured: formatCreatureDoc(featuredDoc),
    newest: formatCreatureDoc(
      newestDoc && featuredDoc && newestDoc.id === featuredDoc.id ? null : newestDoc
    ),
    runners: runnerDocs.map(formatCreatureDoc),
  };
}

/**
 * Writes the current year into the footer copyright span.
 */
function setFooterYear() {
  const footerYear = document.getElementById('footerYear');
  if (footerYear) {
    footerYear.textContent = new Date().getFullYear();
  }
}

setFooterYear();

if (featuredEls.likeButton) {
  featuredEls.likeButton.addEventListener('click', () => {
    if (!landingState.featured) return;
    handleToggleLike(landingState.featured, featuredEls.likeButton);
  });
}

loadLandingCreatures()
  .then(async (data) => {
    landingState.featured = data.featured || null;
    landingState.newest = data.newest || null;
    landingState.runners = Array.isArray(data.runners) ? data.runners : [];

    window.__landingCreatures = {
      featured: landingState.featured,
      newest: landingState.newest,
      runners: landingState.runners,
    };

    await authReadyPromise;
    try {
      await annotateLandingLikes(currentUser, landingState);
    } catch (likeError) {
      console.warn('Failed to annotate like status', likeError);
    }

    console.debug('Landing creatures fetched', window.__landingCreatures);
    renderLandingUI(landingState);
  })
  .catch((error) => {
    console.error('Failed to load landing creatures', error);
    landingState.featured = null;
    landingState.newest = null;
    landingState.runners = [];
    window.__landingCreatures = { featured: null, newest: null, runners: [] };
    renderFeatured(null);
    renderRunnerCards([]);
    renderNewest(null, 'Unable to load the latest creature right now.');
  });

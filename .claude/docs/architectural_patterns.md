# Architectural Patterns

## Module Organization (Per-Page Pattern)

Each page follows the same split:
- `*.html` — markup
- `*.js` — entry point (imports modules, bootstraps)
- `*.css` — page-specific styles

The CreateCreature builder is the most complex page and uses a dedicated `js/` subdirectory with responsibility-split modules:

| Module | Responsibility |
|--------|---------------|
| `createCreatureController.js` | Wires DOM events, coordinates all other modules |
| `createCreatureState.js` | Owns the creature object and feature state; handles localStorage draft |
| `createCreatureStats.js` | Stat scaling calculations (reads `gameRules.js`) |
| `createCreatureFeatures.js` | Feature search/selection UI logic |
| `createCreatureTraits.js` | Trait picker UI |
| `createCreatureStatblock.js` | Renders the stat block display |
| `createCreatureDom.js` | DOM element cache (queried once at init) |
| `createCreatureFirebase.js` | Firestore read/write for this page |

This same split pattern (controller + state + firebase + dom) should be followed for any new complex pages.

## State Management

State is centralized per page in a `*State.js` module. There is no global shared state store.

- Creature state lives in `createCreatureState.js`; `public/CreateCreature/js/createCreatureState.js:1`
- Single source of truth: update the creature object, then re-render DOM and statblock
- **Draft persistence**: creature state is written to `localStorage` before every Firestore save, and restored on page load if a draft exists (`utils/storage.js`)
- No reactive bindings — rendering is triggered explicitly by the controller

## Data Flow (Creature Builder)

```
User input → DOM event (controller)
  → Update creature state
  → Recalculate stats (gameRules.js + features)
  → Re-render statblock
  → On save: encode → Firestore write
  → On load: Firestore read → decode → hydrate state → render
```

Feature effects are applied on top of base scaled stats — `applyFeatureEffects()` in `public/features.js` merges modifier buckets into the creature object before rendering.

## Stat Scaling Pattern (gameRules.js)

All DC20 stat scaling is table-driven, not formula-driven. `public/Rules/gameRules.js` exports:

- Base stat tables indexed by level (0–10): HP, PD, AD, Check, Damage, AP, Speed, SaveDC
- Role modifiers (Brute, Artillerist, Controller, etc.) that adjust stats and assign attribute priorities
- Power tier multipliers (Minion, Weak, Normal, Apex, Legendary) applied to HP/defenses
- Type adjustments (Humanoid, Beast, Dragon, etc.)
- Size adjustments (Tiny through Gargantuan)

Scaling is always: `base[level] × powerMultiplier × typeMultiplier × sizeMultiplier`.

When adding new scaling factors, add entries to the appropriate table in `gameRules.js` rather than embedding numbers in calculation code.

## Feature System

Features are Firestore documents in `VanillaFeatures`. Three types (defined in `public/constants/featureTypes.js`):

- `action` — adds an entry to the creature's action economy
- `modifier` — adjusts base stats (HP, PD, AD, damage, resistances, etc.)
- `passive` — flavor/flavor text only

Features have `tags` (strings, e.g., `"role/brute"`, `"attack/martial"`, `"feature-cost/2"`) used for search and filtering — see `src/constants/featureTags.js`.

`applyFeatureEffects()` in `public/features.js` iterates selected features and merges their `effects` objects into the creature. Order matters: modifiers are applied after base stats are computed.

## Firebase Integration Patterns

**No real-time listeners** — all Firestore reads are explicit one-time fetches (`getDocs`, `getDoc`). No `onSnapshot`.

**Document ID convention**: `{ownerId}-{creature-name-slug}` — built in `public/utils/firestore.js`.

**Like system** uses a subcollection pattern:
- `VanillaCreatures/{creatureId}/likes/{userId}` tracks who liked what
- `totalLikes` counter on the parent document is updated in the same write
- Transactions guard against concurrent like/unlike races

**Encode/decode**: Firestore documents are not stored as raw JS objects. `public/utils/firestore.js` encodes creature objects (arrays → maps, etc.) for Firestore and decodes them on read. Always go through these helpers; do not write raw creature objects directly to Firestore.

## DOM Caching Pattern

Each complex page has a `*Dom.js` module that queries and exports all DOM elements once at init time. Reference these cached elements rather than calling `document.querySelector` in event handlers or render functions.

Example: `public/CreateCreature/js/createCreatureDom.js`

## Auth Pattern

Auth state is checked at the top of each page's entry script using Firebase `onAuthStateChanged`. Pages that require auth redirect to `/Auth/auth.html` if no user is present. The `auth` export from `public/firebaseClient.js` is used everywhere.

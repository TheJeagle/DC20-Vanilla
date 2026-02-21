# DC20 Creature Creator

A static web app for building and sharing monster/creature stat blocks for the DC20 tabletop RPG system. Users create creatures that auto-scale stats by level, power tier, role, type, and size — then save them to a community gallery.

## Tech Stack

- **Frontend**: Vanilla JS (ES6 modules), HTML5, CSS3 — no framework, no bundler
- **Backend**: Firebase (Firestore for data, Auth for users, Hosting for deployment)
- **Firebase SDK**: 10.13.1 via CDN
- **Auth**: Email/password + Google OAuth

## Key Directories

| Path | Purpose |
|------|---------|
| `public/` | Firebase Hosting root — all served files live here |
| `public/CreateCreature/` | Multi-module creature builder (main feature) |
| `public/MyCreatures/` | Personal creature management table |
| `public/AllCreatures/` | Community gallery with search/filter |
| `public/Auth/` | Login/register page |
| `public/EditCreature/` | Edit a saved creature |
| `public/Rules/` | DC20 stat scaling tables and game rules (`gameRules.js`) |
| `public/utils/` | Firestore encode/decode, localStorage wrapper |
| `public/constants/` | Enums for feature types and action types |
| `public/data/` | Feature JSON reference data + in-browser feature authoring tool |
| `src/` | Node-side constants and Firebase config (used by scripts only) |
| `scripts/` | One-off admin scripts (e.g., `uploadFeatures.mjs`) |

## Key Files

- `public/firebaseClient.js` — Firebase app init, exports `auth` and `db`
- `public/features.js` — Feature loading and `applyFeatureEffects()` logic
- `public/Rules/gameRules.js` — All DC20 scaling tables (HP, PD, AD, attributes by level/role/power/type/size)
- `public/utils/firestore.js` — Firestore document encoding/decoding helpers
- `public/CreateCreature/js/createCreatureController.js` — Builder orchestrator (DOM wiring, state sync)
- `public/CreateCreature/js/createCreatureState.js` — Creature state + localStorage draft persistence
- `public/CreateCreature/js/createCreatureStats.js` — Stat scaling calculations

## Build / Dev Commands

```bash
# Local dev (Firebase emulator)
firebase emulators:start --only hosting

# Or any static server
npx serve public

# Deploy
firebase deploy --only hosting

# Upload features to Firestore (optional admin task)
node scripts/uploadFeatures.mjs
```

No test suite. No build step — files are served as-is.

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `VanillaCreatures` | Saved creatures; doc ID: `{ownerId}-{name-slug}` |
| `VanillaFeatures` | Feature library (actions, modifiers, passives) |
| `VanillaCreatures/{id}/likes/{userId}` | Per-user like tracking subcollection |

## Additional Documentation

Check these when working on related areas:

- `.claude/docs/architectural_patterns.md` — Module layout, state management, data flow, feature system, and Firebase patterns used throughout the codebase

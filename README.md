# DC20 Creature Creator

A stat-focused creature builder and gallery for the DC20 RPG system. The site is a static web application backed by Firebase for authentication, feature metadata, and creature storage. It ships with:

- A **landing page** that showcases the featured creature, newest submissions, and runner‑ups by likes (`public/index.html`).
- A full **creature builder** with auto-scaling stat blocks, feature selection, and live previews (`public/CreateCreature/createCreature.html`).
- An **all creatures** browser for discovery and filtering (`public/AllCreatures/viewAllCreatures.html`).
- Personal **My Creatures** management with like/unlike tracking (`public/MyCreatures/myCreatures.html`).
- An in-browser **Feature Builder** that can author JSON feature definitions and push them directly to Firestore (`public/data/featureBuilder.html`).

All of these pages operate against the same Firestore project, using shared collections:

- `VanillaCreatures` – stored creature builds, likes, and ownership metadata.
- `VanillaFeatures` – reusable feature definitions consumed by the creature builder.

---

## Project structure

```
public/
├── index.html                      # Landing + featured creature showcase
├── CreateCreature/                 # Creature builder page, JS, CSS
├── AllCreatures/                   # Gallery/search experience for all shared creatures
├── MyCreatures/                    # Personal creature management page
├── Auth/                           # Authentication UI (Firebase Auth)
├── EditCreature/                   # Edit view for saved creatures
├── data/                           # Feature builder tool & reference JSON
├── features.js                     # Shared feature loader (reads VanillaFeatures collection)
├── firebaseClient.js               # Firebase app initialisation (configurable)
└── ...                             # CSS, utilities, rules helpers
scripts/
└── uploadFeatures.mjs              # Optional Node script to batch-upload feature JSON
firebase.json                       # Firebase Hosting configuration
```

The application is plain HTML/CSS/JS—there is no bundler step. Firebase Hosting can serve the `public/` directory directly.

---

## Prerequisites

- Node.js 18+ (for optional scripts and the Firebase CLI).
- A Firebase project with:
  - Firestore enabled
  - Authentication enabled (e.g., Email/Password provider)
  - Hosting (optional, for production deploy)
- The Firebase CLI (`npm install -g firebase-tools`).

The repository contains a default Firebase config (`public/firebaseClient.js`). Replace the values with your own project credentials before deploying publicly.

---

## Local development

1. **Install dependencies (optional)**
   ```bash
   npm install -g firebase-tools
   ```

2. **Serve locally**
   - Using Firebase Hosting emulator (preferred):
     ```bash
     firebase emulators:start --only hosting
     ```
     This serves the `public/` directory at `http://localhost:5000`.
   - Using any static server:
     ```bash
     npx serve public
     # or
     npx http-server public
     ```

3. **Configure environment**
   - Update `public/firebaseClient.js` with your Firebase project keys.
   - Ensure Firestore collections `VanillaCreatures` and `VanillaFeatures` exist. The builder auto-creates documents when saving, but you can seed data using the Feature Builder or `scripts/uploadFeatures.mjs`.

---

## Data model overview

| Collection         | Purpose                                             | Example documents |
|--------------------|-----------------------------------------------------|-------------------|
| `VanillaCreatures` | Saved creatures, like counters, owner metadata      | `creatureId` documents storing stats, feature selections, total likes, etc. |
| `VanillaFeatures`  | Feature definitions consumed by the builder UI      | `featureId` documents storing type, tags, effects, and metadata |

Additional per-creature subcollections (`likes/{userId}`) track user likes to enforce one-like-per-user. Firestore security rules guard write access; see your project’s rules for details.

---

## Feature Builder workflow

- Open `public/data/featureBuilder.html` in a browser.
- Author a feature using the form controls (type, costs, damage segments, saves, tags, etc.).
- Use **Preview JSON** to review the generated document.
- Click **Upload to Firestore** to push directly into `VanillaFeatures/{id}`.
- New tags (e.g., `role/controller`, `target/area`, `style/martial`) are searchable inside the creature builder—users can locate off-role abilities by name or tag.

Alternatively, export the JSON collection with **Copy JSON** or **Download JSON** and run `scripts/uploadFeatures.mjs` to batch upload.

---

## Creature builder highlights

- Automatic stat scaling using DC20 rules (`public/Rules/gameRules.js`).
- Feature selection with dependency handling and tag-aware search.
- Live statblock rendering (`public/CreateCreature/js/createCreatureStatblock.js`).
- Firebase authentication Gate for saving/editing and liking creatures.
- Save to Firestore (`VanillaCreatures`) with owner metadata, like counts, and optional long description.

---

## Deployment

1. Log in to Firebase CLI:
   ```bash
   firebase login
   ```
2. Ensure `firebase.json` points `hosting.public` to `public` (default in repo).
3. Deploy:
   ```bash
   firebase deploy --only hosting
   ```

That will upload the static assets and make the app available via your Firebase Hosting URL.

---

## Contributing & notes

- The codebase uses vanilla JavaScript modules. Keep new JS files in `public/` and reference them with `<script type="module">`.
- When adding features, prefer the Feature Builder UI to maintain consistent schema (tags, action flags, etc.).
- If you expand the data model, update the Firestore security rules accordingly.
- For questions about DC20 RPG specifics, refer to the official rule set.

Happy building, and may your creatures survive the encounter!🛡️🧪

# Further plans

## Possible features:
Look and steal ideas from magazine 15 Poison
- Assassins Poison
Look and steal ideas from magazine 12 Beta Bestiary Vol. 2

Look and steal ideas from magazine 14 Expanded Ancestry Options
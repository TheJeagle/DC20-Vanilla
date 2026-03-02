import * as esbuild from 'esbuild';
import { rm, mkdir, copyFile } from 'fs/promises';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = 'public';
const OUT = 'dist';

// Directories under public/ to exclude from the production build (admin/dev tools only)
const SKIP_DIRS = new Set(['data']);

// One entry point per HTML page that loads a <script type="module">
const entryPoints = [
  'public/landing.js',
  'public/auth.js',
  'public/Auth/auth.js',
  'public/editCreature.js',
  'public/EditCreature/editCreature.js',
  'public/myCreatures.js',
  'public/MyCreatures/myCreatures.js',
  'public/AllCreatures/viewAllCreatures.js',
  'public/Encounters/encounters.js',
  'public/CreateCreature/createCreature.js',
  'public/MyEncounters/myEncounters.js',
  'public/AllEncounters/viewAllEncounters.js',
  'public/RunEncounter/runEncounter.js',
  'public/Admin/admin.js',
];

async function clean() {
  if (existsSync(OUT)) await rm(OUT, { recursive: true });
  await mkdir(OUT);
}

async function bundle() {
  await esbuild.build({
    entryPoints,
    bundle: true,
    minify: true,
    format: 'esm',
    external: ['https://*'],  // Don't bundle Firebase CDN imports
    outbase: SRC,
    outdir: OUT,
    logLevel: 'info',
  });
}

async function copyNonJs(srcDir, destDir) {
  const entries = readdirSync(srcDir);
  for (const entry of entries) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      const relDir = relative(SRC, srcPath);
      if (SKIP_DIRS.has(relDir)) continue;
      await mkdir(destPath, { recursive: true });
      await copyNonJs(srcPath, destPath);
    } else if (!entry.endsWith('.js')) {
      await copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  console.log('Cleaning dist/...');
  await clean();

  console.log('Bundling and minifying JS...');
  await bundle();

  console.log('Copying non-JS assets...');
  await copyNonJs(SRC, OUT);

  console.log('Build complete → dist/');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

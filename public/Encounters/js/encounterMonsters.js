/**
 * encounterMonsters.js
 * Monster library: load, filter, render, and add monsters.
 */
import { encounter, ui, makeId } from './encounterState.js';
import dom from './encounterDom.js';
import { renderSlots } from './encounterSlots.js';
import { loadMyCreatures as fetchMine, loadPublicCreatures as fetchPublic } from './encounterFirebase.js';

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadMyCreatures(uid) {
  ui.myCreatures = await fetchMine(uid);
  if (ui.monsterSource === 'mine') renderMonsterLibrary();
}

export async function loadPublicCreatures() {
  ui.communityCreatures = await fetchPublic();
  if (ui.monsterSource === 'community') renderMonsterLibrary();
}

export function switchSource(source) {
  ui.monsterSource = source;
  // Update tab styles
  const tabMine      = dom.tabMine();
  const tabCommunity = dom.tabCommunity();
  if (tabMine)      tabMine.classList.toggle('is-active',      source === 'mine');
  if (tabCommunity) tabCommunity.classList.toggle('is-active', source === 'community');
  renderMonsterLibrary();
}

export function applyFilters() {
  renderMonsterLibrary();
}

// ── Rendering ─────────────────────────────────────────────────────────────────

export function renderMonsterLibrary() {
  const list = dom.monsterLibList();
  if (!list) return;

  list.innerHTML = '';

  const source   = ui.monsterSource === 'mine' ? ui.myCreatures : ui.communityCreatures;
  const filtered = applyClientFilters(source);

  if (filtered.length === 0) {
    // Build empty message fresh each time — the static DOM node gets detached by
    // innerHTML='' and getElementById can't find detached nodes on the next render.
    const msg = document.createElement('p');
    msg.className = 'enc-empty';
    if (!ui.currentUser && ui.monsterSource === 'mine') {
      msg.textContent = 'Sign in to load your creatures.';
    } else {
      msg.textContent = 'No creatures match your filters.';
    }
    list.appendChild(msg);
    return;
  }

  filtered.forEach(c => list.appendChild(buildLibCard(c)));
}

function applyClientFilters(creatures) {
  const search   = ui.monsterSearchTerm.toLowerCase();
  const levelMin = Number(ui.monsterFilterLevelMin) || 0;
  const levelMax = Number(ui.monsterFilterLevelMax);
  const maxLevel = Number.isFinite(levelMax) && levelMax > 0 ? levelMax : Infinity;
  const role     = ui.monsterFilterRole;
  const power    = ui.monsterFilterPower;
  const type     = ui.monsterFilterType;

  return creatures.filter(c => {
    if (search && !String(c.name || '').toLowerCase().includes(search)) return false;
    const lvl = Number(c.level) || 0;
    if (lvl < levelMin) return false;
    if (lvl > maxLevel) return false;
    if (role  && c.role  !== role)  return false;
    if (power && c.power !== power) return false;
    if (type  && String(c.type || '').toLowerCase() !== type) return false;
    return true;
  });
}

function buildLibCard(creature) {
  const card = document.createElement('div');
  card.className = 'monster-lib-card';

  const name = document.createElement('div');
  name.className = 'monster-lib-name';
  name.title = creature.name;
  name.textContent = creature.name || '(unnamed)';

  const chips = document.createElement('div');
  chips.className = 'monster-lib-chips';

  const lvlChip = document.createElement('span');
  lvlChip.className = 'chip chip--level';
  lvlChip.textContent = `Lv ${creature.level ?? '?'}`;

  chips.appendChild(lvlChip);

  if (creature.power) {
    const powerChip = document.createElement('span');
    powerChip.className = 'chip chip--power';
    powerChip.textContent = cap(creature.power);
    chips.appendChild(powerChip);
  }

  if (creature.role && creature.role !== 'none') {
    const roleChip = document.createElement('span');
    roleChip.className = 'chip chip--role';
    roleChip.textContent = cap(creature.role);
    chips.appendChild(roleChip);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'monster-lib-add';
  addBtn.type = 'button';
  addBtn.title = `Add ${creature.name}`;
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => addMonster(creature));

  card.append(name, chips, addBtn);
  return card;
}

// ── Add monster to encounter ──────────────────────────────────────────────────

function addMonster(creature) {
  encounter.monsters.push({
    slotId:     makeId(),
    creatureId: creature.id || '',
    name:       creature.name || '(unnamed)',
    baseLevel:  Number(creature.level) || 0,
    levelDelta: 0,
    power:      creature.power || 'normal',
    role:       creature.role  || 'none',
    groupId:    null,
  });
  renderSlots();
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

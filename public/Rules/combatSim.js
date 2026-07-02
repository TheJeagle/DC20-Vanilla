// public/Rules/combatSim.js — DC20 Combat Simulation Engine
// Predicts creature survivability and threat output using DC20 combat math.
// Designed to consume creature stat objects and return balance metrics.

import { baseLevelStatsData, damageDifficultyTable } from './gameRules.js';

// ──────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────

const DIFFICULTY_ORDER = ['veryEasy', 'easy', 'medium', 'hard', 'veryHard', 'deadly'];
const DIFFICULTY_LABELS = {
    veryEasy: 'Very Easy', easy: 'Easy', medium: 'Medium', hard: 'Hard', veryHard: 'Very Hard', deadly: 'Deadly',
};

// What fraction of a typical PC party's damage is each type.
// Most PCs deal physical damage; elemental/mystical is rarer.
const PC_DAMAGE_TYPE_SHARES = {
    physical:  0.70,
    fire:      0.05,
    cold:      0.05,
    lightning: 0.05,
    radiant:   0.05,
    psychic:   0.02,
    umbral:    0.02,
    corrosion: 0.02,
    poison:    0.02,
    other:     0.02,
};

// Damage-equivalent values for conditions applied on failed saves.
// These represent the tactical impact as a rough damage number.
const CONDITION_VALUES = {
    bleeding:      1.0,
    burning:       1.0,
    prone:         1.0,
    slowed:        0.25,
    grappled:      0.5,
    stunned:       1.0,
    frightened:    0.5,
    dazed:         0.5,
    taunted:       0.25,
    charmed:       0.75,
    paralyzed:     1.5,
    incapacitated: 1.5,
    restrained:    0.75,
    blinded:       0.75,
    impaired:      0.5,
    exposed:       0.5,
    doomed:        1.0,
    immobilized:   0.5,
    hindered:      0.25,
    tethered:      0.25,
    intimidated:   0.5,
};

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Look up base stats for a given level from baseLevelStatsData.
 * Handles 'novice' (string) and numeric 0–20.
 */
function getLevelStats(level) {
    const entry = baseLevelStatsData.find(e => e.level === level);
    if (entry) return entry;
    // Clamp numeric levels to table range
    if (typeof level === 'number') {
        const clamped = clamp(level, 0, 20);
        return baseLevelStatsData.find(e => e.level === clamped) || baseLevelStatsData[1]; // fallback to level 0
    }
    return baseLevelStatsData[1]; // level 0 fallback
}

// ──────────────────────────────────────────────
// HIT DISTRIBUTION
// ──────────────────────────────────────────────

/**
 * DC20 hit tiers: Normal (meet defense), Heavy (+5), Crit (+10).
 * Returns probability of each outcome on a d20.
 */
export function hitDistribution(attackBonus, defense) {
    const rollNeeded = defense - attackBonus;

    // Chance to hit at all (roll >= rollNeeded on d20)
    const hitChance   = clamp((21 - rollNeeded) / 20, 0.05, 0.95);
    // Chance to hit by 5+ (heavy)
    const heavyChance = clamp((21 - (rollNeeded + 5)) / 20, 0, hitChance);
    // Chance to hit by 10+ (crit)
    const critChance  = clamp((21 - (rollNeeded + 10)) / 20, 0, heavyChance);

    return {
        miss:   1 - hitChance,
        normal: hitChance - heavyChance,
        heavy:  heavyChance - critChance,
        crit:   critChance,
        total:  hitChance,
    };
}

// ──────────────────────────────────────────────
// PC PARTY PROFILE
// ──────────────────────────────────────────────

/**
 * Derives a PC party profile from level using official DC20 math.
 *
 * Key insight: the official balance is 1 monster = 1 PC at Medium difficulty.
 * A party of 4 PCs fights 4 monsters. So the sim evaluates ONE creature vs ONE PC,
 * then scales by party size for encounter-level metrics.
 *
 * PC damage per attack (from PDF page 7):
 *   Base weapon: 1.5 + Heavy/Brutal/Crit avg: 0.65 + Enhancement: 1.0 + Class features: 0.5 = 3.65
 * This scales with level. We derive per-level from official HP / expected hits in 3 rounds.
 *
 * A single PC makes ~2 attacks/round (1-2 range) and hits 65% = ~1.3 hits/round.
 * In 3 rounds: ~3.9 hits. Official HP / 3.9 hits = damage per attack.
 */
export function pcProfile(level, count = 4) {
    const stats = getLevelStats(level);
    const attacksPerRound = 2; // PCs make 1-2 attacks per round, average ~2
    const hitChance = 0.65; // design target
    const hitsPerRound = attacksPerRound * hitChance; // ~1.3 hits/round per PC
    const hitsIn3Rounds = hitsPerRound * 3; // ~3.9 hits from 1 PC in 3 rounds

    // Official HP is designed so 1 PC kills 1 monster in 3 rounds
    const damagePerAttack = stats.HP / hitsIn3Rounds;

    // PC save proficiency = Ceil(Level / 2) + 2
    const numericLevel = level === 'novice' ? 0 : Number(level);
    const saveProficiency = Math.ceil(numericLevel / 2) + 2;

    return {
        level,
        count,
        attackBonus: stats.Check,          // PC attack bonus = official monster Check
        damagePerAttack,                   // ~3.33 at lvl 1, scales up
        attacksPerRound,
        hitsPerRound,                      // ~1.3 per single PC
        hp: stats.HP,                      // PC HP ≈ monster HP at same level
        avgDefense: (stats.PD + stats.AD) / 2, // avg of PD and AD
        saveProficiency,                   // Ceil(Level/2) + 2
    };
}

// ──────────────────────────────────────────────
// AREA TARGET ESTIMATION
// ──────────────────────────────────────────────

/**
 * Estimates how many targets an area attack hits.
 * Formula: 0.5 + areaSize * 0.5
 * 1 space = 1 target, 2 spaces = 1.5, 3 spaces = 2, 5 spaces = 3
 */
export function estimatedTargets(areaSize) {
    if (!areaSize || areaSize <= 0) return 1;
    return 0.5 + areaSize * 0.5;
}

// ──────────────────────────────────────────────
// MULTIPLE CHECK PENALTY & ADVANTAGE
// ──────────────────────────────────────────────

// DC20 MCP: each repeated check adds stacking DisADV.
// DisADV = roll extra d20 and take the lowest.
// With N stacks of DisADV you roll N+1 dice take lowest.
// If base chance to hit is X (on a single d20), then with N DisADV
// the chance = X^(N+1), because all N+1 dice must meet the threshold.

/**
 * Compute hit distribution with stacking DisADV.
 * disAdvCount = 0 means a normal roll (1d20).
 * disAdvCount = 1 means roll 2d20 take lowest, etc.
 */
function hitDistWithDisAdv(attackBonus, defense, disAdvCount) {
    // Base single-die probabilities
    const base = hitDistribution(attackBonus, defense);

    if (disAdvCount <= 0) return base;

    // With N extra dice (take lowest), P(roll >= threshold) = P(single die >= threshold)^(N+1)
    const dice = disAdvCount + 1;
    const hitChance   = Math.pow(base.total, dice);
    const heavyChance = Math.pow(base.total - base.normal, dice); // P(heavy or crit on single die)^dice
    const critChance  = Math.pow(base.crit, dice);

    return {
        miss:   1 - hitChance,
        normal: hitChance - heavyChance,
        heavy:  heavyChance - critChance,
        crit:   critChance,
        total:  hitChance,
    };
}

/**
 * Compute hit distribution with ADV (roll 2d20 take highest).
 * P(roll >= threshold) = 1 - (1 - baseSingleDie)^2
 */
function hitDistWithAdv(attackBonus, defense) {
    const base = hitDistribution(attackBonus, defense);
    const hitChance   = 1 - Math.pow(1 - base.total, 2);
    const heavyBase   = base.total - base.normal; // P(heavy or crit on single die)
    const heavyChance = 1 - Math.pow(1 - heavyBase, 2);
    const critChance  = 1 - Math.pow(1 - base.crit, 2);

    return {
        miss:   1 - hitChance,
        normal: hitChance - heavyChance,
        heavy:  heavyChance - critChance,
        crit:   critChance,
        total:  hitChance,
    };
}

// ──────────────────────────────────────────────
// ROUND SIMULATION
// ──────────────────────────────────────────────

/**
 * Scores an attack's raw value for sorting (ignoring hit chance).
 * Used to decide which attacks to attempt in which order.
 */
function scoreAttack(atk, mode, saveFailChance) {
    const cost = atk.cost || 1;
    if (cost <= 0) return { ...atk, effectiveDmg: 0, condValue: 0, rawValue: 0, cost };

    const baseDmg = atk.damage || 0;
    const isArea = atk.area || false;
    let targets = atk.targets || 1;

    if (isArea) {
        const areaSize = atk.areaSize || 3;
        targets = estimatedTargets(areaSize);
    }

    const effectiveTargets = (mode === 'focus') ? 1 : targets;
    const effectiveDmg = baseDmg * effectiveTargets;

    let condValue = 0;
    if (atk.condition) {
        const key = atk.condition.toLowerCase();
        const raw = CONDITION_VALUES[key] || 0.5;
        condValue = raw * saveFailChance * effectiveTargets;
    }

    const rawValue = effectiveDmg + condValue;

    return { ...atk, effectiveDmg, condValue, rawValue, cost, targets: effectiveTargets };
}

/**
 * Simulates one round of a creature's actions.
 *
 * Models the Multiple Check Penalty: each attack check after the first
 * gets stacking -2.5 to hit. The creature can spend 1 AP for ADV (+3.5)
 * on a check if it's worth more than making another attack.
 *
 * Strategy:
 * 1. Reserve 1 AP for movement if needed (round 1 for melee)
 * 2. Sort available attacks by raw value descending (best attack first = no penalty)
 * 3. For each attack slot, apply the check penalty
 * 4. Calculate expected damage = rawDamage × hitChance(with penalty)
 * 5. Consider buying ADV for the current attack vs making another attack
 *
 * Returns { actions: [...], focusDamage, spreadDamage, condValue }
 */
function simulateRound(attacks, ap, attackBonus, defense, mode, saveFailChance) {
    if (!attacks || attacks.length === 0 || ap <= 0) {
        return { actions: [], focusDamage: 0, spreadDamage: 0, condValue: 0 };
    }

    // Score all attacks
    const scored = attacks
        .map(a => scoreAttack(a, mode, saveFailChance))
        .filter(a => a.rawValue > 0 && a.cost <= ap);

    if (scored.length === 0) {
        return { actions: [], focusDamage: 0, spreadDamage: 0, condValue: 0 };
    }

    // Sort by raw value per AP (best attacks first to get no penalty)
    scored.sort((a, b) => (b.rawValue / b.cost) - (a.rawValue / a.cost));

    // First pass: greedily fill the round WITHOUT buying ADV.
    // This gives us the baseline "just attack as much as possible" rotation.
    const baseline = greedyFillRound(scored, ap, attackBonus, defense, 0);

    // Second pass: try buying ADV on the first attack (the highest-value one).
    // ADV = roll 2d20 take highest: P(hit) = 1 - (1 - baseHit)^2
    // Cost: 1 extra AP. Worth it if the gain exceeds what that AP would do elsewhere.
    let advResult = null;
    const topAtk = scored[0];
    if (topAtk && topAtk.cost + 1 <= ap) {
        const advDist = hitDistWithAdv(attackBonus, defense);

        // What would we do with that 1 AP instead?
        const remainingAfterADV = ap - topAtk.cost - 1;
        const restWithADV = greedyFillRound(scored, remainingAfterADV, attackBonus, defense, 1);

        // Total with ADV: (topAtk damage × ADV hit chance) + rest
        const advTopDmg = topAtk.effectiveDmg * advDist.total + topAtk.condValue;
        const totalWithADV = advTopDmg + restWithADV.totalSpreadDmg + restWithADV.totalCondValue;
        const focusWithADV = topAtk.damage * advDist.total + topAtk.condValue
                           + restWithADV.totalFocusDmg + restWithADV.totalCondValue;

        if (totalWithADV > baseline.totalSpreadDmg + baseline.totalCondValue) {
            const advAction = {
                name: topAtk.name,
                cost: topAtk.cost + 1,
                rawDamage: topAtk.effectiveDmg,
                expectedDamage: Math.round(topAtk.effectiveDmg * advDist.total * 100) / 100,
                expectedCond: Math.round(topAtk.condValue * 100) / 100,
                hitChance: pct(advDist.total),
                disAdv: 0,
                boughtADV: true,
            };
            advResult = {
                actions: [advAction, ...restWithADV.actions],
                totalFocusDmg: focusWithADV,
                totalSpreadDmg: totalWithADV,
                totalCondValue: topAtk.condValue + restWithADV.totalCondValue,
            };
        }
    }

    // Pick the better option
    const best = (advResult && advResult.totalSpreadDmg > baseline.totalSpreadDmg + baseline.totalCondValue)
        ? advResult
        : baseline;

    return {
        actions: best.actions,
        focusDamage: Math.round(best.totalFocusDmg * 100) / 100,
        spreadDamage: Math.round(best.totalSpreadDmg * 100) / 100,
        condValue: Math.round(best.totalCondValue * 100) / 100,
    };
}

/**
 * Greedy fill: pick the best attack repeatedly, applying MCP (stacking DisADV).
 * startCheckCount lets us chain after an ADV-purchased first attack.
 *
 * Uses true DisADV math: with N stacks, hit chance = baseHit^(N+1).
 * Stops adding attacks when expected damage drops below 1 (AP is better
 * spent on enhancements). The first attack always happens regardless —
 * even at low levels where base damage × hit chance < 1.
 */

function greedyFillRound(scored, ap, attackBonus, defense, startCheckCount) {
    let apLeft = ap;
    let checkCount = startCheckCount;
    const actions = [];
    let totalFocusDmg = 0;
    let totalSpreadDmg = 0;
    let totalCondValue = 0;

    while (apLeft > 0) {
        // checkCount = number of DisADV stacks (0 on first attack, 1 on second, etc.)
        const dist = hitDistWithDisAdv(attackBonus, defense, checkCount);

        // Find the attack that produces most expected damage at this DisADV level
        let bestAtk = null;
        let bestExpected = 0;

        for (const atk of scored) {
            if (atk.cost > apLeft) continue;
            const expected = atk.effectiveDmg * dist.total + atk.condValue;
            if (expected > bestExpected) {
                bestExpected = expected;
                bestAtk = atk;
            }
        }

        // Always allow the first attack; stop later ones when expected < 1
        if (!bestAtk || (actions.length > 0 && bestExpected < 1)) break;

        const expectedDmg = bestAtk.effectiveDmg * dist.total;
        const focusDmg = bestAtk.damage * dist.total; // single-target damage only

        actions.push({
            name: bestAtk.name,
            cost: bestAtk.cost,
            rawDamage: bestAtk.effectiveDmg,
            expectedDamage: Math.round(expectedDmg * 100) / 100,
            expectedCond: Math.round(bestAtk.condValue * 100) / 100,
            hitChance: pct(dist.total),
            disAdv: checkCount,
            boughtADV: false,
        });

        totalFocusDmg += focusDmg;
        totalSpreadDmg += expectedDmg;
        totalCondValue += bestAtk.condValue;
        apLeft -= bestAtk.cost;
        checkCount++;
    }

    return { actions, totalFocusDmg, totalSpreadDmg, totalCondValue };
}

// ──────────────────────────────────────────────
// SURVIVABILITY SIMULATION
// ──────────────────────────────────────────────

/**
 * How long does this creature survive against a PC party?
 *
 * Accounts for:
 * - Hit distribution (normal/heavy/crit) against creature PD & AD
 * - DR only reducing normal hits (heavy/crit bypass)
 * - Resistances halving matching damage types
 * - Vulnerabilities doubling matching damage types
 * - PCs choosing the weaker defense to attack
 */
export function simulateSurvivability(creature, party) {
    if (!party) party = pcProfile(creature.level);

    // PCs attack the weaker defense
    const targetDef = Math.min(creature.pd, creature.ad);
    const dist = hitDistribution(party.attackBonus, targetDef);

    // DR calculation: only normal hits are reduced, heavy/crit bypass DR.
    const drPhysical = creature.dr?.physical || 0;
    const drElemental = creature.dr?.elemental || 0;
    const drMystical = creature.dr?.mystical || 0;
    // Weighted DR based on PC damage type distribution
    const avgDR = drPhysical * PC_DAMAGE_TYPE_SHARES.physical
                + drElemental * (1 - PC_DAMAGE_TYPE_SHARES.physical - 0.04) // non-phys non-mystical
                + drMystical * 0.04; // psychic + umbral share

    // Per-hit damage at each tier.
    // party.damagePerAttack already includes the average heavy/crit bonus
    // (derived from HP / expected hits in 3 rounds). We don't add +1/+2
    // on top — the only reason we track tiers is for DR interaction.
    const baseDmg = party.damagePerAttack;
    const normalDmg = Math.max(0, baseDmg - avgDR); // DR reduces normal hits
    const heavyDmg  = baseDmg;                       // heavy bypasses DR
    const critDmg   = baseDmg;                       // crit bypasses DR

    // Expected damage per attack ROLL (includes miss probability).
    // dist.normal/heavy/crit are per-roll probabilities that sum to dist.total.
    const avgDmgPerAttack = dist.normal * normalDmg
                          + dist.heavy * heavyDmg
                          + dist.crit * critDmg;

    // Average damage per HIT (conditioned on hitting) — for reporting
    const avgDmgPerHit = dist.total > 0 ? avgDmgPerAttack / dist.total : 0;

    // Resistance & vulnerability adjustment
    let resistFactor = 1.0;
    for (const res of (creature.resistances || [])) {
        const share = lookupDamageShare(res);
        resistFactor -= share * 0.5; // resistance = half damage of that type
    }
    // Immunities: full negation of that type's share
    for (const imm of (creature.immunities || [])) {
        const share = lookupDamageShare(imm);
        resistFactor -= share;
    }
    resistFactor = Math.max(0.1, resistFactor); // floor so math doesn't break

    let vulnFactor = 1.0;
    for (const vuln of (creature.vulnerabilities || [])) {
        const share = lookupDamageShare(vuln);
        vulnFactor += share; // vulnerability = double damage of that type (+100%)
    }

    // DPR: attacks per round × expected damage per attack × resistance/vuln
    const dmgPerAttack = avgDmgPerAttack * resistFactor * vulnFactor;
    const dmgPerRoundPerPC = party.attacksPerRound * dmgPerAttack;
    const dmgPerRoundTotal = dmgPerRoundPerPC * party.count;

    // Hits per round (for reporting only)
    const hitsPerRoundPerPC = party.attacksPerRound * dist.total;
    const hitsPerRoundTotal = hitsPerRoundPerPC * party.count;

    // Rounds to kill
    const roundsToKillBy1PC = creature.hp / Math.max(dmgPerRoundPerPC, 0.1);
    const roundsToKillByParty = creature.hp / Math.max(dmgPerRoundTotal, 0.1);

    // Effective HP: how much "raw" damage (no DR/resist) equals this creature's durability.
    // Without DR/resist, effectiveHP = HP. With DR, effectiveHP > HP.
    const rawDmgPerAttack = baseDmg * dist.total; // damage per attack without DR/resist
    const effectiveHP = rawDmgPerAttack > 0
        ? creature.hp * (rawDmgPerAttack / dmgPerAttack)
        : creature.hp;

    return {
        roundsToKill:       Math.round(roundsToKillBy1PC * 100) / 100,
        roundsToKillByParty: Math.round(roundsToKillByParty * 100) / 100,
        effectiveHP:        Math.round(effectiveHP * 10) / 10,
        rawHP:              creature.hp,
        hitChance:          Math.round(dist.total * 100),
        hitsPerRoundPerPC:  Math.round(hitsPerRoundPerPC * 100) / 100,
        hitsPerRoundTotal:  Math.round(hitsPerRoundTotal * 100) / 100,
        dmgPerRoundPerPC:   Math.round(dmgPerRoundPerPC * 100) / 100,
        dmgPerRoundTotal:   Math.round(dmgPerRoundTotal * 100) / 100,
        targetedDefense:    targetDef,
        drReduction:        Math.round(avgDR * 100) / 100,
        resistFactor:       Math.round(resistFactor * 100) / 100,
        vulnFactor:         Math.round(vulnFactor * 100) / 100,
        hitDistribution: {
            miss:   pct(dist.miss),
            normal: pct(dist.normal),
            heavy:  pct(dist.heavy),
            crit:   pct(dist.crit),
        },
    };
}

// ──────────────────────────────────────────────
// THREAT SIMULATION
// ──────────────────────────────────────────────

/**
 * How much damage does this creature deal per round?
 *
 * Simulates 3 rounds individually to account for:
 * - Multiple Check Penalty (stacking DisADV on repeated attack checks)
 * - 1 AP spent on movement in round 1 for melee creatures
 * - Smart ADV purchasing (spend 1 AP for ADV if it outvalues another attack)
 * - Best-first attack ordering (highest damage attack gets no penalty)
 *
 * Returns focus DPR (single target) and spread DPR (all targets).
 */
export function simulateThreat(creature, party) {
    if (!party) party = pcProfile(creature.level);

    const attacks = creature.attacks || buildDefaultAttacks(creature);
    const isRanged = creature.isRanged || false;
    const baseAP = creature.ap || 4;
    const rp = creature.rp || 0;
    const attackBonus = creature.attackBonus || 0;
    const creatureSaveDC = creature.saveDC || getLevelStats(creature.level).SaveDC;

    // Save fail chance for condition valuation
    const saveRollNeeded = creatureSaveDC - party.saveProficiency;
    const saveFailChance = clamp(1 - (21 - saveRollNeeded) / 20, 0.05, 0.95);

    // Simulate 3 rounds, average the results
    const rounds = 3;
    let totalFocusDmg = 0;
    let totalSpreadDmg = 0;
    let totalCondValue = 0;
    const allActions = [];

    for (let r = 0; r < rounds; r++) {
        // Round 1: melee creatures spend 1 AP on movement
        const movementAP = (!isRanged && r === 0) ? 1 : 0;
        const combatAP = baseAP - movementAP;

        // Run focus sim (single-target damage)
        const focusRound = simulateRound(
            attacks, combatAP, attackBonus, party.avgDefense,
            'focus', saveFailChance
        );
        // Run spread sim (multi-target damage)
        const spreadRound = simulateRound(
            attacks, combatAP, attackBonus, party.avgDefense,
            'spread', saveFailChance
        );

        totalFocusDmg += focusRound.focusDamage;
        totalSpreadDmg += spreadRound.spreadDamage;
        totalCondValue += focusRound.condValue;

        if (r === 0) { // capture round 1 actions for display
            allActions.push(...focusRound.actions);
        }
    }

    // RP (Reaction Points): epic/legendary creatures act on other creatures' turns.
    // Each RP = 1 reaction. ~75% of RP translates into offensive attacks.
    // Reactions happen on separate turns, so NO MCP stacking between them.
    // Each reaction attack is a fresh roll with no DisADV.
    let rpDmgPerRound = 0;
    let rpCondPerRound = 0;
    if (rp > 0) {
        const effectiveRPAttacks = rp * 0.75;
        const baseHitDist = hitDistribution(attackBonus, party.avgDefense);

        // Find best 1-AP attack for reactions
        const scored1AP = attacks
            .map(a => scoreAttack(a, 'focus', saveFailChance))
            .filter(a => a.rawValue > 0 && a.cost <= 1);

        if (scored1AP.length > 0) {
            scored1AP.sort((a, b) => b.rawValue - a.rawValue);
            const bestReaction = scored1AP[0];
            rpDmgPerRound = effectiveRPAttacks * bestReaction.damage * baseHitDist.total;
            rpCondPerRound = effectiveRPAttacks * bestReaction.condValue;
        }
    }

    const focusDPR = totalFocusDmg / rounds + rpDmgPerRound;
    const spreadDPR = totalSpreadDmg / rounds + rpDmgPerRound;
    const condDPR = totalCondValue / rounds + rpCondPerRound;

    // Base hit chance (no penalty) for reporting
    const baseHitDist = hitDistribution(attackBonus, party.avgDefense);

    // Rounds to down a PC
    const roundsToDownPC = party.hp / Math.max(focusDPR + condDPR, 0.1);

    return {
        focusDPR:        Math.round(focusDPR * 100) / 100,
        focusCondValue:  Math.round(condDPR * 100) / 100,
        spreadDPR:       Math.round(spreadDPR * 100) / 100,
        roundsToDownPC:  Math.round(roundsToDownPC * 100) / 100,
        effectiveAP:     baseAP,
        rp,
        rpDmgPerRound:   Math.round(rpDmgPerRound * 100) / 100,
        hitChance:       Math.round(baseHitDist.total * 100),
        saveFailChance:  Math.round(saveFailChance * 100),
        focusRotation:   allActions.map(a =>
            `${a.name} (${a.cost} AP, ${a.expectedDamage} dmg, ${a.hitChance}% hit${a.boughtADV ? ', ADV' : ''}${a.disAdv > 0 ? `, ${a.disAdv}x DisADV` : ''})`
        ),
    };
}

// ──────────────────────────────────────────────
// OFFENSE THRESHOLDS
// ──────────────────────────────────────────────

/**
 * Compute level-specific RTD thresholds from the official damage difficulty table.
 *
 * Each difficulty tier (Easy, Medium, Hard, etc.) defines a per-attack damage
 * value at each level. We convert these to expected RTD values:
 *   RTD = pcHP / (attacksPerRound × hitChance × damagePerAttack) × pcCount
 *
 * The boundary between two tiers is the midpoint of their RTD values.
 * This ensures a creature dealing Medium damage rates as Medium offense.
 */
function getOffenseRTDThresholds(level, pcCount, party) {
    const pcHP = party.hp;
    const row = damageDifficultyTable[level] || damageDifficultyTable[20];
    const dprFactor = 2 * 0.65; // 2 attacks/round × 65% hit (PDF baseline)

    // RTD at each difficulty tier (higher = weaker offense)
    const rtdEasy     = pcHP / (dprFactor * row.easy) * pcCount;
    const rtdMedium   = pcHP / (dprFactor * row.medium) * pcCount;
    const rtdHard     = pcHP / (dprFactor * row.hard) * pcCount;
    const rtdVeryHard = pcHP / (dprFactor * row.veryHard) * pcCount;
    const rtdDeadly   = pcHP / (dprFactor * row.deadly) * pcCount;

    // Boundaries: midpoints between adjacent tiers
    return {
        easy:     (rtdEasy + rtdMedium) / 2,       // above this = veryEasy
        medium:   (rtdMedium + rtdHard) / 2,        // above this = easy
        hard:     (rtdHard + rtdVeryHard) / 2,      // above this = medium
        veryHard: (rtdVeryHard + rtdDeadly) / 2,    // above this = hard
        deadly:   rtdDeadly,                         // above this = veryHard, below = deadly
        mediumRTD: rtdMedium,                        // for deviation display
    };
}

// ──────────────────────────────────────────────
// EVALUATION
// ──────────────────────────────────────────────

/**
 * Combines survivability and threat into a difficulty rating and report.
 *
 * Both offense and defense are classified using round-based metrics:
 * - Defense: RTK (rounds for pcCount PCs to kill), target ~3 for Medium.
 * - Offense: RTD (rounds to down a PC, accounting for damage spread across pcCount PCs).
 *
 * Power scaling: elite/apex counts as 2 creatures (faces 2 PCs),
 * legendary counts as 4 (faces 4 PCs).
 */
export function evaluateCreature(creature, party) {
    if (!party) party = pcProfile(creature.level);

    // Power scaling: elite (apex) = 2 creatures, legendary = 4.
    // They face that many PCs and spread damage across that many PCs.
    const pcCount = creature.pcCount || 1;

    const survivability = simulateSurvivability(creature, party);
    const threat = simulateThreat(creature, party);

    // RTK: rounds for pcCount PCs to kill this creature (target ~3 for Medium).
    // Raw RTK is vs 1 PC; divide by pcCount since that many PCs focus it.
    const rtk = survivability.roundsToKill / pcCount;

    // RTD: creature spreads damage across pcCount PCs, so each PC takes 1/pcCount.
    const rtd = threat.roundsToDownPC * pcCount;

    // Classify offense using the official damage difficulty table.
    // Each difficulty tier implies an expected RTD at this level:
    //   RTD = pcHP / (attacksPerRound × hitChance × damagePerAttack) × pcCount
    // We compute these thresholds and classify based on where the actual RTD falls.
    const offenseThresholds = getOffenseRTDThresholds(creature.level, pcCount, party);
    let offenseDifficulty;
    if      (rtd > offenseThresholds.easy)    offenseDifficulty = 'veryEasy';
    else if (rtd > offenseThresholds.medium)  offenseDifficulty = 'easy';
    else if (rtd > offenseThresholds.hard)    offenseDifficulty = 'medium';
    else if (rtd > offenseThresholds.veryHard) offenseDifficulty = 'hard';
    else if (rtd > offenseThresholds.deadly)  offenseDifficulty = 'veryHard';
    else                                       offenseDifficulty = 'deadly';

    // Classify defense: how long does this creature survive?
    // Medium target is ~3 rounds. Tanky = higher difficulty, glass = lower.
    let defenseDifficulty;
    if (rtk < 1.5)       defenseDifficulty = 'veryEasy';
    else if (rtk < 2.5)  defenseDifficulty = 'easy';
    else if (rtk < 3.5)  defenseDifficulty = 'medium';
    else if (rtk < 5)    defenseDifficulty = 'hard';
    else if (rtk < 7)    defenseDifficulty = 'veryHard';
    else                  defenseDifficulty = 'deadly';

    // Overall difficulty: average of offense and defense, biased toward offense
    // (a glass cannon that one-shots PCs is more dangerous than a tanky creature
    // that can't deal damage).
    const offIdx = DIFFICULTY_ORDER.indexOf(offenseDifficulty);
    const defIdx = DIFFICULTY_ORDER.indexOf(defenseDifficulty);
    const avgIdx = Math.round(offIdx * 0.6 + defIdx * 0.4);
    const difficulty = DIFFICULTY_LABELS[DIFFICULTY_ORDER[clamp(avgIdx, 0, DIFFICULTY_ORDER.length - 1)]];

    // Warnings
    const pcLabel = pcCount > 1 ? `${pcCount} PCs` : '1 PC';
    const warnings = [];
    if (rtk < 2) warnings.push(`Dies too fast — won't last 2 rounds vs ${pcLabel}`);
    if (rtk > 7) warnings.push(`Very tanky — takes 7+ rounds for ${pcLabel} to kill`);
    if (rtd < offenseThresholds.deadly) warnings.push('Can nearly one-round a PC');
    if (offenseDifficulty === 'veryEasy' && defenseDifficulty === 'easy')
        warnings.push('Weak on both offense and defense');
    if (survivability.hitChance < 40) warnings.push('PCs struggle to hit — may feel frustrating');
    if (survivability.hitChance > 85) warnings.push('PCs rarely miss — creature feels fragile');
    if (threat.hitChance < 40) warnings.push('Creature struggles to hit PCs');
    if (threat.hitChance > 85) warnings.push('Creature rarely misses — may feel oppressive');

    // Balance summary: how far off from Medium
    const mediumRTK = 3.0;
    const mediumRTD = offenseThresholds.mediumRTD; // level-specific, derived from damage table
    const rtkDeviation = ((rtk - mediumRTK) / mediumRTK * 100);
    const rtdDeviation = ((rtd - mediumRTD) / mediumRTD * 100);

    return {
        difficulty,
        offenseDifficulty: DIFFICULTY_LABELS[offenseDifficulty],
        defenseDifficulty: DIFFICULTY_LABELS[defenseDifficulty],
        warnings,
        survivability,
        threat,
        balance: {
            roundsToKill:     Math.round(rtk * 100) / 100,
            roundsToDownPC:   Math.round(rtd * 100) / 100,
            rtkVsTarget:      `${rtk > mediumRTK ? '+' : ''}${Math.round(rtkDeviation)}%`,
            rtdVsTarget:      `${rtd > mediumRTD ? '+' : ''}${Math.round(rtdDeviation)}%`,
            targetRTK:        mediumRTK,
            targetRTD:        Math.round(mediumRTD * 100) / 100,
            pcCount,
        },
        party: {
            level: party.level,
            count: party.count,
            attackBonus: party.attackBonus,
            damagePerAttack: Math.round(party.damagePerAttack * 100) / 100,
            hp: party.hp,
            avgDefense: party.avgDefense,
        },
    };
}


// ──────────────────────────────────────────────
// CREATURE STATE BRIDGE
// ──────────────────────────────────────────────

// Known condition names for parsing from save.failure text.
const KNOWN_CONDITIONS = Object.keys(CONDITION_VALUES);

/**
 * Converts a UI creature (from createCreatureState / Firestore) into the
 * flat format the sim expects. Handles both in-memory creature state and
 * saved Firestore documents.
 *
 * Usage:
 *   import { creatureFromState, evaluateCreature } from './combatSim.js';
 *   const simCreature = creatureFromState(uiCreature);
 *   const report = evaluateCreature(simCreature);
 */
export function creatureFromState(state) {
    // Support both in-memory state (uppercase fields) and Firestore docs
    // (which nest stats under a `stats` key).
    const stats = state.stats || state;

    const hp  = stats.HP  ?? state.HP  ?? 1;
    const pd  = stats.PD  ?? state.PD  ?? 10;
    const ad  = stats.AD  ?? state.AD  ?? 10;
    const ap  = stats.AP  ?? state.AP  ?? 4;
    const baseDamage = stats.damage ?? state.damage ?? 1;
    const attackBonus = stats.check ?? state.check ?? 0;
    const saveDC = stats.saveDC ?? state.saveDC ?? 10;
    const speed = stats.speed ?? state.speed ?? 5;
    const level = state.level ?? 1;

    // Resistances: UI stores { damage: [...], condition: [...] }, sim wants flat array
    const traits = state.traits || state;
    const resistances = extractDamageTraits(traits.resistances);
    const vulnerabilities = extractDamageTraits(traits.vulnerabilities);
    const immunities = extractDamageTraits(traits.immunities);

    // Convert featureActions into sim attack objects
    const actions = state.featureActions || [];
    const attacks = actions
        .filter(a => !a.isReaction)
        .map(a => convertAction(a, baseDamage))
        .filter(a => a.cost > 0);

    // Determine ranged: if any non-reaction attack has a range description
    // suggesting ranged, treat the creature as ranged
    const isRanged = actions.some(a =>
        !a.isReaction && typeof a.range === 'string' &&
        /\d+\s*(ft|feet|space|spaces)/i.test(a.range) &&
        !/melee/i.test(a.range)
    );

    // Power scaling: how many normal creatures is this worth?
    const power = state.power || 'normal';
    const pcCount = power === 'legendary' ? 4 : power === 'apex' ? 2 : 1;

    // Reaction Points: epic/legendary creatures act on other creatures' turns
    const rp = stats.RP ?? state.RP ?? 0;

    return {
        level,
        hp, pd, ad, ap, speed,
        attackBonus,
        saveDC,
        damage: Math.round(baseDamage * 100) / 100,
        isRanged,
        resistances,
        vulnerabilities,
        immunities,
        attacks: attacks.length > 0 ? attacks : undefined, // undefined → sim uses default
        power,
        pcCount, // how many PCs this creature is expected to fight
        rp,      // reaction points (used on other creatures' turns)
    };
}

/**
 * Extract damage trait strings from the UI's { damage: [], condition: [] } format.
 * Also handles flat arrays (already in sim format).
 */
function extractDamageTraits(traitObj) {
    if (!traitObj) return [];
    if (Array.isArray(traitObj)) return traitObj; // already flat
    return Array.isArray(traitObj.damage) ? [...traitObj.damage] : [];
}

/**
 * Convert a UI featureAction into a sim attack object.
 * Resolves damage segments, parses conditions from save text, detects area attacks.
 */
function convertAction(action, creatureBaseDamage) {
    const cost = action.cost || 0;
    if (cost <= 0) return { cost: 0 };

    // Resolve damage from segments
    const segments = Array.isArray(action.damage) ? action.damage : [];
    let totalDamage = 0;
    for (const seg of segments) {
        if (typeof seg.amount === 'number') {
            totalDamage += seg.amount;
        } else if (seg.useBase) {
            totalDamage += creatureBaseDamage + (seg.modifier || 0);
        } else if (typeof seg.modifier === 'number' && seg.modifier !== 0) {
            totalDamage += seg.modifier;
        }
    }

    // Defense target
    const defense = (action.targetDefense || 'pd').toLowerCase();

    // Parse condition from save.failure text
    let condition = null;
    if (action.save && action.save.failure) {
        condition = parseCondition(action.save.failure);
    }

    // Detect area attacks from target description
    const targetText = (action.target || '').toLowerCase();
    const areaMatch = targetText.match(/(\d+)\s*(?:space|spaces)/i);
    const isArea = /\ball\b|area|cone|sphere|aura|line|cube/i.test(targetText);
    const areaSize = areaMatch ? parseInt(areaMatch[1], 10) : (isArea ? 3 : 0);

    return {
        name: action.name || 'Attack',
        cost,
        damage: totalDamage,
        defense,
        targets: 1,
        area: isArea || areaSize > 0,
        areaSize: areaSize || undefined,
        condition: condition || undefined,
    };
}

/**
 * Try to find a known condition name in a save failure description.
 * e.g. "The target is prone" → "prone"
 */
function parseCondition(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const cond of KNOWN_CONDITIONS) {
        if (lower.includes(cond)) return cond;
    }
    return null;
}

// ──────────────────────────────────────────────
// INTERNAL HELPERS
// ──────────────────────────────────────────────

/**
 * Looks up what share of PC damage a resistance/vulnerability type covers.
 * Normalizes common type names to our share categories.
 */
function lookupDamageShare(type) {
    const t = type.toLowerCase().trim();

    // Physical types
    if (['physical', 'bludgeoning', 'piercing', 'slashing', 'pdr'].includes(t)) {
        return PC_DAMAGE_TYPE_SHARES.physical;
    }
    // Elemental types
    if (['fire'].includes(t))        return PC_DAMAGE_TYPE_SHARES.fire;
    if (['cold'].includes(t))        return PC_DAMAGE_TYPE_SHARES.cold;
    if (['lightning'].includes(t))   return PC_DAMAGE_TYPE_SHARES.lightning;
    if (['corrosion'].includes(t))   return PC_DAMAGE_TYPE_SHARES.corrosion;
    if (['poison'].includes(t))      return PC_DAMAGE_TYPE_SHARES.poison;

    // Mystical types
    if (['radiant'].includes(t))     return PC_DAMAGE_TYPE_SHARES.radiant;
    if (['psychic'].includes(t))     return PC_DAMAGE_TYPE_SHARES.psychic;
    if (['umbral'].includes(t))      return PC_DAMAGE_TYPE_SHARES.umbral;

    // Broad categories
    if (['elemental', 'edr'].includes(t)) {
        return PC_DAMAGE_TYPE_SHARES.fire
             + PC_DAMAGE_TYPE_SHARES.cold
             + PC_DAMAGE_TYPE_SHARES.lightning
             + PC_DAMAGE_TYPE_SHARES.corrosion
             + PC_DAMAGE_TYPE_SHARES.poison;
    }
    if (['mystical', 'mdr'].includes(t)) {
        return PC_DAMAGE_TYPE_SHARES.radiant
             + PC_DAMAGE_TYPE_SHARES.psychic
             + PC_DAMAGE_TYPE_SHARES.umbral;
    }

    return PC_DAMAGE_TYPE_SHARES.other;
}

/**
 * Builds default attacks when none are specified.
 *
 * DC20 low-damage rule: when base damage < 1, attacks cost 2 AP instead of 1.
 * - damage 0.5  → 2 AP attack dealing 0.5 damage
 * - damage 0.25 → 2 AP attack dealing 0.25 damage (+1 on heavy hits via Impact)
 */
function buildDefaultAttacks(creature) {
    const baseDmg = creature.damage || 1;
    const cost = baseDmg < 1 ? 2 : 1;

    return [{
        name: 'Attack',
        cost,
        damage: baseDmg,
        defense: 'pd',
        targets: 1,
        area: false,
    }];
}

/** Percentage formatter */
function pct(val) {
    return Math.round(val * 100);
}

// ──────────────────────────────────────────────
// QUICK TEST / VALIDATION
// ──────────────────────────────────────────────

/**
 * Run against official bestiary creatures.
 * Call evaluateBestiary() to see if official creatures rate as Medium.
 */
export function evaluateBestiary() {
    const creatures = [
        {
            name: 'Wolf', level: 0, hp: 11, pd: 12, ad: 10,
            attackBonus: 3, saveDC: 13, damage: 1, ap: 4, speed: 8,
            attacks: [
                { name: 'Bite', cost: 1, damage: 1, defense: 'pd', targets: 1, condition: 'grappled' },
                { name: 'Tear Apart', cost: 1, damage: 1, defense: 'ad', targets: 1, condition: 'bleeding' },
            ],
        },
        {
            name: 'Brown Bear', level: 2, hp: 17, pd: 9, ad: 11,
            attackBonus: 4, saveDC: 14, damage: 2, ap: 4, speed: 6,
            attacks: [
                { name: 'Bite or Claw', cost: 1, damage: 2, defense: 'pd', targets: 1, condition: 'grappled' },
                { name: 'Swipe', cost: 2, damage: 2, defense: 'ad', targets: 1, area: true, areaSize: 1, condition: 'bleeding' },
            ],
        },
        {
            name: 'Angelic Herald', level: 3, hp: 19, pd: 15, ad: 15,
            attackBonus: 5, saveDC: 15, damage: 1, ap: 4, speed: 6, isRanged: true,
            resistances: ['radiant'],
            vulnerabilities: ['umbral'],
            attacks: [
                { name: 'Spear', cost: 1, damage: 1, defense: 'pd', targets: 1 },
                { name: 'Radiant Burst', cost: 2, damage: 1, defense: 'ad', area: true, areaSize: 2 },
            ],
        },
        {
            name: 'Earth Tortoise', level: 5, hp: 30, pd: 14, ad: 20,
            attackBonus: 7, saveDC: 17, damage: 1, ap: 4, speed: 3,
            dr: { physical: 0, elemental: 0, mystical: 0 },
            resistances: [],
            immunities: [],
            attacks: [
                { name: 'Slam', cost: 1, damage: 1, defense: 'pd', targets: 1, condition: 'prone' },
                { name: 'Stomp', cost: 1, damage: 3, defense: 'ad', targets: 1 },
                { name: 'Rampage', cost: 2, damage: 1, defense: 'ad', area: true, areaSize: 1, condition: 'prone' },
            ],
        },
        {
            name: 'Wyvern', level: 6, hp: 19, pd: 16, ad: 14,
            attackBonus: 7, saveDC: 17, damage: 4, ap: 4, speed: 8, isRanged: false,
            vulnerabilities: ['cold'],
            attacks: [
                { name: 'Bite', cost: 1, damage: 4, defense: 'pd', targets: 1 },
                { name: 'Talon', cost: 1, damage: 3, defense: 'pd', targets: 1, condition: 'grappled' },
                { name: 'Wing Strike', cost: 2, damage: 3, defense: 'ad', area: true, areaSize: 1, condition: 'prone' },
                { name: 'Stinger', cost: 2, damage: 1, defense: 'pd', targets: 1, condition: 'impaired' },
            ],
        },
    ];

    const results = [];
    for (const c of creatures) {
        const report = evaluateCreature(c);
        results.push({
            name: c.name,
            level: c.level,
            difficulty: report.difficulty,
            offenseDifficulty: report.offenseDifficulty,
            defenseDifficulty: report.defenseDifficulty,
            roundsToKill: report.balance.roundsToKill,
            roundsToDownPC: report.balance.roundsToDownPC,
            warnings: report.warnings,
        });
    }
    return results;
}

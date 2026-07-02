import { evaluateCreature, evaluateBestiary, pcProfile, hitDistribution } from '../public/Rules/combatSim.js';

// ─── Tweak this creature and re-run: node scripts/testSim.mjs ───

const myCreature = {
    level: 3,
    hp: 19,
    pd: 13,
    ad: 13,
    attackBonus: 5,
    saveDC: 15,
    damage: 3,
    ap: 4,
    speed: 5,
    isRanged: false,

    // Optional
    dr: { physical: 0, elemental: 0, mystical: 0 },
    resistances: [],        // e.g. ['physical', 'fire']
    vulnerabilities: [],    // e.g. ['cold']
    immunities: [],         // e.g. ['poison']

    // Define attacks (if omitted, gets a default 1 AP melee attack at `damage` value)
    attacks: [
        { name: 'Claw', cost: 1, damage: 3, defense: 'pd', targets: 1 },
        { name: 'Tail Swipe', cost: 2, damage: 2, defense: 'ad', area: true, areaSize: 1, condition: 'prone' },
    ],
};

// ─── Run ───

const report = evaluateCreature(myCreature);

console.log(`\n  DIFFICULTY: ${report.difficulty} (offense: ${report.offenseDifficulty}, defense: ${report.defenseDifficulty})`);
console.log(`  ─────────────────────────────────────`);

console.log(`\n  Survivability (how long it lives vs 1 PC):`);
const s = report.survivability;
console.log(`    Rounds to kill (1 PC):    ${s.roundsToKill}`);
console.log(`    Rounds to kill (party):   ${s.roundsToKillByParty}`);
console.log(`    Effective HP:             ${s.effectiveHP} (raw ${s.rawHP})`);
console.log(`    PC hit chance:            ${s.hitChance}%`);
console.log(`    PC dmg/round (1 PC):      ${s.dmgPerRoundPerPC}`);
console.log(`    Hit tiers:                ${s.hitDistribution.normal}% normal, ${s.hitDistribution.heavy}% heavy, ${s.hitDistribution.crit}% crit`);
if (s.drReduction > 0) console.log(`    DR reduction (avg):       ${s.drReduction}`);
if (s.resistFactor < 1) console.log(`    Resist factor:            ${s.resistFactor}`);
if (s.vulnFactor > 1) console.log(`    Vuln factor:              ${s.vulnFactor}`);

console.log(`\n  Threat (how much damage it deals):`);
const t = report.threat;
console.log(`    Focus DPR (1 target):     ${t.focusDPR}${t.focusCondValue > 0 ? ` + ${t.focusCondValue} condition value` : ''}`);
console.log(`    Spread DPR (all targets): ${t.spreadDPR}`);
console.log(`    Rounds to down 1 PC:      ${t.roundsToDownPC}`);
console.log(`    Creature hit chance:      ${t.hitChance}%`);
console.log(`    Save fail chance:         ${t.saveFailChance}%`);
console.log(`    Round 1 rotation:`);
for (const a of t.focusRotation) {
    console.log(`      ${a}`);
}

console.log(`\n  Balance vs Medium target:`);
console.log(`    RTK: ${report.balance.roundsToKill} (target ${report.balance.targetRTK}, ${report.balance.rtkVsTarget})`);
console.log(`    RTD: ${report.balance.roundsToDownPC} (target ${report.balance.targetRTD}, ${report.balance.rtdVsTarget})`);

if (report.warnings.length > 0) {
    console.log(`\n  Warnings:`);
    for (const w of report.warnings) console.log(`    ⚠ ${w}`);
}

console.log(`\n  Party assumed: ${report.party.count} PCs at level ${report.party.level}`);
console.log(`    PC atk +${report.party.attackBonus}, ${report.party.damagePerAttack} dmg/atk, ${report.party.hp} HP, ${report.party.avgDefense} def`);

// ─── Uncomment to run full bestiary validation ───
// console.log('\n\n═══ BESTIARY VALIDATION ═══');
// const bestiary = evaluateBestiary();
// for (const r of bestiary) {
//     console.log(`  ${r.name.padEnd(18)} Lvl ${r.level} → ${r.difficulty.padEnd(10)} RTK: ${r.roundsToKill}  RTD: ${r.roundsToDownPC}`);
// }

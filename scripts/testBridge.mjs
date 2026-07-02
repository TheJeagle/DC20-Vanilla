import { computeScaledStats } from '../public/CreateCreature/js/createCreatureStats.js';
import { creatureFromState, evaluateCreature } from '../public/Rules/combatSim.js';

// Test the bridge with various role/level combos
const configs = [
    // Baseline: soldier (no type) at various levels
    { level: 'novice', role: 'soldier', type: 'none', label: 'Novice Soldier' },
    { level: 0, role: 'soldier', type: 'none', label: 'L0 Soldier' },
    { level: 1, role: 'soldier', type: 'none', label: 'L1 Soldier' },
    { level: 3, role: 'soldier', type: 'none', label: 'L3 Soldier' },
    { level: 5, role: 'soldier', type: 'none', label: 'L5 Soldier' },
    { level: 10, role: 'soldier', type: 'none', label: 'L10 Soldier' },
    { level: 20, role: 'soldier', type: 'none', label: 'L20 Soldier' },

    // Role comparison at level 5
    { level: 5, role: 'brute',     type: 'none', label: 'L5 Brute' },
    { level: 5, role: 'defender',  type: 'none', label: 'L5 Defender' },
    { level: 5, role: 'leader',   type: 'none', label: 'L5 Leader' },
    { level: 5, role: 'striker',  type: 'none', label: 'L5 Striker' },
    { level: 5, role: 'tactician', type: 'none', label: 'L5 Tactician' },

    // Type bonus at level 5
    { level: 5, role: 'soldier', type: 'dragon', label: 'L5 Dragon' },
    { level: 5, role: 'soldier', type: 'humanoid', label: 'L5 Humanoid' },
    { level: 10, role: 'soldier', type: 'dragon',   label: 'L10 Dragon' },
];

for (const cfg of configs) {
    const cm = cfg.level === 'novice' ? 0 : Math.max(1, Math.ceil(cfg.level / 2));
    const state = computeScaledStats({
        level: cfg.level,
        role: cfg.role,
        power: 'normal',
        size: 'medium',
        type: cfg.type,
        deltas: {},
        combatMastery: cm,
    });
    state.level = cfg.level;

    const simInput = creatureFromState(state);
    const report = evaluateCreature(simInput);

    console.log(`${cfg.label.padEnd(22)} HP:${String(simInput.hp).padStart(3)} PD:${simInput.pd} AD:${simInput.ad} dmg:${simInput.damage} chk:+${simInput.attackBonus} → ${report.difficulty.padEnd(10)} off:${report.offenseDifficulty.padEnd(9)} def:${report.defenseDifficulty.padEnd(9)} RTK:${report.balance.roundsToKill} RTD:${report.balance.roundsToDownPC}`);
}

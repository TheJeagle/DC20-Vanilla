# DC20 Feature Balancing Rules

Reference document for balancing features in `features.json`.
The automated evaluation script (`scripts/evaluateFeatures.mjs`) uses these rules
to compute expected `featureCost` values and flag imbalances.

---

## Core Concepts

### featureCost = Trait Value
Every feature has a `featureCost` — the number of **trait points** a creature spends
to gain that feature. This is the primary power-budget lever.

**1 Trait Point ≈ 2 AP of value** over a 3-round combat.

A powerful 1 AP attack is fine — it just costs more trait points. AP cost controls
*action economy*; featureCost controls *power level*.

### AP Budget
Every creature has **4 AP per turn**. No single action should routinely consume all of it
unless it's an "ultimate" ability.

---

## AP Cost Rules

| Pattern | AP Cost |
|---|---|
| Single-target attack (any power level) | **1 AP** |
| AoE / multi-target attack | **2 AP** |
| Large area attack (5+ spaces) | **3 AP** |
| Ultimate (full-turn, very rare) | **4 AP** |
| Movement + attack combo (Charge, Pounce) | **2 AP** |
| Single-target utility (buff, heal, debuff) | **1 AP** |
| Multi-target / area utility | **2 AP** |
| Large area utility (5+ spaces) | **3 AP** |

**Key principle:** AP cost is determined by *targeting pattern*, not *power level*.
A single-target attack that paralyzes on hit is still 1 AP — the paralyze is paid
for via featureCost.

---

## Damage Rules

### Damage Modifier Baselines
- **Single-target baseline:** modifier **0** (free — no featureCost)
- **AoE baseline:** modifier **-1** (free for AoE attacks)
- Each **+1 modifier** above the free baseline adds **3 featureCost** (DAMAGE_PER_MODIFIER)

### Examples
| Attack Type | Modifier | Above Baseline | Damage featureCost |
|---|---|---|---|
| Single-target, modifier +0 | 0 | 0 | 0 |
| Single-target, modifier +2 | +2 | 2 | 6 |
| AoE, modifier -1 | -1 | 0 | 0 |
| AoE, modifier +0 | 0 | 1 | 3 |
| AoE, modifier +1 | +1 | 2 | 6 |

---

## Condition Rules

### Two Patterns for Conditions on Attacks

**Pattern 1 — Guaranteed condition** (always happens on hit):
- Damage modifier stays at **0** (single) or **-1** (AoE)
- Condition value is added to **featureCost**

**Pattern 2 — Conditional condition** ("might" happen):
- Implement as an **enhancement** on the attack costing **+1 AP**
- Enhancement has **no featureCost** — balanced purely to its AP cost

### Condition Values (per stack)
| Condition | Base Value | Notes |
|---|---|---|
| Bleeding | 1.5 | Stacking |
| Burning | 2.0 | Stacking |
| Stunned | 3.5 | Stacking |
| Slowed | 1.0 | Stacking |
| Hindered | 1.5 | Stacking |
| Exposed | 2.0 | Stacking |
| Dazed | 1.0 | Stacking |
| Disoriented | 1.0 | Stacking |
| Impaired | 1.0 | Stacking |
| Weakened | 1.0 | Stacking |
| Doomed | 2.5 | Stacking |
| Exhaustion | 3.0 | Stacking |
| Blinded | 3.0 | Flat |
| Charmed | 2.5 | Flat |
| Deafened | 1.0 | Flat |
| Frightened | 2.0 | Flat |
| Intimidated | 1.5 | Flat |
| Immobilized | 2.5 | Flat |
| Incapacitated | 6.0 | Flat |
| Paralyzed | 8.0 | Flat |
| Petrified | 9.0 | Flat |
| Prone | 1.5 | Flat |
| Restrained | 3.5 | Flat |
| Taunted | 1.0 | Flat |
| Terrified | 3.5 | Flat |
| Tethered | 1.0 | Flat |
| Unconscious | 10.0 | Flat |

### Duration Multipliers
| Duration | Factor |
|---|---|
| Until end of next turn | ×1.0 |
| For 1 minute (repeatable save) | ×1.5 |
| For 1 minute (no repeat) | ×2.0 |
| Until removed (spend AP) | ×1.5 |
| Until removed (special) | ×4.0 |
| Until end of short rest | ×3.0 |
| Until end of long rest | ×5.0 |

### Save Multipliers
| Save Type | Factor | Reason |
|---|---|---|
| Physical (Mig or Agi) | ×0.5 | Composite — target uses best stat |
| Mental (Int or Cha) | ×0.5 | Composite — target uses best stat |
| Single stat (Mig/Agi/Cha/Int) | ×1.0 | Standard |
| No save (guaranteed) | ×2.0 | Auto-applies |

### Powerful Conditions Cannot Be Enhancements
Conditions with base value ≥ 6 (Incapacitated, Paralyzed, Petrified, Unconscious)
**cannot** be enhancements because no AP cost within the 4 AP budget is high enough
to balance them. These must be baked into the **baseline action** with a high featureCost.

---

## Enhancement Rules

- Enhancements have **NO featureCost** — they are balanced purely by their AP cost
- Maximum enhancement AP = remaining AP after base action (creature has 4 AP total)
- Base action (1-2 AP) + enhancement (1-2 AP) = 2-4 AP total
- Enhancement conditions must be priceable within that budget

---

## Modifier Feature Costs

Modifier features (stat bonuses, resistances, immunities) use these scales:

| Stat | Cost per Point |
|---|---|
| HP | 0.5 per point |
| PD (Physical Defense) | 2.0 per point |
| AD (Arcane Defense) | 2.0 per point |
| Speed | 1.0 per point |
| Damage | 3.0 per point |

| Defensive Type | Cost per Entry |
|---|---|
| Damage resistance | 1.0 per type |
| Damage immunity | 3.0 per type |
| Damage vulnerability | -1.5 per type |
| Condition immunity | 1.0 per condition |
| Condition resistance (ADV) | 0.5 per condition |

### Flag: Too Many Resistances
Features with more than **4 damage resistances** and **no vulnerabilities** are flagged
for review — consider adding a vulnerability to offset.

---

## Reaction Tax

Reaction-based features add **+1.0 featureCost** because reactions are a limited
resource (typically 1/round) and represent off-turn power.

---

## AP Scaling Formula

When an action's AP cost differs from the standard for its targeting pattern,
the action's computed value is scaled:

```
apFactor = normalAP / actualAP
actionCost = (damageCost + conditionCost) × apFactor
```

Where `normalAP` = 1 for single-target, 2 for AoE.

**Example:** A single-target attack at 2 AP with modifier +2 (damageCost 6):
- apFactor = 1/2 = 0.5
- Scaled actionCost = 6 × 0.5 = 3 featureCost
- This attack is **undercosted** relative to a 1 AP version because you're
  spending twice the action economy for the same damage.

---

## Full featureCost Formula

```
featureCost = round(damageCost + conditionCost + modifierCost + reactionTax)
```

Where:
- **damageCost** = Σ(modifier above baseline × DAMAGE_PER_MODIFIER) × apFactor
- **conditionCost** = Σ(conditionBaseValue × stacks × durationFactor × saveFactor) × apFactor
- **modifierCost** = Σ(statBonus × statScale) + resistances + immunities - vulnerabilities
- **reactionTax** = 1.0 if isReaction, else 0

### Evaluation Thresholds
- **OK:** |computed - stored| ≤ 0.5
- **UNDERPRICED:** computed > stored + 0.5 (feature is too cheap)
- **OVERPRICED:** computed < stored - 0.5 (feature is too expensive)

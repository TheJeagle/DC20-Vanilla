"""
Update features.json:
1. Fix save attribute distribution: mostly Physical/Mental, ~15-20% attribute saves
2. Add new features to cover all role/type × category gaps
"""
import json, copy

with open('/home/user/DC20-Vanilla/public/data/features.json') as f:
    features = json.load(f)

# ─────────────────────────────────────────────────
# STEP 1: Fix existing save distributions
# ─────────────────────────────────────────────────
save_changes = {
    # KEEP as attribute (4 total — specific/niche attribute tests)
    "garrote":       "Agi",      # agility to wriggle out of grip
    "fishhook-shot": "Mig",      # strength to resist being yanked
    "mindbreak":     "Int",      # intelligence-specific mental resistance
    "mind-blast":    "Int",      # intelligence-specific psionic resistance
    # Change to Physical (body/force effects)
    "melee-bash":      "Physical",
    "covering-fire":   "Physical",
    "heavy-strike":    "Physical",
    "tremor-strike":   "Physical",
    "explosive-arrow": "Physical",
    "shield-slam":     "Physical",
    "poison-strike":   "Physical",
    "fire-breath":     "Physical",
    "hellfire-bolt":   "Physical",
    "hellfire-burst":  "Physical",
    "pounce":          "Physical",
    "venomous-bite":   "Physical",
    "tentacle-grab":   "Physical",
    "vine-grapple":    "Physical",
    "thorn-lash":      "Physical",
    "boulder-throw":   "Physical",
    "stomp":           "Physical",
    "pseudopod":       "Physical",
    "acid-splash":     "Physical",
    "thornwhip":       "Physical",
    # Change to Mental (sensory/magical/mind conditions)
    "charged-radiance":  "Mental",
    "frost-nova":        "Mental",  # magical cold slowing
    "taunt-strike":      "Mental",  # charm/mental compulsion
    "shadow-pounce":     "Mental",  # daze component is the key
    "binding-bolt":      "Mental",  # magical binding, not raw physical
    "sacred-flame":      "Mental",  # divine blindness
    "divine-judgment":   "Mental",  # radiant blindness
    "engulf":            "Mental",  # panic of being absorbed
    "moonfire-burst":    "Mental",  # fey magical blindness
}

for f in features:
    fid = f.get("id", "")
    if fid in save_changes:
        effects = f.get("effects", {})
        if isinstance(effects, dict) and "save" in effects and isinstance(effects["save"], dict):
            effects["save"]["attribute"] = save_changes[fid]

# ─────────────────────────────────────────────────
# STEP 2: New features
# ─────────────────────────────────────────────────
new_features = [

  # ══════════════════════════════════════════════
  # MARTIAL PD ATTACKS
  # ══════════════════════════════════════════════
  {
    "id": "quick-strike",
    "type": "action-attack",
    "name": "Quick Strike",
    "featureDescription": "A swift, unpredictable melee attack that exploits momentary openings.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You dart forward and land a precise, rapid strike before the target can react.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Piercing"}]
    },
    "tags": ["role/skirmisher","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "empowering-blow",
    "type": "action-attack",
    "name": "Empowering Blow",
    "featureDescription": "A powerful strike that rallies allies and opens a path for them.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You drive your weapon into the enemy with enough force to inspire nearby allies.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Bludgeoning"}]
    },
    "tags": ["role/support","role/leader","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "iron-punch",
    "type": "action-attack",
    "name": "Iron Punch",
    "featureDescription": "A powerful hammering strike with a metal fist or weapon.",
    "featureCost": 0,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You drive an armored fist or reinforced limb into the target with crushing force.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Bludgeoning"}]
    },
    "tags": ["creature/construct","creature/humanoid","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/0"]
  },
  {
    "id": "bone-claw",
    "type": "action-attack",
    "name": "Bone Claw",
    "featureDescription": "A raking strike with sharpened bone or spectral claws.",
    "featureCost": 0,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You lash out with skeletal claws, raking across the target's flesh.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Slashing"}],
      "save": {"attribute": "Physical", "failure": "The target gains the Bleeding condition."}
    },
    "tags": ["creature/undead","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/0","status/bleeding"]
  },
  {
    "id": "barbed-grasp",
    "type": "action-attack",
    "name": "Barbed Grasp",
    "featureDescription": "A barbed or clawed strike that digs in and holds.",
    "featureCost": 0,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You rake the target with barbed claws, tearing deep and anchoring to them.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Piercing"}]
    },
    "tags": ["creature/fiend","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/0"]
  },
  {
    "id": "elemental-fist",
    "type": "action-attack",
    "name": "Elemental Fist",
    "featureDescription": "A melee strike charged with raw elemental energy.",
    "featureCost": 0,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You slam a limb crackling with elemental power into the target. Change the damage type to match this elemental's element.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Fire"}]
    },
    "tags": ["creature/elemental","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/0"]
  },
  {
    "id": "blessed-strike",
    "type": "action-attack",
    "name": "Blessed Strike",
    "featureDescription": "A melee strike channeling divine power against the impure.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You channel celestial energy through your weapon, striking with holy precision.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Radiant"}],
      "save": {"attribute": "Mental", "failure": "The target is Blinded until the start of your next turn."}
    },
    "tags": ["creature/celestial","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/1","status/blinded"]
  },
  {
    "id": "fey-blade",
    "type": "action-attack",
    "name": "Fey Blade",
    "featureDescription": "A swift strike with a weapon imbued with fey glamour.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "Your blade flickers with illusory light as it slips past the target's defenses.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Slashing"}]
    },
    "tags": ["creature/fey","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "titanic-swing",
    "type": "action-attack",
    "name": "Titanic Swing",
    "featureDescription": "A massive overhead blow that can crush the sturdiest foe.",
    "featureCost": 0,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You bring your massive weapon down with the full weight of your towering frame.",
      "damageSegments": [{"useBase": True, "modifier": 1, "type": "Bludgeoning"}]
    },
    "tags": ["creature/giant","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/0"]
  },
  {
    "id": "engulf-touch",
    "type": "action-attack",
    "name": "Engulf Touch",
    "featureDescription": "Reach out and begin dissolving a creature within your mass.",
    "featureCost": 0,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "A pseudopod of corrosive ooze shoots forward, pressing against the target and beginning to dissolve it.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Acid"}]
    },
    "tags": ["creature/ooze","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/0"]
  },

  # ══════════════════════════════════════════════
  # MARTIAL AD ATTACKS
  # ══════════════════════════════════════════════
  {
    "id": "disarming-strike",
    "type": "action-attack",
    "name": "Disarming Strike",
    "featureDescription": "A precise blow aimed at stripping the target's guard.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You strike at the target's weapon arm or shield, bypassing their defenses.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Bludgeoning"}],
      "save": {"attribute": "Physical", "failure": "The target drops one held item of your choice."}
    },
    "tags": ["role/skirmisher","attack/martial","attack/single-target","target/ad","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "guardian-slam",
    "type": "action-attack",
    "name": "Guardian Slam",
    "featureDescription": "A powerful body check that breaks through an enemy's defenses.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You shoulder-check the target, using your bulk to force through their guard.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Bludgeoning"}],
      "save": {"attribute": "Physical", "failure": "The target is pushed 1 Space away from you."}
    },
    "tags": ["role/support","role/leader","attack/martial","attack/single-target","target/ad","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "savage-bite",
    "type": "action-attack",
    "name": "Savage Bite",
    "featureDescription": "A ferocious bite that tears through armor and scale.",
    "featureCost": 0,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You lunge forward and drive your jaws into the target with primal ferocity.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Piercing"}]
    },
    "tags": ["creature/beast","creature/dragon","attack/martial","attack/single-target","target/ad","ap-cost/1","feature-cost/0"]
  },
  {
    "id": "spectral-slam",
    "type": "action-attack",
    "name": "Spectral Slam",
    "featureDescription": "A necrotic blow that passes through conventional defenses.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "Ghostly energy trails behind your limb as it passes partway through the target's body.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Necrotic"}],
      "save": {"attribute": "Mental", "failure": "The target is Frightened of you until the end of its next turn."}
    },
    "tags": ["creature/undead","attack/martial","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/frightened"]
  },
  {
    "id": "infernal-crush",
    "type": "action-attack",
    "name": "Infernal Crush",
    "featureDescription": "A crushing hellfire-wreathed blow that sears through armor.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You drive a fist or weapon wreathed in hellfire into the target, burning through their defenses.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Fire"}],
      "save": {"attribute": "Physical", "failure": "The target gains the Burning condition."}
    },
    "tags": ["creature/fiend","attack/martial","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/burning"]
  },
  {
    "id": "piston-strike",
    "type": "action-attack",
    "name": "Piston Strike",
    "featureDescription": "A pneumatic or mechanically-enhanced punch driven by hydraulic force.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "Pistons fire as your arm drives forward, smashing through the target's defenses.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Bludgeoning"}],
      "save": {"attribute": "Physical", "failure": "The target is knocked Prone."}
    },
    "tags": ["creature/construct","creature/humanoid","attack/martial","attack/single-target","target/ad","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "root-slam",
    "type": "action-attack",
    "name": "Root Slam",
    "featureDescription": "A powerful branch or root slams into the target from below.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "2 Spaces",
      "actionDescription": "A thick root erupts from the ground and drives upward into the target.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Bludgeoning"}],
      "save": {"attribute": "Physical", "failure": "The target is knocked Prone."}
    },
    "tags": ["creature/plant","attack/martial","attack/single-target","target/ad","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "crushing-tendril",
    "type": "action-attack",
    "name": "Crushing Tendril",
    "featureDescription": "A writhing, alien appendage wraps and compresses the target.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "A tentacle or fleshy appendage snaps around the target and squeezes.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Bludgeoning"}],
      "save": {"attribute": "Physical", "failure": "The target is Grappled."}
    },
    "tags": ["creature/aberration","attack/martial","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/grappled"]
  },
  {
    "id": "radiant-smash",
    "type": "action-attack",
    "name": "Radiant Smash",
    "featureDescription": "A celestial blow that erupts in blinding holy light on impact.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "You slam your weapon into the target, releasing a burst of divine radiance.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Radiant"}],
      "save": {"attribute": "Mental", "failure": "The target is Blinded until the start of your next turn."}
    },
    "tags": ["creature/celestial","attack/martial","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/blinded"]
  },
  {
    "id": "fey-slam",
    "type": "action-attack",
    "name": "Fey Slam",
    "featureDescription": "A disorienting fey-touched blow that twists reality briefly.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "1 Space",
      "actionDescription": "Your strike is accompanied by a flash of wild fey magic that scrambles the target's senses.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Force"}],
      "save": {"attribute": "Mental", "failure": "The target is Disoriented until the end of its next turn."}
    },
    "tags": ["creature/fey","attack/martial","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/disoriented"]
  },

  # ══════════════════════════════════════════════
  # SPELL PD ATTACKS
  # ══════════════════════════════════════════════
  {
    "id": "soul-bolt",
    "type": "action-attack",
    "name": "Soul Bolt",
    "featureDescription": "Launch a concentrated bolt of necrotic or life-force energy.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "6 Spaces",
      "actionDescription": "You fire a crackling bolt of raw spiritual energy that homes in on living or undead targets.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Necrotic"}],
      "save": {"attribute": "Mental", "failure": "The target is Frightened of you until the end of its next turn."}
    },
    "tags": ["role/brute","role/defender","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/1","status/frightened"]
  },
  {
    "id": "shadow-dart",
    "type": "action-attack",
    "name": "Shadow Dart",
    "featureDescription": "Fling a bolt of shadow-stuff that tracks movement.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "6 Spaces",
      "actionDescription": "A barb of living shadow springs from the darkness and streaks toward your target.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Necrotic"}]
    },
    "tags": ["role/skirmisher","role/lurker","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "command-bolt",
    "type": "action-attack",
    "name": "Command Bolt",
    "featureDescription": "A bolt of energy fired to open up opportunities for your forces.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "8 Spaces",
      "actionDescription": "You fire a precise bolt that marks the target, allowing your allies to exploit the opening.",
      "damageSegments": [{"useBase": True, "modifier": -1, "type": "Force"}],
      "save": {"attribute": "Cha", "failure": "The target grants Combat Advantage until the start of your next turn."}
    },
    "tags": ["role/leader","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "natures-arrow",
    "type": "action-attack",
    "name": "Nature's Arrow",
    "featureDescription": "A hardened thorn or bone shard launched with primal magic.",
    "featureCost": 0,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "5 Spaces",
      "actionDescription": "You launch a magically-hardened natural projectile at your foe.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Piercing"}]
    },
    "tags": ["creature/beast","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/0"]
  },
  {
    "id": "dragon-bolt",
    "type": "action-attack",
    "name": "Dragon Bolt",
    "featureDescription": "A focused lance of elemental energy fired from the throat.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "8 Spaces",
      "actionDescription": "You unleash a tight beam of elemental force from your throat. Change the damage type to match your breath weapon.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Fire"}]
    },
    "tags": ["creature/dragon","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "hex-shot",
    "type": "action-attack",
    "name": "Hex Shot",
    "featureDescription": "A cursed bolt that weakens the target's defenses.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "6 Spaces",
      "actionDescription": "You fire a bolt woven with a weakening hex that bypasses natural armor.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Necrotic"}],
      "save": {"attribute": "Mental", "failure": "The target is Hindered until the end of its next turn."}
    },
    "tags": ["creature/humanoid","creature/fiend","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/1","status/hindered"]
  },
  {
    "id": "spectral-bolt",
    "type": "action-attack",
    "name": "Spectral Bolt",
    "featureDescription": "A bolt of necromantic energy drawn from the creature's deathless state.",
    "featureCost": 0,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "6 Spaces",
      "actionDescription": "You hurl a coil of spectral energy ripped from your own undead essence.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Necrotic"}],
      "save": {"attribute": "Mental", "failure": "The target is Frightened of you until the end of its next turn."}
    },
    "tags": ["creature/undead","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/0","status/frightened"]
  },
  {
    "id": "energy-shot",
    "type": "action-attack",
    "name": "Energy Shot",
    "featureDescription": "A bolt of stored arcane energy discharged from an internal capacitor.",
    "featureCost": 0,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "6 Spaces",
      "actionDescription": "Internal mechanisms charge and fire a burst of electrical or arcane energy.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Lightning"}]
    },
    "tags": ["creature/construct","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/0"]
  },
  {
    "id": "psionic-dart",
    "type": "action-attack",
    "name": "Psionic Dart",
    "featureDescription": "A sliver of pure psychic force driven by focused alien thought.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "6 Spaces",
      "actionDescription": "You drive a needle of concentrated psychic energy into the target's nervous system.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Psychic"}],
      "save": {"attribute": "Mental", "failure": "The target is Disoriented until the end of its next turn."}
    },
    "tags": ["creature/aberration","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/1","status/disoriented"]
  },
  {
    "id": "rock-shard",
    "type": "action-attack",
    "name": "Rock Shard",
    "featureDescription": "Hurl a fist-sized chunk of stone with enough force to punch through armor.",
    "featureCost": 0,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "6 Spaces",
      "actionDescription": "You wrench a chunk of stone or earth free and hurl it with magically-augmented strength.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Bludgeoning"}]
    },
    "tags": ["creature/giant","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/0"]
  },
  {
    "id": "acid-shot",
    "type": "action-attack",
    "name": "Acid Shot",
    "featureDescription": "Spit a pressurized glob of dissolving acid.",
    "featureCost": 0,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "a creature",
      "range": "4 Spaces",
      "actionDescription": "You expel a pressurized stream of corrosive acid that splashes across the target.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Acid"}],
      "save": {"attribute": "Physical", "failure": "The target's PD is reduced by 1 until the end of its next turn."}
    },
    "tags": ["creature/ooze","attack/spellcaster","attack/single-target","target/pd","ap-cost/1","feature-cost/0"]
  },

  # ══════════════════════════════════════════════
  # SPELL AD ATTACKS
  # ══════════════════════════════════════════════
  {
    "id": "arcane-blast",
    "type": "action-attack",
    "name": "Arcane Blast",
    "featureDescription": "A concentrated burst of arcane force that bypasses magical defenses.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "5 Spaces",
      "actionDescription": "You release a short-range explosion of raw magical force that shatters arcane wards.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Force"}],
      "save": {"attribute": "Mental", "failure": "The target is Dazed until the end of its next turn."}
    },
    "tags": ["role/brute","role/defender","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/dazed"]
  },
  {
    "id": "shadow-curse",
    "type": "action-attack",
    "name": "Shadow Curse",
    "featureDescription": "A hex of shadow magic that drapes over the target's senses.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "6 Spaces",
      "actionDescription": "You weave shadow magic around the target, dragging at their perception and will.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Necrotic"}],
      "save": {"attribute": "Mental", "failure": "The target is Blinded until the start of your next turn."}
    },
    "tags": ["role/skirmisher","role/lurker","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/blinded"]
  },
  {
    "id": "battle-hex",
    "type": "action-attack",
    "name": "Battle Hex",
    "featureDescription": "A swift hex that weakens a target so your allies can exploit the opening.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "8 Spaces",
      "actionDescription": "You curse the target with a combat hex, lowering their defenses for your forces.",
      "damageSegments": [{"useBase": True, "modifier": -1, "type": "Necrotic"}],
      "save": {"attribute": "Cha", "failure": "The target grants Combat Advantage to all allies until the start of your next turn."}
    },
    "tags": ["role/leader","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "primal-surge",
    "type": "action-attack",
    "name": "Primal Surge",
    "featureDescription": "A surge of natural energy erupts from the creature, striking all nearby.",
    "featureCost": 2,
    "actionType": "Area Spell Attack",
    "effects": {
      "cost": 2,
      "targetDefense": "AD",
      "target": "a 2 Space Burst",
      "range": "Self",
      "actionDescription": "A wave of wild natural energy bursts outward from your body, slamming into all nearby creatures.",
      "damageSegments": [{"useBase": True, "modifier": -1, "type": "Thunder"}],
      "save": {"attribute": "Physical", "failure": "The target is knocked Prone."}
    },
    "tags": ["creature/beast","creature/plant","attack/spellcaster","attack/aoe","target/ad","ap-cost/2","feature-cost/2"]
  },
  {
    "id": "command-curse",
    "type": "action-attack",
    "name": "Command Curse",
    "featureDescription": "Lay a compulsion curse on a nearby creature.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "5 Spaces",
      "actionDescription": "You speak a word of power that bypasses the target's mental defenses, compelling them.",
      "damageSegments": [{"useBase": True, "modifier": -1, "type": "Psychic"}],
      "save": {"attribute": "Mental", "failure": "The target is Charmed by you until the end of your next turn."}
    },
    "tags": ["creature/humanoid","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/charmed"]
  },
  {
    "id": "system-shock",
    "type": "action-attack",
    "name": "System Shock",
    "featureDescription": "Discharge a surge of energy that overwhelms the target's arcane defenses.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "a creature",
      "range": "5 Spaces",
      "actionDescription": "An electromagnetic surge bypasses magical shielding and disrupts the target.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Lightning"}],
      "save": {"attribute": "Mental", "failure": "The target is Stunned until the start of your next turn."}
    },
    "tags": ["creature/construct","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/stunned"]
  },
  {
    "id": "seismic-wave",
    "type": "action-attack",
    "name": "Seismic Wave",
    "featureDescription": "Slam the ground and send a shockwave through a wide area.",
    "featureCost": 2,
    "actionType": "Area Spell Attack",
    "effects": {
      "cost": 2,
      "targetDefense": "AD",
      "target": "a 3 Space Line",
      "range": "Self",
      "actionDescription": "You slam the earth with titanic force, sending a fissure and wave of pressure in a line.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Bludgeoning"}],
      "save": {"attribute": "Physical", "failure": "The target is knocked Prone."}
    },
    "tags": ["creature/giant","attack/spellcaster","attack/aoe","target/ad","ap-cost/2","feature-cost/2"]
  },
  {
    "id": "acid-wave",
    "type": "action-attack",
    "name": "Acid Wave",
    "featureDescription": "Project a wave of corrosive mass that dissolves everything it touches.",
    "featureCost": 2,
    "actionType": "Area Spell Attack",
    "effects": {
      "cost": 2,
      "targetDefense": "AD",
      "target": "a 2 Space Cone",
      "range": "Self",
      "actionDescription": "You surge forward and project a mass of caustic material across a wide area.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Acid"}],
      "save": {"attribute": "Physical", "failure": "The target's AD is reduced by 1 until the end of its next turn."}
    },
    "tags": ["creature/ooze","attack/spellcaster","attack/aoe","target/ad","ap-cost/2","feature-cost/2"]
  },

  # ══════════════════════════════════════════════
  # PASSIVE MODIFICATIONS (type=modifier)
  # ══════════════════════════════════════════════
  {
    "id": "shadow-veil",
    "type": "modifier",
    "name": "Shadow Veil",
    "featureDescription": "Living shadow clings to this creature, making it harder to pin down.",
    "featureCost": 1,
    "effects": {"pd": 1, "ad": 1},
    "tags": ["role/skirmisher","role/lurker","feature-cost/1"]
  },
  {
    "id": "ranged-mastery",
    "type": "modifier",
    "name": "Ranged Mastery",
    "featureDescription": "Years of ranged combat have hardened this creature's reflexes and focus.",
    "featureCost": 1,
    "effects": {"pd": 1, "ad": 2},
    "tags": ["role/artillerist","feature-cost/1"]
  },
  {
    "id": "inspiring-presence",
    "type": "modifier",
    "name": "Inspiring Presence",
    "featureDescription": "The creature's commanding aura bolsters nearby allies.",
    "featureCost": 2,
    "effects": {"hp": 5, "ad": 1},
    "tags": ["role/support","role/leader","feature-cost/2"]
  },
  {
    "id": "arcane-mind",
    "type": "modifier",
    "name": "Arcane Mind",
    "featureDescription": "A razor-sharp arcane intellect shields this creature against mental intrusion.",
    "featureCost": 1,
    "effects": {"ad": 2},
    "tags": ["role/controller","feature-cost/1"]
  },
  {
    "id": "elemental-body",
    "type": "modifier",
    "name": "Elemental Body",
    "featureDescription": "This creature's elemental nature grants inherent resistance to its own element.",
    "featureCost": 2,
    "effects": {
      "pd": 1,
      "resistances": {"damage": ["Fire"]}
    },
    "tags": ["creature/elemental","feature-cost/2"]
  },

  # ══════════════════════════════════════════════
  # PASSIVE EFFECTS (type=passive)
  # ══════════════════════════════════════════════
  {
    "id": "automaton-mind",
    "type": "passive",
    "name": "Automaton Mind",
    "featureDescription": "A purely mechanical or arcane intellect immune to biological mental effects.",
    "featureCost": 1,
    "effects": {
      "text": "This creature is immune to the Charmed, Frightened, and Poisoned conditions. It cannot be put to sleep by magical means."
    },
    "tags": ["creature/construct","feature-cost/1"]
  },

  # ══════════════════════════════════════════════
  # DEFENSIVE REACTIONS — ROLES
  # ══════════════════════════════════════════════
  {
    "id": "instinctive-guard",
    "type": "action-attack",
    "name": "Instinctive Guard",
    "featureDescription": "Raise a guard automatically when danger is sensed.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When a creature targets you with an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "You instinctively raise your guard, adding +2 to your PD until the start of your next turn."
    },
    "tags": ["role/brute","role/defender","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "evasive-maneuver",
    "type": "action-attack",
    "name": "Evasive Maneuver",
    "featureDescription": "Snap into a dodge the instant danger registers.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are targeted by a melee attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "You move 1 Space away from the attacker and add +2 to your PD against the triggering attack."
    },
    "tags": ["role/skirmisher","role/lurker","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "protective-stance",
    "type": "action-attack",
    "name": "Protective Stance",
    "featureDescription": "Snap into a defensive stance that guards both you and an ally.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you or an ally within 1 Space is targeted by an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself or an adjacent ally",
      "range": "1 Space",
      "actionDescription": "You step in front of an ally or raise your guard, granting +2 PD to the target against the triggering attack."
    },
    "tags": ["role/artillerist","role/support","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "commanding-parry",
    "type": "action-attack",
    "name": "Commanding Parry",
    "featureDescription": "Parry an incoming attack and redirect the battle momentum.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are hit by a melee attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "You parry the blow and turn the attacker's force against them, reducing the damage by your Mig modifier (minimum 1)."
    },
    "tags": ["role/leader","role/controller","ap-cost/1","feature-cost/1"]
  },

  # ══════════════════════════════════════════════
  # DEFENSIVE REACTIONS — TYPES
  # ══════════════════════════════════════════════
  {
    "id": "predatory-instinct",
    "type": "action-attack",
    "name": "Predatory Instinct",
    "featureDescription": "Pure animal instinct causes the beast to flinch away from danger.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are targeted by an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "Animal instinct takes over — you twist away, adding +2 to your PD against the triggering attack."
    },
    "tags": ["creature/beast","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "scale-guard",
    "type": "action-attack",
    "name": "Scale Guard",
    "featureDescription": "Draw in and tighten ancient scales to deflect blows.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are hit by an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "You contract your hide-thick scales against the blow, reducing the damage taken by 3."
    },
    "tags": ["creature/dragon","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "necrotic-shroud",
    "type": "action-attack",
    "name": "Necrotic Shroud",
    "featureDescription": "Deathly energy surges to absorb an incoming strike.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are hit by an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "A wreath of necromantic force absorbs part of the blow, reducing the damage taken by 4."
    },
    "tags": ["creature/undead","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "infernal-ward-reaction",
    "type": "action-attack",
    "name": "Infernal Ward",
    "featureDescription": "Hellfire flares up as a barrier when the creature is struck.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are hit by a melee attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "Hellfire erupts around you as a ward, reducing the damage taken by 3 and potentially burning the attacker."
    },
    "tags": ["creature/fiend","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "mechanical-guard",
    "type": "action-attack",
    "name": "Mechanical Guard",
    "featureDescription": "Armor plates or shields snap into place automatically.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are targeted by an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "Internal mechanisms deploy protective plating, adding +2 to both PD and AD until the start of your next turn."
    },
    "tags": ["creature/construct","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "elemental-aegis",
    "type": "action-attack",
    "name": "Elemental Aegis",
    "featureDescription": "Raw elemental force forms a barrier against incoming damage.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you take damage",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "Elemental energy surges through you, reducing the damage taken by 3. Change the energy type to match this elemental's element."
    },
    "tags": ["creature/elemental","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "vine-barrier",
    "type": "action-attack",
    "name": "Vine Barrier",
    "featureDescription": "Dense vegetation springs up to intercept incoming attacks.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are targeted by a ranged attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "A wall of vines and branches erupts from the ground to intercept the attack, adding +3 to your PD against the triggering attack."
    },
    "tags": ["creature/plant","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "alien-reflex",
    "type": "action-attack",
    "name": "Alien Reflex",
    "featureDescription": "Non-Euclidean senses perceive attacks before they arrive.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are targeted by an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "Your alien perception reads the attack before it lands, adding +3 to your PD against the triggering attack."
    },
    "tags": ["creature/aberration","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "celestial-ward",
    "type": "action-attack",
    "name": "Celestial Ward",
    "featureDescription": "Divine light forms a shield against incoming harm.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you or an ally within 3 Spaces is targeted by an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "yourself or a nearby ally",
      "range": "3 Spaces",
      "actionDescription": "A shell of divine radiance envelops the target, adding +2 to their AD against the triggering attack."
    },
    "tags": ["creature/celestial","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "fey-sidestep",
    "type": "action-attack",
    "name": "Fey Sidestep",
    "featureDescription": "A flash of fey magic teleports the creature a short distance.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are targeted by an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "You vanish in a shower of sparks and reappear up to 2 Spaces away, potentially causing the triggering attack to miss."
    },
    "tags": ["creature/fey","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "stone-defense",
    "type": "action-attack",
    "name": "Stone Defense",
    "featureDescription": "The giant braces and tightens its stone-like hide.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are hit by an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "You brace with the solidity of a mountain, reducing the damage taken by 5."
    },
    "tags": ["creature/giant","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "adaptive-membrane",
    "type": "action-attack",
    "name": "Adaptive Membrane",
    "featureDescription": "The ooze's body reshapes to flow around incoming attacks.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are hit by a melee attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "Your amorphous body deforms around the attack, reducing the damage taken by 3."
    },
    "tags": ["creature/ooze","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "combat-instinct",
    "type": "action-attack",
    "name": "Combat Instinct",
    "featureDescription": "Trained reflexes bring up a guard without conscious thought.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you are hit by an attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "yourself",
      "range": "Self",
      "actionDescription": "Muscle memory snaps a guard into place, reducing the damage taken by 2."
    },
    "tags": ["creature/humanoid","ap-cost/1","feature-cost/1"]
  },

  # ══════════════════════════════════════════════
  # OFFENSIVE REACTIONS — ROLES
  # ══════════════════════════════════════════════
  {
    "id": "savage-counter",
    "type": "action-attack",
    "name": "Savage Counter",
    "featureDescription": "A brutal instant counterattack the moment the creature is hit.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When a creature within 1 Space hits you with a melee attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "the triggering creature",
      "range": "1 Space",
      "actionDescription": "Pain fuels a savage riposte — you immediately lash back at the attacker.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Slashing"}]
    },
    "tags": ["role/brute","role/skirmisher","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "arcane-riposte",
    "type": "action-attack",
    "name": "Arcane Riposte",
    "featureDescription": "Counter an attacker with a burst of retaliatory arcane energy.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "isReaction": True,
    "reactionTrigger": "When a creature deals damage to you",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "the triggering creature",
      "range": "5 Spaces",
      "actionDescription": "You channel your frustration into a burst of arcane power directed at your attacker.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Force"}]
    },
    "tags": ["role/controller","role/leader","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "protective-strike",
    "type": "action-attack",
    "name": "Protective Strike",
    "featureDescription": "Strike back when an ally within reach is attacked.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When a creature within 1 Space attacks an ally",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "the triggering creature",
      "range": "1 Space",
      "actionDescription": "You step in to defend an ally, driving your weapon into the attacker.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Bludgeoning"}]
    },
    "tags": ["role/support","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/1"]
  },

  # ══════════════════════════════════════════════
  # OFFENSIVE REACTIONS — TYPES
  # ══════════════════════════════════════════════
  {
    "id": "draconic-fury",
    "type": "action-attack",
    "name": "Draconic Fury",
    "featureDescription": "When hurt, the dragon unleashes a burst of elemental breath.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "isReaction": True,
    "reactionTrigger": "When a creature deals damage to you",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "the triggering creature",
      "range": "5 Spaces",
      "actionDescription": "Fury ignites your breath. You release a short burst of elemental energy at your attacker. Change the damage type to match your breath weapon.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Fire"}]
    },
    "tags": ["creature/dragon","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "system-overcharge",
    "type": "action-attack",
    "name": "System Overcharge",
    "featureDescription": "When damaged, internal systems spike and discharge a burst of energy.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "isReaction": True,
    "reactionTrigger": "When a creature deals damage to you",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "the triggering creature",
      "range": "3 Spaces",
      "actionDescription": "Damage triggers an overload state — your systems surge and discharge electrical energy.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Lightning"}]
    },
    "tags": ["creature/construct","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "mind-lash",
    "type": "action-attack",
    "name": "Mind Lash",
    "featureDescription": "Respond to pain with a psychic lash directed at the attacker.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "isReaction": True,
    "reactionTrigger": "When a creature deals damage to you",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "the triggering creature",
      "range": "5 Spaces",
      "actionDescription": "Your alien mind recoils and lashes out with a psychic spike aimed at whoever hurt you.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Psychic"}],
      "save": {"attribute": "Mental", "failure": "The target is Stunned until the start of your next turn."}
    },
    "tags": ["creature/aberration","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/stunned"]
  },
  {
    "id": "holy-retribution",
    "type": "action-attack",
    "name": "Holy Retribution",
    "featureDescription": "Divine light erupts in retaliation when the celestial is harmed.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "isReaction": True,
    "reactionTrigger": "When a creature deals damage to you",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "the triggering creature",
      "range": "5 Spaces",
      "actionDescription": "Holy light flares outward from you, searing the creature that dared to harm a divine servant.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Radiant"}],
      "save": {"attribute": "Mental", "failure": "The target is Blinded until the start of your next turn."}
    },
    "tags": ["creature/celestial","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1","status/blinded"]
  },
  {
    "id": "fey-hex-reaction",
    "type": "action-attack",
    "name": "Fey Hex",
    "featureDescription": "When struck, curse the attacker with a flash of wild fey magic.",
    "featureCost": 1,
    "actionType": "Ranged Spell Attack",
    "isReaction": True,
    "reactionTrigger": "When a creature deals damage to you",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "the triggering creature",
      "range": "5 Spaces",
      "actionDescription": "A wild curse leaps from you to the creature that struck you, warping their luck.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Psychic"}],
      "save": {"attribute": "Mental", "failure": "The target has Disadvantage on its next attack roll."}
    },
    "tags": ["creature/fey","attack/spellcaster","attack/single-target","target/ad","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "seismic-retaliation",
    "type": "action-attack",
    "name": "Seismic Retaliation",
    "featureDescription": "Slam the ground in a fury, knocking back nearby creatures.",
    "featureCost": 1,
    "actionType": "Area Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When you take damage from a creature within 2 Spaces",
    "effects": {
      "cost": 1,
      "targetDefense": "AD",
      "target": "all creatures within 2 Spaces",
      "range": "Self",
      "actionDescription": "You smash your fists or weapon into the ground with rage, sending a shockwave around you.",
      "damageSegments": [{"useBase": True, "modifier": -1, "type": "Bludgeoning"}],
      "save": {"attribute": "Physical", "failure": "The target is knocked Prone."}
    },
    "tags": ["creature/giant","attack/martial","attack/aoe","target/ad","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "battle-counterattack",
    "type": "action-attack",
    "name": "Battle Counterattack",
    "featureDescription": "Trained combat discipline enables an immediate riposte.",
    "featureCost": 1,
    "actionType": "Melee Martial Attack",
    "isReaction": True,
    "reactionTrigger": "When a creature within 1 Space hits you with a melee attack",
    "effects": {
      "cost": 1,
      "targetDefense": "PD",
      "target": "the triggering creature",
      "range": "1 Space",
      "actionDescription": "Your training kicks in — before the pain registers, your weapon is already swinging back.",
      "damageSegments": [{"useBase": True, "modifier": 0, "type": "Slashing"}]
    },
    "tags": ["creature/humanoid","attack/martial","attack/single-target","target/pd","ap-cost/1","feature-cost/1"]
  },

  # ══════════════════════════════════════════════
  # MARTIAL CHECKS / UTILITIES
  # ══════════════════════════════════════════════
  {
    "id": "martial-command",
    "type": "action-check-utility",
    "name": "Martial Command",
    "featureDescription": "Issue a battle command that coordinates nearby allies instantly.",
    "featureCost": 1,
    "actionType": "Martial Utility",
    "effects": {
      "cost": 1,
      "range": "5 Spaces",
      "target": "up to 3 allies",
      "actionDescription": "You bark a clear, precise order. Up to 3 allies within range can immediately move up to 2 Spaces as a free action."
    },
    "tags": ["role/leader","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "silent-stalk",
    "type": "action-check-utility",
    "name": "Silent Stalk",
    "featureDescription": "Move through shadows without a trace and reposition unseen.",
    "featureCost": 1,
    "actionType": "Martial Check",
    "effects": {
      "cost": 1,
      "range": "Self",
      "target": "yourself",
      "check": {"dc": 12, "success": "You move up to your Speed and become Hidden if you end in obscured terrain."},
      "actionDescription": "You melt into the shadows, moving silently to a new position."
    },
    "tags": ["role/lurker","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "raise-undead",
    "type": "action-check-utility",
    "name": "Raise Undead",
    "featureDescription": "Call a fallen creature back to shambling unlife.",
    "featureCost": 2,
    "actionType": "Martial Utility",
    "effects": {
      "cost": 3,
      "range": "2 Spaces",
      "target": "a corpse",
      "actionDescription": "You channel necrotic energy into a nearby corpse, raising it as a zombie under your control until the end of the encounter."
    },
    "tags": ["creature/undead","ap-cost/3","feature-cost/2"]
  },
  {
    "id": "soul-leech",
    "type": "action-check-utility",
    "name": "Soul Leech",
    "featureDescription": "Drain vitality from a weakened creature to restore your own.",
    "featureCost": 1,
    "actionType": "Martial Check",
    "effects": {
      "cost": 2,
      "range": "1 Space",
      "target": "a creature",
      "check": {"dc": 14, "success": "You drain 1d6 HP from the target, healing yourself for the same amount."},
      "actionDescription": "You reach out and siphon the target's life force into yourself."
    },
    "tags": ["creature/fiend","ap-cost/2","feature-cost/1"]
  },
  {
    "id": "earth-tremor",
    "type": "action-check-utility",
    "name": "Earth Tremor",
    "featureDescription": "Pulse elemental energy into the ground to destabilize an area.",
    "featureCost": 1,
    "actionType": "Martial Check",
    "effects": {
      "cost": 2,
      "range": "3 Spaces",
      "target": "a 2 Space Burst",
      "check": {"dc": 13, "success": "The ground in the area becomes difficult terrain until the start of your next turn."},
      "actionDescription": "You channel elemental force into the earth, causing it to shift and crack."
    },
    "tags": ["creature/elemental","ap-cost/2","feature-cost/1"]
  },
  {
    "id": "entangle-field",
    "type": "action-check-utility",
    "name": "Entangle Field",
    "featureDescription": "Cause roots and vines to burst from the earth and grab creatures.",
    "featureCost": 1,
    "actionType": "Martial Check",
    "effects": {
      "cost": 2,
      "range": "4 Spaces",
      "target": "a 2 Space Burst",
      "check": {"dc": 13, "success": "All creatures in the area are Restrained until the start of your next turn."},
      "actionDescription": "You call upon the land itself to restrain your enemies. Thick roots and vines erupt around them."
    },
    "tags": ["creature/plant","ap-cost/2","feature-cost/1","status/restrained"]
  },
  {
    "id": "mind-probe",
    "type": "action-check-utility",
    "name": "Mind Probe",
    "featureDescription": "Reach into a creature's mind and extract or implant a thought.",
    "featureCost": 1,
    "actionType": "Martial Check",
    "effects": {
      "cost": 2,
      "range": "3 Spaces",
      "target": "a creature",
      "check": {"dc": 14, "success": "You learn one fact the target knows, or implant a single false memory."},
      "actionDescription": "You extend alien tendrils of thought into the target's mind and rummage through their memories."
    },
    "tags": ["creature/aberration","ap-cost/2","feature-cost/1"]
  },

  # ══════════════════════════════════════════════
  # SPELL CHECKS / UTILITIES
  # ══════════════════════════════════════════════
  {
    "id": "war-cry",
    "type": "action-check-utility",
    "name": "War Cry",
    "featureDescription": "Unleash a terrifying battle roar that shakes enemy resolve.",
    "featureCost": 1,
    "actionType": "Spell Check",
    "effects": {
      "cost": 1,
      "range": "4 Space Burst",
      "target": "all enemies within range",
      "check": {"dc": 13, "success": "Targets are Frightened of you until the end of their next turn."},
      "actionDescription": "You let out a thunderous roar fueled by primal fury or battlefield experience."
    },
    "tags": ["role/brute","role/defender","ap-cost/1","feature-cost/1","status/frightened"]
  },
  {
    "id": "suppression-fire",
    "type": "action-check-utility",
    "name": "Suppression Fire",
    "featureDescription": "Lay down a barrage of shots that forces enemies to take cover.",
    "featureCost": 1,
    "actionType": "Spell Check",
    "effects": {
      "cost": 2,
      "range": "8 Spaces",
      "target": "a 3 Space Cube",
      "check": {"dc": 13, "success": "All creatures in the area must use their Reaction to take cover or be Hindered until the end of their next turn."},
      "actionDescription": "You unleash a relentless volley that forces everyone in the area to duck or suffer the consequences."
    },
    "tags": ["role/artillerist","ap-cost/2","feature-cost/1","status/hindered"]
  },
  {
    "id": "tactical-inspiration",
    "type": "action-check-utility",
    "name": "Tactical Inspiration",
    "featureDescription": "Bolster an ally with a tactical command that sharpens their next action.",
    "featureCost": 1,
    "actionType": "Spell Utility",
    "effects": {
      "cost": 1,
      "range": "5 Spaces",
      "target": "an ally",
      "actionDescription": "You call out a precise tactical instruction. The target ally gains Advantage on their next attack roll or saving throw."
    },
    "tags": ["role/leader","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "pack-howl",
    "type": "action-check-utility",
    "name": "Pack Howl",
    "featureDescription": "A rallying howl that coordinates the pack and unnerves prey.",
    "featureCost": 1,
    "actionType": "Spell Check",
    "effects": {
      "cost": 1,
      "range": "6 Space Burst",
      "target": "all creatures",
      "check": {"dc": 12, "success": "Enemies are Frightened of you until the start of your next turn. Allies gain Advantage on their next attack roll."},
      "actionDescription": "You loose a bone-chilling howl. Pack mates surge with confidence while prey animals flee."
    },
    "tags": ["creature/beast","ap-cost/1","feature-cost/1","status/frightened"]
  },
  {
    "id": "draconic-presence",
    "type": "action-check-utility",
    "name": "Draconic Presence",
    "featureDescription": "The dragon exerts its sheer ancient will, cowing lesser beings.",
    "featureCost": 2,
    "actionType": "Spell Check",
    "effects": {
      "cost": 2,
      "range": "5 Space Burst",
      "target": "all creatures within range",
      "check": {"dc": 15, "success": "Targets are Frightened of you until the end of their next turn."},
      "actionDescription": "You straighten to your full height and let your draconic presence radiate. All lesser beings feel the crushing weight of your ancient power."
    },
    "tags": ["creature/dragon","ap-cost/2","feature-cost/2","status/frightened","tier/apex"]
  },
  {
    "id": "arcane-manipulation",
    "type": "action-check-utility",
    "name": "Arcane Manipulation",
    "featureDescription": "Bend environmental magic or objects to your will.",
    "featureCost": 1,
    "actionType": "Spell Utility",
    "effects": {
      "cost": 1,
      "range": "4 Spaces",
      "target": "an object or environmental feature",
      "actionDescription": "You weave your arcane knowledge to manipulate nearby magic, objects, or spells — opening doors, closing traps, or temporarily suppressing a magical effect."
    },
    "tags": ["creature/humanoid","ap-cost/1","feature-cost/1"]
  },
  {
    "id": "power-surge",
    "type": "action-check-utility",
    "name": "Power Surge",
    "featureDescription": "Overload internal systems to release a disorienting energy burst.",
    "featureCost": 1,
    "actionType": "Spell Check",
    "effects": {
      "cost": 2,
      "range": "3 Space Burst",
      "target": "all creatures within range",
      "check": {"dc": 13, "success": "Targets are Disoriented until the end of their next turn."},
      "actionDescription": "You overload your internal power source, releasing a burst of disruptive energy around you."
    },
    "tags": ["creature/construct","ap-cost/2","feature-cost/1","status/disoriented"]
  },
  {
    "id": "digestive-secretion",
    "type": "action-check-utility",
    "name": "Digestive Secretion",
    "featureDescription": "Secrete an enzyme that weakens objects and armor.",
    "featureCost": 1,
    "actionType": "Spell Utility",
    "effects": {
      "cost": 1,
      "range": "1 Space",
      "target": "a creature or object",
      "actionDescription": "You secrete a concentrated digestive enzyme onto the target. Non-magical armor or objects in contact take a cumulative -1 penalty to any bonus they provide until cleaned."
    },
    "tags": ["creature/ooze","ap-cost/1","feature-cost/1"]
  },

]

# ─────────────────────────────────────────────────
# STEP 3: Merge and write
# ─────────────────────────────────────────────────
existing_ids = {f['id'] for f in features}
added = 0
for nf in new_features:
    if nf['id'] not in existing_ids:
        features.append(nf)
        added += 1

print(f"Updated {len(save_changes)} existing saves")
print(f"Added {added} new features")
print(f"Total features: {len(features)}")

with open('/home/user/DC20-Vanilla/public/data/features.json', 'w') as f:
    json.dump(features, f, indent=2)
print("Written to features.json")

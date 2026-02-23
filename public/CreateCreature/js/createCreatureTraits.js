const DAMAGE_TYPES = [
  'Bludgeoning',
  'Piercing',
  'Slashing',
  'Cold',
  'Corrosion',
  'Fire',
  'Lightning',
  'Poison',
  'Psychic',
  'Radiant',
  'Umbral',
];

const CONDITION_TYPES = [
  'Bleeding',
  'Blinded',
  'Burning',
  'Charmed',
  'Dazed',
  'Deafened',
  'Disoriented',
  'Doomed',
  'Exhaustion',
  'Exposed',
  'Frightened',
  'Hindered',
  'Immobilized',
  'Impaired',
  'Incapacitated',
  'Intimidated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Restrained',
  'Slowed',
  'Stunned',
  'Surprised',
  'Taunted',
  'Terrified',
  'Tethered',
  'Unconscious',
  'Weakened',
];

function setupTraitPickers() {
  const traitSources = {
    resistances: { damage: DAMAGE_TYPES, condition: CONDITION_TYPES },
    vulnerabilities: { damage: DAMAGE_TYPES, condition: CONDITION_TYPES },
    immunities: { damage: DAMAGE_TYPES, condition: CONDITION_TYPES },
  };

  document.querySelectorAll('.trait-picker').forEach((picker) => {
    const trait = picker.dataset.trait;
    const sources = traitSources[trait];
    if (!sources) return;

    Object.entries(sources).forEach(([category, labels]) => {
      const container = picker.querySelector(`.trait-picker-options[data-category="${category}"]`);
      if (!container) return;
      container.innerHTML = '';

      labels.forEach((label) => {
        const optionId = `${trait}-${category}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        container.insertAdjacentHTML(
          'beforeend',
          `
          <input type="checkbox" id="${optionId}" name="${trait}" value="${label}" data-label="${label}" data-category="${category}">
          <label class="option-tile" for="${optionId}">${label}</label>
        `.trim()
        );
      });
    });

    const button = picker.querySelector('.trait-picker-toggle');
    const content = picker.querySelector('.trait-picker-content');
    if (button && content) {
      button.setAttribute('aria-expanded', 'false');
      content.setAttribute('aria-hidden', 'true');
      button.addEventListener('click', () => {
        const isOpen = picker.classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(isOpen));
        content.setAttribute('aria-hidden', String(!isOpen));
      });
    }
  });
}

function collectTraitGroup(trait) {
  const collected = { damage: [], condition: [] };

  document.querySelectorAll(`#creatureInputs input[name="${trait}"]:checked`).forEach((input) => {
    // Skip checkboxes checked only because a feature grants this trait — those are
    // not user-picked and must not survive a feature being removed.
    if (input.dataset.featureGranted === '1') return;

    const category = input.dataset.category;
    if (category !== 'damage' && category !== 'condition') return;

    const label = input.dataset.label || input.value;
    if (!label) return;

    if (!collected[category].includes(label)) {
      collected[category].push(label);
    }
  });

  return collected;
}

function syncTraitCheckboxes(trait, group) {
  const damageValues = group && Array.isArray(group.damage) ? group.damage : [];
  const conditionValues = group && Array.isArray(group.condition) ? group.condition : [];

  document.querySelectorAll(`#creatureInputs input[name="${trait}"]`).forEach((checkbox) => {
    const category = checkbox.dataset.category;
    const label = checkbox.dataset.label || checkbox.value;
    if (!category || !label) return;

    const isChecked =
      category === 'damage'
        ? damageValues.includes(label)
        : category === 'condition'
        ? conditionValues.includes(label)
        : false;

    checkbox.checked = isChecked;
    // Clear any stale feature-granted marker — markFeatureGrantedTraits sets it fresh each cycle.
    checkbox.dataset.featureGranted = '';
  });
}

// Mark checkboxes that are checked solely because a feature grants the trait.
// collectTraitGroup skips these so they are never treated as user-picked.
function markFeatureGrantedTraits(trait, group) {
  const damageValues = group && Array.isArray(group.damage) ? group.damage : [];
  const conditionValues = group && Array.isArray(group.condition) ? group.condition : [];

  document.querySelectorAll(`#creatureInputs input[name="${trait}"]`).forEach((checkbox) => {
    const category = checkbox.dataset.category;
    const label = checkbox.dataset.label || checkbox.value;
    if (!category || !label) return;

    const isFeatureGranted =
      category === 'damage'
        ? damageValues.includes(label)
        : category === 'condition'
        ? conditionValues.includes(label)
        : false;

    if (isFeatureGranted) checkbox.dataset.featureGranted = '1';
  });
}

export { setupTraitPickers, collectTraitGroup, syncTraitCheckboxes, markFeatureGrantedTraits };

## Watch out for double-filtering in renderFeatureControls

`renderFeatureControls()` in `createCreatureFeatures.js` filters `visibleIds` by `featureMatchesCurrentCreature()`. When search is active, `applyFeatureSearch` already narrowed `filteredIds` to the right set — the role/type filter must be skipped (`if (featureState.searchTerm) return true`) or it silently strips cross-role search results.

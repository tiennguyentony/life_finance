import type { GameStateV2 } from "./game-state-v2";
import type { InsuranceCoverageCatalogEntry } from "./scenario-catalog";

/**
 * Historical states use the onboarding selection. New recurring policies can
 * activate any subset of that immutable, versioned coverage universe.
 */
export function activeInsuranceCoverageIdsV2(
  state: GameStateV2,
): readonly string[] {
  return (
    state.gameplay.recurringStrategy.insuranceCoverageIds ??
    state.gameplay.benefits.insuranceCoverageIds
  );
}

export function activeInsuranceCoveragesV2(
  state: GameStateV2,
): readonly InsuranceCoverageCatalogEntry[] {
  const activeIds = new Set(activeInsuranceCoverageIdsV2(state));
  return (
    state.gameplay.catalogSnapshot?.selected.insuranceCoverages.filter(
      ({ id }) => activeIds.has(id),
    ) ?? []
  );
}

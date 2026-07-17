/** Display metadata for Brightwater City districts, shared by the 3D board
 * and the shell UI. Decision wiring lives in model.ts via locationId. */

export type CityLocation = Readonly<{
  id: string;
  name: string;
  tagline: string;
  /** Index into DECISIONS when this district hosts a chapter. */
  decisionIndex: number | null;
}>;

export const CITY_LOCATIONS: readonly CityLocation[] = [
  {
    id: "heights",
    name: "The Heights",
    tagline: "Apartments with a view of the rent",
    decisionIndex: 0,
  },
  {
    id: "transit",
    name: "Transit Yard",
    tagline: "Wheels, rails, and pedals",
    decisionIndex: 1,
  },
  {
    id: "promenade",
    name: "Neon Promenade",
    tagline: "Where paychecks go dancing",
    decisionIndex: 2,
  },
  {
    id: "hospital",
    name: "General Hospital",
    tagline: "Nobody budgets for this place",
    decisionIndex: 3,
  },
  {
    id: "bank",
    name: "Sprout Bank",
    tagline: "Allocate, invest, breathe",
    decisionIndex: 4,
  },
  {
    id: "office",
    name: "Coreline HQ",
    tagline: "Your first-job desk lives here",
    decisionIndex: null,
  },
  {
    id: "park",
    name: "Founders Park",
    tagline: "Free serotonin, open late",
    decisionIndex: null,
  },
];

export function locationById(id: string): CityLocation {
  const found = CITY_LOCATIONS.find((location) => location.id === id);
  if (!found) throw new Error(`unknown location ${id}`);
  return found;
}

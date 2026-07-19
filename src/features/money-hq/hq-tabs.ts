import type { BoardDestinationId } from "@/features/board/plan-catalog";

export type HqTabId =
  | "overview"
  | "budget"
  | "debt"
  | "invest"
  | "career"
  | "safety"
  | "glossary";

export type HqTab = Readonly<{
  id: HqTabId;
  label: string;
  hint: string;
  characterSrc: string;
  characterName: string;
  iconTint: string;
  /**
   * The board destination whose plans this tab commits. Null for tabs that
   * either read only (Overview, Glossary) or drive the recurring strategy
   * instead of a one-off action (Invest).
   */
  destinationId: BoardDestinationId | null;
}>;

const CHARACTERS = "/assets/characters";

export const HQ_TABS: readonly HqTab[] = Object.freeze([
  Object.freeze({
    id: "overview" as const,
    label: "Overview",
    hint: "stats & report",
    characterSrc: `${CHARACTERS}/penny/penny-map.png`,
    characterName: "Penny",
    iconTint: "#e3f7ea",
    destinationId: null,
  }),
  Object.freeze({
    id: "budget" as const,
    label: "Budget",
    hint: "vs. Inflato",
    characterSrc: `${CHARACTERS}/inflato/inflato-cash.png`,
    characterName: "Inflato",
    iconTint: "#ffe9e6",
    destinationId: "home" as const,
  }),
  Object.freeze({
    id: "debt" as const,
    label: "Debt",
    hint: "vs. Debtzilla",
    characterSrc: `${CHARACTERS}/debtzilla/debtzilla-bills.png`,
    characterName: "Debtzilla",
    iconTint: "#ffe9e6",
    destinationId: "bank" as const,
  }),
  Object.freeze({
    id: "invest" as const,
    label: "Invest",
    hint: "Bengo's Lab",
    characterSrc: `${CHARACTERS}/bengo/bengo-magic.png`,
    characterName: "Bengo",
    iconTint: "#e5f3fc",
    destinationId: null,
  }),
  Object.freeze({
    id: "career" as const,
    label: "Career",
    hint: "w. Mr. Layoff",
    characterSrc: `${CHARACTERS}/mr-layoff/mr-layoff-box.png`,
    characterName: "Mr. Layoff",
    iconTint: "#efeafc",
    destinationId: "startup" as const,
  }),
  Object.freeze({
    id: "safety" as const,
    label: "Safety",
    hint: "buffer & insurance",
    characterSrc: `${CHARACTERS}/buddi/buddi-heart.png`,
    characterName: "Buddi",
    iconTint: "#e3f7ea",
    destinationId: "hospital" as const,
  }),
  Object.freeze({
    id: "glossary" as const,
    label: "Glossary",
    hint: "19 concepts",
    characterSrc: `${CHARACTERS}/froggy/froggy-notebook.png`,
    characterName: "Froggy",
    iconTint: "#efeafc",
    destinationId: null,
  }),
]);

export function hqTab(id: HqTabId): HqTab {
  const tab = HQ_TABS.find((candidate) => candidate.id === id);
  if (!tab) throw new Error(`unknown Money HQ tab: ${id}`);
  return tab;
}

export const SPROUT_AVATAR = `${CHARACTERS}/sprout/poses/idle.png`;
export const HQ_COIN = `${CHARACTERS}/sprout/props/coin.png`;

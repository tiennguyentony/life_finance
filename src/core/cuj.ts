export type CujSlug =
  | "character"
  | "dashboard"
  | "game-master"
  | "psychology-traps";

export type CujDefinition = {
  readonly number: 1 | 2 | 3 | 4;
  readonly slug: CujSlug;
  readonly href: `/${CujSlug}`;
  readonly navLabel: string;
  readonly title: string;
  readonly summary: string;
};

export const CUJS = [
  {
    number: 1,
    slug: "character",
    href: "/character",
    navLabel: "Character",
    title: "Character & Localization",
    summary: "Define the player's starting financial context.",
  },
  {
    number: 2,
    slug: "dashboard",
    href: "/dashboard",
    navLabel: "Dashboard",
    title: "Monthly Dashboard",
    summary: "Review the player's financial state and future turn controls.",
  },
  {
    number: 3,
    slug: "game-master",
    href: "/game-master",
    navLabel: "Game Master",
    title: "Game Master Events",
    summary: "Reserve the boundary for deterministic financial stress events.",
  },
  {
    number: 4,
    slug: "psychology-traps",
    href: "/psychology-traps",
    navLabel: "Psychology",
    title: "Psychology Traps",
    summary:
      "Reserve the boundary for speculative decisions and behavioral pressure.",
  },
] as const satisfies readonly CujDefinition[];

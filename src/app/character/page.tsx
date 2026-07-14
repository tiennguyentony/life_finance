import type { Metadata } from "next";

import { CharacterOverview } from "@/features/character/character-overview";

export const metadata: Metadata = { title: "Character" };

export default function CharacterPage() {
  return <CharacterOverview />;
}

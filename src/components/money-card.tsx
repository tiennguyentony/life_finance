import { StatTile } from "./stat-tile";

import type { StatView } from "@/types/game";

export function MoneyCard({ stat, featured }: { readonly stat: StatView; readonly featured?: boolean }) {
  return <StatTile featured={featured} stat={stat} />;
}

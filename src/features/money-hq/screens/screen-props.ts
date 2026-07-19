import type { RunViewWire } from "@/contracts/api/contracts";
import type { BoardPlan } from "@/features/board/plan-catalog";

import type { HqView } from "../hq-view";

/** Shared by every screen that commits a board destination plan. */
export type ScreenProps = Readonly<{
  busy: boolean;
  onSelectPlan: (planId: string) => void;
  plans: readonly BoardPlan[];
  run: RunViewWire;
  selectedPlanId: string | null;
  view: HqView;
}>;

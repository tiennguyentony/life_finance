import type { Metadata } from "next";

import { BoardShell } from "@/features/board/board-shell";

export const metadata: Metadata = {
  title: "The Board - Free Roam",
  description: "Variant board: click any island and travel there directly.",
};

export default function BoardFreePage() {
  return <BoardShell mode="free" />;
}

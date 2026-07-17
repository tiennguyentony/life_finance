import type { Metadata } from "next";

import { BoardShell } from "@/features/board/board-shell";

export const metadata: Metadata = {
  title: "The Board",
  description: "Your financial life as a living board game.",
};

export default function BoardPage() {
  return <BoardShell mode="loop" />;
}

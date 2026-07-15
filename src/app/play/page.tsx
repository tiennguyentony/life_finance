import type { Metadata } from "next";

import { PlayConsole } from "@/features/play/play-console";

export const metadata: Metadata = { title: "Play" };

export default function PlayPage() {
  return <PlayConsole />;
}


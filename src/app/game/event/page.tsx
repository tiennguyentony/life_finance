import type { Metadata } from "next";

import { EventScreen } from "@/features/game/event-screen";

export const metadata: Metadata = { title: "Life event" };

export default function EventPage() {
  return <EventScreen />;
}

import type { Metadata } from "next";

import { PersonaGallery } from "@/features/onboarding/persona-gallery";

export const metadata: Metadata = { title: "Choose a life" };

export default function StartPage() {
  return <PersonaGallery />;
}

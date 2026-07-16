import type { Metadata } from "next";

import { ProfileWizard } from "@/features/onboarding/profile-wizard";

export const metadata: Metadata = { title: "Build your player" };

export default function ProfilePage() {
  return <ProfileWizard />;
}

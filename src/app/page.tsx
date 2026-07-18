import { Landing } from "@/features/onboarding/landing";

export default function HomePage() {
  return <Landing demoEnabled={process.env.NODE_ENV === "development"} />;
}

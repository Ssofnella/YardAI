import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboard/onboarding";

export const metadata: Metadata = { title: "Guided setup" };

export default function Page() {
  return <OnboardingFlow />;
}

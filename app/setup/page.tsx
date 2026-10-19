import type { Metadata } from "next";
import { SetupWizard } from "@/components/setup/wizard";

export const metadata: Metadata = { title: "Setup" };

export default function Page() {
  return <SetupWizard />;
}

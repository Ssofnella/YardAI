import type { Metadata } from "next";
import { GateScreen } from "@/components/gate/gate-screen";

export const metadata: Metadata = { title: "Gate" };

export default function Page() {
  return <GateScreen />;
}

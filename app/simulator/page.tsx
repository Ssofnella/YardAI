import type { Metadata } from "next";
import { SimulatorPanel } from "@/components/simulator/simulator-panel";

export const metadata: Metadata = { title: "Simulator" };

export default function Page() {
  return <SimulatorPanel />;
}

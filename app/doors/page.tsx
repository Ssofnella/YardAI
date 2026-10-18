import type { Metadata } from "next";
import { DoorBoard } from "@/components/yard/door-board";

export const metadata: Metadata = { title: "Doors" };

export default function Page() {
  return <DoorBoard />;
}

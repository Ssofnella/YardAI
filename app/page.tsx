import type { Metadata } from "next";
import { YardBoard } from "@/components/yard/yard-board";

export const metadata: Metadata = { title: "Yard" };

export default function Page() {
  return <YardBoard />;
}

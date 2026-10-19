import type { Metadata } from "next";
import { EventLog } from "@/components/events/event-log";

export const metadata: Metadata = { title: "Events" };

export default function Page() {
  return <EventLog />;
}

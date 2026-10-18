import { ConfigError } from "@/lib/domain/config";
import { EventValidationError } from "@/lib/domain/events";
import { YardError } from "@/lib/db/types";

export function apiError(error: unknown): Response {
  const status =
    error instanceof YardError
      ? error.status
      : error instanceof ConfigError || error instanceof EventValidationError
        ? 400
        : 500;
  if (status === 500) console.error(error);
  const message = error instanceof Error ? error.message : "Request failed";
  return Response.json({ error: message }, { status });
}

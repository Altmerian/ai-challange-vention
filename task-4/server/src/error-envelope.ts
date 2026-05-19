/**
 * Formats MCP `isError: true` envelopes that carry **multiple** validation issues
 * in a single response (PRD User Story 25).
 *
 * The envelope's `content[0].text` is a JSON document `{ "errors": ValidationIssue[] }`
 * so MCP clients can parse it without screen-scraping the text.
 *
 * Why no `structuredContent` on error: the SDK client validates `structuredContent`
 * against the tool's *success* output schema whenever it is present, regardless of
 * `isError`. Attaching an error-shaped object would trip that validator and turn
 * the envelope into an MCP protocol error.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Reason taxonomy local to this slice. Schedule-time reasons (`no_compatible_runway`,
 * `dependency_*`, etc.) live on `UnscheduledEntry`, not on this envelope.
 */
export type ValidationReason =
  | "invalid_input"
  | "self_dependency"
  | "duplicate_flight_number";

export type ValidationIssue = Readonly<{
  reason: ValidationReason;
  message: string;
  flight_number?: string;
  field?: string;
}>;

export function errorEnvelope(issues: readonly ValidationIssue[]): CallToolResult {
  if (issues.length === 0) {
    // A caller asking for an error envelope with zero issues is itself a bug —
    // surface it loudly rather than returning a misleading "no errors" payload.
    throw new Error("errorEnvelope requires at least one ValidationIssue");
  }
  const payload = { errors: issues.map((i) => ({ ...i })) };
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(payload),
      },
    ],
  };
}

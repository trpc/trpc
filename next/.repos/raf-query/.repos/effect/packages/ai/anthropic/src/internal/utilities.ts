import type * as Response from "effect/ai/Response"
import * as Predicate from "effect/Predicate"

const finishReasonMap: Record<string, Response.FinishReason> = {
  end_turn: "stop",
  max_tokens: "length",
  pause_turn: "pause",
  refusal: "content-filter",
  stop_sequence: "stop",
  tool_use: "tool-calls"
}

/** @internal */
export const resolveFinishReason = (
  finishReason: string,
  isJsonResponse: boolean = false
): Response.FinishReason => {
  const reason = Object.hasOwn(finishReasonMap, finishReason) ? finishReasonMap[finishReason] : undefined
  if (Predicate.isUndefined(reason)) {
    return "unknown"
  }
  if (isJsonResponse && reason === "tool-calls") {
    return "stop"
  }
  return reason
}

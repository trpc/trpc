import type * as Response from "effect/ai/Response"

const finishReasonMap: Record<string, Response.FinishReason> = {
  content_filter: "content-filter",
  function_call: "tool-calls",
  length: "length",
  stop: "stop",
  tool_calls: "tool-calls"
}

/** @internal */
export const resolveFinishReason = (
  finishReason: string | null | undefined,
  hasToolCalls: boolean
): Response.FinishReason => {
  if (finishReason == null) {
    return hasToolCalls ? "tool-calls" : "stop"
  }
  const reason = Object.hasOwn(finishReasonMap, finishReason) ? finishReasonMap[finishReason] : undefined
  if (reason == null) {
    return hasToolCalls ? "tool-calls" : "unknown"
  }
  return reason
}

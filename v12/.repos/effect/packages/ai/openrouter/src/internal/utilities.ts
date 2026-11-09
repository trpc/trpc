import type * as Response from "effect/ai/Response"
import * as Predicate from "effect/Predicate"
import type { ReasoningDetails } from "../OpenRouterLanguageModel.ts"

const finishReasonMap: Record<string, Response.FinishReason> = {
  content_filter: "content-filter",
  error: "error",
  function_call: "tool-calls",
  length: "length",
  tool_calls: "tool-calls",
  stop: "stop"
}

/** @internal */
export const resolveFinishReason = (
  finishReason: string | null | undefined
): Response.FinishReason => {
  if (Predicate.isNullish(finishReason)) {
    return "other"
  }
  return Object.hasOwn(finishReasonMap, finishReason) ? finishReasonMap[finishReason] : "unknown"
}

/**
 * Tracks ReasoningDetailUnion entries and deduplicates them based
 * on a derived canonical key.
 *
 * This is used when converting messages to ensure the API request only
 * contains unique reasoning details, preventing "Duplicate item found with id"
 * errors in multi-turn conversations.
 *
 * The canonical key logic matches the OpenRouter API's deduplication exactly
 * (see openrouter-web/packages/llm-interfaces/reasonings/duplicate-tracker.ts):
 * - Summary: key = summary field
 * - Encrypted: key = id field (if truthy) or data field
 * - Text: key = text field (if truthy) or signature field (if truthy)
 *
 * @internal
 */
export class ReasoningDetailsDuplicateTracker {
  readonly #seenKeys = new Set<string>()

  /**
   * Attempts to track a detail.
   *
   * or `false` if it was skipped (no valid key) or already seen (duplicate).
   */
  upsert(detail: ReasoningDetails[number]): boolean {
    const key = this.getCanonicalKey(detail)

    if (Predicate.isNull(key)) {
      return false
    }

    if (this.#seenKeys.has(key)) {
      return false
    }

    this.#seenKeys.add(key)

    return true
  }

  private getCanonicalKey(detail: ReasoningDetails[number]): string | null {
    // This logic matches the OpenRouter API's deduplication exactly.
    // See: openrouter-web/packages/llm-interfaces/reasonings/duplicate-tracker.ts
    switch (detail.type) {
      case "reasoning.summary": {
        return detail.summary
      }

      case "reasoning.encrypted": {
        return Predicate.isNotNullish(detail.id) ? detail.id : detail.data
      }

      case "reasoning.text": {
        if (Predicate.isNotNullish(detail.text)) {
          return detail.text
        }

        if (Predicate.isNotNullish(detail.signature)) {
          return detail.signature
        }

        return null
      }

      default: {
        // Handle unknown types gracefully
        return null
      }
    }
  }
}

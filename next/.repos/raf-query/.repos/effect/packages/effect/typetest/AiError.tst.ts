import { AiError } from "effect/ai"
import { describe, expect, it } from "tstyche"

declare module "effect/ai/AiError" {
  interface RateLimitErrorMetadata {
    readonly providerA?: {
      readonly retryId: string
    } | null
  }

  interface QuotaExhaustedErrorMetadata {
    readonly providerA?: {
      readonly quotaId: string
    } | null
  }
}

declare module "effect/ai/AiError" {
  interface RateLimitErrorMetadata {
    readonly providerB?: {
      readonly resetAt: string
    } | null
  }

  interface QuotaExhaustedErrorMetadata {
    readonly providerB?: {
      readonly orgId: string
    } | null
  }
}

describe("AiError metadata augmentation", () => {
  it("merges metadata for the same reason across providers", () => {
    const error = new AiError.RateLimitError({})

    expect(error.metadata.providerA?.retryId).type.toBe<string | undefined>()
    expect(error.metadata.providerB?.resetAt).type.toBe<string | undefined>()
  })

  it("keeps reason metadata interfaces independent", () => {
    const error = new AiError.QuotaExhaustedError({})

    expect(error.metadata.providerA?.quotaId).type.toBe<string | undefined>()
    expect(error.metadata.providerB?.orgId).type.toBe<string | undefined>()

    type ProviderAQuotaMetadata = NonNullable<NonNullable<typeof error.metadata.providerA>>
    expect<keyof ProviderAQuotaMetadata>().type.toBe<"quotaId">()
  })
})

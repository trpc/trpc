// Shared type-only APIs for client and builder endpoint-selection fixtures.
import type { HttpApi } from "effect/http-api"
import type { Group } from "./_grouped-api-types.ts"

export type Api<Count extends 10 | 50 | 100 | 500> = HttpApi.HttpApi<"Api", Group<Count>>

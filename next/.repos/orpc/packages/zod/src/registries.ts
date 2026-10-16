import type { JsonSchema } from '@orpc/json-schema'
import type { $input, $output } from 'zod/v4/core'
import { registry } from 'zod/v4/core'

/**
 * Zod registry for customizing generated JSON schema, can use both for .input and .output
 *
 * @example
 * ```ts
 * import { JSON_SCHEMA_REGISTRY } from '@orpc/zod'
 *
 * const user = z.object({
 *   name: z.string(),
 *   age: z.number(),
 * })
 *
 * JSON_SCHEMA_REGISTRY.add(user, {
 *   examples: [{ name: 'John', age: 20 }],
 * })
 * ```
 *
 * @see {@link https://orpc.dev/docs/integrations/zod | Zod Integration}
 */
export const JSON_SCHEMA_REGISTRY = registry<Exclude<JsonSchema<$input | $output>, boolean>>()

/**
 * Zod registry for customizing generated JSON schema, only useful for .input
 *
 * @example
 * ```ts
 * import { JSON_SCHEMA_INPUT_REGISTRY } from '@orpc/zod'
 *
 * const user = z.object({
 *   name: z.string(),
 *   age: z.string().transform(v => Number(v)),
 * })
 *
 * JSON_SCHEMA_INPUT_REGISTRY.add(user, {
 *   examples: [{ name: 'John', age: "20" }],
 * })
 * ```
 *
 * @see {@link https://orpc.dev/docs/integrations/zod | Zod Integration}
 */
export const JSON_SCHEMA_INPUT_REGISTRY = registry<Exclude<JsonSchema<$input>, boolean>>()

/**
 * Zod registry for customizing generated JSON schema, only useful for .output
 *
 * @example
 * ```ts
 * import { JSON_SCHEMA_OUTPUT_REGISTRY } from '@orpc/zod'
 *
 * const user = z.object({
 *   name: z.string(),
 *   age: z.string().transform(v => Number(v)),
 * })
 *
 * JSON_SCHEMA_OUTPUT_REGISTRY.add(user, {
 *   examples: [{ name: 'John', age: 20 }],
 * })
 * ```
 *
 * @see {@link https://orpc.dev/docs/integrations/zod | Zod Integration}
 */
export const JSON_SCHEMA_OUTPUT_REGISTRY = registry<Exclude<JsonSchema<$output>, boolean>>()

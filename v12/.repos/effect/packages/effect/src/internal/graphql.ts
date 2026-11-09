import { isReadonlyArrayNonEmpty, type NonEmptyReadonlyArray } from "../Array.ts"
import * as Clock from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type * as GraphQL from "../graphql/GraphQL.ts"
import type { DocumentTemplate } from "../graphql/GraphQL.ts"
import type { PartialResult } from "../graphql/GraphQLClient.ts"
import {
  DecodeError,
  EncodeError,
  GraphQLClientError,
  type GraphQLError,
  type Reason,
  ResponseError,
  TransportError
} from "../graphql/GraphQLClientError.ts"
import type { ExecutionResult, GraphQLProtocol, GraphQLRequest } from "../graphql/GraphQLProtocol.ts"
import * as Schema from "../Schema.ts"
import { parseRetryAfter } from "./graphqlHeaders.ts"

/**
 * Builds a response error with raw data and transport metadata.
 *
 * @internal
 */
export const responseError = (
  result: ExecutionResult | undefined,
  errors: NonEmptyReadonlyArray<GraphQLError>
): ResponseError =>
  new ResponseError({
    errors,
    ...(result?.data === undefined ? {} : { data: result.data as Schema.Json }),
    ...(result?.extensions === undefined ? {} : { extensions: result.extensions }),
    ...(result?.status === undefined ? {} : { status: result.status }),
    ...(result?.headers === undefined ? {} : { headers: result.headers })
  })

/** A result without an HTTP status, such as a graphql-ws event, counts as 2xx. */
const isStatusOk = (result: ExecutionResult): boolean =>
  result.status === undefined || (result.status >= 200 && result.status < 300)

/**
 * Raw responses for partial results, used by resolvers to preserve error
 * metadata. Mock client results have no entry.
 *
 * @internal
 */
export const partialResponses = new WeakMap<object, ExecutionResult>()

/**
 * Joins two printed pieces, adding a space only where two non-punctuators
 * would otherwise touch. This is the generator printer's rule, so joining a
 * generated template reproduces the printed document exactly.
 */
const concat = (left: string, right: string): string =>
  /[\w"-]$/.test(left) && /^[\w"-]/.test(right) ? `${left} ${right}` : left + right

const concatAll = (pieces: ReadonlyArray<string>): string => pieces.reduce(concat, "")

/** Renders template parts, prefixing every name (the odd entries). */
const renderParts = (parts: DocumentTemplate.Parts, prefix: string): string =>
  parts.map((part, i) => i % 2 === 1 ? prefix + part : part).join("")

const isShared = (fragment: DocumentTemplate.Fragment): boolean => fragment.body.length <= 1

/**
 * Renders the template once per prefix. The empty prefix renders it as
 * written; any other prefix renames variables and per-slice fragments and
 * aliases root fields to the prefixed response key.
 */
const render = (
  kind: string,
  name: string,
  template: DocumentTemplate,
  prefixes: ReadonlyArray<string>
): string =>
  concatAll([
    kind,
    name,
    template.variables.length === 0 ? "" : `(${
      concatAll(
        prefixes.flatMap((prefix) =>
          template.variables.map((variable) => `$${prefix}${variable.name}:${variable.body}`)
        )
      )
    })`,
    template.directives === undefined ? "" : renderParts(template.directives, ""),
    `{${
      concatAll(prefixes.flatMap((prefix) =>
        template.selections.map((selection) => {
          const key = prefix === "" ? selection.alias : `${prefix}${selection.alias ?? selection.name}`
          return `${key === undefined ? "" : `${key}:`}${selection.name ?? ""}${renderParts(selection.body, prefix)}`
        })
      ))
    }}`,
    ...template.fragments.flatMap((fragment) =>
      (isShared(fragment) ? [""] : prefixes).map((prefix) =>
        concatAll(["fragment", prefix + fragment.name, renderParts(fragment.body, prefix)])
      )
    )
  ])

/**
 * Joins a template into the document it was split from.
 *
 * @internal
 */
export const joinTemplate = (kind: string, name: string, template: DocumentTemplate): string =>
  render(kind, name, template, [""])

/**
 * Why the template can't be sliced for any prefixes, if it can't: an operation
 * directive references a variable, or a root selection is a fragment spread or
 * inline fragment.
 *
 * @internal
 */
export const templateUnsliceableReason = (template: DocumentTemplate): string | undefined => {
  if (template.directives !== undefined && template.directives.length > 1) {
    return "its operation directives reference variables"
  }
  if (template.selections.some((selection) => selection.name === undefined)) {
    return "it has a fragment spread or inline fragment at the root"
  }
  return undefined
}

/**
 * Renders one operation that repeats the template once per prefix. Each
 * slice's variables, root response keys and per-slice fragments are renamed
 * with its prefix; operation directives and shared fragments appear once.
 * Prefixes must start a GraphQL name, and none may be a prefix of another.
 *
 * Throws rather than producing an invalid document when the template is
 * unsliceable (see {@link templateUnsliceableReason}) or a renamed fragment
 * would take a shared fragment's name.
 *
 * @internal
 */
export const renderSlices = (
  kind: string,
  name: string,
  template: DocumentTemplate,
  prefixes: NonEmptyReadonlyArray<string>
): string => {
  const shared = new Set(template.fragments.filter(isShared).map((fragment) => fragment.name))
  const collision = template.fragments
    .flatMap((fragment) => isShared(fragment) ? [] : prefixes.map((prefix) => prefix + fragment.name))
    .find((renamed) => shared.has(renamed))
  const reason = templateUnsliceableReason(template) ??
    (collision === undefined ? undefined : `fragment ${collision} would collide with a shared fragment`)
  if (reason !== undefined) throw new Error(`Cannot render slices of operation ${name}: ${reason}`)
  return render(kind, name, template, prefixes)
}

/**
 * Forces POST for alias batches to avoid GET URL length limits.
 *
 * @internal
 */
export const ForcePost = Context.Reference<boolean>("effect/graphql/ForcePost", { defaultValue: () => false })

/**
 * The URL a resolver batch was grouped by, and the protocol `url` that
 * resolved it, so that transport sends the batch there without resolving it
 * again.
 *
 * @internal
 */
export type ResolvedUrl = {
  readonly resolve: GraphQLProtocol["Service"]["url"]
  readonly url: string
} | undefined

/**
 * Carries a {@link ResolvedUrl} from a resolver batch to the transport. The
 * client clears it while middleware run, so calls they make resolve their
 * own URL.
 *
 * @internal
 */
export const ResolvedUrl = Context.Reference<ResolvedUrl>("effect/graphql/ResolvedUrl", {
  defaultValue: () => undefined
})

/**
 * JSON with object keys sorted, so equal JSON values give equal strings.
 *
 * @internal
 */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_, value) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
      : value)

/**
 * Shared variable encoding, result decoding and client error mapping.
 *
 * @internal
 */
export const makeCodec = <Op extends GraphQL.Any>(operation: Op) => {
  const fail = (reason: Reason) => new GraphQLClientError({ operation: operation.name, reason })
  const schemaFail = (make: (description: string) => Reason) => (error: Schema.SchemaError) =>
    Effect.fail(fail(make(error.message)))
  const encode = Schema.encodeEffect(operation.variables)
  const decode = Schema.decodeUnknownEffect(operation.result)

  const encodeVariables = (
    variables: GraphQL.Variables<Op> | undefined
  ): Effect.Effect<unknown, GraphQLClientError, Op["variables"]["EncodingServices"]> =>
    Effect.catch(encode(variables ?? {}), schemaFail((description) => new EncodeError({ description })))

  const decodeData = (
    data: unknown
  ): Effect.Effect<GraphQL.Result<Op>, GraphQLClientError, Op["result"]["DecodingServices"]> =>
    Effect.catch(decode(data), schemaFail((description) => new DecodeError({ description })))

  // GraphQL requires errors when data is null or missing. Check before decoding,
  // since schemas such as Schema.Json accept null. A non-2xx result never
  // succeeds: without errors it is a TransportError carrying the HTTP metadata.
  const failResponse = (result: ExecutionResult): Effect.Effect<never, GraphQLClientError> => {
    const errors = result.errors ?? []
    if (isReadonlyArrayNonEmpty(errors)) return Effect.fail(fail(responseError(result, errors)))
    if (isStatusOk(result)) {
      return Effect.fail(fail(new DecodeError({ description: "data is null or missing without errors" })))
    }
    return Clock.clockWith((clock) =>
      Effect.fail(fail(
        new TransportError({
          description: `HTTP ${result.status} response without GraphQL errors`,
          status: result.status,
          headers: result.headers,
          retryAfter: parseRetryAfter(result.headers?.["retry-after"], clock.currentTimeMillisUnsafe())
        })
      ))
    )
  }

  const decodeStrict = (
    result: ExecutionResult
  ): Effect.Effect<GraphQL.Result<Op>, GraphQLClientError, Op["result"]["DecodingServices"]> =>
    !isStatusOk(result) || isReadonlyArrayNonEmpty(result.errors ?? []) || result.data === null ||
      result.data === undefined
      ? failResponse(result)
      : decodeData(result.data)

  const decodePartial = (
    result: ExecutionResult
  ): Effect.Effect<PartialResult<GraphQL.Result<Op>>, GraphQLClientError, Op["result"]["DecodingServices"]> => {
    if (!isStatusOk(result) || result.data === null || result.data === undefined) return failResponse(result)
    return Effect.map(decodeData(result.data), (data): PartialResult<GraphQL.Result<Op>> => {
      const partial = { data, errors: result.errors ?? [] }
      partialResponses.set(partial, result)
      return partial
    })
  }

  return { fail, schemaFail, encodeVariables, failResponse, decodeStrict, decodePartial } as const
}

/**
 * Client batch runners (middleware and protocol, using POST) and URLs for
 * resolver grouping. Mock and custom methods are not registered.
 *
 * @internal
 */
export const rawExecutors = new WeakMap<object, {
  readonly execute: (request: GraphQLRequest) => Effect.Effect<ExecutionResult, unknown, unknown>
  readonly url: GraphQLProtocol["Service"]["url"]
}>()

/**
 * Splits a batched response, removing prefixes from root keys and error paths.
 * Returns undefined if an error matches no slice or data is null or missing.
 *
 * @internal
 */
export const splitSlices = (
  result: ExecutionResult,
  template: DocumentTemplate,
  prefixes: ReadonlyArray<string>
): ReadonlyArray<ExecutionResult> | undefined => {
  const sliceErrors = prefixes.map((): Array<GraphQLError> => [])
  for (const error of result.errors ?? []) {
    const key = error.path?.[0]
    // No prefix is a prefix of another, so at most one matches.
    const index = typeof key === "string" ? prefixes.findIndex((prefix) => key.startsWith(prefix)) : -1
    if (index === -1) return undefined
    sliceErrors[index].push(
      { ...error, path: [(key as string).slice(prefixes[index].length), ...error.path!.slice(1)] } as GraphQLError
    )
  }
  if (result.data === null || result.data === undefined) return undefined
  const data = result.data as Record<string, unknown>
  return prefixes.map((prefix, i) => {
    const sliceData: Record<string, unknown> = {}
    for (const selection of template.selections) {
      const key = (selection.alias ?? selection.name)!
      if (Object.hasOwn(data, prefix + key)) sliceData[key] = data[prefix + key]
    }
    return { ...result, data: sliceData, errors: sliceErrors[i] }
  })
}

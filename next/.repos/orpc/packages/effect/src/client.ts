import type { AnyNestedClient, Client, ClientContext, ClientRest } from '@orpc/client'
import { RECURSIVE_CLIENT_UNWRAP_KEYS, resolveClientRest } from '@orpc/client'
import { anyAbortSignal, isTypescriptObject } from '@orpc/shared'
import { Effect } from 'effect'

function callAsEffect<TClientContext extends ClientContext, TInput, TOutput, TError>(
  client: Client<TClientContext, TInput, TOutput, TError>,
  ...rest: ClientRest<TClientContext, TInput>
): Effect.Effect<TOutput, TError> {
  const [input, options] = resolveClientRest(rest)

  return Effect.tryPromise({
    try: signal => client(input, {
      ...options,
      signal: anyAbortSignal([options.signal, signal]),
    }),
    catch: error => error as TError,
  })
}

export type EffectClient<T extends AnyNestedClient>
  = T extends Client<infer UContext, infer UInput, infer UOutput, infer UError>
    ? (...rest: ClientRest<UContext, UInput>) => Effect.Effect<UOutput, UError>
    : {
        [K in keyof T]: T[K] extends AnyNestedClient ? EffectClient<T[K]> : never
      }

/**
 * Creates a client whose procedures return lazy effects instead of promises,
 * so you can `yield*` calls inside Effect generators. Errors are captured in
 * the error channel with their original types preserved, and interrupting an
 * effect aborts the underlying call.
 *
 * @see {@link https://orpc.dev/docs/integrations/effect#client-calls | Effect Integration - Client Calls}
 */
export function createEffectClient<T extends AnyNestedClient>(client: T): EffectClient<T> {
  const cache = new Map<string, EffectClient<AnyNestedClient>>()

  const proxy = new Proxy((...rest: any[]) => callAsEffect(client as Client<ClientContext, unknown, unknown, unknown>, ...rest), {
    get(target, prop) {
      if (typeof prop !== 'string' || RECURSIVE_CLIENT_UNWRAP_KEYS.has(prop)) {
        return Reflect.get(target, prop)
      }

      let effectClient = cache.get(prop)

      if (effectClient === undefined) {
        const value = (client as Record<string, unknown>)[prop]

        if (!isTypescriptObject(value)) {
          return value
        }

        effectClient = createEffectClient(value as AnyNestedClient)
        cache.set(prop, effectClient)
      }

      return effectClient
    },
  })

  return proxy as EffectClient<T>
}

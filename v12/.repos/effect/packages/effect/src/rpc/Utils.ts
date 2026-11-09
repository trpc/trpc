/**
 * Buffers RPC protocol messages until their receive loop starts.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Semaphore from "../Semaphore.ts"
import type { Protocol } from "./RpcClient.ts"
import type { FromServerEncoded } from "./RpcMessage.ts"

/**
 * Buffers writes until `run` replays them with their original contexts and
 * installs the writer. Restores the previous writer when `run` ends.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const withRun = <
  A extends {
    readonly run: (f: (...args: Array<any>) => Effect.Effect<void>) => Effect.Effect<never>
  }
>() =>
<EX, RX>(f: (write: Parameters<A["run"]>[0]) => Effect.Effect<Omit<A, "run">, EX, RX>): Effect.Effect<A, EX, RX> =>
  Effect.suspend(() => {
    const semaphore = Semaphore.makeUnsafe(1)
    let buffer: Array<[Array<any>, Context.Context<never>]> = []
    let write = (...args: Array<any>): Effect.Effect<void> =>
      Effect.contextWith((context) => {
        buffer.push([args, context])
        return Effect.void
      })
    return Effect.map(f((...args) => write(...args)), (a) => ({
      ...a,
      run(f) {
        return semaphore.withPermits(1)(Effect.gen(function*() {
          const prev = write

          for (const [args, context] of buffer) {
            yield* Effect.provideContext(Effect.suspend(() => f(...args)), context)
          }
          buffer = []
          write = f

          return yield* Effect.onExit(Effect.never, () => {
            write = prev
            return Effect.void
          })
        }))
      }
    } as A))
  })

/**
 * Builds an RPC client protocol service that tracks active client IDs and
 * buffers server responses per client until that client's `run` handler is
 * installed.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const withRunClient = <EX, RX>(
  f: (
    write: (clientId: number, response: FromServerEncoded) => Effect.Effect<void>,
    clientIds: ReadonlySet<number>
  ) => Effect.Effect<Omit<Protocol["Service"], "run">, EX, RX>
): Effect.Effect<Protocol["Service"], EX, RX> =>
  Effect.suspend(() => {
    const clientIds = new Set<number>()
    const clientBuffers = new Map<number, Array<[FromServerEncoded, Context.Context<never>]>>()
    const clientWrites = new Map<number, (data: FromServerEncoded) => Effect.Effect<void>>()
    let write = (clientId: number, data: FromServerEncoded): Effect.Effect<void> =>
      Effect.contextWith((context) => {
        let buffer = clientBuffers.get(clientId)
        if (!buffer) {
          buffer = []
          clientBuffers.set(clientId, buffer)
        }
        buffer.push([data, context])
        return Effect.void
      })
    return Effect.map(
      f((clientId, data) => {
        const clientWrite = clientWrites.get(clientId)
        if (clientWrite) {
          return clientWrite(data)
        }
        return write(clientId, data)
      }, clientIds),
      (a) => ({
        ...a,
        run(clientId, f) {
          return Effect.gen(function*() {
            clientIds.add(clientId)
            clientWrites.set(clientId, f)

            const buffer = clientBuffers.get(clientId)
            if (buffer) {
              clientBuffers.delete(clientId)
              for (const [args, context] of buffer) {
                yield* Effect.provideContext(Effect.suspend(() => f(args)), context)
              }
            }

            return yield* Effect.onExit(Effect.never, () => {
              clientIds.delete(clientId)
              clientWrites.delete(clientId)
              return Effect.void
            })
          })
        }
      } satisfies Protocol["Service"])
    )
  })

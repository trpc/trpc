/**
 * Shared Node.js implementation of Effect's `Terminal` service.
 *
 * `NodeTerminal` adapts Node's `readline` APIs plus the current process
 * `stdin` and `stdout` streams into {@link Terminal.Terminal}. The service can
 * display output, read a line, stream key input, and read terminal dimensions.
 * `make` manages readline and TTY raw mode in a scope, while `layer` provides
 * the default service that ends key input on Ctrl+C or Ctrl+D.
 *
 * @since 4.0.0
 */
import type * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { badArgument, type PlatformError } from "effect/PlatformError"
import * as Predicate from "effect/Predicate"
import * as Queue from "effect/Queue"
import * as RcRef from "effect/RcRef"
import type * as Scope from "effect/Scope"
import * as Terminal from "effect/Terminal"
import * as readline from "node:readline"

/**
 * Creates a scoped process-backed `Terminal` using Node `readline`, enabling
 * TTY raw mode while in scope and using the supplied predicate to decide when
 * key input should end.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make: (
  shouldQuit?: (input: Terminal.UserInput) => boolean
) => Effect.Effect<Terminal.Terminal, never, Scope.Scope> = Effect.fnUntraced(
  function*(shouldQuit: (input: Terminal.UserInput) => boolean = defaultShouldQuit) {
    const stdin = process.stdin
    const stdout = process.stdout
    const lines = yield* Queue.make<string, Cause.Done>()

    // stdin "end" fires once per process, so remember end-of-input for readers
    // created after the event (Bun never sets `readableEnded`).
    let inputEnded = stdin.readableEnded
    let readlineActive = false
    const onStdinEnd = () => {
      inputEnded = true
      if (!readlineActive) {
        Queue.endUnsafe(lines)
      }
    }
    stdin.once("end", onStdinEnd)
    yield* Effect.addFinalizer(() => Effect.sync(() => stdin.off("end", onStdinEnd)))

    const rlRef = yield* RcRef.make({
      acquire: Effect.acquireRelease(
        Effect.sync(() => {
          const rl = readline.createInterface({ input: stdin, escapeCodeTimeout: 50 })
          const onLine = (line: string) => Queue.offerUnsafe(lines, line)
          const onClose = () => {
            readlineActive = false
            Queue.endUnsafe(lines)
          }
          readlineActive = true
          readline.emitKeypressEvents(stdin, rl)
          rl.on("line", onLine)
          rl.once("close", onClose)

          if (stdin.isTTY) {
            stdin.setRawMode(true)
          }
          return { rl, onClose, onLine }
        }),
        ({ rl, onClose, onLine }) =>
          Effect.sync(() => {
            readlineActive = false
            rl.off("line", onLine)
            rl.off("close", onClose)
            if (stdin.isTTY) {
              stdin.setRawMode(false)
            }
            rl.close()
            if (inputEnded) {
              Queue.endUnsafe(lines)
            }
          })
      ),
      idleTimeToLive: "10 millis"
    })

    const columns = Effect.sync(() => stdout.columns ?? 0)
    const rows = Effect.sync(() => stdout.rows ?? 0)

    const readInput = Effect.gen(function*() {
      const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>()
      const handleKeypress = (s: string | undefined, k: readline.Key) => {
        const userInput = {
          input: Option.fromUndefinedOr(s),
          key: { name: k.name ?? "", ctrl: !!k.ctrl, meta: !!k.meta, shift: !!k.shift }
        }
        Queue.offerUnsafe(queue, userInput)
        if (shouldQuit(userInput)) {
          Queue.endUnsafe(queue)
        }
      }
      // Deno's `process.stdin` shim does not keep the event loop alive, so a
      // program blocked on input can exit before `end` is ever delivered. A
      // timer holds the loop open for as long as this reader is active.
      const keepAlive = setInterval(() => {}, 2147483647)
      // Without this, consumers (e.g. `Prompt.run`) hang forever on closed stdin.
      const handleEnd = () => {
        clearInterval(keepAlive)
        Queue.endUnsafe(queue)
      }
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          clearInterval(keepAlive)
          stdin.off("keypress", handleKeypress)
          stdin.off("end", handleEnd)
        })
      )
      stdin.on("keypress", handleKeypress)
      if (inputEnded) {
        handleEnd()
      } else {
        yield* RcRef.get(rlRef)
        stdin.once("end", handleEnd)
      }
      return queue as Queue.Dequeue<Terminal.UserInput, Cause.Done>
    })

    const readLine = Effect.suspend(() =>
      Queue.poll(lines).pipe(
        Effect.flatMap(Option.match({
          onNone: () => Effect.scoped(Effect.andThen(RcRef.get(rlRef), Queue.take(lines))),
          onSome: Effect.succeed
        })),
        Effect.mapError(() => new Terminal.QuitError({}))
      )
    )

    const display = (prompt: string) =>
      Effect.uninterruptible(
        Effect.callback<void, PlatformError>((resume) => {
          stdout.write(prompt, (err) =>
            Predicate.isNullish(err)
              ? resume(Effect.void)
              : resume(Effect.fail(
                badArgument({
                  module: "Terminal",
                  method: "display",
                  description: "Failed to write prompt to stdout",
                  cause: err
                })
              )))
        })
      )

    return Terminal.make({
      columns,
      rows,
      readInput,
      readLine,
      display
    })
  }
)

/**
 * Provides the default process-backed `Terminal` service, ending key input on
 * Ctrl+C or Ctrl+D.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Terminal.Terminal> = Layer.effect(Terminal.Terminal, make(defaultShouldQuit))

function defaultShouldQuit(input: Terminal.UserInput) {
  return input.key.ctrl && (input.key.name === "c" || input.key.name === "d")
}

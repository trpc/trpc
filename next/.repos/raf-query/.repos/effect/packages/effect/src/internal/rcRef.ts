import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import { identity } from "../Function.ts"
import { pipeArguments } from "../Pipeable.ts"
import type * as RcRef from "../RcRef.ts"
import * as Scope from "../Scope.ts"

const TypeId = "~effect/RcRef"

type State<A> = State.Empty | State.Acquiring<A> | State.Acquired<A> | State.Closed

declare namespace State {
  interface Empty {
    readonly _tag: "Empty"
  }

  interface Acquiring<A> {
    readonly _tag: "Acquiring"
    // Assigned as soon as the acquisition is forked.
    fiber: Fiber.Fiber<Acquired<A>, unknown>
    awaiters: number
    // Set once references are allocated to the waiters, which can happen
    // before the acquisition fiber exits.
    acquired: Acquired<A> | undefined
  }

  interface Acquired<A> {
    readonly _tag: "Acquired"
    readonly value: A
    readonly scope: Scope.Closeable
    fiber: Fiber.Fiber<void, never> | undefined
    refCount: number
    invalidated: boolean
  }

  interface Closed {
    readonly _tag: "Closed"
  }
}

const stateEmpty: State<never> = { _tag: "Empty" }
const stateClosed: State<never> = { _tag: "Closed" }

const variance: RcRef.RcRef.Variance<any, any> = {
  _A: identity,
  _E: identity
}

class RcRefImpl<A, E> implements RcRef.RcRef<A, E> {
  readonly [TypeId]: RcRef.RcRef.Variance<A, E> = variance

  pipe() {
    return pipeArguments(this, arguments)
  }

  state: State<A> = stateEmpty
  readonly acquire: Effect.Effect<A, E>
  readonly context: Context.Context<never>
  readonly scope: Scope.Scope
  readonly idleTimeToLive: Duration.Duration | undefined

  constructor(
    acquire: Effect.Effect<A, E>,
    context: Context.Context<never>,
    scope: Scope.Scope,
    idleTimeToLive: Duration.Duration | undefined
  ) {
    this.acquire = acquire
    this.context = context
    this.scope = scope
    this.idleTimeToLive = idleTimeToLive
  }
}

/** @internal */
export const make = <A, E, R>(options: {
  readonly acquire: Effect.Effect<A, E, R>
  readonly idleTimeToLive?: Duration.Input | undefined
}) =>
  Effect.withFiber<RcRef.RcRef<A, E>, never, R | Scope.Scope>((fiber) => {
    const context = fiber.context as Context.Context<R | Scope.Scope>
    const scope = Context.get(context, Scope.Scope)
    const ref = new RcRefImpl<A, E>(
      options.acquire as Effect.Effect<A, E>,
      context,
      scope,
      options.idleTimeToLive !== undefined
        ? Duration.fromInputUnsafe(options.idleTimeToLive)
        : undefined
    )
    return Effect.as(
      Scope.addFinalizerExit(scope, () => {
        const state = ref.state
        ref.state = stateClosed
        if (state._tag === "Acquired") return Scope.close(state.scope, Exit.void)
        if (state._tag === "Acquiring") return Fiber.interrupt(state.fiber)
        return Effect.void
      }),
      ref
    )
  })

const getState = <A, E>(
  self: RcRefImpl<A, E>,
  restore: <AX, EX, RX>(effect: Effect.Effect<AX, EX, RX>) => Effect.Effect<AX, EX, RX>
): Effect.Effect<State.Acquired<A>, E> => {
  switch (self.state._tag) {
    case "Closed": {
      return Effect.interrupt
    }
    case "Acquired": {
      const state = self.state
      state.refCount++
      return state.fiber
        ? Effect.as(Fiber.interrupt(state.fiber), state)
        : Effect.succeed(state)
    }
    case "Acquiring": {
      const state = self.state
      state.awaiters++
      return awaitAcquiring(self, state, restore)
    }
    case "Empty": {
      // The caller that starts the acquisition counts as its first awaiter.
      const acquiring: State.Acquiring<A> = {
        _tag: "Acquiring",
        fiber: undefined as any,
        awaiters: 1,
        acquired: undefined
      }
      self.state = acquiring
      const scope = Scope.makeUnsafe()
      // Acquire on a detached fiber so the acquisition is shared by every
      // caller and only interrupted once all of them have been interrupted.
      const acquire = Effect.provideContext(
        self.acquire as Effect.Effect<A, E>,
        Context.add(self.context, Scope.Scope, scope)
      ).pipe(
        Effect.flatMap((value) => {
          // The ref was closed, or the acquisition was abandoned.
          if (self.state !== acquiring) {
            return Effect.interrupt
          }
          const state: State.Acquired<A> = {
            _tag: "Acquired",
            value,
            scope,
            fiber: undefined,
            // Every caller still waiting holds a reference.
            refCount: acquiring.awaiters,
            invalidated: false
          }
          self.state = state
          acquiring.acquired = state
          return Effect.succeed(state)
        }),
        Effect.onExit((exit) => {
          if (Exit.isSuccess(exit)) return Effect.void
          if (self.state === acquiring) self.state = stateEmpty
          return Scope.close(scope, exit)
        })
      )
      acquiring.fiber = Effect.runForkWith(Fiber.getCurrent()!.context)(acquire)
      return awaitAcquiring(self, acquiring, restore)
    }
  }
}

const awaitAcquiring = <A, E>(
  self: RcRefImpl<A, E>,
  acquiring: State.Acquiring<A>,
  restore: <AX, EX, RX>(effect: Effect.Effect<AX, EX, RX>) => Effect.Effect<AX, EX, RX>
): Effect.Effect<State.Acquired<A>, E> =>
  Effect.onExit(
    restore(Fiber.join(acquiring.fiber)) as Effect.Effect<State.Acquired<A>, E>,
    (exit) => {
      const acquired = acquiring.acquired
      if (acquired !== undefined) {
        // The acquisition counted this caller as a reference, possibly before
        // its fiber exited. Release it if the caller was interrupted before it
        // could register its finalizer.
        return Exit.isFailure(exit) ? release(self, acquired) : Effect.void
      }
      // Abandon the acquisition once every caller has left, unless it already
      // failed (a failed acquisition allocated no references).
      if (--acquiring.awaiters > 0 || self.state !== acquiring) return Effect.void
      // Detach it first so new callers start a fresh acquisition instead of
      // joining one that is being interrupted.
      self.state = stateEmpty
      return Fiber.interrupt(acquiring.fiber)
    }
  )

/** @internal */
export const get = <A, E>(self_: RcRef.RcRef<A, E>): Effect.Effect<A, E, Scope.Scope> => {
  const self = self_ as RcRefImpl<A, E>
  return Effect.uninterruptibleMask((restore) =>
    Effect.flatMap(
      Effect.scope,
      (scope) =>
        Effect.flatMap(getState(self, restore), (state) =>
          Effect.as(Scope.addFinalizerExit(scope, () => release(self, state)), state.value))
    )
  )
}

const release = <A, E>(self: RcRefImpl<A, E>, state: State.Acquired<A>): Effect.Effect<void> => {
  state.refCount--
  if (state.refCount > 0) {
    return Effect.void
  }
  const idleTimeToLive = self.idleTimeToLive
  if (idleTimeToLive === undefined || state.invalidated) {
    if (self.state === state) {
      self.state = stateEmpty
    }
    return Scope.close(state.scope, Exit.void)
  } else if (!Duration.isFinite(idleTimeToLive)) {
    return Effect.void
  }
  state.fiber = Effect.uninterruptibleMask((restore) =>
    Effect.flatMap(restore(Effect.sleep(idleTimeToLive)), () => {
      if (self.state === state && state.refCount === 0) {
        self.state = stateEmpty
        return Scope.close(state.scope, Exit.void)
      }
      return Effect.void
    })
  ).pipe(
    Effect.ensuring(Effect.sync(() => {
      state.fiber = undefined
    })),
    Effect.runForkWith(self.context),
    Fiber.runIn(self.scope)
  )
  return Effect.void
}

/** @internal */
export const invalidate = <A, E>(
  self_: RcRef.RcRef<A, E>
): Effect.Effect<void> => {
  const self = self_ as RcRefImpl<A, E>
  return Effect.uninterruptible(Effect.suspend(() => {
    if (self.state._tag !== "Acquired") {
      return Effect.void
    }
    const state = self.state
    self.state = stateEmpty
    state.invalidated = true
    if (state.refCount > 0) {
      return Effect.void
    }
    state.fiber?.interruptUnsafe()
    return Scope.close(state.scope, Exit.void)
  }))
}

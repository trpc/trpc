import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Ref from "effect/Ref"
import type * as Scope from "effect/Scope"

interface Counter {
  acquire(): Effect.Effect<number, never, Scope.Scope>
  incrementAcquire(): Effect.Effect<number>
  incrementRelease(): Effect.Effect<number>
  acquired(): Effect.Effect<number>
  released(): Effect.Effect<number>
}

class CounterImpl implements Counter {
  constructor(readonly ref: Ref.Ref<readonly [number, number]>) {}

  acquire(): Effect.Effect<number, never, Scope.Scope> {
    return pipe(
      this.incrementAcquire(),
      Effect.andThen(Effect.addFinalizer(() => this.incrementRelease())),
      Effect.andThen(this.acquired()),
      Effect.uninterruptible
    )
  }

  incrementAcquire(): Effect.Effect<number> {
    return Ref.modify(this.ref, ([acquire, release]) => [acquire + 1, [acquire + 1, release] as const] as const)
  }

  incrementRelease(): Effect.Effect<number> {
    return Ref.modify(this.ref, ([acquire, release]) => [release + 1, [acquire, release + 1] as const] as const)
  }

  acquired(): Effect.Effect<number> {
    return pipe(
      Ref.get(this.ref),
      Effect.map((tuple) => tuple[0])
    )
  }

  released(): Effect.Effect<number> {
    return pipe(
      Ref.get(this.ref),
      Effect.map((tuple) => tuple[1])
    )
  }
}

export const make = (): Effect.Effect<Counter> => {
  return pipe(
    Ref.make([0, 0]),
    Effect.map((ref) => new CounterImpl(ref as any))
  )
}

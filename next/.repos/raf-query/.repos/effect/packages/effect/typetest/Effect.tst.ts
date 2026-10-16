/** @effect-diagnostics floatingEffect:skip-file missingEffectError:skip-file */
import {
  type Cause,
  type Channel,
  Context,
  Data,
  Duration,
  Effect,
  type ExecutionPlan,
  Exit,
  Fiber,
  HashMap,
  type Layer,
  Metric,
  type Option,
  pipe,
  Result,
  Schedule,
  type Scope,
  type Sink,
  type Stream,
  type Types,
  Unify
} from "effect"
import { describe, expect, it } from "tstyche"

// Fixtures
class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly retryAfter: number
}> {}

class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
  readonly limit: number
}> {}

class UnknownAiModelError extends Data.TaggedError("UnknownAiModelError")<{
  readonly model: string
}> {}

class AiError extends Data.TaggedError("AiError")<{
  readonly reason: RateLimitError | QuotaExceededError | UnknownAiModelError
}> {}

class OtherError extends Data.TaggedError("OtherError")<{
  readonly message: string
}> {}

class SimpleError extends Data.TaggedError("SimpleError")<{
  readonly code: number
}> {}

declare const aiEffect: Effect.Effect<string, AiError>
declare const mixedEffect: Effect.Effect<string, AiError | OtherError>
declare const simpleEffect: Effect.Effect<string, SimpleError>
declare const noSuchOrOther: Effect.Effect<string, Cause.NoSuchElementError | OtherError>
declare const onlyNoSuch: Effect.Effect<number, Cause.NoSuchElementError>

declare const string: Effect.Effect<string, "err-1", "dep-1">
declare const number: Effect.Effect<number, "err-2", "dep-2">
declare const stringOrNumber: Effect.Effect<string, "err-1", "dep-1"> | Effect.Effect<number, "err-2", "dep-2">
declare const streamStringOrNumber: Stream.Stream<string, "err-1", "dep-1"> | Stream.Stream<number, "err-2", "dep-2">
declare const sinkStringOrNumber:
  | Sink.Sink<string, string, "left-1", "err-1", "dep-1">
  | Sink.Sink<number, string, "left-2", "err-2", "dep-2">
declare const channelStringOrNumber:
  | Channel.Channel<string, "out-err-1", "out-done-1", string, "in-err", "in-done", "dep-1">
  | Channel.Channel<number, "out-err-2", "out-done-2", string, "in-err", "in-done", "dep-2">
declare const layerStringOrNumber:
  | Layer.Layer<"out-1", "err-1", "dep-1">
  | Layer.Layer<"out-2", "err-2", "dep-2">
declare const optionString: Option.Option<string>
declare const optionStringOrNumber: Option.Option<string> | Option.Option<number>
declare const resultStringOrNumber: Result.Result<string, "err-1"> | Result.Result<number, "err-2">
declare const fiberStringOrNumber: Fiber.Fiber<string, "err-1"> | Fiber.Fiber<number, "err-2">
declare const stringArray: Array<Effect.Effect<string, "err-3", "dep-3">>
declare const numberRecord: Record<string, Effect.Effect<number, "err-4", "dep-4">>
declare const unionRecord: { a: typeof string } | { b: typeof number }
declare const optionalEffect: Option.Option<Effect.Effect<string, "err-1", "dep-1">>
declare const iterableString: Effect.Effect<Iterable<string>, "err-1", "dep-1">
declare const unknownValue: unknown

describe("Effect.isEffect", () => {
  it("narrows unknown values to unknown success, error, and service types", () => {
    if (Effect.isEffect(unknownValue)) {
      expect(unknownValue).type.toBe<Effect.Effect<unknown, unknown, unknown>>()
    }
  })
})

describe("Effect.orElseSucceed", () => {
  it("passes the previous error in data-first usage", () => {
    const result = Effect.orElseSucceed(string, (error) => {
      expect(error).type.toBe<"err-1">()
      return error.length
    })
    expect(result).type.toBe<Effect.Effect<string | number, never, "dep-1">>()
  })
})

class AcquireReleaseDependency extends Context.Service<AcquireReleaseDependency, string>()(
  "AcquireReleaseDependency"
) {}

class UpdateServiceScopedService extends Context.Service<UpdateServiceScopedService, number>()(
  "UpdateServiceScopedService"
) {}

const UpdateServiceScopedReference = Context.Reference<number>("UpdateServiceScopedReference", {
  defaultValue: () => 0
})

class ProvideServiceEffectServiceLiteral extends Context.Service<ProvideServiceEffectServiceLiteral, "LITERAL">()(
  "ProvideServiceEffectServiceLiteral"
) {}

describe("Types", () => {
  describe("ReasonOf", () => {
    it("extracts reason type", () => {
      expect<Types.ReasonOf<AiError>>().type.toBe<RateLimitError | QuotaExceededError | UnknownAiModelError>()
    })

    it("returns never for errors without reason", () => {
      expect<Types.ReasonOf<SimpleError>>().type.toBe<never>()
    })
  })

  describe("ReasonTags", () => {
    it("extracts reason tags", () => {
      expect<Types.ReasonTags<AiError> & unknown>().type.toBe<
        "RateLimitError" | "QuotaExceededError" | "UnknownAiModelError"
      >()
    })

    it("returns never for errors without reason", () => {
      expect<Types.ReasonTags<SimpleError>>().type.toBe<never>()
    })
  })

  describe("ExtractReason", () => {
    it("extracts specific reason", () => {
      expect<Types.ExtractReason<AiError, "RateLimitError">>().type.toBe<RateLimitError>()
    })

    it("returns never for invalid tag", () => {
      expect<Types.ExtractReason<AiError, "Invalid">>().type.toBe<never>()
    })
  })
})

describe("Effect.try", () => {
  it("infers UnknownError for the direct-thunk form", () => {
    const result = Effect.try(() => 1)
    expect(result).type.toBe<Effect.Effect<number, Cause.UnknownError>>()
  })

  it("rejects a narrower return annotation for the direct-thunk form", () => {
    function load(): Effect.Effect<number, SimpleError> {
      // @ts-expect-error is not assignable to type
      return Effect.try(() => 1)
    }
    expect(load).type.toBe<() => Effect.Effect<number, SimpleError>>()
  })

  it("infers the mapped error from the options form", () => {
    const result = Effect.try({
      try: () => 1,
      catch: () => new SimpleError({ code: 1 })
    })
    expect(result).type.toBe<Effect.Effect<number, SimpleError>>()
  })

  it("rejects a generic alias that erases UnknownError", () => {
    expect(Effect.try).type.not.toBeAssignableTo<
      <A, E>(
        options: (() => A) | { readonly try: () => A; readonly catch: (error: unknown) => E }
      ) => Effect.Effect<A, E>
    >()
  })
})

describe("Effect.tryPromise", () => {
  it("infers UnknownError for the direct-thunk form", () => {
    const result = Effect.tryPromise((signal) => {
      expect(signal).type.toBe<AbortSignal>()
      return Promise.resolve(1)
    })
    expect(result).type.toBe<Effect.Effect<number, Cause.UnknownError>>()
  })

  it("rejects a narrower return annotation for the direct-thunk form", () => {
    function load(): Effect.Effect<number, SimpleError> {
      // @ts-expect-error is not assignable to type
      return Effect.tryPromise(() => Promise.resolve(1))
    }
    expect(load).type.toBe<() => Effect.Effect<number, SimpleError>>()
  })

  it("infers the mapped error from the options form", () => {
    const result = Effect.tryPromise({
      try: (signal) => {
        expect(signal).type.toBe<AbortSignal>()
        return Promise.resolve(1)
      },
      catch: () => new SimpleError({ code: 1 })
    })
    expect(result).type.toBe<Effect.Effect<number, SimpleError>>()
  })

  it("rejects a generic alias that erases UnknownError", () => {
    expect(Effect.tryPromise).type.not.toBeAssignableTo<
      <A, E>(
        options:
          | ((signal: AbortSignal) => PromiseLike<A>)
          | { readonly try: (signal: AbortSignal) => PromiseLike<A>; readonly catch: (error: unknown) => E }
      ) => Effect.Effect<A, E>
    >()
  })
})

describe("Effect.catchReason", () => {
  it("handler receives reason type", () => {
    pipe(
      aiEffect,
      Effect.catchReason("AiError", "RateLimitError", (reason) => {
        expect(reason).type.toBe<RateLimitError>()
        return Effect.succeed("ok")
      })
    )
  })

  it("handler receives error type", () => {
    pipe(
      aiEffect,
      Effect.catchReason("AiError", "RateLimitError", (_reason, error) => {
        expect(error.reason).type.toBe<RateLimitError>()
        return Effect.succeed("ok")
      })
    )
  })

  it("orElse receives error type", () => {
    pipe(
      aiEffect,
      Effect.catchReason(
        "AiError",
        "RateLimitError",
        () => Effect.succeed("ok"),
        (_reason, error) => {
          expect(error.reason).type.toBe<QuotaExceededError | UnknownAiModelError>()
          return Effect.succeed("ok")
        }
      )
    )
  })

  it("error channel is E | E2", () => {
    const result = pipe(
      aiEffect,
      Effect.catchReason("AiError", "RateLimitError", () => Effect.fail(new OtherError({ message: "" })))
    )
    expect(result).type.toBe<Effect.Effect<string, AiError | OtherError>>()
  })

  // Soundness guard for https://github.com/Effect-TS/effect-smol/issues/2142: a re-failing `orElse`
  // (success type `never`) must not erase the other unhandled error tags via conditional distribution.
  it("keeps other error tags when orElse re-fails", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchReason(
        "AiError",
        "RateLimitError",
        () => Effect.succeed("ok"),
        () => Effect.fail(new SimpleError({ code: 1 }))
      )
    )
    expect(result).type.toBe<Effect.Effect<string, OtherError | SimpleError>>()
  })
})

describe("Effect.transposeOption", () => {
  it("preserves success, error, and requirements", () => {
    const result = Effect.transposeOption(optionalEffect)
    expect(result).type.toBe<Effect.Effect<Option.Option<string>, "err-1", "dep-1">>()
  })
})

describe("Effect.fromOption", () => {
  it("uses NoSuchElementError by default", () => {
    const result = Effect.fromOption(optionString)
    expect(result).type.toBe<Effect.Effect<string, Cause.NoSuchElementError>>()
  })

  it("supports a custom error in data-first form", () => {
    const result = Effect.fromOption(optionString, () => new SimpleError({ code: 1 }))
    expect(result).type.toBe<Effect.Effect<string, SimpleError>>()
  })

  it("supports an inline HashMap lookup in data-first form", () => {
    const values = HashMap.make(["key", 1])
    const result = Effect.fromOption(HashMap.get(values, "key"), () => new SimpleError({ code: 1 }))
    expect(result).type.toBe<Effect.Effect<number, SimpleError>>()
  })

  it("supports a custom error in data-last form", () => {
    const result = pipe(
      optionString,
      Effect.fromOption(() => new SimpleError({ code: 1 }))
    )
    expect(result).type.toBe<Effect.Effect<string, SimpleError>>()
  })

  it("supports an inline HashMap lookup in data-last form", () => {
    const values = HashMap.make(["key", 1])
    const result = pipe(
      HashMap.get(values, "key"),
      Effect.fromOption(() => new SimpleError({ code: 1 }))
    )
    expect(result).type.toBe<Effect.Effect<number, SimpleError>>()
  })

  it("uses NoSuchElementError for an explicitly undefined onNone", () => {
    const result = Effect.fromOption(optionString, undefined)
    expect(result).type.toBe<Effect.Effect<string, Cause.NoSuchElementError>>()
  })

  it("includes NoSuchElementError for an optional onNone", () => {
    const forward = <A, E>(option: Option.Option<A>, onNone?: () => E) => Effect.fromOption(option, onNone)
    const result = forward(optionString, () => new SimpleError({ code: 1 }))
    expect(result).type.toBe<Effect.Effect<string, SimpleError | Cause.NoSuchElementError>>()
  })

  it("rejects an error callback as the data-first value", () => {
    // @ts-expect-error is not assignable to parameter
    Effect.fromOption(() => new SimpleError({ code: 1 }), () => new OtherError({ message: "missing" }))
  })

  it("supports callback usage with the default error", () => {
    const result = Effect.flatMap(Effect.succeed(optionString), Effect.fromOption)
    expect(result).type.toBe<Effect.Effect<string, Cause.NoSuchElementError>>()
  })
})

describe("Effect.firstSuccessOf", () => {
  it("infers success, error, and requirements from the effect collection", () => {
    const result = Effect.firstSuccessOf([
      string,
      number
    ])

    expect(result).type.toBe<Effect.Effect<string | number, "err-1" | "err-2", "dep-1" | "dep-2">>()
  })
})

describe("Effect.head", () => {
  it("infers the element and preserves the source error and requirements", () => {
    const result = Effect.head(iterableString)
    expect(result).type.toBe<Effect.Effect<string, "err-1" | Cause.NoSuchElementError, "dep-1">>()
  })
})

describe("Effect.catchReasons", () => {
  it("handlers receive respective reason types", () => {
    pipe(
      aiEffect,
      Effect.catchReasons("AiError", {
        RateLimitError: (r) => {
          expect(r).type.toBe<RateLimitError>()
          return Effect.succeed("")
        },
        QuotaExceededError: (r) => {
          expect(r).type.toBe<QuotaExceededError>()
          return Effect.succeed("")
        }
      })
    )
  })

  it("handlers receive error type", () => {
    pipe(
      aiEffect,
      Effect.catchReasons("AiError", {
        RateLimitError: (_r, error) => {
          expect(error.reason).type.toBe<RateLimitError>()
          return Effect.succeed("")
        },
        QuotaExceededError: (_r, error) => {
          expect(error.reason).type.toBe<QuotaExceededError>()
          return Effect.succeed("")
        }
      })
    )
  })

  it("unifies handler return types", () => {
    const result = pipe(
      aiEffect,
      Effect.catchReasons("AiError", {
        RateLimitError: () => Effect.succeed(42),
        QuotaExceededError: () => Effect.fail(new OtherError({ message: "" }))
      })
    )
    expect(result).type.toBe<Effect.Effect<string | number, AiError | OtherError>>()
  })

  it("allows partial handlers", () => {
    const result = pipe(
      aiEffect,
      Effect.catchReasons("AiError", {
        RateLimitError: () => Effect.succeed("handled")
      })
    )
    expect(result).type.toBe<Effect.Effect<string, AiError>>()
  })

  it("orElse", () => {
    const result = pipe(
      aiEffect,
      Effect.catchReasons("AiError", {
        RateLimitError: (r) => {
          expect(r).type.toBe<RateLimitError>()
          return Effect.succeed("")
        }
      }, (others) => {
        expect(others).type.toBe<QuotaExceededError | UnknownAiModelError>()
        return Effect.succeed("")
      })
    )
    expect(result).type.toBe<Effect.Effect<string>>()
  })

  it("orElse receives error type", () => {
    const result = pipe(
      aiEffect,
      Effect.catchReasons("AiError", {
        RateLimitError: () => Effect.succeed("")
      }, (_others, error) => {
        expect(error.reason).type.toBe<QuotaExceededError | UnknownAiModelError>()
        return Effect.succeed("")
      })
    )
    expect(result).type.toBe<Effect.Effect<string>>()
  })

  it("keeps other error tags when orElse re-fails", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchReasons(
        "AiError",
        { RateLimitError: () => Effect.succeed("ok") },
        () => Effect.fail(new SimpleError({ code: 1 }))
      )
    )
    expect(result).type.toBe<Effect.Effect<string, OtherError | SimpleError>>()
  })
})

describe("Effect.catchTag", () => {
  it("removes the handled error from the error channel when orElse is omitted", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchTag("AiError", () => Effect.succeed("ok"))
    )
    expect(result).type.toBe<Effect.Effect<string, OtherError>>()
  })

  it("removes the handled error in data-first usage when orElse is omitted", () => {
    const result = Effect.catchTag(mixedEffect, "AiError", () => Effect.succeed("ok"))
    expect(result).type.toBe<Effect.Effect<string, OtherError>>()
  })

  it("handles an array of tags", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchTag(["AiError", "OtherError"], (error) => {
        expect(error).type.toBe<AiError | OtherError>()
        return Effect.succeed("ok")
      })
    )
    expect(result).type.toBe<Effect.Effect<string>>()
  })

  it("supports orElse", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchTag(
        "AiError",
        () => Effect.succeed("ok"),
        (error) => {
          expect(error).type.toBe<OtherError>()
          return Effect.fail(new SimpleError({ code: 1 }))
        }
      )
    )
    expect(result).type.toBe<Effect.Effect<string, SimpleError>>()
  })

  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Effect<string, SimpleError, never>'
    const _program: Effect.Effect<string, SimpleError> = pipe(
      mixedEffect,
      Effect.catchTag("AiError", () => Effect.fail(new SimpleError({ code: 1 })))
    )
    expect(_program).type.toBe<Effect.Effect<string, SimpleError>>()
  })
})

describe("Effect.catchTags", () => {
  it("removes handled errors when orElse is omitted", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchTags({ AiError: () => Effect.succeed("ok") })
    )
    expect(result).type.toBe<Effect.Effect<string, OtherError>>()
  })

  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Effect<string, SimpleError, never>'
    const _program: Effect.Effect<string, SimpleError> = pipe(
      mixedEffect,
      Effect.catchTags({ AiError: () => Effect.fail(new SimpleError({ code: 1 })) })
    )
    expect(_program).type.toBe<Effect.Effect<string, SimpleError>>()
  })

  it("supports fallback in data-last usage", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchTags(
        {
          AiError: (error) => {
            expect(error).type.toBe<AiError>()
            return Effect.succeed("ok")
          }
        },
        (error) => {
          expect(error).type.toBe<OtherError>()
          return Effect.fail(new SimpleError({ code: 1 }))
        }
      )
    )
    expect(result).type.toBe<Effect.Effect<string, SimpleError>>()
  })

  it("supports fallback in data-first usage", () => {
    const result = Effect.catchTags(
      mixedEffect,
      {
        AiError: () => Effect.succeed(1)
      },
      (error) => {
        expect(error).type.toBe<OtherError>()
        return Effect.succeed(2)
      }
    )
    expect(result).type.toBe<Effect.Effect<string | number>>()
  })
})

describe("Effect.catchIf", () => {
  it("removes the refined error when orElse is omitted", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchIf((e): e is AiError => e._tag === "AiError", () => Effect.succeed("ok"))
    )
    expect(result).type.toBe<Effect.Effect<string, OtherError>>()
  })

  it("keeps the full error type with a plain predicate", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchIf((e): boolean => e._tag === "AiError", () => Effect.succeed("ok"))
    )
    expect(result).type.toBe<Effect.Effect<string, AiError | OtherError>>()
  })

  it("supports orElse", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchIf(
        (e): e is AiError => e._tag === "AiError",
        () => Effect.succeed("ok"),
        (error) => {
          expect(error).type.toBe<OtherError>()
          return Effect.fail(new SimpleError({ code: 1 }))
        }
      )
    )
    expect(result).type.toBe<Effect.Effect<string, SimpleError>>()
  })

  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Effect<string, SimpleError, never>'
    const _program: Effect.Effect<string, SimpleError> = pipe(
      mixedEffect,
      Effect.catchIf((e): e is AiError => e._tag === "AiError", () => Effect.fail(new SimpleError({ code: 1 })))
    )
    expect(_program).type.toBe<Effect.Effect<string, SimpleError>>()
  })
})

describe("Effect.catchFilter", () => {
  it("removes the matched error when orElse is omitted", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchFilter(
        (e) => (e._tag === "AiError" ? Result.succeed(e) : Result.fail(e)),
        () => Effect.succeed("ok")
      )
    )
    expect(result).type.toBe<Effect.Effect<string, OtherError>>()
  })

  it("supports orElse", () => {
    const result = pipe(
      mixedEffect,
      Effect.catchFilter(
        (e) => (e._tag === "AiError" ? Result.succeed(e) : Result.fail(e)),
        () => Effect.succeed("ok"),
        (error) => {
          expect(error).type.toBe<OtherError>()
          return Effect.fail(new SimpleError({ code: 1 }))
        }
      )
    )
    expect(result).type.toBe<Effect.Effect<string, SimpleError>>()
  })

  it("keeps unhandled errors under an explicit annotation (orElse omitted)", () => {
    // @ts-expect-error is not assignable to type 'Effect<string, SimpleError, never>'
    const _program: Effect.Effect<string, SimpleError> = pipe(
      mixedEffect,
      Effect.catchFilter(
        (e) => (e._tag === "AiError" ? Result.succeed(e) : Result.fail(e)),
        () => Effect.fail(new SimpleError({ code: 1 }))
      )
    )
    expect(_program).type.toBe<Effect.Effect<string, SimpleError>>()
  })
})

describe("Effect.catchNoSuchElement", () => {
  it("removes NoSuchElementError from the error channel", () => {
    const result = pipe(noSuchOrOther, Effect.catchNoSuchElement)
    expect(result).type.toBe<Effect.Effect<Option.Option<string>, OtherError>>()
  })

  it("yields never when NoSuchElementError is the only error", () => {
    const result = pipe(onlyNoSuch, Effect.catchNoSuchElement)
    expect(result).type.toBe<Effect.Effect<Option.Option<number>>>()
  })
})

describe("Effect.context", () => {
  it("defaults R to never", () => {
    const result = Effect.context()
    expect(result).type.toBe<Effect.Effect<Context.Context<never>, never, never>>()
  })
})

describe("Effect do notation", () => {
  it("exports Do and combinators", () => {
    const result = pipe(
      Effect.Do,
      Effect.bind("a", () => Effect.succeed(1)),
      Effect.let("b", ({ a }) => a + 1),
      Effect.bind("c", ({ b }) => Effect.succeed(b.toString()))
    )
    expect(result).type.toBe<Effect.Effect<{ a: number; b: number; c: string }>>()
  })

  it("bindTo starts record inference", () => {
    const result = pipe(
      Effect.succeed("a"),
      Effect.bindTo("value")
    )
    expect(result).type.toBe<Effect.Effect<{ value: string }>>()
  })
})

describe("Effect.validate", () => {
  it("returns collected successes on success", () => {
    const result = Effect.validate([1, 2, 3], (n) => Effect.succeed(n.toString()))
    expect(result).type.toBe<Effect.Effect<Array<string>, [never, ...Array<never>]>>()
  })

  it("returns non-empty array errors", () => {
    const result = Effect.validate([1, 2, 3], () => Effect.fail("error" as const))
    expect(result).type.toBe<Effect.Effect<Array<never>, ["error", ...Array<"error">]>>()
  })

  it("supports discard option", () => {
    const result = Effect.validate([1, 2, 3], (n) => Effect.succeed(n), { discard: true })
    expect(result).type.toBe<Effect.Effect<void, [never, ...Array<never>]>>()
  })
})

describe("Effect.annotateLogsScoped", () => {
  it("returns a scoped effect for key/value input", () => {
    const result = Effect.annotateLogsScoped("requestId", "req-123")
    expect(result).type.toBe<Effect.Effect<void, never, Scope.Scope>>()
  })

  it("returns a scoped effect for record input", () => {
    const result = Effect.annotateLogsScoped({ requestId: "req-123", attempt: 1 })
    expect(result).type.toBe<Effect.Effect<void, never, Scope.Scope>>()
  })
})

describe("Effect.updateServiceScoped", () => {
  it("adds a Context.Service to the requirements", () => {
    const result = Effect.updateServiceScoped(UpdateServiceScopedService, (value) => value + 1)
    expect(result).type.toBe<Effect.Effect<void, never, UpdateServiceScopedService | Scope.Scope>>()
  })

  it("does not add a Context.Reference to the requirements", () => {
    const result = Effect.updateServiceScoped(UpdateServiceScopedReference, (value) => value + 1)
    expect(result).type.toBe<Effect.Effect<void, never, Scope.Scope>>()
  })

  it("types the reset values from the service", () => {
    const result = Effect.updateServiceScoped(
      UpdateServiceScopedService,
      (value) => value + 1,
      {
        reset: (original, updated, current) => {
          expect(original).type.toBe<number>()
          expect(updated).type.toBe<number>()
          expect(current).type.toBe<number>()
          return current
        }
      }
    )
    expect(result).type.toBe<Effect.Effect<void, never, UpdateServiceScopedService | Scope.Scope>>()
  })
})

describe("Effect.forkScoped", () => {
  it("adds Scope to requirements in data-first usage", () => {
    const result = pipe(
      Effect.forkScoped(string),
      Effect.flatMap(Fiber.join)
    )
    expect(result).type.toBe<Effect.Effect<string, "err-1", "dep-1" | Scope.Scope>>()
  })

  it("adds Scope to requirements in data-last usage", () => {
    const result = pipe(
      string,
      Effect.forkScoped(),
      Effect.flatMap(Fiber.join)
    )
    expect(result).type.toBe<Effect.Effect<string, "err-1", "dep-1" | Scope.Scope>>()
  })
})

describe("Effect.acquireRelease", () => {
  it("supports dependencies in the release finalizer", () => {
    const result = Effect.acquireRelease(
      Effect.succeed("resource"),
      () => Effect.service(AcquireReleaseDependency)
    )
    expect(result).type.toBe<Effect.Effect<string, never, AcquireReleaseDependency | Scope.Scope>>()
  })
})

describe("Effect.tapDefect", () => {
  it("saved operator preserves the source error type", () => {
    const observe = Effect.tapDefect(() => Effect.void)
    expect(observe(Effect.fail("boom"))).type.toBe<Effect.Effect<never, string>>()
  })
})

describe("Effect.tapErrorTag", () => {
  it("narrows tagged errors", () => {
    const result = pipe(
      mixedEffect,
      Effect.tapErrorTag("AiError", (error) => {
        expect(error).type.toBe<AiError>()
        return Effect.succeed("ok")
      })
    )
    expect(result).type.toBe<Effect.Effect<string, AiError | OtherError>>()
  })

  it("unifies additional error types", () => {
    const result = pipe(
      mixedEffect,
      Effect.tapErrorTag("AiError", () => Effect.fail(new SimpleError({ code: 1 })))
    )
    expect(result).type.toBe<Effect.Effect<string, AiError | OtherError | SimpleError>>()
  })

  it("supports tacit pipe", () => {
    const result = pipe(
      simpleEffect,
      Effect.tapErrorTag("SimpleError", Effect.log)
    )
    expect(result).type.toBe<Effect.Effect<string, SimpleError>>()
  })
})

describe("Effect.unwrapReason", () => {
  it("replaces parent error with reasons", () => {
    const result = pipe(aiEffect, Effect.unwrapReason("AiError"))
    expect(result).type.toBe<Effect.Effect<string, RateLimitError | QuotaExceededError | UnknownAiModelError>>()
  })

  it("preserves other errors in union", () => {
    const result = pipe(mixedEffect, Effect.unwrapReason("AiError"))
    expect(result).type.toBe<
      Effect.Effect<string, RateLimitError | QuotaExceededError | UnknownAiModelError | OtherError>
    >()
  })
})

describe("Effect.fn", () => {
  it("with a span, generator", () => {
    const fn = Effect.fn("span")(function*() {
      return yield* Effect.fail("bye")
    })
    expect(fn).type.toBe<() => Effect.Effect<never, string, never>>()
  })

  it("with a span, generator with yieldable", () => {
    const fn = Effect.fn("span")(function*() {
      return yield* new RateLimitError({ retryAfter: 1 })
    })
    expect(fn).type.toBe<() => Effect.Effect<never, RateLimitError, never>>()
  })

  it("with a span, generator and pipe arguments", () => {
    const fn = Effect.fn("span")(
      function*() {
        return yield* Effect.succeed("hello")
      },
      Effect.map((x) => {
        expect(x).type.toBe<string>()
        return x.length
      })
    )
    expect(fn).type.toBe<() => Effect.Effect<number, never, never>>()
  })

  it("without a span, generator", () => {
    const fn = Effect.fn(function*() {
      return yield* Effect.fail("bye")
    })
    expect(fn).type.toBe<() => Effect.Effect<never, string, never>>()
  })

  it("without a span, generator with yieldable", () => {
    const fn = Effect.fn(function*() {
      return yield* new RateLimitError({ retryAfter: 1 })
    })
    expect(fn).type.toBe<() => Effect.Effect<never, RateLimitError, never>>()
  })

  it("without a span, generator and pipe arguments", () => {
    const fn = Effect.fn(
      function*() {
        return yield* Effect.succeed("hello")
      },
      Effect.map((x) => {
        expect(x).type.toBe<string>()
        return x.length
      })
    )
    expect(fn).type.toBe<() => Effect.Effect<number, never, never>>()
  })

  it("with a span, function", () => {
    const fn = Effect.fn("span")(function() {
      return Effect.fail("bye")
    })
    expect(fn).type.toBe<() => Effect.Effect<never, string, never>>()
  })

  it("with a span, function and pipe arguments", () => {
    const fn = Effect.fn("span")(
      function() {
        return Effect.succeed("hello")
      },
      Effect.map((x) => {
        expect(x).type.toBe<string>()
        return x.length
      })
    )
    expect(fn).type.toBe<() => Effect.Effect<number, never, never>>()
  })

  it("without a span, function", () => {
    const fn = Effect.fn(function() {
      return Effect.fail("bye")
    })
    expect(fn).type.toBe<() => Effect.Effect<never, string, never>>()
  })

  it("without a span, function and pipe arguments", () => {
    const fn = Effect.fn(
      function() {
        return Effect.succeed("hello")
      },
      Effect.map((x) => {
        expect(x).type.toBe<string>()
        return x.length
      })
    )
    expect(fn).type.toBe<() => Effect.Effect<number, never, never>>()
  })

  it("should not unwrap nested effects", () => {
    const fn = Effect.fn(function() {
      return Effect.succeed(Effect.succeed(1))
    })
    expect(fn).type.toBe<() => Effect.Effect<Effect.Effect<number, never, never>, never, never>>()
  })
})

describe("Effect.partition", () => {
  it("data-first", () => {
    const result = Effect.partition(
      [1, 2, 3],
      (n) => n % 2 === 0 ? Effect.fail(`${n}`) : Effect.succeed(n)
    )
    expect(result).type.toBe<Effect.Effect<[passes: Array<number>, fails: Array<string>], never, never>>()
  })

  it("data-last", () => {
    const result = pipe(
      [1, 2, 3],
      Effect.partition((n) => n % 2 === 0 ? Effect.fail(n) : Effect.succeed(`${n}`))
    )
    expect(result).type.toBe<Effect.Effect<[passes: Array<string>, fails: Array<number>], never, never>>()
  })
})

describe("Effect.forEach", () => {
  it("data-first", () => {
    const result = Effect.forEach(
      [1, 2, 3],
      (n, i) => string.pipe(Effect.as(`${n}${i}`))
    )
    expect(result).type.toBe<Effect.Effect<Array<string>, "err-1", "dep-1">>()
  })

  it("data-last with an explicitly typed callback", () => {
    const result = Effect.forEach((n: number, i) => string.pipe(Effect.as(`${n}${i}`)))([1, 2, 3])
    expect(result).type.toBe<Effect.Effect<Array<string>, "err-1", "dep-1">>()
  })

  it("data-last with discard", () => {
    const result = pipe(
      new Set([1, 2, 3]),
      Effect.forEach((n: number) => Effect.succeed(`${n}`), { discard: true })
    )
    expect(result).type.toBe<Effect.Effect<void>>()
  })

  it("data-last rejects an incompatible iterable", () => {
    const forEachNumber = Effect.forEach((n: number) => Effect.succeed(`${n}`))
    // @ts-expect-error Type 'string' is not assignable to type 'number'
    forEachNumber(["a", "b"])
  })
})

describe("Effect.reduce", () => {
  it("data-first", () => {
    const result = Effect.reduce(
      [1, 2, 3],
      () => "",
      (acc, n) => string.pipe(Effect.map((value) => `${acc}${value}${n}`))
    )
    expect(result).type.toBe<Effect.Effect<string, "err-1", "dep-1">>()
  })

  it("data-last", () => {
    const result = pipe(
      [1, 2, 3],
      Effect.reduce(() => "", (acc, n) => string.pipe(Effect.map((value) => `${acc}${value}${n}`)))
    )
    expect(result).type.toBe<Effect.Effect<string, "err-1", "dep-1">>()
  })
})

describe("Effect.findFirst", () => {
  it("data-first", () => {
    const result = Effect.findFirst(
      [1, 2, 3],
      (n) => Effect.succeed(n > 1)
    )
    expect(result).type.toBe<Effect.Effect<Option.Option<number>, never, never>>()
  })

  it("data-last", () => {
    const result = pipe(
      [1, 2, 3],
      Effect.findFirst((n) => Effect.succeed(n > 1))
    )
    expect(result).type.toBe<Effect.Effect<Option.Option<number>, never, never>>()
  })
})

describe("Effect.findFirstFilter", () => {
  it("data-first", () => {
    const result = Effect.findFirstFilter(
      [1, 2, 3],
      (n, i) => Effect.succeed(i > 0 ? Result.succeed(`${n}`) : Result.failVoid)
    )
    expect(result).type.toBe<Effect.Effect<Option.Option<string>, never, never>>()
  })

  it("data-last", () => {
    const result = pipe(
      [1, 2, 3],
      Effect.findFirstFilter((n, i) => Effect.succeed(i > 0 ? Result.succeed(n.toString()) : Result.failVoid))
    )
    expect(result).type.toBe<Effect.Effect<Option.Option<string>, never, never>>()
  })
})

describe("Unify.unify", () => {
  it("unifies effect unions", () => {
    const result = Unify.unify(stringOrNumber)
    expect(result).type.toBe<Effect.Effect<string | number, "err-1" | "err-2", "dep-1" | "dep-2">>()
  })

  it("unifies stream unions", () => {
    const result = Unify.unify(streamStringOrNumber)
    expect(result).type.toBe<Stream.Stream<string | number, "err-1" | "err-2", "dep-1" | "dep-2">>()
  })

  it("unifies sink unions", () => {
    const result = Unify.unify(sinkStringOrNumber)
    expect(result).type.toBe<
      Sink.Sink<string | number, string, "left-1" | "left-2", "err-1" | "err-2", "dep-1" | "dep-2">
    >()
  })

  it("unifies channel unions", () => {
    const result = Unify.unify(channelStringOrNumber)
    expect(result).type.toBe<
      Channel.Channel<
        string | number,
        "out-err-1" | "out-err-2",
        "out-done-1" | "out-done-2",
        string,
        "in-err",
        "in-done",
        "dep-1" | "dep-2"
      >
    >()
  })

  it("unifies layer unions", () => {
    const result = Unify.unify(layerStringOrNumber)
    expect(result).type.toBe<Layer.Layer<"out-1" | "out-2", "err-1" | "err-2", "dep-1" | "dep-2">>()
  })

  it("unifies option unions", () => {
    const result = Unify.unify(optionStringOrNumber)
    expect(result).type.toBe<Option.Option<string | number>>()
  })

  it("unifies result unions", () => {
    const result = Unify.unify(resultStringOrNumber)
    expect(result).type.toBe<Result.Result<string | number, "err-1" | "err-2">>()
  })

  it("preserves fiber unions", () => {
    const result = Unify.unify(fiberStringOrNumber)
    expect(result).type.toBe<Fiber.Fiber<string, "err-1"> | Fiber.Fiber<number, "err-2">>()
  })
})

describe("all", () => {
  it("tuple", () => {
    expect(Effect.all([string, number])).type.toBe<
      Effect.Effect<[string, number], "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all([string, number], undefined)).type.toBe<
      Effect.Effect<[string, number], "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all([string, number], {})).type.toBe<
      Effect.Effect<[string, number], "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all([string, number], { concurrency: "unbounded" })).type.toBe<
      Effect.Effect<[string, number], "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all([string, number], { discard: true })).type.toBe<
      Effect.Effect<void, "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all([string, number], { discard: true, concurrency: "unbounded" })).type.toBe<
      Effect.Effect<void, "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all([string, number], { mode: "result" })).type.toBe<
      Effect.Effect<[Result.Result<string, "err-1">, Result.Result<number, "err-2">], never, "dep-1" | "dep-2">
    >()
    expect(Effect.all([string, number], { mode: "result", discard: true })).type.toBe<
      Effect.Effect<void, never, "dep-1" | "dep-2">
    >()
  })

  it("struct", () => {
    expect(Effect.all({ a: string, b: number })).type.toBe<
      Effect.Effect<{ a: string; b: number }, "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all({ a: string, b: number }, undefined)).type.toBe<
      Effect.Effect<{ a: string; b: number }, "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all({ a: string, b: number }, {})).type.toBe<
      Effect.Effect<{ a: string; b: number }, "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all({ a: string, b: number }, { concurrency: "unbounded" })).type.toBe<
      Effect.Effect<{ a: string; b: number }, "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all({ a: string, b: number }, { discard: true })).type.toBe<
      Effect.Effect<void, "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all({ a: string, b: number }, { discard: true, concurrency: "unbounded" })).type.toBe<
      Effect.Effect<void, "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all({ a: string, b: number }, { mode: "result" })).type.toBe<
      Effect.Effect<
        { a: Result.Result<string, "err-1">; b: Result.Result<number, "err-2"> },
        never,
        "dep-1" | "dep-2"
      >
    >()
    expect(Effect.all({ a: string, b: number }, { mode: "result", discard: true })).type.toBe<
      Effect.Effect<void, never, "dep-1" | "dep-2">
    >()
  })

  it("array", () => {
    expect(Effect.all(stringArray)).type.toBe<
      Effect.Effect<Array<string>, "err-3", "dep-3">
    >()
    expect(Effect.all(stringArray, undefined)).type.toBe<
      Effect.Effect<Array<string>, "err-3", "dep-3">
    >()
    expect(Effect.all(stringArray, {})).type.toBe<
      Effect.Effect<Array<string>, "err-3", "dep-3">
    >()
    expect(Effect.all(stringArray, { concurrency: "unbounded" })).type.toBe<
      Effect.Effect<Array<string>, "err-3", "dep-3">
    >()
    expect(Effect.all(stringArray, { discard: true })).type.toBe<
      Effect.Effect<void, "err-3", "dep-3">
    >()
    expect(Effect.all(stringArray, { discard: true, concurrency: "unbounded" })).type.toBe<
      Effect.Effect<void, "err-3", "dep-3">
    >()
    expect(Effect.all(stringArray, { mode: "result" })).type.toBe<
      Effect.Effect<Array<Result.Result<string, "err-3">>, never, "dep-3">
    >()
    expect(Effect.all(stringArray, { mode: "result", discard: true })).type.toBe<
      Effect.Effect<void, never, "dep-3">
    >()
  })

  it("record", () => {
    expect(Effect.all(numberRecord)).type.toBe<
      Effect.Effect<{ [x: string]: number }, "err-4", "dep-4">
    >()
    expect(Effect.all(numberRecord, undefined)).type.toBe<
      Effect.Effect<{ [x: string]: number }, "err-4", "dep-4">
    >()
    expect(Effect.all(numberRecord, {})).type.toBe<
      Effect.Effect<{ [x: string]: number }, "err-4", "dep-4">
    >()
    expect(Effect.all(numberRecord, { concurrency: "unbounded" })).type.toBe<
      Effect.Effect<{ [x: string]: number }, "err-4", "dep-4">
    >()
    expect(Effect.all(numberRecord, { discard: true })).type.toBe<
      Effect.Effect<void, "err-4", "dep-4">
    >()
    expect(Effect.all(numberRecord, { discard: true, concurrency: "unbounded" })).type.toBe<
      Effect.Effect<void, "err-4", "dep-4">
    >()
    expect(Effect.all(numberRecord, { mode: "result" })).type.toBe<
      Effect.Effect<{ [x: string]: Result.Result<number, "err-4"> }, never, "dep-4">
    >()
    expect(Effect.all(numberRecord, { mode: "result", discard: true })).type.toBe<
      Effect.Effect<void, never, "dep-4">
    >()
  })

  it("union of records", () => {
    expect(Effect.all(unionRecord)).type.toBe<
      Effect.Effect<{ a: string } | { b: number }, "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all(unionRecord, { discard: true })).type.toBe<
      Effect.Effect<void, "err-1" | "err-2", "dep-1" | "dep-2">
    >()
    expect(Effect.all(unionRecord, { mode: "result" })).type.toBe<
      Effect.Effect<
        { a: Result.Result<string, "err-1"> } | { b: Result.Result<number, "err-2"> },
        never,
        "dep-1" | "dep-2"
      >
    >()
  })
})

describe("Effect.repeat", () => {
  type Status = "pending" | "done"
  const source = null as unknown as Effect.Effect<Status>
  const schedule = Schedule.recurs(3)

  it("narrows the result with an unbounded while refinement", () => {
    expect(Effect.repeat(source, {
      while: (status): status is "pending" => status === "pending"
    })).type.toBe<Effect.Effect<"done">>()
  })

  it("narrows the result with an unbounded until refinement", () => {
    expect(Effect.repeat(source, {
      until: (status): status is "done" => status === "done"
    })).type.toBe<Effect.Effect<"done">>()
  })

  it("preserves the full result with optional times and a while refinement", () => {
    const options: {
      times?: number
      while: (status: Status) => status is "pending"
    } = {
      times: 3,
      while: (status): status is "pending" => status === "pending"
    }
    expect(Effect.repeat(source, options)).type.toBe<Effect.Effect<Status>>()
  })

  it("preserves the full result with a schedule and an until refinement", () => {
    expect(Effect.repeat(source, {
      schedule,
      until: (status): status is "done" => status === "done"
    })).type.toBe<Effect.Effect<Status>>()
  })
})

describe("Effect.repeatOrElse", () => {
  const source = Effect.succeed("input")
  const schedule = null as unknown as Schedule.Schedule<number, string>

  it("passes the previous schedule metadata to the direct fallback", () => {
    Effect.repeatOrElse(source, schedule, (_error, previous) => {
      expect(previous).type.toBe<Option.Option<Schedule.Metadata<number, string>>>()
      return Effect.succeed(0)
    })
  })

  it("passes the previous schedule metadata to the curried fallback", () => {
    source.pipe(Effect.repeatOrElse(schedule, (_error, previous) => {
      expect(previous).type.toBe<Option.Option<Schedule.Metadata<number, string>>>()
      return Effect.succeed(0)
    }))
  })
})

describe("Effect.retry", () => {
  it("while refinement narrows error type without times", () => {
    const result = Effect.retry(mixedEffect, {
      while: (e): e is AiError => e._tag === "AiError"
    })
    expect(result).type.toBe<Effect.Effect<string, OtherError>>()
  })

  it("until refinement narrows error type without times", () => {
    const result = Effect.retry(mixedEffect, {
      until: (e): e is AiError => e._tag === "AiError"
    })
    expect(result).type.toBe<Effect.Effect<string, AiError>>()
  })

  it("times with while refinement preserves full error type", () => {
    const result = Effect.retry(mixedEffect, {
      times: 3,
      while: (e): e is AiError => e._tag === "AiError"
    })
    expect(result).type.toBe<Effect.Effect<string, AiError | OtherError>>()
  })

  it("times with until refinement preserves full error type", () => {
    const result = Effect.retry(mixedEffect, {
      times: 3,
      until: (e): e is AiError => e._tag === "AiError"
    })
    expect(result).type.toBe<Effect.Effect<string, AiError | OtherError>>()
  })

  it("times alone preserves full error type", () => {
    const result = Effect.retry(mixedEffect, { times: 3 })
    expect(result).type.toBe<Effect.Effect<string, AiError | OtherError>>()
  })

  it("data-last with times and while refinement preserves full error type", () => {
    const result = pipe(
      mixedEffect,
      Effect.retry({
        times: 3,
        while: (e): e is AiError => e._tag === "AiError"
      })
    )
    expect(result).type.toBe<Effect.Effect<string, AiError | OtherError>>()
  })
})

describe("Effect.schedule", () => {
  it("includes schedule errors in data-first usage", () => {
    const schedule = null as unknown as Schedule.Schedule<number, unknown, "schedule-error">
    expect(Effect.schedule(Effect.fail("effect-error" as const), schedule))
      .type.toBe<Effect.Effect<number, "effect-error" | "schedule-error">>()
  })

  it("includes schedule errors in data-last usage", () => {
    const schedule = null as unknown as Schedule.Schedule<number, unknown, "schedule-error">
    expect(Effect.fail("effect-error" as const).pipe(Effect.schedule(schedule)))
      .type.toBe<Effect.Effect<number, "effect-error" | "schedule-error">>()
  })
})

describe("Effect.scheduleFrom", () => {
  it("includes schedule errors in data-first usage", () => {
    const schedule = null as unknown as Schedule.Schedule<number, string, "schedule-error">
    expect(Effect.scheduleFrom(Effect.fail("effect-error" as const), "initial", schedule))
      .type.toBe<Effect.Effect<number, "effect-error" | "schedule-error">>()
  })

  it("includes schedule errors in data-last usage", () => {
    const schedule = null as unknown as Schedule.Schedule<number, string, "schedule-error">
    expect(Effect.fail("effect-error" as const).pipe(Effect.scheduleFrom("initial", schedule)))
      .type.toBe<Effect.Effect<number, "effect-error" | "schedule-error">>()
  })
})

describe("Effect.provideServiceEffect", () => {
  it("data-first disallows supertype return", () => {
    Effect.provideServiceEffect(
      Effect.void,
      ProvideServiceEffectServiceLiteral,
      // @ts-expect-error Argument of type 'Effect<string, never, never>' is not assignable to parameter of type 'Effect<"LITERAL", never, never>'
      Effect.gen(function*() {
        return "test"
      })
    )
  })

  it("data-last disallows supertype return", () => {
    Effect.provideServiceEffect(
      ProvideServiceEffectServiceLiteral,
      // @ts-expect-error Argument of type 'Effect<string, never, never>' is not assignable to parameter of type 'Effect<"LITERAL", never, never>'
      Effect.gen(function*() {
        return "test"
      })
    )
  })
})

describe("Effect.updateService", () => {
  it("data-first disallows supertype return", () => {
    Effect.updateService(
      Effect.void,
      ProvideServiceEffectServiceLiteral,
      // @ts-expect-error Type 'string' is not assignable to type '"LITERAL"'
      () => "test"
    )
  })

  it("data-last disallows supertype return", () => {
    Effect.updateService(
      ProvideServiceEffectServiceLiteral,
      // @ts-expect-error Type 'string' is not assignable to type '"LITERAL"'
      () => "test"
    )
  })
})

describe("Effect.updateServiceScoped", () => {
  it("disallows supertype return", () => {
    Effect.updateServiceScoped(
      ProvideServiceEffectServiceLiteral,
      // @ts-expect-error Type 'string' is not assignable to type '"LITERAL"'
      () => "test"
    )
  })
})

describe("Effect.effectify", () => {
  it("error mappers receive caller inputs without the callback", () => {
    const fn = (input: string, callback: (error: Error | null, value?: string) => void) => callback(null, input)

    Effect.effectify(fn, (_error, args) => {
      expect(args).type.toBe<[input: string]>()
      return args
    })
    Effect.effectify(fn, (_error, args) => {
      expect(args).type.toBe<[input: string]>()
      return args
    }, (_error, args) => {
      expect(args).type.toBe<[input: string]>()
      return args
    })
  })
})

describe("Effect.withExecutionPlan", () => {
  const plan = null as unknown as ExecutionPlan.ExecutionPlan<{
    provides: "provided"
    input: string
    error: "plan-error"
    requirements: "plan-dep"
  }>
  const self = null as unknown as Effect.Effect<number, string, "provided" | "other-dep">

  it("data-first adds handler requirements to R", () => {
    const result = Effect.withExecutionPlan(self, plan, {
      onEvent: (event) => {
        expect(event).type.toBe<ExecutionPlan.Event<string>>()
        return null as unknown as Effect.Effect<void, never, "handler-dep">
      }
    })
    expect(result).type.toBe<Effect.Effect<number, string, "other-dep" | "plan-dep" | "handler-dep">>()
  })

  it("data-last adds handler requirements to R", () => {
    const result = pipe(
      self,
      Effect.withExecutionPlan(plan, {
        onEvent: (event) => {
          expect(event).type.toBe<ExecutionPlan.Event<string>>()
          return null as unknown as Effect.Effect<void, never, "handler-dep">
        }
      })
    )
    expect(result).type.toBe<Effect.Effect<number, string, "other-dep" | "plan-dep" | "handler-dep">>()
  })

  it("without options the requirements are unchanged", () => {
    const result = Effect.withExecutionPlan(self, plan)
    expect(result).type.toBe<Effect.Effect<number, string, "other-dep" | "plan-dep">>()
  })
})

describe("Effect.cachedWithTTL", () => {
  it("data-first", () => {
    const cached = Effect.cachedWithTTL(number, (exit) => {
      expect(exit).type.toBe<Exit.Exit<number, "err-2">>()
      return Exit.isSuccess(exit) ? Duration.seconds(exit.value) : 0
    })

    expect(cached).type.toBe<Effect.Effect<Effect.Effect<number, "err-2", "dep-2">>>()
  })

  it("data-last", () => {
    const cached = number.pipe(Effect.cachedWithTTL((exit) => {
      expect(exit).type.toBe<Exit.Exit<number, "err-2">>()
      return Exit.isSuccess(exit) ? "1 second" : 0
    }))

    expect(cached).type.toBe<Effect.Effect<Effect.Effect<number, "err-2", "dep-2">>>()
  })
})

describe("Effect.cachedInvalidateWithTTL", () => {
  it("data-first", () => {
    const cached = Effect.cachedInvalidateWithTTL(number, (exit) => {
      expect(exit).type.toBe<Exit.Exit<number, "err-2">>()
      return Exit.isSuccess(exit) ? Duration.seconds(exit.value) : 0
    })

    expect(cached).type.toBe<Effect.Effect<[Effect.Effect<number, "err-2", "dep-2">, Effect.Effect<void>]>>()
  })

  it("data-last", () => {
    const cached = number.pipe(Effect.cachedInvalidateWithTTL((exit) => {
      expect(exit).type.toBe<Exit.Exit<number, "err-2">>()
      return Exit.isSuccess(exit) ? "1 second" : 0
    }))

    expect(cached).type.toBe<Effect.Effect<[Effect.Effect<number, "err-2", "dep-2">, Effect.Effect<void>]>>()
  })
})

describe("Effect.track", () => {
  const observe = Effect.track(
    Metric.gauge("track"),
    (exit: Exit.Exit<number, string>) => Exit.isSuccess(exit) ? exit.value : 0
  )

  it("rejects incompatible source errors", () => {
    expect(observe).type.not.toBeCallableWith(Effect.fail(1))
  })

  it("preserves compatible narrow errors", () => {
    expect(observe(number)).type.toBe<Effect.Effect<number, "err-2", "dep-2">>()
  })
})

describe("Effect.withErrorReporting", () => {
  it("returns an Effect for an Exit input", () => {
    expect(Effect.withErrorReporting(Exit.succeed(1))).type.toBe<Effect.Effect<number>>()
  })
})

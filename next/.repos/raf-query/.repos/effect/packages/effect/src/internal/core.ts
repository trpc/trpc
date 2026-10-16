import type * as Cause from "../Cause.ts"
import type * as Context from "../Context.ts"
import type * as Effect from "../Effect.ts"
import * as Equal from "../Equal.ts"
import type * as Exit from "../Exit.ts"
import { format } from "../Formatter.ts"
import { dual, identity } from "../Function.ts"
import * as Hash from "../Hash.ts"
import { NodeInspectSymbol } from "../Inspectable.ts"
import { pipeArguments } from "../Pipeable.ts"
import { hasProperty } from "../Predicate.ts"
import type { StackFrame } from "../References.ts"
import type * as Types from "../Types.ts"
import { SingleShotGen } from "../Utils.ts"
import type { FiberImpl } from "./effect.ts"
import * as InternalRecord from "./record.ts"

/** @internal */
export const EffectTypeId = `~effect/Effect` as const

/** @internal */
export const ExitTypeId = `~effect/Exit` as const

const effectVariance = {
  _A: identity,
  _E: identity,
  _R: identity
}

/** @internal */
export const identifier = `${EffectTypeId}/identifier` as const
/** @internal */
export type identifier = typeof identifier

/** @internal */
export const args = `${EffectTypeId}/args` as const
/** @internal */
export type args = typeof args

/** @internal */
export const evaluate = `${EffectTypeId}/evaluate` as const
/** @internal */
export type evaluate = typeof evaluate

/** @internal */
export const contA = `${EffectTypeId}/successCont` as const
/** @internal */
export type contA = typeof contA

/** @internal */
export const contE = `${EffectTypeId}/failureCont` as const
/** @internal */
export type contE = typeof contE

/** @internal */
export const contAll = `${EffectTypeId}/ensureCont` as const
/** @internal */
export type contAll = typeof contAll

/** @internal */
export const Yield = Symbol.for("effect/Effect/Yield")
/** @internal */
export type Yield = typeof Yield

/** @internal */
export const PipeInspectableProto = {
  pipe() {
    return pipeArguments(this, arguments)
  },
  toJSON(this: any) {
    return { ...this }
  },
  toString() {
    return format(this.toJSON(), { ignoreToString: true, space: 2 })
  },
  [NodeInspectSymbol]() {
    return this.toJSON()
  }
}

/** @internal */
export const StructuralProto = {
  [Hash.symbol](this: any): number {
    return Hash.structureKeys(this, Object.keys(this))
  },
  [Equal.symbol](this: any, that: any): boolean {
    const selfKeys = Object.keys(this)
    const thatKeys = Object.keys(that)
    if (selfKeys.length !== thatKeys.length) return false
    for (let i = 0; i < selfKeys.length; i++) {
      if (selfKeys[i] !== thatKeys[i] || !Equal.equals(this[selfKeys[i]], that[selfKeys[i]])) {
        return false
      }
    }
    return true
  }
}

/** @internal */
export const EffectProto = {
  [EffectTypeId]: effectVariance,
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this) as any
  },
  toJSON(this: Primitive) {
    return {
      _id: "Effect",
      op: this[identifier],
      ...(args in this ? { args: this[args] } : undefined)
    }
  }
}

/** @internal */
export const isEffect = (u: unknown): u is Effect.Effect<unknown, unknown, unknown> => hasProperty(u, EffectTypeId)

/** @internal */
export const isExit = (u: unknown): u is Exit.Exit<unknown, unknown> => hasProperty(u, ExitTypeId)

// ----------------------------------------------------------------------------
// Cause
// ----------------------------------------------------------------------------

/** @internal */
export const CauseTypeId = "~effect/Cause"

/** @internal */
export const CauseReasonTypeId = "~effect/Cause/Reason"

/** @internal */
export const isCause = (self: unknown): self is Cause.Cause<unknown> => hasProperty(self, CauseTypeId)

/** @internal */
export const isCauseReason = (self: unknown): self is Cause.Reason<unknown> => hasProperty(self, CauseReasonTypeId)

/** @internal */
export class CauseImpl<E> implements Cause.Cause<E> {
  declare readonly [CauseTypeId]: typeof CauseTypeId
  declare readonly reasons: ReadonlyArray<
    Cause.Fail<E> | Cause.Die | Cause.Interrupt
  >
  constructor(
    failures: ReadonlyArray<
      Cause.Fail<E> | Cause.Die | Cause.Interrupt
    >
  ) {
    this[CauseTypeId] = CauseTypeId
    this.reasons = failures
  }
  pipe() {
    return pipeArguments(this, arguments)
  }
  toJSON(): unknown {
    return {
      _id: "Cause",
      failures: this.reasons.map((f) => f.toJSON())
    }
  }
  toString() {
    return `Cause(${format(this.reasons)})`
  }
  [NodeInspectSymbol]() {
    return this.toJSON()
  }
  [Equal.symbol](that: any): boolean {
    return (
      isCause(that) &&
      this.reasons.length === that.reasons.length &&
      this.reasons.every((e, i) => Equal.equals(e, that.reasons[i]))
    )
  }
  [Hash.symbol](): number {
    return Hash.array(this.reasons)
  }
}

const annotationsMap = new WeakMap<object, ReadonlyMap<string, unknown>>()

/** @internal */
export abstract class ReasonBase<Tag extends string> implements Cause.Cause.ReasonProto<Tag> {
  readonly [CauseReasonTypeId]: typeof CauseReasonTypeId
  readonly annotations: ReadonlyMap<string, unknown>
  readonly _tag: Tag

  constructor(
    _tag: Tag,
    annotations: ReadonlyMap<string, unknown>,
    originalError: unknown
  ) {
    this[CauseReasonTypeId] = CauseReasonTypeId
    this._tag = _tag
    if (
      annotations !== constEmptyAnnotations && typeof originalError === "object" && originalError !== null &&
      annotations.size > 0
    ) {
      const prevAnnotations = annotationsMap.get(originalError)
      if (prevAnnotations) {
        annotations = new Map([
          ...prevAnnotations,
          ...annotations
        ])
      }
      annotationsMap.set(originalError, annotations)
    }
    this.annotations = annotations
  }

  annotate(
    annotations: Context.Context<never>,
    options?: { readonly overwrite?: boolean | undefined }
  ): this {
    if (annotations.mapUnsafe.size === 0) return this
    const newAnnotations = new Map(this.annotations)
    annotations.mapUnsafe.forEach((value, key) => {
      if (options?.overwrite !== true && newAnnotations.has(key)) return
      newAnnotations.set(key, value)
    })
    const self = Object.assign(Object.create(Object.getPrototypeOf(this)), this)
    self.annotations = newAnnotations
    return self
  }

  pipe() {
    return pipeArguments(this, arguments)
  }

  abstract toJSON(): unknown
  abstract [Equal.symbol](that: any): boolean
  abstract [Hash.symbol](): number

  toString() {
    return format(this)
  }

  [NodeInspectSymbol]() {
    return this.toString()
  }
}

/** @internal */
export const constEmptyAnnotations: ReadonlyMap<string, unknown> = new Map<string, unknown>()

/** @internal */
export class Fail<E> extends ReasonBase<"Fail"> implements Cause.Fail<E> {
  declare readonly error: E
  constructor(
    error: E,
    annotations = constEmptyAnnotations
  ) {
    super("Fail", annotations, error)
    this.error = error
  }
  override toString() {
    return `Fail(${format(this.error)})`
  }
  toJSON(): unknown {
    return {
      _tag: "Fail",
      error: this.error
    }
  }
  [Equal.symbol](that: any): boolean {
    return (
      isFailReason(that) &&
      Equal.equals(this.error, that.error) &&
      Equal.equals(this.annotations, that.annotations)
    )
  }
  [Hash.symbol](): number {
    return Hash.combine(Hash.string(this._tag))(
      Hash.combine(Hash.hash(this.error))(Hash.hash(this.annotations))
    )
  }
}

/** @internal */
export const causeFromReasons = <E>(
  reasons: ReadonlyArray<Cause.Reason<E>>
): Cause.Cause<E> => new CauseImpl(reasons)

const dedupeReasons = <E>(
  self: ReadonlyArray<Cause.Reason<E>>,
  that: ReadonlyArray<Cause.Reason<E>>
): Array<Cause.Reason<E>> => {
  // Avoid importing Array.ts into the core bundle.
  // Snapshot both arrays before invoking user-defined hash or equality methods.
  const buckets = new Map<number, Array<Cause.Reason<E>>>()
  const out: Array<Cause.Reason<E>> = []
  for (const reason of self.concat(that)) {
    const hash = Hash.hash(reason)
    const bucket = buckets.get(hash)
    if (bucket === undefined) {
      buckets.set(hash, [reason])
    } else if (bucket.some((previous) => Equal.equals(previous, reason))) {
      continue
    } else {
      bucket.push(reason)
    }
    out.push(reason)
  }
  return out
}

/** @internal */
export const causeCombine: {
  <E2>(that: Cause.Cause<E2>): <E>(self: Cause.Cause<E>) => Cause.Cause<E | E2>
  <E, E2>(self: Cause.Cause<E>, that: Cause.Cause<E2>): Cause.Cause<E | E2>
} = dual(
  2,
  <E, E2>(self: Cause.Cause<E>, that: Cause.Cause<E2>): Cause.Cause<E | E2> => {
    if (self.reasons.length === 0) {
      return that as Cause.Cause<E | E2>
    } else if (that.reasons.length === 0) {
      return self as Cause.Cause<E | E2>
    }
    const newCause = new CauseImpl<E | E2>(
      dedupeReasons<E | E2>(self.reasons, that.reasons)
    )
    return Equal.equals(self, newCause) ? self : newCause
  }
)

/** @internal */
export const causeEmpty: Cause.Cause<never> = new CauseImpl([])

/** @internal */
export const causeFail = <E>(error: E): Cause.Cause<E> => new CauseImpl([new Fail(error)])

/** @internal */
export class Die extends ReasonBase<"Die"> implements Cause.Die {
  declare readonly defect: unknown
  constructor(
    defect: unknown,
    annotations = constEmptyAnnotations
  ) {
    super("Die", annotations, defect)
    this.defect = defect
  }
  override toString() {
    return `Die(${format(this.defect)})`
  }
  toJSON(): unknown {
    return {
      _tag: "Die",
      defect: this.defect
    }
  }
  [Equal.symbol](that: any): boolean {
    return (
      isDieReason(that) &&
      Equal.equals(this.defect, that.defect) &&
      Equal.equals(this.annotations, that.annotations)
    )
  }
  [Hash.symbol](): number {
    return Hash.combine(Hash.string(this._tag))(
      Hash.combine(Hash.hash(this.defect))(Hash.hash(this.annotations))
    )
  }
}

/** @internal */
export const causeDie = (defect: unknown): Cause.Cause<never> => new CauseImpl([new Die(defect)])

/** @internal */
export const causeAnnotate: {
  (
    annotations: Context.Context<never>,
    options?: {
      readonly overwrite?: boolean | undefined
    }
  ): <E>(self: Cause.Cause<E>) => Cause.Cause<E>
  <E>(
    self: Cause.Cause<E>,
    annotations: Context.Context<never>,
    options?: {
      readonly overwrite?: boolean | undefined
    }
  ): Cause.Cause<E>
} = dual(
  (args) => isCause(args[0]),
  <E>(
    self: Cause.Cause<E>,
    annotations: Context.Context<never>,
    options?: {
      readonly overwrite?: boolean | undefined
    }
  ): Cause.Cause<E> => {
    if (annotations.mapUnsafe.size === 0) return self
    return new CauseImpl(self.reasons.map((f) => f.annotate(annotations, options)))
  }
)

/** @internal */
export const isFailReason = <E>(
  self: Cause.Reason<E>
): self is Cause.Fail<E> => self._tag === "Fail"

/** @internal */
export const isDieReason = <E>(self: Cause.Reason<E>): self is Cause.Die => self._tag === "Die"

/** @internal */
export const isInterruptReason = <E>(self: Cause.Reason<E>): self is Cause.Interrupt => self._tag === "Interrupt"

/** @internal */
export interface Primitive {
  readonly [identifier]: string
  readonly [contA]:
    | ((value: unknown, fiber: FiberImpl, exit?: Exit.Exit<any, any>) => Primitive | Yield)
    | undefined
  readonly [contE]:
    | ((cause: Cause.Cause<unknown>, fiber: FiberImpl, exit?: Exit.Exit<any, any>) => Primitive | Yield)
    | undefined
  readonly [contAll]:
    | ((
      fiber: FiberImpl
    ) =>
      | ((value: unknown, fiber: FiberImpl) => Primitive | Yield)
      | undefined)
    | undefined
  [evaluate](fiber: FiberImpl): Primitive | Yield
}

interface PrimitiveClass {
  new(value: any): Primitive
  prototype: any
}

function defaultEvaluate(_fiber: FiberImpl): Primitive | Yield {
  return exitDie(`Effect.evaluate: Not implemented`) as any
}

/** @internal */
export const makePrimitiveProto = <Op extends string>(options: {
  readonly op: Op
  readonly [evaluate]?: (
    fiber: FiberImpl
  ) => Primitive | Effect.Effect<any, any, any> | Yield
  readonly [contA]?: (
    this: Primitive,
    value: any,
    fiber: FiberImpl,
    exit?: Exit.Exit<any, any>
  ) => Primitive | Effect.Effect<any, any, any> | Yield
  readonly [contE]?: (
    this: Primitive,
    cause: Cause.Cause<any>,
    fiber: FiberImpl,
    exit?: Exit.Exit<any, any>
  ) => Primitive | Effect.Effect<any, any, any> | Yield
  readonly [contAll]?: (
    this: Primitive,
    fiber: FiberImpl
  ) => void | ((value: any, fiber: FiberImpl) => void)
}): Primitive =>
  ({
    ...EffectProto,
    [identifier]: options.op,
    [evaluate]: options[evaluate] ?? defaultEvaluate,
    [contA]: options[contA],
    [contE]: options[contE],
    [contAll]: options[contAll]
  }) as any

/** @internal */
export const makePrimitive = <
  Fn extends (...args: Array<any>) => any
>(options: {
  readonly op: string
  readonly [evaluate]?: (
    this: Primitive & {
      readonly [args]: Parameters<Fn>[0]
    },
    fiber: FiberImpl
  ) => Primitive | Effect.Effect<any, any, any> | Yield
  readonly [contA]?: (
    this: Primitive & {
      readonly [args]: Parameters<Fn>[0]
    },
    value: any,
    fiber: FiberImpl,
    exit?: Exit.Exit<any, any>
  ) => Primitive | Effect.Effect<any, any, any> | Yield
  readonly [contE]?: (
    this: Primitive & {
      readonly [args]: Parameters<Fn>[0]
    },
    cause: Cause.Cause<any>,
    fiber: FiberImpl,
    exit?: Exit.Exit<any, any>
  ) => Primitive | Effect.Effect<any, any, any> | Yield
  readonly [contAll]?: (
    this: Primitive & {
      readonly [args]: Parameters<Fn>[0]
    },
    fiber: FiberImpl
  ) => void | ((value: any, fiber: FiberImpl) => void)
}): Fn => {
  const Proto = makePrimitiveProto(options as any)
  const PrimitiveImpl = function(this: any, value: any) {
    this[args] = value
  } as unknown as PrimitiveClass
  PrimitiveImpl.prototype = Proto
  return function(value: any) {
    return new PrimitiveImpl(value)
  } as Fn
}

/** @internal */
export const makeExit = <
  Fn extends (...args: Array<any>) => any,
  Prop extends string
>(options: {
  readonly op: "Success" | "Failure"
  readonly prop: Prop
  readonly [evaluate]: (
    this: Exit.Exit<unknown, unknown> & { [args]: Parameters<Fn>[0] },
    fiber: FiberImpl<unknown, unknown>
  ) => Primitive | Yield
}): Fn => {
  const Proto = {
    [ExitTypeId]: ExitTypeId,
    _tag: options.op,
    get [options.prop](): any {
      return (this as any)[args]
    },
    ...makePrimitiveProto(options),
    toString(this: any) {
      return `${options.op}(${format(this[args])})`
    },
    toJSON(this: any) {
      return {
        _id: "Exit",
        _tag: options.op,
        [options.prop]: this[args]
      }
    },
    [Equal.symbol](this: any, that: any): boolean {
      return (
        isExit(that) &&
        that._tag === this._tag &&
        Equal.equals(this[args], (that as any)[args])
      )
    },
    [Hash.symbol](this: any): number {
      return Hash.combine(Hash.string(options.op), Hash.hash(this[args]))
    }
  }
  const ExitPrimitive = function(this: any, value: unknown) {
    this[args] = value
  } as unknown as PrimitiveClass
  ExitPrimitive.prototype = Proto
  return function(value: unknown) {
    return new ExitPrimitive(value)
  } as Fn
}

/** @internal */
export const exitSucceed: <A>(a: A) => Exit.Exit<A> = makeExit({
  op: "Success",
  prop: "value",
  [evaluate](fiber) {
    const cont = fiber.getCont(contA)
    return cont ? cont[contA](this[args], fiber, this) : fiber.yieldWith(this)
  }
})

/** @internal */
export const StackTraceKey = {
  key: "effect/Cause/StackTrace" satisfies typeof Cause.StackTrace.key
} as Context.Service<Cause.StackTrace, StackFrame>

/** @internal */
export const InterruptorStackTrace = {
  key: "effect/Cause/InterruptorStackTrace" satisfies typeof Cause.InterruptorStackTrace.key
} as Context.Service<Cause.InterruptorStackTrace, StackFrame>

/** @internal */
export const exitFailCause: <E>(cause: Cause.Cause<E>) => Exit.Exit<never, E> = makeExit({
  op: "Failure",
  prop: "cause",
  [evaluate](fiber) {
    let cause = this[args]
    let annotated = false
    if (fiber.cache.stackFrame) {
      cause = causeAnnotate(cause, { mapUnsafe: new Map([[StackTraceKey.key, fiber.cache.stackFrame]]) } as any)
      annotated = true
    }
    let cont = fiber.getCont(contE)
    const interruptedCause = fiber._interruptedCause
    if (interruptedCause && fiber.interruptible) {
      // Drop typed failures only when interruption skips a recovery handler.
      // Interruptibility-restoration continuations have no identifier.
      let skippedHandler = false
      while (cont && fiber.interruptible) {
        skippedHandler ||= identifier in cont
        cont = fiber.getCont(contE)
      }
      if (skippedHandler) {
        cause = causeFromReasons(cause.reasons.filter((reason) => reason._tag !== "Fail"))
      }
      cause = causeCombine(cause, interruptedCause)
      annotated = true
    }
    return cont
      ? cont[contE](cause, fiber, annotated ? undefined : this)
      : fiber.yieldWith(annotated ? exitFailCause(cause) : this)
  }
})

/** @internal */
export const exitFail = <E>(e: E): Exit.Exit<never, E> => exitFailCause(causeFail(e))

/** @internal */
export const exitDie = (defect: unknown): Exit.Exit<never> => exitFailCause(causeDie(defect))

/** @internal */
export const withFiber: <A, E = never, R = never>(
  evaluate: (fiber: FiberImpl<unknown, unknown>) => Effect.Effect<A, E, R>
) => Effect.Effect<A, E, R> = makePrimitive({
  op: "WithFiber",
  [evaluate](fiber) {
    return this[args](fiber)
  }
})

/**
 * Accesses the current fiber to compute a value without a separate `succeed`
 * operation.
 *
 * @internal
 */
export const withFiberSucceed: <A, R = never>(
  evaluate: (fiber: FiberImpl<unknown, unknown>) => A
) => Effect.Effect<A, never, R> = makePrimitive({
  op: "WithFiberSucceed",
  [evaluate](fiber) {
    const value = this[args](fiber)
    const cont = fiber.getCont(contA)
    return cont ? cont[contA](value, fiber) : fiber.yieldWith(exitSucceed(value))
  }
})

/** @internal */
export const YieldableError: new(
  message?: string,
  options?: ErrorOptions
) => Cause.YieldableError = (function() {
  class YieldableError extends globalThis.Error {}
  const proto = makePrimitiveProto({
    op: "YieldableError",
    [evaluate]() {
      return exitFail(this)
    }
  })
  delete (proto as any).toString
  Object.assign(
    YieldableError.prototype,
    proto
  )
  return YieldableError as any
})()

/** @internal */
export const Error: new<A extends Record<string, any> = {}>(
  args: Types.VoidIfEmpty<{ readonly [P in keyof A]: A[P] }>
) => Cause.YieldableError & Readonly<A> = (function() {
  const plainArgsSymbol = Symbol.for("effect/Data/Error/plainArgs")
  return class Base extends YieldableError {
    constructor(args: Record<string, any> | undefined) {
      super(args?.message, args?.cause ? { cause: args.cause } : undefined)
      if (args) {
        InternalRecord.assignProperties(this, args)
        // @effect-diagnostics-next-line floatingEffect:off
        Object.defineProperty(this, plainArgsSymbol, {
          value: args,
          enumerable: false
        })
      }
    }
    override toJSON() {
      return { ...(this as any)[plainArgsSymbol], ...this }
    }
  } as any
})()

/** @internal */
export const TaggedError = <Tag extends string>(
  tag: Tag
): new<A extends Record<string, any> = {}>(
  args: Types.VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>
) => Cause.YieldableError & { readonly _tag: Tag } & Readonly<A> => {
  class Base extends Error<{}> {
    readonly _tag = tag
  }
  ;(Base.prototype as any).name = tag
  return Base as any
}

/** @internal */
export const NoSuchElementErrorTypeId = "~effect/Cause/NoSuchElementError"

/** @internal */
export const isNoSuchElementError = (
  u: unknown
): u is Cause.NoSuchElementError => hasProperty(u, NoSuchElementErrorTypeId)

/** @internal */
export class NoSuchElementError extends TaggedError("NoSuchElementError") {
  readonly [NoSuchElementErrorTypeId] = NoSuchElementErrorTypeId
  constructor(message?: string) {
    super({ message } as any)
  }
}

/** @internal */
export const DoneTypeId = "~effect/Cause/Done"

/** @internal */
export const isDone = (
  u: unknown
): u is Cause.Done => hasProperty(u, DoneTypeId)

const DoneVoid: Cause.Done<void> = {
  [DoneTypeId]: DoneTypeId,
  _tag: "Done",
  value: undefined
}

/** @internal */
export const Done = <A = void>(value?: A): Cause.Done<A> => {
  if (value === undefined) return DoneVoid as Cause.Done<A>
  return {
    [DoneTypeId]: DoneTypeId,
    _tag: "Done",
    value
  }
}

const doneVoid = exitFail(DoneVoid)

/** @internal */
export const done = <A = void>(value?: A): Effect.Effect<never, Cause.Done<A>> => {
  if (value === undefined) return doneVoid as any
  return exitFail(Done(value))
}

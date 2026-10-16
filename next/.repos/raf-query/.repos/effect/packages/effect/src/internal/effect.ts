import * as Arr from "../Array.ts"
import type * as Cause from "../Cause.ts"
import type * as Clock from "../Clock.ts"
import type * as Console from "../Console.ts"
import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import type * as Effect from "../Effect.ts"
import * as Equal from "../Equal.ts"
import type * as Exit from "../Exit.ts"
import type * as Fiber from "../Fiber.ts"
import * as Filter from "../Filter.ts"
import { formatJson } from "../Formatter.ts"
import type { LazyArg } from "../Function.ts"
import { constant, constFalse, constTrue, constUndefined, constVoid, dual, identity } from "../Function.ts"
import * as Hash from "../Hash.ts"
import { toJson, toStringUnknown } from "../Inspectable.ts"
import * as Iterable from "../Iterable.ts"
import type * as _Latch from "../Latch.ts"
import type * as Logger from "../Logger.ts"
import type * as LogLevel from "../LogLevel.ts"
import * as Option from "../Option.ts"
import * as Order from "../Order.ts"
import { pipeArguments } from "../Pipeable.ts"
import type * as Predicate from "../Predicate.ts"
import { hasProperty, isIterable, isString, isTagged } from "../Predicate.ts"
import { currentFiberTypeId, redact } from "../Redactable.ts"
import type { StackFrame } from "../References.ts"
import * as Result from "../Result.ts"
import * as Scheduler from "../Scheduler.ts"
import type * as Scope from "../Scope.ts"
import * as Tracer from "../Tracer.ts"
import type {
  Concurrency,
  EqualsWith,
  ExcludeReason,
  ExcludeTag,
  ExtractReason,
  ExtractTag,
  NarrowReason,
  NoInfer,
  OmitReason,
  ReasonOf,
  ReasonTags,
  Simplify,
  Tags,
  unassigned
} from "../Types.ts"
import { internalCall } from "../Utils.ts"
import type { Primitive } from "./core.ts"
import {
  args,
  causeAnnotate,
  causeCombine,
  causeEmpty,
  causeFromReasons,
  CauseImpl,
  constEmptyAnnotations,
  contA,
  contAll,
  contE,
  evaluate,
  exitDie,
  exitFail,
  exitFailCause,
  exitSucceed,
  ExitTypeId,
  Fail,
  InterruptorStackTrace,
  isCause,
  isDieReason,
  isEffect,
  isFailReason,
  isInterruptReason,
  isNoSuchElementError,
  makePrimitive,
  makePrimitiveProto,
  NoSuchElementError,
  ReasonBase,
  StackTraceKey as CauseStackTrace,
  TaggedError,
  withFiber,
  Yield
} from "./core.ts"
import * as doNotation from "./doNotation.ts"
import * as InternalMetric from "./metric.ts"
import * as InternalRecord from "./record.ts"
import {
  CurrentErrorReporters,
  CurrentLogAnnotations,
  CurrentLogLevel,
  CurrentLogSpans,
  CurrentStackFrame,
  MinimumLogLevel,
  TracerEnabled,
  TracerSpanAnnotations,
  TracerSpanLinks,
  TracerTimingEnabled
} from "./references.ts"
import { getStackTraceLimit, setStackTraceLimit } from "./stackTraceLimit.ts"
import { addSpanStackTrace, makeStackCleaner } from "./tracer.ts"

// ----------------------------------------------------------------------------
// Cause
// ----------------------------------------------------------------------------

/** @internal */
export class Interrupt extends ReasonBase<"Interrupt"> implements Cause.Interrupt {
  declare readonly fiberId: number | undefined
  constructor(
    fiberId: number | undefined,
    annotations = constEmptyAnnotations
  ) {
    super("Interrupt", annotations, "Interrupted")
    this.fiberId = fiberId
  }
  override toString() {
    return `Interrupt(${this.fiberId})`
  }
  toJSON(): unknown {
    return {
      _tag: "Interrupt",
      fiberId: this.fiberId
    }
  }
  [Equal.symbol](that: any): boolean {
    return (
      isInterruptReason(that) &&
      this.fiberId === that.fiberId &&
      this.annotations === that.annotations
    )
  }
  [Hash.symbol](): number {
    return Hash.combine(Hash.string(`${this._tag}:${this.fiberId}`))(
      Hash.random(this.annotations)
    )
  }
}

/** @internal */
export const makeInterruptReason = (fiberId?: number | undefined): Cause.Interrupt => new Interrupt(fiberId)

/** @internal */
export const causeInterrupt = (
  fiberId?: number | undefined
): Cause.Cause<never> => new CauseImpl([new Interrupt(fiberId)])

/** @internal */
export const hasFails = <E>(self: Cause.Cause<E>): boolean => self.reasons.some(isFailReason)

/** @internal */
export const findFail = <E>(self: Cause.Cause<E>): Result.Result<Cause.Fail<E>, Cause.Cause<never>> => {
  const reason = self.reasons.find(isFailReason)
  return reason ? Result.succeed(reason) : Result.fail(self as Cause.Cause<never>)
}

/** @internal */
export const findError = <E>(self: Cause.Cause<E>): Result.Result<E, Cause.Cause<never>> => {
  for (let i = 0; i < self.reasons.length; i++) {
    const reason = self.reasons[i]
    if (reason._tag === "Fail") {
      return Result.succeed(reason.error)
    }
  }
  return Result.fail(self as Cause.Cause<never>)
}

/** @internal */
export const findErrorOption = Filter.toOption(findError)

/** @internal */
export const hasDies = <E>(self: Cause.Cause<E>): boolean => self.reasons.some(isDieReason)

/** @internal */
export const findDie = <E>(self: Cause.Cause<E>): Result.Result<Cause.Die, Cause.Cause<E>> => {
  const reason = self.reasons.find(isDieReason)
  return reason ? Result.succeed(reason) : Result.fail(self)
}

/** @internal */
export const findDefect = <E>(self: Cause.Cause<E>): Result.Result<unknown, Cause.Cause<E>> => {
  const reason = self.reasons.find(isDieReason)
  return reason ? Result.succeed(reason.defect) : Result.fail(self)
}

/** @internal */
export const hasInterrupts = <E>(self: Cause.Cause<E>): boolean => self.reasons.some(isInterruptReason)

/** @internal */
export const findInterrupt = <E>(self: Cause.Cause<E>): Result.Result<Cause.Interrupt, Cause.Cause<E>> => {
  const reason = self.reasons.find(isInterruptReason)
  return reason ? Result.succeed(reason) : Result.fail(self)
}

/** @internal */
export const causeFilterInterruptors = <E>(
  self: Cause.Cause<E>
): Result.Result<Set<number>, Cause.Cause<E>> => {
  let interruptors: Set<number> | undefined
  for (let i = 0; i < self.reasons.length; i++) {
    const f = self.reasons[i]
    if (f._tag !== "Interrupt") continue
    interruptors ??= new Set()
    if (f.fiberId !== undefined) {
      interruptors.add(f.fiberId)
    }
  }
  return interruptors ? Result.succeed(interruptors) : Result.fail(self)
}

/** @internal */
export const causeInterruptors = <E>(self: Cause.Cause<E>): ReadonlySet<number> => {
  const result = causeFilterInterruptors(self)
  return Result.isFailure(result) ? emptySet : result.success
}
const emptySet = new Set<number>()

/** @internal */
export const hasInterruptsOnly = <E>(self: Cause.Cause<E>): boolean =>
  self.reasons.length > 0 && self.reasons.every(isInterruptReason)

/** @internal */
export const reasonAnnotations = <E>(
  self: Cause.Reason<E>
): Context.Context<never> => Context.makeUnsafe(self.annotations)

/** @internal */
export const causeAnnotations = <E>(
  self: Cause.Cause<E>
): Context.Context<never> => {
  const map = new Map<string, unknown>()
  for (const f of self.reasons) {
    if (f.annotations.size > 0) {
      for (const [key, value] of f.annotations) {
        map.set(key, value)
      }
    }
  }
  return Context.makeUnsafe(map)
}

/** @internal */
export const causeMap: {
  <E, E2>(f: (error: NoInfer<E>) => E2): (self: Cause.Cause<E>) => Cause.Cause<E2>
  <E, E2>(self: Cause.Cause<E>, f: (error: NoInfer<E>) => E2): Cause.Cause<E2>
} = dual(
  2,
  <E, E2>(self: Cause.Cause<E>, f: (error: NoInfer<E>) => E2): Cause.Cause<E2> => {
    let hasFail = false
    const failures = self.reasons.map((failure) => {
      if (isFailReason(failure)) {
        hasFail = true
        return new Fail(f(failure.error), failure.annotations)
      }
      return failure
    })
    return hasFail ? causeFromReasons(failures) : self as any
  }
)

/** @internal */
export const causeSquash = <E>(self: Cause.Cause<E>): unknown => {
  let die: Cause.Die | undefined
  for (const reason of self.reasons) {
    if (reason._tag === "Fail") return reason.error
    if (reason._tag === "Die") die ??= reason
  }
  if (die !== undefined) return die.defect
  if (self.reasons.length > 0) return new globalThis.Error("All fibers interrupted without error")
  return new globalThis.Error("Empty cause")
}

/** @internal */
export const causePrettyErrors = <E>(self: Cause.Cause<E>, options?: {
  readonly includeCauseInStack?: boolean | undefined
}): Array<Error> => {
  const errors: Array<Error> = []
  const interrupts: Array<Cause.Interrupt> = []
  if (self.reasons.length === 0) return errors

  const prevStackLimit = getStackTraceLimit()
  if (prevStackLimit !== 0) setStackTraceLimit(1)

  try {
    for (const failure of self.reasons) {
      if (failure._tag === "Interrupt") {
        interrupts.push(failure)
        continue
      }
      errors.push(
        causePrettyError(
          failure._tag === "Die" ? failure.defect : failure.error as any,
          failure.annotations,
          options
        )
      )
    }
    if (errors.length === 0) {
      const cause = new Error("The fiber was interrupted by:")
      cause.name = "InterruptCause"
      cause.stack = interruptCauseStack(cause, interrupts)
      const error = new globalThis.Error("All fibers interrupted without error", { cause })
      error.name = "InterruptError"
      error.stack = `${error.name}: ${error.message}`
      errors.push(causePrettyError(error, interrupts[0].annotations, options))
    }
  } finally {
    if (prevStackLimit !== 0) setStackTraceLimit(prevStackLimit)
  }

  return errors
}

/** @internal */
export const causePrettyError = (
  original: Record<string, unknown> | Error,
  annotations?: ReadonlyMap<string, unknown>,
  options?: {
    readonly includeCauseInStack?: boolean | undefined
  }
): Error => {
  const kind = typeof original
  let error: Error
  if (original && kind === "object") {
    error = new globalThis.Error(causePrettyMessage(original), {
      cause: original.cause ? causePrettyError(original.cause as any) : undefined
    })
    if (typeof original.name === "string") {
      error.name = original.name
    }
    if (typeof original.stack === "string") {
      error.stack = cleanErrorStack(original.stack, error, annotations)
    } else {
      const stack = `${error.name}: ${error.message}`
      error.stack = annotations ? addStackAnnotations(stack, annotations) : stack
    }
    if (options?.includeCauseInStack) {
      error.stack = renderPrettyError(error)!
    }
    for (const key of Object.keys(original)) {
      if (!(key in error)) {
        ;(error as any)[key] = (original as any)[key]
      }
    }
  } else {
    error = new globalThis.Error(
      !original ? `Unknown error: ${original}` : kind === "string" ? original as any : formatJson(original)
    )
  }
  return error
}

const causePrettyMessage = (u: Record<string, unknown> | Error): string => {
  if (typeof u.message === "string") {
    return u.message
  } else if (
    typeof u.toString === "function"
    && u.toString !== Object.prototype.toString
    && u.toString !== Array.prototype.toString
  ) {
    try {
      return u.toString()
    } catch {
      // something's off, rollback to json
    }
  }
  return formatJson(u)
}

const locationRegExp = /\((.*)\)/g

const cleanErrorStack = (
  stack: string,
  error: Error,
  annotations: ReadonlyMap<string, unknown> | undefined
): string => {
  const message = `${error.name}: ${error.message}`
  const lines = (stack.startsWith(message) ? stack.slice(message.length) : stack).split("\n")
  const out: Array<string> = [message]
  for (let i = 1; i < lines.length; i++) {
    if (/Generator\.next|~effect\/(?:Effect|Utils)/.test(lines[i])) {
      break
    }
    out.push(lines[i])
  }
  return annotations ? addStackAnnotations(out.join("\n"), annotations) : out.join("\n")
}

const addStackAnnotations = (stack: string, annotations: ReadonlyMap<string, unknown>) => {
  const frame = annotations?.get(CauseStackTrace.key) as StackFrame | undefined
  if (frame) {
    stack = `${stack}\n${currentStackTrace(frame)}`
  }
  return stack
}

const interruptCauseStack = (error: Error, interrupts: Array<Cause.Interrupt>): string => {
  const out: Array<string> = [`${error.name}: ${error.message}`]
  for (const current of interrupts) {
    const fiberId = current.fiberId !== undefined ? `#${current.fiberId}` : "unknown"
    const frame = current.annotations.get(InterruptorStackTrace.key) as StackFrame | undefined
    out.push(`    at fiber (${fiberId})`)
    if (frame) out.push(currentStackTrace(frame))
  }
  return out.join("\n")
}

const currentStackTrace = (frame: StackFrame): string => {
  const out: Array<string> = []
  let current: StackFrame | undefined = frame
  let i = 0
  while (current && i < 10) {
    const stack = current.stack()
    if (stack) {
      const locationMatchAll = stack.matchAll(locationRegExp)
      let match = false
      for (const [, location] of locationMatchAll) {
        match = true
        out.push(`    at ${current.name} (${location})`)
      }
      if (!match) {
        out.push(`    at ${current.name} (${stack.replace(/^at /, "")})`)
      }
    } else {
      out.push(`    at ${current.name}`)
    }
    current = current.parent
    i++
  }
  return out.join("\n")
}

/** @internal */
export const causePretty = <E>(cause: Cause.Cause<E>): string =>
  causePrettyErrors<E>(cause).map(renderPrettyError).join("\n")

const renderPrettyError = (e: Error): string | undefined =>
  e.cause ? `${e.stack} {\n${renderErrorCause(e.cause as Error, "  ")}\n}` : e.stack

const renderErrorCause = (cause: Error, prefix: string) => {
  const lines = cause.stack!.split("\n")
  let stack = `${prefix}[cause]: ${lines[0]}`
  for (let i = 1, len = lines.length; i < len; i++) {
    stack += `\n${prefix}${lines[i]}`
  }
  if (cause.cause) {
    stack += ` {\n${renderErrorCause(cause.cause as Error, `${prefix}  `)}\n${prefix}}`
  }
  return stack
}

// ----------------------------------------------------------------------------
// Fiber
// ----------------------------------------------------------------------------

/** @internal */
export const FiberTypeId = "~effect/Fiber" as const

const fiberVariance = {
  _A: identity,
  _E: identity
}

const fiberIdStore = { id: 0 }

interface AsyncContext {
  runInAsyncScope<This, Arg, R>(fn: (this: This, arg: Arg) => R, thisArg: This, arg: Arg): R
}

const AsyncResource: (new(type: string) => AsyncContext) | undefined = (() => {
  try {
    return (globalThis as any).process?.getBuiltinModule?.("node:async_hooks")?.AsyncResource
  } catch {
    return undefined
  }
})()

const captureAsyncContext = (): AsyncContext | undefined =>
  AsyncResource === undefined ? undefined : new AsyncResource("effect/Fiber")

/** @internal */
export const getCurrentFiber = (): Fiber.Fiber<any, any> | undefined => (globalThis as any)[currentFiberTypeId]

/** @internal */
export class FiberImpl<A = any, E = any> implements Fiber.Fiber<A, E> {
  constructor(
    context: Context.Context<never>,
    interruptible: boolean = true
  ) {
    this.setContext(context)
    this.id = ++fiberIdStore.id
    this.currentOpCount = 0
    this.interruptible = interruptible
    this._stack = []
    this._observers = undefined
    this._exit = undefined
    this._children = undefined
    this._interruptedCause = undefined
    this._yielded = undefined
    this._running = false
    this._deferredInterrupt = false
    this._parent = undefined
    this._asyncContext = undefined
    this.cache.runtimeMetrics?.recordFiberStart(this.context)
  }

  get [FiberTypeId](): Fiber.Fiber.Variance<A, E> {
    return fiberVariance
  }

  declare readonly id: number
  declare interruptible: boolean
  declare currentOpCount: number
  declare readonly _stack: Array<Primitive>
  declare _observers: Array<(exit: Exit.Exit<A, E>) => void> | undefined
  declare _exit: Exit.Exit<A, E> | undefined
  declare _children: Set<FiberImpl<any, any>> | undefined
  declare _interruptedCause: Cause.Cause<never> | undefined
  declare _yielded: Exit.Exit<any, any> | (() => void) | undefined
  declare _running: boolean
  declare _deferredInterrupt: boolean
  declare _parent: FiberImpl<any, any> | undefined
  declare _asyncContext: AsyncContext | undefined

  // set in setContext
  declare context: Context.Context<never>
  declare cache: Fiber.Fiber.Cache

  declare _dispatcher: Scheduler.SchedulerDispatcher | undefined
  get currentDispatcher(): Scheduler.SchedulerDispatcher {
    return this._dispatcher ??= this.cache.scheduler.makeDispatcher()
  }

  getRef<X>(ref: Context.Reference<X>): X {
    return Context.get(this.context, ref)
  }
  addObserver(cb: (exit: Exit.Exit<A, E>) => void): () => void {
    if (this._exit) {
      cb(this._exit)
      return constVoid
    }
    if (this._observers === undefined) {
      this._observers = [cb]
    } else {
      this._observers.push(cb)
    }
    return () => this.removeObserver(cb)
  }
  removeObserver(cb: (exit: Exit.Exit<A, E>) => void): void {
    if (this._exit || this._observers === undefined) return
    const index = this._observers.indexOf(cb)
    if (index >= 0) {
      this._observers.splice(index, 1)
    }
  }
  interruptUnsafe(fiberId?: number | undefined, annotations?: Context.Context<never> | undefined): void {
    if (this._exit) {
      return
    }
    let cause = causeInterrupt(fiberId)
    if (this.cache.stackFrame) {
      cause = causeAnnotate(cause, Context.make(CauseStackTrace, this.cache.stackFrame))
    }
    if (annotations) {
      cause = causeAnnotate(cause, annotations)
    }
    this._interruptedCause = this._interruptedCause
      ? causeCombine(this._interruptedCause, cause)
      : cause
    if (this.interruptible) {
      if (this._running) {
        this._deferredInterrupt = true
      } else {
        this.evaluate(failCause(this._interruptedCause) as any)
      }
    }
  }
  pollUnsafe(): Exit.Exit<A, E> | undefined {
    return this._exit
  }
  evaluate(effect: Primitive): void {
    if (this._exit) {
      return
    } else if (this._asyncContext !== undefined) {
      const asyncContext = this._asyncContext
      this._asyncContext = undefined
      return asyncContext.runInAsyncScope(this.evaluate, this, effect)
    } else if (this._yielded !== undefined) {
      const yielded = this._yielded as () => void
      this._yielded = undefined
      yielded()
    }
    const exit = this.runLoop(effect)
    if (exit === Yield) {
      this._asyncContext = captureAsyncContext()
      return
    }
    // the interruptChildren middleware is added in Effect.forkChild, so it can be
    // tree-shaken if not used
    const interruptChildren = fiberMiddleware.interruptChildren &&
      fiberMiddleware.interruptChildren(this)
    if (interruptChildren !== undefined) {
      return this.evaluate(flatMap(interruptChildren, () => exit) as any)
    }

    this._exit = exit
    this.cache.runtimeMetrics?.recordFiberEnd(this.context, this._exit)
    if (this._parent) {
      this._parent._children?.delete(this)
      this._parent = undefined
    }
    if (this._observers !== undefined) {
      const observers = this._observers
      this._observers = undefined
      for (let i = 0; i < observers.length; i++) {
        observers[i](exit)
      }
    }
    this._stack.length = 0
    this._children = undefined
    this.context = Context.empty()
  }
  runLoop(effect: Primitive): Exit.Exit<A, E> | Yield {
    const prevFiber = (globalThis as any)[currentFiberTypeId]
    ;(globalThis as any)[currentFiberTypeId] = this
    const prevRunning = this._running
    this._running = true
    let yielding = false
    let current: Primitive | Yield = effect
    this.currentOpCount = 0
    try {
      while (true) {
        if (this._deferredInterrupt) {
          this._deferredInterrupt = false
          current = failCause(this._interruptedCause!) as any
        }
        this.currentOpCount++
        // Refresh the cache because a primitive can replace the fiber context.
        const cache = this.cache
        if (
          !yielding &&
          !cache.preventYield &&
          cache.scheduler.shouldYield(this as any)
        ) {
          yielding = true
          const prev = current
          current = flatMap(yieldNow, () => prev as any) as any
        }
        current = cache.tracerContext
          ? cache.tracerContext(current as any, this)
          : (current as any)[evaluate](this)
        if (current === Yield) {
          const yielded = this._yielded!
          if (ExitTypeId in yielded) {
            this._deferredInterrupt = false
            this._yielded = undefined
            return yielded
          } else if (this._deferredInterrupt) {
            this._yielded = undefined
            yielded()
            continue
          }
          return Yield
        }
      }
    } catch (error) {
      if (!hasProperty(current, evaluate)) {
        return exitDie(`Fiber.runLoop: Not a valid effect: ${String(current)}`)
      }
      return this.runLoop(exitDie(error) as any)
    } finally {
      this._running = prevRunning
      ;(globalThis as any)[currentFiberTypeId] = prevFiber
    }
  }
  getCont<S extends contA | contE>(symbol: S):
    | (Primitive & Record<S, (value: any, fiber: FiberImpl) => Primitive>)
    | undefined
  {
    if (this._deferredInterrupt) {
      this._deferredInterrupt = false
      return deferredInterruptCont
    }
    while (true) {
      const op = this._stack.pop()
      if (!op) return undefined
      const all = op[contAll]
      if (all !== undefined) {
        const cont = all.call(op, this)
        if (cont) {
          ;(cont as any)[symbol] = cont
          return cont as any
        }
      }
      if (op[symbol]) return op as any
    }
  }
  // Passes a success value straight to the next continuation instead of
  // returning an Exit for the run loop to unwrap. Each call counts as an
  // operation, and every `maxInlineSteps`th call returns an Exit instead, so
  // continuations calling continuations never nest deeper than that.
  succeedWith(value: unknown): Primitive | Yield {
    if ((++this.currentOpCount & (maxInlineSteps - 1)) === 0) {
      return exitSucceed(value) as any
    }
    const cont = this.getCont(contA)
    return cont ? cont[contA](value, this) : this.yieldWith(exitSucceed(value))
  }
  yieldWith(value: Exit.Exit<any, any> | (() => void)): Yield {
    this._yielded = value
    return Yield
  }
  children(): Set<Fiber.Fiber<any, any>> {
    return (this._children ??= new Set())
  }
  pipe() {
    return pipeArguments(this, arguments)
  }
  setContext(context: Context.Context<never>): void {
    const previous = this.context
    this.context = context
    // Every key cached below opts in to Context caching, so contexts related
    // only by non-caching adds cannot have changed any of them
    if (previous !== undefined && Context.hasSameCache(previous, context)) return
    // Contexts sharing a cacheRoot resolve every cached key identically, so
    // the derived cache object is computed once per root and shared by all
    // fibers running with that root (forked fibers reuse the parent's).
    const root: any = (context as any).cacheRoot
    const cache: Fiber.Fiber.Cache = root._fiberCache ??= makeFiberContextCache(context)
    if (this.cache?.scheduler !== cache.scheduler) {
      this._dispatcher = undefined
    }
    this.cache = cache
  }
  get currentSpanLocal(): Tracer.Span | undefined {
    const span = this.cache.span
    return span?._tag === "Span" ? span : undefined
  }
}

const makeFiberContextCache = (context: Context.Context<never>): Fiber.Fiber.Cache => {
  // The string-keyed lookups keep the Tracer key values (and the native
  // tracer behind Tracer.Tracer's default) out of every bundle
  const currentTracer = Context.getOrUndefinedUnsafe<Tracer.Tracer>(context, Tracer.TracerKey)
  return {
    scheduler: Context.get(context, Scheduler.Scheduler),
    tracer: currentTracer,
    tracerContext: currentTracer ? currentTracer["context"] : undefined,
    tracerEnabled: Context.get(context, TracerEnabled),
    span: Context.getOrUndefinedUnsafe(context, Tracer.ParentSpanKey),
    logLevel: Context.get(context, CurrentLogLevel),
    minimumLogLevel: Context.get(context, MinimumLogLevel),
    stackFrame: Context.get(context, CurrentStackFrame),
    runtimeMetrics: Context.getOrUndefinedUnsafe(context, InternalMetric.FiberRuntimeMetricsKey),
    maxOpsBeforeYield: Context.get(context, Scheduler.MaxOpsBeforeYield),
    preventYield: Context.get(context, Scheduler.PreventSchedulerYield)
  }
}

const deferredInterruptCont: any = {
  [contA](_value: unknown, fiber: FiberImpl) {
    return failCause(fiber._interruptedCause!)
  },
  [contE](_cause: unknown, fiber: FiberImpl) {
    return failCause(fiber._interruptedCause!)
  }
}

// must be a power of two
const maxInlineSteps = 32

const fiberMiddleware = {
  interruptChildren: undefined as
    | ((fiber: FiberImpl) => Effect.Effect<void> | undefined)
    | undefined
}

const fiberStackAnnotations = (fiber: Fiber.Fiber<any, any>) => {
  if (!fiber.cache.stackFrame) return undefined
  const annotations = new Map<string, unknown>()
  annotations.set(InterruptorStackTrace.key, fiber.cache.stackFrame)
  return Context.makeUnsafe(annotations)
}

const fiberInterruptChildren = (fiber: FiberImpl) => {
  if (fiber._children === undefined || fiber._children.size === 0) {
    return undefined
  }
  return fiberInterruptAll(fiber._children)
}

/** @internal */
export const fiberAwait = <A, E>(
  self: Fiber.Fiber<A, E>
): Effect.Effect<Exit.Exit<A, E>> => {
  const impl = self as FiberImpl<A, E>
  if (impl._exit) return succeed(impl._exit)
  return callback((resume) => {
    if (impl._exit) return resume(succeed(impl._exit))
    return sync(self.addObserver((exit) => resume(succeed(exit))))
  })
}

/** @internal */
export const fiberAwaitAll = <Fiber extends Fiber.Fiber<any, any>>(
  self: Iterable<Fiber>
): Effect.Effect<
  Array<
    Exit.Exit<
      Fiber extends Fiber.Fiber<infer _A, infer _E> ? _A : never,
      Fiber extends Fiber.Fiber<infer _A, infer _E> ? _E : never
    >
  >
> =>
  callback((resume) => {
    const iter = self[Symbol.iterator]() as Iterator<FiberImpl>
    const exits: Array<Exit.Exit<any, any>> = []
    let cancel: (() => void) | undefined = undefined
    function loop() {
      let result = iter.next()
      while (!result.done) {
        if (result.value._exit) {
          exits.push(result.value._exit)
          result = iter.next()
          continue
        }
        cancel = result.value.addObserver((exit) => {
          exits.push(exit)
          loop()
        })
        return
      }
      resume(succeed(exits))
    }
    loop()
    return sync(() => cancel?.())
  })

/** @internal */
export const fiberJoin = <A, E>(self: Fiber.Fiber<A, E>): Effect.Effect<A, E> => {
  const impl = self as FiberImpl<A, E>
  if (impl._exit) return impl._exit
  return callback((resume) => {
    if (impl._exit) return resume(impl._exit)
    return sync(self.addObserver(resume))
  })
}

/** @internal */
export const fiberJoinAll = <A extends Iterable<Fiber.Fiber<any, any>>>(self: A): Effect.Effect<
  Arr.ReadonlyArray.With<A, A extends Iterable<Fiber.Fiber<infer _A, infer _E>> ? _A : never>,
  A extends Iterable<Fiber.Fiber<infer _A, infer _E>> ? _E : never
> =>
  callback((resume) => {
    const fibers = Array.from(self) as Array<FiberImpl>
    if (fibers.length === 0) return resume(succeed(Arr.empty() as any))
    const out = new Array<any>(fibers.length) as Arr.NonEmptyArray<any>
    const observers = Arr.empty<(exit: Exit.Exit<any, any>) => void>()
    const removeObservers = () => {
      for (let i = 0; i < observers.length; i++) {
        fibers[i].removeObserver(observers[i])
      }
    }
    let done = 0
    let failed = false
    for (let i = 0; i < fibers.length; i++) {
      if (failed) break
      const observer = (exit: Exit.Exit<any, any>) => {
        done++
        if (exit._tag === "Failure") {
          failed = true
          removeObservers()
          return resume(exit as any)
        }
        out[i] = exit.value
        if (done === fibers.length) {
          resume(succeed(out))
        }
      }
      observers.push(observer)
      fibers[i].addObserver(observer)
    }
    return sync(() => {
      failed = true
      removeObservers()
    })
  })

/** @internal */
export const fiberInterrupt = <A, E>(
  self: Fiber.Fiber<A, E>
): Effect.Effect<void> => withFiber((fiber) => fiberInterruptAs(self, fiber.id))

/** @internal */
export const fiberInterruptAs: {
  (
    fiberId: number | undefined,
    annotations?: Context.Context<never> | undefined
  ): <A, E>(self: Fiber.Fiber<A, E>) => Effect.Effect<void>
  <A, E>(
    self: Fiber.Fiber<A, E>,
    fiberId: number | undefined,
    annotations?: Context.Context<never> | undefined
  ): Effect.Effect<void>
} = dual(
  (args) => hasProperty(args[0], FiberTypeId),
  <A, E>(
    self: Fiber.Fiber<A, E>,
    fiberId: number | undefined,
    annotations?: Context.Context<never> | undefined
  ): Effect.Effect<void> =>
    withFiber((parent) => {
      let ann = fiberStackAnnotations(parent)
      ann = ann && annotations ? Context.merge(ann, annotations) : ann ?? annotations
      self.interruptUnsafe(fiberId, ann)
      return asVoid(fiberAwait(self))
    })
)

/** @internal */
export const fiberInterruptAll = <A extends Iterable<Fiber.Fiber<any, any>>>(
  fibers: A
): Effect.Effect<void> =>
  withFiber((parent) => {
    const annotations = fiberStackAnnotations(parent)
    let fiberArr = Arr.empty<Fiber.Fiber<any, any>>()
    for (const fiber of fibers) {
      fiber.interruptUnsafe(parent.id, annotations)
      fiberArr.push(fiber)
    }
    return asVoid(fiberAwaitAll(fiberArr))
  })

/** @internal */
export const fiberInterruptAllAs: {
  (fiberId: number): <A extends Iterable<Fiber.Fiber<any, any>>>(fibers: A) => Effect.Effect<void>
  <A extends Iterable<Fiber.Fiber<any, any>>>(fibers: A, fiberId: number): Effect.Effect<void>
} = dual(2, <A extends Iterable<Fiber.Fiber<any, any>>>(
  fibers: A,
  fiberId: number
): Effect.Effect<void> =>
  withFiber((parent) => {
    const annotations = fiberStackAnnotations(parent)
    const fiberArr = Arr.empty<Fiber.Fiber<any, any>>()
    for (const fiber of fibers) {
      fiber.interruptUnsafe(fiberId, annotations)
      fiberArr.push(fiber)
    }
    return asVoid(fiberAwaitAll(fiberArr))
  }))

/** @internal */
export const succeed: <A>(value: A) => Effect.Effect<A> = exitSucceed

/** @internal */
export const failCause: <E>(cause: Cause.Cause<E>) => Effect.Effect<never, E> = exitFailCause

/** @internal */
export const fail: <E>(error: E) => Effect.Effect<never, E> = exitFail

/** @internal */
export const sync: <A>(thunk: LazyArg<A>) => Effect.Effect<A> = makePrimitive({
  op: "Sync",
  [evaluate](fiber): Primitive | Yield {
    const value = this[args]()
    const cont = fiber.getCont(contA)
    return cont ? cont[contA](value, fiber) : fiber.yieldWith(exitSucceed(value))
  }
})

/** @internal */
export const suspend: <A, E, R>(
  evaluate: LazyArg<Effect.Effect<A, E, R>>
) => Effect.Effect<A, E, R> = makePrimitive({
  op: "Suspend",
  [evaluate](_fiber) {
    return this[args]()
  }
})

/** @internal */
export const fromOption: <
  Arg extends Option.Option<unknown> | LazyArg<unknown>,
  Rest extends [] | [onNone: LazyArg<unknown> | undefined] = []
>(
  arg: Arg & (Rest extends [] ? unknown : Option.Option<unknown>),
  ...rest: Rest
) => [Arg] extends [Option.Option<infer A>] ? Effect.Effect<
    A,
    Rest extends [LazyArg<infer E>] ? E
      : Rest extends [undefined] ? Cause.NoSuchElementError
      : Rest extends [LazyArg<infer E> | undefined] ? E | Cause.NoSuchElementError
      : Cause.NoSuchElementError
  >
  : [Arg] extends [LazyArg<infer E>] ? <A>(option: Option.Option<A>) => Effect.Effect<A, E>
  : never = dual(
    (args) => args.length >= 2 || Option.isOption(args[0]),
    <A, E>(option: Option.Option<A>, onNone?: LazyArg<E>): Effect.Effect<A, Cause.NoSuchElementError | E> =>
      Option.isNone(option)
        ? fail(onNone ? onNone() : new NoSuchElementError("Effect.fromOption: Option.none"))
        : succeed(option.value)
  )

/** @internal */
export const fromResult: <A, E>(result: Result.Result<A, E>) => Effect.Effect<A, E> = Result.match({
  onFailure: fail,
  onSuccess: succeed
})

/** @internal */
export const fromNullishOr = <A>(value: A): Effect.Effect<NonNullable<A>, Cause.NoSuchElementError> =>
  value == null ? fail(new NoSuchElementError()) : succeed(value)

/** @internal */
export const yieldNowWith: (priority?: number) => Effect.Effect<void> = makePrimitive({
  op: "Yield",
  [evaluate](fiber) {
    let resumed = false
    fiber.currentDispatcher.scheduleTask(() => {
      if (resumed) return
      fiber.evaluate(exitVoid as any)
    }, this[args] ?? 0)
    return fiber.yieldWith(() => {
      resumed = true
    })
  }
})

/** @internal */
export const yieldNow: Effect.Effect<void> = yieldNowWith(0)

/** @internal */
export const succeedSome = <A>(a: A): Effect.Effect<Option.Option<A>> => succeed(Option.some(a))

/** @internal */
export const succeedNone: Effect.Effect<Option.Option<never>> = succeed(
  Option.none()
)

/** @internal */
export const transposeOption = <A = never, E = never, R = never>(
  self: Option.Option<Effect.Effect<A, E, R>>
): Effect.Effect<Option.Option<A>, E, R> => Option.isNone(self) ? succeedNone : map(self.value, Option.some)

/** @internal */
export const failCauseSync = <E>(
  evaluate: LazyArg<Cause.Cause<E>>
): Effect.Effect<never, E> => suspend(() => failCause(evaluate()))

/** @internal */
export const die = (defect: unknown): Effect.Effect<never> => exitDie(defect)

/** @internal */
export const failSync = <E>(error: LazyArg<E>): Effect.Effect<never, E> => suspend(() => fail(error()))

/** @internal */
const void_: Effect.Effect<void> = succeed(void 0)
/** @internal */
export { void_ as void }

/** @internal */
const try_ = <A, E = Cause.UnknownError>(
  options: {
    readonly try: LazyArg<A>
    readonly catch: (error: unknown) => E
  } | LazyArg<A>
): Effect.Effect<A, E> => {
  const evaluate = typeof options === "function" ? options : options.try
  const catcher = typeof options === "function"
    ? ((cause: unknown) => new UnknownError(cause, "An error occurred in Effect.try"))
    : options.catch
  return suspend(() => {
    try {
      return succeed(evaluate())
    } catch (err) {
      return fail(catcher(err) as E)
    }
  })
}
/** @internal */
export { try_ as try }

/** @internal */
export const promise = <A>(
  evaluate: (signal: AbortSignal) => PromiseLike<A>
): Effect.Effect<A> =>
  callbackOptions<A>(function(resume, signal) {
    evaluate(signal!).then(
      (a) => resume(succeed(a)),
      (e) => resume(die(e))
    )
  }, evaluate.length !== 0)

/** @internal */
export const tryPromise = <A, E = Cause.UnknownError>(
  options: {
    readonly try: (signal: AbortSignal) => PromiseLike<A>
    readonly catch: (error: unknown) => E
  } | ((signal: AbortSignal) => PromiseLike<A>)
): Effect.Effect<A, E> => {
  const f = typeof options === "function" ? options : options.try
  const catcher = typeof options === "function"
    ? ((cause: unknown) => new UnknownError(cause, "An error occurred in Effect.tryPromise"))
    : options.catch
  return callbackOptions<A, E>(function(resume, signal) {
    // Defer the catcher until the fiber restores its async context.
    const failWithCatch = (cause: unknown) =>
      suspend(() => {
        try {
          return fail(internalCall(() => catcher(cause)) as E)
        } catch (err) {
          return die(err)
        }
      })
    try {
      f(signal!).then(
        (a) => resume(succeed(a)),
        (e) => resume(failWithCatch(e))
      )
    } catch (err) {
      resume(failWithCatch(err))
    }
  }, f.length !== 0)
}

/** @internal */
export const withFiberId = <A, E, R>(
  f: (fiberId: number) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => withFiber((fiber) => f(fiber.id))

/** @internal */
export const fiber = withFiber(succeed)

/** @internal */
export const fiberId = withFiberId(succeed)

const callbackOptions: <A, E = never, R = never>(
  register: (
    this: Scheduler.Scheduler,
    resume: (effect: Effect.Effect<A, E, R>) => void,
    signal?: AbortSignal
  ) => void | Effect.Effect<void, E, R>,
  withSignal: boolean
) => Effect.Effect<A, E, R> = (function() {
  const Proto = makePrimitiveProto({
    op: "Async",
    [evaluate](this: any, fiber) {
      let resumed = false
      let yielded: boolean | Primitive = false
      const controller = this.withSignal ? new AbortController() : undefined
      const onCancel = this.register.call(fiber.cache.scheduler, (effect: Effect.Effect<any, any, any>) => {
        if (resumed) return
        resumed = true
        if (yielded) {
          fiber.evaluate(effect as any)
        } else {
          yielded = effect as any
        }
      }, controller?.signal)
      if (yielded !== false) return yielded
      yielded = true
      fiber._yielded = () => {
        resumed = true
      }
      if (controller === undefined && onCancel === undefined) {
        return Yield
      }
      fiber._stack.push(
        asyncFinalizer(() => {
          resumed = true
          controller?.abort()
          return onCancel ?? exitVoid
        })
      )
      return Yield
    }
  })
  const AsyncImpl = function(this: any, register: any, withSignal: boolean) {
    this.register = register
    this.withSignal = withSignal
  } as unknown as PrimitiveCtor<[register: any, withSignal: boolean]>
  AsyncImpl.prototype = Proto
  return function(register: any, withSignal: boolean) {
    return new AsyncImpl(register, withSignal)
  } as any
})()

const asyncFinalizer: (
  onInterrupt: () => Effect.Effect<void, any, any>
) => Primitive = makePrimitive({
  op: "AsyncFinalizer",
  [contAll](fiber) {
    if (fiber.interruptible) {
      fiber.interruptible = false
      fiber._stack.push(setInterruptibleTrue)
    }
  },
  [contE](cause, _fiber) {
    return hasInterrupts(cause)
      ? flatMap(combineFinalizerCause(exitFailCause(cause), this[args]()), () => failCause(cause))
      : failCause(cause)
  }
})

/** @internal */
export const callback = <A, E = never, R = never>(
  register: (
    this: Scheduler.Scheduler,
    resume: (effect: Effect.Effect<A, E, R>) => void,
    signal: AbortSignal
  ) => void | Effect.Effect<void, E, R>
): Effect.Effect<A, E, R> => callbackOptions(register as any, register.length >= 2)

/** @internal */
export const never: Effect.Effect<never> = callback<never>(constVoid)

/** @internal */
export const gen = <
  Self,
  Eff extends Effect.Effect<any, any, any>,
  AEff
>(
  ...args:
    | [options: { readonly self: Self }, body: (this: Self) => Generator<Eff, AEff, never>]
    | [body: () => Generator<Eff, AEff, never>]
): Effect.Effect<
  AEff,
  [Eff] extends [never] ? never
    : [Eff] extends [Effect.Effect<infer _A, infer E, infer _R>] ? E
    : never,
  [Eff] extends [never] ? never
    : [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>] ? R
    : never
> => {
  if (args.length === 1) {
    const body = args[0]
    return suspend(() => fromIteratorUnsafe(body()))
  }
  const [options, body] = args
  return suspend(() => fromIteratorUnsafe(body.call(options.self) as any))
}

/** @internal */
export const fnUntraced: Effect.fn.Untraced = (
  body: Function,
  ...pipeables: Array<any>
) => {
  const fn = pipeables.length === 0
    ? function(this: any) {
      return suspend(() => fromIteratorUnsafe(body.apply(this, arguments)))
    }
    : function(this: any) {
      let effect = suspend(() => fromIteratorUnsafe(body.apply(this, arguments)))
      for (let i = 0; i < pipeables.length; i++) {
        effect = pipeables[i](effect, ...arguments)
      }
      return effect
    }
  return defineFunctionLength(body.length, fn)
}

const defineFunctionLength = <F extends Function>(length: number, fn: F): F =>
  Object.defineProperty(fn, "length", {
    value: length,
    configurable: true
  })

const fnStackCleaner = makeStackCleaner(2)

/** @internal */
export const fn: typeof Effect.fn = function() {
  const nameFirst = typeof arguments[0] === "string"
  const name = nameFirst ? arguments[0] : "Effect.fn"
  const spanOptions = nameFirst ? arguments[1] : undefined

  const prevLimit = getStackTraceLimit()
  let defError: Error | undefined
  if (prevLimit !== 0) {
    setStackTraceLimit(2)
    defError = new globalThis.Error()
    setStackTraceLimit(prevLimit)
  }

  if (nameFirst) {
    return (body: Function | { readonly self: any }, ...pipeables: Array<Function>) =>
      makeFn(name, body, defError, pipeables, nameFirst, spanOptions)
  }

  return makeFn(
    name,
    arguments[0],
    defError,
    Array.prototype.slice.call(arguments, 1),
    nameFirst,
    spanOptions
  )
} as any

const makeFn = (
  name: string,
  bodyOrOptions: Function | { readonly self: any },
  defError: Error | undefined,
  pipeables: Array<Function>,
  addSpan: boolean,
  spanOptions: Tracer.SpanOptionsNoTrace | undefined
) => {
  const body = typeof bodyOrOptions === "function"
    ? bodyOrOptions
    : (pipeables.shift()!).bind(bodyOrOptions.self)
  const definitionName = `${name} (definition)`
  const definitionStack = defError ? fnStackCleaner(() => defError.stack) : constUndefined

  return defineFunctionLength(body.length, function(this: any, ...args: Array<any>) {
    let result = suspend(() => {
      const iter = body.apply(this, arguments)
      return isEffect(iter) ? iter : fromIteratorUnsafe(iter)
    })
    for (let i = 0; i < pipeables.length; i++) {
      result = pipeables[i](result, ...args)
    }
    if (!isEffect(result)) {
      return result
    }
    const prevLimit = getStackTraceLimit()
    let callError: Error | undefined
    if (prevLimit !== 0) {
      setStackTraceLimit(2)
      callError = new globalThis.Error()
      setStackTraceLimit(prevLimit)
    }
    return updateService(
      addSpan ?
        useSpan(name, spanOptions!, (span) => provideParentSpan(result, span)) :
        result,
      CurrentStackFrame,
      (prev) => ({
        name,
        stack: callError ? fnStackCleaner(() => callError.stack) : constUndefined,
        parent: {
          name: definitionName,
          stack: definitionStack,
          parent: prev
        }
      })
    )
  })
}

/** @internal */
export const fnUntracedEager: Effect.fn.Untraced = (
  body: Function,
  ...pipeables: Array<any>
) =>
  defineFunctionLength(
    body.length,
    pipeables.length === 0
      ? function(this: any) {
        return fromIteratorEagerUnsafe(() => body.apply(this, arguments))
      }
      : function(this: any) {
        let effect = fromIteratorEagerUnsafe(() => body.apply(this, arguments))
        for (const pipeable of pipeables) {
          effect = pipeable(effect, ...arguments)
        }
        return effect
      }
  )

const fromIteratorEagerUnsafe = (
  evaluate: () => Iterator<Effect.Effect<any, any, any>>
): Effect.Effect<any, any, any> => {
  try {
    const iterator = evaluate()
    let value: any = undefined

    // Try to resolve synchronously in a loop
    while (true) {
      const state = iterator.next(value)

      if (state.done) {
        return succeed(state.value)
      }

      const primitive = state.value as any

      if (primitive && primitive._tag === "Success") {
        value = primitive.value
        continue
      } else if (primitive && primitive._tag === "Failure") {
        return state.value
      } else {
        let isFirstExecution = true

        return suspend(() => {
          if (isFirstExecution) {
            isFirstExecution = false
            return flatMap(state.value, (value) => fromIteratorUnsafe(iterator, value))
          } else {
            return suspend(() => fromIteratorUnsafe(evaluate()))
          }
        })
      }
    }
  } catch (error) {
    return die(error)
  }
}

const fromIteratorUnsafe: (
  iterator: Iterator<Effect.Effect<any, any, any>>,
  initial?: undefined
) => Effect.Effect<any, any, any> = (function() {
  const Proto = makePrimitiveProto({
    op: "Iterator",
    [contA](this: any, value, fiber) {
      const iter = this.iterator
      while (true) {
        const state = iter.next(value)
        if (state.done) return succeed(state.value)
        if (!effectIsExit(state.value)) {
          fiber._stack.push(this)
          return state.value
        } else if (state.value._tag === "Failure") {
          return state.value
        }
        value = state.value.value
      }
    },
    [evaluate](this: any, fiber: FiberImpl) {
      return this[contA](this.initial, fiber)
    }
  })
  const IteratorImpl = function(this: any, iterator: any, initial: any) {
    this.iterator = iterator
    this.initial = initial
  } as unknown as PrimitiveCtor<[iterator: any, initial: any]>
  IteratorImpl.prototype = Proto
  return function(iterator: any, initial?: undefined) {
    return new IteratorImpl(iterator, initial)
  } as any
})()

// ----------------------------------------------------------------------------
// mapping & sequencing
// ----------------------------------------------------------------------------

/** @internal */
export const as: {
  <A, B>(
    value: B
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, E, R>
  <A, E, R, B>(self: Effect.Effect<A, E, R>, value: B): Effect.Effect<B, E, R>
} = dual(
  2,
  <A, E, R, B>(
    self: Effect.Effect<A, E, R>,
    value: B
  ): Effect.Effect<B, E, R> => new ContImpl(self, returnPayload, succeed(value))
)

const evaluateCont = function(this: any, fiber: FiberImpl): Primitive {
  fiber._stack.push(this)
  return this[args]
}

interface PrimitiveCtor<Args extends Array<any>> {
  new(...args: Args): Primitive & Effect.Effect<any, any, any>
  prototype: any
}

const OnSuccessProto = makePrimitiveProto({
  op: "OnSuccess",
  [evaluate]: evaluateCont
})

// A success continuation with an extra payload slot. The stored continuation
// receives the primitive as `this` and reads `this.payload`, so combinators
// like map / as / tap / andThen / flatMap can share module-level continuation
// functions instead of allocating a closure per call.
const ContImpl = function(
  this: any,
  self: Effect.Effect<any, any, any>,
  cont: (this: { readonly payload: any }, value: any, fiber: FiberImpl) => unknown,
  payload: unknown
) {
  this[args] = self
  this[contA] = cont
  this.payload = payload
} as unknown as PrimitiveCtor<
  [
    self: Effect.Effect<any, any, any>,
    cont: (this: { readonly payload: any }, value: any, fiber: FiberImpl) => unknown,
    payload: unknown
  ]
>
ContImpl.prototype = OnSuccessProto

const returnPayload = function(this: { readonly payload: any }) {
  return this.payload
}
const succeedPayload = function(this: { readonly payload: any }, _value: unknown, fiber: FiberImpl) {
  return fiber.succeedWith(this.payload)
}
// V8 includes the property name of a stored continuation in its stack trace.
// Other engines need an explicit frame for the stack cleaner to cut at.
const continuationMarksStack = (() => {
  const marker = "~effect/Effect/stackProbe"
  const probe = {
    [marker]: function stackProbe() {
      return new Error().stack
    }
  }
  return probe[marker]()?.includes("[as " + marker + "]") === true
})()
const mapCont = function(this: { readonly payload: any }, value: any, fiber: FiberImpl) {
  const f = this.payload
  return fiber.succeedWith(continuationMarksStack ? f(value) : internalCall(() => f(value)))
}
const andThenCont = function(this: { readonly payload: any }, value: any) {
  const f = this.payload
  return f(value)
}
const tapCont = function(this: { readonly payload: any }, value: any) {
  const f = this.payload
  return new ContImpl(f(value), succeedPayload, value)
}
const tapEffectCont = function(this: { readonly payload: any }, value: any) {
  return new ContImpl(this.payload, succeedPayload, value)
}

/** @internal */
export const asSome = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<Option.Option<A>, E, R> => map(self, Option.some)

/** @internal */
export const flip = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<E, A, R> =>
  matchEffect(self, {
    onFailure: succeed,
    onSuccess: fail
  })

/** @internal */
export const andThen: {
  <A, B, E2, R2>(
    f: (a: A) => Effect.Effect<B, E2, R2>
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, E | E2, R | R2>
  <B, E2, R2>(
    f: Effect.Effect<B, E2, R2>
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (a: A) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: Effect.Effect<B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: ((a: A) => Effect.Effect<B, E2, R2>) | Effect.Effect<B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2> => new ContImpl(self, isEffect(f) ? returnPayload : andThenCont, f)
)

/** @internal */
export const tap: {
  <A, B, E2, R2>(
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, R | R2>
  <B, E2, R2>(
    f: Effect.Effect<B, E2, R2>
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: ((a: A) => Effect.Effect<B, E2, R2>) | Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2> => new ContImpl(self, isEffect(f) ? tapEffectCont : tapCont, f)
)

/** @internal */
export const asVoid = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<void, E, R> => new ContImpl(self, returnPayload, exitVoid)

/** @internal */
export const sandbox = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, Cause.Cause<E>, R> => catchCause(self, fail)

/** @internal */
export const raceAll = <Eff extends Effect.Effect<any, any, any>>(
  all: Iterable<Eff>,
  options?: {
    readonly onWinner?: (options: {
      readonly fiber: Fiber.Fiber<any, any>
      readonly index: number
      readonly parentFiber: Fiber.Fiber<any, any>
    }) => void
  }
): Effect.Effect<
  Effect.Success<Eff>,
  Effect.Error<Eff>,
  Effect.Services<Eff>
> =>
  withFiber((parent) => {
    const fibers = new Set<Fiber.Fiber<any, any>>()
    // Read fibers on exit to include losers forked after the race settles.
    onExitUnsafe(parent, () => fibers.size === 0 ? undefined : fiberInterruptAll(fibers))
    return callback((resume) => {
      const effects = Arr.fromIterable(all)
      const len = effects.length
      let doneCount = 0
      let done = false
      const failures: Array<Cause.Reason<any>> = []
      const onExit = (exit: Exit.Exit<any, any>, fiber: Fiber.Fiber<any, any>, i: number) => {
        doneCount++
        if (exit._tag === "Failure") {
          failures.push(...exit.cause.reasons)
          if (doneCount >= len) {
            resume(failCause(causeFromReasons(failures)))
          }
          return
        }
        const isWinner = !done
        done = true
        resume(exit)
        if (isWinner && options?.onWinner) {
          options.onWinner({ fiber, index: i, parentFiber: parent })
        }
      }

      for (let i = 0; i < len; i++) {
        const fiber = forkUnsafe(parent, effects[i], true, true, false)
        fibers.add(fiber)
        fiber.addObserver((exit) => {
          fibers.delete(fiber)
          onExit(exit, fiber, i)
        })
        if (done) break
      }
    })
  })

/** @internal */
export const raceAllFirst = <Eff extends Effect.Effect<any, any, any>>(
  all: Iterable<Eff>,
  options?: {
    readonly onWinner?: (options: {
      readonly fiber: Fiber.Fiber<any, any>
      readonly index: number
      readonly parentFiber: Fiber.Fiber<any, any>
    }) => void
  }
): Effect.Effect<
  Effect.Success<Eff>,
  Effect.Error<Eff>,
  Effect.Services<Eff>
> =>
  withFiber((parent) => {
    const fibers = new Set<Fiber.Fiber<any, any>>()
    onExitUnsafe(parent, () => fibers.size === 0 ? undefined : fiberInterruptAll(fibers))
    return callback((resume) => {
      let done = false
      let i = 0
      for (const effect of all) {
        if (done) break
        const index = i++
        const fiber = forkUnsafe(parent, effect, true, true, false)
        fibers.add(fiber)
        fiber.addObserver((exit) => {
          fibers.delete(fiber)
          const isWinner = !done
          done = true
          resume(exit)
          if (isWinner && options?.onWinner) {
            options.onWinner({ fiber, index, parentFiber: parent })
          }
        })
      }
    })
  })

/** @internal */
export const race: {
  <A2, E2, R2>(
    that: Effect.Effect<A2, E2, R2>,
    options?: {
      readonly onWinner?: (options: {
        readonly fiber: Fiber.Fiber<any, any>
        readonly index: number
        readonly parentFiber: Fiber.Fiber<any, any>
      }) => void
    }
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A | A2, E | E2, R | R2>
  <A, E, R, A2, E2, R2>(
    self: Effect.Effect<A, E, R>,
    that: Effect.Effect<A2, E2, R2>,
    options?: {
      readonly onWinner?: (options: {
        readonly fiber: Fiber.Fiber<any, any>
        readonly index: number
        readonly parentFiber: Fiber.Fiber<any, any>
      }) => void
    }
  ): Effect.Effect<A | A2, E | E2, R | R2>
} = dual(
  (args) => isEffect(args[1]),
  <A, E, R, A2, E2, R2>(
    self: Effect.Effect<A, E, R>,
    that: Effect.Effect<A2, E2, R2>,
    options?: {
      readonly onWinner?: (options: {
        readonly fiber: Fiber.Fiber<any, any>
        readonly index: number
        readonly parentFiber: Fiber.Fiber<any, any>
      }) => void
    }
  ): Effect.Effect<A | A2, E | E2, R | R2> => raceAll([self, that], options)
)

/** @internal */
export const raceFirst: {
  <A2, E2, R2>(
    that: Effect.Effect<A2, E2, R2>,
    options?: {
      readonly onWinner?: (options: {
        readonly fiber: Fiber.Fiber<any, any>
        readonly index: number
        readonly parentFiber: Fiber.Fiber<any, any>
      }) => void
    }
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A | A2, E | E2, R | R2>
  <A, E, R, A2, E2, R2>(
    self: Effect.Effect<A, E, R>,
    that: Effect.Effect<A2, E2, R2>,
    options?: {
      readonly onWinner?: (options: {
        readonly fiber: Fiber.Fiber<any, any>
        readonly index: number
        readonly parentFiber: Fiber.Fiber<any, any>
      }) => void
    }
  ): Effect.Effect<A | A2, E | E2, R | R2>
} = dual(
  (args) => isEffect(args[1]),
  <A, E, R, A2, E2, R2>(
    self: Effect.Effect<A, E, R>,
    that: Effect.Effect<A2, E2, R2>,
    options?: {
      readonly onWinner?: (options: {
        readonly fiber: Fiber.Fiber<any, any>
        readonly index: number
        readonly parentFiber: Fiber.Fiber<any, any>
      }) => void
    }
  ): Effect.Effect<A | A2, E | E2, R | R2> => raceAllFirst([self, that], options)
)

/** @internal */
export const flatMap: {
  <A, B, E2, R2>(
    f: (a: A) => Effect.Effect<B, E2, R2>
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (a: A) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (a: A) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2> => new ContImpl(self, andThenCont, f)
)

/** @internal */
export const matchCauseEffectEager: {
  <E, A2, E2, R2, A, A3, E3, R3>(options: {
    readonly onFailure: (cause: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
    readonly onSuccess: (a: A) => Effect.Effect<A3, E3, R3>
  }): <R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A2 | A3, E2 | E3, R2 | R3 | R>
  <A, E, R, A2, E2, R2, A3, E3, R3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
      readonly onSuccess: (a: A) => Effect.Effect<A3, E3, R3>
    }
  ): Effect.Effect<A2 | A3, E2 | E3, R2 | R3 | R>
} = dual(
  2,
  <A, E, R, A2, E2, R2, A3, E3, R3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
      readonly onSuccess: (a: A) => Effect.Effect<A3, E3, R3>
    }
  ): Effect.Effect<A2 | A3, E2 | E3, R2 | R3 | R> => {
    if (effectIsExit(self)) {
      return self._tag === "Success"
        ? options.onSuccess(self.value)
        : options.onFailure(self.cause)
    }
    return matchCauseEffect(self, options)
  }
)

/** @internal */
export const effectIsExit = <A, E, R>(effect: Effect.Effect<A, E, R>): effect is Exit.Exit<A, E> =>
  (effect as any)[ExitTypeId] !== undefined

/** @internal */
export const flatMapEager: {
  <A, B, E2, R2>(
    f: (a: A) => Effect.Effect<B, E2, R2>
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (a: A) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (a: A) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2> => {
    if (effectIsExit(self)) {
      return self._tag === "Success" ? f(self.value) : self as Exit.Exit<never, E>
    }
    return flatMap(self, f)
  }
)

// ----------------------------------------------------------------------------
// mapping & sequencing
// ----------------------------------------------------------------------------

/** @internal */
export const flatten = <A, E, R, E2, R2>(
  self: Effect.Effect<Effect.Effect<A, E, R>, E2, R2>
): Effect.Effect<A, E | E2, R | R2> => flatMap(self, identity)

/** @internal */
export const map: {
  <A, B>(
    f: (a: A) => B
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, E, R>
  <A, E, R, B>(
    self: Effect.Effect<A, E, R>,
    f: (a: A) => B
  ): Effect.Effect<B, E, R>
} = dual(
  2,
  <A, E, R, B>(
    self: Effect.Effect<A, E, R>,
    f: (a: A) => B
  ): Effect.Effect<B, E, R> => new ContImpl(self, mapCont, f)
)

/** @internal */
export const mapEager: {
  <A, B>(
    f: (a: A) => B
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, E, R>
  <A, E, R, B>(
    self: Effect.Effect<A, E, R>,
    f: (a: A) => B
  ): Effect.Effect<B, E, R>
} = dual(
  2,
  <A, E, R, B>(
    self: Effect.Effect<A, E, R>,
    f: (a: A) => B
  ): Effect.Effect<B, E, R> => effectIsExit(self) ? exitMap(self, f) : map(self, f)
)

/** @internal */
export const mapErrorEager: {
  <E, E2>(
    f: (e: E) => E2
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E2, R>
  <A, E, R, E2>(
    self: Effect.Effect<A, E, R>,
    f: (e: E) => E2
  ): Effect.Effect<A, E2, R>
} = dual(
  2,
  <A, E, R, E2>(
    self: Effect.Effect<A, E, R>,
    f: (e: E) => E2
  ): Effect.Effect<A, E2, R> => effectIsExit(self) ? exitMapError(self, f) : mapError(self, f)
)

/** @internal */
export const mapBothEager: {
  <E, E2, A, A2>(
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A2, E2, R>
  <A, E, R, E2, A2>(
    self: Effect.Effect<A, E, R>,
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): Effect.Effect<A2, E2, R>
} = dual(
  2,
  <A, E, R, E2, A2>(
    self: Effect.Effect<A, E, R>,
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): Effect.Effect<A2, E2, R> => effectIsExit(self) ? exitMapBoth(self, options) : mapBoth(self, options)
)

/** @internal */
export const catchEager: {
  <E, B, E2, R2>(
    f: (e: NoInfer<E>) => Effect.Effect<B, E2, R2>
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A | B, E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (e: NoInfer<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (e: NoInfer<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, E2, R | R2> => {
    if (effectIsExit(self)) {
      if (self._tag === "Success") return self as Exit.Exit<A>
      const error = findError(self.cause)
      if (Result.isFailure(error)) return self as Exit.Exit<never>
      return f(error.success)
    }
    return catch_(self, f)
  }
)

// ----------------------------------------------------------------------------
// Exit
// ----------------------------------------------------------------------------

/** @internal */
export const exitInterrupt = (fiberId?: number | undefined): Exit.Exit<never> => exitFailCause(causeInterrupt(fiberId))

/** @internal */
export const exitIsSuccess = <A, E>(
  self: Exit.Exit<A, E>
): self is Exit.Success<A, E> => self._tag === "Success"

/** @internal */
export const exitFilterSuccess = <A, E>(
  self: Exit.Exit<A, E>
): Result.Result<Exit.Success<A>, Exit.Failure<never, E>> =>
  self._tag === "Success" ? Result.succeed(self as any) : Result.fail(self as any)

/** @internal */
export const exitFilterValue = <A, E>(
  self: Exit.Exit<A, E>
): Result.Result<A, Exit.Failure<never, E>> =>
  self._tag === "Success" ? Result.succeed(self.value) : Result.fail(self as any)

/** @internal */
export const exitIsFailure = <A, E>(
  self: Exit.Exit<A, E>
): self is Exit.Failure<A, E> => self._tag === "Failure"

/** @internal */
export const exitFilterFailure = <A, E>(
  self: Exit.Exit<A, E>
): Result.Result<Exit.Failure<never, E>, Exit.Success<A>> =>
  self._tag === "Failure" ? Result.succeed(self as any) : Result.fail(self as any)

/** @internal */
export const exitFilterCause = <A, E>(
  self: Exit.Exit<A, E>
): Result.Result<Cause.Cause<E>, Exit.Success<A>> =>
  self._tag === "Failure" ? Result.succeed(self.cause) : Result.fail(self as any)

/** @internal */
export const exitFindError = Filter.composePassthrough(
  exitFilterCause,
  findError
)

/** @internal */
export const exitFindDefect = Filter.composePassthrough(
  exitFilterCause,
  findDefect
)

/** @internal */
export const exitHasInterrupts = <A, E>(
  self: Exit.Exit<A, E>
): self is Exit.Failure<A, E> => self._tag === "Failure" && hasInterrupts(self.cause)

/** @internal */
export const exitHasDies = <A, E>(
  self: Exit.Exit<A, E>
): self is Exit.Failure<A, E> => self._tag === "Failure" && hasDies(self.cause)

/** @internal */
export const exitHasFails = <A, E>(
  self: Exit.Exit<A, E>
): self is Exit.Failure<A, E> => self._tag === "Failure" && hasFails(self.cause)

/** @internal */
export const exitVoid: Exit.Exit<void> = exitSucceed(void 0)

/** @internal */
export const exitMap: {
  <A, B>(f: (a: A) => B): <E>(self: Exit.Exit<A, E>) => Exit.Exit<B, E>
  <A, E, B>(self: Exit.Exit<A, E>, f: (a: A) => B): Exit.Exit<B, E>
} = dual(
  2,
  <A, E, B>(self: Exit.Exit<A, E>, f: (a: A) => B): Exit.Exit<B, E> =>
    self._tag === "Success" ? exitSucceed(f(self.value)) : (self as any)
)

/** @internal */
export const exitMapError: {
  <E, E2>(f: (a: NoInfer<E>) => E2): <A>(self: Exit.Exit<A, E>) => Exit.Exit<A, E2>
  <A, E, E2>(self: Exit.Exit<A, E>, f: (a: NoInfer<E>) => E2): Exit.Exit<A, E2>
} = dual(
  2,
  <A, E, E2>(self: Exit.Exit<A, E>, f: (a: NoInfer<E>) => E2): Exit.Exit<A, E2> => {
    if (self._tag === "Success") return self as Exit.Exit<A>
    const error = findError(self.cause)
    if (Result.isFailure(error)) return self as Exit.Exit<never>
    return exitFail(f(error.success))
  }
)

/** @internal */
export const exitMapBoth: {
  <E, E2, A, A2>(
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): (self: Exit.Exit<A, E>) => Exit.Exit<A2, E2>
  <A, E, E2, A2>(
    self: Exit.Exit<A, E>,
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): Exit.Exit<A2, E2>
} = dual(
  2,
  <A, E, E2, A2>(
    self: Exit.Exit<A, E>,
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): Exit.Exit<A2, E2> => {
    if (self._tag === "Success") return exitSucceed(options.onSuccess(self.value))
    const error = findError(self.cause)
    if (Result.isFailure(error)) return self as Exit.Exit<never>
    return exitFail(options.onFailure(error.success))
  }
)

/** @internal */
export const exitAs: {
  <B>(b: B): <A, E>(self: Exit.Exit<A, E>) => Exit.Exit<B, E>
  <A, E, B>(self: Exit.Exit<A, E>, b: B): Exit.Exit<B, E>
} = dual(
  2,
  <A, E, B>(self: Exit.Exit<A, E>, b: B): Exit.Exit<B, E> => exitIsSuccess(self) ? exitSucceed(b) : (self as any)
)

/** @internal */
export const exitZipRight: {
  <A2, E2>(
    that: Exit.Exit<A2, E2>
  ): <A, E>(self: Exit.Exit<A, E>) => Exit.Exit<A2, E | E2>
  <A, E, A2, E2>(
    self: Exit.Exit<A, E>,
    that: Exit.Exit<A2, E2>
  ): Exit.Exit<A2, E | E2>
} = dual(
  2,
  <A, E, A2, E2>(
    self: Exit.Exit<A, E>,
    that: Exit.Exit<A2, E2>
  ): Exit.Exit<A2, E | E2> => (exitIsSuccess(self) ? that : (self as any))
)

/** @internal */
export const exitMatch: {
  <A, E, X1, X2>(options: {
    readonly onSuccess: (a: NoInfer<A>) => X1
    readonly onFailure: (cause: Cause.Cause<NoInfer<E>>) => X2
  }): (self: Exit.Exit<A, E>) => X1 | X2
  <A, E, X1, X2>(
    self: Exit.Exit<A, E>,
    options: {
      readonly onSuccess: (a: A) => X1
      readonly onFailure: (cause: Cause.Cause<E>) => X2
    }
  ): X1 | X2
} = dual(
  2,
  <A, E, X1, X2>(
    self: Exit.Exit<A, E>,
    options: {
      readonly onSuccess: (a: A) => X1
      readonly onFailure: (cause: Cause.Cause<E>) => X2
    }
  ): X1 | X2 =>
    exitIsSuccess(self)
      ? options.onSuccess(self.value)
      : options.onFailure(self.cause)
)

/** @internal */
export const exitAsVoid: <A, E>(self: Exit.Exit<A, E>) => Exit.Exit<void, E> = exitAs(void 0)

/** @internal */
export const exitAsVoidAll = <I extends Iterable<Exit.Exit<any, any>>>(
  exits: I
): Exit.Exit<
  void,
  I extends Iterable<Exit.Exit<infer _A, infer _E>> ? _E : never
> => {
  const failures: Array<Cause.Reason<any>> = []
  for (const exit of exits) {
    if (exit._tag === "Failure") {
      failures.push(...exit.cause.reasons)
    }
  }
  return failures.length === 0 ? exitVoid : exitFailCause(causeFromReasons(failures))
}

/** @internal */
export const exitGetSuccess = <A, E>(self: Exit.Exit<A, E>): Option.Option<A> =>
  exitIsSuccess(self) ? Option.some(self.value) : Option.none()

/** @internal */
export const exitGetCause = <A, E>(self: Exit.Exit<A, E>): Option.Option<Cause.Cause<E>> =>
  exitIsFailure(self) ? Option.some(self.cause) : Option.none()

/** @internal */
export const exitFindErrorOption = <A, E>(self: Exit.Exit<A, E>): Option.Option<E> => {
  const error = exitFindError(self)
  return Result.isFailure(error) ? Option.none() : Option.some(error.success)
}

// ----------------------------------------------------------------------------
// environment
// ----------------------------------------------------------------------------

/** @internal */
export const service = <I, S>(service: Context.Key<I, S>): Effect.Effect<S, never, I> => service

/** @internal */
export const serviceOption = <I, S>(
  service: Context.Key<I, S>
): Effect.Effect<Option.Option<S>> => withFiber((fiber) => succeed(Context.getOption(fiber.context, service)))

/** @internal */
export const serviceOptional = <I, S>(
  service: Context.Key<I, S>
): Effect.Effect<S, Cause.NoSuchElementError> =>
  withFiber((fiber) => fromOption(Context.getOption(fiber.context, service)))

/** @internal */
export const updateContext: {
  <R2, R>(
    f: (context: Context.Context<R2>) => Context.Context<NoInfer<R>>
  ): <A, E>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R2>
  <A, E, R, R2>(
    self: Effect.Effect<A, E, R>,
    f: (context: Context.Context<R2>) => Context.Context<NoInfer<R>>
  ): Effect.Effect<A, E, R2>
} = dual(
  2,
  <A, E, R, R2>(
    self: Effect.Effect<A, E, R>,
    f: (context: Context.Context<R2>) => Context.Context<NoInfer<R>>
  ): Effect.Effect<A, E, R2> =>
    withFiber<A, E, R2>((fiber) => {
      const prevContext = fiber.context as Context.Context<R2>
      const nextContext = f(prevContext)
      if (prevContext === nextContext) return self as any
      fiber.setContext(nextContext)
      onExitUnsafe(fiber, () => {
        fiber.setContext(prevContext)
        return undefined
      })
      return self as any
    })
)

/** @internal */
export const updateService: {
  <I, A>(
    service: Context.Key<I, A>,
    f: (value: A) => A
  ): <XA, E, R>(self: Effect.Effect<XA, E, R>) => Effect.Effect<XA, E, R | I>
  <XA, E, R, I, A>(
    self: Effect.Effect<XA, E, R>,
    service: Context.Key<I, A>,
    f: (value: A) => A
  ): Effect.Effect<XA, E, R | I>
} = dual(
  3,
  <XA, E, R, I, A>(
    self: Effect.Effect<XA, E, R>,
    service: Context.Key<I, A>,
    f: (value: A) => A
  ): Effect.Effect<XA, E, R | I> =>
    updateContext(self, (s) => {
      const prev = Context.getUnsafe(s, service)
      const next = f(prev)
      if (prev === next) return s
      return Context.add(s, service, next)
    })
)

/** @internal */
export const updateServiceScoped = <I, A>(
  service: Context.Key<I, A>,
  update: (value: A) => A,
  options?: {
    readonly reset?: ((original: A, updated: A, current: A) => A) | undefined
  } | undefined
): Effect.Effect<void, never, I | Scope.Scope> =>
  uninterruptible(withFiber((fiber) => {
    const original = Context.getUnsafe(fiber.context, service)
    const updated = update(original)
    fiber.setContext(Context.add(fiber.context, service, updated))
    return scopeAddFinalizerExit(Context.getUnsafe(fiber.context, scopeTag), (_) => {
      const currentOption = Context.getOption(fiber.context, service)
      if (Option.isNone(currentOption)) return void_
      const current = currentOption.value
      let next: A
      if (options?.reset === undefined) {
        if (current !== updated) return void_
        next = original
      } else {
        next = options.reset(original, updated, current)
      }
      fiber.setContext(Context.add(fiber.context, service, next))
      return void_
    })
  }))

/** @internal */
export const context = <R = never>(): Effect.Effect<Context.Context<R>> => getContext as any
const getContext = withFiber((fiber) => succeed(fiber.context))

/** @internal */
export const contextWith = <R, A, E, R2>(
  f: (context: Context.Context<R>) => Effect.Effect<A, E, R2>
): Effect.Effect<A, E, R | R2> => withFiber((fiber) => f(fiber.context as Context.Context<R>))

/** @internal */
export const setContext: {
  <R>(
    context: Context.Context<R>
  ): <A, E>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    context: Context.Context<R>
  ): Effect.Effect<A, E>
} = dual(
  2,
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    context: Context.Context<R>
  ): Effect.Effect<A, E> => updateContext(self, constant(context))
)

/** @internal */
export const provideContext: {
  <XR>(
    context: Context.Context<XR>
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, Exclude<R, XR>>
  <A, E, R, XR>(
    self: Effect.Effect<A, E, R>,
    context: Context.Context<XR>
  ): Effect.Effect<A, E, Exclude<R, XR>>
} = dual(
  2,
  <A, E, R, XR>(
    self: Effect.Effect<A, E, R>,
    context: Context.Context<XR>
  ): Effect.Effect<A, E, Exclude<R, XR>> => {
    if (effectIsExit(self)) return self as any
    return updateContext(self, Context.merge(context)) as any
  }
)

/** @internal */
export const provideService: {
  <I, S>(
    service: Context.Key<I, S>
  ): {
    (implementation: S): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, I>>
    <A, E, R>(self: Effect.Effect<A, E, R>, implementation: S): Effect.Effect<A, E, Exclude<R, I>>
  }
  <I, S>(
    key: Context.Key<I, S>,
    implementation: S
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, Exclude<R, I>>
  <A, E, R, I, S>(
    self: Effect.Effect<A, E, R>,
    service: Context.Key<I, S>,
    implementation: S
  ): Effect.Effect<A, E, Exclude<R, I>>
} = function(this: any) {
  if (arguments.length === 1) {
    return dual(2, (self, impl) => provideServiceImpl(self, arguments[0], impl)) as any
  }
  return dual(3, (self, service, impl) => provideServiceImpl(self, service, impl))
    .apply(this, arguments as any) as any
}

const provideServiceImpl = <A, E, R, I, S>(
  self: Effect.Effect<A, E, R>,
  service: Context.Key<I, S>,
  implementation: S
): Effect.Effect<A, E, Exclude<R, I>> => updateContext(self, Context.add(service, implementation)) as any

/** @internal */
export const provideServiceEffect: {
  <I, S, E2, R2>(
    service: Context.Key<I, S>,
    acquire: Effect.Effect<S, E2, R2>
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | E2, Exclude<R, I> | R2>
  <A, E, R, I, S, E2, R2>(
    self: Effect.Effect<A, E, R>,
    service: Context.Key<I, S>,
    acquire: Effect.Effect<S, E2, R2>
  ): Effect.Effect<A, E | E2, Exclude<R, I> | R2>
} = dual(
  3,
  <A, E, R, I, S, E2, R2>(
    self: Effect.Effect<A, E, R>,
    service: Context.Key<I, S>,
    acquire: Effect.Effect<S, E2, R2>
  ): Effect.Effect<A, E | E2, Exclude<R, I> | R2> =>
    flatMap(acquire, (implementation) => provideService(self, service, implementation))
)

// ----------------------------------------------------------------------------
// zipping
// ----------------------------------------------------------------------------

/** @internal */
export const zip: {
  <A2, E2, R2>(
    that: Effect.Effect<A2, E2, R2>,
    options?: { readonly concurrent?: boolean | undefined } | undefined
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<[A, A2], E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Effect.Effect<A, E, R>,
    that: Effect.Effect<A2, E2, R2>,
    options?: { readonly concurrent?: boolean | undefined }
  ): Effect.Effect<[A, A2], E | E2, R | R2>
} = dual(
  (args) => isEffect(args[1]),
  <A, E, R, A2, E2, R2>(
    self: Effect.Effect<A, E, R>,
    that: Effect.Effect<A2, E2, R2>,
    options?: { readonly concurrent?: boolean | undefined }
  ): Effect.Effect<[A, A2], E | E2, R | R2> => zipWith(self, that, (a, a2) => [a, a2], options)
)

/** @internal */
export const zipWith: {
  <A2, E2, R2, A, B>(
    that: Effect.Effect<A2, E2, R2>,
    f: (a: A, b: A2) => B,
    options?: { readonly concurrent?: boolean | undefined }
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2, B>(
    self: Effect.Effect<A, E, R>,
    that: Effect.Effect<A2, E2, R2>,
    f: (a: A, b: A2) => B,
    options?: { readonly concurrent?: boolean | undefined }
  ): Effect.Effect<B, E2 | E, R2 | R>
} = dual(
  (args) => isEffect(args[1]),
  <A, E, R, A2, E2, R2, B>(
    self: Effect.Effect<A, E, R>,
    that: Effect.Effect<A2, E2, R2>,
    f: (a: A, b: A2) => B,
    options?: { readonly concurrent?: boolean | undefined }
  ): Effect.Effect<B, E2 | E, R2 | R> =>
    options?.concurrent
      // Use `all` exclusively for concurrent cases, as it introduces additional overhead due to the management of concurrency
      ? map(all([self, that], { concurrency: 2 }), ([a, a2]) => f(a, a2))
      : flatMap(self, (a) => map(that, (a2) => f(a, a2)))
)

// ----------------------------------------------------------------------------
// filtering & conditionals
// ----------------------------------------------------------------------------

/** @internal */
export const filterOrFail: {
  <A, E2, B extends A>(
    refinement: Predicate.Refinement<NoInfer<A>, B>,
    orFailWith: (a: NoInfer<A>) => E2
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, E2 | E, R>
  <A, E2>(
    predicate: Predicate.Predicate<NoInfer<A>>,
    orFailWith: (a: NoInfer<A>) => E2
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E2 | E, R>
  <A, B extends A>(
    refinement: Predicate.Refinement<NoInfer<A>, B>
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, Cause.NoSuchElementError | E, R>
  <A>(
    predicate: Predicate.Predicate<NoInfer<A>>
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, Cause.NoSuchElementError | E, R>
  <A, E, R, E2, B extends A>(
    self: Effect.Effect<A, E, R>,
    refinement: Predicate.Refinement<NoInfer<A>, B>,
    orFailWith: (a: NoInfer<A>) => E2
  ): Effect.Effect<B, E2 | E, R>
  <A, E, R, E2>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<NoInfer<A>>,
    orFailWith: (a: NoInfer<A>) => E2
  ): Effect.Effect<A, E2 | E, R>
  <A, E, R, B extends A>(
    self: Effect.Effect<A, E, R>,
    refinement: Predicate.Refinement<NoInfer<A>, B>
  ): Effect.Effect<B, E | Cause.NoSuchElementError, R>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<NoInfer<A>>
  ): Effect.Effect<A, E | Cause.NoSuchElementError, R>
} = dual((args) => isEffect(args[0]), <A, E, R, E2>(
  self: Effect.Effect<A, E, R>,
  predicate: Predicate.Predicate<NoInfer<A>>,
  orFailWith?: (a: any) => E2
): Effect.Effect<any, E | E2 | Cause.NoSuchElementError, R> =>
  filterOrElse(
    self,
    predicate as any,
    orFailWith ? (a: any) => fail(orFailWith(a)) : () => fail(new NoSuchElementError() as E2)
  ))

/** @internal */
export const when: {
  <E2 = never, R2 = never>(
    condition: Effect.Effect<boolean, E2, R2>
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<Option.Option<A>, E | E2, R | R2>
  <A, E, R, E2 = never, R2 = never>(
    self: Effect.Effect<A, E, R>,
    condition: Effect.Effect<boolean, E2, R2>
  ): Effect.Effect<Option.Option<A>, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, E2 = never, R2 = never>(
    self: Effect.Effect<A, E, R>,
    condition: Effect.Effect<boolean, E2, R2>
  ): Effect.Effect<Option.Option<A>, E | E2, R | R2> => flatMap(condition, (pass) => pass ? asSome(self) : succeedNone)
)

// ----------------------------------------------------------------------------
// repetition
// ----------------------------------------------------------------------------

/** @internal */
export const replicate: {
  (
    n: number
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Array<Effect.Effect<A, E, R>>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    n: number
  ): Array<Effect.Effect<A, E, R>>
} = dual(
  2,
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    n: number
  ): Array<Effect.Effect<A, E, R>> => Array.from({ length: n }, () => self)
)

/** @internal */
export const replicateEffect: {
  (
    n: number,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly discard?: false | undefined
    }
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<Array<A>, E, R>
  (
    n: number,
    options: {
      readonly concurrency?: Concurrency | undefined
      readonly discard: true
    }
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<void, E, R>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    n: number,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly discard?: false | undefined
    }
  ): Effect.Effect<Array<A>, E, R>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    n: number,
    options: {
      readonly concurrency?: Concurrency | undefined
      readonly discard: true
    }
  ): Effect.Effect<void, E, R>
} = dual(
  (args) => isEffect(args[0]),
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    n: number,
    options: {
      readonly concurrency?: Concurrency | undefined
      readonly discard: true
    }
  ): Effect.Effect<void, E, R> => all(replicate(self, n), options)
)

/** @internal */
export const forever: {
  <
    Arg extends Effect.Effect<any, any, any> | {
      readonly disableYield?: boolean | undefined
    } | undefined = {
      readonly disableYield?: boolean | undefined
    }
  >(
    effectOrOptions: Arg,
    options?: {
      readonly disableYield?: boolean | undefined
    } | undefined
  ): [Arg] extends [Effect.Effect<infer _A, infer _E, infer _R>] ? Effect.Effect<never, _E, _R>
    : <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<never, E, R>
} = dual((args) => isEffect(args[0]), <A, E, R>(
  self: Effect.Effect<A, E, R>,
  options?: {
    readonly disableYield?: boolean | undefined
  }
): Effect.Effect<never, E, R> =>
  whileLoop({
    while: constTrue,
    body: constant(options?.disableYield ? self : flatMap(self, (_) => yieldNow)),
    step: constVoid
  }) as any)

// ----------------------------------------------------------------------------
// error handling
// ----------------------------------------------------------------------------

/** @internal */
export const catchCause: {
  <E, B, E2, R2>(
    f: (cause: NoInfer<Cause.Cause<E>>) => Effect.Effect<B, E2, R2>
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A | B, E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (cause: NoInfer<Cause.Cause<E>>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (cause: NoInfer<Cause.Cause<E>>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, E2, R | R2> =>
    new OnFailureImpl(self, f.length !== 1 ? (cause: Cause.Cause<E>) => f(cause) : f)
)
const OnFailureProto = makePrimitiveProto({
  op: "OnFailure",
  [evaluate]: evaluateCont
})
const OnFailureImpl = function(this: any, self: Effect.Effect<any, any, any>, f: any) {
  this[args] = self
  this[contE] = f
} as unknown as PrimitiveCtor<[self: Effect.Effect<any, any, any>, f: any]>
OnFailureImpl.prototype = OnFailureProto

/** @internal */
export const catchCauseIf: {
  <E, B, E2, R2>(
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): <A, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A | B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, E | E2, R | R2>
} = dual(
  3,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, E | E2, R | R2> =>
    catchCause(self, (cause): Effect.Effect<B, E | E2, R2> => {
      if (!predicate(cause)) {
        return failCause(cause) as any
      }
      return f(cause)
    })
)

/** @internal */
export const catchCauseFilter: {
  <E, B, E2, R2, EB, X extends Cause.Cause<any>>(
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): <A, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A | B, Cause.Cause.Error<X> | E2, R | R2>
  <A, E, R, B, E2, R2, EB, X extends Cause.Cause<any>>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, Cause.Cause.Error<X> | E2, R | R2>
} = dual(
  3,
  <A, E, R, B, E2, R2, EB, X extends Cause.Cause<any>>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, Cause.Cause.Error<X> | E2, R | R2> =>
    catchCause(self, (cause): Effect.Effect<B, Cause.Cause.Error<X> | E2, R2> => {
      const eb = filter(cause)
      return Result.isFailure(eb) ? failCause(eb.failure) : f(eb.success, cause)
    })
)

/** @internal */
export const catch_: {
  <E, B, E2, R2>(
    f: (e: NoInfer<E>) => Effect.Effect<B, E2, R2>
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A | B, E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (e: NoInfer<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (a: NoInfer<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, E2, R | R2> => catchCauseFilter(self, findError as any, (e: any) => f(e)) as any
)

/** @internal */
export const catchNoSuchElement = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<Option.Option<A>, Exclude<E, Cause.NoSuchElementError>, R> =>
  matchEffect(self, {
    onFailure: (error) =>
      isNoSuchElementError(error)
        ? succeedNone
        : fail(error as Exclude<E, Cause.NoSuchElementError>),
    onSuccess: succeedSome
  })

/** @internal */
export const catchDefect: {
  <E, B, E2, R2>(
    f: (defect: unknown) => Effect.Effect<B, E2, R2>
  ): <A, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A | B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (defect: unknown) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (defect: unknown) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A | B, E | E2, R | R2> => catchCauseFilter(self, findDefect as any, f as any) as any
)

/** @internal */
export const tapCause: {
  <E, B, E2, R2>(
    f: (cause: NoInfer<Cause.Cause<E>>) => Effect.Effect<B, E2, R2>
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (cause: NoInfer<Cause.Cause<E>>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (cause: NoInfer<Cause.Cause<E>>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2> => catchCause(self, (cause) => andThen(f(cause), failCause(cause)))
)

/** @internal */
export const tapCauseIf: {
  <E, B, E2, R2>(
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2>
} = dual(
  3,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2> =>
    catchCauseIf(
      self,
      predicate,
      (cause) => andThen(f(cause), failCause(cause))
    )
)

/** @internal */
export const tapCauseFilter: {
  <E, B, E2, R2, EB, X extends Cause.Cause<any>>(
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (a: EB, cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2, EB, X extends Cause.Cause<any>>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (a: EB, cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2>
} = dual(
  3,
  <A, E, R, B, E2, R2, EB, X extends Cause.Cause<any>>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (a: EB, cause: Cause.Cause<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2> =>
    catchCause(self, (cause) => {
      const result = filter(cause)
      if (Result.isFailure(result)) {
        return failCause(cause)
      }
      return andThen(f(result.success, cause), failCause(cause))
    })
)

/** @internal */
export const tapError: {
  <E, B, E2, R2>(
    f: (e: NoInfer<E>) => Effect.Effect<B, E2, R2>
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (e: NoInfer<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (e: NoInfer<E>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2> => tapCauseFilter(self, findError as any, (e: any) => f(e)) as any
)

/** @internal */
export const tapErrorTag: {
  <const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>, E, A1, E1, R1>(
    k: K,
    f: (
      e: ExtractTag<NoInfer<E>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Effect.Effect<A1, E1, R1>
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E1, R1 | R>
  <
    A,
    E,
    R,
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    R1,
    E1,
    A1
  >(
    self: Effect.Effect<A, E, R>,
    k: K,
    f: (e: ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect.Effect<A1, E1, R1>
  ): Effect.Effect<A, E | E1, R | R1>
} = dual(
  3,
  <
    A,
    E,
    R,
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    R1,
    E1,
    A1
  >(
    self: Effect.Effect<A, E, R>,
    k: K,
    f: (e: ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect.Effect<A1, E1, R1>
  ): Effect.Effect<A, E | E1, R | R1> => {
    const predicate = Array.isArray(k)
      ? ((e: E): e is ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K> =>
        hasProperty(e, "_tag") && k.includes(e._tag))
      : isTagged(k as string)
    return tapError(
      self,
      (error) =>
        predicate(error)
          ? f(error as ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>)
          : void_
    )
  }
)

/** @internal */
export const tapDefect: {
  <B, E2, R2>(
    f: (defect: unknown) => Effect.Effect<B, E2, R2>
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (defect: unknown) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Effect.Effect<A, E, R>,
    f: (defect: unknown) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<A, E | E2, R | R2> => tapCauseFilter(self, findDefect as any, (_: any) => f(_)) as any
)

/** @internal */
export const catchIf: {
  <E, EB extends E, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    refinement: Predicate.Refinement<NoInfer<E>, EB>,
    f: (e: EB) => Effect.Effect<A2, E2, R2>,
    orElse?: ((e: Exclude<E, EB>) => Effect.Effect<A3, E3, R3>) | undefined
  ): <A, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A | A2 | Exclude<A3, unassigned>,
    E2 | E3 | (A3 extends unassigned ? Exclude<E, EB> : never),
    R | R2 | R3
  >
  <E, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    predicate: Predicate.Predicate<NoInfer<E>>,
    f: (e: NoInfer<E>) => Effect.Effect<A2, E2, R2>,
    orElse?: ((e: NoInfer<E>) => Effect.Effect<A3, E3, R3>) | undefined
  ): <A, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? E : never), R | R2 | R3>
  <A, E, R, EB extends E, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    self: Effect.Effect<A, E, R>,
    refinement: Predicate.Refinement<E, EB>,
    f: (e: EB) => Effect.Effect<A2, E2, R2>,
    orElse?: ((e: Exclude<E, EB>) => Effect.Effect<A3, E3, R3>) | undefined
  ): Effect.Effect<
    A | A2 | Exclude<A3, unassigned>,
    E2 | E3 | (A3 extends unassigned ? Exclude<E, EB> : never),
    R | R2 | R3
  >
  <A, E, R, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<E>,
    f: (e: E) => Effect.Effect<A2, E2, R2>,
    orElse?: ((e: E) => Effect.Effect<A3, E3, R3>) | undefined
  ): Effect.Effect<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? E : never), R | R2 | R3>
} = dual(
  (args) => isEffect(args[0]),
  <A, E, R, A2, E2, R2, A3 = never, E3 = E, R3 = never>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<E>,
    f: (e: E) => Effect.Effect<A2, E2, R2>,
    orElse?: ((e: E) => Effect.Effect<A3, E3, R3>) | undefined
  ): Effect.Effect<A | A2 | A3, E2 | E3, R | R2 | R3> =>
    catchCause(self, (cause): Effect.Effect<A2 | A3, E2 | E3, R2 | R3> => {
      const error = findError(cause)
      if (Result.isFailure(error)) return failCause(error.failure)
      if (!predicate(error.success)) {
        return orElse ? orElse(error.success as any) : failCause(cause as any as Cause.Cause<E3>)
      }
      return f(error.success as any)
    })
)

/** @internal */
export const catchFilter: {
  <E, EB, A2, E2, R2, X, A3 = unassigned, E3 = never, R3 = never>(
    filter: Filter.Filter<NoInfer<E>, EB, X>,
    f: (e: EB) => Effect.Effect<A2, E2, R2>,
    orElse?: ((e: X) => Effect.Effect<A3, E3, R3>) | undefined
  ): <A, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? X : never), R | R2 | R3>
  <A, E, R, EB, A2, E2, R2, X, A3 = unassigned, E3 = never, R3 = never>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<NoInfer<E>, EB, X>,
    f: (e: EB) => Effect.Effect<A2, E2, R2>,
    orElse?: ((e: X) => Effect.Effect<A3, E3, R3>) | undefined
  ): Effect.Effect<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? X : never), R | R2 | R3>
} = dual(
  (args) => isEffect(args[0]),
  <A, E, R, EB, A2, E2, R2, X, A3 = never, E3 = X, R3 = never>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<NoInfer<E>, EB, X>,
    f: (e: EB) => Effect.Effect<A2, E2, R2>,
    orElse?: ((e: X) => Effect.Effect<A3, E3, R3>) | undefined
  ): Effect.Effect<A | A2 | A3, E2 | E3, R | R2 | R3> =>
    catchCause(self, (cause): Effect.Effect<A2 | A3, E2 | E3, R2 | R3> => {
      const error = findError(cause)
      if (Result.isFailure(error)) return failCause(error.failure)
      const result = filter(error.success)
      if (Result.isFailure(result)) {
        return orElse ? orElse(result.failure as any) : failCause(cause as any as Cause.Cause<E3>)
      }
      return f(result.success)
    })
)

/** @internal */
export const catchTag: {
  <
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    E,
    A1,
    E1,
    R1,
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    k: K,
    f: (
      e: ExtractTag<NoInfer<E>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Effect.Effect<A1, E1, R1>,
    orElse?:
      | ((e: ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect.Effect<A2, E2, R2>)
      | undefined
  ): <A, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A | A1 | Exclude<A2, unassigned>,
    | E1
    | E2
    | (A2 extends unassigned ? ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K> : never),
    R | R1 | R2
  >
  <
    A,
    E,
    R,
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    R1,
    E1,
    A1,
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    self: Effect.Effect<A, E, R>,
    k: K,
    f: (e: ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect.Effect<A1, E1, R1>,
    orElse?:
      | ((e: ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect.Effect<A2, E2, R2>)
      | undefined
  ): Effect.Effect<
    A | A1 | Exclude<A2, unassigned>,
    | E1
    | E2
    | (A2 extends unassigned ? ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K> : never),
    R | R1 | R2
  >
} = dual(
  (args) => isEffect(args[0]),
  <
    A,
    E,
    R,
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    R1,
    E1,
    A1,
    A2 = never,
    E2 = ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>,
    R2 = never
  >(
    self: Effect.Effect<A, E, R>,
    k: K,
    f: (e: ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect.Effect<A1, E1, R1>,
    orElse?:
      | ((e: ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect.Effect<A2, E2, R2>)
      | undefined
  ): Effect.Effect<A | A1 | A2, E1 | E2, R | R1 | R2> => {
    const pred = Array.isArray(k)
      ? ((e: E): e is any => hasProperty(e, "_tag") && k.includes(e._tag))
      : isTagged(k as string)
    return catchIf(self, pred, f, orElse as any) as any
  }
)

/** @internal */
export const catchTags: {
  <
    E,
    Cases extends (E extends { _tag: string } ? {
        [K in E["_tag"]]+?: (error: Extract<E, { _tag: K }>) => Effect.Effect<any, any, any>
      } :
      {}),
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    cases: Cases,
    orElse?: ((e: Exclude<E, { _tag: keyof Cases }>) => Effect.Effect<A2, E2, R2>) | undefined
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<
    | A
    | Exclude<A2, unassigned>
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Effect.Effect<infer A, any, any>) ? A : never
    }[keyof Cases],
    | E2
    | (A2 extends unassigned ? Exclude<E, { _tag: keyof Cases }> : never)
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Effect.Effect<any, infer E, any>) ? E : never
    }[keyof Cases],
    | R
    | R2
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Effect.Effect<any, any, infer R>) ? R : never
    }[keyof Cases]
  >
  <
    R,
    E,
    A,
    Cases extends (E extends { _tag: string } ? {
        [K in E["_tag"]]+?: (error: Extract<E, { _tag: K }>) => Effect.Effect<any, any, any>
      } :
      {}),
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    self: Effect.Effect<A, E, R>,
    cases: Cases,
    orElse?: ((e: Exclude<E, { _tag: keyof Cases }>) => Effect.Effect<A2, E2, R2>) | undefined
  ): Effect.Effect<
    | A
    | Exclude<A2, unassigned>
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Effect.Effect<infer A, any, any>) ? A : never
    }[keyof Cases],
    | E2
    | (A2 extends unassigned ? Exclude<E, { _tag: keyof Cases }> : never)
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Effect.Effect<any, infer E, any>) ? E : never
    }[keyof Cases],
    | R
    | R2
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Effect.Effect<any, any, infer R>) ? R : never
    }[keyof Cases]
  >
} = dual((args) => isEffect(args[0]), (self: Effect.Effect<any, any, any>, cases: Record<string, any>, orElse: any) => {
  let keys: Array<string>
  return catchFilter(
    self,
    (e) => {
      keys ??= Object.keys(cases)
      return hasProperty(e, "_tag") && isString(e["_tag"]) && keys.includes(e["_tag"])
        ? Result.succeed(e)
        : Result.fail(e)
    },
    (e: any) => cases[e["_tag"] as string](e),
    orElse
  ) as any
})

/** @internal */
export const catchReason: {
  <
    K extends Tags<E>,
    E,
    RK extends ReasonTags<ExtractTag<NoInfer<E>, K>>,
    A2,
    E2,
    R2,
    A3 = unassigned,
    E3 = never,
    R3 = never
  >(
    errorTag: K,
    reasonTag: RK,
    f: (
      reason: ExtractReason<ExtractTag<NoInfer<E>, K>, RK>,
      error: NarrowReason<ExtractTag<NoInfer<E>, K>, RK>
    ) => Effect.Effect<A2, E2, R2>,
    orElse?:
      | ((
        reasons: ExcludeReason<ExtractTag<NoInfer<E>, K>, RK>,
        error: OmitReason<ExtractTag<NoInfer<E>, K>, RK>
      ) => Effect.Effect<A3, E3, R3>)
      | undefined
  ): <A, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<
    A | A2 | Exclude<A3, unassigned>,
    ExcludeTag<E, K> | E2 | E3 | (A3 extends unassigned ? ExtractTag<E, K> : never),
    R | R2 | R3
  >
  <
    A,
    E,
    R,
    K extends Tags<E>,
    RK extends ReasonTags<ExtractTag<E, K>>,
    A2,
    E2,
    R2,
    A3 = unassigned,
    E3 = never,
    R3 = never
  >(
    self: Effect.Effect<A, E, R>,
    errorTag: K,
    reasonTag: RK,
    f: (
      reason: ExtractReason<ExtractTag<E, K>, RK>,
      error: NarrowReason<ExtractTag<E, K>, RK>
    ) => Effect.Effect<A2, E2, R2>,
    orElse?:
      | ((
        reasons: ExcludeReason<ExtractTag<E, K>, RK>,
        error: OmitReason<ExtractTag<E, K>, RK>
      ) => Effect.Effect<A3, E3, R3>)
      | undefined
  ): Effect.Effect<
    A | A2 | Exclude<A3, unassigned>,
    ExcludeTag<E, K> | E2 | E3 | (A3 extends unassigned ? ExtractTag<E, K> : never),
    R | R2 | R3
  >
} = dual(
  (args) => isEffect(args[0]),
  <
    A,
    E,
    R,
    K extends Tags<E>,
    RK extends ReasonTags<ExtractTag<E, K>>,
    A2,
    E2,
    R2,
    A3 = unassigned,
    E3 = never,
    R3 = never
  >(
    self: Effect.Effect<A, E, R>,
    errorTag: K,
    reasonTag: RK,
    f: (reason: ExtractReason<ExtractTag<E, K>, RK>, error: ExtractTag<E, K>) => Effect.Effect<A2, E2, R2>,
    orElse?:
      | ((
        reasons: ExcludeReason<ExtractTag<E, K>, RK>,
        error: OmitReason<ExtractTag<E, K>, RK>
      ) => Effect.Effect<A3, E3, R3>)
      | undefined
  ): Effect.Effect<
    A | A2 | Exclude<A3, unassigned>,
    ExcludeTag<E, K> | E2 | E3 | (A3 extends unassigned ? ExtractTag<E, K> : never),
    R | R2 | R3
  > =>
    catchIf(
      self,
      ((e: any) =>
        isTagged(e, errorTag) &&
        hasProperty(e, "reason") &&
        (orElse !== undefined || isTagged(e.reason, reasonTag))) as any,
      (e: any): Effect.Effect<A2 | A3, E | E2 | E3, R2 | R3> => {
        const reason = e.reason as any
        if (isTagged(reason, reasonTag)) return f(reason as any, e)
        return orElse ? orElse(reason, e) : fail(e)
      }
    ) as any
)

/** @internal */
export const catchReasons: {
  <
    K extends Tags<E>,
    E,
    Cases extends {
      [RK in ReasonTags<ExtractTag<NoInfer<E>, K>>]+?: (
        reason: ExtractReason<ExtractTag<NoInfer<E>, K>, RK>,
        error: NarrowReason<ExtractTag<NoInfer<E>, K>, RK>
      ) => Effect.Effect<any, any, any>
    },
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    errorTag: K,
    cases: Cases,
    orElse?:
      | ((
        reason: ExcludeReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>,
        error: OmitReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>
      ) => Effect.Effect<A2, E2, R2>)
      | undefined
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<
    | A
    | Exclude<A2, unassigned>
    | { [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect.Effect<infer A, any, any> ? A : never }[
      keyof Cases
    ],
    | ExcludeTag<E, K>
    | E2
    | (A2 extends unassigned ? ExtractTag<E, K> : never)
    | { [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect.Effect<any, infer E, any> ? E : never }[
      keyof Cases
    ],
    | R
    | R2
    | { [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect.Effect<any, any, infer R> ? R : never }[
      keyof Cases
    ]
  >
  <
    A,
    E,
    R,
    K extends Tags<E>,
    Cases extends {
      [RK in ReasonTags<ExtractTag<E, K>>]+?: (
        reason: ExtractReason<ExtractTag<E, K>, RK>,
        error: NarrowReason<ExtractTag<E, K>, RK>
      ) => Effect.Effect<any, any, any>
    },
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    self: Effect.Effect<A, E, R>,
    errorTag: K,
    cases: Cases,
    orElse?:
      | ((
        reason: ExcludeReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>,
        error: OmitReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>
      ) => Effect.Effect<A2, E2, R2>)
      | undefined
  ): Effect.Effect<
    | A
    | Exclude<A2, unassigned>
    | { [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect.Effect<infer A, any, any> ? A : never }[
      keyof Cases
    ],
    | ExcludeTag<E, K>
    | E2
    | (A2 extends unassigned ? ExtractTag<E, K> : never)
    | { [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect.Effect<any, infer E, any> ? E : never }[
      keyof Cases
    ],
    | R
    | R2
    | { [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect.Effect<any, any, infer R> ? R : never }[
      keyof Cases
    ]
  >
} = dual((args) => isEffect(args[0]), (self, errorTag, cases, orElse) => {
  let keys: Array<string>
  return catchIf(
    self,
    ((e: any) =>
      isTagged(e, errorTag) &&
      hasProperty(e, "reason") &&
      hasProperty(e.reason, "_tag") &&
      isString(e.reason._tag) &&
      (orElse !== undefined || (keys ??= Object.keys(cases)).includes(e.reason._tag))) as any,
    (e: any) => {
      const reason = e.reason
      keys ??= Object.keys(cases)
      if (keys.includes(reason._tag)) {
        return (cases as any)[reason._tag](reason, e)
      }
      return orElse ? orElse(reason, e) : fail(e)
    }
  )
})

/** @internal */
export const unwrapReason: {
  <
    K extends Effect.TagsWithReason<E>,
    E
  >(
    errorTag: K
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, ExcludeTag<E, K> | ReasonOf<ExtractTag<E, K>>, R>
  <
    A,
    E,
    R,
    K extends Effect.TagsWithReason<E>
  >(
    self: Effect.Effect<A, E, R>,
    errorTag: K
  ): Effect.Effect<A, ExcludeTag<E, K> | ReasonOf<ExtractTag<E, K>>, R>
} = dual(
  2,
  <
    A,
    E,
    R,
    K extends Effect.TagsWithReason<E>
  >(
    self: Effect.Effect<A, E, R>,
    errorTag: K
  ): Effect.Effect<A, ExcludeTag<E, K> | ReasonOf<ExtractTag<E, K>>, R> =>
    catchFilter(
      self,
      (e: any) => {
        if (isTagged(e, errorTag) && hasProperty(e, "reason")) {
          return Result.succeed(e.reason)
        }
        return Result.fail(e)
      },
      fail as any
    ) as any
)

/** @internal */
export const mapError: {
  <E, E2>(
    f: (e: E) => E2
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E2, R>
  <A, E, R, E2>(
    self: Effect.Effect<A, E, R>,
    f: (e: E) => E2
  ): Effect.Effect<A, E2, R>
} = dual(
  2,
  <A, E, R, E2>(
    self: Effect.Effect<A, E, R>,
    f: (e: E) => E2
  ): Effect.Effect<A, E2, R> => catch_(self, (error) => failSync(() => f(error)))
)

/** @internal */
export const mapBoth: {
  <E, E2, A, A2>(
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A2, E2, R>
  <A, E, R, E2, A2>(
    self: Effect.Effect<A, E, R>,
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): Effect.Effect<A2, E2, R>
} = dual(2, <A, E, R, E2, A2>(
  self: Effect.Effect<A, E, R>,
  options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
): Effect.Effect<A2, E2, R> =>
  matchEffect(self, {
    onFailure: (e) => failSync(() => options.onFailure(e)),
    onSuccess: (a) => sync(() => options.onSuccess(a))
  }))

/** @internal */
export const orDie = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, never, R> => catch_(self, die)

/** @internal */
export const orElseSucceed: {
  <E, B>(
    f: (error: NoInfer<E>) => B
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A | B, never, R>
  <A, E, R, B>(
    self: Effect.Effect<A, E, R>,
    f: (error: E) => B
  ): Effect.Effect<A | B, never, R>
} = dual(
  2,
  <A, E, R, B>(
    self: Effect.Effect<A, E, R>,
    f: (error: E) => B
  ): Effect.Effect<A | B, never, R> => catch_(self, (error) => sync(() => f(error)))
)

/** @internal */
export const firstSuccessOf = <Eff extends Effect.Effect<any, any, any>>(
  effects: Iterable<Eff>
): Effect.Effect<Effect.Success<Eff>, Effect.Error<Eff>, Effect.Services<Eff>> =>
  suspend(() => {
    const iterator = effects[Symbol.iterator]()
    let state = iterator.next()
    if (state.done) {
      return die(new Error("Received an empty collection of effects"))
    }
    function loop(current: IteratorYieldResult<Eff>): Eff {
      const next = iterator.next()
      if (next.done) return current.value
      return catch_(current.value, (_) => loop(next)) as any
    }
    return loop(state)
  })

/** @internal */
export const eventually = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, never, R> =>
  catch_(self, (_) => flatMap(yieldNow, () => eventually(self)))

/** @internal */
export const ignore: <
  Arg extends Effect.Effect<any, any, any> | {
    readonly log?: boolean | LogLevel.Severity | undefined
    readonly message?: string | undefined
  } | undefined = {
    readonly log?: boolean | LogLevel.Severity | undefined
    readonly message?: string | undefined
  }
>(
  effectOrOptions: Arg,
  options?: {
    readonly log?: boolean | LogLevel.Severity | undefined
    readonly message?: string | undefined
  } | undefined
) => [Arg] extends [Effect.Effect<infer _A, infer _E, infer _R>] ? Effect.Effect<void, never, _R>
  : <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<void, never, R> = dual(
    (args) => isEffect(args[0]),
    <A, E, R>(
      self: Effect.Effect<A, E, R>,
      options?: {
        readonly log?: boolean | LogLevel.Severity | undefined
        readonly message?: string | undefined
      } | undefined
    ): Effect.Effect<void, never, R> => {
      if (!options?.log) {
        return matchEffect(self, { onFailure: (_) => void_, onSuccess: (_) => void_ })
      }
      const logEffect = logWithLevel(options.log === true ? undefined : options.log)
      return matchCauseEffect(self, {
        onFailure(cause) {
          const failure = findFail(cause)
          return Result.isFailure(failure)
            ? failCause(failure.failure)
            : options.message === undefined
            ? logEffect(cause)
            : logEffect(options.message, cause)
        },
        onSuccess: (_) => void_
      })
    }
  )

/** @internal */
export const ignoreCause: <
  Arg extends Effect.Effect<any, any, any> | {
    readonly log?: boolean | LogLevel.Severity | undefined
    readonly message?: string | undefined
  } | undefined = {
    readonly log?: boolean | LogLevel.Severity | undefined
    readonly message?: string | undefined
  }
>(
  effectOrOptions: Arg,
  options?: {
    readonly log?: boolean | LogLevel.Severity | undefined
    readonly message?: string | undefined
  } | undefined
) => [Arg] extends [Effect.Effect<infer _A, infer _E, infer _R>] ? Effect.Effect<void, never, _R>
  : <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<void, never, R> = dual(
    (args) => isEffect(args[0]),
    <A, E, R>(
      self: Effect.Effect<A, E, R>,
      options?: {
        readonly log?: boolean | LogLevel.Severity | undefined
        readonly message?: string | undefined
      } | undefined
    ): Effect.Effect<void, never, R> => {
      if (!options?.log) {
        return matchCauseEffect(self, { onFailure: (_) => void_, onSuccess: (_) => void_ })
      }
      const logEffect = logWithLevel(options.log === true ? undefined : options.log)
      return matchCauseEffect(self, {
        onFailure: (cause) => options.message === undefined ? logEffect(cause) : logEffect(options.message, cause),
        onSuccess: (_) => void_
      })
    }
  )

/** @internal */
export const option = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<Option.Option<A>, never, R> => match(self, { onFailure: Option.none, onSuccess: Option.some })

/** @internal */
export const result = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<Result.Result<A, E>, never, R> =>
  matchEager(self, { onFailure: Result.fail, onSuccess: Result.succeed })

// ----------------------------------------------------------------------------
// pattern matching
// ----------------------------------------------------------------------------

/** @internal */
export const matchCauseEffect: {
  <E, A2, E2, R2, A, A3, E3, R3>(options: {
    readonly onFailure: (cause: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
    readonly onSuccess: (a: A) => Effect.Effect<A3, E3, R3>
  }): <R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A2 | A3, E2 | E3, R2 | R3 | R>
  <A, E, R, A2, E2, R2, A3, E3, R3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
      readonly onSuccess: (a: A) => Effect.Effect<A3, E3, R3>
    }
  ): Effect.Effect<A2 | A3, E2 | E3, R2 | R3 | R>
} = dual(
  2,
  <A, E, R, A2, E2, R2, A3, E3, R3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
      readonly onSuccess: (a: A) => Effect.Effect<A3, E3, R3>
    }
  ): Effect.Effect<A2 | A3, E2 | E3, R2 | R3 | R> =>
    new OnSuccessAndFailureImpl(
      self,
      options.onSuccess.length !== 1 ? (a: A) => options.onSuccess(a) : options.onSuccess,
      options.onFailure.length !== 1
        ? (cause: Cause.Cause<E>) => options.onFailure(cause)
        : options.onFailure
    )
)
const OnSuccessAndFailureProto = makePrimitiveProto({
  op: "OnSuccessAndFailure",
  [evaluate]: evaluateCont
})
const OnSuccessAndFailureImpl = function(
  this: any,
  self: Effect.Effect<any, any, any>,
  onSuccess: any,
  onFailure: any
) {
  this[args] = self
  this[contA] = onSuccess
  this[contE] = onFailure
} as unknown as PrimitiveCtor<[self: Effect.Effect<any, any, any>, onSuccess: any, onFailure: any]>
OnSuccessAndFailureImpl.prototype = OnSuccessAndFailureProto

// `match` and `matchCause` keep the caller's handlers object as the frame's
// payload and call it from the prototype, so no closure is built per call.
const matchSuccess = function(this: any, value: any, fiber: FiberImpl) {
  const handlers = this.payload
  return fiber.succeedWith(
    continuationMarksStack ? handlers.onSuccess(value) : internalCall(() => handlers.onSuccess(value))
  )
}
const makeMatch = (
  op: string,
  onFailure: (this: any, cause: Cause.Cause<any>, fiber: FiberImpl) => Primitive | Yield
) => {
  const Proto = makePrimitiveProto({
    op,
    [evaluate]: evaluateCont,
    [contA]: matchSuccess,
    [contE]: onFailure
  })
  const MatchImpl = function(this: any, self: Effect.Effect<any, any, any>, handlers: any) {
    this[args] = self
    this.payload = handlers
  } as unknown as {
    new(self: Effect.Effect<any, any, any>, handlers: any): Effect.Effect<any, never, any>
    prototype: any
  }
  MatchImpl.prototype = Proto
  return MatchImpl
}
const MatchImpl = makeMatch("Match", function(cause, fiber) {
  const fail = cause.reasons.find(isFailReason)
  if (fail === undefined) return failCause(cause) as any
  const handlers = this.payload
  return fiber.succeedWith(
    continuationMarksStack ? handlers.onFailure(fail.error) : internalCall(() => handlers.onFailure(fail.error))
  )
})
const MatchCauseImpl = makeMatch("MatchCause", function(cause, fiber) {
  const handlers = this.payload
  return fiber.succeedWith(
    continuationMarksStack ? handlers.onFailure(cause) : internalCall(() => handlers.onFailure(cause))
  )
})

/** @internal */
export const matchCause: {
  <E, A2, A, A3>(options: {
    readonly onFailure: (cause: Cause.Cause<E>) => A2
    readonly onSuccess: (a: A) => A3
  }): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A2 | A3, never, R>
  <A, E, R, A2, A3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => A2
      readonly onSuccess: (a: A) => A3
    }
  ): Effect.Effect<A2 | A3, never, R>
} = dual(
  2,
  <A, E, R, A2, A3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => A2
      readonly onSuccess: (a: A) => A3
    }
  ): Effect.Effect<A2 | A3, never, R> => new MatchCauseImpl(self, options)
)

/** @internal */
export const matchEffect: {
  <E, A2, E2, R2, A, A3, E3, R3>(options: {
    readonly onFailure: (e: E) => Effect.Effect<A2, E2, R2>
    readonly onSuccess: (a: A) => Effect.Effect<A3, E3, R3>
  }): <R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A2 | A3, E2 | E3, R2 | R3 | R>
  <A, E, R, A2, E2, R2, A3, E3, R3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (e: E) => Effect.Effect<A2, E2, R2>
      readonly onSuccess: (a: A) => Effect.Effect<A3, E3, R3>
    }
  ): Effect.Effect<A2 | A3, E2 | E3, R2 | R3 | R>
} = dual(
  2,
  <A, E, R, A2, E2, R2, A3, E3, R3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (e: E) => Effect.Effect<A2, E2, R2>
      readonly onSuccess: (a: A) => Effect.Effect<A3, E3, R3>
    }
  ): Effect.Effect<A2 | A3, E2 | E3, R2 | R3 | R> =>
    matchCauseEffect(self, {
      onFailure: (cause) => {
        const fail = cause.reasons.find(isFailReason)
        return fail
          ? options.onFailure(fail.error)
          : failCause(cause as Cause.Cause<never>)
      },
      onSuccess: options.onSuccess
    })
)

/** @internal */
export const match: {
  <E, A2, A, A3>(options: {
    readonly onFailure: (error: E) => A2
    readonly onSuccess: (value: A) => A3
  }): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A2 | A3, never, R>
  <A, E, R, A2, A3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (error: E) => A2
      readonly onSuccess: (value: A) => A3
    }
  ): Effect.Effect<A2 | A3, never, R>
} = dual(
  2,
  <A, E, R, A2, A3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (error: E) => A2
      readonly onSuccess: (value: A) => A3
    }
  ): Effect.Effect<A2 | A3, never, R> => new MatchImpl(self, options)
)

/** @internal */
export const matchEager: {
  <E, A2, A, A3>(options: {
    readonly onFailure: (error: E) => A2
    readonly onSuccess: (value: A) => A3
  }): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A2 | A3, never, R>
  <A, E, R, A2, A3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (error: E) => A2
      readonly onSuccess: (value: A) => A3
    }
  ): Effect.Effect<A2 | A3, never, R>
} = dual(
  2,
  <A, E, R, A2, A3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (error: E) => A2
      readonly onSuccess: (value: A) => A3
    }
  ): Effect.Effect<A2 | A3, never, R> => {
    if (effectIsExit(self)) {
      if (self._tag === "Success") return exitSucceed(options.onSuccess(self.value))
      const error = findError(self.cause)
      if (Result.isFailure(error)) return self as Exit.Exit<never>
      return exitSucceed(options.onFailure(error.success))
    }
    return match(self, options)
  }
)

/** @internal */
export const matchCauseEager: {
  <E, A2, A, A3>(options: {
    readonly onFailure: (cause: Cause.Cause<E>) => A2
    readonly onSuccess: (value: A) => A3
  }): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A2 | A3, never, R>
  <A, E, R, A2, A3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => A2
      readonly onSuccess: (value: A) => A3
    }
  ): Effect.Effect<A2 | A3, never, R>
} = dual(
  2,
  <A, E, R, A2, A3>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => A2
      readonly onSuccess: (value: A) => A3
    }
  ): Effect.Effect<A2 | A3, never, R> => {
    if (effectIsExit(self)) {
      if (self._tag === "Success") return exitSucceed(options.onSuccess(self.value))
      return exitSucceed(options.onFailure(self.cause))
    }
    return matchCause(self, options)
  }
)

/** @internal */
export const exit = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<Exit.Exit<A, E>, never, R> =>
  effectIsExit(self) ? exitSucceed(self) : exitPrimitive(self)

const exitPrimitive: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<Exit.Exit<A, E>, never, R> =
  makePrimitive({
    op: "Exit",
    [evaluate](fiber): Primitive {
      fiber._stack.push(this)
      return this[args] as any
    },
    [contA](value, fiber, exit) {
      return fiber.succeedWith(exit ?? exitSucceed(value))
    },
    [contE](cause, fiber, exit) {
      return fiber.succeedWith(exit ?? exitFailCause(cause))
    }
  })

// ----------------------------------------------------------------------------
// Condition checking
// ----------------------------------------------------------------------------

/** @internal */
export const isFailure: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<boolean, never, R> = matchEager({
  onFailure: () => true,
  onSuccess: () => false
})

/** @internal */
export const isSuccess: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<boolean, never, R> = matchEager({
  onFailure: () => false,
  onSuccess: () => true
})

// ----------------------------------------------------------------------------
// delays & timeouts
// ----------------------------------------------------------------------------

/** @internal */
export const delay: {
  (
    duration: Duration.Input
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    duration: Duration.Input
  ): Effect.Effect<A, E, R>
} = dual(
  2,
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    duration: Duration.Input
  ): Effect.Effect<A, E, R> => andThen(sleep(duration), self)
)

/** @internal */
export const timeoutOrElse: {
  <A2, E2, R2>(options: {
    readonly duration: Duration.Input
    readonly orElse: LazyArg<Effect.Effect<A2, E2, R2>>
  }): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A | A2, E | E2, R | R2>
  <A, E, R, A2, E2, R2>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly duration: Duration.Input
      readonly orElse: LazyArg<Effect.Effect<A2, E2, R2>>
    }
  ): Effect.Effect<A | A2, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, A2, E2, R2>(
    self: Effect.Effect<A, E, R>,
    options: {
      readonly duration: Duration.Input
      readonly orElse: LazyArg<Effect.Effect<A2, E2, R2>>
    }
  ): Effect.Effect<A | A2, E | E2, R | R2> =>
    flatMap(
      timeoutOption(self, options.duration),
      (option): Effect.Effect<A | A2, E2, R2> => Option.isNone(option) ? options.orElse() : succeed(option.value)
    )
)

/** @internal */
const timeoutErrorFromDuration = (duration: Duration.Duration): TimeoutError =>
  new TimeoutError(`Operation timed out after '${Duration.format(duration)}'`)

/** @internal */
export const timeout: {
  (
    duration: Duration.Input
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | Cause.TimeoutError, R>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    duration: Duration.Input
  ): Effect.Effect<A, E | Cause.TimeoutError, R>
} = dual(
  2,
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    duration: Duration.Input
  ): Effect.Effect<A, E | TimeoutError, R> => {
    const decoded = Duration.fromInputUnsafe(duration)
    return timeoutOrElse(self, {
      duration: decoded,
      orElse: () => fail(timeoutErrorFromDuration(decoded))
    })
  }
)

/** @internal */
export const timeoutOption: {
  (
    duration: Duration.Input
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<Option.Option<A>, E, R>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    duration: Duration.Input
  ): Effect.Effect<Option.Option<A>, E, R>
} = dual(
  2,
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    duration: Duration.Input
  ): Effect.Effect<Option.Option<A>, E, R> =>
    raceFirst(
      asSome(self),
      as(sleep(duration), Option.none())
    )
)

/** @internal */
export const timed = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<[duration: Duration.Duration, result: A], E, R> =>
  clockWith((clock) => {
    const start = clock.monotonicTimeNanosUnsafe()
    return map(self, (a) => [Duration.nanos(clock.monotonicTimeNanosUnsafe() - start), a])
  })

// ----------------------------------------------------------------------------
// resources & finalization
// ----------------------------------------------------------------------------

/** @internal */
export const ScopeTypeId = "~effect/Scope"

/** @internal */
export const ScopeCloseableTypeId = "~effect/Scope/Closeable"

/** @internal */
export const scopeTag: Context.Service<Scope.Scope, Scope.Scope> = Context.Service<Scope.Scope>("effect/Scope")

/** @internal */
export const scopeClose = <A, E>(self: Scope.Scope, exit_: Exit.Exit<A, E>) =>
  withFiber((fiber) => {
    const close = scopeCloseUnsafe(self, exit_)
    if (close === undefined) return void_
    fiberEnterUninterruptibleUnsafe(fiber)
    return close
  })

/** @internal */
export const scopeCloseUnsafe = <A, E>(self: Scope.Scope, exit_: Exit.Exit<A, E>) => {
  const state = self.state
  if (state._tag === "Closed") return
  self.state = { _tag: "Closed", exit: exit_ }
  if (self.parent !== undefined) {
    scopeRemoveFinalizerUnsafe(self.parent, self)
  }
  if (state._tag === "Empty") return
  if (state.finalizer !== undefined) {
    return runFinalizer(state.finalizer, exit_)
  }
  const finalizers = state.finalizers!
  if (finalizers.size === 1) {
    return runFinalizer(finalizers.values().next().value!, exit_)
  }
  return scopeCloseFinalizers(self, finalizers, exit_)
}

const runFinalizer = (
  finalizer: (exit: Exit.Exit<any, any>) => Effect.Effect<unknown>,
  exit_: Exit.Exit<any, any>
): Effect.Effect<unknown> => {
  try {
    return finalizer(exit_)
  } catch (defect) {
    return exitDie(defect)
  }
}

const combineFinalizerCause = <A, E, XE, XR>(
  exit_: Exit.Exit<A, E>,
  finalizer: Effect.Effect<void, XE, XR>
): Effect.Effect<void, E | XE, XR> =>
  exitIsSuccess(exit_) ? finalizer : catchCause(finalizer, (cause) => failCause(causeCombine(exit_.cause, cause)))

const scopeCloseFinalizers = fnUntraced(function*<A, E>(
  self: Scope.Scope,
  finalizers: NonNullable<Scope.State.Open["finalizers"]>,
  exit_: Exit.Exit<A, E>
) {
  let exits: Array<Exit.Exit<any, never>> = []
  const fibers: Array<Fiber.Fiber<any, never>> = []
  const arr = Array.from(finalizers.values())
  const parent = getCurrentFiber()!
  for (let i = arr.length - 1; i >= 0; i--) {
    const finalizer = arr[i]
    if (self.strategy === "sequential") {
      exits.push(yield* exit(runFinalizer(finalizer, exit_)))
    } else {
      fibers.push(forkUnsafe(parent, runFinalizer(finalizer, exit_), true, true, "inherit"))
    }
  }
  if (fibers.length > 0) {
    exits = yield* fiberAwaitAll(fibers)
  }
  return yield* exitAsVoidAll(exits)
})

/** @internal */
export const scopeFork = (scope: Scope.Scope, finalizerStrategy?: "sequential" | "parallel") =>
  sync(() => scopeForkUnsafe(scope, finalizerStrategy))

/** @internal */
export const scopeForkUnsafe = (scope: Scope.Scope, finalizerStrategy?: "sequential" | "parallel") => {
  const child = makeScope(finalizerStrategy, scope)
  if (scope.state._tag === "Closed") {
    child.state = scope.state
    return child
  }
  scopeAddFinalizerUnsafe(scope, child, (exit) => scopeClose(child, exit))
  return child
}

/** @internal */
export const scopeAddFinalizerExit = (
  scope: Scope.Scope,
  finalizer: (exit: Exit.Exit<any, any>) => Effect.Effect<unknown>
): Effect.Effect<void> => {
  return suspend(() => {
    if (scope.state._tag === "Closed") {
      return finalizer(scope.state.exit)
    }
    scopeAddFinalizerUnsafe(scope, {}, finalizer)
    return void_
  })
}

/** @internal */
export const scopeAddFinalizer = (
  scope: Scope.Scope,
  finalizer: Effect.Effect<unknown>
): Effect.Effect<void> => scopeAddFinalizerExit(scope, constant(finalizer))

/** @internal */
export const scopeAddFinalizerUnsafe = (
  scope: Scope.Scope,
  key: {},
  finalizer: (exit: Exit.Exit<any, any>) => Effect.Effect<unknown>
): void => {
  if (scope.state._tag === "Empty") {
    scope.state = { _tag: "Open", finalizerKey: key, finalizer, finalizers: undefined }
  } else if (scope.state._tag === "Open") {
    const state = scope.state
    if (state.finalizer !== undefined) {
      state.finalizers = new Map([[state.finalizerKey!, state.finalizer]])
      state.finalizerKey = undefined
      state.finalizer = undefined
      state.finalizers.set(key, finalizer)
    } else {
      state.finalizers!.set(key, finalizer)
    }
  }
}

/** @internal */
export const scopeRemoveFinalizerUnsafe = (
  scope: Scope.Scope,
  key: {}
): void => {
  if (scope.state._tag !== "Open") return
  const state = scope.state
  if (state.finalizerKey === key) {
    scope.state = constScopeEmpty
  } else if (state.finalizers !== undefined) {
    state.finalizers.delete(key)
    if (state.finalizers.size === 0) {
      scope.state = constScopeEmpty
    }
  }
}

/** @internal */
export const scopeMakeUnsafe = (finalizerStrategy?: "sequential" | "parallel"): Scope.Closeable =>
  makeScope(finalizerStrategy, undefined)

const makeScope = (
  finalizerStrategy: "sequential" | "parallel" = "sequential",
  parent: Scope.Scope | undefined
): Scope.Closeable => ({
  [ScopeCloseableTypeId]: ScopeCloseableTypeId,
  [ScopeTypeId]: ScopeTypeId,
  strategy: finalizerStrategy,
  parent,
  state: constScopeEmpty
})

const constScopeEmpty = { _tag: "Empty" } as const

/** @internal */
export const scopeMake = (finalizerStrategy?: "sequential" | "parallel"): Effect.Effect<Scope.Closeable> =>
  sync(() => scopeMakeUnsafe(finalizerStrategy))

/** @internal */
export const scope: Effect.Effect<Scope.Scope, never, Scope.Scope> = scopeTag

/** @internal */
export const provideScope: {
  (value: Scope.Scope): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Scope.Scope>>
  <A, E, R>(self: Effect.Effect<A, E, R>, value: Scope.Scope): Effect.Effect<A, E, Exclude<R, Scope.Scope>>
} = provideService(scopeTag)

/** @internal */
export const scoped = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, Scope.Scope>> =>
  withFiber((fiber) => {
    const prev = fiber.context
    const scope = scopeMakeUnsafe()
    fiber.setContext(Context.add(fiber.context, scopeTag, scope))
    onExitUnsafe<A, E>(fiber, (exit) => {
      fiber.setContext(prev)
      return scopeCloseUnsafe(scope, exit)
    })
    return self
  }) as any

/** @internal */
export const scopeUse: {
  (
    scope: Scope.Closeable
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Scope.Scope>>
  <A, E, R>(self: Effect.Effect<A, E, R>, scope: Scope.Closeable): Effect.Effect<A, E, Exclude<R, Scope.Scope>>
} = dual(
  2,
  <A, E, R>(self: Effect.Effect<A, E, R>, scope: Scope.Closeable): Effect.Effect<A, E, Exclude<R, Scope.Scope>> =>
    onExit(provideScope(self, scope), (exit) => suspend(() => scopeCloseUnsafe(scope, exit) ?? void_))
)

/** @internal */
export const scopedWith = <A, E, R>(
  f: (scope: Scope.Scope) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  suspend(() => {
    const scope = scopeMakeUnsafe()
    return onExit(f(scope), (exit) => suspend(() => scopeCloseUnsafe(scope, exit) ?? void_))
  })

/** @internal */
export const acquireRelease = <A, E, R, R2>(
  acquire: Effect.Effect<A, E, R>,
  release: (a: A, exit: Exit.Exit<unknown, unknown>) => Effect.Effect<unknown, never, R2>,
  options?: { readonly interruptible?: boolean }
): Effect.Effect<A, E, R | R2 | Scope.Scope> =>
  contextWith((context: Context.Context<R2>) =>
    uninterruptibleMask((restore) =>
      flatMap(
        scope,
        (scope) =>
          tap(
            options?.interruptible ? restore(acquire) : acquire,
            (a) => scopeAddFinalizerExit(scope, (exit) => provideContext(release(a, exit), context))
          )
      )
    )
  )

/** @internal */
export const addFinalizer = <R>(
  finalizer: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void, never, R>
): Effect.Effect<void, never, R | Scope.Scope> =>
  flatMap(
    scope,
    (scope) =>
      contextWith((context: Context.Context<R>) =>
        scopeAddFinalizerExit(scope, (exit) => provideContext(finalizer(exit), context))
      )
  )

const OnExitImpl = (function() {
  const Proto = makePrimitiveProto({
    op: "OnExit",
    [evaluate](this: any, fiber: FiberImpl) {
      fiber._stack.push(this)
      return this.effect
    },
    [contAll](this: any, fiber) {
      if (fiber.interruptible && this.interruptible !== true) {
        fiber._stack.push(setInterruptibleTrue)
        fiber.interruptible = false
      }
    },
    [contA](this: any, value, _, exit) {
      exit ??= exitSucceed(value)
      let eff: Effect.Effect<void, any, any> | undefined
      try {
        eff = this.onExit(exit)
      } catch (defect) {
        eff = exitDie(defect)
      }
      return eff ? flatMap(eff, (_) => exit) : exit
    },
    [contE](this: any, cause, _, exit) {
      exit ??= exitFailCause(cause)
      let eff: Effect.Effect<void, any, any> | undefined
      try {
        eff = this.onExit(exit)
      } catch (defect) {
        eff = exitDie(defect)
      }
      return eff ? flatMap(combineFinalizerCause(exit, eff), (_) => exit) : exit
    }
  })
  const OnExitImpl = function(this: any, effect: any, onExit: any, interruptible: any) {
    this.effect = effect
    this.onExit = onExit
    this.interruptible = interruptible
  } as unknown as PrimitiveCtor<[effect: any, onExit: any, interruptible: any]>
  OnExitImpl.prototype = Proto
  return OnExitImpl
})()

/** @internal */
export const onExitPrimitive: <A, E, R, XE = never, XR = never>(
  self: Effect.Effect<A, E, R>,
  f: (exit: Exit.Exit<A, E>) => Effect.Effect<void, XE, XR> | undefined,
  interruptible?: boolean
) => Effect.Effect<A, E | XE, R | XR> = (effect, onExit, interruptible) =>
  new OnExitImpl(effect, onExit, interruptible) as any

/**
 * Pushes an exit finalizer for the current `withFiber` evaluation. Only call inside `withFiber`.
 * @internal
 */
export const onExitUnsafe = <A = unknown, E = unknown>(
  fiber: Fiber.Fiber<unknown, unknown>,
  f: (exit: Exit.Exit<A, E>) => Effect.Effect<void, unknown, unknown> | undefined
): void => {
  ;(fiber as FiberImpl)._stack.push(new OnExitImpl(undefined, f, undefined))
}

/** @internal */
export const onExit: {
  <A, E, XE = never, XR = never>(
    f: (exit: Exit.Exit<A, E>) => Effect.Effect<void, XE, XR>
  ): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | XE, R | XR>
  <A, E, R, XE = never, XR = never>(
    self: Effect.Effect<A, E, R>,
    f: (exit: Exit.Exit<A, E>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR>
} = dual(2, onExitPrimitive)

/** @internal */
export const ensuring: {
  <XE, XR>(
    finalizer: Effect.Effect<void, XE, XR>
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR>(
    self: Effect.Effect<A, E, R>,
    finalizer: Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR>
} = dual(
  2,
  <A, E, R, XE, XR>(
    self: Effect.Effect<A, E, R>,
    finalizer: Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR> => onExit(self, (_) => finalizer)
)

/** @internal */
export const onExitIf: {
  <A, E, XE, XR>(
    predicate: Predicate.Predicate<Exit.Exit<NoInfer<A>, NoInfer<E>>>,
    f: (exit: Exit.Exit<NoInfer<A>, NoInfer<E>>) => Effect.Effect<void, XE, XR>
  ): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<Exit.Exit<NoInfer<A>, NoInfer<E>>>,
    f: (exit: Exit.Exit<NoInfer<A>, NoInfer<E>>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR>
} = dual(
  3,
  <A, E, R, XE, XR>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<Exit.Exit<NoInfer<A>, NoInfer<E>>>,
    f: (exit: Exit.Exit<NoInfer<A>, NoInfer<E>>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR> =>
    onExit(self, (exit) => {
      if (!predicate(exit)) {
        return void_
      }
      return f(exit)
    })
)

/** @internal */
export const onExitFilter: {
  <A, E, XE, XR, B, X>(
    filter: Filter.Filter<Exit.Exit<NoInfer<A>, NoInfer<E>>, B, X>,
    f: (b: B, exit: Exit.Exit<NoInfer<A>, NoInfer<E>>) => Effect.Effect<void, XE, XR>
  ): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR, B, X>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<Exit.Exit<NoInfer<A>, NoInfer<E>>, B, X>,
    f: (b: B, exit: Exit.Exit<NoInfer<A>, NoInfer<E>>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR>
} = dual(
  3,
  <A, E, R, XE, XR, B, X>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<Exit.Exit<NoInfer<A>, NoInfer<E>>, B, X>,
    f: (b: B, exit: Exit.Exit<NoInfer<A>, NoInfer<E>>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR> =>
    onExit(self, (exit) => {
      const b = filter(exit)
      return Result.isFailure(b) ? void_ : f(b.success, exit)
    })
)

/** @internal */
export const onError: {
  <A, E, XE, XR>(
    f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<void, XE, XR>
  ): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR>(
    self: Effect.Effect<A, E, R>,
    f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR>
} = dual(
  2,
  <A, E, R, XE, XR>(
    self: Effect.Effect<A, E, R>,
    f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR> => onExitFilter(self, exitFilterCause as any, f as any) as any
)

/** @internal */
export const onErrorIf: {
  <E, XE, XR>(
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect.Effect<void, XE, XR>
  ): <A, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR>
} = dual(
  3,
  <A, E, R, XE, XR>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR> =>
    onExitIf(
      self,
      (exit): exit is Exit.Failure<A, E> => {
        if (exit._tag !== "Failure") {
          return false
        }
        return predicate(exit.cause)
      },
      (exit) => f((exit as Exit.Failure<A, E>).cause)
    ) as any
)

/** @internal */
export const onErrorFilter: {
  <A, E, EB, X, XE, XR>(
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Effect.Effect<void, XE, XR>
  ): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | XE, R | XR>
  <A, E, R, EB, X, XE, XR>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR>
} = dual(
  3,
  <A, E, R, EB, X, XE, XR>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR> =>
    onExit(self, (exit) => {
      if (exit._tag !== "Failure") {
        return void_
      }
      const result = filter(exit.cause)
      return Result.isFailure(result) ? void_ : f(result.success, exit.cause)
    })
)

/** @internal */
export const onInterrupt: {
  <XE, XR>(
    finalizer: (interruptors: ReadonlySet<number>) => Effect.Effect<void, XE, XR>
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR>(
    self: Effect.Effect<A, E, R>,
    finalizer: (interruptors: ReadonlySet<number>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR>
} = dual(
  2,
  <A, E, R, XE, XR>(
    self: Effect.Effect<A, E, R>,
    finalizer: (interruptors: ReadonlySet<number>) => Effect.Effect<void, XE, XR>
  ): Effect.Effect<A, E | XE, R | XR> => onErrorFilter(causeFilterInterruptors as any, finalizer)(self) as any
)

/** @internal */
export const acquireUseRelease = <Resource, E, R, A, E2, R2, E3, R3>(
  acquire: Effect.Effect<Resource, E, R>,
  use: (a: Resource) => Effect.Effect<A, E2, R2>,
  release: (a: Resource, exit: Exit.Exit<A, E2>) => Effect.Effect<void, E3, R3>
): Effect.Effect<A, E | E2 | E3, R | R2 | R3> =>
  uninterruptibleMask((restore) =>
    flatMap(acquire, (a) =>
      onExitPrimitive(
        suspend(() => restore(use(a))),
        (exit) => release(a, exit),
        true
      ))
  )

/** @internal */
export const acquireDisposable = <A extends AsyncDisposable | Disposable, E, R>(
  acquire: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | Scope.Scope> =>
  acquireRelease(acquire, (resource) =>
    hasProperty(resource, Symbol.asyncDispose)
      ? promise(() => resource[Symbol.asyncDispose]())
      : sync(() => resource[Symbol.dispose]()))

// ----------------------------------------------------------------------------
// Caching
// ----------------------------------------------------------------------------

/** @internal */
export const cachedInvalidateWithTTL: {
  <A, E>(timeToLive: (exit: Exit.Exit<A, E>) => Duration.Input): <R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<[Effect.Effect<A, E, R>, Effect.Effect<void>]>
  (timeToLive: Duration.Input): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<[Effect.Effect<A, E, R>, Effect.Effect<void>]>
  <A, E>(timeToLive: Duration.Input | ((exit: Exit.Exit<A, E>) => Duration.Input)): <R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<[Effect.Effect<A, E, R>, Effect.Effect<void>]>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    timeToLive: Duration.Input | ((exit: Exit.Exit<A, E>) => Duration.Input)
  ): Effect.Effect<[Effect.Effect<A, E, R>, Effect.Effect<void>]>
} = dual(2, <A, E, R>(
  self: Effect.Effect<A, E, R>,
  ttl: Duration.Input | ((exit: Exit.Exit<A, E>) => Duration.Input)
): Effect.Effect<[Effect.Effect<A, E, R>, Effect.Effect<void>]> =>
  sync(() =>
    makeCachedUnsafe(
      self,
      typeof ttl === "function"
        ? (exit: Exit.Exit<A, E>) => Duration.toMillis(Duration.fromInputUnsafe(ttl(exit)))
        : constant(Duration.toMillis(Duration.fromInputUnsafe(ttl)))
    )
  ))

const infiniteTTL = constant(Infinity)

interface CachedRun<A, E> {
  fiber: FiberImpl<A, E> | undefined
  awaiters: number
}

const makeCachedUnsafe = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  ttlMillis: (exit: Exit.Exit<A, E>) => number
): [Effect.Effect<A, E, R>, Effect.Effect<void>] => {
  let expiresAt = 0
  let exit: Exit.Exit<A, E> | undefined
  let current: CachedRun<A, E> | undefined

  const join = (fiber: Fiber.Fiber<unknown, unknown>, run: CachedRun<A, E>): Effect.Effect<A, E> => {
    run.awaiters++
    onExitUnsafe(fiber, () => {
      // Abandon the run once every caller has left, unless it already finished.
      if (--run.awaiters > 0 || current !== run) return
      // Detach it first so new callers start a fresh run instead of joining
      // one that is being interrupted.
      current = undefined
      return fiberInterrupt(run.fiber!)
    })
    return fiberJoin(run.fiber!)
  }

  return [
    withFiber((fiber) => {
      if (current !== undefined) return join(fiber, current)
      if (
        exit !== undefined &&
        (expiresAt === Infinity || fiber.getRef(ClockRef).currentTimeMillisUnsafe() < expiresAt)
      ) {
        return exit
      }
      exit = undefined
      const clock = fiber.getRef(ClockRef)
      const run: CachedRun<A, E> = { fiber: undefined, awaiters: 0 }
      current = run
      run.fiber = forkUnsafe(
        fiber,
        onExitPrimitive(self, (exit_) => {
          // An abandoned run must not overwrite or clear a replacement run.
          if (current !== run) return
          current = undefined
          // Interruption is abandonment, so it is never cached.
          if (exitHasInterrupts(exit_)) return
          const duration = ttlMillis(exit_)
          expiresAt = duration === Infinity ? Infinity : clock.currentTimeMillisUnsafe() + duration
          exit = exit_
        }),
        true,
        true
      )
      return run.fiber._exit ?? join(fiber, run)
    }),
    sync(() => {
      exit = undefined
    })
  ]
}

/** @internal */
export const cachedWithTTL: {
  <A, E>(
    timeToLive: (exit: Exit.Exit<A, E>) => Duration.Input
  ): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<Effect.Effect<A, E, R>>
  (
    timeToLive: Duration.Input
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<Effect.Effect<A, E, R>>
  <A, E>(
    timeToLive: Duration.Input | ((exit: Exit.Exit<A, E>) => Duration.Input)
  ): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<Effect.Effect<A, E, R>>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    timeToLive: Duration.Input | ((exit: Exit.Exit<A, E>) => Duration.Input)
  ): Effect.Effect<Effect.Effect<A, E, R>>
} = dual(
  2,
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    timeToLive: Duration.Input | ((exit: Exit.Exit<A, E>) => Duration.Input)
  ): Effect.Effect<Effect.Effect<A, E, R>> => map(cachedInvalidateWithTTL(self, timeToLive), (tuple) => tuple[0])
)

/** @internal */
export const cached = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<Effect.Effect<A, E, R>> =>
  sync(() => makeCachedUnsafe(self, infiniteTTL)[0])

// ----------------------------------------------------------------------------
// interruption
// ----------------------------------------------------------------------------

/** @internal */
export const interrupt: Effect.Effect<never> = withFiber((fiber) => failCause(causeInterrupt(fiber.id)))

/** @internal */
export const uninterruptible = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  withFiber((fiber) => {
    if (!fiber.interruptible) return self
    fiber.interruptible = false
    fiber._stack.push(setInterruptibleTrue)
    return self
  })

const setInterruptible: (interruptible: boolean) => Primitive = makePrimitive({
  op: "SetInterruptible",
  [contAll](fiber) {
    fiber.interruptible = this[args]
    if (fiber._interruptedCause && fiber.interruptible) {
      return () => failCause(fiber._interruptedCause!)
    }
  }
})
const setInterruptibleTrue = setInterruptible(true)
const setInterruptibleFalse = setInterruptible(false)

const setFiberInterruptible = (fiber: FiberImpl): Effect.Effect<never> | undefined => {
  fiber.interruptible = true
  fiber._stack.push(setInterruptibleFalse)
  if (fiber._interruptedCause) return failCause(fiber._interruptedCause)
}

/**
 * Makes the current fiber uninterruptible for the returned effect without an
 * extra primitive. Call only within `withFiber`.
 *
 * @internal
 */
export const fiberEnterUninterruptibleUnsafe = (fiber: Fiber.Fiber<unknown, unknown>): void => {
  const impl = fiber as FiberImpl
  if (!impl.interruptible) return
  impl.interruptible = false
  impl._stack.push(setInterruptibleTrue)
}

/**
 * Makes the current fiber interruptible for the returned effect without an
 * extra primitive. Call only within `withFiber` and return any pending
 * interruption it produces.
 *
 * @internal
 */
export const fiberEnterInterruptibleUnsafe = (
  fiber: Fiber.Fiber<unknown, unknown>
): Effect.Effect<never> | undefined => {
  const impl = fiber as FiberImpl
  if (impl.interruptible) return undefined
  return setFiberInterruptible(impl)
}

/** @internal */
export const interruptible = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  withFiber((fiber) => {
    if (fiber.interruptible) return self
    return setFiberInterruptible(fiber) ?? self
  })

/** @internal */
export const uninterruptibleMask = <A, E, R>(
  f: (
    restore: <A, E, R>(
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  withFiber((fiber) => {
    if (!fiber.interruptible) return f(identity)
    fiber.interruptible = false
    fiber._stack.push(setInterruptibleTrue)
    return f(interruptible)
  })

/** @internal */
export const interruptibleMask = <A, E, R>(
  f: (
    restore: <A, E, R>(
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  withFiber((fiber) => {
    if (fiber.interruptible) return f(identity)
    const interrupted = setFiberInterruptible(fiber)
    const effect = f(uninterruptible)
    return interrupted ?? effect
  })

/** @internal */
export const abortSignal: Effect.Effect<AbortSignal, never, Scope.Scope> = map(
  acquireRelease(
    sync(() => new AbortController()),
    (controller) => sync(() => controller.abort())
  ),
  (_) => _.signal
)

// ========================================================================
// collecting & elements
// ========================================================================

/** @internal */
export const all = <
  const Arg extends
    | Iterable<Effect.Effect<any, any, any>>
    | Record<string, Effect.Effect<any, any, any>>,
  O extends {
    readonly concurrency?: Concurrency | undefined
    readonly discard?: boolean | undefined
    readonly mode?: "default" | "result" | undefined
  }
>(
  arg: Arg,
  options?: O
): Effect.All.Return<Arg, O> => {
  if (isIterable(arg)) {
    return options?.mode === "result"
      ? (forEach as any)(arg, result, options)
      : (forEach as any)(arg, identity, options)
  } else if (options?.discard) {
    return options.mode === "result"
      ? (forEach as any)(Object.values(arg), result, options)
      : (forEach as any)(Object.values(arg), identity, options)
  }
  return suspend(() => {
    const out: Record<string, unknown> = {}
    return as(
      forEach(
        Object.entries(arg),
        ([key, effect]) =>
          map(options?.mode === "result" ? result(effect) : effect, (value) => {
            InternalRecord.assignProperty(out, key, value)
          }),
        {
          discard: true,
          concurrency: options?.concurrency
        }
      ),
      out
    )
  }) as any
}

/** @internal */
export const partition: {
  <A, B, E, R>(
    f: (a: A, i: number) => Effect.Effect<B, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): (elements: Iterable<A>) => Effect.Effect<[passes: Array<B>, fails: Array<E>], never, R>
  <A, B, E, R>(
    elements: Iterable<A>,
    f: (a: A, i: number) => Effect.Effect<B, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): Effect.Effect<[passes: Array<B>, fails: Array<E>], never, R>
} = dual(
  (args) => isIterable(args[0]) && !isEffect(args[0]),
  <A, B, E, R>(
    elements: Iterable<A>,
    f: (a: A, i: number) => Effect.Effect<B, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): Effect.Effect<[passes: Array<B>, fails: Array<E>], never, R> =>
    map(
      forEach(elements, (a, i) => result(f(a, i)), options),
      (results) => Arr.partition(results, identity)
    )
)

/** @internal */
export const reduce: {
  <Z, A, E, R>(
    zero: LazyArg<Z>,
    f: (z: Z, a: A, i: number) => Effect.Effect<Z, E, R>
  ): (elements: Iterable<A>) => Effect.Effect<Z, E, R>
  <A, Z, E, R>(
    elements: Iterable<A>,
    zero: LazyArg<Z>,
    f: (z: Z, a: A, i: number) => Effect.Effect<Z, E, R>
  ): Effect.Effect<Z, E, R>
} = dual(
  3,
  <A, Z, E, R>(
    elements: Iterable<A>,
    zero: LazyArg<Z>,
    f: (z: Z, a: A, i: number) => Effect.Effect<Z, E, R>
  ) => {
    const arr = Arr.fromIterable(elements)
    if (arr.length === 0) return sync(zero)
    return suspend(() => {
      let index = 0
      let state = zero()
      return map(
        whileLoop({
          while: () => index < arr.length,
          body: () => f(state, arr[index], index),
          step(next) {
            state = next
            index++
          }
        }),
        () => state
      )
    })
  }
)

/** @internal */
export const validate: {
  <A, B, E, R>(
    f: (a: A, i: number) => Effect.Effect<B, E, R>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly discard?: false | undefined
    } | undefined
  ): (elements: Iterable<A>) => Effect.Effect<Array<B>, Arr.NonEmptyArray<E>, R>
  <A, B, E, R>(
    f: (a: A, i: number) => Effect.Effect<B, E, R>,
    options: {
      readonly concurrency?: Concurrency | undefined
      readonly discard: true
    }
  ): (elements: Iterable<A>) => Effect.Effect<void, Arr.NonEmptyArray<E>, R>
  <A, B, E, R>(
    elements: Iterable<A>,
    f: (a: A, i: number) => Effect.Effect<B, E, R>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly discard?: false | undefined
    } | undefined
  ): Effect.Effect<Array<B>, Arr.NonEmptyArray<E>, R>
  <A, B, E, R>(
    elements: Iterable<A>,
    f: (a: A, i: number) => Effect.Effect<B, E, R>,
    options: {
      readonly concurrency?: Concurrency | undefined
      readonly discard: true
    }
  ): Effect.Effect<void, Arr.NonEmptyArray<E>, R>
} = dual(
  (args) => isIterable(args[0]) && !isEffect(args[0]),
  <A, B, E, R>(
    elements: Iterable<A>,
    f: (a: A, i: number) => Effect.Effect<B, E, R>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly discard?: boolean | undefined
    } | undefined
  ): Effect.Effect<Array<B> | void, Arr.NonEmptyArray<E>, R> =>
    flatMap(
      partition(elements, f, { concurrency: options?.concurrency }),
      ([passes, fails]) => {
        if (Arr.isArrayNonEmpty(fails)) {
          return fail(fails)
        }
        return options?.discard ? void_ : succeed(passes)
      }
    )
)

/** @internal */
export const findFirst: {
  <A, E, R>(
    predicate: (a: NoInfer<A>, i: number) => Effect.Effect<boolean, E, R>
  ): (elements: Iterable<A>) => Effect.Effect<Option.Option<A>, E, R>
  <A, E, R>(
    elements: Iterable<A>,
    predicate: (a: NoInfer<A>, i: number) => Effect.Effect<boolean, E, R>
  ): Effect.Effect<Option.Option<A>, E, R>
} = dual(
  (args) => isIterable(args[0]) && !isEffect(args[0]),
  <A, E, R>(
    elements: Iterable<A>,
    predicate: (a: A, i: number) => Effect.Effect<boolean, E, R>
  ): Effect.Effect<Option.Option<A>, E, R> =>
    suspend(() => {
      const iterator = elements[Symbol.iterator]()
      const next = iterator.next()
      if (!next.done) {
        return findFirstLoop(iterator, 0, predicate, next.value)
      }
      return succeed(Option.none())
    })
)

const findFirstLoop = <A, E, R>(
  iterator: Iterator<A>,
  index: number,
  predicate: (a: A, i: number) => Effect.Effect<boolean, E, R>,
  value: A
): Effect.Effect<Option.Option<A>, E, R> =>
  flatMap(predicate(value, index), (keep) => {
    if (keep) {
      return succeed(Option.some(value))
    }
    const next = iterator.next()
    if (!next.done) {
      return findFirstLoop(iterator, index + 1, predicate, next.value)
    }
    return succeed(Option.none())
  })

/** @internal */
export const findFirstFilter: {
  <A, B, X, E, R>(
    filter: (input: NoInfer<A>, i: number) => Effect.Effect<Result.Result<B, X>, E, R>
  ): (elements: Iterable<A>) => Effect.Effect<Option.Option<B>, E, R>
  <A, B, X, E, R>(
    elements: Iterable<A>,
    filter: (input: NoInfer<A>, i: number) => Effect.Effect<Result.Result<B, X>, E, R>
  ): Effect.Effect<Option.Option<B>, E, R>
} = dual(
  (args) => isIterable(args[0]) && !isEffect(args[0]),
  <A, B, X, E, R>(
    elements: Iterable<A>,
    filter: (input: A, i: number) => Effect.Effect<Result.Result<B, X>, E, R>
  ): Effect.Effect<Option.Option<B>, E, R> =>
    suspend(() => {
      const iterator = elements[Symbol.iterator]()
      const next = iterator.next()
      if (!next.done) {
        return findFirstFilterLoop(iterator, 0, filter, next.value)
      }
      return succeed(Option.none())
    })
)

const findFirstFilterLoop = <A, B, X, E, R>(
  iterator: Iterator<A>,
  index: number,
  filter: (input: A, i: number) => Effect.Effect<Result.Result<B, X>, E, R>,
  value: A
): Effect.Effect<Option.Option<B>, E, R> =>
  flatMap(filter(value, index), (result) => {
    if (Result.isSuccess(result)) {
      return succeed(Option.some(result.success))
    }
    const next = iterator.next()
    if (!next.done) {
      return findFirstFilterLoop(iterator, index + 1, filter, next.value)
    }
    return succeed(Option.none())
  })

/** @internal */
export const whileLoop: <A, E, R>(options: {
  readonly while: LazyArg<boolean>
  readonly body: LazyArg<Effect.Effect<A, E, R>>
  readonly step: (a: A) => void
}) => Effect.Effect<void, E, R> = makePrimitive({
  op: "While",
  [contA](value, fiber) {
    this[args].step(value)
    if (this[args].while()) {
      fiber._stack.push(this)
      return this[args].body()
    }
    return exitVoid
  },
  [evaluate](fiber) {
    if (this[args].while()) {
      fiber._stack.push(this)
      return this[args].body()
    }
    return exitVoid
  }
})

/** @internal */
export const forEach: {
  <A, B, E, R, S extends Iterable<A> = Iterable<A>, const Discard extends boolean = false>(
    f: (a: A, i: number) => Effect.Effect<B, E, R>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly discard?: Discard | undefined
    } | undefined
  ): (
    self: [S] extends [never] ? Iterable<A> : S
  ) => Effect.Effect<Discard extends false ? Arr.ReadonlyArray.With<S, B> : void, E, R>
  <B, E, R, S extends Iterable<any>, const Discard extends boolean = false>(
    self: S,
    f: (a: Arr.ReadonlyArray.Infer<S>, i: number) => Effect.Effect<B, E, R>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly discard?: Discard | undefined
    } | undefined
  ): Effect.Effect<Discard extends false ? Arr.ReadonlyArray.With<S, B> : void, E, R>
} = dual((args) => typeof args[1] === "function", <A, B, E, R>(
  iterable: Iterable<A>,
  f: (a: A, index: number) => Effect.Effect<B, E, R>,
  options?: {
    readonly concurrency?: Concurrency | undefined
    readonly discard?: boolean | undefined
  }
): Effect.Effect<any, E, R> =>
  suspend(() => {
    const concurrency = resolveConcurrency(options?.concurrency)

    if (concurrency === 1) {
      return forEachSequential(iterable, f, options)
    }

    const items = Arr.fromIterable(iterable)
    let length = items.length
    if (length === 0) {
      return options?.discard ? void_ : succeed([])
    }

    const out: Array<B> | undefined = options?.discard
      ? undefined
      : new Array(length)
    const eff = forEachConcurrent({ f, out }, items, { concurrency })
    return eff ? as(eff, out as any) : succeed(out as any)
  }))

/** @internal */
export const head = <A, E, R>(
  self: Effect.Effect<Iterable<A>, E, R>
): Effect.Effect<A, E | Cause.NoSuchElementError, R> =>
  flatMap(self, (elements) => {
    const result = elements[Symbol.iterator]().next()
    return result.done ? fail(new NoSuchElementError()) : succeed(result.value)
  })

const forEachSequential = <A, B, E, R>(
  iterable: Iterable<A>,
  f: (a: A, index: number) => Effect.Effect<B, E, R>,
  options?: {
    readonly discard?: boolean | undefined
  }
) =>
  suspend(() => {
    const out: Array<B> | undefined = options?.discard ? undefined : []
    const iterator = iterable[Symbol.iterator]()
    let state = iterator.next()
    let index = 0
    return as(
      whileLoop({
        while: () => !state.done,
        body: () => f(state.value!, index++),
        step: (b) => {
          if (out) out.push(b)
          state = iterator.next()
        }
      }),
      out
    )
  })

/** @internal */
export const resolveConcurrency = (concurrency: Concurrency | undefined): number =>
  concurrency === "unbounded" ? Number.POSITIVE_INFINITY : Math.max(1, concurrency ?? 1)

type IterateOptions<S, A, X, E, R, E2> = {
  readonly onItem: (state: S, item: A, index: number) => Effect.Effect<X, E, R>
  readonly step: (state: NoInfer<S>, item: A, exit: Exit.Exit<X, E>, index: number) => Exit.Exit<void, E2> | void
}

/** @internal */
export const iterateEager = <S, A>() =>
<X, E, R, E2>(options: IterateOptions<S, A, X, E, R, E2>): (
  initialState: S,
  items: ReadonlyArray<A>,
  start?: number,
  end?: number
) => Effect.Effect<void, E | E2, R> | undefined => {
  const onItem = options.onItem
  const step = options.step

  const resumeSequential = (
    state: S,
    items: ReadonlyArray<A>,
    index: number,
    end: number,
    effect: Effect.Effect<X, E, R>
  ): Effect.Effect<void, E | E2, R> =>
    flatMap(
      exit(effect),
      (itemExit) => step(state, items[index], itemExit, index) ?? runSequential(state, items, index + 1, end) ?? void_
    )

  const runSequential = (
    state: S,
    items: ReadonlyArray<A>,
    index = 0,
    end = items.length
  ): Effect.Effect<void, E | E2, R> | undefined => {
    for (; index < end; index++) {
      const item = items[index]
      const effect = onItem(state, item, index)
      if (!effectIsExit(effect)) {
        return resumeSequential(state, items, index, end, effect)
      }
      const terminal = step(state, item, effect, index)
      if (terminal) return terminal._tag === "Failure" ? terminal : undefined
    }
  }

  return runSequential
}

const iterateConcurrentImpl = <S, A, X, E, R, E2>(options: IterateOptions<S, A, X, E, R, E2>) => {
  const onItem = options.onItem
  const step = options.step
  return (
    state: S,
    items: ReadonlyArray<A>,
    opts: { readonly concurrency: number; readonly end?: number | undefined }
  ): Effect.Effect<void, E | E2, R> | undefined => {
    let index = 0
    const end = opts.end ?? items.length
    const concurrency = opts.concurrency
    let done = false
    let parentFiber: Fiber.Fiber<any, any> | undefined
    let fibers: Set<Fiber.Fiber<any, any>> | undefined
    let resume: ((effect: Effect.Effect<void, E | E2, R>) => void) | undefined
    let terminal: Exit.Exit<void, E | E2> | void
    let effect: Effect.Effect<X, E, R> | undefined

    const failDefect = (error: unknown): Effect.Effect<void, E | E2, R> => {
      const defect = exitDie(error)
      terminal = defect
      done = true
      return fibers && fibers.size > 0
        ? flatMap(uninterruptible(fiberInterruptAll(Array.from(fibers))), () => terminal ?? defect)
        : defect
    }

    const go = (): Effect.Effect<void, E | E2, R> | undefined => {
      let paused = false
      for (; !terminal && index < end; index++) {
        const item = items[index]
        const eff = effect ?? onItem(state, item, index)

        if (effectIsExit(eff)) {
          terminal = step(state, item, eff, index)
          if (terminal) break
        } else if (!parentFiber) {
          return callback((cb) => {
            parentFiber = getCurrentFiber()!
            fibers = new Set()
            effect = eff
            resume = cb
            let result: Effect.Effect<void, E | E2, R> | undefined
            try {
              result = go()
            } catch (error) {
              return cb(failDefect(error))
            }
            if (result) return cb(result)
            return suspend(() => {
              terminal ??= exitVoid
              return flatMap(
                fibers ? fiberInterruptAll(fibers) : void_,
                () => terminal?._tag === "Failure" ? terminal : void_
              )
            })
          })
        } else {
          // Clear the effect cached before the parent fiber was available.
          effect = undefined

          const fiber = forkUnsafe(parentFiber, eff, true, true, "inherit")
          if (fiber._exit) {
            terminal = step(state, item, fiber._exit, index)
            if (terminal) break
            continue
          }

          fibers!.add(fiber)

          const currentIndex = index
          fiber.addObserver((exit) => {
            fibers!.delete(fiber)
            try {
              if (terminal) {
                if (exit._tag === "Failure") {
                  const reasons = exit.cause.reasons.filter((reason) => reason._tag !== "Interrupt")
                  if (reasons.length > 0) {
                    const cause = causeFromReasons(reasons)
                    terminal = exitFailCause(terminal._tag === "Failure" ? causeCombine(terminal.cause, cause) : cause)
                  }
                }
              } else {
                const result = step(state, item, exit, currentIndex)
                if (result) {
                  terminal = result
                  go()
                }
              }

              if (paused) {
                const eff = go()
                if (eff) resume!(eff)
              } else if (done && fibers!.size === 0) {
                resume!(terminal ?? void_)
              }
            } catch (error) {
              resume!(failDefect(error))
            }
          })

          if (fibers!.size < concurrency) continue
          paused = true
          index++
          return
        }
      }

      done = true

      if (terminal) {
        if (fibers && fibers.size > 0) {
          const annotations = fiberStackAnnotations(parentFiber!)
          fibers.forEach((f) => f.interruptUnsafe(parentFiber!.id, annotations))
          return
        }
        if (resume || terminal._tag === "Failure") {
          return terminal
        }
      } else if (resume) {
        if (!fibers) {
          return exitVoid
        } else if (fibers.size === 0) {
          resume(void_)
        }
      }
    }

    return go()
  }
}

/** @internal */
export const iterateConcurrent = <S, A>() => <X, E, R, E2>(options: IterateOptions<S, A, X, E, R, E2>) =>
  iterateConcurrentImpl<S, A, X, E, R, E2>(options)

const forEachConcurrent = iterateConcurrentImpl({
  onItem(
    state: {
      readonly f: (a: any, i: number) => Effect.Effect<any, any, any>
      readonly out: Array<any> | undefined
    },
    item,
    index
  ) {
    return state.f(item, index)
  },
  step(state, _, exit, index) {
    if (exit._tag === "Failure") return exit
    else if (state.out) {
      state.out[index] = exit.value
    }
  }
})

/** @internal */
export const filterOrElse: {
  <A, C, E2, R2, B extends A>(
    refinement: Predicate.Refinement<NoInfer<A>, B>,
    orElse: (a: EqualsWith<A, B, NoInfer<A>, Exclude<NoInfer<A>, B>>) => Effect.Effect<C, E2, R2>
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B | C, E2 | E, R2 | R>
  <A, C, E2, R2>(
    predicate: Predicate.Predicate<NoInfer<A>>,
    orElse: (a: NoInfer<A>) => Effect.Effect<C, E2, R2>
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A | C, E2 | E, R2 | R>
  <A, E, R, C, E2, R2, B extends A>(
    self: Effect.Effect<A, E, R>,
    refinement: Predicate.Refinement<A, B>,
    orElse: (a: EqualsWith<A, B, A, Exclude<A, B>>) => Effect.Effect<C, E2, R2>
  ): Effect.Effect<B | C, E | E2, R | R2>
  <A, E, R, C, E2, R2>(
    self: Effect.Effect<A, E, R>,
    predicate: Predicate.Predicate<NoInfer<A>>,
    orElse: (a: NoInfer<A>) => Effect.Effect<C, E2, R2>
  ): Effect.Effect<A | C, E | E2, R | R2>
} = dual(3, <A, E, R, B, E2, R2>(
  self: Effect.Effect<A, E, R>,
  predicate: Predicate.Predicate<A>,
  orElse: (a: A) => Effect.Effect<B, E2, R2>
): Effect.Effect<A | B, E | E2, R | R2> =>
  flatMap(
    self,
    (a) => predicate(a) ? succeed<A | B>(a) : orElse(a)
  ))

/** @internal */
export const filterMapOrElse: {
  <A, B, X, C, E2, R2>(
    filter: Filter.Filter<NoInfer<A>, B, X>,
    orElse: (x: X) => Effect.Effect<C, E2, R2>
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B | C, E2 | E, R2 | R>
  <A, E, R, B, X, C, E2, R2>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<NoInfer<A>, B, X>,
    orElse: (x: X) => Effect.Effect<C, E2, R2>
  ): Effect.Effect<B | C, E | E2, R | R2>
} = dual(3, <A, E, R, B, X, C, E2, R2>(
  self: Effect.Effect<A, E, R>,
  filter: Filter.Filter<NoInfer<A>, B, X>,
  orElse: (x: X) => Effect.Effect<C, E2, R2>
): Effect.Effect<B | C, E | E2, R | R2> =>
  flatMap(
    self,
    (a) => {
      const result = filter(a)
      return (Result.isFailure(result)
        ? orElse(result.failure)
        : succeed(result.success)) as Effect.Effect<B | C, E2, R2>
    }
  ))

/** @internal */
export const filterMapOrFail: {
  <A, B, X, E2>(
    filter: Filter.Filter<NoInfer<A>, B, X>,
    orFailWith: (x: X) => E2
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, E2 | E, R>
  <A, B, X>(
    filter: Filter.Filter<NoInfer<A>, B, X>
  ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<B, Cause.NoSuchElementError | E, R>
  <A, E, R, B, X, E2>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<NoInfer<A>, B, X>,
    orFailWith: (x: X) => E2
  ): Effect.Effect<B, E2 | E, R>
  <A, E, R, B, X>(
    self: Effect.Effect<A, E, R>,
    filter: Filter.Filter<NoInfer<A>, B, X>
  ): Effect.Effect<B, Cause.NoSuchElementError | E, R>
} = dual((args) => isEffect(args[0]), <A, E, R, B, X, E2>(
  self: Effect.Effect<A, E, R>,
  filter: Filter.Filter<NoInfer<A>, B, X>,
  orFailWith?: (x: X) => E2
): Effect.Effect<B, E2 | Cause.NoSuchElementError | E, R> =>
  filterMapOrElse(
    self,
    filter,
    orFailWith ? (x: X) => fail(orFailWith(x)) : () => fail(new NoSuchElementError() as E2)
  ))

/** @internal */
export const filter: {
  <A, B extends A>(
    refinement: Predicate.Refinement<NoInfer<A>, B>
  ): (elements: Iterable<A>) => Effect.Effect<Array<B>>
  <A>(
    predicate: Predicate.Predicate<NoInfer<A>>
  ): (elements: Iterable<A>) => Effect.Effect<Array<A>>
  <A, E, R>(
    predicate: (a: NoInfer<A>, i: number) => Effect.Effect<boolean, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): (iterable: Iterable<A>) => Effect.Effect<Array<A>, E, R>
  <A, B extends A>(
    elements: Iterable<A>,
    refinement: Predicate.Refinement<A, B>
  ): Effect.Effect<Array<B>>
  <A>(
    elements: Iterable<A>,
    predicate: Predicate.Predicate<A>
  ): Effect.Effect<Array<A>>
  <A, E, R>(
    iterable: Iterable<A>,
    predicate: (a: NoInfer<A>, i: number) => Effect.Effect<boolean, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): Effect.Effect<Array<A>, E, R>
} = dual(
  (args) => isIterable(args[0]) && !isEffect(args[0]),
  <A, E, R>(
    elements: Iterable<A>,
    predicate:
      | Predicate.Predicate<A>
      | ((a: A, i: number) => Effect.Effect<boolean, E, R>),
    options?: { readonly concurrency?: Concurrency | undefined }
  ): Effect.Effect<Array<A>, E, R> =>
    suspend(() => {
      const out: Array<A> = []
      return as(
        forEach(
          elements,
          (a, i) => {
            const result = (predicate as Function)(a, i)
            if (typeof result === "boolean") {
              if (result) out.push(a)
              return void_ as any
            }
            return map(result, (keep) => {
              if (keep) {
                out.push(a)
              }
            })
          },
          {
            discard: true,
            concurrency: options?.concurrency
          }
        ),
        out
      )
    })
)

/** @internal */
export const filterMap: {
  <A, B, X>(
    filter: Filter.Filter<NoInfer<A>, B, X>
  ): (elements: Iterable<A>) => Effect.Effect<Array<B>>
  <A, B, X>(
    elements: Iterable<A>,
    filter: Filter.Filter<NoInfer<A>, B, X>
  ): Effect.Effect<Array<B>>
} = dual(
  (args) => isIterable(args[0]) && !isEffect(args[0]),
  <A, B, X>(
    elements: Iterable<A>,
    filter: Filter.Filter<A, B, X>
  ): Effect.Effect<Array<B>> =>
    suspend(() => {
      const out: Array<B> = []
      for (const a of elements) {
        const result = filter(a)
        if (Result.isSuccess(result)) {
          out.push(result.success)
        }
      }
      return succeed(out)
    })
)

/** @internal */
export const filterMapEffect: {
  <A, B, X, E, R>(
    filter: Filter.FilterEffect<NoInfer<A>, B, X, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): (elements: Iterable<A>) => Effect.Effect<Array<B>, E, R>
  <A, B, X, E, R>(
    elements: Iterable<A>,
    filter: Filter.FilterEffect<NoInfer<A>, B, X, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): Effect.Effect<Array<B>, E, R>
} = dual(
  (args) => isIterable(args[0]) && !isEffect(args[0]),
  <A, B, X, E, R>(
    elements: Iterable<A>,
    filter: Filter.FilterEffect<A, B, X, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): Effect.Effect<Array<B>, E, R> =>
    suspend(() => {
      const out: Array<B> = []
      return as(
        forEach(
          elements,
          (a) =>
            map(filter(a), (result) => {
              if (Result.isSuccess(result)) {
                out.push(result.success)
              }
            }),
          {
            discard: true,
            concurrency: options?.concurrency
          }
        ),
        out
      )
    })
)

// ----------------------------------------------------------------------------
// do notation
// ----------------------------------------------------------------------------

/** @internal */
export const Do: Effect.Effect<{}> = succeed({})

/** @internal */
export const bindTo: {
  <N extends string>(
    name: N
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<Record<N, A>, E, R>
  <A, E, R, N extends string>(
    self: Effect.Effect<A, E, R>,
    name: N
  ): Effect.Effect<Record<N, A>, E, R>
} = doNotation.bindTo<Effect.EffectTypeLambda>(map)

/** @internal */
export const bind: {
  <N extends string, A extends Record<string, any>, B, E2, R2>(
    name: N,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>
  ): <E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<Simplify<Omit<A, N> & Record<N, B>>, E | E2, R | R2>
  <A extends Record<string, any>, E, R, B, E2, R2, N extends string>(
    self: Effect.Effect<A, E, R>,
    name: N,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>
  ): Effect.Effect<Simplify<Omit<A, N> & Record<N, B>>, E | E2, R | R2>
} = doNotation.bind<Effect.EffectTypeLambda>(map, flatMap)

/** @internal */
const let_: {
  <N extends string, A extends Record<string, any>, B>(
    name: N,
    f: (a: NoInfer<A>) => B
  ): <E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<Simplify<Omit<A, N> & Record<N, B>>, E, R>
  <A extends Record<string, any>, E, R, B, N extends string>(
    self: Effect.Effect<A, E, R>,
    name: N,
    f: (a: NoInfer<A>) => B
  ): Effect.Effect<Simplify<Omit<A, N> & Record<N, B>>, E, R>
} = doNotation.let_<Effect.EffectTypeLambda>(map)

/** @internal */
export { let_ as let }

// ----------------------------------------------------------------------------
// fibers & forking
// ----------------------------------------------------------------------------

/** @internal */
export const forkChild: {
  <
    Arg extends Effect.Effect<any, any, any> | {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    } | undefined = {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    }
  >(
    effectOrOptions: Arg,
    options?: {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    } | undefined
  ): [Arg] extends [Effect.Effect<infer _A, infer _E, infer _R>] ? Effect.Effect<Fiber.Fiber<_A, _E>, never, _R>
    : <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<Fiber.Fiber<A, E>, never, R>
} = dual((args) => isEffect(args[0]), <A, E, R>(
  self: Effect.Effect<A, E, R>,
  options?: {
    readonly startImmediately?: boolean
    readonly uninterruptible?: boolean | "inherit"
  }
): Effect.Effect<Fiber.Fiber<A, E>, never, R> =>
  withFiber((fiber) => {
    interruptChildrenPatch()
    return succeed(forkUnsafe(
      fiber,
      self,
      options?.startImmediately,
      false,
      options?.uninterruptible ?? false
    ))
  }))

/** @internal */
export const forkUnsafe = <FA, FE, A, E, R>(
  parent: Fiber.Fiber<FA, FE>,
  effect: Effect.Effect<A, E, R>,
  immediate = false,
  daemon = false,
  uninterruptible: boolean | "inherit" = false
): FiberImpl<A, E> => {
  const parentRuntime = parent as FiberImpl<FA, FE>
  const interruptible = uninterruptible === "inherit" ? parentRuntime.interruptible : !uninterruptible
  const child = new FiberImpl<A, E>(parentRuntime.context, interruptible)
  if (immediate) {
    child.evaluate(effect as any)
  } else {
    // Preserve the fork context rather than the dispatcher's context.
    child._asyncContext = captureAsyncContext()
    parentRuntime.currentDispatcher.scheduleTask(() => child.evaluate(effect as any), 0)
  }
  if (!daemon && !child._exit) {
    parentRuntime.children().add(child)
    child._parent = parentRuntime
  }
  return child
}

/** @internal */
export const forkDetach: {
  <
    Arg extends Effect.Effect<any, any, any> | {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    } | undefined = {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    }
  >(
    effectOrOptions: Arg,
    options?: {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    } | undefined
  ): [Arg] extends [Effect.Effect<infer _A, infer _E, infer _R>] ? Effect.Effect<Fiber.Fiber<_A, _E>, never, _R>
    : <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<Fiber.Fiber<A, E>, never, R>
} = dual((args) => isEffect(args[0]), <A, E, R>(
  self: Effect.Effect<A, E, R>,
  options?: {
    readonly startImmediately?: boolean
    readonly uninterruptible?: boolean | "inherit" | undefined
  }
): Effect.Effect<Fiber.Fiber<A, E>, never, R> =>
  withFiber((fiber) => succeed(forkUnsafe(fiber, self, options?.startImmediately, true, options?.uninterruptible))))

/** @internal */
export const awaitAllChildren = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  withFiber((fiber) => {
    const initialChildren = fiber._children && new Set(fiber._children)
    const isInterruptible = fiber.interruptible
    return onExitPrimitive(
      self,
      (_) => {
        let children = fiber._children
        if (children === undefined || children.size === 0) {
          return void_
        } else if (initialChildren) {
          children = Iterable.filter(
            children,
            (child: FiberImpl<any, any>) => !initialChildren.has(child)
          ) as Set<FiberImpl<any, any>>
        }
        const awaitChildren = asVoid(fiberAwaitAll(children))
        return isInterruptible ? interruptible(awaitChildren) : awaitChildren
      }
    )
  })

/** @internal */
export const forkIn: {
  (
    scope: Scope.Scope,
    options?: {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    }
  ): <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<Fiber.Fiber<A, E>, never, R>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    scope: Scope.Scope,
    options?: {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    }
  ): Effect.Effect<Fiber.Fiber<A, E>, never, R>
} = dual(
  (args) => isEffect(args[0]),
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    scope: Scope.Scope,
    options?: {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    }
  ): Effect.Effect<Fiber.Fiber<A, E>, never, R> =>
    withFiber((parent) => {
      const fiber = forkUnsafe(parent, self, options?.startImmediately, true, options?.uninterruptible)
      if (!(fiber as FiberImpl<any, any>)._exit) {
        if (scope.state._tag !== "Closed") {
          const key = {}
          const finalizer = () => withFiberId((interruptor) => interruptor === fiber.id ? void_ : fiberInterrupt(fiber))
          scopeAddFinalizerUnsafe(scope, key, finalizer)
          fiber.addObserver(() => scopeRemoveFinalizerUnsafe(scope, key))
        } else {
          fiber.interruptUnsafe(parent.id, fiberStackAnnotations(parent))
        }
      }
      return succeed(fiber)
    })
)

/** @internal */
export const forkScoped: {
  <
    Arg extends Effect.Effect<any, any, any> | {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    } | undefined = {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    }
  >(
    effectOrOptions: Arg,
    options?: {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    } | undefined
  ): [Arg] extends [Effect.Effect<infer _A, infer _E, infer _R>] ?
    Effect.Effect<Fiber.Fiber<_A, _E>, never, _R | Scope.Scope>
    : <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<Fiber.Fiber<A, E>, never, R | Scope.Scope>
} = dual((args) => isEffect(args[0]), <A, E, R>(
  self: Effect.Effect<A, E, R>,
  options?: {
    readonly startImmediately?: boolean
    readonly uninterruptible?: boolean | "inherit"
  }
): Effect.Effect<Fiber.Fiber<A, E>, never, R | Scope.Scope> => flatMap(scope, (scope) => forkIn(self, scope, options)))

// ----------------------------------------------------------------------------
// execution
// ----------------------------------------------------------------------------

/** @internal */
export const runForkWith = <R>(context: Context.Context<R>) =>
<A, E>(
  effect: Effect.Effect<A, E, R>,
  options?: Effect.RunOptions | undefined
): Fiber.Fiber<A, E> => {
  const fiber = new FiberImpl<A, E>(
    options?.scheduler ? Context.add(context, Scheduler.Scheduler, options.scheduler) : context,
    options?.uninterruptible !== true
  )
  fiber.evaluate(effect as any)
  if (fiber._exit) return fiber

  if (options?.signal) {
    if (options.signal.aborted) {
      fiber.interruptUnsafe()
    } else {
      const abort = () => fiber.interruptUnsafe()
      options.signal.addEventListener("abort", abort, { once: true })
      fiber.addObserver(() => options.signal!.removeEventListener("abort", abort))
    }
  }
  if (options?.onFiberStart) {
    options.onFiberStart(fiber)
  }
  return fiber
}

/** @internal */
export const fiberRunIn: {
  (scope: Scope.Scope): <A, E>(self: Fiber.Fiber<A, E>) => Fiber.Fiber<A, E>
  <A, E>(
    self: Fiber.Fiber<A, E>,
    scope: Scope.Scope
  ): Fiber.Fiber<A, E>
} = dual(2, <A, E>(
  self: FiberImpl<A, E>,
  scope: Scope.Scope
): Fiber.Fiber<A, E> => {
  if (self._exit) {
    return self
  } else if (scope.state._tag === "Closed") {
    self.interruptUnsafe(self.id)
    return self
  }
  const key = {}
  scopeAddFinalizerUnsafe(scope, key, () => fiberInterrupt(self))
  self.addObserver(() => scopeRemoveFinalizerUnsafe(scope, key))
  return self
})

/** @internal */
export const runFork: <A, E>(
  effect: Effect.Effect<A, E, never>,
  options?: Effect.RunOptions | undefined
) => Fiber.Fiber<A, E> = runForkWith(Context.empty())

/** @internal */
export const runCallbackWith = <R>(context: Context.Context<R>) => {
  const runFork = runForkWith(context)
  return <A, E>(
    effect: Effect.Effect<A, E, R>,
    options?:
      | Effect.RunOptions & {
        readonly onExit: (exit: Exit.Exit<A, E>) => void
      }
      | undefined
  ): (interruptor?: number | undefined) => void => {
    const fiber = runFork(effect, options)
    if (options?.onExit) {
      fiber.addObserver(options.onExit)
    }
    return (interruptor) => {
      return fiber.interruptUnsafe(interruptor)
    }
  }
}

/** @internal */
export const runCallback = runCallbackWith(Context.empty())

/** @internal */
export const runPromiseExitWith = <R>(context: Context.Context<R>) => {
  const runFork = runForkWith(context)
  return <A, E>(
    effect: Effect.Effect<A, E, R>,
    options?: Effect.RunOptions | undefined
  ): Promise<Exit.Exit<A, E>> => {
    const fiber = runFork(effect, options)
    return new Promise((resolve) => {
      fiber.addObserver((exit) => resolve(exit))
    })
  }
}

/** @internal */
export const runPromiseExit = runPromiseExitWith(Context.empty())

/** @internal */
export const runPromiseWith = <R>(context: Context.Context<R>) => {
  const runPromiseExit = runPromiseExitWith(context)
  return <A, E>(
    effect: Effect.Effect<A, E, R>,
    options?:
      | Effect.RunOptions
      | undefined
  ): Promise<A> =>
    runPromiseExit(effect, options).then((exit) => {
      if (exit._tag === "Failure") {
        throw causeSquash(exit.cause)
      }
      return exit.value
    })
}

/** @internal */
export const runPromise: <A, E>(
  effect: Effect.Effect<A, E>,
  options?:
    | Effect.RunOptions
    | undefined
) => Promise<A> = runPromiseWith(Context.empty())

/** @internal */
export const runSyncExitWith = <R>(context: Context.Context<R>) => {
  const runFork = runForkWith(context)
  return <A, E>(effect: Effect.Effect<A, E, R>): Exit.Exit<A, E> => {
    if (effectIsExit(effect)) return effect
    const scheduler = new Scheduler.MixedScheduler("sync")
    const fiber = runFork(effect, { scheduler }) as FiberImpl<A, E>
    fiber._dispatcher?.flush()
    return fiber._exit ?? exitDie(new AsyncFiberError(fiber))
  }
}

/** @internal */
export const runSyncExit: <A, E>(effect: Effect.Effect<A, E>) => Exit.Exit<A, E> = runSyncExitWith(
  Context.empty()
)

/** @internal */
export const runSyncWith = <R>(context: Context.Context<R>) => {
  const runSyncExit = runSyncExitWith(context)
  return <A, E>(effect: Effect.Effect<A, E, R>): A => {
    const exit = runSyncExit(effect)
    if (exit._tag === "Failure") throw causeSquash(exit.cause)
    return exit.value
  }
}

/** @internal */
export const runSync: <A, E>(effect: Effect.Effect<A, E>) => A = runSyncWith(Context.empty())

const succeedTrue = succeed(true)
const succeedFalse = succeed(false)

class Latch implements _Latch.Latch {
  waiters: Array<(_: Effect.Effect<void>) => void> = []
  scheduled: Array<(_: Effect.Effect<void>) => void> | undefined = undefined
  private _isOpen: boolean

  constructor(isOpen: boolean) {
    this._isOpen = isOpen
  }

  private scheduleUnsafe(fiber: Fiber.Fiber<unknown, unknown>) {
    if (this.waiters.length === 0) {
      return succeedTrue
    }
    if (this.scheduled === undefined) {
      this.scheduled = this.waiters
      fiber.currentDispatcher.scheduleTask(this.flushScheduled, 0)
    } else {
      for (let i = 0; i < this.waiters.length; i++) {
        this.scheduled.push(this.waiters[i])
      }
    }
    this.waiters = []
    return succeedTrue
  }
  private flushScheduled = () => {
    if (this.scheduled === undefined) return
    const waiters = this.scheduled
    this.scheduled = undefined
    for (let i = 0; i < waiters.length; i++) {
      waiters[i](exitVoid)
    }
  }
  private flushWaiters() {
    // swap both arrays out before any resume runs: a resumed waiter can
    // reentrantly close the latch and register new waiters, which must not
    // be drained by this flush
    const waiters = this.waiters
    this.waiters = []
    this.flushScheduled()
    for (let i = 0; i < waiters.length; i++) {
      waiters[i](exitVoid)
    }
  }

  open = withFiber<boolean>((fiber) => {
    if (this._isOpen) return succeedFalse
    this._isOpen = true
    return this.scheduleUnsafe(fiber)
  })
  release = withFiber<boolean>((fiber) => this._isOpen ? succeedFalse : this.scheduleUnsafe(fiber))
  openUnsafe() {
    if (this._isOpen) return false
    this._isOpen = true
    this.flushWaiters()
    return true
  }
  await = callback<void>((resume) => {
    if (this._isOpen) {
      return resume(void_)
    }
    this.waiters.push(resume)
    return sync(() => {
      let index = this.waiters.indexOf(resume)
      if (index !== -1) {
        this.waiters.splice(index, 1)
      } else if (this.scheduled !== undefined) {
        index = this.scheduled.indexOf(resume)
        if (index !== -1) {
          this.scheduled.splice(index, 1)
        }
      }
    })
  })
  closeUnsafe() {
    if (!this._isOpen) return false
    this._isOpen = false
    return true
  }
  close = sync(() => this.closeUnsafe())
  whenOpen = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => flatMap(this.await, () => self)
  isOpen() {
    return this._isOpen
  }
}

/** @internal */
export const makeLatchUnsafe = (open?: boolean | undefined): _Latch.Latch => new Latch(open ?? false)

/** @internal */
export const makeLatch = (open?: boolean | undefined) => sync(() => makeLatchUnsafe(open))

// ----------------------------------------------------------------------------
// Tracer
// ----------------------------------------------------------------------------

/** @internal */
export const tracer: Effect.Effect<Tracer.Tracer> = withFiber((fiber) => succeed(fiber.getRef(Tracer.Tracer)))

/** @internal */
export const withTracer: {
  (tracer: Tracer.Tracer): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(effect: Effect.Effect<A, E, R>, tracer: Tracer.Tracer): Effect.Effect<A, E, R>
} = dual(
  2,
  <A, E, R>(effect: Effect.Effect<A, E, R>, tracer: Tracer.Tracer): Effect.Effect<A, E, R> =>
    provideService(effect, Tracer.Tracer, tracer)
)

/** @internal */
export const withTracerEnabled: {
  (enabled: boolean): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(effect: Effect.Effect<A, E, R>, enabled: boolean): Effect.Effect<A, E, R>
} = provideService(TracerEnabled)

/** @internal */
export const withTracerTiming: {
  (enabled: boolean): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(effect: Effect.Effect<A, E, R>, enabled: boolean): Effect.Effect<A, E, R>
} = provideService(TracerTimingEnabled)

const bigint0 = BigInt(0)

const NoopSpanProto: Omit<Tracer.Span, "parent" | "name" | "annotations" | "level"> = {
  _tag: "Span",
  spanId: "noop",
  traceId: "noop",
  sampled: false,
  status: {
    _tag: "Ended",
    startTime: bigint0,
    endTime: bigint0,
    exit: exitVoid
  },
  attributes: new Map(),
  links: [],
  kind: "internal",
  attribute() {},
  event() {},
  end() {},
  addLinks() {}
}

/** @internal */
export const noopSpan = (options: {
  readonly name: string
  readonly parent: Option.Option<Tracer.AnySpan>
  readonly annotations: Context.Context<never>
}): Tracer.Span => Object.assign(Object.create(NoopSpanProto), options)

const filterDisablePropagation = (span: Tracer.AnySpan | undefined): Option.Option<Tracer.AnySpan> => {
  if (!span) return Option.none()
  return Context.get(span.annotations, Tracer.DisablePropagation)
    ? span._tag === "Span" ? filterDisablePropagation(Option.getOrUndefined(span.parent)) : Option.none()
    : Option.some(span)
}

/** @internal */
export const makeSpanUnsafe = <XA, XE>(
  fiber: Fiber.Fiber<XA, XE>,
  name: string,
  options: Tracer.SpanOptionsNoTrace | undefined
) => {
  const disablePropagation = !fiber.cache.tracerEnabled ||
    (options?.annotations && Context.get(options.annotations, Tracer.DisablePropagation))
  const parent = options?.parent !== undefined
    ? Option.some(options.parent)
    : options?.root
    ? Option.none<Tracer.AnySpan>()
    : filterDisablePropagation(fiber.cache.span)

  let span: Tracer.Span

  if (disablePropagation) {
    span = noopSpan({
      name,
      parent,
      annotations: Context.add(
        options?.annotations ?? Context.empty(),
        Tracer.DisablePropagation,
        true
      )
    })
  } else {
    // The cache stores only explicit tracer overrides; absent references use the default.
    const tracer = fiber.cache.tracer ?? Tracer.nativeTracer
    const clock = fiber.getRef(ClockRef)
    const timingEnabled = fiber.getRef(TracerTimingEnabled)
    const annotationsFromEnv = fiber.getRef(TracerSpanAnnotations)
    const linksFromEnv = fiber.getRef(TracerSpanLinks)
    const level = options?.level ?? fiber.getRef(Tracer.CurrentTraceLevel)

    const links = options?.links !== undefined ?
      [...linksFromEnv, ...options.links] :
      linksFromEnv.length === 0
      ? []
      : linksFromEnv.slice()

    span = tracer.span({
      name,
      parent,
      annotations: options?.annotations ?? Context.empty(),
      links,
      startTime: timingEnabled ? clock.currentTimeNanosUnsafe() : bigint0,
      kind: options?.kind ?? "internal",
      root: options?.root ?? Option.isNone(parent),
      sampled: options?.sampled ??
        (Option.isSome(parent) && parent.value.sampled === false
          ? false
          : !isLogLevelGreaterThan(fiber.getRef(Tracer.MinimumTraceLevel), level))
    })

    for (const key in annotationsFromEnv) {
      span.attribute(key, annotationsFromEnv[key])
    }
    if (options?.attributes !== undefined) {
      for (const key in options.attributes) {
        span.attribute(key, options.attributes[key])
      }
    }
  }

  return span
}

/** @internal */
export const makeSpan = (
  name: string,
  options?: Tracer.SpanOptions
): Effect.Effect<Tracer.Span> => withFiber((fiber) => succeed(makeSpanUnsafe(fiber, name, options)))

/** @internal */
export const makeSpanScoped = (
  name: string,
  options?: Tracer.SpanOptionsNoTrace | undefined
): Effect.Effect<Tracer.Span, never, Scope.Scope> =>
  uninterruptible(
    withFiber((fiber) => {
      const scope = Context.getUnsafe(fiber.context, scopeTag)
      const span = makeSpanUnsafe(fiber, name, options ?? {})
      const clock = fiber.getRef(ClockRef)
      const timingEnabled = fiber.getRef(TracerTimingEnabled)
      return as(
        scopeAddFinalizerExit(scope, (exit) => endSpan(span, exit, clock, timingEnabled)),
        span
      )
    })
  )

/** @internal */
export const withSpanScoped: {
  (
    name: string,
    options?: Tracer.SpanOptions
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Tracer.ParentSpan> | Scope.Scope>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    name: string,
    options?: Tracer.SpanOptions
  ): Effect.Effect<A, E, Exclude<R, Tracer.ParentSpan> | Scope.Scope>
} = function() {
  const dataFirst = typeof arguments[0] !== "string"
  const name = dataFirst ? arguments[1] : arguments[0]
  const options = addSpanStackTrace(dataFirst ? arguments[2] : arguments[1])
  if (dataFirst) {
    const self = arguments[0]
    return flatMap(
      makeSpanScoped(name, options),
      (span) => withParentSpan(self, span, options)
    )
  }
  return (self: Effect.Effect<any, any, any>) =>
    flatMap(
      makeSpanScoped(name, options),
      (span) => withParentSpan(self, span, options)
    )
} as any

const provideSpanStackFrame = (name: string, stack: (() => string | undefined) | undefined) => {
  stack = typeof stack === "function" ? stack : constUndefined
  return updateService(CurrentStackFrame, (parent) => ({
    name,
    stack,
    parent
  }))
}

/** @internal */
export const spanAnnotations: Effect.Effect<Readonly<Record<string, unknown>>> = TracerSpanAnnotations

/** @internal */
export const spanLinks: Effect.Effect<ReadonlyArray<Tracer.SpanLink>> = TracerSpanLinks

/** @internal */
export const linkSpans: {
  (
    span: Tracer.AnySpan | ReadonlyArray<Tracer.AnySpan>,
    attributes?: Record<string, unknown>
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    span: Tracer.AnySpan | ReadonlyArray<Tracer.AnySpan>,
    attributes?: Record<string, unknown>
  ): Effect.Effect<A, E, R>
} = dual((args) => isEffect(args[0]), <A, E, R>(
  self: Effect.Effect<A, E, R>,
  span: Tracer.AnySpan | ReadonlyArray<Tracer.AnySpan>,
  attributes: Record<string, unknown> = {}
): Effect.Effect<A, E, R> => {
  const spans: Array<Tracer.AnySpan> = Array.isArray(span) ? span : [span]
  const links = spans.map((span): Tracer.SpanLink => ({ span, attributes }))
  return updateService(self, TracerSpanLinks, (current) => [...current, ...links])
})

/** @internal */
export const endSpan = <A, E>(
  span: Tracer.Span,
  exit: Exit.Exit<A, E>,
  clock: Clock.Clock,
  timingEnabled: boolean
) =>
  sync(() => {
    if (span.status._tag === "Ended") return
    span.end(timingEnabled ? clock.currentTimeNanosUnsafe() : bigint0, exit)
  })

/** @internal */
export const useSpan: {
  <A, E, R>(name: string, evaluate: (span: Tracer.Span) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
  <A, E, R>(
    name: string,
    options: Tracer.SpanOptionsNoTrace,
    evaluate: (span: Tracer.Span) => Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R>
} = <A, E, R>(
  name: string,
  ...args: [evaluate: (span: Tracer.Span) => Effect.Effect<A, E, R>] | [
    options: any,
    evaluate: (span: Tracer.Span) => Effect.Effect<A, E, R>
  ]
): Effect.Effect<A, E, R> => {
  const options = args.length === 1 ? undefined : args[0]
  const evaluate: (span: Tracer.Span) => Effect.Effect<A, E, R> = args[args.length - 1]
  return withFiber((fiber) => {
    const span = makeSpanUnsafe(fiber, name, options)
    const clock = fiber.getRef(ClockRef)
    const timingEnabled = fiber.getRef(TracerTimingEnabled)
    onExitUnsafe(fiber, (exit) => endSpan(span, exit, clock, timingEnabled))
    return evaluate(span)
  })
}

const provideParentSpan = provideService(Tracer.ParentSpan)

/** @internal */
export const withParentSpan: {
  (
    value: Tracer.AnySpan,
    options?: Tracer.TraceOptions
  ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Tracer.ParentSpan>>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    value: Tracer.AnySpan,
    options?: Tracer.TraceOptions
  ): Effect.Effect<A, E, Exclude<R, Tracer.ParentSpan>>
} = function() {
  const dataFirst = isEffect(arguments[0])
  const span: Tracer.AnySpan = dataFirst ? arguments[1] : arguments[0]
  let options = dataFirst ? arguments[2] : arguments[1]
  let provideStackFrame: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R> = identity
  if (span._tag === "Span") {
    options = addSpanStackTrace(options)
    provideStackFrame = provideSpanStackFrame(span.name, options?.captureStackTrace)
  }
  if (dataFirst) {
    return provideParentSpan(provideStackFrame(arguments[0]), span)
  }
  return (self: Effect.Effect<any, any, any>) => provideParentSpan(provideStackFrame(self), span)
} as any

/** @internal */
export const withSpan: {
  <Args extends ReadonlyArray<any>>(
    name: string,
    options?: Tracer.SpanOptionsNoTrace | ((...args: NoInfer<Args>) => Tracer.SpanOptionsNoTrace) | undefined,
    traceOptions?: Tracer.TraceOptions | undefined
  ): <A, E, R>(self: Effect.Effect<A, E, R>, ...args: Args) => Effect.Effect<A, E, Exclude<R, Tracer.ParentSpan>>
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    name: string,
    options?: Tracer.SpanOptions | undefined
  ): Effect.Effect<A, E, Exclude<R, Tracer.ParentSpan>>
} = function() {
  const dataFirst = typeof arguments[0] !== "string"
  const name = dataFirst ? arguments[1] : arguments[0]
  const traceOptions = addSpanStackTrace(arguments[2])
  if (dataFirst) {
    const self = arguments[0]
    return useSpan(name, arguments[2], (span) => withParentSpan(self, span, traceOptions))
  }
  const fnArg = typeof arguments[1] === "function" ? arguments[1] : undefined
  const options = fnArg ? undefined : arguments[1]
  return (self: Effect.Effect<any, any, any>, ...args: any) =>
    useSpan(
      name,
      fnArg ? fnArg(...args) : options,
      (span) => withParentSpan(self, span, traceOptions)
    )
} as any

/** @internal */
export const annotateSpans: {
  (key: string, value: unknown): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  (values: Record<string, unknown>): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(effect: Effect.Effect<A, E, R>, key: string, value: unknown): Effect.Effect<A, E, R>
  <A, E, R>(effect: Effect.Effect<A, E, R>, values: Record<string, unknown>): Effect.Effect<A, E, R>
} = dual(
  (args) => isEffect(args[0]),
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    ...args: [Record<string, unknown>] | [key: string, value: unknown]
  ): Effect.Effect<A, E, R> =>
    updateService(effect, TracerSpanAnnotations, (annotations) => {
      const newAnnotations = args.length === 1 ? { ...annotations, ...args[0] } : { ...annotations }
      if (args.length === 1) {
        return newAnnotations
      } else {
        InternalRecord.assignProperty(newAnnotations, args[0], args[1])
      }
      return newAnnotations
    })
)

/** @internal */
export const annotateCurrentSpan: {
  (key: string, value: unknown): Effect.Effect<void>
  (values: Record<string, unknown>): Effect.Effect<void>
} = (...args: [Record<string, unknown>] | [key: string, value: unknown]) =>
  withFiber((fiber) => {
    const span = fiber.currentSpanLocal
    if (span) {
      if (args.length === 1) {
        for (const [key, value] of Object.entries(args[0])) {
          span.attribute(key, value)
        }
      } else {
        span.attribute(args[0], args[1])
      }
    }
    return void_
  })

/** @internal */
export const currentSpan: Effect.Effect<Tracer.Span, Cause.NoSuchElementError> = withFiber((fiber) => {
  const span = fiber.currentSpanLocal
  return span ? succeed(span) : fail(new NoSuchElementError())
})

/** @internal */
export const currentParentSpan: Effect.Effect<Tracer.AnySpan, Cause.NoSuchElementError> = serviceOptional(
  Tracer.ParentSpan
)

// ----------------------------------------------------------------------------
// Clock
// ----------------------------------------------------------------------------

/** @internal */
export const ClockRef = Context.Reference<Clock.Clock>("effect/Clock", {
  defaultValue: (): Clock.Clock => new ClockImpl()
})

const MAX_TIMER_MILLIS = 2 ** 31 - 1

class ClockImpl implements Clock.Clock {
  currentTimeMillisUnsafe(): number {
    return Date.now()
  }
  readonly currentTimeMillis: Effect.Effect<number> = sync(() => this.currentTimeMillisUnsafe())
  currentTimeNanosUnsafe(): bigint {
    return wallTimeNanos()
  }
  readonly currentTimeNanos: Effect.Effect<bigint> = sync(() => this.currentTimeNanosUnsafe())
  monotonicTimeNanosUnsafe(): bigint {
    return monotonicNowNanos()
  }
  readonly monotonicTimeNanos: Effect.Effect<bigint> = sync(() => this.monotonicTimeNanosUnsafe())
  sleep(duration: Duration.Duration): Effect.Effect<void> {
    return this.sleepMillis(Duration.toMillis(duration))
  }
  private sleepMillis(millis: number): Effect.Effect<void> {
    if (millis <= 0) return yieldNow
    else if (!Number.isFinite(millis)) return never
    return callback((resume) => {
      const continuation = millis > MAX_TIMER_MILLIS
        ? this.sleepMillis(millis - MAX_TIMER_MILLIS)
        : void_
      const handle = setTimeout(() => resume(continuation), Math.min(millis, MAX_TIMER_MILLIS))
      return sync(() => clearTimeout(handle))
    })
  }
}

const nanosPerMilli = BigInt(1_000_000)

const monotonicNowNanos = (function() {
  const processHrtime = (globalThis as {
    readonly process?: { readonly hrtime?: { readonly bigint?: () => bigint } }
  }).process?.hrtime
  if (typeof processHrtime?.bigint === "function") {
    return () => processHrtime.bigint!()
  }
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return () => BigInt(Math.round(performance.now() * 1_000_000))
  }
  let previous = BigInt(0)
  return () => {
    const current = BigInt(Date.now()) * nanosPerMilli
    if (current > previous) {
      previous = current
    }
    return previous
  }
})()

const wallTimeNanos = (function() {
  const reanchorThresholdNanos = BigInt(1_000_000_000)
  let origin: bigint | undefined
  return () => {
    const monotonic = monotonicNowNanos()
    const wall = BigInt(Date.now()) * nanosPerMilli
    if (origin === undefined) {
      origin = wall - monotonic
    } else {
      const projected = origin + monotonic
      const skew = wall > projected ? wall - projected : projected - wall
      if (skew > reanchorThresholdNanos) {
        origin = wall - monotonic
      }
    }
    return origin + monotonic
  }
})()

/** @internal */
export const clockWith = <A, E, R>(f: (clock: Clock.Clock) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  withFiber((fiber) => f(fiber.getRef(ClockRef)))

/** @internal */
export const sleep = (duration: Duration.Input): Effect.Effect<void> =>
  clockWith((clock) => clock.sleep(Duration.fromInputUnsafe(duration)))

/** @internal */
export const currentTimeMillis: Effect.Effect<number> = clockWith((clock) => clock.currentTimeMillis)

/** @internal */
export const currentTimeNanos: Effect.Effect<bigint> = clockWith((clock) => clock.currentTimeNanos)

/** @internal */
export const monotonicTimeNanos: Effect.Effect<bigint> = clockWith((clock) => clock.monotonicTimeNanos)

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

/** @internal */
export const TimeoutErrorTypeId = "~effect/Cause/TimeoutError"

/** @internal */
export const isTimeoutError = (u: unknown): u is Cause.TimeoutError => hasProperty(u, TimeoutErrorTypeId)

/** @internal */
export class TimeoutError extends TaggedError("TimeoutError") {
  readonly [TimeoutErrorTypeId] = TimeoutErrorTypeId
  constructor(message?: string) {
    super({ message } as any)
  }
}

/** @internal */
export const IllegalArgumentErrorTypeId = "~effect/Cause/IllegalArgumentError"

/** @internal */
export const isIllegalArgumentError = (
  u: unknown
): u is Cause.IllegalArgumentError => hasProperty(u, IllegalArgumentErrorTypeId)

/** @internal */
export class IllegalArgumentError extends TaggedError("IllegalArgumentError") {
  readonly [IllegalArgumentErrorTypeId] = IllegalArgumentErrorTypeId
  constructor(message?: string) {
    super({ message } as any)
  }
}

/** @internal */
export const ExceededCapacityErrorTypeId = "~effect/Cause/ExceededCapacityError"

/** @internal */
export const isExceededCapacityError = (
  u: unknown
): u is Cause.ExceededCapacityError => hasProperty(u, ExceededCapacityErrorTypeId)

/** @internal */
export class ExceededCapacityError extends TaggedError("ExceededCapacityError") {
  readonly [ExceededCapacityErrorTypeId] = ExceededCapacityErrorTypeId
  constructor(message?: string) {
    super({ message } as any)
  }
}

/** @internal */
export const AsyncFiberErrorTypeId = "~effect/Cause/AsyncFiberError"

/** @internal */
export const isAsyncFiberError = (
  u: unknown
): u is Cause.AsyncFiberError => hasProperty(u, AsyncFiberErrorTypeId)

/** @internal */
export class AsyncFiberError extends TaggedError("AsyncFiberError")<{
  fiber: Fiber.Fiber<unknown, unknown>
  message: string
}> {
  readonly [AsyncFiberErrorTypeId] = AsyncFiberErrorTypeId
  constructor(fiber: Fiber.Fiber<unknown, unknown>) {
    super({
      message: "An asynchronous Effect was executed with Effect.runSync",
      fiber
    })
  }
}

/** @internal */
export const UnknownErrorTypeId = "~effect/Cause/UnknownError"

/** @internal */
export const isUnknownError = (
  u: unknown
): u is Cause.UnknownError => hasProperty(u, UnknownErrorTypeId)

/** @internal */
export class UnknownError extends TaggedError("UnknownError")<{
  cause: unknown
  message?: string | undefined
}> {
  readonly [UnknownErrorTypeId] = UnknownErrorTypeId
  constructor(cause: unknown, message?: string) {
    super({ message, cause } as any)
  }
}

// ----------------------------------------------------------------------------
// Console
// ----------------------------------------------------------------------------

/** @internal */
export const ConsoleRef = Context.Reference<Console.Console>(
  "effect/Console",
  { defaultValue: (): Console.Console => globalThis.console }
)

// ----------------------------------------------------------------------------
// LogLevel
// ----------------------------------------------------------------------------

/** @internal */
export const logLevelToOrder = (level: LogLevel.LogLevel) => {
  switch (level) {
    case "All":
      return Number.MIN_SAFE_INTEGER
    case "Fatal":
      return 50_000
    case "Error":
      return 40_000
    case "Warn":
      return 30_000
    case "Info":
      return 20_000
    case "Debug":
      return 10_000
    case "Trace":
      return 0
    case "None":
      return Number.MAX_SAFE_INTEGER
  }
}

/** @internal */
export const LogLevelOrder = Order.mapInput(Order.Number, logLevelToOrder)

/** @internal */
export const isLogLevelGreaterThan = Order.isGreaterThan(LogLevelOrder)

// ----------------------------------------------------------------------------
// Logger
// ----------------------------------------------------------------------------

/** @internal */
export const CurrentLoggers = Context.Reference<
  ReadonlySet<Logger.Logger<unknown, any>>
>("effect/Logger/CurrentLoggers", {
  defaultValue: () => new Set([defaultLogger, tracerLogger])
})

/** @internal */
export const LogToStderr = Context.Reference<boolean>("effect/Logger/LogToStderr", {
  defaultValue: constFalse
})

/** @internal */
export const annotateLogsScoped: {
  (key: string, value: unknown): Effect.Effect<void, never, Scope.Scope>
  (values: Record<string, unknown>): Effect.Effect<void, never, Scope.Scope>
} = function() {
  const entries = typeof arguments[0] === "string" ?
    [[arguments[0], arguments[1]]] :
    Object.entries(arguments[0])
  return uninterruptible(withFiber((fiber) => {
    const prev = fiber.getRef(CurrentLogAnnotations)
    const next = { ...prev }
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i]
      InternalRecord.assignProperty(next, key, value)
    }
    fiber.setContext(Context.add(fiber.context, CurrentLogAnnotations, next))
    return scopeAddFinalizerExit(Context.getUnsafe(fiber.context, scopeTag), (_) => {
      const current = fiber.getRef(CurrentLogAnnotations)
      const next = { ...current }
      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i]
        if (current[key] !== value && !Object.is(current[key], value)) continue
        if (Object.hasOwn(prev, key)) {
          InternalRecord.assignProperty(next, key, prev[key])
        } else {
          delete next[key]
        }
      }
      fiber.setContext(Context.add(fiber.context, CurrentLogAnnotations, next))
      return void_
    })
  }))
}

/** @internal */
export const LoggerTypeId = "~effect/Logger"

const LoggerProto = {
  [LoggerTypeId]: {
    _Message: identity,
    _Output: identity
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/** @internal */
export const loggerMake = <Message, Output>(
  log: (options: Logger.Options<Message>) => Output
): Logger.Logger<Message, Output> => {
  const self = Object.create(LoggerProto)
  self.log = log
  return self
}

/**
 * Sanitize a given string by replacing spaces, equal signs, and double quotes
 * with underscores.
 *
 * @internal
 */
export const formatLabel = (key: string) => key.replace(/[\s="]/g, "_")

/**
 * Formats a log span into a `<label>=<value>ms` string.
 *
 * @internal
 */
export const formatLogSpan = (self: [label: string, timestamp: number], now: number): string => {
  const label = formatLabel(self[0])
  return `${label}=${now - self[1]}ms`
}

/** @internal */
export const structuredMessage = (u: unknown): unknown => {
  switch (typeof u) {
    case "function":
    case "symbol": {
      return String(u)
    }
    default: {
      return toJson(u)
    }
  }
}

/** @internal */
export const logWithLevel = (level?: LogLevel.Severity) =>
(
  ...message: ReadonlyArray<any>
): Effect.Effect<void> => {
  let cause: Cause.Cause<unknown> | undefined = undefined
  for (let i = 0, len = message.length; i < len; i++) {
    const msg = message[i]
    if (isCause(msg)) {
      if (cause) {
        ;(message as Array<any>).splice(i, 1)
      } else {
        message = message.slice(0, i).concat(message.slice(i + 1))
      }
      cause = cause ? causeFromReasons(cause.reasons.concat(msg.reasons)) : msg
      i--
    }
  }
  if (cause === undefined) {
    cause = causeEmpty
  }
  return withFiber((fiber) => {
    const logLevel = level ?? fiber.cache.logLevel
    if (isLogLevelGreaterThan(fiber.cache.minimumLogLevel, logLevel)) {
      return void_
    }
    const clock = fiber.getRef(ClockRef)
    const loggers = fiber.getRef(CurrentLoggers)
    if (loggers.size > 0) {
      const date = new Date(clock.currentTimeMillisUnsafe())
      for (const logger of loggers) {
        logger.log({
          cause,
          fiber,
          date,
          logLevel,
          message
        })
      }
    }
    return void_
  })
}

const withColor = (text: string, ...colors: ReadonlyArray<string>) => {
  let out = ""
  for (let i = 0; i < colors.length; i++) {
    out += `\x1b[${colors[i]}m`
  }
  return out + text + "\x1b[0m"
}
const withColorNoop = (text: string, ..._colors: ReadonlyArray<string>) => text
const colors = {
  bold: "1",
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  cyan: "36",
  white: "37",
  gray: "90",
  black: "30",
  bgBrightRed: "101"
} as const

const logLevelColors: Record<LogLevel.LogLevel, ReadonlyArray<string>> = {
  None: [],
  All: [],
  Trace: [colors.gray],
  Debug: [colors.blue],
  Info: [colors.green],
  Warn: [colors.yellow],
  Error: [colors.red],
  Fatal: [colors.bgBrightRed, colors.black]
}
const logLevelStyle: Record<LogLevel.LogLevel, string> = {
  None: "",
  All: "",
  Trace: "color:gray",
  Debug: "color:blue",
  Info: "color:green",
  Warn: "color:orange",
  Error: "color:red",
  Fatal: "background-color:red;color:white"
}

const defaultDateFormat = (date: Date): string =>
  `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${
    date.getSeconds().toString().padStart(2, "0")
  }.${date.getMilliseconds().toString().padStart(3, "0")}`

/** @internal */
export const consolePretty = (options?: {
  readonly colors?: "auto" | boolean | undefined
  readonly formatDate?: ((date: Date) => string) | undefined
  readonly mode?: "browser" | "tty" | "auto" | undefined
}) => {
  // evaluated lazily so the module-level bundle stays free of `process`
  // property accesses, which bundlers must retain as possible side effects
  const process = (globalThis as { readonly process?: { readonly stdout?: unknown } }).process
  const hasProcessStdout = typeof process?.stdout === "object" && process.stdout !== null
  const isDeno = "Deno" in globalThis
  const mode = options?.mode ?? "auto"
  const isTtyLogger = mode === "auto" ? hasProcessStdout || isDeno : mode === "tty"

  return isTtyLogger ? prettyLoggerTty(options) : prettyLoggerBrowser(options)
}

/** @internal */
export const prettyLoggerTty = (options?: {
  readonly colors?: "auto" | boolean | undefined
  readonly formatDate?: ((date: Date) => string) | undefined
}) => {
  const formatDate = options?.formatDate ?? defaultDateFormat
  // evaluated lazily so the module-level bundle stays free of `process`
  // property accesses, which bundlers must retain as possible side effects
  const process = (globalThis as {
    readonly process?: {
      readonly stdout?: { readonly isTTY?: unknown }
      readonly isBun?: boolean
    }
  }).process

  const hasProcessStdout = typeof process?.stdout === "object" && process.stdout !== null
  const processStdoutIsTTY = hasProcessStdout && process.stdout.isTTY === true
  const showColors = typeof options?.colors === "boolean" ? options.colors : processStdoutIsTTY
  const color = showColors ? withColor : withColorNoop

  const processIsBun = process?.isBun === true
  return loggerMake<unknown, void>(
    ({ cause, date, fiber, logLevel, message: message_ }) => {
      const console = fiber.getRef(ConsoleRef)
      // oxlint-disable-next-line no-console
      const log = fiber.getRef(LogToStderr) ? console.error : console.log

      const message = Array.isArray(message_) ? message_.slice() : [message_]

      let firstLine = color(`[${formatDate(date)}]`, colors.white)
        + ` ${color(logLevel.toUpperCase(), ...logLevelColors[logLevel])}`
        + ` (#${fiber.id})`

      const now = date.getTime()
      const spans = fiber.getRef(CurrentLogSpans)
      for (const span of spans) {
        firstLine += " " + formatLogSpan(span, now)
      }

      firstLine += ":"
      let messageIndex = 0
      if (message.length > 0) {
        const firstMaybeString = structuredMessage(message[0])
        if (typeof firstMaybeString === "string") {
          firstLine += " " + color(firstMaybeString, colors.bold, colors.cyan)
          messageIndex++
        }
      }

      log(firstLine)
      // oxlint-disable-next-line no-console
      if (!processIsBun) console.group()

      if (cause.reasons.length > 0) {
        log(causePretty(cause))
      }

      if (messageIndex < message.length) {
        for (; messageIndex < message.length; messageIndex++) {
          log(redact(message[messageIndex]))
        }
      }

      const annotations = fiber.getRef(CurrentLogAnnotations)
      for (const [key, value] of Object.entries(annotations)) {
        log(color(`${key}:`, colors.bold, colors.white), redact(value))
      }

      // oxlint-disable-next-line no-console
      if (!processIsBun) console.groupEnd()
    }
  )
}

/** @internal */
export const prettyLoggerBrowser = (options?: {
  readonly colors?: "auto" | boolean | undefined
  readonly formatDate?: ((date: Date) => string) | undefined
}) => {
  const showColors = options?.colors !== false
  const color = showColors ? "%c" : ""
  const formatDate = options?.formatDate ?? defaultDateFormat
  return loggerMake<unknown, void>(
    ({ cause, date, fiber, logLevel, message: message_ }) => {
      const console = fiber.getRef(ConsoleRef)

      const message = Array.isArray(message_) ? message_.slice() : [message_]

      let firstLine = `${color}[${formatDate(date)}]`
      const firstParams = []
      if (showColors) {
        firstParams.push("color:gray")
      }
      firstLine += ` ${color}${logLevel.toUpperCase()}${color} (#${fiber.id})`
      if (showColors) {
        firstParams.push(logLevelStyle[logLevel], "")
      }

      const now = date.getTime()
      const spans = fiber.getRef(CurrentLogSpans)
      for (const span of spans) {
        firstLine += " " + formatLogSpan(span, now)
      }

      firstLine += ":"

      let messageIndex = 0
      if (message.length > 0) {
        const firstMaybeString = structuredMessage(message[0])
        if (typeof firstMaybeString === "string") {
          firstLine += ` ${color}${firstMaybeString}`
          if (showColors) {
            firstParams.push("color:deepskyblue")
          }
          messageIndex++
        }
      }

      // oxlint-disable-next-line no-console
      console.groupCollapsed(firstLine, ...firstParams)

      if (cause.reasons.length > 0) {
        // oxlint-disable-next-line no-console
        console.error(causePretty(cause))
      }

      if (messageIndex < message.length) {
        for (; messageIndex < message.length; messageIndex++) {
          // oxlint-disable-next-line no-console
          console.log(redact(message[messageIndex]))
        }
      }

      const annotations = fiber.getRef(CurrentLogAnnotations)
      for (const [key, value] of Object.entries(annotations)) {
        const redacted = redact(value)
        if (showColors) {
          // oxlint-disable-next-line no-console
          console.log(`%c${key}:`, "color:gray", redacted)
        } else {
          // oxlint-disable-next-line no-console
          console.log(`${key}:`, redacted)
        }
      }

      // oxlint-disable-next-line no-console
      console.groupEnd()
    }
  )
}

/** @internal */
export const defaultLogger = loggerMake<unknown, void>(({ cause, date, fiber, logLevel, message }) => {
  const message_ = Array.isArray(message) ? message.slice() : [message]
  if (cause.reasons.length > 0) {
    message_.push(causePretty(cause))
  }
  const now = date.getTime()
  const spans = fiber.getRef(CurrentLogSpans)
  let spanString = ""
  for (const span of spans) {
    spanString += ` ${formatLogSpan(span, now)}`
  }
  const annotations = fiber.getRef(CurrentLogAnnotations)
  if (Object.keys(annotations).length > 0) {
    message_.push(annotations)
  }
  const console = fiber.getRef(ConsoleRef)
  // oxlint-disable-next-line no-console
  const log = fiber.getRef(LogToStderr) ? console.error : console.log
  log(`[${defaultDateFormat(date)}] ${logLevel.toUpperCase()} (#${fiber.id})${spanString}:`, ...message_)
})

/** @internal */
export const tracerLogger = loggerMake<unknown, void>(({ cause, fiber, logLevel, message }) => {
  const clock = fiber.getRef(ClockRef)
  const annotations = fiber.getRef(CurrentLogAnnotations)
  const span = fiber.cache.span
  if (span === undefined || span._tag === "ExternalSpan") return
  const attributes: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(annotations)) {
    InternalRecord.assignProperty(attributes, key, value)
  }
  attributes["effect.fiberId"] = fiber.id
  attributes["effect.logLevel"] = logLevel.toUpperCase()
  if (cause.reasons.length > 0) {
    attributes["effect.cause"] = causePretty(cause)
  }
  span.event(
    toStringUnknown(Array.isArray(message) && message.length === 1 ? message[0] : message),
    clock.currentTimeNanosUnsafe(),
    attributes
  )
})

/** @internal */
export function interruptChildrenPatch() {
  fiberMiddleware.interruptChildren ??= fiberInterruptChildren
}

/** @internal */
const undefined_ = succeed(undefined)

/** @internal */
export { undefined_ as undefined }

// ----------------------------------------------------------------------------
// ErrorReporter
// ----------------------------------------------------------------------------

/** @internal */
export const withErrorReporting: <
  Arg extends Effect.Effect<any, any, any> | {
    readonly defectsOnly?: boolean | undefined
  } | undefined = {
    readonly defectsOnly?: boolean | undefined
  }
>(
  effectOrOptions: Arg,
  options?: {
    readonly defectsOnly?: boolean | undefined
  } | undefined
) => [Arg] extends [Effect.Effect<infer A, infer E, infer R>] ? Effect.Effect<A, E, R>
  : <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R> = dual(
    (args) => isEffect(args[0]),
    <A, E, R>(
      self: Effect.Effect<A, E, R>,
      options?: {
        readonly defectsOnly?: boolean | undefined
      } | undefined
    ): Effect.Effect<A, E, R> =>
      onError(self, (cause) =>
        withFiber((fiber) => {
          reportCauseUnsafe(fiber, cause, options?.defectsOnly)
          return void_
        }))
  )

/** @internal */
export const reportCauseUnsafe = (
  fiber: Fiber.Fiber<unknown, unknown>,
  cause: Cause.Cause<unknown>,
  defectsOnly?: boolean
) => {
  const reporters = fiber.getRef(CurrentErrorReporters)
  if (reporters.size === 0) return
  if (defectsOnly && !hasDies(cause)) return
  const opts = { cause, fiber, timestamp: fiber.getRef(ClockRef).currentTimeNanosUnsafe() }
  reporters.forEach((reporter) => reporter.report(opts))
}

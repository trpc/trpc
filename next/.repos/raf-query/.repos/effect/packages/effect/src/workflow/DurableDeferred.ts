/**
 * Defines named wait points for durable workflow executions.
 *
 * A `DurableDeferred` has a stable name and schemas for the value that will be
 * recorded later. Workflows can await it, suspend when no result exists yet, and
 * resume after its result is recorded. Tokens identify the workflow name,
 * execution id, and deferred name so external code can complete the correct
 * wait point later.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import type { NonEmptyReadonlyArray } from "../Array.ts"
import type * as Brand from "../Brand.ts"
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Base64Url from "../encoding/Base64Url.ts"
import * as Exit from "../Exit.ts"
import * as Filter from "../Filter.ts"
import { dual } from "../Function.ts"
import * as Option from "../Option.ts"
import * as Schema from "../Schema.ts"
import * as SchemaGetter from "../SchemaGetter.ts"
import type * as Activity from "./Activity.ts"
import * as Workflow from "./Workflow.ts"
import type { WorkflowEngine, WorkflowInstance } from "./WorkflowEngine.ts"

const TypeId = "~effect/workflow/DurableDeferred"

/**
 * Named durable deferred value whose completion is persisted by the workflow
 * engine and encoded with success and error schemas.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DurableDeferred<
  Success extends Schema.Constraint,
  Error extends Schema.Constraint = Schema.Never
> {
  readonly [TypeId]: typeof TypeId
  readonly name: string
  readonly successSchema: Success
  readonly errorSchema: Error
  readonly exitSchema: Schema.Exit<Schema.Top, Schema.Top, Schema.Top>
  readonly withActivityAttempt: Effect.Effect<DurableDeferred<Success, Error>>
}

/**
 * Type-erased durable deferred shape for APIs that only need the deferred
 * identity and name.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Any {
  readonly [TypeId]: typeof TypeId
  readonly name: string
}

/**
 * Type-erased durable deferred shape that also exposes success, error, and
 * exit schemas.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AnyWithProps {
  readonly [TypeId]: typeof TypeId
  readonly name: string
  readonly successSchema: Schema.Top
  readonly errorSchema: Schema.Top
  readonly exitSchema: Schema.Exit<any, any, any>
}

/**
 * Creates a named durable deferred with optional success and error schemas for
 * persisted completion.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <
  Success extends Schema.Constraint = Schema.Void,
  Error extends Schema.Constraint = Schema.Never
>(
  name: string,
  options?: {
    readonly success?: Success | undefined
    readonly error?: Error | undefined
  }
): DurableDeferred<Success, Error> => {
  const successSchema = options?.success ?? (Schema.Void as any as Success)
  const errorSchema = options?.error ?? (Schema.Never as any as Error)
  return {
    [TypeId]: TypeId as typeof TypeId,
    name,
    successSchema,
    errorSchema,
    exitSchema: Schema.Exit(
      Schema.toCodecJson(successSchema),
      Schema.toCodecJson(errorSchema),
      Schema.toCodecJson(Schema.Defect())
    ) as any,
    withActivityAttempt: Effect.gen(function*() {
      const attempt = yield* CurrentAttempt
      return make(`${name}/${attempt}`, {
        success: successSchema,
        error: errorSchema
      })
    })
  }
}

const EngineTag = Context.Service<WorkflowEngine, WorkflowEngine["Service"]>(
  "effect/workflow/WorkflowEngine" satisfies typeof WorkflowEngine.key
)

const InstanceTag = Context.Service<
  WorkflowInstance,
  WorkflowInstance["Service"]
>(
  "effect/workflow/WorkflowEngine/WorkflowInstance" satisfies typeof WorkflowInstance.key
)

const CurrentAttempt = Context.Reference<number>(
  "effect/workflow/Activity/CurrentAttempt" satisfies typeof Activity.CurrentAttempt.key,
  { defaultValue: () => 1 }
)

const await_: <Success extends Schema.Constraint, Error extends Schema.Constraint>(
  self: DurableDeferred<Success, Error>
) => Effect.Effect<
  Success["Type"],
  Error["Type"],
  | WorkflowEngine
  | WorkflowInstance
  | Success["DecodingServices"]
  | Error["DecodingServices"]
> = Effect.fnUntraced(function*<
  Success extends Schema.Constraint,
  Error extends Schema.Constraint
>(self: DurableDeferred<Success, Error>) {
  const engine = yield* EngineTag
  const instance = yield* InstanceTag
  // Register before the read so any later completion can preempt the run.
  instance.awaitedDeferreds.add(self.name)
  const exit = yield* Workflow.wrapActivityResult(
    engine.deferredResult(self),
    Option.isNone
  )
  if (Option.isNone(exit)) {
    return yield* Workflow.suspend(instance)
  }
  return yield* exit.value as Exit.Exit<any, any>
})

/**
 * @stability unstable
 */
export {
  /**
   * Waits for the durable deferred, suspending the current workflow when no
   * persisted completion is available.
   *
   * @stability unstable
   * @category combinators
   * @since 4.0.0
   */
  await_ as await
}

/**
 * Runs an effect and records its exit into the durable deferred, resuming
 * workflows that are waiting on that deferred.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const into: {
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>
  ): <R>(
    effect: Effect.Effect<Success["Type"], Error["Type"], R>
  ) => Effect.Effect<
    Success["Type"],
    Error["Type"],
    | R
    | WorkflowEngine
    | WorkflowInstance
    | Success["DecodingServices"]
    | Error["DecodingServices"]
    | Success["EncodingServices"]
    | Error["EncodingServices"]
  >
  <Success extends Schema.Constraint, Error extends Schema.Constraint, R>(
    effect: Effect.Effect<Success["Type"], Error["Type"], R>,
    self: DurableDeferred<Success, Error>
  ): Effect.Effect<
    Success["Type"],
    Error["Type"],
    | R
    | WorkflowEngine
    | WorkflowInstance
    | Success["DecodingServices"]
    | Error["DecodingServices"]
    | Success["EncodingServices"]
    | Error["EncodingServices"]
  >
} = dual(
  2,
  <Success extends Schema.Constraint, Error extends Schema.Constraint, R>(
    effect: Effect.Effect<Success["Type"], Error["Type"], R>,
    self: DurableDeferred<Success, Error>
  ): Effect.Effect<
    Success["Type"],
    Error["Type"],
    | R
    | WorkflowEngine
    | WorkflowInstance
    | Success["DecodingServices"]
    | Error["DecodingServices"]
    | Success["EncodingServices"]
    | Error["EncodingServices"]
  > =>
    Effect.contextWith(
      (context: Context.Context<WorkflowEngine | WorkflowInstance>) => {
        const engine = Context.get(context, EngineTag)
        const parentInstance = Context.get(context, InstanceTag)
        const instance = { ...parentInstance }
        return Effect.onExit(
          Effect.provideService(effect, InstanceTag, instance),
          Effect.fnUntraced(function*(exit) {
            if (Exit.isFailure(exit)) {
              const [interrupts, reasons] = Arr.partition(
                exit.cause.reasons,
                Filter.fromPredicate(Cause.isInterruptReason)
              )
              if (interrupts.length === exit.cause.reasons.length) {
                // An interrupt-only exit is never a result: the effect was
                // suspended, preempted or interrupted, so record nothing.
                if (instance.suspended) {
                  parentInstance.suspended = true
                }
                return
              } else if (interrupts.length > 0) {
                exit = Exit.failCause(Cause.fromReasons(reasons))
              }
            }
            yield* engine.deferredDone(self, {
              workflowName: instance.workflow._tag,
              executionId: instance.executionId,
              deferredName: self.name,
              exit
            })
          })
        )
      }
    )
)

/**
 * Runs effects as a durable race, returning a previously persisted result when
 * present or completing a named deferred with the first result.
 *
 * @stability unstable
 * @category racing
 * @since 4.0.0
 */
export const raceAll = <
  const Effects extends NonEmptyReadonlyArray<Effect.Effect<any, any, any>>,
  Success extends Schema.Schema<Effect.Success<Effects[number]>>,
  Error extends Schema.Schema<Effect.Error<Effects[number]>>
>(options: {
  name: string
  success: Success
  error: Error
  effects: Effects
}): Effect.Effect<
  Effect.Success<Effects[number]>,
  Effect.Error<Effects[number]>,
  | Effect.Services<Effects[number]>
  | Success["DecodingServices"]
  | Success["EncodingServices"]
  | Error["DecodingServices"]
  | Error["EncodingServices"]
  | WorkflowEngine
  | WorkflowInstance
> => {
  const deferred = make<any, any>(`raceAll/${options.name}`, {
    success: options.success,
    error: options.error
  })
  return Effect.gen(function*() {
    const engine = yield* EngineTag
    const exit = yield* engine.deferredResult(deferred)
    if (Option.isSome(exit)) {
      return yield* exit.value
    }
    return yield* into(
      Effect.raceAll(options.effects),
      deferred
    )
  })
}

/**
 * Runtime brand identifier for durable deferred tokens.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TokenTypeId = "~effect/workflow/DurableDeferred/Token"

/**
 * Type-level brand identifier for `Token` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TokenTypeId = typeof TokenTypeId

/**
 * Branded string token identifying a durable deferred for a workflow
 * execution.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Token = Brand.Branded<string, TokenTypeId>

/**
 * Schema for branded durable deferred tokens.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Token: Schema.brand<Schema.String, TokenTypeId> = Schema.String.pipe(Schema.brand(TokenTypeId))

/**
 * Schema for a decoded durable deferred token containing the workflow
 * name, execution ID, and deferred name.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class TokenParsed extends Schema.Class<TokenParsed>(
  "effect/workflow/DurableDeferred/TokenParsed"
)({
  workflowName: Schema.String,
  executionId: Schema.String,
  deferredName: Schema.String
}) {
  /**
   * Encodes the parsed workflow, execution, and deferred names back into a token.
   *
   * @stability unstable
   * @since 4.0.0
   */
  get asToken(): Token {
    return Base64Url.encode(
      JSON.stringify([this.workflowName, this.executionId, this.deferredName])
    ) as Token
  }

  /**
   * Schema for decoding and encoding durable deferred tokens as strings.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly FromString = Schema.String.pipe(
    Schema.decodeTo(
      Schema.fromJsonString(
        Schema.Tuple([Schema.String, Schema.String, Schema.String])
      ),
      {
        decode: SchemaGetter.decodeBase64UrlString(),
        encode: SchemaGetter.encodeBase64Url()
      }
    ),
    Schema.decodeTo(TokenParsed, {
      decode: SchemaGetter.transform(
        ([workflowName, executionId, deferredName]) =>
          new TokenParsed({
            workflowName,
            executionId,
            deferredName
          })
      ),
      encode: SchemaGetter.transform(
        (parsed) =>
          [
            parsed.workflowName,
            parsed.executionId,
            parsed.deferredName
          ] as const
      )
    })
  )

  /**
   * Decodes a durable deferred token string into its parsed components.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly fromString = Schema.decodeSync(TokenParsed.FromString)

  /**
   * Encodes parsed durable deferred token components into a token string.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly encode = Schema.encodeSync(TokenParsed.FromString)
}

/**
 * Creates a token for a durable deferred using the current workflow instance's
 * workflow name and execution ID.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const token: <Success extends Schema.Constraint, Error extends Schema.Constraint>(
  self: DurableDeferred<Success, Error>
) => Effect.Effect<Token, never, WorkflowInstance> = Effect.fnUntraced(
  function*<Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>
  ) {
    const instance = yield* InstanceTag
    return tokenFromExecutionId(self, instance)
  }
)

/**
 * Creates a durable deferred token from an explicit workflow, execution ID,
 * and deferred name.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const tokenFromExecutionId: {
  (options: {
    readonly workflow: Workflow.Any
    readonly executionId: string
  }): <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>
  ) => Token
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>,
    options: { readonly workflow: Workflow.Any; readonly executionId: string }
  ): Token
} = dual(
  2,
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly workflow: Workflow.Any
      readonly executionId: string
    }
  ): Token =>
    new TokenParsed({
      workflowName: options.workflow._tag,
      executionId: options.executionId,
      deferredName: self.name
    }).asToken
)

/**
 * Creates a durable deferred token by deriving the workflow execution ID from
 * the supplied workflow payload.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const tokenFromPayload: {
  <W extends Workflow.Any>(options: {
    readonly workflow: W
    readonly payload: Workflow.PayloadSchema<W>["~type.make.in"]
  }): <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>
  ) => Effect.Effect<Token>
  <
    Success extends Schema.Constraint,
    Error extends Schema.Constraint,
    W extends Workflow.Any
  >(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly workflow: W
      readonly payload: Workflow.PayloadSchema<W>["~type.make.in"]
    }
  ): Effect.Effect<Token>
} = dual(
  2,
  <
    Success extends Schema.Constraint,
    Error extends Schema.Constraint,
    W extends Workflow.Any
  >(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly workflow: W
      readonly payload: Workflow.PayloadSchema<W>["~type.make.in"]
    }
  ): Effect.Effect<Token> =>
    Effect.map(options.workflow.executionId(options.payload), (executionId) =>
      tokenFromExecutionId(self, {
        workflow: options.workflow,
        executionId
      }))
)

/**
 * Completes the durable deferred identified by a token with the supplied exit,
 * encoding the result through the deferred schemas.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const done: {
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(options: {
    readonly token: Token
    readonly exit: Exit.Exit<Success["Type"], Error["Type"]>
  }): (
    self: DurableDeferred<Success, Error>
  ) => Effect.Effect<
    void,
    never,
    WorkflowEngine | Success["EncodingServices"] | Error["EncodingServices"]
  >
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly token: Token
      readonly exit: Exit.Exit<Success["Type"], Error["Type"]>
    }
  ): Effect.Effect<
    void,
    never,
    WorkflowEngine | Success["EncodingServices"] | Error["EncodingServices"]
  >
} = dual(
  2,
  Effect.fnUntraced(function*<
    Success extends Schema.Constraint,
    Error extends Schema.Constraint
  >(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly token: Token
      readonly exit: Exit.Exit<Success["Type"], Error["Type"]>
    }
  ) {
    const engine = yield* EngineTag
    const token = TokenParsed.fromString(options.token)
    yield* engine.deferredDone(self, {
      workflowName: token.workflowName,
      executionId: token.executionId,
      deferredName: token.deferredName,
      exit: options.exit
    })
  })
)

/**
 * Completes the durable deferred identified by a token with a successful
 * value.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const succeed: {
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(options: {
    readonly token: Token
    readonly value: Success["Type"]
  }): (
    self: DurableDeferred<Success, Error>
  ) => Effect.Effect<void, never, WorkflowEngine | Success["EncodingServices"]>
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly token: Token
      readonly value: Success["Type"]
    }
  ): Effect.Effect<void, never, WorkflowEngine | Success["EncodingServices"]>
} = dual(
  2,
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly token: Token
      readonly value: Success["Type"]
    }
  ): Effect.Effect<void, never, WorkflowEngine | Success["EncodingServices"]> =>
    done(self, {
      token: options.token,
      exit: Exit.succeed(options.value)
    })
)

/**
 * Completes the durable deferred identified by a token with a typed failure.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const fail: {
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(options: {
    readonly token: Token
    readonly error: Error["Type"]
  }): (
    self: DurableDeferred<Success, Error>
  ) => Effect.Effect<void, never, WorkflowEngine | Error["EncodingServices"]>
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly token: Token
      readonly error: Error["Type"]
    }
  ): Effect.Effect<void, never, WorkflowEngine | Error["EncodingServices"]>
} = dual(
  2,
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly token: Token
      readonly error: Error["Type"]
    }
  ): Effect.Effect<void, never, WorkflowEngine | Error["EncodingServices"]> =>
    done(self, {
      token: options.token,
      exit: Exit.fail(options.error)
    })
)

/**
 * Completes the durable deferred identified by a token with a failure cause.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const failCause: {
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(options: {
    readonly token: Token
    readonly cause: Cause.Cause<Error["Type"]>
  }): (
    self: DurableDeferred<Success, Error>
  ) => Effect.Effect<void, never, WorkflowEngine | Error["EncodingServices"]>
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly token: Token
      readonly cause: Cause.Cause<Error["Type"]>
    }
  ): Effect.Effect<void, never, WorkflowEngine | Error["EncodingServices"]>
} = dual(
  2,
  <Success extends Schema.Constraint, Error extends Schema.Constraint>(
    self: DurableDeferred<Success, Error>,
    options: {
      readonly token: Token
      readonly cause: Cause.Cause<Error["Type"]>
    }
  ): Effect.Effect<void, never, WorkflowEngine | Error["EncodingServices"]> =>
    done(self, {
      token: options.token,
      exit: Exit.failCause(options.cause)
    })
)

import {
  Cause,
  Context,
  Effect,
  Exit,
  References,
  Stream,
  Tracer,
} from 'effect';
import { HttpServerResponse } from 'effect/http';
import {
  isTrpcError,
  statusOf,
  taggedSpec,
  TrpcError,
  withDefined,
  withStatusHint,
  type AnyTrpcError,
} from '../internal/error.ts';
import { errorConstructors, isDeclaredError } from './declared.ts';
import { frameSinks } from './frame-sink.ts';
import type { MiddlewareOpts, ResponseHandle } from './middleware.ts';
import { Response as ResponseKey } from './response.ts';
import type { AnyProcedure, ProcedureInternals } from './procedure.ts';
import {
  inputError,
  isSchema,
  outputError,
  validate,
  validateThen,
  type AnySchema,
} from './schema.ts';
import {
  isStreamSchema,
  type OutputSchema,
  type StreamSchema,
} from './stream-schema.ts';
import { isTracked, tracked } from './tracked.ts';

const unexpectedErrors = new WeakSet<AnyTrpcError>();

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | null)?.then === 'function';

/** Runs user code; only a returned promise makes the call asynchronous. */
const attempt = <A>(fn: () => A | PromiseLike<A>): Effect.Effect<A> =>
  Effect.suspend(() => {
    const ret = fn();
    return isThenable(ret)
      ? Effect.promise(async () => ret)
      : Effect.succeed(ret as A);
  });

/** Wraps a thrown non-`TrpcError` value. Its message is masked in production. @internal */
export function unexpectedError(cause: unknown): AnyTrpcError {
  const err = new TrpcError({
    code: 'INTERNAL_SERVER_ERROR',
    message: cause instanceof Error ? cause.message : 'Internal server error',
    cause,
  });
  unexpectedErrors.add(err);
  return err;
}

/** Whether the error wraps something that was not a `TrpcError`. @internal */
export const isUnexpectedError = (err: AnyTrpcError): boolean =>
  unexpectedErrors.has(err);

/**
 * The one error a failed call surfaces. Failures in the error channel are
 * typed (`defined`) errors. Defects are thrown values: a thrown `TrpcError`
 * keeps its code but is `defined: false` (unless it came from a declared
 * error's constructor), anything else is unexpected.
 * @since 0.1.0
 * @stability stable
 */
export function normalizeCause(cause: Cause.Cause<unknown>): AnyTrpcError {
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason)) {
      return isTrpcError(reason.error)
        ? reason.error
        : unexpectedError(reason.error);
    }
  }
  for (const reason of cause.reasons) {
    if (Cause.isDieReason(reason)) {
      return isTrpcError(reason.defect)
        ? withDefined(reason.defect, isDeclaredError(reason.defect))
        : unexpectedError(reason.defect);
    }
  }
  return new TrpcError({
    code: 'CLIENT_CLOSED_REQUEST',
    message: 'The request was aborted',
  });
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype;

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  typeof value === 'object' && value !== null && Symbol.asyncIterator in value;

/** Typed `TrpcError` failures stay failures; anything else is a defect (02 d.i). */
const refail = <A, R>(
  effect: Effect.Effect<A, unknown, R>,
): Effect.Effect<A, AnyTrpcError, R> =>
  Effect.catchCause(effect, (cause) =>
    Effect.failCause(
      Cause.fromReasons(
        cause.reasons.map((reason) =>
          Cause.isFailReason(reason)
            ? isTrpcError(reason.error)
              ? Cause.makeFailReason(withDefined(reason.error, true))
              : Cause.makeDieReason(reason.error)
            : reason,
        ),
      ) as Cause.Cause<AnyTrpcError>,
    ),
  );

const fail = (err: AnyTrpcError) => Effect.fail(withDefined(err, true));

/**
 * @since 0.1.0
 * @stability stable
 */
export interface CallOpts {
  readonly procedure: AnyProcedure;
  readonly path: string;
  readonly ctx: object;
  /** The deserialized, unvalidated input. */
  readonly input: unknown;
  readonly signal: AbortSignal;
  readonly lastEventId?: string | undefined;
  readonly response?: ResponseHandle | undefined;
  /** An unbatched HTTP call: the procedure may return an `HttpServerResponse`. */
  readonly allowResponse?: boolean | undefined;
  /** The span the call's span is a child of; the fiber's current span otherwise. */
  readonly parent?: Tracer.AnySpan | undefined;
}

/** A resolver's `HttpServerResponse` or web `Response`. @internal */
export const isResponseValue = (
  value: unknown,
): value is HttpServerResponse.HttpServerResponse | globalThis.Response =>
  HttpServerResponse.isHttpServerResponse(value) ||
  (typeof globalThis.Response === 'function' &&
    value instanceof globalThis.Response);

/** @internal */
export const createResponseHandle = (): ResponseHandle => ({
  headers: new Headers(),
  status: undefined,
});

const MIDDLEWARE_CAUSE = Symbol('trpc.middlewareCause');
const RESOLVED = Symbol('trpc.resolved');

interface Resolved {
  readonly [RESOLVED]: unknown;
}
const isResolved = (value: unknown): value is Resolved =>
  typeof value === 'object' && value !== null && RESOLVED in value;

const isOkResult = (value: unknown): value is { ok: true; data: unknown } =>
  typeof value === 'object' &&
  value !== null &&
  (value as { ok?: unknown }).ok === true &&
  'data' in value;

/** Validates declared errors' `data` (07 A). Invalid data is an unexpected error. */
/** The output schema to run, unless it only types the result. */
const validated = (def: ProcedureInternals): OutputSchema | undefined =>
  def.validateOutput === false ? undefined : def.output;

/** A subscription's event schema: `.output(Event)` or `.output(stream(Event))`. */
const eventSchema = (
  output: OutputSchema | undefined,
): AnySchema | undefined =>
  isStreamSchema(output) ? output['~trpc.stream'].item : output;

/**
 * Validates each item of a streamed output, and its return value when the
 * schema has one. Invalid values fail the stream at that point.
 */
function validateItems(
  source: AsyncIterable<unknown, unknown>,
  schema: StreamSchema,
  services: Context.Context<never>,
): AsyncIterable<unknown, unknown> {
  const run = Effect.runPromiseWith(services);
  const streamSchema = schema['~trpc.stream'];
  return {
    async *[Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      let done = false;
      try {
        while (true) {
          const next = await iterator.next();
          if (next.done) {
            done = true;
            return streamSchema.return
              ? await run(
                  validate(streamSchema.return, next.value, outputError),
                )
              : next.value;
          }
          yield await run(validate(streamSchema.item, next.value, outputError));
        }
      } finally {
        if (!done) await iterator.return?.();
      }
    },
  };
}

const checkDeclared = (
  def: ProcedureInternals,
  err: AnyTrpcError,
): Effect.Effect<never, AnyTrpcError> => {
  const spec = def.errors[err.code] ?? taggedSpec(err);
  if (!spec?.data || !err.defined) return Effect.fail(err);
  return validate(spec.data, err.data, () => err).pipe(
    Effect.matchEffect({
      onFailure: () =>
        Effect.die(
          unexpectedError(
            new Error(`The data of the declared ${err.code} error is invalid`),
          ),
        ),
      onSuccess: (data) =>
        Effect.fail(
          data === err.data
            ? err
            : withStatusHint(
                new TrpcError({
                  code: err.code,
                  message: err.message,
                  data,
                  defined: true,
                  cause: err.cause,
                }),
                statusOf(err),
              ),
        ),
    }),
  );
};

/**
 * Runs a call: middleware, inputs, `.provide()` steps, the resolver and
 * output validation. Fails with typed `TrpcError`s; thrown values are
 * defects. A subscription succeeds with a `Stream` of events.
 * @since 0.1.0
 * @stability stable
 */
export function callProcedure(
  opts: CallOpts,
): Effect.Effect<unknown, AnyTrpcError, any> {
  const def = opts.procedure['~trpc'];
  const { path } = opts;
  const { meta, type } = def;
  const response = opts.response ?? createResponseHandle();
  const base: Omit<
    MiddlewareOpts<unknown, unknown, unknown>,
    'ctx' | 'input' | 'next'
  > = {
    meta,
    path,
    type,
    signal: opts.signal,
    response,
  };

  const toResult = (exit: Exit.Exit<unknown, AnyTrpcError>) =>
    Exit.isSuccess(exit)
      ? isResolved(exit.value)
        ? { ok: true, data: exit.value[RESOLVED], [RESOLVED]: exit.value }
        : { ok: true, data: exit.value }
      : {
          ok: false,
          error: normalizeCause(exit.cause),
          [MIDDLEWARE_CAUSE]: exit.cause,
        };

  const fromResult = (
    ret: unknown,
  ): Effect.Effect<unknown, AnyTrpcError, any> => {
    if (isTrpcError(ret)) return fail(ret);
    if (isResolved(ret)) return Effect.succeed(ret[RESOLVED]);
    if (isOkResult(ret)) return Effect.succeed(ret.data);
    if (typeof ret === 'object' && ret !== null && 'ok' in ret) {
      const cause = (ret as { [MIDDLEWARE_CAUSE]?: Cause.Cause<never> })[
        MIDDLEWARE_CAUSE
      ];
      return cause
        ? Effect.failCause(cause)
        : fail((ret as unknown as { error: AnyTrpcError }).error);
    }
    return Effect.die(
      new Error(
        `Middleware on "${path}" must return next(), ok() or a TrpcError`,
      ),
    );
  };

  type NextOpts = { ctx?: object; input?: unknown };
  type Out = Resolved | Effect.Effect<unknown, AnyTrpcError, any>;
  const lift = (out: Out): Effect.Effect<unknown, AnyTrpcError, any> =>
    Effect.isEffect(out) ? out : Effect.succeed(out);

  /**
   * Runs the steps from `i`: synchronously while they are, so a call with
   * no async work makes no fiber steps; an Effect from the first one that
   * isn't. `services` is the fiber's context at this step.
   */
  const run = (
    i: number,
    ctx: object,
    input: unknown,
    services: Context.Context<never>,
  ): Out => {
    const step = def.steps[i];
    if (!step) return resolve(ctx, input, services);
    switch (step.kind) {
      case 'input': {
        let schema = step.arg;
        if (!isSchema(schema)) {
          try {
            schema = (step.arg as (o: unknown) => AnySchema)({
              ctx,
              meta,
              path,
              type,
            });
          } catch (cause) {
            return Effect.die(cause);
          }
        }
        return validateThen(schema, opts.input, inputError, (parsed) =>
          run(
            i + 1,
            ctx,
            isPlainObject(input) && isPlainObject(parsed)
              ? { ...input, ...parsed }
              : parsed,
            services,
          ),
        ) as Out;
      }
      case 'provide': {
        const withValue = (value: unknown) =>
          Effect.provideService(
            lift(
              run(i + 1, ctx, input, Context.add(services, step.key, value)),
            ),
            step.key,
            value,
          );
        const provide = (made: unknown) =>
          Effect.isEffect(made)
            ? Effect.flatMap(
                refail(made as Effect.Effect<unknown, unknown, any>),
                withValue,
              )
            : withValue(made);
        let made: unknown;
        try {
          made = step.make({ ctx, input, meta, path });
        } catch (cause) {
          return Effect.die(cause);
        }
        return isThenable(made)
          ? Effect.flatMap(
              Effect.promise(async () => made),
              provide,
            )
          : provide(made);
      }
      case 'use': {
        // Middleware may provide services to next(); read them there.
        const rest = (o?: NextOpts) =>
          Effect.withFiber((fiber) =>
            lift(
              run(
                i + 1,
                o?.ctx ? { ...ctx, ...o.ctx } : ctx,
                o && 'input' in o ? o.input : input,
                fiber.context as Context.Context<never>,
              ),
            ),
          );
        if (step.effect) {
          const next = (o?: NextOpts) =>
            Effect.map(Effect.exit(rest(o)), toResult);
          return Effect.flatMap(
            Effect.suspend(() =>
              refail(
                step.fn({ ...base, ctx, input, next }) as Effect.Effect<
                  unknown,
                  unknown,
                  any
                >,
              ),
            ),
            fromResult,
          );
        }
        const runNext = Effect.runPromiseExitWith(services);
        const next = async (o?: NextOpts) =>
          toResult(
            await runNext(rest(o) as Effect.Effect<unknown, AnyTrpcError>, {
              signal: opts.signal,
            }),
          );
        return Effect.flatMap(
          attempt(() => step.fn({ ...base, ctx, input, next })),
          fromResult,
        );
      }
    }
  };

  const resolved = (
    value: unknown,
    services: Context.Context<never>,
  ): Resolved => ({ [RESOLVED]: finish(value, services) });

  const afterResolve = (
    ret: unknown,
    services: Context.Context<never>,
  ): Out => {
    if (isTrpcError(ret)) return fail(ret);
    if (Effect.isEffect(ret)) {
      return Effect.flatMap(
        refail(ret as Effect.Effect<unknown, unknown, any>),
        (value) =>
          isTrpcError(value)
            ? fail(value)
            : Effect.succeed(resolved(value, services)),
      );
    }
    return resolved(ret, services);
  };

  const resolve = (
    ctx: object,
    input: unknown,
    services: Context.Context<never>,
  ): Out => {
    const resolver = def.resolver;
    if (!resolver) {
      return Effect.fail(
        new TrpcError({
          code: 'NOT_IMPLEMENTED',
          message: `"${path}" is a contract procedure without an implementation`,
        }),
      );
    }
    let ret: unknown;
    try {
      ret = resolver({
        ...base,
        ctx,
        input,
        errors: errorConstructors(def.errors),
        ...(type === 'subscription' ? { lastEventId: opts.lastEventId } : {}),
      });
    } catch (cause) {
      return Effect.die(cause);
    }
    return isThenable(ret)
      ? Effect.flatMap(
          Effect.promise(async () => ret),
          (value) => lift(afterResolve(value, services)),
        )
      : afterResolve(ret, services);
  };

  /** Turns a resolver's (or an `ok()`'s) value into the call's result. */
  const finish = (
    value: unknown,
    services: Context.Context<never>,
  ): unknown => {
    if (type === 'subscription') {
      return toEventStream(value, services, eventSchema(validated(def)));
    }
    if (Stream.isStream(value)) {
      return Stream.toAsyncIterableWith(
        value as Stream.Stream<unknown, unknown, never>,
        services,
      );
    }
    return value;
  };

  const complete = (
    result: unknown,
    services: Context.Context<never>,
  ): Effect.Effect<unknown, AnyTrpcError, any> => {
    const value = isResolved(result)
      ? result[RESOLVED]
      : finish(result, services);
    if (isResponseValue(value)) {
      if (!opts.allowResponse) {
        return Effect.fail(
          new TrpcError({
            code: 'BAD_REQUEST',
            message: `"${path}" returns a Response, which only an unbatched HTTP call can carry`,
          }),
        );
      }
      return Effect.succeed(
        HttpServerResponse.isHttpServerResponse(value)
          ? value
          : HttpServerResponse.fromWeb(value),
      );
    }
    // Kept frames were validated when the first call streamed them.
    if (frameSinks.get(response)?.replay) return Effect.succeed(value);
    const output = validated(def);
    if (type !== 'subscription' && output) {
      if (!isStreamSchema(output)) {
        return lift(
          validateThen(output, value, outputError, (v) =>
            Effect.succeed(v),
          ) as Out,
        );
      }
      if (!isAsyncIterable(value)) {
        return Effect.fail(
          outputError([
            { message: 'Expected an AsyncIterable or a Stream (stream())' },
          ]),
        );
      }
      return Effect.succeed(validateItems(value, output, services));
    }
    return Effect.succeed(value);
  };

  const call = Effect.withFiber((fiber) => {
    const services = fiber.context as Context.Context<never>;
    const out = run(0, opts.ctx, undefined, services);
    return Effect.isEffect(out)
      ? Effect.flatMap(out, (result) => complete(result, services))
      : complete(out, services);
  }).pipe(
    Effect.catchCause((cause) => {
      for (const reason of cause.reasons) {
        if (Cause.isFailReason(reason) && isTrpcError(reason.error)) {
          return checkDeclared(def, reason.error);
        }
        if (
          Cause.isDieReason(reason) &&
          isTrpcError(reason.defect) &&
          (isDeclaredError(reason.defect) || taggedSpec(reason.defect))
        ) {
          return checkDeclared(def, withDefined(reason.defect, true));
        }
      }
      return Effect.failCause(cause as Cause.Cause<AnyTrpcError>);
    }),
  );
  const name = `trpc.${path}`;
  const untraced = Effect.updateContext(call, (context) =>
    Context.add(context, ResponseKey, response),
  );
  // `withSpan`'s result, but the span, its stack frame and the response
  // handle go in with one context change: each fiber-cached key changed on
  // its own rebuilds the fiber's cache.
  const traced = Effect.useSpan(
    name,
    {
      kind: 'server',
      parent: opts.parent,
      attributes: {
        'rpc.system': 'trpc',
        'rpc.method': path,
        'trpc.type': type,
      },
    },
    (span) =>
      Effect.updateContext(
        Effect.tapError(call, (err) =>
          Effect.sync(() => span.attribute('trpc.error.code', err.code)),
        ),
        (context) =>
          Context.add(
            Context.add(
              Context.add(context, ResponseKey, response),
              Tracer.ParentSpan,
              span,
            ),
            References.CurrentStackFrame,
            {
              name,
              // Its stack would point here, the same line for every procedure.
              stack: noStack,
              parent: Context.get(context, References.CurrentStackFrame),
            },
          ),
      ),
  );
  // A span costs every call, so only an installed tracer opts in to one.
  return Effect.withFiber((fiber) =>
    Context.get(fiber.context, Tracer.Tracer) === Tracer.nativeTracer
      ? untraced
      : traced,
  );
}

const noStack = (): undefined => undefined;

/**
 * `events` as the subscription at `procedure` would emit them: validated
 * by its event schema. For events that skip the resolver (a hibernated
 * publisher subscription).
 * @internal
 */
export const procedureEvents = (
  procedure: AnyProcedure,
  events: Stream.Stream<unknown>,
): Stream.Stream<unknown, AnyTrpcError> =>
  toEventStream(
    events,
    Context.empty(),
    eventSchema(validated(procedure['~trpc'])),
  );

function toEventStream(
  value: unknown,
  services: Context.Context<never>,
  output: AnySchema | undefined,
): Stream.Stream<unknown, AnyTrpcError> {
  let stream: Stream.Stream<unknown, AnyTrpcError, any>;
  if (Stream.isStream(value)) {
    stream = Stream.catchCause(
      value as Stream.Stream<unknown, unknown, any>,
      (cause) => Stream.fromEffect(refail(Effect.failCause(cause))),
    );
  } else if (isAsyncIterable(value)) {
    stream = Stream.orDie(Stream.fromAsyncIterable(value, (cause) => cause));
  } else {
    return Stream.die(
      new Error('A subscription must return an AsyncIterable or a Stream'),
    );
  }
  if (output) {
    stream = Stream.mapEffect(stream, (event) =>
      isTracked(event)
        ? Effect.map(validate(output, event.data, outputError), (data) =>
            tracked(event.id, data),
          )
        : validate(output, event, outputError),
    );
  }
  return Stream.provideContext(stream, services) as Stream.Stream<
    unknown,
    AnyTrpcError
  >;
}

import { Cause, Context, Effect, Exit, Stream } from 'effect';
import {
  isTrpcError,
  taggedSpec,
  TrpcError,
  withDefined,
  type AnyTrpcError,
} from '../internal/error.ts';
import { errorConstructors, isDeclaredError } from './declared.ts';
import type { ResponseHandle } from './middleware.ts';
import type { AnyProcedure, ProcedureInternals } from './procedure.ts';
import {
  inputError,
  isSchema,
  outputError,
  validate,
  type AnySchema,
} from './schema.ts';
import {
  isStreamSchema,
  type OutputSchema,
  type StreamSchema,
} from './stream-schema.ts';
import { isTracked, tracked } from './tracked.ts';

const unexpectedErrors = new WeakSet<AnyTrpcError>();

/** Runs user code; only a returned promise makes the call asynchronous. */
const attempt = <A>(fn: () => A | PromiseLike<A>): Effect.Effect<A> =>
  Effect.suspend(() => {
    const ret = fn();
    return typeof (ret as PromiseLike<A> | null)?.then === 'function'
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
}

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
  const { item, return: returns } = schema['~trpc.stream'];
  return {
    async *[Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      let done = false;
      try {
        while (true) {
          const next = await iterator.next();
          if (next.done) {
            done = true;
            return returns
              ? await run(validate(returns, next.value, outputError))
              : next.value;
          }
          yield await run(validate(item, next.value, outputError));
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
            : new TrpcError({
                code: err.code,
                message: err.message,
                status: err.status,
                data,
                defined: true,
                cause: err.cause,
              }),
        ),
    }),
  );
};

/**
 * Runs a call: middleware, inputs, `.provide()` steps, the resolver and
 * output validation. Fails with typed `TrpcError`s; thrown values are
 * defects. A subscription succeeds with a `Stream` of events.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function callProcedure(
  opts: CallOpts,
): Effect.Effect<unknown, AnyTrpcError, any> {
  const def = opts.procedure['~trpc'];
  const { path, signal } = opts;
  const { meta, type } = def;
  const response = opts.response ?? createResponseHandle();
  const base = { meta, path, type, signal, response };

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
  const run = (
    i: number,
    ctx: object,
    input: unknown,
  ): Effect.Effect<unknown, AnyTrpcError, any> =>
    Effect.suspend(() => {
      const step = def.steps[i];
      if (!step) return resolve(ctx, input);
      switch (step.kind) {
        case 'input':
          return Effect.gen(function* () {
            const schema = isSchema(step.arg)
              ? step.arg
              : yield* Effect.try({
                  try: () =>
                    (step.arg as (o: unknown) => unknown)({
                      ctx,
                      meta,
                      path,
                      type,
                    }),
                  catch: (cause) => cause,
                }).pipe(Effect.orDie);
            const parsed = yield* validate(
              schema as never,
              opts.input,
              inputError,
            );
            return yield* run(
              i + 1,
              ctx,
              isPlainObject(input) && isPlainObject(parsed)
                ? { ...input, ...parsed }
                : parsed,
            );
          });
        case 'provide':
          return Effect.gen(function* () {
            const made = yield* attempt(() =>
              step.make({ ctx, input, meta, path }),
            );
            const value = Effect.isEffect(made)
              ? yield* refail(made as Effect.Effect<unknown, unknown, any>)
              : made;
            return yield* run(i + 1, ctx, input).pipe(
              Effect.provideService(step.key, value),
            );
          });
        case 'use':
          if (step.effect) {
            const next = (o?: NextOpts) =>
              Effect.exit(
                run(
                  i + 1,
                  o?.ctx ? { ...ctx, ...o.ctx } : ctx,
                  o && 'input' in o ? o.input : input,
                ),
              ).pipe(Effect.map(toResult));
            return Effect.suspend(() =>
              refail(
                step.fn({ ...base, ctx, input, next }) as Effect.Effect<
                  unknown,
                  unknown,
                  any
                >,
              ),
            ).pipe(Effect.flatMap(fromResult));
          }
          return Effect.gen(function* () {
            const services = yield* Effect.context<never>();
            const runNext = Effect.runPromiseExitWith(services);
            const next = async (o?: NextOpts) =>
              toResult(
                await runNext(
                  run(
                    i + 1,
                    o?.ctx ? { ...ctx, ...o.ctx } : ctx,
                    o && 'input' in o ? o.input : input,
                  ) as Effect.Effect<unknown, AnyTrpcError>,
                  { signal },
                ),
              );
            const ret: unknown = yield* attempt(() =>
              step.fn({ ...base, ctx, input, next }),
            );
            return yield* fromResult(ret);
          });
      }
    });

  const resolve = (ctx: object, input: unknown) =>
    Effect.gen(function* () {
      const resolver = def.resolver;
      if (!resolver) {
        return yield* Effect.fail(
          new TrpcError({
            code: 'NOT_IMPLEMENTED',
            message: `"${path}" is a contract procedure without an implementation`,
          }),
        );
      }
      let ret: unknown = yield* attempt(() =>
        resolver({
          ...base,
          ctx,
          input,
          errors: errorConstructors(def.errors),
          ...(type === 'subscription' ? { lastEventId: opts.lastEventId } : {}),
        }),
      );
      if (isTrpcError(ret)) return yield* fail(ret);
      if (Effect.isEffect(ret)) {
        ret = yield* refail(ret as Effect.Effect<unknown, unknown, any>);
        if (isTrpcError(ret)) return yield* fail(ret);
      }
      const services = yield* Effect.context<never>();
      return { [RESOLVED]: finish(ret, services) } satisfies Resolved;
    });

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

  return Effect.gen(function* () {
    const result = yield* run(0, opts.ctx, undefined);
    const services = yield* Effect.context<never>();
    const value = isResolved(result)
      ? result[RESOLVED]
      : finish(result, services);
    const output = validated(def);
    if (type !== 'subscription' && output) {
      if (!isStreamSchema(output)) {
        return yield* validate(output, value, outputError);
      }
      if (!isAsyncIterable(value)) {
        return yield* Effect.fail(
          outputError([
            { message: 'Expected an AsyncIterable or a Stream (stream())' },
          ]),
        );
      }
      return validateItems(value, output, services);
    }
    return value;
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
    Effect.tapError((err) =>
      Effect.annotateCurrentSpan('trpc.error.code', err.code),
    ),
    Effect.withSpan(`trpc.${path}`, {
      kind: 'server',
      attributes: {
        'rpc.system': 'trpc',
        'rpc.method': path,
        'trpc.type': type,
      },
    }),
  );
}

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

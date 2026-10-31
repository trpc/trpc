import {
  Cause,
  Channel,
  Context,
  Effect,
  Exit,
  References,
  Stream,
  Tracer,
  type Array as Arr,
  type ManagedRuntime,
} from 'effect';
import { HttpServerResponse } from 'effect/http';
import {
  isBuiltinCode,
  isErrorLike,
  isKeptUntyped,
  isTrpcError,
  keepUntyped,
  statusOf,
  taggedSpec,
  toUntypedError,
  TrpcError,
  withDefined,
  withStatusHint,
  type AnyTrpcError,
  type CodeError,
} from '../../internal/error.ts';
import { returnUnawaited } from '../../internal/effects.ts';
import { errorConstructors } from './declared.ts';
import { CurrentFrameSink } from './frame-sink.ts';
import type {
  MiddlewareOpts,
  ResponseHandle,
  AnyProcedure,
  ProcedureInternals,
} from '../procedures/index.ts';
import { Response as ResponseKey } from './response.ts';
import {
  inputError,
  isSchema,
  outputError,
  validate,
  validateThen,
  type AnySchema,
  isStreamSchema,
  type OutputSchema,
  type StreamSchema,
} from '../validation/index.ts';
import { isTracked, tracked } from '../subscriptions/index.ts';

const unexpectedErrors = new WeakSet<AnyTrpcError>();

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | null)?.then === 'function';

/**
 * Runs Promise middleware; only a returned promise makes the step
 * asynchronous. `signal` aborts when the step's fiber is interrupted, so
 * the `next()` calls it runs on fibers of their own are interrupted too.
 */
const attempt = <A>(
  fn: (signal: AbortSignal) => A | PromiseLike<A>,
): Effect.Effect<A> =>
  Effect.callback<A>((resume, signal) => {
    const ret = fn(signal);
    if (!isThenable(ret)) return resume(Effect.succeed(ret));
    ret.then(
      (value) => resume(Effect.succeed(value as A)),
      (cause) => resume(Effect.die(cause)),
    );
  });

/** Wraps a thrown non-`TrpcError` value. Its message is masked in production. @internal */
export function unexpectedError(
  cause: unknown,
): CodeError<'INTERNAL_SERVER_ERROR'> {
  const err = new TrpcError.InternalServerError({
    message: isErrorLike(cause) ? cause.message : 'Internal server error',
    cause,
  });
  unexpectedErrors.add(err);
  return err;
}

const noServices = /* @__PURE__ */ Effect.succeed(
  /* @__PURE__ */ Context.empty() as Context.Context<any>,
);

/**
 * A runtime's services, built by it on first use. Read on every call, since
 * a disposed runtime swaps its `contextEffect` for a defect: a call then
 * fails instead of running on released resources. A layer that fails to
 * build is a defect, so calls get an unexpected `INTERNAL_SERVER_ERROR`
 * with the layer's error as its `cause`.
 * @internal
 */
export const runtimeServices = (
  runtime: ManagedRuntime.ManagedRuntime<never, unknown> | undefined,
): Effect.Effect<Context.Context<any>> =>
  runtime
    ? Effect.suspend(() =>
        runtime.cachedContext
          ? Effect.succeed(runtime.cachedContext as Context.Context<any>)
          : Effect.orDie(
              runtime.contextEffect as Effect.Effect<
                Context.Context<any>,
                unknown
              >,
            ),
      )
    : noServices;

/** Whether the error wraps something that was not a `TrpcError`. @internal */
export const isUnexpectedError = (err: AnyTrpcError): boolean =>
  unexpectedErrors.has(err);

/**
 * A thrown `TrpcError` that no declaration covers: `defined: false`. A
 * built-in code loses its `data`, which no schema checked. A custom code
 * is unexpected, like any other thrown value, and so masked, unless the
 * procedure declares no errors (see `fromThrown`).
 */
const undeclared = (err: AnyTrpcError): AnyTrpcError => {
  if (isKeptUntyped(err)) return keepUntyped(withDefined(err, false));
  if (!isBuiltinCode(err.code)) return unexpectedError(err);
  return toUntypedError(withDefined(err, false));
};

/**
 * The one error a failed call surfaces. Failures in the error channel are
 * typed (`defined`) errors. Defects are thrown values: a thrown `TrpcError`
 * with a built-in code keeps it but is `defined: false` and loses its
 * `data`, a custom code is kept only from a procedure without `.errors()`,
 * anything else is unexpected. A call's own failures were settled first:
 * a thrown error with a declared code is a failure by then.
 * @since 0.1.0
 * @stability stable
 */
export function normalizeCause(cause: Cause.Cause<unknown>): AnyTrpcError {
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason)) {
      if (!isTrpcError(reason.error)) return unexpectedError(reason.error);
      return reason.error.defined ? reason.error : undeclared(reason.error);
    }
  }
  for (const reason of cause.reasons) {
    if (Cause.isDieReason(reason)) {
      if (!isTrpcError(reason.defect)) return unexpectedError(reason.defect);
      return undeclared(reason.defect);
    }
  }
  return new TrpcError.ClientClosedRequest({
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
const typedCause = (cause: Cause.Cause<unknown>): Cause.Cause<AnyTrpcError> =>
  Cause.fromReasons(
    cause.reasons.map((reason) =>
      Cause.isFailReason(reason)
        ? isTrpcError(reason.error)
          ? Cause.makeFailReason(withDefined(reason.error, true))
          : Cause.makeDieReason(reason.error)
        : reason,
    ),
  ) as Cause.Cause<AnyTrpcError>;

const refail = <A, R>(
  effect: Effect.Effect<A, unknown, R>,
): Effect.Effect<A, AnyTrpcError, R> =>
  Effect.catchCause(effect, (cause) => Effect.failCause(typedCause(cause)));

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
  /** An unbatched HTTP or in-process call: the procedure may return an `HttpServerResponse`. */
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

/**
 * A call's output as an in-process caller gets it: a returned response,
 * which `allowResponse` let through, becomes the web `Response` HTTP would
 * send, the handle's headers under its own. @internal
 */
export const inProcessOutput = (
  value: unknown,
  handle: ResponseHandle,
): Effect.Effect<unknown> =>
  HttpServerResponse.isHttpServerResponse(value)
    ? Effect.map(Effect.context<never>(), (context) => {
        const web = HttpServerResponse.toWeb(value, { context });
        for (const [key, header] of handle.headers) {
          if (key === 'set-cookie') web.headers.append(key, header);
          else if (!web.headers.has(key)) web.headers.set(key, header);
        }
        return web;
      })
    : Effect.succeed(value);

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

/** The output schema to run, unless it only types the result. */
const validated = (def: ProcedureInternals): OutputSchema | undefined =>
  def.validateOutput === false ? undefined : def.output;

/** A subscription's event schema: `.output(Event)` or `.output(stream(Event))`. */
const eventSchema = (
  output: OutputSchema | undefined,
): AnySchema | undefined =>
  isStreamSchema(output) ? output['~trpc.stream'].item : output;

/**
 * A streamed output's items. Its done value is a generator's return
 * value, which a `Stream` has no place for.
 */
type OutputChannel = Channel.Channel<
  Arr.NonEmptyReadonlyArray<unknown>,
  unknown,
  unknown
>;

const OUTPUT = Symbol('trpc.output');

/** A streamed output, as middleware and callers get it. */
interface StreamedOutput extends AsyncIterable<unknown, unknown> {
  readonly [OUTPUT]: OutputChannel;
}

const isStreamedOutput = (value: unknown): value is StreamedOutput =>
  typeof value === 'object' && value !== null && OUTPUT in value;

/**
 * `channel` as an `AsyncIterable`: `Stream.toAsyncIterableWith`'s, which
 * pulls an item per `next()` and closes the source on `return()`, ending
 * as a generator does, with the done value and `return(value)`'s `value`
 * where Effect's ends with `undefined`. The channel stays readable, so
 * output validation extends it instead of iterating this.
 */
const streamedOutput = (
  channel: OutputChannel,
  services: Context.Context<never>,
): StreamedOutput => ({
  [OUTPUT]: channel,
  [Symbol.asyncIterator]() {
    let returned: unknown;
    const iterator = Stream.toAsyncIterableWith(
      Stream.fromChannel(
        Channel.mapDone(channel, (done) => {
          returned = done;
        }),
      ),
      services,
    )[Symbol.asyncIterator]() as Required<AsyncIterator<unknown, unknown>>;
    return {
      next: () =>
        iterator.next().then((next) => {
          if (!next.done) return next;
          const value = returned;
          returned = undefined;
          return { done: true, value };
        }),
      return: (value?: unknown) =>
        iterator.return().then(() => ({ done: true, value })),
      throw: (error: unknown) => iterator.throw(error),
    };
  },
});

/**
 * Validates each item of a streamed output, and its return value when the
 * schema has one. Invalid values fail the stream at that point.
 */
const validateItems = (
  channel: OutputChannel,
  schema: StreamSchema,
): OutputChannel => {
  const streamSchema = schema['~trpc.stream'];
  const items = Channel.mapEffect(
    channel,
    (chunk) =>
      Effect.forEach(chunk, (item) =>
        validate(streamSchema.item, item, outputError),
      ) as Effect.Effect<Arr.NonEmptyReadonlyArray<unknown>, AnyTrpcError>,
  );
  const returns = streamSchema.return;
  return returns
    ? Channel.mapDoneEffect(items, (done) =>
        validate(returns, done, outputError),
      )
    : items;
};

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
                  tag: err._tag,
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

const declaresErrors = (def: ProcedureInternals): boolean =>
  Object.keys(def.errors).length > 0;

type Thrown = 'typed' | 'builtin' | 'kept' | 'masked';

/**
 * What a thrown `TrpcError` is, by what the procedure declares. One with a
 * declared code is typed, with or without its constructor. A built-in code
 * stays built-in. Any other code, a `TrpcError.Tagged` class's too, is sent
 * as it is, untyped, from a procedure without `.errors()`; with them the
 * list is exhaustive, so it is a crash. A throw has no type, so only a
 * declaration makes one typed: clients' types list nothing else.
 */
const classifyThrown = (def: ProcedureInternals, err: AnyTrpcError): Thrown => {
  if (Object.hasOwn(def.errors, err.code)) return 'typed';
  if (isBuiltinCode(err.code)) return 'builtin';
  return declaresErrors(def) ? 'masked' : 'kept';
};

const warned = new Set<string>();

/** Logs `message` once per procedure and code, when `NODE_ENV` is `development`. */
const warnOnce = (
  path: string,
  code: string,
  message: string,
): Effect.Effect<void> => {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.['NODE_ENV'];
  const key = `${path}\0${code}`;
  if (env !== 'development' || warned.has(key)) return Effect.void;
  warned.add(key);
  return Effect.logWarning(message);
};

/**
 * Settles a failed call's cause: typed failures have their declared `data`
 * validated, and thrown `TrpcError`s become what {@link classifyThrown}
 * says, with a development warning when one loses its type.
 */
const settle = (
  def: ProcedureInternals,
  path: string,
  cause: Cause.Cause<unknown>,
): Effect.Effect<never, AnyTrpcError> => {
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason) && isTrpcError(reason.error)) {
      return checkDeclared(def, reason.error);
    }
    if (!Cause.isDieReason(reason) || !isTrpcError(reason.defect)) continue;
    const err = reason.defect;
    const kind = classifyThrown(def, err);
    if (kind === 'typed') return checkDeclared(def, withDefined(err, true));
    if (kind === 'masked') {
      return Effect.andThen(
        warnOnce(
          path,
          err.code,
          `"${path}" threw ${err.code}, which its .errors() don't declare, so clients get INTERNAL_SERVER_ERROR. Declare it, or use one of the declared errors.`,
        ),
        Effect.die(unexpectedError(err)),
      );
    }
    if (kind === 'kept') keepUntyped(err);
    const rethrow = Effect.die(undeclared(err));
    if (def.warnThrown === false) return rethrow;
    const lost =
      kind === 'builtin' && err.data !== undefined
        ? ' and without its data'
        : '';
    return Effect.andThen(
      warnOnce(
        path,
        err.code,
        `"${path}" threw ${err.code}, so clients get it untyped (defined: false)${lost}. Return it (yield* it in an Effect), or declare its code with .errors(), to make it one of the procedure's typed errors: v11's \`throw new TRPCError()\` is \`return error()\` now. Turn this warning off with initTrpc({ warnThrownErrors: false }).`,
      ),
      rethrow,
    );
  }
  return Effect.failCause(cause as Cause.Cause<AnyTrpcError>);
};

/**
 * A streamed output's failure, settled like the resolver's and failing
 * with the error clients get, since nothing normalizes it after.
 */
const settleStreamed = (
  def: ProcedureInternals,
  path: string,
  cause: Cause.Cause<unknown>,
): Effect.Effect<never, AnyTrpcError> =>
  Effect.catchCause(settle(def, path, typedCause(cause)), (settled) =>
    Effect.fail(normalizeCause(settled)),
  );

const isReadableStream = (value: unknown): boolean =>
  typeof ReadableStream === 'function' && value instanceof ReadableStream;

/** What an iterable throws is a defect, as what a resolver throws is. */
const iterableChannel = (
  iterable: AsyncIterable<unknown, unknown>,
): OutputChannel =>
  Channel.orDie(Channel.fromAsyncIterableArray(iterable, (cause) => cause));

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

  /** The cause behind each error a `next()` gave this call's middleware. */
  let nextCauses: WeakMap<AnyTrpcError, Cause.Cause<AnyTrpcError>> | undefined;

  /**
   * A failed `next()`'s error as clients will get it, before `settle`
   * validates declared `data`. Middleware that fails with it again (or
   * returns it) fails with its cause, so it stays what it was.
   */
  const seenByMiddleware = (cause: Cause.Cause<unknown>): AnyTrpcError => {
    const thrown = cause.reasons.some(Cause.isFailReason)
      ? undefined
      : cause.reasons.find(Cause.isDieReason)?.defect;
    let err: AnyTrpcError | undefined;
    if (isTrpcError(thrown)) {
      const kind = classifyThrown(def, thrown);
      if (kind === 'typed') err = withDefined(thrown, true);
      else if (kind === 'kept') keepUntyped(thrown);
    }
    err ??= normalizeCause(cause);
    (nextCauses ??= new WeakMap()).set(err, cause as Cause.Cause<AnyTrpcError>);
    return err;
  };

  const causeOf = (err: unknown) =>
    isTrpcError(err) ? nextCauses?.get(err) : undefined;

  /** A middleware's failure: the cause of an error from `next()`, or typed. */
  const middlewareCause = (
    cause: Cause.Cause<unknown>,
  ): Cause.Cause<AnyTrpcError> => {
    const fromNext = causeOf(cause.reasons.find(Cause.isFailReason)?.error);
    return fromNext ?? typedCause(cause);
  };

  const okResult = (value: unknown) =>
    isResolved(value)
      ? { ok: true, data: value[RESOLVED], [RESOLVED]: value }
      : { ok: true, data: value };

  const toResult = (exit: Exit.Exit<unknown, AnyTrpcError>) =>
    Exit.isSuccess(exit)
      ? okResult(exit.value)
      : { ok: false, error: seenByMiddleware(exit.cause) };

  /** Effect `next()`: interruption stays interruption. */
  const failNext = (cause: Cause.Cause<AnyTrpcError>) =>
    Cause.hasFails(cause) || Cause.hasDies(cause)
      ? Effect.fail(seenByMiddleware(cause))
      : Effect.failCause(cause);

  const failWith = (err: AnyTrpcError) => {
    const cause = causeOf(err);
    return cause ? Effect.failCause(cause) : fail(err);
  };

  const fromResult = (
    ret: unknown,
  ): Effect.Effect<unknown, AnyTrpcError, any> => {
    if (isTrpcError(ret)) return failWith(ret);
    if (isResolved(ret)) return Effect.succeed(ret[RESOLVED]);
    if (isOkResult(ret)) return Effect.succeed(ret.data);
    if (typeof ret === 'object' && ret !== null && 'ok' in ret) {
      return failWith((ret as unknown as { error: AnyTrpcError }).error);
    }
    return Effect.die(
      new Error(
        `Middleware on "${path}" must return next(), ok() or a TrpcError`,
      ),
    );
  };

  // As in `effect/rpc`, Effect code gets a `Scope`; in a query or mutation
  // it closes when the step that asked for it ends. A subscription's would
  // have to outlive the call, so it gets none.
  const scoped = <A, E>(
    effect: Effect.Effect<A, E, any>,
  ): Effect.Effect<A, E, any> =>
    type === 'subscription' ? effect : Effect.scoped(effect);

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
            ? scoped(
                Effect.flatMap(
                  refail(made as Effect.Effect<unknown, unknown, any>),
                  withValue,
                ),
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
              Effect.promise(() => made),
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
            Effect.map(Effect.catchCause(rest(o), failNext), okResult);
          return scoped(
            Effect.flatMap(
              Effect.catchCause(
                Effect.suspend(
                  () =>
                    step.fn({ ...base, ctx, input, next }) as Effect.Effect<
                      unknown,
                      unknown,
                      any
                    >,
                ),
                (cause) => Effect.failCause(middlewareCause(cause)),
              ),
              fromResult,
            ),
          );
        }
        const runNext = Effect.runPromiseExitWith(services);
        return Effect.flatMap(
          attempt((signal) =>
            step.fn({
              ...base,
              ctx,
              input,
              next: async (o?: NextOpts) =>
                toResult(
                  await runNext(
                    rest(o) as Effect.Effect<unknown, AnyTrpcError>,
                    { signal },
                  ),
                ),
            }),
          ),
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
        refail(scoped(ret as Effect.Effect<unknown, unknown, any>)),
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
        new TrpcError.NotImplemented({
          tag: 'ProcedureNotImplemented',
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
          Effect.promise(() => ret),
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
      return Stream.catchCause(
        toEventStream(value, services, eventSchema(validated(def))),
        (cause) => Stream.fromEffect(settle(def, path, cause)),
      );
    }
    const source = Stream.isStream(value)
      ? Stream.toChannel(value as Stream.Stream<unknown, unknown, never>)
      : isAsyncIterable(value) && !isReadableStream(value)
        ? iterableChannel(value)
        : undefined;
    if (!source) return value;
    return streamedOutput(
      Channel.catchCause(source, (cause) =>
        Channel.fromEffectDone(settleStreamed(def, path, cause)),
      ),
      services,
    );
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
          new TrpcError.BadRequest({
            tag: 'UnsupportedResponse',
            message: `"${path}" returns a Response, which only an unbatched HTTP call or an in-process call can carry`,
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
    if (Context.get(services, CurrentFrameSink)?.replay) {
      return Effect.succeed(value);
    }
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
      const channel = isStreamedOutput(value)
        ? value[OUTPUT]
        : iterableChannel(value);
      return Effect.succeed(
        streamedOutput(validateItems(channel, output), services),
      );
    }
    return Effect.succeed(value);
  };

  const call = Effect.withFiber((fiber) => {
    const services = fiber.context as Context.Context<never>;
    const out = run(0, opts.ctx, undefined, services);
    return Effect.isEffect(out)
      ? Effect.flatMap(out, (result) => complete(result, services))
      : complete(out, services);
  }).pipe(Effect.catchCause((cause) => settle(def, path, cause)));
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
    stream = Stream.orDie(
      Stream.fromAsyncIterable(returnUnawaited(value), (cause) => cause),
    );
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

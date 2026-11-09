/**
 * Procedures as plain async functions (15 Q15.2, Q15.3), for React Server
 * Actions in Next, TanStack Start or any React Server Components setup. A
 * factory sets the ctx, services and result mode once, typed by the `t` the
 * procedures are built with.
 *
 * @example
 * ```ts
 * 'use server';
 * import { experimental_createAction } from '@trpc12/trpc/actions';
 *
 * const action = experimental_createAction(t, { ctx: createContext });
 * export const createPost = action(appRouter.post.create);
 *
 * // <form action={createPost}>, or createPost({ title })
 * const { data, error } = await createPost(formData);
 * ```
 * @module
 */
import { Effect, Exit } from 'effect';
import type { SafeResult } from '../client/client.ts';
import type { ClientError } from '../client/types.ts';
import { inputJsonSchema } from '../internal/describe.ts';
import { interruptSignal } from '../internal/effects.ts';
import {
  frameworkError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { JsonSchema } from '../internal/json-schema.ts';
import type {
  ProgressiveJsonForm,
  MaybePromise,
  ProcedureType,
} from '../internal/types.ts';
import {
  experimental_parseBracketNotation,
  experimental_coerceBySchema,
} from '../openapi/rest/index.ts';
import {
  callProcedure,
  isUnexpectedError,
  normalizeCause,
  runtimeServices,
} from '../server/execution/index.ts';
import type { RuntimeOption } from '../server/handler/index.ts';
import type {
  AnyProcedure,
  DefCtx,
  DefServices,
  Procedure,
  ProcedureDef,
  TrpcRoot,
} from '../server/procedures/index.ts';

/**
 * `'safe'` returns the error instead of throwing it: an action's
 * {@link ActionSafeResult}, a callable's `safe()` result. `'throw'` returns
 * the data and throws `TrpcError`.
 * @since 0.1.0
 * @stability experimental
 */
export type ActionResultMode = 'safe' | 'throw';

/**
 * Options for {@link experimental_createAction} and {@link experimental_createCallable}.
 * @since 0.1.0
 * @stability experimental
 */
export type CreateActionOptions<
  TCtx extends object,
  TServices,
  TMode extends ActionResultMode,
> = CreateActionBaseOptions<TCtx, TMode> & RuntimeOption<TServices>;

/**
 * {@link CreateActionOptions} without `runtime`, which provides the
 * services of procedures that need them. The caller owns the runtime: make
 * it once with `ManagedRuntime.make(layer)`, share it between factories,
 * and dispose it when done.
 * @since 0.1.0
 * @stability experimental
 */
export interface CreateActionBaseOptions<
  TCtx extends object,
  TMode extends ActionResultMode,
> {
  /** The ctx, or a function that makes it per call (reading cookies, say). */
  ctx?: TCtx | (() => MaybePromise<TCtx>);
  /** @default 'safe' */
  result?: TMode;
  /**
   * Send unexpected errors' messages to the caller. Server action results
   * reach the browser, so this is off in production, as in handlers.
   * @default NODE_ENV is 'development' or 'test'
   */
  exposeUnexpectedErrors?: boolean;
  /** Called with every error, before masking. */
  onError?: (opts: { error: AnyTrpcError; input: unknown }) => void;
}

/**
 * A `TrpcError`'s fields as a plain object. React sends an action's result
 * to the browser, where an `Error` would arrive without its class or `data`.
 * `code` and `defined` narrow it as they do the error; built-in errors have
 * no `data`.
 * @since 0.1.0
 * @stability experimental
 */
export type ActionError<E> = E extends {
  readonly code: infer C;
  readonly data: infer D;
  readonly defined: infer F;
}
  ? {
      readonly code: C;
      readonly message: string;
      readonly defined: F;
    } & ([D] extends [undefined]
      ? { readonly data?: undefined }
      : { readonly data: D })
  : never;

/**
 * An action's result with `result: 'safe'`: `{ data }` or `{ error }`, plain
 * objects that survive React's Server Action serialization.
 * @example
 * ```ts
 * const { data, error } = await createPost(formData);
 * if (error) return error.defined && error.code === 'FORBIDDEN' ? 'Sign in' : error.message;
 * data.title;
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export type ActionSafeResult<T, E> =
  | { readonly data: T; readonly error?: undefined }
  | { readonly data?: undefined; readonly error: ActionError<E> };

/**
 * What an action resolves to.
 * @since 0.1.0
 * @stability experimental
 */
export type ActionResult<
  TDef extends ProcedureDef,
  TMode extends ActionResultMode,
> = TMode extends 'throw'
  ? TDef['output']
  : ActionSafeResult<
      TDef['output'],
      ClientError<TDef['errors'], ProgressiveJsonForm, never>
    >;

/**
 * What a callable resolves to: with `result: 'safe'`, `safe()`'s
 * `[data, error]` / `{ data, error }` with the `TrpcError` itself.
 * @since 0.1.0
 * @stability experimental
 */
export type CallableResult<
  TDef extends ProcedureDef,
  TMode extends ActionResultMode,
> = TMode extends 'throw'
  ? TDef['output']
  : SafeResult<
      TDef['output'],
      ClientError<TDef['errors'], ProgressiveJsonForm, never>
    >;

type Args<TInput> = undefined extends TInput
  ? [input?: TInput]
  : [input: TInput];

/**
 * A procedure as a function. It also takes `FormData`, parsed with bracket
 * notation (`tags[]=a&user[name]=ada`) and coerced from the input schema,
 * and React's `useActionState` arguments: the previous state, then the input.
 * @example
 * ```ts
 * const [result, submit, isPending] = useActionState(createPost, undefined);
 * // <form action={submit}>
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export interface Action<
  TDef extends ProcedureDef,
  TMode extends ActionResultMode,
> {
  (...args: Args<TDef['input'] | FormData>): Promise<ActionResult<TDef, TMode>>;
  /**
   * `useActionState`'s call: the previous state, which is ignored, then the
   * input or `FormData`. The state starts `undefined`.
   */
  (
    state: ActionResult<TDef, TMode> | undefined,
    payload: TDef['input'] | FormData,
  ): Promise<ActionResult<TDef, TMode> | undefined>;
}

/**
 * A procedure as a function, for calls with typed input.
 * @since 0.1.0
 * @stability experimental
 */
export type Callable<
  TDef extends ProcedureDef,
  TMode extends ActionResultMode,
> = (...args: Args<TDef['input']>) => Promise<CallableResult<TDef, TMode>>;

/**
 * Why a procedure can't be wrapped by a factory, as a rest-argument error.
 * @internal
 */
type Fits<
  TDef extends ProcedureDef,
  TType extends ProcedureType,
  TRootCtx,
  TCtx,
  TServices,
> = TType extends 'query' | 'mutation'
  ? TCtx extends TRootCtx & DefCtx<TDef>
    ? [DefServices<TDef>] extends [never]
      ? []
      : [DefServices<TDef>] extends [TServices]
        ? []
        : [
            error: 'The factory runtime does not provide the services this procedure needs',
          ]
    : [
        error: "The factory ctx does not satisfy the root's ctx and this procedure's",
      ]
  : [error: 'Subscriptions cannot be actions'];

const isDev = () => {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.['NODE_ENV'];
  return env === 'development' || env === 'test';
};

const schemas = new WeakMap<AnyProcedure, JsonSchema | undefined>();
const inputSchemaOf = (procedure: AnyProcedure) => {
  if (!schemas.has(procedure)) {
    let schema: JsonSchema | undefined;
    try {
      schema = inputJsonSchema(procedure['~trpc']);
    } catch {
      // No JSON Schema for this input: its form values stay strings.
    }
    schemas.set(procedure, schema);
  }
  return schemas.get(procedure);
};

/** Framework fields like Next's `$ACTION_ID_…` are not input. */
const fromFormData = (procedure: AnyProcedure, form: FormData) =>
  experimental_coerceBySchema(
    experimental_parseBracketNotation(
      [...form.entries()].filter(([key]) => !key.startsWith('$ACTION')),
    ),
    inputSchemaOf(procedure),
  );

/** A `safe()` result, with the `TrpcError` itself. */
const dualResult = (data: unknown, error: AnyTrpcError | undefined) =>
  Object.assign([data, error], { data, error });

/** Plain objects: React drops an array's extra fields and an error's class. */
const plainResult = (data: unknown, error: AnyTrpcError | undefined) =>
  error === undefined
    ? { data }
    : {
        error: {
          code: error.code,
          message: error.message,
          defined: error.defined,
          ...(error.data === undefined ? {} : { data: error.data }),
        },
      };

function makeFactory<TMode extends ActionResultMode>(
  opts: CreateActionOptions<object, never, TMode> = {},
  toResult: (data: unknown, error: AnyTrpcError | undefined) => unknown,
) {
  const mode: ActionResultMode = opts.result ?? 'safe';
  const expose = opts.exposeUnexpectedErrors ?? isDev();
  const services = runtimeServices(opts.runtime);
  const publicError = (err: AnyTrpcError): AnyTrpcError =>
    isUnexpectedError(err) && !expose
      ? new TrpcError.InternalServerError({ message: 'Internal server error' })
      : err;

  return (procedure: AnyProcedure) =>
    async (...args: unknown[]): Promise<unknown> => {
      const raw = args.length > 1 ? args[1] : args[0];
      const input =
        raw instanceof FormData ? fromFormData(procedure, raw) : raw;
      const ctx = typeof opts.ctx === 'function' ? await opts.ctx() : opts.ctx;
      const exit = await Effect.runPromiseExit(
        Effect.flatMap(
          Effect.zip(services, interruptSignal()),
          ([context, interrupt]) =>
            interrupt.abortOnInterrupt(
              Effect.provideContext(
                callProcedure({
                  procedure,
                  path: '',
                  ctx: ctx ?? {},
                  input,
                  signal: interrupt.signal,
                }),
                context,
              ),
            ),
        ),
      );
      if (Exit.isSuccess(exit)) {
        return mode === 'throw' ? exit.value : toResult(exit.value, undefined);
      }
      const error = normalizeCause(exit.cause);
      const signal = frameworkError(error);
      if (signal !== undefined) throw signal;
      opts.onError?.({ error, input });
      const masked = publicError(error);
      if (mode === 'throw') throw masked;
      return toResult(undefined, masked);
    };
}

/**
 * Creates `action(procedure)`, which turns a query or mutation into an
 * async function for a React Server Action: it takes the input or a form's
 * `FormData`. The ctx, runtime and result mode are set once here, and `t`
 * (the procedures' root) types the ctx: a procedure's type leaves its
 * root ctx out. With
 * `result: 'safe'` it resolves to `{ data }` or `{ error }`
 * ({@link ActionSafeResult}), plain objects React can send to the browser.
 *
 * @example
 * ```ts
 * const action = experimental_createAction(t, { ctx: async () => ({ user: await auth() }) });
 * export const createPost = action(appRouter.post.create);
 * const { data, error } = await createPost(formData);
 *
 * const strict = experimental_createAction(t, { ctx: createContext, result: 'throw' });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_createAction<
  TRootCtx extends object,
  TCtx extends object = {},
  TServices = never,
  TMode extends ActionResultMode = 'safe',
>(
  _root: TrpcRoot<TRootCtx, any, any>,
  opts?: CreateActionOptions<TCtx, TServices, TMode>,
): <TDef extends ProcedureDef, TType extends ProcedureType>(
  procedure: Procedure<TDef, TType>,
  ...fits: Fits<TDef, TType, TRootCtx, TCtx, TServices>
) => Action<TDef, TMode> {
  return makeFactory(opts as never, plainResult) as never;
}

/**
 * Like {@link experimental_createAction}, for direct calls with typed input (no
 * `FormData`): server components, route loaders, scripts. Its results stay
 * on the server, so `result: 'safe'` resolves to `safe()`'s result, with the
 * `TrpcError` itself.
 *
 * @example
 * ```ts
 * const callable = experimental_createCallable(t, { ctx: createContext, result: 'throw' });
 * const byId = callable(appRouter.post.byId);
 * const post = await byId({ id: '1' });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_createCallable<
  TRootCtx extends object,
  TCtx extends object = {},
  TServices = never,
  TMode extends ActionResultMode = 'safe',
>(
  _root: TrpcRoot<TRootCtx, any, any>,
  opts?: CreateActionOptions<TCtx, TServices, TMode>,
): <TDef extends ProcedureDef, TType extends ProcedureType>(
  procedure: Procedure<TDef, TType>,
  ...fits: Fits<TDef, TType, TRootCtx, TCtx, TServices>
) => Callable<TDef, TMode> {
  return makeFactory(opts as never, dualResult) as never;
}

/**
 * Procedures as plain async functions (15 Q15.2, Q15.3), for React Server
 * Actions in Next, TanStack Start or any React Server Components setup. A
 * factory sets the ctx, services and result mode once.
 *
 * @example
 * ```ts
 * 'use server';
 * import { experimental_createAction } from '@trpc12/trpc/actions';
 *
 * const action = experimental_createAction({ ctx: createContext });
 * export const createPost = action(appRouter.post.create);
 *
 * // <form action={createPost}>, or createPost({ title })
 * const [post, error] = await createPost(formData);
 * ```
 * @module
 */
import { Context, Effect, Exit, ManagedRuntime, type Layer } from 'effect';
import type { SafeResult } from '../client/client.ts';
import type { ClientError } from '../client/types.ts';
import { inputJsonSchema } from '../internal/describe.ts';
import {
  frameworkError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { JsonSchema } from '../internal/json-schema.ts';
import type { MaybePromise } from '../internal/types.ts';
import { experimental_parseBracketNotation } from '../openapi/bracket.ts';
import { experimental_coerceBySchema } from '../openapi/coerce.ts';
import {
  callProcedure,
  isUnexpectedError,
  normalizeCause,
} from '../server/execute.ts';
import type {
  AnyProcedure,
  Procedure,
  ProcedureDef,
} from '../server/procedure.ts';

/**
 * `'safe'` returns `safe()`'s `[data, error]` / `{ data, error }` result;
 * `'throw'` returns the data and throws `TrpcError`.
 * @since 0.1.0
 * @stability experimental
 */
export type ActionResultMode = 'safe' | 'throw';

/**
 * Options for {@link experimental_createAction} and {@link experimental_createCallable}.
 * @since 0.1.0
 * @stability experimental
 */
export interface CreateActionOptions<
  TCtx extends object,
  TServices,
  TMode extends ActionResultMode,
> {
  /** The ctx, or a function that makes it per call (reading cookies, say). */
  ctx?: TCtx | (() => MaybePromise<TCtx>);
  /** Built once for the factory, for procedures that need services. */
  layer?: Layer.Layer<TServices, any, never>;
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
 * What a wrapped procedure resolves to.
 * @since 0.1.0
 * @stability experimental
 */
export type ActionResult<
  TDef extends ProcedureDef,
  TMode extends ActionResultMode,
> = TMode extends 'throw'
  ? TDef['output']
  : SafeResult<TDef['output'], ClientError<TDef['errors']>>;

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
> = (...args: Args<TDef['input']>) => Promise<ActionResult<TDef, TMode>>;

/**
 * Why a procedure can't be wrapped by a factory, as a rest-argument error.
 * @internal
 */
type Fits<TDef extends ProcedureDef, TCtx, TServices> = TDef['type'] extends
  | 'query'
  | 'mutation'
  ? TCtx extends TDef['ctx']
    ? [TDef['services']] extends [never]
      ? []
      : [TDef['services']] extends [TServices]
        ? []
        : [
            error: 'The factory layer does not provide the services this procedure needs',
          ]
    : [error: "The factory ctx does not satisfy this procedure's ctx"]
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
    } catch {}
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

function makeFactory<TMode extends ActionResultMode>(
  opts: CreateActionOptions<object, unknown, TMode>,
) {
  const mode: ActionResultMode = opts.result ?? 'safe';
  const expose = opts.exposeUnexpectedErrors ?? isDev();
  const runtime = opts.layer ? ManagedRuntime.make(opts.layer) : undefined;
  let services: Promise<Context.Context<any>> | undefined;
  const getServices = () =>
    (services ??= runtime
      ? runtime.context()
      : Promise.resolve(Context.empty() as Context.Context<any>));
  const publicError = (err: AnyTrpcError): AnyTrpcError =>
    isUnexpectedError(err) && !expose
      ? new TrpcError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        })
      : err;

  return (procedure: AnyProcedure) =>
    async (...args: unknown[]): Promise<unknown> => {
      const raw = args.length > 1 ? args[1] : args[0];
      const input =
        raw instanceof FormData ? fromFormData(procedure, raw) : raw;
      const ctx = typeof opts.ctx === 'function' ? await opts.ctx() : opts.ctx;
      const exit = await Effect.runPromiseExitWith(await getServices())(
        callProcedure({
          procedure,
          path: '',
          ctx: ctx ?? {},
          input,
          signal: new AbortController().signal,
        }),
      );
      if (Exit.isSuccess(exit)) {
        if (mode === 'throw') return exit.value;
        return Object.assign([exit.value, undefined], {
          data: exit.value,
          error: undefined,
        });
      }
      const error = normalizeCause(exit.cause);
      const signal = frameworkError(error);
      if (signal !== undefined) throw signal;
      opts.onError?.({ error, input });
      const masked = publicError(error);
      if (mode === 'throw') throw masked;
      return Object.assign([undefined, masked], {
        data: undefined,
        error: masked,
      });
    };
}

/**
 * Creates `action(procedure)`, which turns a query or mutation into an
 * async function for a React Server Action: it takes the input or a form's
 * `FormData`. The ctx, layer and result mode are set once here.
 *
 * @example
 * ```ts
 * const action = experimental_createAction({ ctx: async () => ({ user: await auth() }) });
 * export const createPost = action(appRouter.post.create);
 * const { data, error } = await createPost(formData);
 *
 * const strict = experimental_createAction({ ctx: createContext, result: 'throw' });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_createAction<
  TCtx extends object = {},
  TServices = never,
  TMode extends ActionResultMode = 'safe',
>(
  opts: CreateActionOptions<TCtx, TServices, TMode> = {},
): <TDef extends ProcedureDef>(
  procedure: Procedure<TDef>,
  ...fits: Fits<TDef, TCtx, TServices>
) => Action<TDef, TMode> {
  return makeFactory(opts as never) as never;
}

/**
 * Like {@link experimental_createAction}, for direct calls with typed input (no
 * `FormData`): server components, route loaders, scripts.
 *
 * @example
 * ```ts
 * const callable = experimental_createCallable({ ctx: createContext, result: 'throw' });
 * const byId = callable(appRouter.post.byId);
 * const post = await byId({ id: '1' });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_createCallable<
  TCtx extends object = {},
  TServices = never,
  TMode extends ActionResultMode = 'safe',
>(
  opts: CreateActionOptions<TCtx, TServices, TMode> = {},
): <TDef extends ProcedureDef>(
  procedure: Procedure<TDef>,
  ...fits: Fits<TDef, TCtx, TServices>
) => Callable<TDef, TMode> {
  return makeFactory(opts as never) as never;
}

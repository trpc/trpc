/**
 * Runtime + type prototype for 05 (b)/(d): inputs accept Standard Schema or
 * Effect Schema, and the only function form is `.input(({ ctx }) => schema)`.
 * It also tries two ways to reach `ctx` without a callback:
 *
 * - an AsyncLocalStorage accessor that any library's refinements can call;
 * - Effect Schema checks that require services, provided from `ctx`.
 *
 * Middleware is simplified to "return a ctx extension" (06 owns the real
 * shape), and `provideService` stands in for 06 (g)'s service-providing Effect
 * middleware. None of this is decided API.
 */
/// <reference types="node" />
import { AsyncLocalStorage } from 'node:async_hooks';
import { Context, Effect, Schema, SchemaIssue } from 'effect';

// --- schemas ----------------------------------------------------------------------

export interface StandardIssue {
  readonly message: string;
  readonly path?:
    ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}
type StandardResult<O> =
  | { readonly value: O; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardIssue> };

export interface StandardSchemaV1<I = unknown, O = I> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardResult<O> | Promise<StandardResult<O>>;
    readonly types?: { readonly input: I; readonly output: O } | undefined;
  };
}

export type AnySchema = StandardSchemaV1<any, any> | Schema.Top;

export interface InputOpts<TCtx, TMeta> {
  readonly ctx: TCtx;
  readonly meta: TMeta;
  readonly path: string;
}
export type InputFn<TCtx, TMeta> = (opts: InputOpts<TCtx, TMeta>) => AnySchema;

type InOf<S> = S extends Schema.Top
  ? S['Encoded']
  : S extends StandardSchemaV1<infer I, any>
    ? I
    : never;
type OutOf<S> = S extends Schema.Top
  ? S['Type']
  : S extends StandardSchemaV1<any, infer O>
    ? O
    : never;
type ServicesOf<S> = S extends Schema.Top ? S['DecodingServices'] : never;

// --- helpers ----------------------------------------------------------------------

declare const unset: unique symbol;
export type Unset = typeof unset;

export interface TypeError<TMessage extends string, TDetail = never> {
  readonly '~typeError': TMessage;
  readonly '~detail': TDetail;
}

type MaybePromise<T> = T | Promise<T>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type Overwrite<A, B> = Simplify<Omit<A, keyof B> & B>;
type Merge<TPrev, TNext> = TPrev extends Unset
  ? TNext
  : Simplify<TPrev & TNext>;
type Value<T> = T extends Unset ? undefined : T;

/** `unknown` when the schema's services are provided earlier in the chain. */
type ServicesCheck<TProvided, S> = [Exclude<ServicesOf<S>, TProvided>] extends [
  never,
]
  ? unknown
  : TypeError<
      'input schema needs services this procedure does not provide',
      Exclude<ServicesOf<S>, TProvided>
    >;

// --- errors -----------------------------------------------------------------------

export class TrpcError extends Error {
  readonly code: 'BAD_REQUEST' | 'INTERNAL_SERVER_ERROR';
  readonly issues: ReadonlyArray<StandardIssue> | undefined;
  constructor(opts: {
    code: TrpcError['code'];
    message: string;
    issues?: ReadonlyArray<StandardIssue>;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.code = opts.code;
    this.issues = opts.issues;
  }
}

// --- the AsyncLocalStorage accessor ------------------------------------------------

const inputStore = new AsyncLocalStorage<InputOpts<unknown, unknown>>();

/**
 * Reads the `ctx` of the procedure whose input is being validated. Only works
 * inside a refinement that tRPC runs; anywhere else (a form on the client, a
 * unit test calling `schema.parse`) it throws.
 */
export function inputContext<TCtx = unknown, TMeta = unknown>(): InputOpts<
  TCtx,
  TMeta
> {
  const store = inputStore.getStore();
  if (!store) {
    throw new Error('inputContext() called outside tRPC input validation');
  }
  return store as InputOpts<TCtx, TMeta>;
}

// --- builder ----------------------------------------------------------------------

type Step =
  | {
      readonly kind: 'use';
      readonly fn: (opts: {
        ctx: any;
        input: unknown;
        meta: unknown;
      }) => MaybePromise<object>;
    }
  | { readonly kind: 'input'; readonly arg: AnySchema | InputFn<any, any> }
  | {
      readonly kind: 'service';
      readonly key: Context.Key<any, any>;
      readonly make: (ctx: any) => unknown;
    };

export interface Procedure<TInputIn, TOutput> {
  readonly '~types': { input: TInputIn; output: TOutput };
  readonly '~def': {
    readonly steps: ReadonlyArray<Step>;
    readonly meta: unknown;
    readonly resolver: (opts: { ctx: any; input: any }) => unknown;
  };
}

export interface ProcedureBuilder<TCtx, TMeta, TServices, TInputIn, TInput> {
  readonly '~steps': ReadonlyArray<Step>;

  use<$Ctx extends object>(
    fn: (opts: {
      ctx: TCtx;
      input: Value<TInput>;
      meta: TMeta;
    }) => MaybePromise<$Ctx>,
  ): ProcedureBuilder<
    Overwrite<TCtx, $Ctx>,
    TMeta,
    TServices,
    TInputIn,
    TInput
  >;

  /** Stand-in for 06 (g): an Effect middleware that provides a service. */
  provideService<$Id, $Shape>(
    key: Context.Key<$Id, $Shape>,
    make: (ctx: TCtx) => $Shape,
  ): ProcedureBuilder<TCtx, TMeta, TServices | $Id, TInputIn, TInput>;

  /**
   * A callback that returns either kind of schema. There are no other function
   * forms, so a function that is not an Effect Schema always means "callback".
   */
  input<$S extends AnySchema>(
    fn: (opts: InputOpts<TCtx, TMeta>) => $S & ServicesCheck<TServices, $S>,
  ): ProcedureBuilder<
    TCtx,
    TMeta,
    TServices,
    Merge<TInputIn, InOf<$S>>,
    Merge<TInput, OutOf<$S>>
  >;
  /**
   * A Standard Schema or an Effect Schema (including `Schema.Class`). Last, so
   * that TS reports this overload's error, as it's the common case.
   */
  input<$S extends AnySchema>(
    schema: $S & ServicesCheck<TServices, $S>,
  ): ProcedureBuilder<
    TCtx,
    TMeta,
    TServices,
    Merge<TInputIn, InOf<$S>>,
    Merge<TInput, OutOf<$S>>
  >;

  /** The ALS accessor, typed by the `ctx` at this point in the chain. */
  inputContext(): InputOpts<TCtx, TMeta>;

  query<$Out>(
    fn: (opts: { ctx: TCtx; input: Value<TInput> }) => MaybePromise<$Out>,
  ): Procedure<Value<TInputIn>, $Out>;
}

function createBuilder(
  steps: ReadonlyArray<Step>,
  meta: unknown,
): ProcedureBuilder<any, any, any, any, any> {
  return {
    '~steps': steps,
    use: (fn) => createBuilder([...steps, { kind: 'use', fn }], meta),
    provideService: (key, make) =>
      createBuilder([...steps, { kind: 'service', key, make }], meta),
    input: (arg: AnySchema | InputFn<any, any>) =>
      createBuilder([...steps, { kind: 'input', arg }], meta),
    inputContext: () => inputContext(),
    query: (resolver) => ({
      '~types': undefined as never,
      '~def': { steps, meta, resolver },
    }),
  };
}

export function initTrpc<
  TConfig extends { ctx: object; meta?: object },
>(opts?: {
  meta?: TConfig['meta'];
}): {
  procedure: ProcedureBuilder<
    TConfig['ctx'],
    TConfig['meta'] extends object ? TConfig['meta'] : {},
    never,
    Unset,
    Unset
  >;
} {
  return { procedure: createBuilder([], opts?.meta ?? {}) };
}

// --- execution --------------------------------------------------------------------

const formatEffectIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/** Effect Schema classes and ArkType types are functions too. */
const isSchema = (arg: AnySchema | InputFn<any, any>): arg is AnySchema =>
  typeof arg !== 'function' || Schema.isSchema(arg) || '~standard' in arg;

function resolveSchema(
  arg: AnySchema | InputFn<any, any>,
  opts: InputOpts<unknown, unknown>,
): Effect.Effect<AnySchema, TrpcError> {
  if (isSchema(arg)) return Effect.succeed(arg);
  return Effect.try({
    try: () => arg(opts),
    catch: (cause) =>
      new TrpcError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'input callback threw',
        cause,
      }),
  });
}

function validate(
  schema: AnySchema,
  value: unknown,
  services: Context.Context<never>,
  opts: InputOpts<unknown, unknown>,
): Effect.Effect<unknown, TrpcError> {
  if (Schema.isSchema(schema)) {
    return Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.provideContext(services as Context.Context<unknown>),
      Effect.mapError(
        (error) =>
          new TrpcError({
            code: 'BAD_REQUEST',
            message: 'input validation failed',
            issues: formatEffectIssues(error.issue).issues,
          }),
      ),
    ) as Effect.Effect<unknown, TrpcError>;
  }
  return Effect.tryPromise({
    // `run` at the call site, rather than relying on propagation from the
    // request entry, so the store is the ctx at this step of the chain.
    try: async () =>
      inputStore.run(opts, () => schema['~standard'].validate(value)),
    catch: (cause) =>
      new TrpcError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'input validation threw',
        cause,
      }),
  }).pipe(
    Effect.flatMap((result) =>
      result.issues
        ? Effect.fail(
            new TrpcError({
              code: 'BAD_REQUEST',
              message: 'input validation failed',
              issues: result.issues,
            }),
          )
        : Effect.succeed(result.value),
    ),
  );
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function call<TInputIn, TOutput>(
  procedure: Procedure<TInputIn, TOutput>,
  opts: { ctx: object; input: unknown; path?: string },
): Promise<TOutput> {
  const def = procedure['~def'];
  const path = opts.path ?? 'spike';
  const program = Effect.gen(function* () {
    let ctx: object = opts.ctx;
    let services = Context.empty() as Context.Context<never>;
    let input: unknown = undefined;
    for (const step of def.steps) {
      // a fiber hop between steps, so ALS propagation is actually exercised
      yield* Effect.yieldNow;
      switch (step.kind) {
        case 'use': {
          const extra = yield* Effect.promise(async () =>
            step.fn({ ctx, input, meta: def.meta }),
          );
          ctx = { ...ctx, ...extra };
          break;
        }
        case 'service': {
          services = Context.add(
            services,
            step.key,
            step.make(ctx),
          ) as Context.Context<never>;
          break;
        }
        case 'input': {
          const inputOpts = { ctx, meta: def.meta, path };
          const schema = yield* resolveSchema(step.arg, inputOpts);
          const parsed = yield* validate(
            schema,
            opts.input,
            services,
            inputOpts,
          );
          input =
            isPlainObject(input) && isPlainObject(parsed)
              ? { ...input, ...parsed }
              : parsed;
          break;
        }
      }
    }
    return (yield* Effect.promise(async () =>
      def.resolver({ ctx, input }),
    )) as TOutput;
  });
  return Effect.runPromise(program);
}

/**
 * What an OpenAPI generator (18) or a runtime contract (09) can see: the
 * schema, or nothing when only a callback exists.
 */
export function staticInputSchemas(
  procedure: Procedure<any, any>,
): ReadonlyArray<AnySchema | 'callback'> {
  return procedure['~def'].steps.flatMap<AnySchema | 'callback'>((step) =>
    step.kind !== 'input'
      ? []
      : isSchema(step.arg)
        ? [step.arg]
        : ['callback' as const],
  );
}

export type inferInput<P> = P extends Procedure<infer I, any> ? I : never;
export type inferOutput<P> = P extends Procedure<any, infer O> ? O : never;

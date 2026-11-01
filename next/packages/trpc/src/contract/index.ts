/**
 * Contract-first APIs (`@trpc12/trpc/contract`, 09). A contract describes
 * procedures (input, output, errors, route) without resolvers. Share it with
 * clients and other teams, implement it on the server with
 * `t.implement(contract)`, or derive one from a router with
 * `experimental_toContract()`. Experimental: names and shapes may change in any
 * release.
 *
 * @example
 * ```ts
 * // @acme/contract: depends on @trpc12/trpc/contract and a schema library only
 * import { experimental_contract } from '@trpc12/trpc/contract';
 *
 * const c = experimental_contract.create();
 * export const appContract = {
 *   post: {
 *     byId: c
 *       .input(z.object({ id: z.string() }))
 *       .output(Post)
 *       .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
 *       .query(),
 *     create: c.input(NewPost).output(Post).mutation(),
 *   },
 * };
 *
 * // client: no server types involved
 * const client = createTrpcClient({ router: appContract, links: [httpLink({ url })] });
 * ```
 * @see ../../../../.agent-docs/proposals/09-contract-first.md
 * @module
 */
// Loads the entry point declaration emit names errors through (`TrpcError`,
// `SchemaValidationError`), for packages that import only the contract.
import type {} from '@trpc12/trpc/server';
import type { RouterType } from '../client/types.ts';
import type { AnyTrpcError, ReservedKeyCheck } from '../internal/error.ts';
import {
  assertLoaded,
  flattenRoutes,
  procedureJson,
  scopedRoute,
} from '../internal/describe.ts';
import type { JsonSchema } from '../internal/json-schema.ts';
import type {
  Merge,
  Overwrite,
  ProcedureType,
  Simplify,
  UndeclaredMeta,
  Unset,
  Value,
} from '../internal/types.ts';
import {
  type DeclaredErrors,
  type ErrorMapInput,
  isProcedure,
  mergeMeta,
  type AnyProcedure,
  type ErrorMap,
  type MetaMerge,
  type Procedure,
  type ProcedureDef,
  type ProcedureDefOf,
  type ProcedureOfType,
  type ProcedureTypeOf,
  type Step,
  type BuilderDef,
  type ProcedureBuilder,
  type Unlazy,
} from '../server/procedures/index.ts';
import { routeOf, type Route } from '../openapi/rest/index.ts';
import type {
  AnySchema,
  InOf,
  OutOf,
  SchemaServices,
  SchemaValidationError,
  EventOutput,
  OutputIn,
  OutputOut,
  OutputSchema,
  OutputServices,
  StreamedOutput,
} from '../server/validation/index.ts';
import type { TrackedEnvelope } from '../server/subscriptions/index.ts';

export type { JsonSchema } from '../internal/json-schema.ts';

/**
 * A contract builder's state.
 * @since 0.1.0
 * @stability experimental
 */
export interface ContractDef {
  meta: object;
  inputIn: unknown;
  inputOut: unknown;
  outputIn: unknown;
  outputOut: unknown;
  errors: AnyTrpcError;
  /** Errors declared with `.errors()`, by code. */
  declared: object;
  /** Effect services the schemas need to decode. */
  requires: unknown;
  /** Whether subscription events are `tracked()`. */
  tracked: boolean;
}

/**
 * The initial contract builder state.
 * @since 0.1.0
 * @stability experimental
 */
export interface ContractRootDef<TMeta extends object> {
  meta: TMeta;
  inputIn: Unset;
  inputOut: Unset;
  outputIn: Unset;
  outputOut: Unset;
  errors: never;
  declared: {};
  requires: never;
  tracked: false;
}

/**
 * Part of inferred contract types; exported so they stay nameable.
 * @since 0.1.0
 * @stability experimental
 */
export type ContractWith<
  TDef extends ContractDef,
  P extends Partial<ContractDef>,
> = {
  [K in keyof ContractDef]: K extends keyof P ? P[K] : TDef[K];
};

/**
 * What clients receive from a contract procedure.
 * @since 0.1.0
 * @stability experimental
 */
export type ContractOutput<
  TDef extends ContractDef,
  TType extends ProcedureType = ProcedureType,
> = TDef['outputOut'] extends Unset
  ? unknown
  : TType extends 'subscription'
    ? TDef['tracked'] extends true
      ? TrackedEnvelope<EventOutput<TDef['outputOut']>>
      : EventOutput<TDef['outputOut']>
    : StreamedOutput<TDef['outputOut']>;

/**
 * The definition of a contract procedure: a {@link ProcedureDef} with the
 * contract's builder state under `contract`, which `t.implement()` reads.
 * @since 0.1.0
 * @stability experimental
 */
export interface ContractProcedureDef<
  TType extends ProcedureType,
  TDef extends ContractDef,
> {
  input: Value<TDef['inputIn']>;
  output: ContractOutput<TDef, TType>;
  errors: TDef['errors'];
  outputValidated: TDef['outputOut'] extends Unset ? never : true;
  declared: keyof TDef['declared'] & string;
  contract: TDef;
}

/**
 * A procedure without a resolver (09). Clients accept it like any procedure;
 * a handler answers it with `NOT_IMPLEMENTED` until it's implemented.
 * @since 0.1.0
 * @stability experimental
 */
export type ContractProcedure<
  TType extends ProcedureType,
  TDef extends ContractDef,
> = Procedure<ContractProcedureDef<TType, TDef>, TType>;

/**
 * Any contract procedure.
 * @since 0.1.0
 * @stability experimental
 */
export type AnyContractProcedure = Procedure<
  ProcedureDef & { contract: ContractDef }
>;

/**
 * A contract: a plain object of contract procedures and nested contracts.
 * @since 0.1.0
 * @stability experimental
 */
export interface AnyContractRouter {
  readonly [key: string]: AnyContractProcedure | AnyContractRouter;
}

/**
 * Options for a contract subscription.
 * @since 0.1.0
 * @stability experimental
 */
export interface ContractSubscriptionOptions<TTracked extends boolean> {
  /**
   * The implementation yields `tracked()` events, and clients receive
   * `{ id, data }` and can resume.
   * @default false
   */
  tracked?: TTracked;
}

/**
 * Builds contract procedures with the procedure builder's definition methods
 * and resolver-less terminals. Every method returns a new builder.
 *
 * @example
 * ```ts
 * const c = experimental_contract.create<{ meta: Meta }>().concat(experimental_openapi());
 * export const byId = c
 *   .meta({ route: { method: 'GET', path: '/posts/{id}' } })
 *   .input(z.object({ id: z.string() }))
 *   .output(Post)
 *   .query();
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export interface ContractBuilder<TDef extends ContractDef> {
  readonly '~trpc': ContractInternals & { readonly '~types'?: TDef };

  /**
   * Adds an input schema. Object inputs chain like the procedure builder's.
   * Contracts are static, so the ctx-aware callback form isn't available.
   */
  input<$S extends AnySchema>(
    schema: $S,
  ): ContractBuilder<
    ContractWith<
      TDef,
      {
        inputIn: Merge<TDef['inputIn'], InOf<$S>>;
        inputOut: Merge<TDef['inputOut'], OutOf<$S>>;
        errors: TDef['errors'] | SchemaValidationError<$S>;
        requires: TDef['requires'] | SchemaServices<$S>;
      }
    >
  >;

  /**
   * The output schema (for subscriptions, each event's `data`); `stream(Item,
   * Return?)` for streamed queries and mutations.
   */
  output<$S extends OutputSchema>(
    schema: $S,
  ): ContractBuilder<
    ContractWith<
      TDef,
      {
        outputIn: OutputIn<$S>;
        outputOut: OutputOut<$S>;
        requires: TDef['requires'] | OutputServices<$S>;
      }
    >
  >;

  /**
   * Declares errors (07 A). Implementations may only return errors the
   * contract declares (Q9.3).
   */
  errors<const $Map extends ErrorMapInput>(
    map: $Map & ReservedKeyCheck,
  ): ContractBuilder<
    ContractWith<
      TDef,
      {
        declared: Overwrite<TDef['declared'], DeclaredErrors<$Map>>;
        errors: TDef['errors'] | DeclaredErrors<$Map>[keyof $Map & string];
      }
    >
  >;

  /**
   * Procedure meta, shallow-merged over earlier meta (keys with a
   * `mergeMeta` function merge through it).
   */
  meta<const $Meta extends TDef['meta']>(
    meta: $Meta & UndeclaredMeta<TDef['meta'], $Meta>,
  ): ContractBuilder<TDef>;

  /**
   * Adds a root extension's meta keys, their merges and default meta, as
   * `t.concat()` does. Contracts hold no middleware, so an extension with
   * middleware throws; its errors and ctx don't apply.
   *
   * @example
   * ```ts
   * const c = experimental_contract.create().concat(experimental_openapi());
   * ```
   */
  concat<$Ext extends BuilderDef>(
    extension: ProcedureBuilder<$Ext>,
  ): ContractBuilder<
    ContractWith<TDef, { meta: Simplify<TDef['meta'] & $Ext['meta']> }>
  >;

  /** A read, without a resolver. */
  query(): ContractProcedure<'query', TDef>;
  /** A write, without a resolver. */
  mutation(): ContractProcedure<'mutation', TDef>;
  /** A stream of events, without a resolver. */
  subscription<const TTracked extends boolean = false>(
    opts?: ContractSubscriptionOptions<TTracked>,
  ): ContractProcedure<
    'subscription',
    ContractWith<TDef, { tracked: TTracked }>
  >;
}

/**
 * The runtime state of a contract builder.
 * @since 0.1.0
 * @stability experimental
 */
export interface ContractInternals {
  readonly steps: ReadonlyArray<Step>;
  readonly meta: object;
  readonly output: AnySchema | undefined;
  readonly errors: ErrorMap;
  readonly mergeMeta?: MetaMerge<any> | undefined;
}

function createContractBuilder(
  internals: ContractInternals,
): ContractBuilder<any> {
  const next = (patch: Partial<ContractInternals>) =>
    createContractBuilder({ ...internals, ...patch });
  const build = (type: ProcedureType) => (): AnyProcedure => ({
    '~trpc': { ...internals, type, resolver: undefined },
  });
  return {
    '~trpc': internals,
    input: (arg: AnySchema) =>
      next({ steps: [...internals.steps, { kind: 'input', arg }] }),
    output: (output: AnySchema) => next({ output }),
    errors: (map: ErrorMap) =>
      next({ errors: { ...internals.errors, ...map } }),
    meta: (meta: object) =>
      next({ meta: mergeMeta(internals.mergeMeta, internals.meta, meta) }),
    concat: (extension: ProcedureBuilder<any>) => {
      const ext = extension['~trpc'];
      if (ext.steps.length > 0) {
        throw new Error(
          'contract.concat(): the extension has middleware or inputs, which contracts cannot hold',
        );
      }
      const merge = { ...ext.mergeMeta, ...internals.mergeMeta };
      return next({
        meta: mergeMeta(merge, ext.meta, internals.meta),
        mergeMeta: merge,
      });
    },
    query: build('query'),
    mutation: build('mutation'),
    subscription: build('subscription'),
  } as ContractBuilder<any>;
}

/**
 * The type-level config of `experimental_contract.create`.
 * @since 0.1.0
 * @stability experimental
 */
export interface ContractConfig {
  /** The shape of procedure meta. */
  meta?: object;
}

/**
 * Entry point for contract builders.
 * @since 0.1.0
 * @stability experimental
 */
export const experimental_contract = {
  /**
   * A contract builder for a meta type.
   *
   * @example
   * ```ts
   * const c = experimental_contract.create<{ meta: { auth?: boolean } }>();
   * export const health = c.output(z.literal('ok')).query();
   * ```
   */
  create<TConfig extends ContractConfig = {}>(): ContractBuilder<
    ContractRootDef<TConfig['meta'] extends object ? TConfig['meta'] : {}>
  > {
    return createContractBuilder({
      steps: [],
      meta: {},
      output: undefined,
      errors: {},
    });
  },
};

/**
 * Whether `value` is a procedure without a resolver.
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_isContractProcedure(
  value: unknown,
): value is AnyContractProcedure {
  return isProcedure(value) && value['~trpc'].resolver === undefined;
}

/**
 * A router (or contract) reduced to what clients see (01, 09): no ctx,
 * middleware or services. Clients typed from `inferContract<typeof
 * appRouter>` and from `typeof appRouter` are the same.
 *
 * @example
 * ```ts
 * export type AppContract = inferContract<typeof appRouter>;
 * createTrpcClient({ router: routerType<AppContract>(), links: [httpLink({ url })] });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export type inferContract<TRouter> = TRouter extends AnyProcedure
  ? ProcedureOfType<
      ProcedureTypeOf<TRouter>,
      {
        input: ProcedureDefOf<TRouter>['input'];
        output: ProcedureDefOf<TRouter>['output'];
        errors: ProcedureDefOf<TRouter>['errors'];
      }
    >
  : { [K in keyof TRouter]: inferContract<Unlazy<TRouter[K]>> };

/**
 * One procedure of a {@link ContractJson}.
 * @since 0.1.0
 * @stability experimental
 */
export interface ProcedureJson {
  readonly type: ProcedureType;
  readonly route?: Route;
  /** What the client sends. Absent when there is no input or it can't be described. */
  readonly input?: JsonSchema;
  /** What the client receives (for subscriptions, each event's `data`). */
  readonly output?: JsonSchema;
  readonly errors?: Readonly<
    Record<
      string,
      {
        readonly status?: number;
        readonly message?: string;
        readonly data?: JsonSchema;
      }
    >
  >;
}

/**
 * A JSON-serializable contract (Q9.4): procedure types, routes and JSON
 * Schemas by path. It carries the router's client type, so
 * `createTrpcClient({ router: contractJSON })` is typed.
 * @since 0.1.0
 * @stability experimental
 */
export interface ContractJson<TRouter = unknown> extends RouterType<
  inferContract<TRouter>
> {
  readonly version: 1;
  readonly procedures: Readonly<Record<string, ProcedureJson>>;
}

/**
 * Reduces a router (or a contract) to a JSON-serializable contract (Q9.4):
 * paths, procedure types, routes and JSON Schemas, but no resolvers, ctx or
 * meta. The OpenAPI link and code generators read it.
 *
 * @example
 * ```ts
 * export const appContract = experimental_toContract(appRouter);
 * await fs.writeFile('contract.json', JSON.stringify(appContract));
 *
 * const client = createTrpcClient({
 *   router: appContract,
 *   links: [experimental_openApiLink({ url, contract: appContract })],
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_toContract<TRouter extends object>(
  router: TRouter,
): ContractJson<TRouter> {
  const procedures: Record<string, ProcedureJson> = {};
  for (const { path, procedure, scope } of assertLoaded(flattenRoutes(router))
    .procedures) {
    const def = procedure['~trpc'];
    procedures[path] = procedureJson(
      def,
      scopedRoute(path, routeOf(def), scope),
    );
  }
  return { version: 1, procedures } as ContractJson<TRouter>;
}

/**
 * Contract-first APIs (`trpcdev/contract`, 09). A contract describes
 * procedures (input, output, errors, route) without resolvers. Share it with
 * clients and other teams, implement it on the server with
 * `t.implement(contract)`, or derive one from a router with `toContract()`.
 *
 * @example
 * ```ts
 * // @acme/contract: depends on trpcdev/contract and a schema library only
 * import { contract } from 'trpcdev/contract';
 *
 * const c = contract.create();
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
import type { RouterType } from '../client/types.ts';
import type { AnyTrpcError } from '../internal/error.ts';
import { flattenRouter, procedureJson } from '../internal/describe.ts';
import type { JsonSchema } from '../internal/json-schema.ts';
import type {
  Merge,
  Overwrite,
  ProcedureType,
  Unset,
  Value,
} from '../internal/types.ts';
import type { DeclaredErrors, ErrorMapInput } from '../server/builder.ts';
import {
  isProcedure,
  type AnyProcedure,
  type ErrorMap,
  type Procedure,
  type ProcedureDef,
  type ProcedureDefOf,
  type Route,
  type Step,
} from '../server/procedure.ts';
import type {
  AnySchema,
  InOf,
  InputValidationError,
  OutOf,
  SchemaServices,
} from '../server/schema.ts';
import type { TrackedEnvelope } from '../server/tracked.ts';

export type { JsonSchema } from '../internal/json-schema.ts';

/**
 * A contract builder's state.
 * @since 12.0.0-alpha.0
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
 * @since 12.0.0-alpha.0
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
 * @since 12.0.0-alpha.0
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ContractOutput<TDef extends ContractDef> =
  TDef['outputOut'] extends Unset
    ? unknown
    : TDef['tracked'] extends true
      ? TrackedEnvelope<TDef['outputOut']>
      : TDef['outputOut'];

/**
 * The definition of a contract procedure: a {@link ProcedureDef} with the
 * contract's builder state under `contract`, which `t.implement()` reads.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface ContractProcedureDef<
  TType extends ProcedureType,
  TDef extends ContractDef,
> {
  type: TType;
  ctx: {};
  meta: TDef['meta'];
  input: Value<TDef['inputIn']>;
  output: ContractOutput<TDef>;
  errors: TDef['errors'];
  services: never;
  contract: TDef;
}

/**
 * A procedure without a resolver (09). Clients accept it like any procedure;
 * a handler answers it with `NOT_IMPLEMENTED` until it's implemented.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ContractProcedure<
  TType extends ProcedureType,
  TDef extends ContractDef,
> = Procedure<ContractProcedureDef<TType, TDef>>;

/**
 * Any contract procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type AnyContractProcedure = Procedure<
  ProcedureDef & { contract: ContractDef }
>;

/**
 * A contract: a plain object of contract procedures and nested contracts.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface AnyContractRouter {
  readonly [key: string]: AnyContractProcedure | AnyContractRouter;
}

/**
 * Options for a contract subscription.
 * @since 12.0.0-alpha.0
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
 * const c = contract.create<{ meta: Meta }>();
 * export const byId = c
 *   .route({ method: 'GET', path: '/posts/{id}' })
 *   .input(z.object({ id: z.string() }))
 *   .output(Post)
 *   .query();
 * ```
 * @since 12.0.0-alpha.0
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
        errors: TDef['errors'] | InputValidationError;
        requires: TDef['requires'] | SchemaServices<$S>;
      }
    >
  >;

  /** The output schema (for subscriptions, each event's `data`). */
  output<$S extends AnySchema>(
    schema: $S,
  ): ContractBuilder<
    ContractWith<
      TDef,
      {
        outputIn: InOf<$S>;
        outputOut: OutOf<$S>;
        requires: TDef['requires'] | SchemaServices<$S>;
      }
    >
  >;

  /**
   * Declares errors (07 A). Implementations may only return errors the
   * contract declares (Q9.3).
   */
  errors<const $Map extends ErrorMapInput>(
    map: $Map,
  ): ContractBuilder<
    ContractWith<
      TDef,
      {
        declared: Overwrite<TDef['declared'], DeclaredErrors<$Map>>;
        errors: TDef['errors'] | DeclaredErrors<$Map>[keyof $Map & string];
      }
    >
  >;

  /** REST metadata for OpenAPI (18). */
  route(route: Route): ContractBuilder<TDef>;

  /** Procedure meta, shallow-merged over earlier meta. */
  meta(meta: TDef['meta']): ContractBuilder<TDef>;

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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface ContractInternals {
  readonly steps: ReadonlyArray<Step>;
  readonly meta: object;
  readonly output: AnySchema | undefined;
  readonly errors: ErrorMap;
  readonly route: Route | undefined;
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
    route: (route: Route) => next({ route: { ...internals.route, ...route } }),
    meta: (meta: object) => next({ meta: { ...internals.meta, ...meta } }),
    query: build('query'),
    mutation: build('mutation'),
    subscription: build('subscription'),
  } as ContractBuilder<any>;
}

/**
 * The type-level config of `contract.create`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface ContractConfig {
  /** The shape of procedure meta. */
  meta?: object;
}

/**
 * Entry point for contract builders.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const contract = {
  /**
   * A contract builder for a meta type.
   *
   * @example
   * ```ts
   * const c = contract.create<{ meta: { auth?: boolean } }>();
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
      route: undefined,
    });
  },
};

/**
 * Whether `value` is a procedure without a resolver.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function isContractProcedure(
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
 * createTrpcClient<AppContract>({ links: [httpLink({ url })] });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type inferContract<TRouter> = TRouter extends AnyProcedure
  ? Procedure<{
      type: ProcedureDefOf<TRouter>['type'];
      ctx: {};
      meta: ProcedureDefOf<TRouter>['meta'];
      input: ProcedureDefOf<TRouter>['input'];
      output: ProcedureDefOf<TRouter>['output'];
      errors: ProcedureDefOf<TRouter>['errors'];
      services: never;
    }>
  : { [K in keyof TRouter]: inferContract<TRouter[K]> };

/**
 * One procedure of a {@link ContractJson}.
 * @since 12.0.0-alpha.0
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
 * @since 12.0.0-alpha.0
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
 * export const appContract = toContract(appRouter);
 * await fs.writeFile('contract.json', JSON.stringify(appContract));
 *
 * const client = createTrpcClient({
 *   router: appContract,
 *   links: [openApiLink({ url, contract: appContract })],
 * });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function toContract<TRouter extends object>(
  router: TRouter,
): ContractJson<TRouter> {
  const procedures: Record<string, ProcedureJson> = {};
  for (const [path, procedure] of flattenRouter(router)) {
    procedures[path] = procedureJson(procedure['~trpc']);
  }
  return { version: 1, procedures } as ContractJson<TRouter>;
}

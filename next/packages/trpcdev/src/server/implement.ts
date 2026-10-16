import type { Context, Effect, Stream } from 'effect';
import type { AnyContractRouter, ContractDef } from '../contract/index.ts';
import type { AnyTrpcError } from '../internal/error.ts';
import type {
  MaybePromise,
  Overwrite,
  TypeError,
  Unset,
  Value,
} from '../internal/types.ts';
import {
  createBuilder,
  type BuilderDef,
  type BuilderInternals,
  type CurrentCtx,
  type ProvideOpts,
  type ResolverOpts,
  type ShortsCheck,
  type SplitReturn,
  type SplitStream,
  type StrictErrors,
  type SubscriptionResolverOpts,
  type With,
} from './builder.ts';
import type {
  EffectMiddleware,
  MiddlewareFunction,
  NextInput,
} from './middleware.ts';
import {
  isProcedure,
  type AnyProcedure,
  type Procedure,
  type ProcedureDefOf,
} from './procedure.ts';
import type { EventOutput, ResultOf } from './stream-schema.ts';
import type { TrackedEnvelope } from './tracked.ts';

/**
 * The builder state of an implementer leaf: the root's ctx and meta, the
 * contract's input, output and errors.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ImplementerDef<
  TRoot extends BuilderDef,
  TContract extends ContractDef,
> = With<
  TRoot,
  {
    inputIn: TContract['inputIn'];
    inputOut: TContract['inputOut'];
    outputIn: TContract['outputIn'];
    outputOut: TContract['outputOut'];
    errors: TContract['errors'];
    declared: TContract['declared'];
    requires: TContract['requires'];
  }
>;

/**
 * Q9.3: an implementation may only return errors its contract declares.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type UndeclaredCheck<TDef extends BuilderDef, $Errors> = [
  Exclude<$Errors, TDef['errors']>,
] extends [never]
  ? unknown
  : TypeError<
      'The contract does not declare this error; add it with .errors()',
      Exclude<$Errors, TDef['errors']>
    >;

type ResultConstraint<TDef extends BuilderDef> = TDef['outputIn'] extends Unset
  ? unknown
  :
      | MaybePromise<ResultOf<TDef['outputIn']> | AnyTrpcError>
      | Effect.Effect<ResultOf<TDef['outputIn']> | AnyTrpcError, any, any>;

type EventsConstraint<
  TDef extends BuilderDef,
  TTracked,
> = TDef['outputIn'] extends Unset
  ? unknown
  : TTracked extends true
    ?
        | AsyncIterable<
            TrackedEnvelope<EventOutput<TDef['outputIn']>>,
            any,
            any
          >
        | Stream.Stream<
            TrackedEnvelope<EventOutput<TDef['outputIn']>>,
            any,
            any
          >
        | AnyTrpcError
    :
        | AsyncIterable<EventOutput<TDef['outputIn']>, any, any>
        | Stream.Stream<EventOutput<TDef['outputIn']>, any, any>
        | AnyTrpcError;

/**
 * A procedure made from a contract leaf: the contract's client-facing types,
 * the implementation's ctx and services.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ImplementedProcedure<
  TDef extends BuilderDef,
  TContract extends AnyProcedure,
  TServices,
> = Procedure<{
  type: ProcedureDefOf<TContract>['type'];
  ctx: TDef['ctx'];
  meta: TDef['meta'];
  input: ProcedureDefOf<TContract>['input'];
  output: ProcedureDefOf<TContract>['output'];
  errors: ProcedureDefOf<TContract>['errors'];
  services: TDef['requires'] | Exclude<TServices, TDef['provided']>;
}>;

type Resolve<TDef extends BuilderDef, TContract extends AnyProcedure> = <$Ret>(
  resolver: (
    opts: ResolverOpts<TDef>,
  ) => $Ret &
    ResultConstraint<TDef> &
    StrictErrors<$Ret> &
    UndeclaredCheck<TDef, SplitReturn<$Ret>['errors']> &
    ShortsCheck<
      TDef,
      TDef['outputIn'] extends Unset ? unknown : ResultOf<TDef['outputIn']>
    >,
) => ImplementedProcedure<TDef, TContract, SplitReturn<$Ret>['services']>;

type Terminals<TDef extends BuilderDef, TContract extends AnyProcedure> = {
  query: Resolve<TDef, TContract>;
  mutation: Resolve<TDef, TContract>;
  subscription: <$Ret>(
    resolver: (
      opts: SubscriptionResolverOpts<TDef>,
    ) => $Ret &
      EventsConstraint<TDef, ProcedureDefOf<TContract>['contract']['tracked']> &
      StrictErrors<$Ret> &
      UndeclaredCheck<TDef, SplitStream<$Ret>['errors']>,
  ) => ImplementedProcedure<TDef, TContract, SplitStream<$Ret>['services']>;
};

/**
 * The definition methods an implementer leaf keeps. Input, output, errors and
 * route come from the contract, so `.input()`, `.output()`, `.errors()` and
 * `.route()` are not available.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface ImplementerMethods<
  TDef extends BuilderDef,
  TContract extends AnyProcedure,
> {
  readonly '~trpc': BuilderInternals & { readonly '~types'?: TDef };

  /**
   * Adds middleware. Errors it returns must be declared by the contract
   * (Q9.3).
   */
  use<
    $Ctx extends object = {},
    $Err extends TDef['errors'] = never,
    $Ok = never,
    $Input = Unset,
  >(
    fn: MiddlewareFunction<
      CurrentCtx<TDef>,
      Value<TDef['inputOut']>,
      TDef['meta'],
      $Ctx,
      $Err,
      $Ok,
      $Input
    >,
  ): ProcedureImplementer<
    With<
      TDef,
      {
        ctxAdded: Overwrite<TDef['ctxAdded'], $Ctx>;
        inputOut: NextInput<TDef['inputOut'], $Input>;
        shorts: TDef['shorts'] | $Ok;
      }
    >,
    TContract
  >;
  /** Adds an Effect middleware (06 M-A). */
  use<
    $Ctx extends object,
    $Err extends TDef['errors'],
    $R,
    $Provides,
    $Ok = never,
    $Input = Unset,
  >(
    mw: EffectMiddleware<
      CurrentCtx<TDef>,
      Value<TDef['inputOut']>,
      TDef['meta'],
      $Ctx,
      $Err,
      $R,
      $Provides,
      $Ok,
      $Input
    >,
  ): ProcedureImplementer<
    With<
      TDef,
      {
        ctxAdded: Overwrite<TDef['ctxAdded'], $Ctx>;
        inputOut: NextInput<TDef['inputOut'], $Input>;
        shorts: TDef['shorts'] | $Ok;
        provided: TDef['provided'] | $Provides;
        requires: TDef['requires'] | Exclude<$R, TDef['provided']>;
      }
    >,
    TContract
  >;

  /** Provides an Effect service to the rest of the chain. */
  provide<$Id, $Shape, $E extends TDef['errors'] = never, $R = never>(
    service: Context.Key<$Id, $Shape>,
    make: (
      opts: ProvideOpts<TDef>,
    ) => MaybePromise<$Shape> | Effect.Effect<$Shape, $E, $R>,
  ): ProcedureImplementer<
    With<
      TDef,
      {
        provided: TDef['provided'] | $Id;
        requires: TDef['requires'] | Exclude<$R, TDef['provided']>;
      }
    >,
    TContract
  >;
}

/**
 * A leaf of `t.implement(contract)`: `.use()`, `.provide()` and the terminal
 * the contract declares.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ProcedureImplementer<
  TDef extends BuilderDef,
  TContract extends AnyProcedure,
> = ImplementerMethods<TDef, TContract> &
  Pick<Terminals<TDef, TContract>, ProcedureDefOf<TContract>['type']>;

/**
 * The mirror tree `t.implement(contract)` returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type Implementer<
  TRoot extends BuilderDef,
  TContract,
> = TContract extends AnyProcedure
  ? ProcedureImplementer<
      ImplementerDef<TRoot, ProcedureDefOf<TContract>['contract']>,
      TContract
    >
  : { readonly [K in keyof TContract]: Implementer<TRoot, TContract[K]> };

/**
 * What `impl.router()` accepts at each contract leaf: a procedure with the
 * contract's type, input, output and errors.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ImplementedRouter<TContract> = TContract extends AnyProcedure
  ? Procedure<{
      type: ProcedureDefOf<TContract>['type'];
      ctx: any;
      meta: any;
      input: ProcedureDefOf<TContract>['input'];
      output: ProcedureDefOf<TContract>['output'];
      errors: ProcedureDefOf<TContract>['errors'];
      services: any;
    }>
  : { readonly [K in keyof TContract]: ImplementedRouter<TContract[K]> };

/**
 * Rejects keys the contract does not have, at any depth.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ExactRouter<TRouter, TContract> = TContract extends AnyProcedure
  ? unknown
  : {
      [K in keyof TRouter]: K extends keyof TContract
        ? ExactRouter<TRouter[K], TContract[K]>
        : TypeError<'impl.router: this key is not in the contract', K>;
    };

/**
 * `impl.router()`: checks that a router implements every procedure of the
 * contract and nothing else.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface ImplementRouter<TContract> {
  /**
   * Checks completeness at the type level (missing and extra keys, wrong
   * types) and at runtime, and returns the router unchanged.
   *
   * @example
   * ```ts
   * export const appRouter = impl.router({
   *   post: { byId, create },
   * });
   * ```
   */
  router<TRouter extends ImplementedRouter<TContract>>(
    routes: TRouter & ExactRouter<TRouter, TContract>,
  ): TRouter;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function checkImplementation(
  contract: AnyContractRouter,
  routes: unknown,
  prefix: string,
  problems: string[],
): void {
  if (!isRecord(routes) || isProcedure(routes)) {
    problems.push(`"${prefix.slice(0, -1)}" must be a router`);
    return;
  }
  for (const [key, node] of Object.entries(contract)) {
    const path = prefix + key;
    const impl = routes[key];
    if (!isProcedure(node)) {
      if (impl === undefined) problems.push(`"${path}" is missing`);
      else checkImplementation(node, impl, `${path}.`, problems);
      continue;
    }
    if (!isProcedure(impl)) problems.push(`"${path}" is missing`);
    else if (impl['~trpc'].type !== node['~trpc'].type) {
      problems.push(
        `"${path}" must be a ${node['~trpc'].type}, not a ${impl['~trpc'].type}`,
      );
    } else if (!impl['~trpc'].resolver) {
      problems.push(`"${path}" has no resolver`);
    }
  }
  for (const key of Object.keys(routes)) {
    if (!Object.hasOwn(contract, key)) {
      problems.push(`"${prefix}${key}" is not in the contract`);
    }
  }
}

/** @internal */
export function implement(
  root: BuilderInternals,
  contract: AnyContractRouter,
): unknown {
  if (Object.hasOwn(contract, 'router')) {
    throw new Error(
      't.implement(): a top-level contract key named "router" would shadow impl.router(); nest it',
    );
  }
  const mirror = (node: AnyProcedure | AnyContractRouter): unknown => {
    if (!isProcedure(node)) {
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [key, mirror(child)]),
      );
    }
    const def = node['~trpc'];
    return createBuilder({
      steps: [...root.steps, ...def.steps],
      meta: { ...root.meta, ...def.meta },
      output: def.output,
      validateOutput: def.validateOutput,
      errors: { ...root.errors, ...def.errors },
      route: def.route ? { ...root.route, ...def.route } : root.route,
    });
  };
  const tree = mirror(contract) as Record<string, unknown>;
  tree['router'] = (routes: unknown) => {
    const problems: string[] = [];
    checkImplementation(contract, routes, '', problems);
    if (problems.length) {
      throw new Error(
        `impl.router(): the router does not match the contract:\n- ${problems.join('\n- ')}`,
      );
    }
    return routes;
  };
  return tree;
}

/**
 * What `t.implement(contract)` returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ImplementResult<
  TRoot extends BuilderDef,
  TContract extends AnyContractRouter,
> = Implementer<TRoot, TContract> & ImplementRouter<TContract>;

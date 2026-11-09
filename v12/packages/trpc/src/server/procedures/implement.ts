import type { Context, Effect } from 'effect';
import type { AnyContractRouter, ContractDef } from '../../contract/index.ts';
import type { AnyTrpcError } from '../../internal/error.ts';
import type {
  MaybePromise,
  Overwrite,
  TypeError,
  Unset,
  Value,
} from '../../internal/types.ts';
import {
  createBuilder,
  type BuilderDef,
  type BuilderInternals,
  type CurrentCtx,
  type ProvideOpts,
  type ResolverOpts,
  type Returns,
  type ShortsCheck,
  type SplitReturn,
  type SplitStream,
  type StrictErrors,
  type SubscriptionResolverOpts,
  type With,
  type Yields,
} from './builder.ts';
import type {
  EffectMiddleware,
  MiddlewareErrors,
  MiddlewareFunction,
  NextInput,
} from './middleware.ts';
import {
  isProcedure,
  mergeMeta,
  type AnyProcedure,
  type BuiltDef,
  type DefFields,
  type Procedure,
  type ProcedureOfType,
  type ProcedureTypeOf,
} from './procedure.ts';
import type { EventOutput, ResultOf } from '../validation/index.ts';
import type { TrackedEnvelope } from '../subscriptions/index.ts';
import type { Branded } from './router.ts';

/** A contract procedure's def, read by index (see `ProcedureDefOf`). */
type ContractDefOf<T extends AnyProcedure> = NonNullable<T['~trpc']['~types']>;

/**
 * The builder state of an implementer leaf: the root's ctx and meta, the
 * contract's input, output and errors.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export type UndeclaredCheck<TDef extends BuilderDef, $Errors> = [
  Exclude<$Errors, TDef['errors']>,
] extends [never]
  ? unknown
  : TypeError<
      'The contract does not declare this error; add it with .errors()',
      Exclude<$Errors, TDef['errors']>
    >;

type EventOf<TDef extends BuilderDef, TTracked> = TTracked extends true
  ? TrackedEnvelope<EventOutput<TDef['outputIn']>>
  : EventOutput<TDef['outputIn']>;

type EventsConstraint<
  TDef extends BuilderDef,
  TTracked,
> = TDef['outputIn'] extends Unset
  ? unknown
  : Yields<EventOf<TDef, TTracked>, any>;

/**
 * A procedure made from a contract leaf: the contract's client-facing types,
 * the implementation's ctx and services.
 * @since 0.1.0
 * @stability stable
 */
export type ImplementedProcedure<
  TDef extends BuilderDef,
  TContract extends AnyProcedure,
  TServices,
> = ProcedureOfType<
  ProcedureTypeOf<TContract>,
  BuiltDef<ImplementedFields<TDef, TContract, TServices>>
>;

interface ImplementedFields<
  TDef extends BuilderDef,
  TContract extends AnyProcedure,
  TServices,
> extends DefFields {
  input: ContractDefOf<TContract>['input'];
  output: ContractDefOf<TContract>['output'];
  errors: ContractDefOf<TContract>['errors'];
  ctx: TDef['needs'];
  services: TDef['requires'] | Exclude<TServices, TDef['provided']>;
  outputValidated: ContractDefOf<TContract>['outputValidated'];
  declared: ContractDefOf<TContract>['declared'];
  servicesKey: TDef['requires'] | TServices;
}

// The same split as the builder's terminals: see `Returns`.
type ContractReturns<TDef extends BuilderDef> = TDef['outputIn'] extends Unset
  ? unknown
  : AsyncIterable<any, any, any> extends TDef['outputIn']
    ? unknown
    : ShortsCheck<TDef, ResultOf<TDef['outputIn']>> extends TypeError<any, any>
      ? ShortsCheck<TDef, ResultOf<TDef['outputIn']>>
      : Returns<TDef['outputIn'], TDef['errors']>;

type ContractYields<
  TDef extends BuilderDef,
  TTracked,
> = TDef['outputIn'] extends Unset
  ? unknown
  : AsyncIterable<any, any, any> extends TDef['outputIn']
    ? unknown
    : Yields<EventOf<TDef, TTracked>, TDef['errors']>;

type ResolveReturn<
  TDef extends BuilderDef,
  $Ret,
> = TDef['outputIn'] extends Unset
  ? $Ret &
      StrictErrors<$Ret> &
      UndeclaredCheck<TDef, SplitReturn<$Ret>['errors']>
  : AsyncIterable<any, any, any> extends TDef['outputIn']
    ? $Ret &
        StrictErrors<$Ret> &
        UndeclaredCheck<TDef, SplitReturn<$Ret>['errors']> &
        ShortsCheck<TDef, ResultOf<TDef['outputIn']>>
    : $Ret | ContractReturns<TDef>;

type SubscribeReturn<
  TDef extends BuilderDef,
  TTracked,
  $Ret,
> = TDef['outputIn'] extends Unset
  ? $Ret &
      StrictErrors<$Ret> &
      UndeclaredCheck<TDef, SplitStream<$Ret>['errors']>
  : AsyncIterable<any, any, any> extends TDef['outputIn']
    ? $Ret &
        EventsConstraint<TDef, TTracked> &
        StrictErrors<$Ret> &
        UndeclaredCheck<TDef, SplitStream<$Ret>['errors']>
    : $Ret | ContractYields<TDef, TTracked>;

type Resolve<TDef extends BuilderDef, TContract extends AnyProcedure> = <
  $Ret extends ContractReturns<TDef>,
>(
  resolver: (opts: ResolverOpts<TDef>) => ResolveReturn<TDef, $Ret>,
) => ImplementedProcedure<TDef, TContract, SplitReturn<$Ret>['services']>;

type Terminals<TDef extends BuilderDef, TContract extends AnyProcedure> = {
  query: Resolve<TDef, TContract>;
  mutation: Resolve<TDef, TContract>;
  subscription: <
    $Ret extends ContractYields<
      TDef,
      ContractDefOf<TContract>['contract']['tracked']
    >,
  >(
    resolver: (
      opts: SubscriptionResolverOpts<TDef>,
    ) => SubscribeReturn<
      TDef,
      ContractDefOf<TContract>['contract']['tracked'],
      $Ret
    >,
  ) => ImplementedProcedure<TDef, TContract, SplitStream<$Ret>['services']>;
};

/**
 * The definition methods an implementer leaf keeps. Input, output, errors and
 * meta come from the contract, so `.input()`, `.output()`, `.errors()` and
 * `.meta()` are not available.
 * @since 0.1.0
 * @stability stable
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
  /** Adds an Effect middleware. */
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
 * @since 0.1.0
 * @stability stable
 */
export type ProcedureImplementer<
  TDef extends BuilderDef,
  TContract extends AnyProcedure,
> = ImplementerMethods<TDef, TContract> &
  Pick<Terminals<TDef, TContract>, ProcedureTypeOf<TContract>>;

/**
 * The mirror tree `t.implement(contract)` returns.
 * @since 0.1.0
 * @stability stable
 */
export type Implementer<
  TRoot extends BuilderDef,
  TContract,
> = TContract extends AnyProcedure
  ? ProcedureImplementer<
      ImplementerDef<TRoot, ContractDefOf<TContract>['contract']>,
      TContract
    >
  : { readonly [K in keyof TContract]: Implementer<TRoot, TContract[K]> };

/**
 * What `impl.router()` accepts at each contract leaf: a procedure with the
 * contract's type, input, output and errors.
 * @since 0.1.0
 * @stability stable
 */
export type ImplementedRouter<TContract> = TContract extends AnyProcedure
  ? Procedure<
      {
        input: ContractDefOf<TContract>['input'];
        output: ContractDefOf<TContract>['output'];
        errors: ContractDefOf<TContract>['errors'];
      },
      ProcedureTypeOf<TContract>
    >
  : { readonly [K in keyof TContract]: ImplementedRouter<TContract[K]> };

/**
 * Rejects keys the contract does not have, at any depth.
 * @since 0.1.0
 * @stability stable
 */
export type ExactRouter<TRouter, TContract> = TContract extends AnyProcedure
  ? unknown
  : {
      [K in keyof TRouter]: K extends keyof TContract
        ? ExactRouter<TRouter[K], TContract[K]>
        : K extends string
          ? TypeError<'impl.router: this key is not in the contract', K>
          : unknown;
    };

/**
 * `impl.router()`: checks that a router implements every procedure of the
 * contract and nothing else.
 * @since 0.1.0
 * @stability stable
 */
export interface ImplementRouter<TContract, TCtx = {}> {
  /**
   * Checks completeness at the type level (missing and extra keys, wrong
   * types) and at runtime, and returns the router unchanged, its type
   * carrying the root's ctx as `t.router()`'s does.
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
  ): Branded<TRouter, TCtx>;
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

type LeafPaths<
  TContract,
  $Err,
  P extends string = '',
> = TContract extends AnyProcedure
  ? [$Err] extends [ContractDefOf<TContract>['contract']['errors']]
    ? never
    : P
  : {
      [K in keyof TContract & string]: LeafPaths<
        TContract[K],
        $Err,
        P extends '' ? K : `${P}.${K}`
      >;
    }[keyof TContract & string];

/**
 * `unknown` when every procedure of the contract declares `$Errors`: an
 * implementer-wide `.use()` or `.provide()` runs for all of them (Q9.3).
 * @since 0.1.0
 * @stability stable
 */
export type EveryLeafDeclares<TContract, $Errors> = [
  LeafPaths<TContract, $Errors>,
] extends [never]
  ? unknown
  : TypeError<
      'impl.use: every procedure of the contract must declare this error; these do not',
      LeafPaths<TContract, $Errors>
    >;

/**
 * Implementer-wide steps: `impl.use()` and `impl.provide()` run before every
 * leaf's own steps.
 * @since 0.1.0
 * @stability stable
 */
export interface ImplementerRoot<
  TRoot extends BuilderDef,
  TContract extends AnyContractRouter,
> {
  /**
   * Adds middleware to every procedure of the contract. Errors it returns
   * must be declared by all of them.
   *
   * @example
   * ```ts
   * const impl = t.implement(appContract).use(authed);
   * ```
   */
  use<
    $Ctx extends object = {},
    $Err extends MiddlewareErrors = never,
    $Ok = never,
  >(
    fn: MiddlewareFunction<
      CurrentCtx<TRoot>,
      unknown,
      TRoot['meta'],
      $Ctx,
      $Err,
      $Ok
    > &
      EveryLeafDeclares<TContract, Extract<$Err, AnyTrpcError>>,
  ): ImplementResult<
    With<
      TRoot,
      {
        ctxAdded: Overwrite<TRoot['ctxAdded'], $Ctx>;
        shorts: TRoot['shorts'] | $Ok;
      }
    >,
    TContract
  >;
  /** Adds an Effect middleware to every procedure of the contract. */
  use<
    $Ctx extends object,
    $Err extends AnyTrpcError,
    $R,
    $Provides,
    $Ok = never,
  >(
    mw: EffectMiddleware<
      CurrentCtx<TRoot>,
      unknown,
      TRoot['meta'],
      $Ctx,
      $Err,
      $R,
      $Provides,
      $Ok
    > &
      EveryLeafDeclares<TContract, $Err>,
  ): ImplementResult<
    With<
      TRoot,
      {
        ctxAdded: Overwrite<TRoot['ctxAdded'], $Ctx>;
        shorts: TRoot['shorts'] | $Ok;
        provided: TRoot['provided'] | $Provides;
        requires: TRoot['requires'] | Exclude<$R, TRoot['provided']>;
      }
    >,
    TContract
  >;
  /** Provides an Effect service to every procedure of the contract. */
  provide<$Id, $Shape, $E extends AnyTrpcError = never, $R = never>(
    service: Context.Key<$Id, $Shape>,
    make: ((
      opts: ProvideOpts<TRoot>,
    ) => MaybePromise<$Shape> | Effect.Effect<$Shape, $E, $R>) &
      EveryLeafDeclares<TContract, $E>,
  ): ImplementResult<
    With<
      TRoot,
      {
        provided: TRoot['provided'] | $Id;
        requires: TRoot['requires'] | Exclude<$R, TRoot['provided']>;
      }
    >,
    TContract
  >;
}

type ContractMeta<TContract> = TContract extends AnyProcedure
  ? ContractDefOf<TContract>['contract']['meta']
  : { [K in keyof TContract]: ContractMeta<TContract[K]> }[keyof TContract];

type MetaMismatch<TMeta, TContractMeta> = TContractMeta extends object
  ? {
      [K in keyof TContractMeta]-?: K extends keyof TMeta
        ? [TContractMeta[K]] extends [TMeta[K]]
          ? never
          : K
        : K;
    }[keyof TContractMeta]
  : never;

/**
 * `unknown` when the contract's meta keys exist in the root's meta with
 * types the root accepts, so middleware reading `meta` sees what the
 * contract set.
 * @since 0.1.0
 * @stability stable
 */
export type ImplementMetaCheck<TMeta, TContract> = [
  MetaMismatch<TMeta, ContractMeta<TContract>>,
] extends [never]
  ? unknown
  : TypeError<
      't.implement: the contract declares meta keys this root does not have, or with other types',
      MetaMismatch<TMeta, ContractMeta<TContract>>
    >;

const reserved = ['router', 'use', 'provide'];

/** @internal */
export function implement(
  root: BuilderInternals,
  contract: AnyContractRouter,
): unknown {
  for (const key of reserved) {
    if (Object.hasOwn(contract, key)) {
      throw new Error(
        `t.implement(): a top-level contract key named "${key}" would shadow impl.${key}(); nest it`,
      );
    }
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
      meta: mergeMeta(root.mergeMeta, root.meta, def.meta),
      mergeMeta: root.mergeMeta,
      output: def.output,
      validateOutput: def.validateOutput,
      errors: { ...root.errors, ...def.errors },
      warnThrown: root.warnThrown,
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
  const builder = createBuilder(root);
  tree['use'] = (mw: unknown) =>
    implement(builder.use(mw as never)['~trpc'], contract);
  tree['provide'] = (key: Context.Key<any, any>, make: never) =>
    implement(builder.provide(key, make)['~trpc'], contract);
  return tree;
}

/**
 * What `t.implement(contract)` returns.
 * @since 0.1.0
 * @stability stable
 */
export type ImplementResult<
  TRoot extends BuilderDef,
  TContract extends AnyContractRouter,
> = Implementer<TRoot, TContract> &
  ImplementRouter<TContract, TRoot['ctx']> &
  ImplementerRoot<TRoot, TContract>;

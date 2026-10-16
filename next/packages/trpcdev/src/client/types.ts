import type { BuiltinErrorCode, TrpcError } from '../internal/error.ts';
import type {
  ClientValue,
  DansonForm,
  FormOf,
  IsAny,
  JsonOf,
  OutputForm,
  ProcedureResponse,
  ProcedureType,
} from '../internal/types.ts';
import type {
  AnyProcedure,
  Procedure,
  ProcedureDef,
} from '../server/procedure.ts';
import type { Unlazy } from '../server/router.ts';
import type {
  AnyLink,
  DeclContext,
  TrpcClientContext,
  TrpcLink,
} from './link.ts';

/**
 * An error's `data` as it arrives under a serializer's form, like outputs:
 * its JSON form unless the serializer keeps the types.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ErrorData<
  D,
  F extends OutputForm = DansonForm,
> = F['streaming'] extends true
  ? D
  : unknown extends D
    ? D
    : JsonOf<Exclude<D, undefined>, F['keeps']> | Extract<D, undefined>;

/**
 * A typed (`defined`) error from a procedure's union, its `data` in the
 * serializer's form `F`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type DefinedError<E, F extends OutputForm = DansonForm> =
  E extends TrpcError<infer C, infer D>
    ? TrpcError<C, ErrorData<D, F>> & { readonly defined: true }
    : never;

/**
 * Anything outside the typed union: thrown errors, masked internal errors,
 * network failures (`NETWORK_ERROR`) and aborts (`CLIENT_CLOSED_REQUEST`).
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type UnexpectedError = TrpcError<
  BuiltinErrorCode | (string & {}),
  unknown
> & { readonly defined: false };

/**
 * What a call can fail with. Narrow with `error.defined` first, then `code`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type ClientError<E, F extends OutputForm = DansonForm> =
  | DefinedError<E, F>
  | UnexpectedError;

/** A call's errors: the procedure's in the result form, the links' as made. */
type CallError<D extends ProcedureDef, F extends OutputForm, TLinkErrors> =
  | ClientError<D['errors'], F>
  | DefinedError<TLinkErrors>;

/**
 * A call's `Promise`, carrying its error type for `safe()`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcPromise<T, E> extends Promise<T> {
  readonly '~error'?: E;
}

/**
 * A subscription: iterate it with `for await`. Breaking out of the loop, or
 * aborting `signal`, closes the connection.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcSubscription<T, E> extends AsyncIterable<T> {
  readonly '~error'?: E;
}

/**
 * Options for `query()` and `mutate()` (16 CS-A): `signal`, plus the fields
 * links read (17 F-B), typed from the links with `router:`.
 *
 * @example
 * ```ts
 * await client.post.byId.query({ id }, { signal, headers, dedupe: false });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type CallOptions<TContext extends object = {}> = {
  signal?: AbortSignal | undefined;
} & TrpcClientContext &
  TContext;

/**
 * Options for `subscribe()`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type SubscribeOptions<TContext extends object = {}> =
  CallOptions<TContext> & {
    /** Resume after this `tracked()` event id. */
    lastEventId?: string | undefined;
  };

/** @internal */
export type CallArgs<TInput, TOpts> = undefined extends TInput
  ? [input?: TInput, opts?: TOpts]
  : [input: TInput, opts?: TOpts];

/**
 * What a client's links declare besides call options: their own errors,
 * and the operation types none of them carries.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface ChainTypes {
  readonly errors?: unknown;
  readonly unsupported?: ProcedureType;
  readonly batches?: true;
  readonly form?: OutputForm;
}

/** The form results arrive in: the client's, else the links', else the router's. @internal */
export type ResultForm<
  D,
  TForm extends OutputForm | undefined,
  TLinks extends ChainTypes,
> = TForm extends OutputForm
  ? TForm
  : TLinks extends { form: infer F extends OutputForm }
    ? [F] extends [never]
      ? FormOf<D>
      : F
    : FormOf<D>;

/**
 * The arguments of `query()`/`mutate()`. A procedure that may return a
 * `Response` can't be batched, so on a batching chain its calls must pass
 * `{ batch: false }`.
 * @internal
 */
export type ProcedureCallArgs<
  TInput,
  TOutput,
  TOpts,
  TLinks extends ChainTypes,
> = TLinks extends { batches: infer B }
  ? [B] extends [never]
    ? CallArgs<TInput, TOpts>
    : [Extract<TOutput, ProcedureResponse>] extends [never]
      ? CallArgs<TInput, TOpts>
      : [input: TInput, opts: TOpts & { batch: false }]
  : CallArgs<TInput, TOpts>;

type ChainErrors<T extends ChainTypes> = T extends { errors: infer E }
  ? E
  : never;

/** Whether the links can carry procedures of type `T`. @internal */
export type Carries<T, TLinks extends ChainTypes> = TLinks extends {
  unsupported: infer U;
}
  ? [T] extends [U]
    ? false
    : true
  : true;

/**
 * The client methods for one procedure.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type DecorateProcedure<
  P,
  TContext extends object = {},
  TForm extends OutputForm | undefined = undefined,
  TLinks extends ChainTypes = {},
> =
  P extends Procedure<infer D>
    ? Carries<D['type'], TLinks> extends false
      ? {}
      : DecorateCarried<D, TContext, TForm, TLinks>
    : never;

type DecorateCarried<
  D extends ProcedureDef,
  TContext extends object,
  TForm extends OutputForm | undefined,
  TLinks extends ChainTypes,
  TLinkErrors = ChainErrors<TLinks>,
> = D['type'] extends 'query'
  ? {
      query(
        ...args: ProcedureCallArgs<
          D['input'],
          D['output'],
          CallOptions<TContext>,
          TLinks
        >
      ): TrpcPromise<
        ClientValue<D['output'], ResultForm<D, TForm, TLinks>>,
        CallError<D, ResultForm<D, TForm, TLinks>, TLinkErrors>
      >;
    }
  : D['type'] extends 'mutation'
    ? {
        mutate(
          ...args: ProcedureCallArgs<
            D['input'],
            D['output'],
            CallOptions<TContext>,
            TLinks
          >
        ): TrpcPromise<
          ClientValue<D['output'], ResultForm<D, TForm, TLinks>>,
          CallError<D, ResultForm<D, TForm, TLinks>, TLinkErrors>
        >;
      }
    : {
        subscribe(
          ...args: CallArgs<D['input'], SubscribeOptions<TContext>>
        ): TrpcSubscription<
          ClientValue<D['output'], ResultForm<D, TForm, TLinks>>,
          CallError<D, ResultForm<D, TForm, TLinks>, TLinkErrors>
        >;
      };

/**
 * The typed client for a router. Outputs follow the serializer the router
 * declares; `TForm` overrides it, as in-process callers do (values by
 * reference keep their types).
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcClient<
  TRouter,
  TContext extends object = {},
  TForm extends OutputForm | undefined = undefined,
  TLinks extends ChainTypes = {},
> = {
  [K in keyof TRouter]: TRouter[K] extends AnyProcedure
    ? DecorateProcedure<TRouter[K], TContext, TForm, TLinks>
    : TrpcClient<Unlazy<TRouter[K]>, TContext, TForm, TLinks>;
};

declare const routerTypeBrand: unique symbol;

/**
 * A value that carries a router type and nothing else (17 D-C). Made by
 * {@link routerType}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface RouterType<TRouter> {
  readonly [routerTypeBrand]: TRouter;
}

/**
 * Carries a router type into `createTrpcClient({ router })` (17 D-C), so
 * the client also infers what its links declare. Nothing about the router
 * exists at runtime.
 *
 * @example
 * ```ts
 * const client = createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [dedupeLink(), httpLink({ url })],
 * });
 * await client.post.byId.query({ id: '1' }, { dedupe: false });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function routerType<TRouter>(): RouterType<TRouter> {
  return {} as RouterType<TRouter>;
}

/**
 * The router a `router:` value describes: a {@link RouterType}, a contract
 * or a router.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type RouterOf<TSource> =
  TSource extends RouterType<infer TRouter> ? TRouter : TSource;

type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;

type DeclOf<TLink> =
  TLink extends TrpcLink<infer D, any>
    ? IsAny<D> extends true
      ? never
      : D
    : never;

/**
 * The call option fields every link in `TLinks` declares, merged.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type LinksContext<TLinks extends ReadonlyArray<AnyLink>> = [
  DeclOf<TLinks[number]>,
] extends [never]
  ? {}
  : {
      [
        K in keyof UnionToIntersection<DeclContext<DeclOf<TLinks[number]>>>
      ]: UnionToIntersection<DeclContext<DeclOf<TLinks[number]>>>[K];
    };

/**
 * The errors and unsupported operation types the links in `TLinks` declare.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type LinksTypes<TLinks extends ReadonlyArray<AnyLink>> = {
  errors: DeclOf<TLinks[number]> extends infer D
    ? D extends { errors: infer E }
      ? E
      : never
    : never;
  unsupported: DeclOf<TLinks[number]> extends infer D
    ? D extends { unsupported: infer U }
      ? U
      : never
    : never;
  batches: DeclOf<TLinks[number]> extends infer D
    ? D extends { batches: true }
      ? true
      : never
    : never;
  form: FirstForm<TLinks>;
};

type FirstForm<TLinks extends ReadonlyArray<AnyLink>> =
  TLinks extends readonly [
    infer Head,
    ...infer Rest extends ReadonlyArray<AnyLink>,
  ]
    ? DeclOf<Head> extends { form: infer F extends OutputForm }
      ? F
      : FirstForm<Rest>
    : TLinks extends readonly []
      ? never
      : DeclOf<TLinks[number]> extends infer D
        ? D extends { form: infer F extends OutputForm }
          ? F
          : never
        : never;

type SwitchesOf<TLink> =
  DeclOf<TLink> extends infer D
    ? D extends { switches: infer S extends string }
      ? S
      : never
    : never;

type DuplicateSwitch<
  TLinks,
  TSeen extends string = never,
> = TLinks extends readonly [infer H, ...infer R]
  ? [SwitchesOf<H> & TSeen] extends [never]
    ? DuplicateSwitch<R, TSeen | SwitchesOf<H>>
    : SwitchesOf<H> & TSeen
  : never;

/**
 * A type error on `links` when two `switchLink`s on the chain share a name.
 * @internal
 */
export type DuplicateSwitchCheck<TLinks> = [DuplicateSwitch<TLinks>] extends [
  never,
]
  ? unknown
  : {
      links: `Two switchLinks on one chain are named "${DuplicateSwitch<TLinks>}"`;
    };

/**
 * Every procedure path of a router, `'post.byId'`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type RouterPaths<TRouter, TPrefix extends string = ''> =
  IsAny<TRouter> extends true
    ? string
    : {
        [K in keyof TRouter & string]: TRouter[K] extends AnyProcedure
          ? `${TPrefix}${K}`
          : RouterPaths<Unlazy<TRouter[K]>, `${TPrefix}${K}.`>;
      }[keyof TRouter & string];

import type { BuiltinErrorCode, TrpcError } from '../internal/error.ts';
import type {
  ClientValue,
  DansonForm,
  IsAny,
  JsonForm,
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
  BuiltinCallOptions,
  TrpcLink,
} from './link.ts';

/**
 * An error's `data` as it arrives under a serializer's form, like outputs:
 * its JSON form unless the serializer keeps the types. Input validation
 * issues are JSON already, so they keep theirs.
 * @since 0.1.0
 * @stability stable
 */
export type ErrorData<
  D,
  F extends OutputForm = DansonForm,
> = F['streaming'] extends true
  ? D
  : unknown extends D
    ? D
    : '~issues' extends keyof D
      ? D
      : JsonOf<Exclude<D, undefined>, F['keeps']> | Extract<D, undefined>;

/**
 * A typed (`defined`) error from a procedure's union, its `data` in the
 * serializer's form `F`.
 * @since 0.1.0
 * @stability stable
 */
export type DefinedError<E, F extends OutputForm = DansonForm> =
  E extends TrpcError<infer C, infer D>
    ? TrpcError<C, ErrorData<D, F>> & { readonly defined: true }
    : never;

/**
 * An error from outside the procedure's typed union, one member per
 * built-in code: network failures (`NETWORK_ERROR`), aborts
 * (`CLIENT_CLOSED_REQUEST`), unreadable responses (`BAD_RESPONSE`), crashes
 * (`INTERNAL_SERVER_ERROR`, masked in production), thrown built-in codes
 * and a proxy's statuses (`UNAUTHORIZED`, `BAD_GATEWAY`). It never has
 * `data`. Pass a code to name one: `BuiltinError<'NETWORK_ERROR'>`.
 * @since 0.1.0
 * @stability stable
 */
export type BuiltinError<TCode extends BuiltinErrorCode = BuiltinErrorCode> =
  TCode extends BuiltinErrorCode
    ? TrpcError<TCode, undefined> & { readonly defined: false }
    : never;

/**
 * What a call can fail with: the procedure's defined errors and the
 * built-in ones. Every member has a literal `code`, so `switch (err.code)`
 * narrows it; `err.defined` tells a defined `NOT_FOUND` from a built-in one.
 * @since 0.1.0
 * @stability stable
 */
export type ClientError<E, F extends OutputForm = DansonForm> =
  | DefinedError<E, F>
  | BuiltinError;

/** A call's errors: the procedure's in the result form, the links' as made. */
type CallError<D extends ProcedureDef, F extends OutputForm, TLinkErrors> =
  | ClientError<D['errors'], F>
  | DefinedError<TLinkErrors>;

/**
 * A call's `Promise`, carrying its error type for `safe()`.
 * @since 0.1.0
 * @stability stable
 */
export interface TrpcPromise<T, E> extends Promise<T> {
  readonly '~error'?: E;
}

/**
 * A subscription: iterate it with `for await`. Breaking out of the loop, or
 * aborting `signal`, closes the connection.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export type CallOptions<TContext extends object = {}> = {
  signal?: AbortSignal | undefined;
} & BuiltinCallOptions &
  TContext;

/**
 * Options for `subscribe()`.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export interface ChainTypes {
  readonly errors?: unknown;
  readonly unsupported?: ProcedureType;
  readonly batches?: true;
  readonly form?: OutputForm;
}

/** The form results arrive in: the client's, else the links', else plain JSON. @internal */
export type ResultForm<
  TForm extends OutputForm | undefined,
  TLinks extends ChainTypes,
> = TForm extends OutputForm
  ? TForm
  : TLinks extends { form: infer F extends OutputForm }
    ? [F] extends [never]
      ? JsonForm
      : F
    : JsonForm;

/**
 * What a batch can't carry: a `Response`, and a root `Blob` unless the
 * serializer streams files.
 */
type Unbatchable<TLinks extends ChainTypes> =
  | ProcedureResponse
  | (ResultForm<undefined, TLinks>['streaming'] extends true ? never : Blob);

/**
 * The arguments of `query()`/`mutate()`. A procedure that may return a
 * `Response`, or a `Blob` under a serializer that doesn't stream files,
 * can't be batched, so on a batching chain its calls must pass
 * `{ batch: false }`.
 * @internal
 */
export type ProcedureCallArgs<
  TInput,
  TOutput,
  TOpts,
  TLinks extends ChainTypes,
> =
  Batches<TLinks> extends false
    ? CallArgs<TInput, TOpts>
    : [Extract<TOutput, Unbatchable<TLinks>>] extends [never]
      ? CallArgs<TInput, TOpts>
      : [input: TInput, opts: TOpts & { batch: false }];

/** Read once per chain rather than once per procedure. */
type Batches<TLinks extends ChainTypes> = TLinks extends { batches: infer B }
  ? [B] extends [never]
    ? false
    : true
  : false;

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
 * @since 0.1.0
 * @stability stable
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
        ClientValue<D['output'], ResultForm<TForm, TLinks>>,
        CallError<D, ResultForm<TForm, TLinks>, TLinkErrors>
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
          ClientValue<D['output'], ResultForm<TForm, TLinks>>,
          CallError<D, ResultForm<TForm, TLinks>, TLinkErrors>
        >;
      }
    : {
        subscribe(
          ...args: CallArgs<D['input'], SubscribeOptions<TContext>>
        ): TrpcSubscription<
          ClientValue<D['output'], ResultForm<TForm, TLinks>>,
          CallError<D, ResultForm<TForm, TLinks>, TLinkErrors>
        >;
      };

declare const clientTypes: unique symbol;

/**
 * The typed client for a router. Outputs follow the form the links declare
 * (their serializer's); `TForm` overrides it, as in-process callers do
 * (values by reference keep their types).
 * @since 0.1.0
 * @stability stable
 */
export type TrpcClient<
  TRouter,
  TContext extends object = {},
  TForm extends OutputForm | undefined = undefined,
  TLinks extends ChainTypes = {},
> = ClientRouter<TRouter, TContext, TForm, TLinks> & {
  /**
   * Types only, never set: what {@link ClientTypes} reads. A method, so
   * its parameter doesn't change which clients are assignable to which.
   */
  [clientTypes]?(types: {
    router: TRouter;
    context: TContext;
    links: TForm extends OutputForm
      ? Omit<TLinks, 'form'> & { form: TForm }
      : TLinks;
  }): void;
};

type ClientRouter<
  TRouter,
  TContext extends object,
  TForm extends OutputForm | undefined,
  TLinks extends ChainTypes,
> = {
  [K in keyof TRouter]: TRouter[K] extends AnyProcedure
    ? DecorateProcedure<TRouter[K], TContext, TForm, TLinks>
    : ClientRouter<Unlazy<TRouter[K]>, TContext, TForm, TLinks>;
};

/**
 * A client type's router, link context and link types (with the form
 * results arrive in), or `never` for a type that isn't a {@link TrpcClient}.
 *
 * @example
 * ```ts
 * type AppClient = ReturnType<typeof makeClient>;
 * type Context = ClientTypes<AppClient>['context'];
 * ```
 * @since 0.1.0
 * @stability stable
 */
export type ClientTypes<T> = T extends {
  [clientTypes]?(types: infer X): void;
}
  ? unknown extends X
    ? never
    : X
  : never;

declare const routerTypeBrand: unique symbol;

/**
 * A value that carries a router type and nothing else (17 D-C). Made by
 * {@link routerType}.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export function routerType<TRouter>(): RouterType<TRouter> {
  return {} as RouterType<TRouter>;
}

/**
 * The router a `router:` value describes: a {@link RouterType}, a contract
 * or a router.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
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

type ProvidesOf<TLink> =
  DeclOf<TLink> extends infer D
    ? D extends { provides: infer P extends string }
      ? P
      : never
    : never;

type NeedsOf<TLink> =
  DeclOf<TLink> extends infer D
    ? D extends { needs: infer N extends string }
      ? N
      : never
    : never;

/** The first need, from the end, that no link after its link provides. */
type UnmetNeed<
  TLinks,
  TBelow extends string = never,
> = TLinks extends readonly [...infer Rest, infer Last]
  ? [Exclude<NeedsOf<Last>, TBelow>] extends [never]
    ? UnmetNeed<Rest, TBelow | ProvidesOf<Last>>
    : Exclude<NeedsOf<Last>, TBelow>
  : never;

/**
 * A type error on `links` when a link needs something (`needs`) that no
 * link after it provides. A link reads what's below it, so a provider
 * before it doesn't count.
 * @internal
 */
export type UnmetNeedCheck<TLinks> = [UnmetNeed<TLinks>] extends [never]
  ? unknown
  : {
      links: `A link needs '${UnmetNeed<TLinks>}' from a link after it`;
    };

/**
 * Every procedure path of a router, `'post.byId'`.
 * @since 0.1.0
 * @stability stable
 */
export type RouterPaths<TRouter, TPrefix extends string = ''> =
  IsAny<TRouter> extends true
    ? string
    : {
        [K in keyof TRouter & string]: TRouter[K] extends AnyProcedure
          ? `${TPrefix}${K}`
          : RouterPaths<Unlazy<TRouter[K]>, `${TPrefix}${K}.`>;
      }[keyof TRouter & string];

import type {
  BuiltinErrorCode,
  ClientTags,
  TrpcError,
  UndeclaredCode,
} from '../internal/error.ts';
import type {
  ClientValue,
  ProgressiveJsonForm,
  IsAny,
  JsonForm,
  JsonOf,
  OutputForm,
  ProcedureResponse,
  ProcedureType,
} from '../internal/types.ts';
import type {
  AnyProcedure,
  ProcedureDef,
  ProcedureDefOf,
  ProcedureTypeOf,
  Unlazy,
} from '../server/procedures/index.ts';
import type { AnyLink, DeclContext, TrpcLink } from './link.ts';

/**
 * An error's `data` as it arrives under a transformer's form, like outputs:
 * its JSON form unless the transformer keeps the types. Input validation
 * issues are JSON already, so they keep theirs.
 * @since 0.1.0
 * @stability stable
 */
export type ErrorData<
  D,
  F extends OutputForm = ProgressiveJsonForm,
> = F['streaming'] extends true
  ? D
  : unknown extends D
    ? D
    : '~issues' extends keyof D
      ? D
      : JsonOf<Exclude<D, undefined>, F['keeps']> | Extract<D, undefined>;

/**
 * A typed (`defined`) error from a procedure's union, its `data` in the
 * transformer's form `F`.
 * @since 0.1.0
 * @stability stable
 */
export type DefinedError<E, F extends OutputForm = ProgressiveJsonForm> =
  E extends TrpcError<infer C, infer D, infer T>
    ? TrpcError<C, ErrorData<D, F>, T> & { readonly defined: true }
    : never;

/**
 * An error from outside the procedure's typed union, one member per
 * built-in code's class: network failures (`NetworkError`), aborts
 * (`ClientClosedRequest`) and timeouts (`Timeout`), unreadable responses
 * (`BadResponse`), crashes
 * (`InternalServerError`, masked in production), thrown built-in codes
 * and a proxy's statuses (`Unauthorized`, `BadGateway`). The failures
 * clients act on have their own member too ({@link ClientTags}):
 * `ProcedureNotFound`, `ProcedureTypeMismatch` and `TransformerMismatch`.
 * It never has `data`. Pass a code to name one:
 * `BuiltinError<'NETWORK_ERROR'>`.
 * @since 0.1.0
 * @stability stable
 */
export type BuiltinError<TCode extends BuiltinErrorCode = BuiltinErrorCode> =
  TCode extends BuiltinErrorCode
    ?
        | (TrpcError<TCode, undefined> & { readonly defined: false })
        | (TCode extends ClientTags[keyof ClientTags]
            ? ClientTagError<TCode>
            : never)
    : never;

/** {@link BuiltinError}'s members for the {@link ClientTags} of `TCode`. @internal */
export type ClientTagError<TCode extends BuiltinErrorCode> = {
  [T in keyof ClientTags]: ClientTags[T] extends TCode
    ? TrpcError<TCode, undefined, T> & { readonly defined: false }
    : never;
}[keyof ClientTags];

/**
 * A `TrpcError` with a custom code that a procedure without `.errors()`
 * threw rather than returned: `defined: false`, its code and `data`
 * untyped. `matchError()` hands it to `unexpected`.
 * @since 0.1.0
 * @stability stable
 */
export type UndeclaredError = TrpcError<UndeclaredCode, unknown> & {
  readonly defined: false;
};

/**
 * The built-in codes only links make, which a link declares with
 * `builtinErrors` so that calls through it can fail with them:
 * `NETWORK_ERROR` (no response, or the connection dropped), `BAD_RESPONSE`
 * (a response that isn't tRPC's or doesn't decode) and
 * `STREAM_INTERRUPTED` (a stream that stopped without an end).
 * @since 0.1.0
 * @stability stable
 */
export type LinkErrorCode =
  | 'NETWORK_ERROR'
  | 'BAD_RESPONSE'
  | 'STREAM_INTERRUPTED';

/**
 * What a call can fail with: the procedure's defined errors, the built-in
 * ones, and an {@link UndeclaredError}. Every member but that one has a
 * literal `code`, so `switch (err.code)` narrows it; `err.defined` tells a
 * defined `NOT_FOUND` from a built-in one. `TLinkCodes` are the {@link LinkErrorCode}s the client's links declare;
 * the others are left out. Every link code by default.
 * @since 0.1.0
 * @stability stable
 */
export type ClientError<
  E,
  F extends OutputForm = ProgressiveJsonForm,
  TLinkCodes extends LinkErrorCode = LinkErrorCode,
> =
  | DefinedError<E, F>
  | BuiltinError<Exclude<BuiltinErrorCode, Exclude<LinkErrorCode, TLinkCodes>>>
  | UndeclaredError;

/**
 * A query's or mutation's errors: the procedure's in the result form (a
 * returned `Stream`'s failures among them), the links' as made.
 * `STREAM_INTERRUPTED` fails a stream after its call has resolved, so it's
 * left out unless the output is an `AsyncIterable` (whose error TanStack's
 * streamed queries report); values deferred inside an output reject with
 * it untyped.
 * @internal
 */
export type CallError<
  D extends ProcedureDef,
  F extends OutputForm,
  TLinks extends ChainTypes,
> =
  D['output'] extends AsyncIterable<any>
    ? StreamedError<D, F, TLinks>
    :
        | ClientError<D['errors'], F, UnstreamedLinkCodes<TLinks>>
        | DefinedError<ChainErrors<TLinks>>;

/** {@link CallError} for an output that's an `AsyncIterable`. @internal */
export type StreamedError<
  D extends ProcedureDef,
  F extends OutputForm,
  TLinks extends ChainTypes,
> =
  | ClientError<
      D['errors'],
      F,
      // An output that's `never` only fails, with a response that isn't a stream.
      [D['output']] extends [never]
        ? UnstreamedLinkCodes<TLinks>
        : ChainLinkCodes<TLinks>
    >
  | DefinedError<ChainErrors<TLinks>>;

/**
 * A query's or mutation's `TrpcPromise` for a streamed output: the output
 * is a {@link TrpcIterable} carrying the call's errors. The methods pick it
 * with an inline conditional on the output, which calls that don't stream
 * pay nothing for; an alias around both branches cost them more.
 * @internal
 */
export type StreamedPromise<V, E> = TrpcPromise<Streamed<V, E>, E>;

/** A subscription's errors: every link code its chain declares. @internal */
export type SubscriptionError<
  D extends ProcedureDef,
  F extends OutputForm,
  TLinks extends ChainTypes,
> =
  | ClientError<D['errors'], F, ChainLinkCodes<TLinks>>
  | DefinedError<ChainErrors<TLinks>>;

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
 * A query's or mutation's streamed output (a generator or `Stream` on the
 * server), carrying the call's errors as a subscription does: iterate it
 * with `for await`, or through `safe()` to get each step as a result.
 * @since 0.1.0
 * @stability experimental
 */
export type TrpcIterable<T, TReturn, E> = AsyncIterable<T, TReturn> & {
  readonly '~error'?: E;
};

/**
 * A call's value `V` whose root `AsyncIterable` carries the call's errors
 * `E`: a {@link TrpcIterable}, by intersection, which is cheaper than
 * inferring its item and return types. A `ReadableStream` keeps its own
 * type: its bytes have no typed failures.
 * @internal
 */
export type Streamed<V, E> =
  V extends ReadableStream<any> ? V : V & { readonly '~error'?: E };

/**
 * Options for `query()` and `mutate()` (16 CS-A): `signal`, plus the fields
 * the client's links read (17 F-B), typed from what they declare: `headers`
 * only with a link that sends them, such as `httpLink`.
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
} & TContext;

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
  readonly builtinErrors?: LinkErrorCode;
  readonly unsupported?: ProcedureType;
  readonly batches?: true;
  readonly form?: OutputForm;
  readonly decodes?: object;
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
 * transformer streams files.
 */
type Unbatchable<TLinks extends ChainTypes> =
  | ProcedureResponse
  | (ResultForm<undefined, TLinks>['streaming'] extends true ? never : Blob);

/**
 * Only an output with one of these keys can be {@link Unbatchable}. Testing
 * a key first is cheaper than comparing every output with `Response` and
 * `Blob`, which a batching chain would otherwise do once per procedure.
 */
type BodyLike =
  | { readonly arrayBuffer: unknown }
  | { readonly '~effect/http/HttpServerResponse': unknown };

/**
 * The arguments of `query()`/`mutate()`. A procedure that may return a
 * `Response`, or a `Blob` under a transformer that doesn't stream files,
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
    : [Extract<TOutput, BodyLike>] extends [never]
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

/** @internal */
export type ChainErrors<T extends ChainTypes> = T extends { errors: infer E }
  ? E
  : never;

/**
 * The link codes a chain declares; every one unless the links say which,
 * so `TrpcClient<AppRouter>` takes any client.
 * @internal
 */
export type ChainLinkCodes<T extends ChainTypes> = T extends {
  builtinErrors: infer C extends LinkErrorCode;
}
  ? C
  : LinkErrorCode;

/** @internal */
export type UnstreamedLinkCodes<T extends ChainTypes> = Exclude<
  ChainLinkCodes<T>,
  'STREAM_INTERRUPTED'
>;

/** Whether the links can carry procedures of type `T`. @internal */
export type Carries<T, TLinks extends ChainTypes> = TLinks extends {
  unsupported: infer U;
}
  ? [T] extends [U]
    ? false
    : true
  : true;

/**
 * A procedure of type `_T` on a client whose links can't carry it: no
 * methods, and the name says why in the error when one is called.
 * @internal
 */
export interface NoLinkCarries<_T extends ProcedureType> {}

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
> = P extends AnyProcedure
  ? DecorateDef<ProcedureDefOf<P>, ProcedureTypeOf<P>, TContext, TForm, TLinks>
  : never;

type DecorateDef<
  D extends ProcedureDef,
  TType extends ProcedureType,
  TContext extends object,
  TForm extends OutputForm | undefined,
  TLinks extends ChainTypes,
> =
  Carries<TType, TLinks> extends false
    ? NoLinkCarries<TType>
    : DecorateCarried<D, TType, TContext, TForm, TLinks>;

type DecorateCarried<
  D extends ProcedureDef,
  TType extends ProcedureType,
  TContext extends object,
  TForm extends OutputForm | undefined,
  TLinks extends ChainTypes,
> = TType extends 'query'
  ? {
      query(
        ...args: ProcedureCallArgs<
          D['input'],
          D['output'],
          CallOptions<TContext>,
          TLinks
        >
      ): D['output'] extends AsyncIterable<any>
        ? StreamedPromise<
            ClientValue<D['output'], ResultForm<TForm, TLinks>>,
            StreamedError<D, ResultForm<TForm, TLinks>, TLinks>
          >
        : TrpcPromise<
            ClientValue<D['output'], ResultForm<TForm, TLinks>>,
            | ClientError<
                D['errors'],
                ResultForm<TForm, TLinks>,
                UnstreamedLinkCodes<TLinks>
              >
            | DefinedError<ChainErrors<TLinks>>
          >;
    }
  : TType extends 'mutation'
    ? {
        mutate(
          ...args: ProcedureCallArgs<
            D['input'],
            D['output'],
            CallOptions<TContext>,
            TLinks
          >
        ): D['output'] extends AsyncIterable<any>
          ? StreamedPromise<
              ClientValue<D['output'], ResultForm<TForm, TLinks>>,
              StreamedError<D, ResultForm<TForm, TLinks>, TLinks>
            >
          : TrpcPromise<
              ClientValue<D['output'], ResultForm<TForm, TLinks>>,
              | ClientError<
                  D['errors'],
                  ResultForm<TForm, TLinks>,
                  UnstreamedLinkCodes<TLinks>
                >
              | DefinedError<ChainErrors<TLinks>>
            >;
      }
    : {
        subscribe(
          ...args: CallArgs<D['input'], SubscribeOptions<TContext>>
        ): TrpcSubscription<
          ClientValue<D['output'], ResultForm<TForm, TLinks>>,
          SubscriptionError<D, ResultForm<TForm, TLinks>, TLinks>
        >;
      };

declare const clientTypes: unique symbol;

/**
 * The typed client for a router. Outputs follow the form the links declare
 * (their transformer's); `TForm` overrides it, as in-process callers do
 * (values by reference keep their types).
 * @since 0.1.0
 * @stability stable
 */
export type TrpcClient<
  TRouter,
  TContext extends object = {},
  TForm extends OutputForm | undefined = undefined,
  TLinks extends ChainTypes = {},
> = (TForm extends OutputForm
  ? ClientRouter<TRouter, TContext, TForm, TLinks>
  : [Decodes<TLinks>] extends [never]
    ? ClientRouter<TRouter, TContext, TForm, TLinks>
    : DecodingRouter<
        TRouter,
        Decodes<TLinks>,
        TContext,
        TLinks,
        ResultForm<undefined, TLinks>,
        DecodedFormOf<ResultForm<undefined, TLinks>>
      >) & {
  /**
   * Types only, never set: what {@link ClientTypes} reads. A method, so
   * its parameter doesn't change which clients are assignable to which.
   */
  [clientTypes]?(types: {
    router: TRouter;
    context: TContext;
    links: TForm extends OutputForm
      ? Omit<TLinks, 'form' | 'decodes'> & { form: TForm }
      : TLinks;
  }): void;
};

type ClientRouter<
  TRouter,
  TContext extends object,
  TForm extends OutputForm | undefined,
  TLinks extends ChainTypes,
> = {
  [K in keyof TRouter & string]: TRouter[K] extends AnyProcedure
    ? DecorateProcedure<TRouter[K], TContext, TForm, TLinks>
    : ClientRouter<Unlazy<TRouter[K]>, TContext, TForm, TLinks>;
};

/**
 * The contract a chain's links decode results with (`decodes`), or `never`.
 * An untyped one decodes nothing the types can know of.
 * @internal
 */
export type Decodes<TLinks extends ChainTypes> = TLinks extends {
  decodes: infer C extends object;
}
  ? IsAny<C> extends true
    ? never
    : C
  : never;

/**
 * The form of a procedure's results and declared errors' `data` that a
 * link decoded with their schemas (`experimental_validationLink` with
 * `output: 'json'`) on a chain whose links' form is `F`: the schemas'
 * types. A form that keeps every type already has them.
 * @internal
 */
export type DecodedFormOf<F extends OutputForm> = F['streaming'] extends true
  ? F
  : ProgressiveJsonForm;

/**
 * The form procedure `P`'s results arrive in on a chain whose links decode
 * them with contract node `C`'s output schema: `TDecoded` if `C` is a
 * procedure whose output is validated, else the links' form `F`. Streamed
 * outputs pass through undecoded; a path the contract doesn't have, or a
 * lazy subtree, has no node.
 * @internal
 */
export type DecodedForm<
  P,
  C,
  F extends OutputForm,
  TDecoded extends OutputForm,
> = C extends {
  readonly '~trpc': {
    readonly '~types'?: { readonly outputValidated: infer V };
  };
}
  ? true extends V
    ? ProcedureDefOf<P>['output'] extends AsyncIterable<any>
      ? F
      : TDecoded
    : F
  : F;

/**
 * Procedure `P`'s def on a chain whose links decode with contract node
 * `C`, links' form `F`: where its results are decoded ({@link DecodedForm}),
 * errors whose code `C` doesn't declare with `.errors()` keep their `data`
 * in `F`, since the link has no schema to decode it with. A form that
 * keeps every type needs nothing.
 * @internal
 */
export type DecodedDef<P, C, F extends OutputForm> = F['streaming'] extends true
  ? ProcedureDefOf<P>
  : C extends {
        readonly '~trpc': {
          readonly '~types'?: {
            readonly outputValidated: infer V;
            readonly declared?: infer M;
          };
        };
      }
    ? true extends V
      ? ProcedureDefOf<P>['output'] extends AsyncIterable<any>
        ? ProcedureDefOf<P>
        : UndecodedErrors<ProcedureDefOf<P>, unknown extends M ? never : M, F>
      : ProcedureDefOf<P>
    : ProcedureDefOf<P>;

/** `D` with the `data` of errors whose code isn't one of `TCodes` in form `F`. */
interface UndecodedErrors<
  D extends ProcedureDef,
  TCodes,
  F extends OutputForm,
> {
  input: D['input'];
  output: D['output'];
  errors: EncodedErrors<D['errors'], TCodes, F>;
}

type EncodedErrors<E, TCodes, F extends OutputForm> =
  E extends TrpcError<infer C, infer D, infer T>
    ? C extends TCodes
      ? E
      : TrpcError<C, ErrorData<D, F>, T>
    : E;

/**
 * The child of contract node `C` at key `K`, walked beside the router;
 * `{}` (no procedures) where the contract has none.
 * @internal
 */
export type ContractAt<C, K> = K extends keyof C ? C[K] : {};

/**
 * {@link ClientRouter} on a chain with a link that decodes results with
 * contract `C`'s schemas: each procedure's results in its
 * {@link DecodedForm}, `F` being the links' form and `TDecoded` the decoded
 * one. Picked once per client, so other chains pay nothing.
 */
type DecodingRouter<
  TRouter,
  C,
  TContext extends object,
  TLinks extends ChainTypes,
  F extends OutputForm,
  TDecoded extends OutputForm,
> = {
  [K in keyof TRouter & string]: TRouter[K] extends AnyProcedure
    ? DecorateDef<
        DecodedDef<TRouter[K], ContractAt<C, K>, F>,
        ProcedureTypeOf<TRouter[K]>,
        TContext,
        DecodedForm<TRouter[K], ContractAt<C, K>, F, TDecoded>,
        TLinks
      >
    : DecodingRouter<
        Unlazy<TRouter[K]>,
        ContractAt<C, K>,
        TContext,
        TLinks,
        F,
        TDecoded
      >;
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
  builtinErrors: LinkCodesOf<TLinks[number]>;
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
  decodes: DeclOf<TLinks[number]> extends infer D
    ? D extends { decodes: infer C }
      ? C
      : never
    : never;
};

/** An untyped link (`TrpcLink<any>`) could make any of them. */
type LinkCodesOf<TLink> =
  TLink extends TrpcLink<infer D, any>
    ? IsAny<D> extends true
      ? LinkErrorCode
      : D extends { builtinErrors: infer C extends LinkErrorCode }
        ? C
        : never
    : never;

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

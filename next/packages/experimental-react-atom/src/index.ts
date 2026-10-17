/**
 * tRPC as Effect Atoms (`effect/reactivity`), read in React with
 * `useAtomSuspense` from `@effect/atom-react`. Modeled on Effect's
 * `AtomRpc`: query atoms with reactivity keys and a time-to-live, mutation
 * atoms that invalidate keys, and subscription atoms holding the latest
 * event. Every export is experimental, as the package name says.
 *
 * @example
 * ```ts
 * import { createAtomClient } from '@trpc12/experimental-react-atom';
 *
 * export const trpc = createAtomClient({
 *   router: routerType<AppRouter>(),
 *   links: [httpLink({ url: '/trpc', serializer: createSerializer() })],
 * });
 *
 * const post = useAtomSuspense(trpc.post.byId.query({ id })).value;
 * ```
 * @module
 */
import {
  Duration,
  Layer,
  Schema,
  SchemaTransformation,
  type Cause,
  type Effect,
  type Stream,
} from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/reactivity';
import {
  createTrpcClient,
  getClientSerializer,
  type LinksContext,
  type LinksTypes,
  type RouterOf,
  type TrpcLink,
  type TypedClientOptions,
} from '@trpc12/trpc/client';
import { createEffectClient, type EffectClient } from '@trpc12/trpc/effect';
import {
  createSerializer,
  jsonSerializer,
  type AnySerializer,
  type SerializeReturn,
} from '@trpc12/trpc/serializer';

/** Keys use danSON, so inputs with `Date`s and `Map`s key apart. */
const keySerializer = createSerializer();

/**
 * Reactivity keys: a list, or lists by namespace, as `Reactivity` takes them.
 * @since 0.1.0
 * @stability experimental
 */
export type ReactivityKeys =
  | ReadonlyArray<unknown>
  | Readonly<Record<string, ReadonlyArray<unknown>>>;

/**
 * Options for a query atom. They are part of its identity: the same input
 * with other options is another atom.
 * @since 0.1.0
 * @stability experimental
 */
export interface QueryAtomOptions {
  /** Refetch when a mutation invalidates one of these keys. */
  readonly reactivityKeys?: ReactivityKeys | undefined;
  /** Keep the result this long once unused; `Infinity` keeps it alive. */
  readonly timeToLive?: Duration.Input | undefined;
}

/**
 * What a mutation atom is set with.
 * @since 0.1.0
 * @stability experimental
 */
export interface MutationArg<TInput> {
  readonly input: TInput;
  /** Invalidated after the mutation succeeds. */
  readonly reactivityKeys?: ReactivityKeys | undefined;
}

/**
 * The atoms for one procedure, from its Effect client method: `query()`,
 * `mutation()` or `subscription()`.
 * @since 0.1.0
 * @stability experimental
 */
export type DecorateAtomProcedure<P> = P extends {
  query(...args: infer A): Effect.Effect<infer T, infer E>;
}
  ? {
      /** The query's atom. The same input and options give the same atom. */
      query(
        input: A[0],
        options?: QueryAtomOptions,
      ): Atom.Atom<AsyncResult.AsyncResult<T, E>>;
    }
  : P extends { mutate(...args: infer A): Effect.Effect<infer T, infer E> }
    ? {
        /** The mutation's function atom: `registry.set(atom, { input })`. */
        mutation(): Atom.AtomResultFn<MutationArg<A[0]>, T, E>;
      }
    : P extends {
          subscribe(...args: infer A): Stream.Stream<infer T, infer E>;
        }
      ? {
          /** An atom holding the subscription's latest event. */
          subscription(
            input: A[0],
          ): Atom.Atom<
            AsyncResult.AsyncResult<T, E | Cause.NoSuchElementError>
          >;
        }
      : never;

/**
 * The atom client's procedure tree, mapped from an Effect client.
 * @since 0.1.0
 * @stability experimental
 */
export type AtomProcedures<C> = {
  [K in keyof C]: C[K] extends
    | { query: unknown }
    | { mutate: unknown }
    | { subscribe: unknown }
    ? DecorateAtomProcedure<C[K]>
    : AtomProcedures<C[K]>;
};

/**
 * What {@link createAtomClient} returns.
 * @since 0.1.0
 * @stability experimental
 */
export type AtomClient<TEffectClient> = AtomProcedures<TEffectClient> & {
  /** The runtime the atoms run in. */
  readonly runtime: Atom.AtomRuntime<never>;
  /** The Effect client the atoms call. */
  readonly client: TEffectClient;
};

/**
 * Options for {@link createAtomClient}.
 * @since 0.1.0
 * @stability experimental
 */
export type AtomClientOptions<
  TSource,
  TLinks extends ReadonlyArray<TrpcLink<any, RouterOf<TSource>>>,
> = TypedClientOptions<TSource, TLinks> & {
  /**
   * How query results are encoded for `Hydration.dehydrate`. Must match the
   * one that hydrates them.
   * @default the links' serializer, else jsonSerializer
   */
  readonly serializer?: AnySerializer | undefined;
};

/**
 * A `Schema` whose encoded form is `serializer`'s, for `Atom.serializable`:
 * a value encodes as the wire does, so `Date`s and `Map`s survive
 * `Hydration.dehydrate` with danSON. Query atoms already use one; this is
 * for atoms of your own that hold procedure outputs.
 *
 * @example
 * ```ts
 * const schema = AsyncResult.Schema({ success: serializerSchema(createSerializer()) });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function serializerSchema(
  serializer: AnySerializer,
): Schema.Codec<unknown, Schema.Json> {
  return Schema.Json.pipe(
    Schema.decodeTo(
      Schema.Unknown,
      SchemaTransformation.transform({
        decode: (json: Schema.Json) =>
          serializer.deserialize(json as SerializeReturn),
        encode: (value: unknown) => serializer.serialize(value) as Schema.Json,
      }),
    ),
  );
}

interface Key {
  readonly type: 'query' | 'subscription';
  readonly path: string;
  readonly input: unknown;
  readonly options: QueryAtomOptions | undefined;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Plain objects' keys sorted at any depth, so key order doesn't split atoms. */
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isPlainObject(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort())
    sorted[key] = sortKeys(value[key]);
  return sorted;
};

const keyString = (key: Key): string =>
  JSON.stringify([
    key.type,
    key.path,
    key.input === undefined
      ? null
      : keySerializer.serialize(sortKeys(key.input)),
    key.options?.reactivityKeys ?? null,
    key.options?.timeToLive === undefined
      ? null
      : Duration.toMillis(Duration.fromInputUnsafe(key.options.timeToLive)),
  ]);

const at = (client: unknown, path: string): any =>
  path.split('.').reduce((node: any, segment) => node[segment], client);

/**
 * Creates the atom client: `trpc.post.byId.query(input)` is an atom of the
 * query's `AsyncResult`, with the procedure's typed errors. The same call
 * gives the same atom.
 *
 * Query atoms are serializable, keyed by path and input, so
 * `Hydration.dehydrate(registry)` on the server and `HydrationBoundary`
 * (or `Hydration.hydrate`) in the browser carry settled results across. A
 * failed result isn't carried: the browser runs the query again.
 *
 * @example
 * ```ts
 * const trpc = createAtomClient({ router: routerType<AppRouter>(), links: [httpLink({ url })] });
 * const post = trpc.post.byId.query({ id }, { reactivityKeys: ['posts'] });
 * const rename = trpc.post.rename.mutation();
 * registry.set(rename, { input, reactivityKeys: ['posts'] }); // refetches `post`
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function createAtomClient<
  TSource,
  const TLinks extends ReadonlyArray<TrpcLink<any, RouterOf<TSource>>>,
>(
  opts: AtomClientOptions<TSource, TLinks>,
): AtomClient<
  EffectClient<RouterOf<TSource>, LinksContext<TLinks>, LinksTypes<TLinks>>
>;
export function createAtomClient(opts: {
  router: unknown;
  links: ReadonlyArray<TrpcLink<any, any>>;
  serializer?: AnySerializer | undefined;
}): unknown {
  const client = createEffectClient(opts);
  const serializer =
    opts.serializer ??
    getClientSerializer(createTrpcClient(opts)) ??
    jsonSerializer;
  const resultSchema = AsyncResult.Schema({
    success: serializerSchema(serializer),
  });
  const runtime = Atom.runtime(Layer.empty);
  const keys = new Map<string, Key>();

  const atoms = Atom.family((id: string) => {
    const key = keys.get(id)!;
    const { options } = key;
    let atom: Atom.Atom<any> =
      key.type === 'query'
        ? runtime.atom(
            at(client, key.path).query(key.input) as Effect.Effect<unknown>,
          )
        : runtime.atom(
            at(client, key.path).subscribe(key.input) as Stream.Stream<unknown>,
          );
    if (options?.reactivityKeys) {
      atom = runtime.factory.withReactivity(options.reactivityKeys)(atom);
    }
    if (options?.timeToLive !== undefined) {
      const ttl = Duration.fromInputUnsafe(options.timeToLive);
      atom = Duration.isFinite(ttl)
        ? Atom.setIdleTTL(atom, ttl)
        : Atom.keepAlive(atom);
    }
    if (key.type === 'query') {
      atom = Atom.serializable(atom, {
        key: `trpc:${id}`,
        schema: resultSchema as Schema.Codec<unknown, unknown>,
      });
    }
    return atom;
  });
  const atomFor = (key: Key) => {
    const id = keyString(key);
    if (!keys.has(id)) keys.set(id, key);
    return atoms(id);
  };

  const mutations = Atom.family((path: string) =>
    runtime.fn<{ input: unknown; reactivityKeys?: ReactivityKeys }>()(
      (args) => {
        const call = at(client, path).mutate(
          args.input,
        ) as Effect.Effect<unknown>;
        return args.reactivityKeys
          ? Reactivity.mutation(call, args.reactivityKeys)
          : call;
      },
    ),
  );

  const proxy = (path: string[]): any =>
    new Proxy(
      (...args: unknown[]) => {
        const method = path.at(-1);
        const procedure = path.slice(0, -1).join('.');
        if (method === 'query' || method === 'subscription') {
          return atomFor({
            type: method,
            path: procedure,
            input: args[0],
            options: args[1] as QueryAtomOptions | undefined,
          });
        }
        if (method === 'mutation') return mutations(procedure);
        throw new TypeError(
          `Call .query(), .mutation() or .subscription() on a procedure, not ${path.join('.')}()`,
        );
      },
      {
        get: (_, key) => {
          if (path.length === 0 && key === 'runtime') return runtime;
          if (path.length === 0 && key === 'client') return client;
          return typeof key === 'string' && key !== 'then'
            ? proxy([...path, key])
            : undefined;
        },
      },
    );
  return proxy([]);
}

/**
 * Spike D (decision react-use-package): `AtomTrpc`, modeled on Effect's
 * `AtomRpc` (`effect/reactivity`). Query atoms with reactivity keys and
 * time-to-live, mutation atoms that invalidate keys, subscription atoms
 * holding the latest event. Built on the Effect client, so atoms carry the
 * procedures' typed errors.
 */
import type { AnyLink, RouterOf } from '@trpc12/trpc/client';
import { createEffectClient, type EffectClient } from '@trpc12/trpc/effect';
import { createSerializer } from '@trpc12/trpc/serializer';
import { Duration, Layer, type Cause, type Effect, type Stream } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/reactivity';

/** Keys use danSON, so inputs with `Date`s and `Map`s key apart. */
const keySerializer = createSerializer();

type ReactivityKeys =
  ReadonlyArray<unknown> | Readonly<Record<string, ReadonlyArray<unknown>>>;

export interface QueryAtomOptions {
  /** Refetch when a mutation invalidates one of these keys. */
  readonly reactivityKeys?: ReactivityKeys | undefined;
  /** Keep the result this long once unused; `Infinity` keeps it alive. */
  readonly timeToLive?: Duration.Input | undefined;
}

export interface MutationArg<TInput> {
  readonly input: TInput;
  /** Invalidated after the mutation succeeds. */
  readonly reactivityKeys?: ReactivityKeys | undefined;
}

/** The atom helpers for one procedure, from its Effect client methods. */
export type AtomProcedure<P> = P extends {
  query(...args: infer A): Effect.Effect<infer T, infer E>;
}
  ? {
      query(
        input: A[0],
        options?: QueryAtomOptions,
      ): Atom.Atom<AsyncResult.AsyncResult<T, E>>;
    }
  : P extends { mutate(...args: infer A): Effect.Effect<infer T, infer E> }
    ? { mutation(): Atom.AtomResultFn<MutationArg<A[0]>, T, E> }
    : P extends {
          subscribe(...args: infer A): Stream.Stream<infer T, infer E>;
        }
      ? {
          subscription(
            input: A[0],
          ): Atom.Atom<
            AsyncResult.AsyncResult<T, E | Cause.NoSuchElementError>
          >;
        }
      : never;

export type AtomClient<C> = {
  [K in keyof C]: C[K] extends
    { query: unknown } | { mutate: unknown } | { subscribe: unknown }
    ? AtomProcedure<C[K]>
    : AtomClient<C[K]>;
};

export type AtomTrpc<TRouter> = AtomClient<EffectClient<TRouter>> & {
  readonly runtime: Atom.AtomRuntime<never>;
  readonly client: EffectClient<TRouter>;
};

interface Key {
  readonly type: 'query' | 'subscription';
  readonly path: string;
  readonly input: unknown;
  readonly options: QueryAtomOptions | undefined;
}

const keyString = (key: Key): string =>
  JSON.stringify([
    key.type,
    key.path,
    key.input === undefined ? null : keySerializer.serialize(key.input),
    key.options?.reactivityKeys ?? null,
    key.options?.timeToLive === undefined
      ? null
      : Duration.toMillis(Duration.fromInputUnsafe(key.options.timeToLive)),
  ]);

const at = (client: unknown, path: string): any =>
  path.split('.').reduce((node: any, segment) => node[segment], client);

export function make<TSource>(opts: {
  readonly router: TSource;
  readonly links: ReadonlyArray<AnyLink>;
}): AtomTrpc<RouterOf<TSource>> {
  const client = createEffectClient(opts) as EffectClient<RouterOf<TSource>>;
  const runtime = Atom.runtime(Layer.empty);
  const keys = new Map<string, Key>();

  const atoms = Atom.family((id: string) => {
    const { type, path, input, options } = keys.get(id)!;
    let atom: Atom.Atom<any> =
      type === 'query'
        ? runtime.atom(at(client, path).query(input) as Effect.Effect<unknown>)
        : runtime.atom(
            at(client, path).subscribe(input) as Stream.Stream<unknown>,
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
    return atom;
  });
  const atomFor = (key: Key) => {
    const id = keyString(key);
    if (!keys.has(id)) keys.set(id, key);
    return atoms(id);
  };

  const mutations = Atom.family((path: string) =>
    runtime.fn<MutationArg<unknown>>()(({ input, reactivityKeys }) => {
      const call = at(client, path).mutate(input) as Effect.Effect<unknown>;
      return reactivityKeys ? Reactivity.mutation(call, reactivityKeys) : call;
    }),
  );

  const proxy = (path: string[]): any =>
    new Proxy(() => {}, {
      get: (_, key) => {
        if (path.length === 0 && key === 'runtime') return runtime;
        if (path.length === 0 && key === 'client') return client;
        return typeof key === 'string' ? proxy([...path, key]) : undefined;
      },
      apply: (_, __, args: unknown[]) => {
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
        throw new TypeError(`${path.join('.')} is not a procedure method`);
      },
    });
  return proxy([]);
}

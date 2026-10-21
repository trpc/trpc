/**
 * The client half every option shares. A call's error type is handed in
 * (the registry's union plus tRPC's failures) instead of inferred from the
 * procedure, so every call through a client has the same one. The runtime
 * is v12's own client and `httpLink`, wrapped so each rejection is rebuilt
 * as a registry error.
 */
import { Effect } from 'effect';
import {
  createTrpcClient,
  httpLink,
  routerType,
  type AnyLink,
} from '@trpc12/trpc/client';
import {
  createFetchHandler,
  type AnyProcedure,
  type AnyRouter,
  type ProcedureDef,
} from '@trpc12/trpc/server';
import type { Registry } from './define.ts';
import { decodeWith, type UnexpectedTag } from './framework.ts';

/** A call's `Promise`, carrying its error type for {@link safe}. */
export interface RegistryPromise<T, E> extends Promise<T> {
  readonly '~error'?: E;
}

type Args<I> = undefined extends I ? [input?: I] : [input: I];

type Def<P extends AnyProcedure> = NonNullable<P['~trpc']['~types']>;

type Call<D extends ProcedureDef, E> = D['type'] extends 'mutation'
  ? { mutate(...args: Args<D['input']>): RegistryPromise<D['output'], E> }
  : { query(...args: Args<D['input']>): RegistryPromise<D['output'], E> };

type EffectCall<D extends ProcedureDef, E> = D['type'] extends 'mutation'
  ? { mutate(...args: Args<D['input']>): Effect.Effect<D['output'], E> }
  : { query(...args: Args<D['input']>): Effect.Effect<D['output'], E> };

declare const errorsKey: unique symbol;

/**
 * A router node typed with the errors its subtree's calls fail with. A
 * symbol key, type-only, so the router still fits v12's `AnyRouter`.
 */
export type Scoped<E> = { readonly [errorsKey]?: E };

type ScopeOf<R, E> = R extends Scoped<infer S> ? S : E;

/** The Promise client: every call fails with `E`. */
export type RegistryClient<R, E> = {
  [K in keyof R & string]: R[K] extends AnyProcedure
    ? Call<Def<R[K]>, E>
    : RegistryClient<R[K], ScopeOf<R[K], E>>;
};

/** The Effect client: every call is an `Effect` failing with `E`. */
export type RegistryEffectClient<R, E> = {
  [K in keyof R & string]: R[K] extends AnyProcedure
    ? EffectCall<Def<R[K]>, E>
    : RegistryEffectClient<R[K], ScopeOf<R[K], E>>;
};

const proxy = (
  call: (path: ReadonlyArray<string>, args: ReadonlyArray<unknown>) => unknown,
  path: ReadonlyArray<string> = [],
): unknown =>
  new Proxy(() => {}, {
    get: (_, key) =>
      typeof key === 'string' ? proxy(call, [...path, key]) : undefined,
    apply: (_, __, args: unknown[]) => call(path, args),
  });

export interface RegistryClientOptions {
  readonly links: ReadonlyArray<AnyLink>;
  /** The registry at runtime, to rebuild its classes: `instanceof` holds. */
  readonly registry: Registry;
}

const at = (client: unknown, path: ReadonlyArray<string>) =>
  path.reduce<any>((node, key) => node[key], client) as (
    ...args: ReadonlyArray<unknown>
  ) => Promise<unknown>;

/** The Promise client over v12's, rebuilding every error it rejects with. */
export function createRegistryClient<TClient>(
  opts: RegistryClientOptions,
): TClient {
  const inner = createTrpcClient({
    router: routerType<any>(),
    links: opts.links as [AnyLink],
  });
  const decode = decodeWith(opts.registry);
  return proxy((path, args) =>
    at(inner, path)(...args).catch((cause: unknown) => {
      throw decode(cause);
    }),
  ) as TClient;
}

/** The Effect client: each call an `Effect` whose failure is the registry's. */
export function createRegistryEffectClient<TClient>(
  opts: RegistryClientOptions,
): TClient {
  const inner = createTrpcClient({
    router: routerType<any>(),
    links: opts.links as [AnyLink],
  });
  const decode = decodeWith(opts.registry);
  return proxy((path, args) =>
    Effect.tryPromise({
      try: (signal) => at(inner, path)(args[0], { signal }),
      catch: decode,
    }),
  ) as TClient;
}

/** `[data, error]`, the error typed with the call's `E`. */
export function safe<T, E>(
  promise: RegistryPromise<T, E>,
): Promise<[data: T, error: undefined] | [data: undefined, error: E]> {
  return promise.then(
    (data) => [data, undefined],
    (error: E) => [undefined, error],
  );
}

type Tagged = { readonly _tag: string };

type Keyed<E extends Tagged> = {
  [M in E as M['_tag'] extends UnexpectedTag ? never : M['_tag']]: (
    e: M,
  ) => unknown;
};
type Optional<E extends Tagged> = {
  [M in E as M['_tag'] extends UnexpectedTag ? M['_tag'] : never]?: (
    e: M,
  ) => unknown;
};
type Rest<E extends Tagged> = [Extract<E, { _tag: UnexpectedTag }>] extends [
  never,
]
  ? {}
  : { unexpected: (e: Extract<E, { _tag: UnexpectedTag }>) => unknown };

/**
 * One handler per tag of the app's registry and per link failure, all
 * required; tRPC's other failures go to `unexpected`, or to a handler of
 * their own when a call names them.
 */
export type Handlers<E extends Tagged> = Keyed<E> & Optional<E> & Rest<E>;

type Leftover<K extends PropertyKey> = {
  [P in K]: `'${P & string}' handles no error of this call`;
};

type ResultOf<H> = {
  [K in keyof H]: H[K] extends (...args: any) => infer R ? R : never;
}[keyof H];

/** Exhaustive by `_tag`: a tag without a handler doesn't compile. */
export function matchError<E extends Tagged, const H extends Handlers<E>>(
  err: E,
  handlers: H & Leftover<Exclude<keyof H, keyof Handlers<E>>>,
): ResultOf<H> {
  const byTag = handlers as unknown as Record<
    string,
    ((e: E) => ResultOf<H>) | undefined
  >;
  const handler = byTag[err._tag] ?? byTag['unexpected'];
  if (!handler) throw err;
  return handler(err);
}

/** A client and handler over one router, with `fetch` going to the handler. */
export function serve(router: AnyRouter) {
  const handler = createFetchHandler({
    router,
    createContext: (opts) => ({
      user: opts.request.headers['authorization'] ?? null,
    }),
  });
  const requests: Array<{ status: number; body: unknown }> = [];
  const link = httpLink({
    url: 'http://localhost/trpc',
    fetch: async (url, init) => {
      const res = await handler.fetch(new Request(url, init));
      requests.push({ status: res.status, body: await res.clone().json() });
      return res;
    },
  });
  return { handler, link, requests };
}

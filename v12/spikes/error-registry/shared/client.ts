/**
 * The client half every option shares, and the only one: each call's
 * errors are inferred from its procedure in `typeof appRouter`, so the
 * client takes no registry and imports nothing of the app's at runtime.
 * The runtime is v12's own client and `httpLink`, with each rejection
 * passed through {@link toFailure}.
 */
import { Effect } from 'effect';
import {
  createTrpcClient,
  routerType,
  type AnyLink,
} from '@trpc12/trpc/client';
import type { AnyProcedure, ProcedureDef } from '@trpc12/trpc/server';
import { toFailure, type CallError, type UnexpectedTag } from './failures.ts';

/** A call's `Promise`, carrying its error type for {@link safe}. */
export interface RegistryPromise<T, E> extends Promise<T> {
  readonly '~error'?: E;
}

type Args<I> = undefined extends I ? [input?: I] : [input: I];

type Def<P extends AnyProcedure> = NonNullable<P['~trpc']['~types']>;

type Call<
  P extends AnyProcedure,
  D extends ProcedureDef = Def<P>,
> = P['~trpc']['type'] extends 'mutation'
  ? {
      mutate(
        ...args: Args<D['input']>
      ): RegistryPromise<D['output'], CallError<D['errors']>>;
    }
  : {
      query(
        ...args: Args<D['input']>
      ): RegistryPromise<D['output'], CallError<D['errors']>>;
    };

type EffectCall<
  P extends AnyProcedure,
  D extends ProcedureDef = Def<P>,
> = P['~trpc']['type'] extends 'mutation'
  ? {
      mutate(
        ...args: Args<D['input']>
      ): Effect.Effect<D['output'], CallError<D['errors']>>;
    }
  : {
      query(
        ...args: Args<D['input']>
      ): Effect.Effect<D['output'], CallError<D['errors']>>;
    };

/** The Promise client: each call fails with its own procedure's errors. */
export type RegistryClient<R> = {
  [K in keyof R & string]: R[K] extends AnyProcedure
    ? Call<R[K]>
    : RegistryClient<R[K]>;
};

/** The Effect client: each call an `Effect` failing with its own errors. */
export type RegistryEffectClient<R> = {
  [K in keyof R & string]: R[K] extends AnyProcedure
    ? EffectCall<R[K]>
    : RegistryEffectClient<R[K]>;
};

/** The errors of the call at `R`'s procedure `P`, for tests and helpers. */
export type ErrorsOfCall<P extends AnyProcedure> = CallError<Def<P>['errors']>;

const proxy = (
  call: (path: ReadonlyArray<string>, args: ReadonlyArray<unknown>) => unknown,
  path: ReadonlyArray<string> = [],
): unknown =>
  new Proxy(() => {}, {
    get: (_, key) =>
      typeof key === 'string' ? proxy(call, [...path, key]) : undefined,
    apply: (_, __, args: unknown[]) => call(path, args),
  });

export interface ClientOptions {
  readonly links: ReadonlyArray<AnyLink>;
}

const at = (client: unknown, path: ReadonlyArray<string>) =>
  path.reduce<any>((node, key) => node[key], client) as (
    ...args: ReadonlyArray<unknown>
  ) => Promise<unknown>;

const inner = (opts: ClientOptions) =>
  createTrpcClient({
    router: routerType<any>(),
    links: opts.links as [AnyLink],
  });

/** The Promise client over v12's. `R` is `typeof appRouter`, type-only. */
export function createClient<R>(opts: ClientOptions): RegistryClient<R> {
  const client = inner(opts);
  return proxy((path, args) =>
    at(
      client,
      path,
    )(...args).catch((cause: unknown) => {
      throw toFailure(cause);
    }),
  ) as RegistryClient<R>;
}

/** The Effect client: each call an `Effect` whose failure is the call's. */
export function createEffectClient<R>(
  opts: ClientOptions,
): RegistryEffectClient<R> {
  const client = inner(opts);
  return proxy((path, args) =>
    Effect.tryPromise({
      try: (signal) => at(client, path)(args[0], { signal }),
      catch: toFailure,
    }),
  ) as RegistryEffectClient<R>;
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
 * One handler per tag the call can fail with and per link failure, all
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

/**
 * Exhaustive by `_tag`: a tag without a handler doesn't compile, nor does
 * a handler for a tag the call can't fail with. A tag the types don't know
 * (a server newer than its client) goes to `unexpected`.
 */
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

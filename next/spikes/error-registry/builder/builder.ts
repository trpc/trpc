/**
 * C) A builder chain: `errors().add(tag, spec)` once per error. Each step
 * checks the tag isn't taken, and `extend()` adds another chain's errors,
 * so a registry can be assembled from parts.
 */
import type { AnyRouter } from '@trpc12/trpc/server';
import {
  createRegistryClient,
  createRegistryEffectClient,
  type RegistryClient,
  type RegistryClientOptions,
  type RegistryEffectClient,
  type Scoped,
} from '../shared/client.ts';
import {
  defineError,
  type AnyErrorClass,
  type ErrorClass,
  type ErrorsOf,
  type ErrorSpec,
} from '../shared/define.ts';
import type { TrpcFailure } from '../shared/framework.ts';

export interface BuilderMethods<M> {
  add<const T extends string, const S extends ErrorSpec>(
    tag: T extends keyof M ? `'${T}' is already in the registry` : T,
    spec: S,
  ): ErrorsBuilder<M & { readonly [K in T]: ErrorClass<T, S> }>;
  extend<N>(other: ErrorsBuilder<N>): ErrorsBuilder<M & N>;
}

/** The registry so far: its classes by tag, and the next step. */
export type ErrorsBuilder<M> = M & BuilderMethods<M>;

const classesOf = (b: object) =>
  Object.fromEntries(
    Object.entries(b).filter(([, v]) => typeof v === 'function' && 'spec' in v),
  ) as Record<string, AnyErrorClass>;

const make = (classes: Record<string, AnyErrorClass>): ErrorsBuilder<any> => ({
  ...classes,
  add: (tag: string, spec: ErrorSpec) => {
    if (tag in classes)
      throw new TypeError(`'${tag}' is already in the registry`);
    return make({ ...classes, [tag]: defineError(tag, spec) });
  },
  extend: (other: object) => make({ ...classes, ...classesOf(other) }),
});

export const errors = (): ErrorsBuilder<{}> => make({});

export const withErrors = <M, R extends AnyRouter>(
  _errors: ErrorsBuilder<M>,
  router: R,
): R & Scoped<ErrorsOf<M> | TrpcFailure> =>
  router as R & Scoped<ErrorsOf<M> | TrpcFailure>;

type ErrorsOfRouter<R> = R extends Scoped<infer E> ? E : never;

export const createClient = <R>(opts: RegistryClientOptions) =>
  createRegistryClient<RegistryClient<R, ErrorsOfRouter<R>>>(opts);

export const createEffectClient = <R>(opts: RegistryClientOptions) =>
  createRegistryEffectClient<RegistryEffectClient<R, ErrorsOfRouter<R>>>(opts);

/** The classes alone, without the builder's methods. */
export const registryOf = (b: ErrorsBuilder<unknown>) => classesOf(b);

/**
 * A) `createErrors({ … })`: one object literal of every error the backend
 * can fail with, by tag. `withErrors()` puts its union on the root
 * router's type, so the client infers it from `typeof appRouter`.
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
  fromSpecs,
  type ErrorsOf,
  type ErrorSpec,
  type Registry,
} from '../shared/define.ts';
import type { TrpcFailure } from '../shared/framework.ts';

export const createErrors: <const M extends Record<string, ErrorSpec>>(
  specs: M,
) => ReturnType<typeof fromSpecs<M>> = fromSpecs;

/** The root router, typed with every error its calls can fail with. */
export const withErrors = <const E extends Registry, R extends AnyRouter>(
  _errors: E,
  router: R,
): R & Scoped<ErrorsOf<E> | TrpcFailure> =>
  router as R & Scoped<ErrorsOf<E> | TrpcFailure>;

type ErrorsOfRouter<R> = R extends Scoped<infer E> ? E : never;

export const createClient = <R>(opts: RegistryClientOptions) =>
  createRegistryClient<RegistryClient<R, ErrorsOfRouter<R>>>(opts);

export const createEffectClient = <R>(opts: RegistryClientOptions) =>
  createRegistryEffectClient<RegistryEffectClient<R, ErrorsOfRouter<R>>>(opts);

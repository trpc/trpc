/**
 * F) No registry object: the router's error type is the union of every
 * procedure's inferred errors (`inferRouterErrors`), and every call fails
 * with all of it. Errors are still declared once, as classes with their
 * status and schema, but only what a resolver or middleware returns or
 * yields is in the union: a `throw` has no type.
 */
import type { BuiltinErrorCode, inferRouterErrors } from '@trpc12/trpc/server';
import {
  createRegistryClient,
  createRegistryEffectClient,
  type RegistryClient,
  type RegistryClientOptions,
  type RegistryEffectClient,
} from '../shared/client.ts';
import type { TrpcFailure } from '../shared/framework.ts';

export { defineError } from '../shared/define.ts';

/**
 * Every error any procedure of `R` returns, and tRPC's failures. v12's own
 * errors in the router's union go: each procedure's `BAD_REQUEST` types its
 * issues from its input, so 1,500 procedures put 1,500 of them in the union,
 * and the client rebuilds them all as `InvalidInput` anyway.
 */
export type RouterError<R> =
  | Exclude<inferRouterErrors<R>, { readonly code: BuiltinErrorCode }>
  | TrpcFailure;

export const createClient = <R>(opts: RegistryClientOptions) =>
  createRegistryClient<RegistryClient<R, RouterError<R>>>(opts);

export const createEffectClient = <R>(opts: RegistryClientOptions) =>
  createRegistryEffectClient<RegistryEffectClient<R, RouterError<R>>>(opts);

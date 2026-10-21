/**
 * E) Declaration merging, like TanStack's `Register`: each module adds its
 * registry to one global interface, and every client, helper and error
 * boundary in the program reads it without a type parameter. Under the
 * proposal the interface would be `@trpc12/trpc`'s; here it's this file's.
 */
import {
  createRegistryClient,
  createRegistryEffectClient,
  type RegistryClient,
  type RegistryClientOptions,
  type RegistryEffectClient,
} from '../shared/client.ts';
import type { ErrorsOf } from '../shared/define.ts';
import type { TrpcFailure } from '../shared/framework.ts';

export { createErrors } from '../create-errors/create-errors.ts';

/**
 * Every error the program's backend can fail with, by tag. Extend it from
 * each module: `declare module '…' { interface Errors extends PostErrors {} }`.
 */
export interface Errors {}

/** What any call can fail with. */
export type RegisteredError = ErrorsOf<Errors> | TrpcFailure;

export const createClient = <R>(opts: RegistryClientOptions) =>
  createRegistryClient<RegistryClient<R, RegisteredError>>(opts);

export const createEffectClient = <R>(opts: RegistryClientOptions) =>
  createRegistryEffectClient<RegistryEffectClient<R, RegisteredError>>(opts);

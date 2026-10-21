/**
 * The APIs `.agent-docs/open/error-registry.md` proposes, re-exported from
 * `spikes/error-registry/`, which builds and tests them. A is v12 as it is
 * and has none. B to G share the client: errors have a `_tag` and no
 * `code`, each call fails with what its procedure returns or declares plus
 * tRPC's own failures, and the client takes no registry.
 */
import type { ReactNode } from 'react';
import type { RegistryQueryUtils } from '../../../../spikes/error-registry/boundaries/boundaries.ts';
import type { ErrorsOf } from '../../../../spikes/error-registry/shared/define.ts';
import type {
  ClientErrorOf,
  TrpcFailure,
} from '../../../../spikes/error-registry/shared/failures.ts';

export {
  createClient,
  createEffectClient,
  matchError,
  safe,
} from '../../../../spikes/error-registry/shared/client.ts';
export type {
  RegistryError,
  TrpcFailure,
} from '../../../../spikes/error-registry/shared/failures.ts';

// B
export { createErrors as createErrorsB } from '../../../../spikes/error-registry/create-errors/create-errors.ts';

// C
export { taggedErrors as taggedErrorsC } from '../../../../spikes/error-registry/tagged-classes/tagged-classes.ts';

// D
export {
  errors as errorsD,
  registryOf as registryOfD,
} from '../../../../spikes/error-registry/builder/builder.ts';

// E
export {
  createErrors as createErrorsE,
  mergeErrors as mergeErrorsE,
} from '../../../../spikes/error-registry/merge-errors/merge-errors.ts';

// F: declared here, since a module augments the interface where it's declared.
export { createErrors as createErrorsF } from '../../../../spikes/error-registry/register/register.ts';

/** Every error of the program's backend, by tag; each module extends it. */
export interface Errors {}

/** Any error of the program, as a client sees it. */
export type RegisteredError = ErrorOf<Errors>;
type ErrorOf<TErrors> = ClientErrorOf<ErrorsOf<TErrors>> | TrpcFailure;

// G
export { defineError as defineErrorG } from '../../../../spikes/error-registry/inferred/inferred.ts';

// Error boundaries over E
export { createErrorBoundary as createErrorBoundaryE } from '../../../../spikes/error-registry/boundaries/boundaries.ts';

/** `createTrpcContext()`'s shape over the client: each call's error is its own. */
export declare function createTrpcContextE<R>(): readonly [
  Provider: (props: { readonly children?: ReactNode }) => ReactNode,
  useTrpc: () => RegistryQueryUtils<R>,
];

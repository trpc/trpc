/**
 * F) Declaration merging, like TanStack's `Register`: each module adds its
 * registry to one global interface. With returned errors a call's union
 * comes from its procedure, so the interface no longer types calls; what
 * it still gives is the program's tags with no router type parameter, for
 * code that has none. Type-only, so it costs a client nothing. Under the
 * proposal the interface would be `@trpc12/trpc`'s; here it's this file's.
 */
import type { ErrorsOf } from '../shared/define.ts';
import type { ClientErrorOf, TrpcFailure } from '../shared/failures.ts';

export { createErrors } from '../create-errors/create-errors.ts';

/**
 * Every error the program's backend can fail with, by tag. Extend it from
 * each module: `declare module '…' { interface Errors extends PostErrors {} }`.
 */
export interface Errors {}

/** Any error of the program, as a client sees it. */
export type RegisteredError = ClientErrorOf<ErrorsOf<Errors>> | TrpcFailure;

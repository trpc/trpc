/**
 * The error `.agent-docs/open/stale-client-error.md` proposes, as types:
 * B and C add a client-side built-in code, `STALE_CLIENT`, to every call's
 * error (B from the server's `data.procedure`, C from a router
 * fingerprint). A is a call's error as it is.
 */
import type { TrpcError } from '@trpc12/trpc/client';

type StaleClient = TrpcError<'STALE_CLIENT', undefined> & {
  readonly defined: false;
};

/** B: a call's error `E`, which can also be `STALE_CLIENT`. */
export type CallErrorB<E> = E | StaleClient;

/** C: a call's error `E`, which can also be `STALE_CLIENT`. */
export type CallErrorC<E> = E | StaleClient;

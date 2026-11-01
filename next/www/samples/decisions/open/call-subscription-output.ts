/**
 * The APIs `.agent-docs/open/call-subscription-output.md` proposes, as
 * types: A types `call()` on a subscription as the `Stream` it resolves to,
 * B resolves it to an `AsyncIterable` of events. Today `t.call()` types it
 * as one event.
 */
import type { Stream } from 'effect';
import type {
  AnyProcedure,
  AnyTrpcError,
  CallOptions,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc12/trpc/server';

/** A: a subscription resolves to `Stream<Event, Errors>`. */
export declare function callA<P extends AnyProcedure>(
  procedure: P,
  input: inferProcedureInput<P>,
  opts?: CallOptions<{}, NonNullable<P['~trpc']['~types']>>,
): Promise<
  P['~trpc']['type'] extends 'subscription'
    ? Stream.Stream<inferProcedureOutput<P>, AnyTrpcError>
    : inferProcedureOutput<P>
>;

/** B: a subscription resolves to an `AsyncIterable` of events. */
export declare function callB<P extends AnyProcedure>(
  procedure: P,
  input: inferProcedureInput<P>,
  opts?: CallOptions<{}, NonNullable<P['~trpc']['~types']>>,
): Promise<
  P['~trpc']['type'] extends 'subscription'
    ? AsyncIterable<inferProcedureOutput<P>>
    : inferProcedureOutput<P>
>;

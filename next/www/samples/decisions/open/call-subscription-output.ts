/**
 * The APIs `.agent-docs/open/call-subscription-output.md` proposes, as
 * types: A types `call()` on a subscription as the `Stream` it resolves to,
 * B resolves it to an `AsyncIterable` of events. Today `call()` types it as
 * one event.
 */
import type { Stream } from 'effect';
import type {
  AnyTrpcError,
  CallOptions,
  Procedure,
  ProcedureDef,
} from '@trpc12/trpc/server';

/** A: a subscription resolves to `Stream<Event, Errors>`. */
export declare function callA<TDef extends ProcedureDef>(
  procedure: Procedure<TDef>,
  input: TDef['input'],
  opts?: CallOptions<TDef>,
): Promise<
  TDef['type'] extends 'subscription'
    ? Stream.Stream<TDef['output'], AnyTrpcError>
    : TDef['output']
>;

/** B: a subscription resolves to an `AsyncIterable` of events. */
export declare function callB<TDef extends ProcedureDef>(
  procedure: Procedure<TDef>,
  input: TDef['input'],
  opts?: CallOptions<TDef>,
): Promise<
  TDef['type'] extends 'subscription'
    ? AsyncIterable<TDef['output']>
    : TDef['output']
>;

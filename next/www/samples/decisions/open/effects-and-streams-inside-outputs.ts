/**
 * The client types `.agent-docs/open/effects-and-streams-inside-outputs.md`
 * proposes: under B, a `Stream` nested in an output arrives as an
 * `AsyncIterable` and an `Effect` as a `Promise`. A and C keep
 * `Deserialized` as it is.
 */
import type { Deserialized } from '@trpc12/trpc/client';
import type { AnyProcedure, inferProcedureOutput } from '@trpc12/trpc/server';
import type { Effect, Stream } from 'effect';

/** B: `Deserialized`, with nested `Stream`s and `Effect`s as deferred values. */
export type DeserializedB<T> =
  T extends Stream.Stream<infer A, infer _E, infer _R>
    ? AsyncIterable<DeserializedB<A>>
    : T extends Effect.Effect<infer A, infer _E, infer _R>
      ? Promise<DeserializedB<A>>
      : T extends
            | AsyncIterable<unknown>
            | PromiseLike<unknown>
            | ReadableStream
            | Date
        ? Deserialized<T>
        : T extends object
          ? { [K in keyof T]: DeserializedB<T[K]> }
          : Deserialized<T>;

/** B: what a client's call to `P` resolves to. */
export type ClientOutputB<P extends AnyProcedure> = DeserializedB<
  inferProcedureOutput<P>
>;

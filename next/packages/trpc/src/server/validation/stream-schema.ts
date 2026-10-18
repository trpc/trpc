import type { Stream } from 'effect';
import type { IsAny } from '../../internal/types.ts';
import type { AnySchema, InOf, OutOf, SchemaServices } from './schema.ts';

/**
 * A streamed output's schemas, made by {@link stream}.
 * @since 0.1.0
 * @stability stable
 */
export interface StreamSchema<
  TItem extends AnySchema = AnySchema,
  TReturn extends AnySchema | undefined = AnySchema | undefined,
> {
  readonly '~trpc.stream': {
    readonly item: TItem;
    readonly return: TReturn;
  };
}

/**
 * What `.output()` accepts: a schema, or {@link stream} for streamed outputs.
 * @since 0.1.0
 * @stability stable
 */
export type OutputSchema = AnySchema | StreamSchema;

/**
 * The builder's view of a streamed output: item and return types.
 * @since 0.1.0
 * @stability stable
 */
export interface StreamOutput<TItem, TReturn> {
  readonly '~trpc.streamOutput': [TItem, TReturn];
}

/**
 * Validates each item of a streamed output, and the generator's return
 * value when `returns` is given. Subscriptions accept it too, though a plain
 * `.output(Event)` validates each event already.
 *
 * @example
 * ```ts
 * t.procedure
 *   .output(stream(Token, Summary))
 *   .mutation(async function* () {
 *     yield { text: 'Hi' };
 *     return { tokens: 1 };
 *   });
 * // client: AsyncIterable<Token, Summary>
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function stream<
  TItem extends AnySchema,
  TReturn extends AnySchema | undefined = undefined,
>(item: TItem, returns?: TReturn): StreamSchema<TItem, TReturn> {
  return { '~trpc.stream': { item, return: returns as TReturn } };
}

/** @internal */
export const isStreamSchema = (value: unknown): value is StreamSchema =>
  typeof value === 'object' && value !== null && '~trpc.stream' in value;

/** The schema's input side, with streams as {@link StreamOutput}. @internal */
export type OutputIn<S> =
  S extends StreamSchema<infer I, infer R>
    ? StreamOutput<InOf<I>, R extends AnySchema ? InOf<R> : any>
    : InOf<S>;

/** The schema's output side, with streams as {@link StreamOutput}. @internal */
export type OutputOut<S> =
  S extends StreamSchema<infer I, infer R>
    ? StreamOutput<OutOf<I>, R extends AnySchema ? OutOf<R> : any>
    : OutOf<S>;

/** @internal */
export type OutputServices<S> =
  S extends StreamSchema<infer I, infer R>
    ? SchemaServices<I> | SchemaServices<R>
    : SchemaServices<S>;

/** What a query or mutation resolver may return for the output. @internal */
export type ResultOf<TOut> =
  TOut extends StreamOutput<infer I, infer R>
    ? AsyncIterable<I, R, any> | Stream.Stream<I, any, any>
    : TOut;

/** The event type of a subscription's output. @internal */
export type EventOutput<TOut> =
  TOut extends StreamOutput<infer I, any> ? I : TOut;

/** What a query or mutation client receives for the output. @internal */
export type StreamedOutput<TOut> =
  TOut extends StreamOutput<infer I, infer R>
    ? IsAny<R> extends true
      ? AsyncIterable<I>
      : AsyncIterable<I, R>
    : TOut;

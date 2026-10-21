/**
 * C) The registry is a list of Effect `Schema.TaggedError` classes, with
 * the HTTP status as Effect HttpApi's own `httpApiStatus` annotation. The
 * classes import nothing from tRPC, so a domain package can share them
 * with HttpApi or Effect RPC.
 *
 * v12 can't carry them as returned errors. A `Schema.TaggedError` is itself
 * an Effect, so returning one from a resolver, like failing an Effect with
 * one, is the "Map Effect failures to a TrpcError" type error. This spike
 * maps them per resolver: `send()` for a returned one, `expose()` around an
 * Effect, each typed so the procedure's union keeps the tag and fields.
 * The client gets v12's errors, not the classes: rebuilding them there
 * would import the registry, which a client must not.
 */
import { Effect, Schema } from 'effect';
import type {} from 'effect/http-api';
import { TrpcError } from '@trpc12/trpc/server';
import { errorsToOpenApi } from '../shared/openapi.ts';

declare module 'effect/Schema' {
  namespace Annotations {
    interface Augment {
      /** Whether `retryLink` may retry a call that failed with it. */
      readonly retry?: boolean | undefined;
    }
  }
}

/** A `Schema.TaggedError` class. */
export type AnyTaggedClass = Schema.Top & {
  readonly identifier: string;
  readonly Encoded: { readonly _tag: string };
} & (abstract new (...args: any) => { readonly _tag: string });

type Fields<C extends AnyTaggedClass> =
  Omit<C['Encoded'], '_tag'> extends infer F
    ? { readonly [K in keyof F]: F[K] }
    : never;

/** Class `C`'s errors as v12 sends them: the tag, and the fields as `data`. */
export type Sent<C extends AnyTaggedClass> = C extends unknown
  ? TrpcError<
      C['Encoded']['_tag'],
      [keyof Fields<C>] extends [never] ? undefined : Fields<C>,
      C['Encoded']['_tag']
    >
  : never;

type SentOf<C extends AnyTaggedClass, E> = E extends unknown
  ? Sent<Extract<C, abstract new (...args: any) => E>>
  : never;

export interface TaggedRegistry<C extends AnyTaggedClass> {
  readonly classes: ReadonlyArray<C>;
  /** A returned error: `return errors.send(new PostNotFound({ id }))`. */
  readonly send: <E extends InstanceType<C>>(error: E) => SentOf<C, E>;
  /** An Effect resolver's registered failures, as v12 errors. */
  readonly expose: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<
    A,
    SentOf<C, Extract<E, InstanceType<C>>> | Exclude<E, InstanceType<C>>,
    R
  >;
}

const statusOf = (cls: AnyTaggedClass) =>
  Schema.resolveAnnotations(cls)?.httpApiStatus ?? 400;

export function taggedErrors<const Cs extends ReadonlyArray<AnyTaggedClass>>(
  ...classes: Cs
): TaggedRegistry<Cs[number]> {
  const byTag = new Map(classes.map((cls) => [cls.identifier, cls]));
  const wire = new Map(
    classes.map((cls) => [
      cls.identifier,
      TrpcError.Tagged(cls.identifier, {
        status: statusOf(cls),
        data: Schema.Unknown,
      }),
    ]),
  );
  const toTrpc = (e: unknown): unknown => {
    if (typeof e !== 'object' || e === null || !('_tag' in e)) return e;
    const tag = String(e._tag);
    const cls = byTag.get(tag);
    if (!cls || !(e instanceof cls)) return e;
    const { _tag, ...fields } = Schema.encodeSync(
      cls as unknown as Schema.Codec<any, any>,
    )(e);
    const message = (e as { message?: string }).message || tag;
    const data = Object.keys(fields).length === 0 ? undefined : fields;
    return new (wire.get(tag)!)(data, { message, cause: e });
  };
  return {
    classes,
    send: toTrpc as never,
    expose: ((effect: Effect.Effect<unknown, unknown, unknown>) =>
      Effect.mapError(effect, toTrpc)) as never,
  };
}

/** OpenAPI from the classes: the body is the class's encoded form. */
export const classesToOpenApi = (classes: ReadonlyArray<AnyTaggedClass>) =>
  errorsToOpenApi(
    classes.map((cls) => ({
      tag: cls.identifier,
      data: cls,
      status: statusOf(cls),
      description: Schema.resolveAnnotations(cls)?.description,
    })),
  );

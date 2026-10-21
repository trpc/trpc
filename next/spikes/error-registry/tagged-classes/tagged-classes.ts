/**
 * B) The registry is a list of Effect `Schema.TaggedError` classes, with
 * the HTTP status as Effect HttpApi's own `httpApiStatus` annotation. The
 * classes import nothing from tRPC, so a domain package can share them
 * with HttpApi or Effect RPC, and the client decodes them back into the
 * same classes.
 *
 * v12 masks a failure that isn't a `TrpcError`, and its types reject one
 * in an Effect resolver, so this spike carries them through with a
 * middleware (`bridge`) and an `expose()` around Effect resolvers. Built
 * into the package, both would go.
 */
import { Effect, Schema } from 'effect';
import type {} from 'effect/http-api';
import type { AnyLink } from '@trpc12/trpc/client';
import {
  isTrpcError,
  TrpcError,
  type AnyRouter,
  type AnyTrpcError,
} from '@trpc12/trpc/server';
import {
  createRegistryClient,
  createRegistryEffectClient,
  type RegistryClient,
  type RegistryEffectClient,
  type Scoped,
} from '../shared/client.ts';
import { trpcFailures, type TrpcFailure } from '../shared/framework.ts';
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
} & (abstract new (...args: any) => { readonly _tag: string });

export interface TaggedRegistry<C extends ReadonlyArray<AnyTaggedClass>> {
  readonly classes: C;
  /** Promise middleware: sends a registered error rather than masking it. */
  readonly bridge: <O extends { readonly next: () => Promise<unknown> }>(
    opts: O,
  ) => ReturnType<O['next']>;
  /** An Effect resolver's registered failures, as v12 errors. */
  readonly expose: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, AnyTrpcError, R>;
  /** The client's half: a received error back into its class. */
  readonly rebuild: (cause: AnyTrpcError) => unknown;
}

export type ErrorsOfClasses<C extends ReadonlyArray<AnyTaggedClass>> =
  InstanceType<C[number]>;

const statusOf = (cls: AnyTaggedClass) =>
  Schema.resolveAnnotations(cls)?.httpApiStatus ?? 400;

export function taggedErrors<const C extends ReadonlyArray<AnyTaggedClass>>(
  ...classes: C
): TaggedRegistry<C> {
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
  const toTrpc = (e: unknown): AnyTrpcError | undefined => {
    if (typeof e !== 'object' || e === null || !('_tag' in e)) return undefined;
    const tag = String(e._tag);
    const cls = byTag.get(tag);
    if (!cls || !(e instanceof cls)) return undefined;
    const { _tag, ...fields } = Schema.encodeSync(
      cls as unknown as Schema.Codec<any, any>,
    )(e);
    const message = (e as { message?: string }).message || tag;
    return new (wire.get(tag)!)(fields, { message, cause: e });
  };
  return {
    classes,
    bridge: (async (opts: {
      next: () => Promise<{ ok: boolean; error?: AnyTrpcError }>;
    }) => {
      const result = await opts.next();
      const sent =
        !result.ok && isTrpcError(result.error)
          ? toTrpc(result.error.cause)
          : undefined;
      if (sent) throw sent;
      return result;
    }) as never,
    expose: (effect) =>
      Effect.mapError(effect, (e) => toTrpc(e) ?? (e as AnyTrpcError)),
    rebuild: (cause) => {
      const cls = byTag.get(cause.code);
      if (!cls) return undefined;
      return Schema.decodeUnknownSync(cls as unknown as Schema.Codec<any, any>)(
        {
          ...(cause.data as object),
          _tag: cause.code,
        },
      );
    },
  };
}

export const withErrors = <
  const C extends ReadonlyArray<AnyTaggedClass>,
  R extends AnyRouter,
>(
  _errors: TaggedRegistry<C>,
  router: R,
): R & Scoped<ErrorsOfClasses<C> | TrpcFailure> =>
  router as R & Scoped<ErrorsOfClasses<C> | TrpcFailure>;

type ErrorsOfRouter<R> = R extends Scoped<infer E> ? E : never;

export interface Options<C extends ReadonlyArray<AnyTaggedClass>> {
  readonly links: ReadonlyArray<AnyLink>;
  readonly errors: TaggedRegistry<C>;
}

export const createClient = <R>(opts: Options<any>) =>
  createRegistryClient<RegistryClient<R, ErrorsOfRouter<R>>>({
    links: opts.links,
    registry: trpcFailures,
    rebuild: opts.errors.rebuild,
  });

export const createEffectClient = <R>(opts: Options<any>) =>
  createRegistryEffectClient<RegistryEffectClient<R, ErrorsOfRouter<R>>>({
    links: opts.links,
    registry: trpcFailures,
    rebuild: opts.errors.rebuild,
  });

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

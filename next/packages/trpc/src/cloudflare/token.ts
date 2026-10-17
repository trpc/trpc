import { Clock, Effect, Redacted, Result, Schema } from 'effect';
import { Base64Url } from 'effect/encoding';
import { TrpcError } from '../internal/error.ts';

/**
 * Options for {@link connectionToken}.
 * @example
 * ```ts
 * connectionToken(RoomClaims, { secret: env.TOKEN_SECRET, ttlSeconds: 600 });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface ConnectionTokenOptions {
  /** The HMAC-SHA256 key, shared by the code that signs and the object that verifies. */
  readonly secret: string | Redacted.Redacted<string>;
  /**
   * How long a token is valid after `sign`.
   * @default 3600
   */
  readonly ttlSeconds?: number;
}

/**
 * Signs and verifies one kind of token. Made by {@link connectionToken}.
 * @example
 * ```ts
 * const token = yield* RoomToken.sign({ room: '42', tags: ['user:1'] });
 * const claims = yield* RoomToken.verify(token);
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface ConnectionToken<A> {
  /** A token with `claims` that expires after `ttlSeconds`. */
  readonly sign: (claims: A) => Effect.Effect<string>;
  /**
   * The claims of a token this secret signed. Fails with `UNAUTHORIZED`
   * when it's missing, malformed, tampered with or expired.
   */
  readonly verify: (token: unknown) => Effect.Effect<A, TrpcError>;
}

const encoder = new TextEncoder();

const unauthorized = (message: string) =>
  new TrpcError({ code: 'UNAUTHORIZED', message });

/**
 * Signed tokens for hibernating connections. A Worker that has already
 * authenticated the user signs claims (the room, the user's publisher
 * tags), the client sends the token as a connection param, and the Durable
 * Object verifies it in `createContext` without its own session lookup.
 * Claims are encoded with `schema` and readable by the client, so keep
 * secrets out of them.
 *
 * @example
 * ```ts
 * const RoomToken = connectionToken(
 *   Schema.Struct({ room: Schema.String, tags: Schema.Array(Schema.String) }),
 *   { secret: env.TOKEN_SECRET },
 * );
 * // in the Worker's router
 * roomToken: t.procedure.query(({ ctx }) =>
 *   RoomToken.sign({ room: 'lobby', tags: [`user:${ctx.user.id}`] }),
 * ),
 * // in the Durable Object's handler
 * createContext: async ({ info }) =>
 *   Effect.runPromise(RoomToken.verify(info.connectionParams?.['token'])),
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function connectionToken<S extends Schema.Codec<any, any>>(
  schema: S,
  opts: ConnectionTokenOptions,
): ConnectionToken<S['Type']> {
  const ttlMs = (opts.ttlSeconds ?? 3600) * 1000;
  const codec = Schema.fromJsonString(schema);
  let key: Promise<CryptoKey> | undefined;
  const cryptoKey = Effect.promise(
    () =>
      (key ??= crypto.subtle.importKey(
        'raw',
        encoder.encode(
          Redacted.isRedacted(opts.secret)
            ? Redacted.value(opts.secret)
            : opts.secret,
        ),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      )),
  );

  const sign = (claims: S['Type']) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const json = yield* Schema.encodeEffect(codec)(claims).pipe(Effect.orDie);
      const body = Base64Url.encode(
        JSON.stringify({ c: json, exp: now + ttlMs }),
      );
      const k = yield* cryptoKey;
      const mac = yield* Effect.promise(() =>
        crypto.subtle.sign('HMAC', k, encoder.encode(body)),
      );
      return `${body}.${Base64Url.encode(new Uint8Array(mac))}`;
    });

  const verify = (token: unknown) =>
    Effect.gen(function* () {
      if (typeof token !== 'string') {
        return yield* Effect.fail(unauthorized('Missing connection token'));
      }
      const [body, mac, ...rest] = token.split('.');
      const signature = mac === undefined ? undefined : Base64Url.decode(mac);
      const decoded = body ? Base64Url.decodeString(body) : undefined;
      if (
        decoded === undefined ||
        Result.isFailure(decoded) ||
        rest.length > 0 ||
        signature === undefined ||
        Result.isFailure(signature)
      ) {
        return yield* Effect.fail(unauthorized('Malformed connection token'));
      }
      const k = yield* cryptoKey;
      const valid = yield* Effect.promise(() =>
        crypto.subtle.verify(
          'HMAC',
          k,
          signature.success as Uint8Array<ArrayBuffer>,
          encoder.encode(body),
        ),
      );
      if (!valid) {
        return yield* Effect.fail(unauthorized('Invalid connection token'));
      }
      const payload = JSON.parse(decoded.success) as {
        c?: unknown;
        exp?: unknown;
      };
      const now = yield* Clock.currentTimeMillis;
      if (typeof payload.exp !== 'number' || payload.exp <= now) {
        return yield* Effect.fail(unauthorized('Expired connection token'));
      }
      return yield* Schema.decodeUnknownEffect(codec)(payload.c).pipe(
        Effect.mapError(() => unauthorized('Invalid connection token claims')),
      );
    });

  return { sign, verify };
}

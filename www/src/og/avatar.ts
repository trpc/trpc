/**
 * Fetches avatars as `data:` URIs satori can draw: a JPEG, a PNG, or an
 * SVG it can size. The social cards draw them (`live.ts`), and the sponsor
 * sync checks the small sponsors' (`build/sponsors-sync.ts`).
 *
 * Each try gives up after a timeout. A try that fails in a way that may
 * pass (no response, a timeout, a 429 or a 5xx) is tried again, twice
 * unless `retries` says otherwise; a 404, a type satori can't draw or an
 * SVG it can't size is not.
 */
import {
  Cache,
  Context,
  Data,
  Duration,
  Effect,
  Exit,
  Layer,
  Match,
  Option,
  Schedule,
  type Types,
} from 'effect';
import { HttpClient } from 'effect/http';

/** The fetch failed without a response: a DNS failure or a dropped connection. */
export class AvatarRequestError extends Data.TaggedError('AvatarRequestError')<{
  readonly cause: unknown;
  readonly url: string;
}> {
  override get message() {
    return `${this.url}: no response`;
  }
}

export class AvatarTimeoutError extends Data.TaggedError('AvatarTimeoutError')<{
  readonly url: string;
}> {
  override get message() {
    return `${this.url}: timed out`;
  }
}

export class AvatarStatusError extends Data.TaggedError('AvatarStatusError')<{
  readonly status: number;
  readonly url: string;
}> {
  override get message() {
    return `${this.url}: ${this.status}`;
  }
}

/** Not a JPEG, a PNG or an SVG. */
export class AvatarTypeError extends Data.TaggedError('AvatarTypeError')<{
  readonly contentType: string;
  readonly url: string;
}> {
  override get message() {
    return `${this.url}: ${this.contentType || 'no content type'}`;
  }
}

/** An SVG without a size satori can read, which it throws on. */
export class AvatarSizeError extends Data.TaggedError('AvatarSizeError')<{
  readonly url: string;
}> {
  override get message() {
    return `${this.url}: an SVG without a size`;
  }
}

export type AvatarError =
  | AvatarRequestError
  | AvatarSizeError
  | AvatarStatusError
  | AvatarTimeoutError
  | AvatarTypeError;

const mayPass = (error: AvatarError) =>
  Match.valueTags(error, {
    AvatarRequestError: () => true,
    AvatarSizeError: () => false,
    AvatarStatusError: (failed) =>
      failed.status === 429 || failed.status >= 500,
    AvatarTimeoutError: () => true,
    AvatarTypeError: () => false,
  });

/**
 * `https://github.com/KATT.png`, or an Open Collective avatar, at 128
 * pixels, the size the cards need, unless `image` asks for a size of its
 * own (`avatarUrl` in `sponsors.ts`): GitHub's `s` wins over `size`, and
 * Open Collective's `height` is kept.
 */
export const avatarUrl = (image: string) => {
  const url = new URL(image);
  if (
    url.hostname === 'github.com' ||
    url.hostname.endsWith('.githubusercontent.com')
  ) {
    url.searchParams.set('size', '128');
  }
  if (
    url.hostname === 'images.opencollective.com' &&
    !url.searchParams.has('height')
  ) {
    url.searchParams.set('height', '128');
  }
  return url.href;
};

/** A `width` or `height` in pixels on `tag`, the only kind satori reads. */
const svgLength = (tag: string, name: string) => {
  const value = new RegExp(
    `\\s${name}=['"]((?:\\d+(?:\\.\\d+)?|\\.\\d+))(?:px)?['"]`,
  ).exec(tag)?.[1];
  return value === undefined ? undefined : Number(value);
};

/** The size satori draws an SVG at, as it reads it off the `<svg>` tag. */
const svgSize = (tag: string): readonly [number, number] | undefined => {
  const width = svgLength(tag, 'width');
  const height = svgLength(tag, 'height');
  if (width !== undefined && height !== undefined) {
    return [width, height];
  }
  const box = /viewBox=['"]([^'"]+)['"]/
    .exec(tag)?.[1]
    ?.split(/[, ]/)
    .filter(Boolean)
    .map(Number);
  const [, , boxWidth, boxHeight] = box ?? [];
  if (box?.length !== 4 || boxWidth === undefined || boxHeight === undefined) {
    return undefined;
  }
  if (width !== undefined) {
    return [width, (width * boxHeight) / boxWidth];
  }
  if (height !== undefined) {
    return [(height * boxWidth) / boxHeight, height];
  }
  return [boxWidth, boxHeight];
};

/**
 * Whether satori can draw an SVG: it sizes one by the first `<svg>` tag's
 * `width` and `height` in pixels, either of them with the `viewBox`'s
 * aspect ratio, or the `viewBox` alone, and throws without them.
 */
export const sizableSvg = (svg: string) => {
  const tag = /<svg[^>]*>/i.exec(svg)?.[0];
  const size = tag === undefined ? undefined : svgSize(tag);
  return (
    size?.every((length) => Number.isFinite(length) && length > 0) ?? false
  );
};

const drawable = ['image/jpeg', 'image/png', 'image/svg+xml'];

export interface AvatarsOptions {
  /** How long one try may take, body and all. */
  readonly timeout?: Duration.Input;
  /** How many times to try again after a failure that may pass. */
  readonly retries?: number;
  /**
   * Keeps each avatar that loaded for `timeToLive`, up to `capacity` of
   * them, and shares a fetch already under way, so cards drawn one after
   * another fetch the sponsors along their foot once. A failure isn't
   * kept: the next card tries again.
   */
  readonly cache?: {
    readonly capacity: number;
    readonly timeToLive: Duration.Input;
  };
  /**
   * A cache that server instances share, such as Vercel's Runtime Cache
   * (`live.ts`), which keeps each avatar that loaded for `timeToLive`, so
   * a new instance draws the avatars another fetched. One it can't reach
   * or that has none is a miss: the avatar is fetched.
   */
  readonly shared?: {
    readonly store: SharedStore;
    readonly timeToLive: Duration.Input;
  };
}

/** What `shared` needs of a cache: Vercel's `RuntimeCache` has it. */
export interface SharedStore {
  readonly get: (key: string) => Promise<unknown>;
  readonly set: (
    key: string,
    value: unknown,
    options: { readonly ttl: number },
  ) => Promise<void>;
}

/** Fetches an avatar as a `data:` URI satori can draw. */
export class Avatars extends Context.Service<
  Avatars,
  {
    readonly fetch: (image: string) => Effect.Effect<string, AvatarError>;
  }
>()('www/og/Avatars') {
  static readonly layer = (options: AvatarsOptions = {}) =>
    Layer.effect(
      Avatars,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const once = Effect.fn('Avatars.once')(function* (url: string) {
          const response = yield* client
            .get(url)
            .pipe(
              Effect.mapError(
                (cause) => new AvatarRequestError({ cause, url }),
              ),
            );
          if (response.status < 200 || response.status >= 300) {
            return yield* new AvatarStatusError({
              status: response.status,
              url,
            });
          }
          const contentType =
            response.headers['content-type']?.split(';')[0]?.trim() ?? '';
          if (!drawable.includes(contentType)) {
            return yield* new AvatarTypeError({ contentType, url });
          }
          const bytes = Buffer.from(
            yield* response.arrayBuffer.pipe(
              Effect.mapError(
                (cause) => new AvatarRequestError({ cause, url }),
              ),
            ),
          );
          if (
            contentType === 'image/svg+xml' &&
            !sizableSvg(bytes.toString('utf8'))
          ) {
            return yield* new AvatarSizeError({ url });
          }
          return `data:${contentType};base64,${bytes.toString('base64')}`;
        });
        const fromHost = (url: string) =>
          once(url).pipe(
            Effect.timeoutOrElse({
              duration: options.timeout ?? '4 seconds',
              orElse: () => Effect.fail(new AvatarTimeoutError({ url })),
            }),
            Effect.retry({
              schedule: Schedule.exponential('100 millis'),
              times: options.retries ?? 2,
              while: mayPass,
            }),
          );
        const { cache, shared } = options;
        const fetch =
          shared === undefined
            ? (image: string) => fromHost(avatarUrl(image))
            : throughShared(fromHost, shared);
        if (cache === undefined) {
          return Avatars.of({ fetch });
        }
        const cached = yield* Cache.makeWith(fetch, {
          capacity: cache.capacity,
          timeToLive: (exit) => (Exit.isSuccess(exit) ? cache.timeToLive : 0),
        });
        return Avatars.of({ fetch: (image) => Cache.get(cached, image) });
      }),
    );
}

/**
 * `fromHost`, but an avatar `shared.store` has, and keeping each that
 * loads there. The store failing is a miss, and a failure isn't kept.
 */
const throughShared =
  (
    fromHost: (url: string) => Effect.Effect<string, AvatarError>,
    shared: NonNullable<AvatarsOptions['shared']>,
  ) =>
  (image: string) =>
    Effect.gen(function* () {
      const url = avatarUrl(image);
      const kept = yield* Effect.tryPromise(() => shared.store.get(url)).pipe(
        Effect.orElseSucceed(() => null),
      );
      if (typeof kept === 'string' && kept.startsWith('data:')) {
        return kept;
      }
      const uri = yield* fromHost(url);
      yield* Effect.tryPromise(() =>
        shared.store.set(url, uri, {
          ttl: Duration.toSeconds(shared.timeToLive),
        }),
      ).pipe(Effect.ignore);
      return uri;
    });

/**
 * The avatars of `images` that loaded, by URL; the rest are left out.
 * `concurrency` is how many it fetches at once.
 */
export const fetchAvatars = Effect.fn('fetchAvatars')(function* (
  images: Iterable<string>,
  concurrency: Types.Concurrency = 8,
) {
  const avatars = yield* Avatars;
  const loaded = yield* Effect.forEach(
    new Set(images),
    (image) =>
      avatars.fetch(image).pipe(
        Effect.map((uri) => [image, uri] as const),
        Effect.tapError((error) => Effect.logDebug(error.message)),
        Effect.option,
      ),
    { concurrency },
  );
  return new Map(loaded.flatMap(Option.toArray));
});

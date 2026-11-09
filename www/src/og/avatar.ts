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
  Context,
  type Duration,
  Effect,
  Exit,
  Layer,
  Match,
  Option,
  Schedule,
  Schema,
  type Types,
} from 'effect';
import { HttpClient } from 'effect/http';
import { Persistable, PersistedCache } from 'effect/persistence';

/** The fetch failed without a response: a DNS failure or a dropped connection. */
export class AvatarRequestError extends Schema.TaggedError<AvatarRequestError>()(
  'AvatarRequestError',
  { cause: Schema.Defect(), url: Schema.String },
) {
  override get message() {
    return `${this.url}: no response`;
  }
}

export class AvatarTimeoutError extends Schema.TaggedError<AvatarTimeoutError>()(
  'AvatarTimeoutError',
  { url: Schema.String },
) {
  override get message() {
    return `${this.url}: timed out`;
  }
}

export class AvatarStatusError extends Schema.TaggedError<AvatarStatusError>()(
  'AvatarStatusError',
  { status: Schema.Number, url: Schema.String },
) {
  override get message() {
    return `${this.url}: ${this.status}`;
  }
}

/** Not a JPEG, a PNG or an SVG. */
export class AvatarTypeError extends Schema.TaggedError<AvatarTypeError>()(
  'AvatarTypeError',
  { contentType: Schema.String, url: Schema.String },
) {
  override get message() {
    return `${this.url}: ${this.contentType || 'no content type'}`;
  }
}

/** An SVG without a size satori can read, which it throws on. */
export class AvatarSizeError extends Schema.TaggedError<AvatarSizeError>()(
  'AvatarSizeError',
  { url: Schema.String },
) {
  override get message() {
    return `${this.url}: an SVG without a size`;
  }
}

/** A drawable type with no bytes, which satori can't draw. */
export class AvatarEmptyError extends Schema.TaggedError<AvatarEmptyError>()(
  'AvatarEmptyError',
  { url: Schema.String },
) {
  override get message() {
    return `${this.url}: an empty body`;
  }
}

/** Any way fetching an avatar fails, as a schema, which `AvatarRequest` keeps. */
export const AvatarError = Schema.Union([
  AvatarEmptyError,
  AvatarRequestError,
  AvatarSizeError,
  AvatarStatusError,
  AvatarTimeoutError,
  AvatarTypeError,
]);

export type AvatarError = typeof AvatarError.Type;

const mayPass = (error: AvatarError) =>
  Match.valueTags(error, {
    // A host can send an empty body while it's having trouble.
    AvatarEmptyError: () => true,
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
}

/** A drawable avatar as a `data:` URI with bytes, as `Avatars` makes one. */
const AvatarUri = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^data:image\/(?:jpeg|png|svg\+xml);base64,./)),
);

/**
 * A request for an avatar at its URL as fetched (`avatarUrl`), in a
 * `period` such as the UTC day, which its cache key holds: so two URLs
 * for one avatar share an entry, and two periods never do. A value kept
 * for it that isn't a drawable avatar is a miss.
 */
export class AvatarRequest extends Persistable.Class<{
  payload: { readonly period: string; readonly url: string };
}>()('www/og/AvatarRequest', {
  error: AvatarError,
  primaryKey: (request) => `${request.period}\n${request.url}`,
  success: AvatarUri,
}) {}

export interface CachedAvatarsOptions {
  /** How many avatars each instance keeps in memory. */
  readonly capacity: number;
  /**
   * The period an avatar is kept for, read when its fetch starts: nothing
   * kept in one period is drawn in the next, and a fetch started in one
   * isn't shared with the next.
   */
  readonly period: () => string;
  /** How long an instance keeps an avatar that loaded in memory. */
  readonly inMemory: () => Duration.Input;
  /** How long the store (`Persistence`) keeps an avatar that loaded. */
  readonly persisted: () => Duration.Input;
}

/** For an avatar that loaded, `timeToLive`; a failure isn't kept. */
const successesFor =
  (timeToLive: () => Duration.Input) => (exit: Exit.Exit<unknown, unknown>) =>
    Exit.isSuccess(exit) ? timeToLive() : 0;

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
          if (bytes.length === 0) {
            return yield* new AvatarEmptyError({ url });
          }
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
        return Avatars.of({ fetch: (image) => fromHost(avatarUrl(image)) });
      }),
    );

  /**
   * `Avatars` that keeps each avatar that loaded: in memory, where a
   * fetch under way is shared, and in the store `Persistence` provides,
   * which server instances can share, before fetching it with the
   * `Avatars` it's given. A failure isn't kept, and the next card tries
   * again. A store that fails is the store's to turn into a miss
   * (`runtime-cache.ts`); one that still fails is a defect.
   */
  static readonly layerCached = (options: CachedAvatarsOptions) =>
    Layer.effect(
      Avatars,
      Effect.gen(function* () {
        const fromHost = yield* Avatars;
        const cache = yield* PersistedCache.make(
          (request: AvatarRequest) => fromHost.fetch(request.url),
          {
            inMemoryCapacity: options.capacity,
            inMemoryTTL: successesFor(options.inMemory),
            storeId: 'og-avatar',
            timeToLive: successesFor(options.persisted),
          },
        );
        return Avatars.of({
          fetch: (image) =>
            cache
              .get(
                new AvatarRequest({
                  period: options.period(),
                  url: avatarUrl(image),
                }),
              )
              .pipe(
                Effect.catchTag(
                  ['PersistenceError', 'SchemaError'],
                  Effect.die,
                ),
              ),
        });
      }),
    );
}

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

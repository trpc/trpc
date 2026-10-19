/**
 * The media store: photos in memory, a PNG header reader for metadata,
 * SVG placeholders as thumbnails, and a `PubSub` of pipeline events.
 */
import { Context, Effect, PubSub, Schema, Stream } from 'effect';
import { TrpcError } from '@trpc12/trpc/server';

/** How long each pipeline step takes, standing in for real work. */
export const STEP_LATENCY = 40;

/** The largest original `photos.uploadOriginal` takes. */
export const MAX_ORIGINAL_BYTES = 1_000_000;

export interface Photo {
  readonly id: string;
  readonly album: string;
  readonly file: File;
  readonly uploadedAt: Date;
}

export const Metadata = Schema.Struct({
  width: Schema.Int,
  height: Schema.Int,
  sha256: Schema.String,
});
export type Metadata = typeof Metadata.Type;

export const PipelineEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('listening') }),
  Schema.Struct({
    kind: Schema.Literal('uploaded'),
    id: Schema.String,
    album: Schema.String,
    name: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('processed'),
    id: Schema.String,
    width: Schema.Int,
    height: Schema.Int,
  }),
]);
export type PipelineEvent = typeof PipelineEvent.Type;

export type UploadStatus = 'running' | 'done' | 'stopped';
export interface Upload {
  readonly status: UploadStatus;
  readonly stored: number;
  readonly total: number;
}

export class PhotoNotFound extends TrpcError.Tagged('PHOTO_NOT_FOUND', {
  status: 404,
  data: Schema.Struct({ id: Schema.String }),
}) {}

export class NotAPng extends TrpcError.Tagged('NOT_A_PNG', {
  status: 422,
  data: Schema.Struct({ name: Schema.String }),
}) {}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const readPng = (file: File) =>
  Effect.gen(function* () {
    const bytes = new Uint8Array(
      yield* Effect.promise(() => file.arrayBuffer()),
    );
    const view = new DataView(bytes.buffer);
    if (
      bytes.length < 24 ||
      PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)
    ) {
      return yield* new NotAPng({ name: file.name });
    }
    // The IHDR chunk comes first: width and height, big-endian, at 16 and 20.
    const digest = yield* Effect.promise(() =>
      crypto.subtle.digest('SHA-256', bytes),
    );
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
      sha256: Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join(''),
    } satisfies Metadata;
  });

export class Photos extends Context.Service<
  Photos,
  {
    readonly add: (album: string, file: File) => Effect.Effect<Photo>;
    readonly get: (id: string) => Effect.Effect<Photo, PhotoNotFound>;
    readonly album: (album: string) => Effect.Effect<ReadonlyArray<Photo>>;
    /** Reads the PNG header and hashes the bytes; slower than a lookup. */
    readonly inspect: (photo: Photo) => Effect.Effect<Metadata, NotAPng>;
    /** A 32px-wide SVG in the photo's aspect ratio; slower still. */
    readonly placeholder: (
      photo: Photo,
      metadata: Metadata,
    ) => Effect.Effect<File>;
    readonly uploads: {
      readonly start: (total: number) => Effect.Effect<string>;
      readonly update: (id: string, upload: Upload) => Effect.Effect<void>;
      readonly get: (id: string) => Effect.Effect<Upload | undefined>;
    };
    /** `listening` once subscribed, then every event from then on. */
    readonly events: Stream.Stream<PipelineEvent>;
  }
>()('Photos') {
  /**
   * One store, built once and shared by every handler that serves it.
   * `latency` stands in for the work a real pipeline does per step.
   */
  static readonly make = (opts: { latency: number }) =>
    Effect.gen(function* () {
      const photos = new Map<string, Photo>();
      const uploads = new Map<string, Upload>();
      const pubsub = yield* PubSub.unbounded<PipelineEvent>();
      const work = Effect.sleep(opts.latency);

      return Photos.of({
        add: (album, file) =>
          Effect.gen(function* () {
            yield* work;
            const photo: Photo = {
              id: `p${photos.size + 1}`,
              album,
              file,
              uploadedAt: new Date(),
            };
            photos.set(photo.id, photo);
            yield* PubSub.publish(pubsub, {
              kind: 'uploaded',
              id: photo.id,
              album,
              name: file.name,
            });
            return photo;
          }),
        get: (id) =>
          Effect.suspend(() => {
            const photo = photos.get(id);
            return photo ? Effect.succeed(photo) : new PhotoNotFound({ id });
          }),
        album: (album) =>
          Effect.sync(() =>
            [...photos.values()].filter((p) => p.album === album),
          ),
        inspect: (photo) => Effect.andThen(work, readPng(photo.file)),
        placeholder: (photo, metadata) =>
          Effect.gen(function* () {
            yield* work;
            yield* work;
            const width = 32;
            const height = Math.max(
              1,
              Math.round((metadata.height / metadata.width) * width),
            );
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#${metadata.sha256.slice(0, 6)}"/></svg>`;
            yield* PubSub.publish(pubsub, {
              kind: 'processed',
              id: photo.id,
              width: metadata.width,
              height: metadata.height,
            });
            return new File([svg], `${photo.id}.svg`, {
              type: 'image/svg+xml',
            });
          }),
        uploads: {
          start: (total) =>
            Effect.sync(() => {
              const id = `u${uploads.size + 1}`;
              uploads.set(id, { status: 'running', stored: 0, total });
              return id;
            }),
          update: (id, upload) =>
            Effect.sync(() => void uploads.set(id, upload)),
          get: (id) => Effect.sync(() => uploads.get(id)),
        },
        events: Stream.unwrap(
          Effect.map(PubSub.subscribe(pubsub), (subscription) =>
            Stream.concat(
              Stream.succeed<PipelineEvent>({ kind: 'listening' }),
              Stream.fromSubscription(subscription),
            ),
          ),
        ),
      });
    });
}

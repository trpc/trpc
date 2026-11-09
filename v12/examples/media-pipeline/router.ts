/**
 * The media pipeline's router. Everything streams: upload progress, reports
 * whose parts resolve as they're ready, album exports carrying files, and
 * pipeline events.
 */
import { Effect, Exit, Schema, Stream } from 'effect';
import {
  error,
  experimental_byteStream,
  initTrpc,
  stream,
} from '@trpc12/trpc/server';
import { Money } from './money.ts';
import {
  MAX_ORIGINAL_BYTES,
  PipelineEvent,
  Photos,
  type Photo,
} from './photos.ts';

const t = initTrpc();

const PhotoId = Schema.Struct({ id: Schema.String });

const UploadProgress = Schema.Struct({
  uploadId: Schema.String,
  id: Schema.String,
  name: Schema.String,
  done: Schema.Int,
  total: Schema.Int,
});

/** Bytes so far while the body streams in, then the stored photo. */
const OriginalProgress = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('received'), bytes: Schema.Int }),
  Schema.Struct({
    kind: Schema.Literal('stored'),
    id: Schema.String,
    bytes: Schema.Int,
  }),
]);

const ExportedPhoto = Schema.Struct({
  id: Schema.String,
  file: Schema.instanceOf(File),
});
const ExportSummary = Schema.Struct({ count: Schema.Int, bytes: Schema.Int });

const Size = Schema.Literals(['S', 'M', 'L']);
const Finish = Schema.Literals(['matte', 'gloss']);
const PRICE_CENTS: Record<typeof Size.Type, number> = {
  S: 150,
  M: 400,
  L: 900,
};
const DAY = 24 * 60 * 60 * 1000;

/** The v11 way: an async generator, its return value typed by `stream()`. */
async function* exportAlbum(photos: ReadonlyArray<Photo>) {
  let bytes = 0;
  for (const photo of photos) {
    bytes += photo.file.size;
    yield { id: photo.id, file: photo.file };
  }
  return { count: photos.length, bytes };
}

export const appRouter = t.router({
  photos: {
    /** Multipart in, progress out: one item per stored photo. */
    upload: t.procedure
      .input(
        Schema.Struct({
          album: Schema.NonEmptyString,
          photos: Schema.Array(Schema.instanceOf(File)).check(
            Schema.isNonEmpty(),
          ),
        }),
      )
      .output(stream(UploadProgress))
      .mutation((opts) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const photos = yield* Photos;
            const total = opts.input.photos.length;
            const uploadId = yield* photos.uploads.start(total);
            let stored = 0;
            return Stream.fromIterable(opts.input.photos).pipe(
              Stream.mapEffect((file) => photos.add(opts.input.album, file)),
              Stream.map((photo) => ({
                uploadId,
                id: photo.id,
                name: photo.file.name,
                done: ++stored,
                total,
              })),
              // The stream runs only as fast as the client reads it, so a
              // client that leaves stops the upload. Ending a stream early is
              // a success exit too.
              Stream.onExit((exit) =>
                photos.uploads.update(uploadId, {
                  status:
                    Exit.isSuccess(exit) && stored === total
                      ? 'done'
                      : 'stopped',
                  stored,
                  total,
                }),
              ),
            );
          }),
        ),
      ),
    /**
     * The request body itself is the input: an Effect `Stream` of its chunks,
     * read as it arrives, so progress streams back while the upload runs.
     */
    uploadOriginal: t.procedure
      .input(experimental_byteStream({ maxBytes: MAX_ORIGINAL_BYTES }))
      .output(stream(OriginalProgress))
      .mutation((opts) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const photos = yield* Photos;
            const chunks: Uint8Array<ArrayBuffer>[] = [];
            let bytes = 0;
            const received = opts.input.pipe(
              Stream.map((chunk) => {
                chunks.push(new Uint8Array(chunk));
                bytes += chunk.byteLength;
                return { kind: 'received', bytes } as const;
              }),
            );
            const stored = Stream.fromEffect(
              Effect.suspend(() =>
                photos.add(
                  'originals',
                  new File(chunks, 'original.png', { type: 'image/png' }),
                ),
              ).pipe(
                Effect.map(
                  (photo) => ({ kind: 'stored', id: photo.id, bytes }) as const,
                ),
              ),
            );
            return Stream.concat(received, stored);
          }),
        ),
      ),
    uploadStatus: t.procedure
      .input(Schema.Struct({ uploadId: Schema.String }))
      .query((opts) =>
        Effect.gen(function* () {
          const upload = yield* (yield* Photos).uploads.get(
            opts.input.uploadId,
          );
          return upload ?? error({ code: 'NOT_FOUND' });
        }),
      ),
    /**
     * The head (name, size, upload date) arrives at once; `metadata` and
     * then `placeholder` stream in as the pipeline gets to them.
     */
    report: t.procedure.input(PhotoId).query((opts) =>
      Effect.gen(function* () {
        const photos = yield* Photos;
        const photo = yield* photos.get(opts.input.id);
        const metadata = Effect.runPromise(photos.inspect(photo));
        return {
          id: photo.id,
          name: photo.file.name,
          type: photo.file.type,
          bytes: photo.file.size,
          uploadedAt: photo.uploadedAt,
          metadata,
          placeholder: metadata.then((m) =>
            Effect.runPromise(photos.placeholder(photo, m)),
          ),
        };
      }),
    ),
    /** The file itself: unbatched, it is the response body, a download link. */
    original: t.procedure.input(PhotoId).query((opts) =>
      Effect.gen(function* () {
        const photo = yield* (yield* Photos).get(opts.input.id);
        return photo.file;
      }),
    ),
    /** An Effect `Stream`, each event validated by `stream()`. */
    events: t.procedure.output(stream(PipelineEvent)).subscription(() =>
      Stream.unwrap(
        Effect.gen(function* () {
          return (yield* Photos).events;
        }),
      ),
    ),
  },
  album: {
    export: t.procedure
      .input(Schema.Struct({ album: Schema.String }))
      .output(stream(ExportedPhoto, ExportSummary))
      .query((opts) =>
        Effect.gen(function* () {
          const photos = yield* (yield* Photos).album(opts.input.album);
          return exportAlbum(photos);
        }),
      ),
  },
  prints: {
    /** Rich input in a GET URL: a `Set`, a `Date` and `Money`, with progressive JSON. */
    quote: t.procedure
      .input(
        Schema.Struct({
          lines: Schema.Array(
            Schema.Struct({
              photoId: Schema.String,
              size: Size,
              copies: Schema.Int.check(Schema.isGreaterThan(0)),
            }),
          ),
          finishes: Schema.ReadonlySet(Finish),
          deliverBy: Schema.Date,
          budget: Schema.instanceOf(Money),
        }),
      )
      .query((opts) => {
        const currency = opts.input.budget.currency;
        const lines = new Map(
          opts.input.lines.map((line) => [
            line.photoId,
            new Money(PRICE_CENTS[line.size] * line.copies, currency),
          ]),
        );
        const gloss = new Money(
          opts.input.finishes.has('gloss') ? 200 * lines.size : 0,
          currency,
        );
        const rush = new Money(
          opts.input.deliverBy.getTime() - Date.now() < 3 * DAY ? 1500 : 0,
          currency,
        );
        const total = [...lines.values()].reduce(
          (sum, price) => sum.plus(price),
          gloss.plus(rush),
        );
        return {
          lines,
          rush,
          total,
          fitsBudget: total.cents <= opts.input.budget.cents,
          deliverBy: opts.input.deliverBy,
        };
      }),
  },
});
export type AppRouter = typeof appRouter;

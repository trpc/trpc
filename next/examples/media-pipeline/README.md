# media-pipeline

Upload photos and get back reports whose fields resolve as they're ready. The example runs tRPC's streaming, file and serializer machinery end to end on Node, and every API it uses is stable.

```bash
pnpm --filter @example/media-pipeline smoke   # or `pnpm example` from next/
```

`index.ts` starts the server on a free port, runs the pipeline with four clients, and throws on any wrong result.

| File        | What's in it                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `photos.ts` | The `Photos` service: an in-memory store, a PNG header reader, SVG placeholders, upload status, and a `PubSub` of pipeline events. Tagged errors `PHOTO_NOT_FOUND`, `NOT_A_PNG`. |
| `router.ts` | The procedures, written in Effect (Effect Schema inputs, services from the layer), plus one async generator, the v11 way.                                                        |
| `money.ts`  | A `Money` class, kept by danSON through a `CustomType` and by superjson through `registerCustom`.                                                                                |
| `server.ts` | One store behind two handlers on one `HttpRouter`: `/trpc` (danSON, batching) and `/sync` (`createSyncSerializer(superjson)`).                                                   |
| `index.ts`  | The smoke: the client side of every feature below.                                                                                                                               |

## What it covers

- **Files in inputs.** `photos.upload` takes `File[]` (Effect Schema `instanceOf(File)`); `httpLink` sends the call alone as `multipart/form-data`.
- **A streamed mutation for progress.** `photos.upload` returns an Effect `Stream`, each item validated by `.output(stream(UploadProgress))`. The client aborts a six-photo upload after the first item; the server stops pulling, and `photos.uploadStatus` shows it stopped early.
- **Nested promises.** `photos.report` returns the head (name, size, a `Date`) at once, then `metadata` (dimensions, SHA-256) and then a `placeholder` `File` as each settles. The smoke checks they arrive at different times, so nothing is buffered until the slowest part. A batch of two reports streams the same way.
- **Errors inside a nested promise.** A text file uploads fine, but its report's `metadata` and `placeholder` reject with `NOT_A_PNG`. A missing photo fails the whole call with `PHOTO_NOT_FOUND`, handled with `safe()` and an exhaustive `matchError()`.
- **Binary frames.** The same report through `httpLink({ binary: true })` arrives as `application/vnd.trpc.frames` instead of JSONL, with the same bytes.
- **Files in outputs.** `photos.original` returns the `File` itself: unbatched it's the response body (`content-type`, `content-disposition`), so the URL is a download link, and it works over superjson too. `album.export` is an async generator yielding `{ id, file }` items, with its return value typed and validated by `stream(Item, Return)`.
- **An Effect `Stream` subscription.** `photos.events` follows a `PubSub`, validated per event with `stream()`, and is read with `createEffectClient` as a `Stream`.
- **Serializers and query URLs.** `prints.quote` takes a `Set`, a `Date` and `Money` in a GET URL (`?input=` with sorted keys, so two key orders give one URL), and returns `Money`, a `Map` and a `Date`. The same call over `/sync` keeps them through superjson. An upload over superjson fails before anything is sent: files in inputs need danSON.

## Notes

- The photos are PNG headers only (signature and `IHDR`), which is all the pipeline reads. `Photos.make({ latency })` sleeps per step to stand in for real work.
- A client that stops reading ends an Effect `Stream` early, and `Stream.onExit` sees a success exit for that, as it does for `Stream.take`. The upload's status compares what was stored with the total to tell the two apart.
- Building this example found that `createSyncSerializer` and the default JSON serializer sent a `File` nested in an input as `{}` (the server then failed input validation), where the docs say they fail before sending. That is fixed in `@trpc12/trpc`'s `serializer/framed.ts`.

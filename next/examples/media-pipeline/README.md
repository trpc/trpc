# media-pipeline

Upload photos and get back reports whose fields resolve as they're ready. The example runs tRPC's streaming, file and serializer machinery end to end on Node. Every API it uses is stable except `experimental_byteStream()`, which `photos.uploadOriginal` uses (see [Byte stream inputs](https://v12.trpc.io/v12/docs/server/byte-streams)).

```bash
pnpm start                       # the server on a free port, then the client against it
pnpm server                      # or the halves apart: the server on PORT (3000)…
pnpm client                      # …and the client against http://localhost:3000/trpc
```

`pnpm example` (from `next/`) runs `pnpm start`. The layout follows [`examples/README.md`](../README.md). The client throws on any wrong result.

| File        | What's in it                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.ts` | `listen(port)`: one store behind two handlers on one `HttpRouter`, `/trpc` (danSON, batching) and `/sync` (`createSyncSerializer(superjson)`).                                   |
| `client.ts` | `main(url)`: four clients (danSON batched, danSON binary frames, superjson, Effect) driving every feature below.                                                                 |
| `start.ts`  | Starts the server, runs the client, and stops the server.                                                                                                                        |
| `router.ts` | The procedures, written in Effect (Effect Schema inputs, services from the layer), plus one async generator, the v11 way.                                                        |
| `photos.ts` | The `Photos` service: an in-memory store, a PNG header reader, SVG placeholders, upload status, and a `PubSub` of pipeline events. Tagged errors `PHOTO_NOT_FOUND`, `NOT_A_PNG`. |
| `money.ts`  | A `Money` class, kept by danSON through a `CustomType` and by superjson through `registerCustom`; both ends import its serializers.                                              |

## What it covers

- **Files in inputs.** `photos.upload` takes `File[]` (Effect Schema `instanceOf(File)`); `httpLink` sends the call alone as `multipart/form-data`.
- **A streamed mutation for progress.** `photos.upload` returns an Effect `Stream`, each item validated by `.output(stream(UploadProgress))`. The client aborts a six-photo upload after the first item; the server stops pulling, and `photos.uploadStatus` shows it stopped early.
- **A byte stream as the input (experimental).** `photos.uploadOriginal` takes `experimental_byteStream({ maxBytes })`: the client passes `file.stream()`, `httpLink` sends it alone as the raw `application/octet-stream` POST body, and the resolver reads it as an Effect `Stream` of chunks. It streams back the bytes received after each chunk the server reads, then the stored photo's id. A body over `MAX_ORIGINAL_BYTES` fails with `PAYLOAD_TOO_LARGE`.
- **Nested promises.** `photos.report` returns the head (name, size, a `Date`) at once, then `metadata` (dimensions, SHA-256) and then a `placeholder` `File` as each settles. The smoke checks they arrive at different times, so nothing is buffered until the slowest part. A batch of two reports streams the same way.
- **Errors inside a nested promise.** A text file uploads fine, but its report's `metadata` and `placeholder` reject with `NOT_A_PNG`. A missing photo fails the whole call with `PHOTO_NOT_FOUND`, handled with `safe()` and an exhaustive `matchError()`.
- **Binary frames.** The same report through `httpLink({ binary: true })` arrives as `application/vnd.trpc.frames` instead of JSONL, with the same bytes.
- **Files in outputs.** `photos.original` returns the `File` itself: unbatched it's the response body (`content-type`, `content-disposition`), so the URL is a download link, and it works over superjson too. `album.export` is an async generator yielding `{ id, file }` items, with its return value typed and validated by `stream(Item, Return)`.
- **An Effect `Stream` subscription.** `photos.events` follows a `PubSub`, validated per event with `stream()`, and is read with `createEffectClient` as a `Stream`.
- **Serializers and query URLs.** `prints.quote` takes a `Set`, a `Date` and `Money` in a GET URL (`?input=` with sorted keys, so two key orders give one URL), and returns `Money`, a `Map` and a `Date`. The same call over `/sync` keeps them through superjson. An upload over superjson fails before anything is sent: files in inputs need danSON.

## Notes

- The photos are PNG headers only (signature and `IHDR`), which is all the pipeline reads. Each step sleeps `STEP_LATENCY` (40ms) to stand in for real work, and the client's timing checks use the same constant.
- A client that stops reading ends an Effect `Stream` early, and `Stream.onExit` sees a success exit for that, as it does for `Stream.take`. The upload's status compares what was stored with the total to tell the two apart.
- Building this example found that `createSyncSerializer` and the default JSON serializer sent a `File` nested in an input as `{}` (the server then failed input validation), where the docs say they fail before sending. That is fixed in `@trpc12/trpc`'s `serializer/framed.ts`.

---
title: Byte stream inputs
description: '`experimental_byteStream()` takes a `ReadableStream<Uint8Array>` as the request body, and the resolver reads it as an Effect Stream while it arrives.'
section: Server
order: 7.5
experiment: byte-streams
---

An input of `experimental_byteStream()` is the request body itself. The client passes a `ReadableStream<Uint8Array>`, `httpLink` or `httpStreamLink` sends it alone as an `application/octet-stream` body, and the resolver gets an `experimental_ByteStream`: an Effect `Stream<Uint8Array>` that reads the body as the resolver pulls it, so nothing is buffered first.

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
declare const storage: {
  append(chunk: Uint8Array): Effect.Effect<void>;
};
// ---cut-end---
import { experimental_byteStream } from '@trpc12/trpc/server';
import { Effect, Stream } from 'effect';

const upload = t.procedure
  .input(experimental_byteStream({ maxBytes: 100_000_000 }))
  .mutation((opts) =>
    Stream.runForEach(opts.input, (chunk) => storage.append(chunk)),
  );
```

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { experimental_byteStream } from '@trpc12/trpc/server';
import { Stream } from 'effect';
import { t } from './server.ts';
const router = {
  upload: t.procedure
    .input(experimental_byteStream())
    .mutation((opts) => Stream.runDrain(opts.input)),
};
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
declare const file: File;
// ---cut-end---
await client.upload.mutate(file.stream());
```

Only the whole input can be a stream. Send what goes with it (a name, a type) in headers or in a call before it.

## Reading the stream

- `maxBytes` fails the stream with `PAYLOAD_TOO_LARGE` once more bytes than that have arrived. There's no limit by default: the handler's `maxBodySize` covers JSON and multipart bodies, not a stream, which is read only as fast as the resolver pulls it.
- A body that can't be read (a connection reset) fails the stream with `BAD_REQUEST`. A client that goes away interrupts the call, as it does any other.
- The body is read once. Reading the stream a second time fails it with `BAD_REQUEST`.
- A resolver that stops early (`Stream.take`, a failure) still answers: on Node, the rest of the body is read and dropped rather than cut off, which would drop the connection before the response. A resolver that doesn't read the stream at all leaves the body to the server.

Both failures are in the procedure's error union, so the client can match `PAYLOAD_TOO_LARGE` as a typed error.

## Streaming back

The output can stream while the body is still arriving: a mutation with `.output(stream(Item))` can send progress for the chunks it has read. Reading a streamed output takes `httpStreamLink`.

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
// ---cut-end---
import { experimental_byteStream, stream } from '@trpc12/trpc/server';
import { Schema, Stream } from 'effect';

const progress = t.procedure
  .input(experimental_byteStream())
  .output(stream(Schema.Number))
  .mutation((opts) =>
    opts.input.pipe(
      Stream.mapAccum(
        () => 0,
        (read, chunk) => {
          const total = read + chunk.byteLength;
          return [total, [total]] as const;
        },
      ),
    ),
  );
```

Node's `fetch` reads the response while it sends the body. Browsers send stream bodies only over HTTP/2 and later, read the response once the body is sent, and not all of them can yet; where `fetch` can't, the call fails before anything is sent. An input with a `File` in it, sent as multipart, works everywhere.

## Links and handlers

- `httpLink` and `httpStreamLink` send the call alone, outside any batch, as a `POST` (queries too). It isn't resumed when the connection drops, and `retryLink` doesn't retry it by default, since the stream was read.
- `wsLink` and the other socket links fail the call with `BAD_REQUEST`. `localLink` and `createRouterClient` pass the stream through as it is.
- The handler takes an `application/octet-stream` body only for a procedure whose input is `experimental_byteStream()`, and only with the `trpc-version` header that both HTTP links send, so a page on another site can't post one (`UNSUPPORTED_MEDIA_TYPE` otherwise). Any other input in it fails validation with `BAD_REQUEST`.
- It streams on Node, Bun, Deno and fetch runtimes. AWS Lambda buffers event bodies, so the stream reads from memory, within Lambda's payload limit. Behind Express, a body `express.raw()` read is replayed; one that another parser read and dropped fails the call with `INTERNAL_SERVER_ERROR`.

`experimental_byteStream()` is an Effect Schema that decodes the `ReadableStream` to a `Stream` and encodes one back, so in-process calls decode it as the handler does.

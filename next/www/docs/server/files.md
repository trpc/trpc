---
title: Files
description: File and Blob values in inputs and outputs, sent as multipart, raw bodies or streamed chunks.
section: Server
order: 7
v11: server/non-json-content-types
---

`File` and `Blob` values can sit anywhere in an input. `httpLink` sends that call alone (outside a batch) as `multipart/form-data`, and the handler rebuilds them before validation. `maxBodySize` covers the whole body.

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
declare const storage: { put(id: string, file: File): Promise<void> };
// ---cut-end---
import { z } from 'zod';

const setCover = t.procedure
  .input(z.object({ postId: z.string(), cover: z.instanceof(File) }))
  .mutation((opts) => storage.put(opts.input.postId, opts.input.cover));
```

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
declare const storage: { put(id: string, file: File): Promise<void> };
const router = t.router({
  setCover: t.procedure
    .input(z.object({ postId: z.string(), cover: z.instanceof(File) }))
    .mutation((opts) => storage.put(opts.input.postId, opts.input.cover)),
});
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
declare const file: File;
// ---cut-end---
await client.setCover.mutate({ postId: '1', cover: file });
```

The handler only takes a multipart body with the `trpc-version` header, which `httpLink` sends and a cross-site form can't, so a form on another site can't run your mutations (other `POST` bodies must be `application/json` for the same reason).

`wsLink` doesn't send files; the call fails with a `BAD_REQUEST`. For large uploads, use presigned URLs.

## Files in outputs

Outputs can hold files too, over every link:

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
declare function csv(id: string): string;
// ---cut-end---
import { z } from 'zod';

const report = t.procedure
  .input(z.object({ id: z.string() }))
  .query(
    (opts) =>
      new File([csv(opts.input.id)], 'report.csv', { type: 'text/csv' }),
  );
```

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
declare function csv(id: string): string;
const router = t.router({
  report: t.procedure
    .input(z.object({ id: z.string() }))
    .query(
      (opts) =>
        new File([csv(opts.input.id)], 'report.csv', { type: 'text/csv' }),
    ),
});
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
declare const id: string;
// ---cut-end---
const report = await client.report.query({ id }); // File
```

- When a `File` or `Blob` is the whole output of a call that isn't batched, `httpLink` gets it as the response body, with its `content-type` and a `content-disposition` naming the file, so the URL works as a download link too.
- Anywhere else (nested in an object, yielded by an async iterable, or in a batch), its bytes stream after the rest of the output as base64 chunks. The value holding it resolves once they've arrived, so a nested `File` is a `File`, not a promise. A file that appears twice is sent once.

## Binary frames

Those chunks are base64 in JSONL, SSE and WebSocket messages. `httpLink({ binary: true })` asks for binary frames instead (`application/vnd.trpc.frames`: the same lines, length-prefixed, with the bytes unencoded), a third smaller; servers answer with JSONL to clients that don't ask. `wsLink({ binary: true })` gets each chunk of bytes as a binary message. `localLink` always passes the bytes as they are.

## Transformers

A root `File` or `Blob` output of an unbatched HTTP call is the response body, with any transformer. On a batching chain, plain JSON can't batch it, so such calls take `{ batch: false }` (a type error otherwise). Files anywhere else, and files in inputs, need progressive JSON; the other transformers fail before sending ([Transformers](./transformers.md)).

The [`examples/media-pipeline`](../../../examples/media-pipeline/README.md) app uploads photos as multipart, returns files as response bodies and inside streamed outputs, and reads them as binary frames.

---
id: httpLink
title: HTTP Link
description: A terminating link that sends each tRPC call as its own HTTP request
sidebar_label: HTTP Link
slug: /client/links/httpLink
section: "Client Usage"
parent: "client/links"
order: 31
---

`httpLink` is a [**terminating link**](../links.md#the-terminating-link) that sends a tRPC operation to a tRPC procedure over HTTP.

`httpLink` supports both POST and GET requests.

## Usage

You can import and add the `httpLink` to the `links` array as such:

```ts twoslash title="client/index.ts"
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: 'http://localhost:3000',
      // transformer,
    }),
  ],
});
```

## `httpLink` Options

The `httpLink` function takes an options object that has the `HTTPLinkOptions` shape.

```ts twoslash
type DataTransformerOptions = any;
type HTTPHeaders = Record<string, string[] | string | undefined>;
type Operation = { id: number; type: string; input: unknown; path: string };
// ---cut---
export interface HTTPLinkOptions {
  url: string | URL;
  /**
   * Add ponyfill for fetch
   */
  fetch?: typeof fetch;
  /**
   * Data transformer
   * @see https://trpc.io/docs/server/data-transformers
   **/
  transformer?: DataTransformerOptions;
  /**
   * Headers to be set on outgoing requests or a callback that of said headers
   * @see https://trpc.io/docs/client/headers
   */
  headers?:
    | HTTPHeaders
    | ((opts: { op: Operation }) => HTTPHeaders | Promise<HTTPHeaders>);
  /**
   * Called with the input of every call before it is serialized or has its
   * content type detected. Return the value to send instead.
   */
  prepareInput?: (opts: {
    value: unknown;
    type: 'query' | 'mutation' | 'subscription';
    path: string;
    methodOverride?: 'POST';
  }) => unknown;
  /**
   * Send all requests as POSTS requests regardless of the procedure type
   * The server must separately allow overriding the method. See:
   * @see https://trpc.io/docs/rpc
   */
  methodOverride?: 'POST';
  /**
   * The character between a procedure path's segments in URLs. Must match
   * the server's `pathSeparator`.
   * @default '.'
   * @see https://trpc.io/docs/rpc#path-separator
   */
  pathSeparator?: '.' | '_' | '~' | '-';
}
```

## Preparing the input

`prepareInput` is called with every call's input, type, path and `methodOverride`. It runs before tRPC decides how to send the input — before the transformer and before the `FormData`/`File`/`Blob` content-type detection — and the value it returns is sent instead. The callback is synchronous: return the prepared value, not a promise.

Use it when the value your components have isn't the value the server needs, for example a form payload that contains a `File`:

```ts twoslash
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const uploadInput = z.union([
  z.instanceof(FormData),
  z.object({ name: z.string(), file: z.instanceof(File) }),
]);

export const appRouter = t.router({
  upload: t.procedure.input(uploadInput).mutation(({ input }) => {
    if (!(input instanceof FormData)) {
      throw new Error('Expected FormData');
    }
    const file = input.get('file');
    return { fileName: file instanceof File ? file.name : '' };
  }),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: 'http://localhost:2022',
      prepareInput({ value, path }) {
        if (path !== 'upload') {
          return value;
        }
        if (value instanceof FormData) {
          return value;
        }
        const { name, file } = value as { name: string; file: File };
        const form = new FormData();
        form.set('name', name);
        form.set('file', file);
        return form;
      },
    }),
  ],
});
// ---cut---
const file = new File(['hello world'], 'hello.txt', { type: 'text/plain' });

await client.upload.mutate({ name: 'Bilbo', file });
```

With a `splitLink`, route payloads that need preparation to the `httpLink` that defines `prepareInput`; `isNonJsonSerializable(op.input)` only detects top-level `FormData`/`Blob`/`Uint8Array`, so a wrapped upload such as `{ file }` needs a split condition that matches the object shape (for example its `File` property).

Returning `FormData` or a binary type changes how the request is sent, so the same rules as [non-JSON content types](/docs/server/non-json-content-types) apply: the procedure must be a mutation, unless the link sets `methodOverride: 'POST'` and the server sets `allowMethodOverride: true`.

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/main/packages/client/src/links/httpLink.ts)

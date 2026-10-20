---
title: Generating a client with Hey API
description: Generate a typed SDK of the REST routes from the OpenAPI document, with Hey API.
section: Contracts and OpenAPI
order: 6
experiment: contracts
---

[Hey API](https://heyapi.dev) (`@hey-api/openapi-ts`) turns an OpenAPI document into a TypeScript SDK, with plugins for validators, TanStack Query, mocks and more. Point it at the document `experimental_generateOpenApi` writes, and apps that can't import the router's type get typed functions for its REST routes: another team's app, a public API's users, another repository. An app that can import the router's type is better served by the tRPC client, which needs no generation step.

## The document

This router serves the blog over REST: a query with a declared `NOT_FOUND` error, a mutation behind a bearer token that takes a file, and a subscription. The document declares the `bearer` scheme that `authed` routes require ([Security and tags](./document.md#security-and-tags)):

```sample title="rest.ts"
docs/src/rest.ts
```

A script writes it where Hey API reads it:

```ts twoslash
// ---cut-start---
import { writeFile } from 'node:fs/promises';
import { document } from './rest.ts';
// ---cut-end---
await writeFile('openapi.json', JSON.stringify(document, null, 2));
```

## Generating the SDK

```ts twoslash
// @filename: openapi-ts.config.ts
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi.json',
  output: 'src/api',
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    { name: '@hey-api/sdk', transformer: true },
    { name: '@hey-api/transformers', dates: true },
  ],
});
```

```sh
npx @hey-api/openapi-ts
```

Hey API 0.99 needs TypeScript 5 or 6: it uses TypeScript 6's JavaScript API, which TypeScript 7 replaced. A project on TypeScript 7.1, which `experimental_generateOpenApiFromTypes` needs, can run it with TypeScript 6 alongside: `pnpm dlx --package=@hey-api/openapi-ts --package=typescript@6 openapi-ts`.

What the document gives Hey API:

- Each `operationId` is the procedure's path, so `post.byId` is `postById()`. `route.operationId` renames one.
- Each declared error is a response whose `code` is a constant. The `default` response leaves out the codes the operation documents, so `error.defined && error.code === 'NOT_FOUND'` narrows to the declared error and its `data` ([The document](./document.md)).
- Operations with `security` send the credentials from the client's `auth` option.
- A body with a file is `multipart/form-data`, so the SDK sends a `FormData` ([Inputs](./routes.md#input)).
- `Date`s are `date-time` strings, which `transformers` with `dates: true` turns back into `Date`s.

## Calling the API

```ts twoslash
import { client } from './api/client.gen';
import { postById, postCreate } from './api';

client.setConfig({
  baseUrl: 'https://api.example.com',
  auth: () => localStorage.getItem('token') ?? undefined,
});

const result = await postById({ path: { id: '1' } });
if (result.error) {
  const error = result.error;
  if (error.defined && error.code === 'NOT_FOUND') {
    console.log(`No post ${error.data.id}`);
  } else {
    console.log(error.message);
  }
} else {
  console.log(result.data.title, result.data.createdAt.getFullYear());
}

const cover = new File(['…'], 'cover.png', { type: 'image/png' });
await postCreate({ body: { title: 'Hello', cover } });
```

## Subscriptions

A subscription is a stream of server-sent events. Its function returns `{ stream }`, and Hey API reconnects after a dropped connection with `Last-Event-ID`, so [`tracked()`](../subscriptions/overview.md#resuming) events resume. Hey API yields the data of every event, though: tRPC ends a stream with a `done` event, whose data is empty, and sends a failure as an `error` event with the error as data. `onSseEvent` runs just before each item is yielded, so it tells them apart:

```ts twoslash
import { postOnAdd } from './api';

let event: string | undefined;
const events = await postOnAdd({
  onSseEvent: (e) => {
    event = e.event;
  },
});
for await (const post of events.stream) {
  if (event === 'done') break;
  if (event === 'error')
    throw new Error('Subscription failed', { cause: post });
  console.log(post.title);
}
```

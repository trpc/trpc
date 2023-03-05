---
id: data-transformers
title: Data Transformers
sidebar_label: Data Transformers
slug: /data-transformers
---

You are able to serialize the response data & input args. The transformers need to be added both to the server and the client.

## Using [superjson](https://github.com/blitz-js/superjson)

SuperJSON allows us to transparently use e.g. standard `Date`/`Map`/`Set`s over the wire between the server and client. That means you can return any of these types in your API-resolver and use them in the client without recreating the objects from JSON.

### How to

#### 1. Install

```bash
yarn add superjson
```

#### 2. Add to `createTRPCCLient()` or `withTRPC()` config

```ts title='client.ts'
import superjson from 'superjson';

// [...]

export const client = createTRPCClient<AppRouter>({
  // [...]
  transformer: superjson,
});
```

```ts title='pages/_app.tsx'
import superjson from 'superjson';

// [...]

export default withTRPC<AppRouter>({
  config({ ctx }) {
    return {
      // [...]
      transformer: superjson,
    };
  },
})(MyApp);
```

#### 3. Add to your `AppRouter`

```ts title='server/routers/_app.ts'
import * as trpc from '@trpc/server';
import superjson from 'superjson';

export const appRouter = trpc.router().transformer(superjson);
// .query(...)
```

## Different transformers for upload and download

If a transformer should only be used for one direction or different transformers should be used for upload and download (e.g. for performance reasons), you can provide individual transformers for upload and download. Make sure you use the same combined transformer everywhere.

### How to

Here [superjson](https://github.com/blitz-js/superjson) is used for uploading and [devalue](https://github.com/Rich-Harris/devalue) for downloading data, because devalue is a lot faster but insecure to use on the server.

#### 1. Install

```bash
yarn add superjson devalue
```

#### 2. Add to `utils/trpc.ts`

```ts title='utils/trpc.ts'
import { uneval } from 'devalue';
import superjson from 'superjson';

// [...]

export const transformer = {
  input: superjson,
  output: {
    serialize: (object) => uneval(object),
    deserialize: (object) => eval(`(${object})`),
  },
};
```

#### 3. Add to `createTRPCCLient()`

```ts title='client.ts'
import { transformer } from '../utils/trpc';

// [...]

export const client = createTRPCClient<AppRouter>({
  // [...]
  transformer: transformer,
});
```

#### 4. Add to your `AppRouter`

```ts title='server/routers/_app.ts'
import * as trpc from '@trpc/server';
import { transformer } from '../../utils/trpc';

export const appRouter = trpc.router().transformer(transformer);
// .query(...)
```

## `DataTransformer` interface

```ts
type DataTransformer = {
  serialize(object: any): any;
  deserialize(object: any): any;
};

type CombinedDataTransformer = {
  input: DataTransformer;
  output: DataTransformer;
};
```

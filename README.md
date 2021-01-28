<div align="center">
  <h1 align="center">tRPC</h1>
  <p>a toolkit for building end-to-end TypeScript data layers</p>
</div>

<br/>
<br/>

# Motivation

> This library is undergoing rapid development and should be considered experimental. 🤙

tRPC is a framework for building strongly typed RPC APIs with TypeScript. Alternatively, you can think of it as a way to avoid APIs altogether.

- No code generation. Simply write route in the backend and use on the frontend and get all the types inferred both on input and output.
- No runtime bloat. TRPC has direct no deps and has tiny client-side footprint).
- No double-declaration of types. Actually you don't have to declare types, as they are inferred.
- No documentation to be kept up-to-date
- Type guarantee in resolvers - input are parsed by the validation schema
- Got React-library but not tied to React (wanna make one for Svelte or Vue? [Contact me](https://twitter.com/alexdotjs))

## Getting started

You can play with local examples:

- `yarn example:playground`
- `yarn example:chat` - runs a real-time chat example with SSG & Prisma as a data store
- `yarn example:hello` runs a minimal Next.js example 

### Next.js

The code here is taken from [`./examples/next-hello-world`](./examples/next-hello-world).
#### 0. Install deps

```bash
yarn add @trpc/client @trpc/server @trpc/react zod react-query
```

- tRPC wraps a tiny layer of sugar around [react-query](https://react-query.tanstack.com/overview) when using React which gives you type safety and auto completion of your routes
- Zod is recommended but not required, any validation lib is easy to integrate. Only included on the server as default, so does not affect bundle size.

#### 1. Create an API handler

Create a file at `./pages/api/trpc/[...trpc].ts`

Paste the following code:

```ts
import * as trpc from '@trpc/server';
import * as z from 'zod';

// The app's context - is typically generated for each request
export type Context = {};
const createContext = ({
  req,
  res,
}: trpc.CreateNextContextOptions): Context => {
  return {};
};

function createRouter() {
  return trpc.router<Context>();
}
const router = createRouter()
  // Create route at path 'hello'
  .query('hello', {
    // using zod schema to validate and infer input values
    input: z
      .object({
        text: z.string().optional(),
      })
      .optional(),
    resolve({ input }) {
      // the `input` here is type checked and inferred
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    },
  });

// Exporting type _type_ AppRouter only exposes types that can be used for inference
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
export type AppRouter = typeof router;

// export API handler
export default trpc.createNextApiHandler({
  router,
  createContext,
});

```

#### 2. Create trpc client


Create `./utils/trpc.ts`

```tsx
import { createReactQueryHooks, createTRPCClient } from '@trpc/react';
import { QueryClient } from 'react-query';
// Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter, Context } from '../pages/api/trpc/[...trpc]';

export const client = createTRPCClient<AppRouter>({
  url: '/api/trpc',
});

export const trpc = createReactQueryHooks<AppRouter, Context>({
  client,
  queryClient: new QueryClient(),
});
```

#### 2. Configure `_app.tsx` 

```tsx
import type { AppProps } from 'next/app';
import { QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import { trpc } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={trpc.queryClient}>
      <Hydrate state={pageProps.dehydratedState}>
        <Component {...pageProps} />
      </Hydrate>
    </QueryClientProvider>
  );
}
export default MyApp;
```


#### 3. Start consuming your API!


```tsx
import Head from 'next/head';
import { trpc } from '../utils/trpc';

export default function Home() {
  // try typing here to see that you get autocompletioon & type safety on the route name
  const helloNoArgs = trpc.useQuery('hello');
  const helloWithArgs = trpc.useQuery(['hello', { text: 'client' }]);

  // try to uncomment next line to show type checking:
  // const helloWithInvalidArgs = trpc.useQuery(['hello', { text: false }]);

  console.log(helloNoArgs.data); // <-- hover over this object to see it's type inferred

  return (
    <div>
      <Head>
        <title>Hello tRPC</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <h1>Hello World Example</h1>
      <ul>
        <li>
          helloNoArgs ({helloNoArgs.status}):{' '}
          <pre>{JSON.stringify(helloNoArgs.data, null, 2)}</pre>
        </li>
        <li>
          helloWithArgs ({helloWithArgs.status}):{' '}
          <pre>{JSON.stringify(helloWithArgs.data, null, 2)}</pre>
        </li>
      </ul>
    </div>
  );
}
```

### Data transformers

You are able to serialize the output data & input args (in order to be able to transparently use e.g. standard `Date`s). The transformers need to be added both to the server and the client.

Data transformers currently live on the edges - in client-specific implementation & in the API response adapters. See a reference of how superjson is attached to ..

- `createNextApiHandler()` in [`./examples/next-ssg-chat/[...trpc.ts]`](./examples/next-ssg-chat/pages/api/trpc/%5B...trpc%5D.ts), and
- `createReactQueryHooks` in [`./examples/next-ssg-chat/pages/_app.tsx`](./examples/next-ssg-chat/pages/_app.tsx)

## Internals

### HTTP Methods <-> endpoint type mapping

| HTTP Method | Mapping           | Notes                                                                             |
| ----------- | ----------------- | --------------------------------------------------------------------------------- |
| `GET`       | `.query()`        | Input in query string                                                             |
| `POST`      | `.mutation()`     | Input in post body                                                                |
| `PATCH`     | `.subscription()` | Experimental API using long-pulling. Implementation details are likely to change. |


# Development

```sh
yarn install
```

This will install all dependencies in each project, build them, and symlink them via Lerna

## Development workflow

```bash
git clone git@github.com:@trpc/trpc.git
cd trpc
yarn
```

In one terminal, run tsdx watch in parallel:

```sh
yarn dev
```

This builds each package to `<packages>/<package>/dist` and runs the project in watch mode so any edits you save inside `<packages>/<package>/src` cause a rebuild to `<packages>/<package>/dist`. The results will stream to to the terminal.

### Using the examples/playground


### Running Cypress

(todo)

(In a third terminal) you can run Cypress and it will run your integration tests against the playground/example. If you want to keep integration tests and examples seperate you can copy the example folder to another folder called like `app` or whatever. Cypress will look for `localhost:1234` by default. If you change ports, also make sure to update [`.github/integration.yaml`](.github/integration.yml) as well.

<p align="center">
  <a href="https://trpc.io/"><img src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg" alt="tRPC" height="75"/></a>
</p>

<h3 align="center">tRPC</h3>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <img src="https://assets.trpc.io/www/v10/v10-dark-landscape.gif" alt="Demo" />
</p>

# `@trpc/next`

> Connect a tRPC router to Next.js.

## Documentation

Full documentation for `@trpc/next` can be found [here](https://trpc.io/docs/nextjs)

## Installation

```bash
# npm
npm install @trpc/next @trpc/react-query @tanstack/react-query

# Yarn
yarn add @trpc/next @trpc/react-query @tanstack/react-query

# pnpm
pnpm add @trpc/next @trpc/react-query @tanstack/react-query
```

## Basic Example

Setup tRPC in `utils/trpc.ts`.

```ts
import { createTRPCNext, httpBatchLink } from '@trpc/next';
// Import the router type from your server file
import type { AppRouter } from '../pages/api/[trpc].ts';

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      links: [
        httpBatchLink({
          url: 'http://localhost:3000/trpc',
        }),
      ],
    };
  },
  ssr: true,
});
```

Hook up tRPC inside `_app.tsx`.

```ts
import { trpc } from '~/utils/trpc';

const App = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default trpc.withTRPC(App);
```

Now you can query your API in any component.

```ts
import { trpc } from '~/utils/trpc';

export function Hello() {
  const { data, error, status } = trpc.greeting.useQuery({
    name: 'tRPC',
  });

  if (error) {
    return <p>{error.message}</p>;
  }

  if (status !== 'success') {
    return <p>Loading...</p>;
  }

  return <div>{data && <p>{data.greeting}</p>}</div>;
}
```

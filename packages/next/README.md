<p align="center">
  <a href="https://trpc.io/"><img src="../../www/static/img/logo-text.svg" alt="tRPC" height="130"/></a>
</p>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <img src="https://user-images.githubusercontent.com/51714798/186850605-7cb9f6b2-2230-4eb7-981b-0b90ee1f8ffa.gif" alt="Demo" />
</p>

# `@trpc/next`

> Connect a tRPC router to Next.js.

## Documentation

Full documentation for `@trpc/next` can be found [here](https://trpc.io/docs/nextjs)

## Installation

```bash
# npm
npm install @trpc/next @trpc/react react-query

# Yarn
yarn add @trpc/next @trpc/react react-query

# pnpm
pnpm add @trpc/next @trpc/react react-query
```

## Basic Example

Setup tRPC in `utils/trpc.ts`.

```ts
import { setupTRPC } from '@trpc/next';
// Import the router type from your server file
import type { AppRouter } from '../pages/api/[trpc].ts';

export const trpc = setupTRPC<AppRouter>({
  config() {
    return {
      url: 'http://localhost:3000/api/trpc',
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
  const { data, error, status } = trpc.proxy.greeting.useQuery({
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

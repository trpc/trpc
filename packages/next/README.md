<p align="center">
  <a href="https://trpc.io/"><img src="../../www/static/img/logo-text.svg" alt="tRPC" height="130"/></a>
</p>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <!-- TODO: replace with new version GIF -->
  <img src="https://storage.googleapis.com/trpc/trpcgif.gif" alt="Demo" />
</p>

# `@trpc/next`

> The `@trpc/next` package is responsible for connecting a trpc server to a Next.js application.

## Documentation

Full documentation for `@trpc/next` can be found [here](https://trpc.io/docs/nextjs)

## Installation

```bash
# NPM
npm install @trpc/next @trpc/react react-query

# Yarn
yarn add @trpc/next @trpc/react react-query

# Pnpm
pnpm install @trpc/next @trpc/react react-query
```

## Basic Example

Setup trpc in `utils/trpc.ts` file

```typescript
import { setupTRPC } from '@trpc/next';
// Import the router type from your server file
import type { AppRouter } from '../pages/api/[trpc].ts';

export const trpc = setupTRPC<AppRouter>({
  config() {
    return {
      url: 'http://localhost:2022/trpc',
    };
  },
  ssr: true,
});
```

Hook up trpc inside `_app.tsx`

```typescript
import { trpc } from '~/utils/trpc.ts';

const App = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default trpc.withTRPC(App);
```

Now you can query the trpc API in any component

```typescript
import { trpc } from '~/utils/trpc.ts';

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

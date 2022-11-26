<p align="center">
  <a href="https://trpc.io/"><img src="../../www/static/img/logo-text.svg" alt="tRPC" height="130"/></a>
</p>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <img src="https://assets.trpc.io/www/v10/preview-dark.gif" alt="Demo" />
</p>

# `@trpc/client`

> Communicate with a tRPC server on the client side.

## Documentation

Full documentation for `@trpc/client` can be found [here](https://trpc.io/docs/vanilla)

## Installation

```bash
# npm
npm install @trpc/client

# Yarn
yarn add @trpc/client

# pnpm
pnpm add @trpc/client
```

## Basic Example

```ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
// Importing the router type from the server file
import type { AppRouter } from './server';

// Initializing the tRPC client
const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});


async function main() {
  // Querying the greeting
  const helloResponse = await trpc.greeting.query({
    name: 'world',
  });

  console.log('helloResponse', helloResponse); // Hello world
}

main();
```

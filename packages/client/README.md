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

# Bun
bun add @trpc/client
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

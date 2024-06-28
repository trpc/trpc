# Prisma + tRPC + WebSockets

Try demo http://websockets.trpc.io/

## Features

- 🧙‍♂️ E2E type safety with [tRPC](https://trpc.io)
- ⚡ Full-stack React with Next.js
- ⚡ WebSockets / Subscription support
- ⚡ Database with Prisma
- 🔐 Authorization using [next-auth](https://next-auth.js.org/)
- ⚙️ VSCode extensions
- 🎨 ESLint + Prettier
- 💚 CI setup using GitHub Actions:
  - ✅ E2E testing with [Playwright](https://playwright.dev/)
  - ✅ Linting

## Setup

```bash
pnpm create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-websockets-starter trpc-prisma-websockets-starter
cd trpc-prisma-websockets-starter
pnpm i
pnpm dx
```

## Files of note

<table>
  <thead>
    <tr>
      <th>Path</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href="./prisma/schema.prisma"><code>./prisma/schema.prisma</code></a></td>
      <td>Prisma schema</td>
    </tr>
    <tr>
      <td><a href="./src/api/trpc/[trpc].tsx"><code>./src/api/trpc/[trpc].tsx</code></a></td>
      <td>tRPC response handler</td>
    </tr>
    <tr>
      <td><a href="./src/server/routers"><code>./src/server/routers</code></a></td>
      <td>Your app's different tRPC-routers</td>
    </tr>
  </tbody>
</table>

## Commands

```bash
pnpm build      # runs `prisma generate` + `prisma migrate` + `next build`
pnpm db-nuke    # resets local db
pnpm dev        # starts next.js + WebSocket server
pnpm dx         # starts postgres db + runs migrations + seeds + starts next.js
pnpm test-dev   # runs e2e tests on dev
pnpm test-start # runs e2e tests on `next start` - build required before
pnpm test:unit  # runs normal Vitest unit tests
pnpm test:e2e   # runs e2e tests
```

---

Created by [@alexdotjs](https://twitter.com/alexdotjs).

# Prisma + tRPC + SSE

Try demo http://sse.trpc.io/

## Features

- 🧙‍♂️ E2E type safety with [tRPC](https://trpc.io)
- ⚡ Full-stack React with Next.js
- ⚡ Server-sent-events / Subscription support
- ⚡ Database with Prisma
- 🔐 Authorization using [next-auth](https://next-auth.js.org/)
- ⚙️ VSCode extensions
- 🎨 ESLint + Prettier
- 💚 CI setup using GitHub Actions:
  - ✅ E2E testing with [Playwright](https://playwright.dev/)
  - ✅ Linting

## Setup

```bash
pnpm create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-sse-subscriptions trpc-prisma-sse-subscriptions
cd trpc-prisma-sse-subscriptions
cp .env.example .env
pnpm i
pnpm reset-dev
```

## Deployment

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
pnpm dev        # starts next.js
pnpm db-reset   # resets local db
pnpm reset-dev  # resets db + starts Next.js
pnpm test-dev   # runs e2e tests on dev
pnpm test-start # runs e2e tests on `next start` - build required before
pnpm test:unit  # runs normal Vitest unit tests
pnpm test:e2e   # runs e2e tests
```

---

Created by [@alexdotjs](https://twitter.com/alexdotjs).

# Prisma + tRPC


> V10 Preview of tRPC!

- 📚 See docs here: https://alpha.trpc.io/docs
- 🙏 Feel free to open issues in this repo to give feedback!
- ❓ Search the project for `QUESTION` for open API discussions, but don't feel limited to *only* give feedback on those!
- ⚡ ~~Open in CodeSandbox: [https://codesandbox.io/s/github/trpc/examples-v10-next-prisma-starter-sqlite](https://codesandbox.io/s/github/trpc/examples-v10-next-prisma-starter-sqlite?file=/src/pages/post/%5Bid%5D.tsx)~~ Inference on CodeSandbox currently doesn't work, so you'll have to open the project locally

<!-- 

## Features

- 🧙‍♂️ E2E typesafety with [tRPC](https://trpc.io)
- ⚡ Full-stack React with Next.js
- ⚡ Database with Prisma
- ⚙️ VSCode extensions
- 🎨 ESLint + Prettier
- 💚 CI setup using GitHub Actions:
  - ✅ E2E testing with [Playwright](https://playwright.dev/)
  - ✅ Linting
- 🔐 Validates your env vars on build and start

## Setup

**yarn:**
```bash
yarn create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
cd trpc-prisma-starter
yarn
yarn dx
```

**npm:**

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
cd trpc-prisma-starter
yarn
yarn dx
```
 -->


### Requirements

- Node >= 14
<!-- - Postgres -->

## Development

### Clone & start project

```bash
yarn create next-app --example https://github.com/trpc/examples-v10-next-prisma-starter-sqlite trpc-prisma-starter
cd trpc-prisma-starter
yarn
yarn dev
```

### Commands

```bash
yarn build      # runs `prisma generate` + `prisma migrate` + `next build`
yarn db-reset   # resets local db
yarn dev        # does db changes + starts next.js
yarn test-dev   # runs e2e tests on dev
yarn test-start # runs e2e tests on `next start` - build required before
yarn test:unit  # runs normal jest unit tests
yarn test:e2e   # runs e2e tests
```

## Deployment

### Using [Render](https://render.com/)

The project contains a [`render.yaml`](./render.yaml) [*"Blueprint"*](https://render.com/docs/blueprint-spec) which makes the project easily deployable on [Render](https://render.com/).

Go to [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints) and connect to this Blueprint and see how the app and database automatically gets deployed.

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
      <td><a href="./src/pages/api/trpc/[trpc].ts"><code>./src/pages/api/trpc/[trpc].ts</code></a></td>
      <td>tRPC response handler</td>
    </tr>
    <tr>
      <td><a href="./src/server/routers"><code>./src/server/routers</code></a></td>
      <td>Your app's different tRPC-routers</td>
    </tr>
  </tbody>
</table>

---

Created by [@alexdotjs](https://twitter.com/alexdotjs).

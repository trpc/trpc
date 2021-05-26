# Prisma + tRPC

- Try in CodeSandbox: [https://githubbox.com/trpc/trpc/tree/main/examples/next-prisma-starter](https://codesandbox.io/s/github/trpc/trpc/tree/main/examples/next-prisma-starter?file=/src/pages/index.tsx)


## Features

- ⚙️ VSCode extension recommendations
- 🧙‍♂️ E2E type safety with [tRPC](https://trpc.io)
- ✅ E2E testing with Playwright
- 🎨 ESLint
- ⚡ Database with Prisma

## Setup

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
cd trpc-prisma-starter
yarn
yarn dev
```

## Files of note

| Path                        | Description                       |
| --------------------------- | --------------------------------- |
| `./prisma/schema.prisma`    | Prisma schema                     |
| `./src/api/trpc/[trpc].tsx` | tRPC response handler             |
| `./src/routers/*.tsx`       | Your app's different tRPC-routers |


## Commands

```bash
yarn dx # runs prisma studio + next
yarn build # runs `prisma generate` + `prisma migrate` + `next build`
yarn test-dev # runs e2e tests on dev
yarn test-start # runs e2e tests on `next start` - build required before
```

## ℹ️ How to switch from SQLite to Postgres

How to switch to postgres

- Remove migrations `rm -rf ./prisma/migrations`
- Update `./prisma/schema.prisma`

---

Created by [@alexdotjs](https://twitter.com/alexdotjs).

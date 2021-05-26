# Prisma + tRPC

- Try in CodeSandbox: [https://githubbox.com/trpc/trpc/tree/main/examples/next-prisma-starter](https://codesandbox.io/s/github/trpc/trpc/tree/main/examples/next-prisma-starter?file=/pages/index.tsx)

## Setup

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
cd trpc-prisma-starter
yarn
yarn dev
```

## Commands

```bash
yarn dx # runs prisma studio + next
yarn build # runs `prisma generate` + `prisma migrate` + `next build`
```

## ℹ️ How to switch from SQLite to Postgres

How to switch to postgres

- Remove migrations `rm -rf ./prisma/migrations`
- Update `./prisma/schema.prisma`

- This project contains both Postgres & SQLite in able for us to easily showcase it in both CodeSandbox and deploy on Vercel.

---

Created by [@alexdotjs](https://twitter.com/alexdotjs).

## TodoMVC

- [TodoMVC](https://todomvc.com/) implemented with tRPC + [Prisma](https://prisma.io)
- Live at [todomvc.trpc.io](https://todomvc.trpc.io)
- Try in CodeSandbox: [https://githubbox.com/trpc/trpc/tree/main/examples/next-prisma-todomvc](https://codesandbox.io/s/github/trpc/trpc/tree/main/examples/next-prisma-todomvc?file=/pages/%5Bfilter%5D.tsx)

### Setup

```bash
yarn create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-todomvc trpc-todo
cd trpc-todo
yarn
yarn dev
```

### Useful commands

```bash
yarn dx # runs prisma studio + next
```

### ℹ️ This example contains _both_ Postgres _and_ SQLite

- This project contains both Postgres & SQLite in able for us to easily showcase it in both CodeSandbox and deploy on Vercel.
- This is not a recommended approach. If you want to fork this project as a starter, do the following:
  - `rm -rf ./prisma/_sqlite`
  - Update `package.json`:
    - remove all references of `sqlite`
    - replace commands using `*:sqlite` with `*:postgres`

---

Created by [@alexdotjs](https://twitter.com/alexdotjs).

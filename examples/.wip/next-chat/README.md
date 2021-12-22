## Chat

:warning: tRPC subscriptions are beta.

<!-- Live at [chat.trpc.io](https://chat.trpc.io) -->

### Setup

```bash
yarn create next-app --example https://github.com/trpc/trpc --example-path examples/next-chat trpc-chat
cd trpc-chat
yarn
yarn dev
```

You may also need to:

- Install Postgres and create an instance
- `CREATE DATABASE chat`
- Tweak `.env` with your local `DATABASE_URL` (if necessary)

### Useful commands

```bash
yarn dx # runs prisma studio + next
```

---

Created by [@alexdotjs](https://twitter.com/alexdotjs).

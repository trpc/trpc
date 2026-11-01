---
id: example-apps
title: Example Apps
sidebar_label: Example Apps
slug: /example-apps
description: Example apps built with tRPC
section: "tRPC"
order: 5
---

:::note
Although it is possible to install the examples using any of listed package managers, the examples are all configured
to use [pnpm](https://pnpm.io) as the script runner, so make sure to [install](https://pnpm.io/installation) it first.

If you wish to use `npm` or `yarn`, make sure to update the relevant `package.json` `scripts` entries in generated example.
:::

---

### Next.js starter with Prisma, E2E testing, and ESLint (Recommended)

<div class="code-tabs" data-tabs="package-manager">
<div data-tab="npm" data-active>

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

</div>
<div data-tab="yarn">

```sh
yarn create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

</div>
<div data-tab="pnpm">

```sh
pnpx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

</div>
<div data-tab="bun">

```sh
bunx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

</div>
</div>

- Example deploy: [nextjs.trpc.io](https://nextjs.trpc.io)
- [Source code](https://github.com/trpc/examples-next-prisma-starter)

---

### create-t3-turbo - T3 Stack with Expo and Turborepo

<div class="code-tabs" data-tabs="tabs-git">
<div data-tab="git">

```bash
git clone git@github.com:t3-oss/create-t3-turbo.git
```

</div>
</div>

- [Source code](https://github.com/t3-oss/create-t3-turbo)

---

### Next.js starter with Prisma, E2E testing, ESLint, next-auth, WebSockets, and subscriptions

<div class="code-tabs" data-tabs="package-manager">
<div data-tab="npm" data-active>

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-websockets-starter trpc-prisma-websockets-starter
```

</div>
<div data-tab="yarn">

```sh
yarn create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-websockets-starter trpc-prisma-websockets-starter
```

</div>
<div data-tab="pnpm">

```sh
pnpx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-websockets-starter trpc-prisma-websockets-starter
```

</div>
<div data-tab="bun">

```sh
bunx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-websockets-starter trpc-prisma-websockets-starter
```

</div>
</div>

- Example deploy: [websockets.trpc.io](https://websockets.trpc.io)
- [CodeSandbox](https://codesandbox.io/s/github/trpc/trpc/tree/v10.45.4/examples/next-prisma-websockets-starter?file=/src/pages/index.tsx)
- [Source code](https://github.com/trpc/examples-next-prisma-websockets-starter)

---

### Next.js Todo MVC example with SSG and Prisma

<div class="code-tabs" data-tabs="package-manager">
<div data-tab="npm" data-active>

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-todomvc trpc-todo
```

</div>
<div data-tab="yarn">

```sh
yarn create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-todomvc trpc-todo
```

</div>
<div data-tab="pnpm">

```sh
pnpx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-todomvc trpc-todo
```

</div>
<div data-tab="bun">

```sh
bunx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-todomvc trpc-todo
```

</div>
</div>

- Example deploy: [todomvc.trpc.io](https://todomvc.trpc.io)
- [CodeSandbox](https://codesandbox.io/s/github/trpc/trpc/tree/v10.45.4/examples/next-prisma-todomvc?file=/pages/%5Bfilter%5D.tsx)
- [Source code](https://github.com/trpc/examples-next-prisma-todomvc)

---

### Minimal (Hello world) server and client in Node.js

- [Source code](https://github.com/trpc/trpc/tree/v10.45.4/examples/minimal)

---

### Vanilla standalone server and Node.js procedure calls

- [CodeSandbox](https://codesandbox.io/s/github/trpc/trpc/tree/v10.45.4/examples/standalone-server)
- [Source code](https://github.com/trpc/trpc/tree/v10.45.4/examples/standalone-server)

---

### Express server and Node.js procedure calls

- [CodeSandbox](https://codesandbox.io/s/github/trpc/trpc/tree/v10.45.4/examples/express-server)
- [Source code](https://github.com/trpc/trpc/tree/v10.45.4/examples/express-server)

---

### Fastify server with WebSockets and Node.js procedure calls

- [CodeSandbox](https://codesandbox.io/s/github/trpc/trpc/tree/v10.45.4/examples/fastify-server)
- [Source code](https://github.com/trpc/trpc/tree/v10.45.4/examples/fastify-server)

---

### SvelteKit with Prisma

- [CodeSandbox](https://codesandbox.io/s/github/icflorescu/trpc-sveltekit-example)
- [Source code](https://github.com/icflorescu/trpc-sveltekit-example)

---

### Sign-In With Ethereum Authentication With Express

<div class="code-tabs" data-tabs="tabs-git">
<div data-tab="git">

```bash
git clone git@github.com:codingwithmanny/trpc-siwe-monorepo.git
```

</div>
</div>

- [Source code](https://github.com/codingwithmanny/trpc-siwe-monorepo)

---

### Separate backend & frontend repositories

- [Source code - BE repo](https://github.com/mkosir/trpc-api-boilerplate)
- [Source code - FE repo](https://github.com/mkosir/trpc-fe-boilerplate)

---
id: example-apps
title: Example Apps
sidebar_label: Example Apps
slug: /example-apps
---


You can clone this project and play with local examples.

```bash
git clone git@github.com:trpc/trpc.git
cd trpc
yarn

yarn example:hello
```

Here's some example apps:

| URL                                                | Command                   | Path                                                                                                    | Description                                                                                            |
| -------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [todomvc.trpc.io](https://todomvc.trpc.io)         | `yarn example:todomvc`    | [`./examples/next-prisma-todomvc`](https://github.com/trpc/trpc/tree/main/examples/next-prisma-todomvc) | TodoMVC-example with SSG & Prisma. [Playwright](https://playwright.dev) for E2E-testing                |
| [chat.trpc.io](https://chat.trpc.io)               | `yarn example:chat`       | [`./examples/next-ssg-chat`](https://github.com/trpc/trpc/tree/main/examples/next-ssg-chat)             | Next.js real-time chat example with SSG & Prisma. [Playwright](https://playwright.dev) for E2E-testing |
| [hello-world.trpc.io](https://hello-world.trpc.io) | `yarn example:hello`      | [`./examples/next-hello-world`](https://github.com/trpc/trpc/tree/main/examples/next-hello-world)       | Minimal Next.js example. [Playwright](https://playwright.dev) for E2E-testing                          |
| _n/a_                                              | `yarn example:standalone` | [`./examples/standalone-server`](https://github.com/trpc/trpc/tree/main/examples/standalone-server)     | Standalone tRPC server + node client                                                                   |
| _n/a_                                              | `yarn example:playground` | [`./examples/playground`](https://github.com/trpc/trpc/tree/main/examples/playground)                   | Express server + node client                                                                           |

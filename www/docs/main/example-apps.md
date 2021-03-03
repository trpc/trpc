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

Here's all the example apps:

| Command                   | Live URL                                           | Example path                                                                                        | Description                                                                                            |
| ------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `yarn example:chat`       | [chat.trpc.io](https://chat.trpc.io)               | [`./examples/next-ssg-chat`](https://github.com/trpc/trpc/tree/main/examples/next-ssg-chat)         | Next.js real-time chat example with SSG & Prisma. [Playwright](https://playwright.dev) for E2E-testing |
| `yarn example:hello`      | [hello-world.trpc.io](https://hello-world.trpc.io) | [`./examples/next-hello-world`](https://github.com/trpc/trpc/tree/main/examples/next-hello-world)   | Minimal Next.js example. [Playwright](https://playwright.dev) for E2E-testing                          |
| `yarn example:standalone` | _n/a_                                              | [`./examples/standalone-server`](https://github.com/trpc/trpc/tree/main/examples/standalone-server) | Standalone tRPC server + node client                                                                   |
| `yarn example:playground` | _n/a_                                              | [`./examples/playground`](https://github.com/trpc/trpc/tree/main/examples/playground)               | Express server + node client                                                                           |
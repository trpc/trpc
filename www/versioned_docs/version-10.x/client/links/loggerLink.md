---
id: loggerLink
title: Logger Link
sidebar_label: Logger Link
slug: /client/links/loggerLink
---

`loggerLink` is a link that lets you implement a logger for your tRPC client. It allows you to see more clearly what operations are queries, mutations, or subscriptions, their requests, and responses. The link, by default, prints a prettified log to the browser's console. However, you can customize the logging behavior and the way it prints to the console with your own implementations.

## Usage

You can import and add the `loggerLink` to the `links` array as such:

```ts title="client/index.ts"
import { createTRPCProxyClient, httpBatchLink, loggerLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    /**
     * The function passed to enabled is an example in case you want to the link to
     * log to your console in development and only log errors in production
     */
    loggerLink({
      enabled: (opts) =>
        (process.env.NODE_ENV === 'development' &&
          typeof window !== 'undefined') ||
        (opts.direction === 'down' && opts.result instanceof Error),
    }),
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```

## `loggerLink` Options

The `loggerLink` function takes an options object that has the `LoggerLinkOptions` shape:

```ts
type LoggerLinkOptions<TRouter extends AnyRouter> = {
  logger?: LogFn<TRouter>;
  /**
   * It is a function that returns a condition that determines whether to enable the logger.
   * It is true by default.
   */
  enabled?: EnabledFn<TRouter>;
  /**
   * Used in the built-in defaultLogger
   */
  console?: ConsoleEsque;
  /**
   * Color mode used in the default logger.
   * @default typeof window === 'undefined' ? 'ansi' : 'css'
   */
  colorMode?: 'ansi' | 'css';
};
```

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/main/packages/client/src/links/loggerLink.ts)

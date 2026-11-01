---
title: "Concepts"
description: ""
section: "tRPC"
order: 2
---

## What is RPC? What mindset should I adopt?

### It's just functions

RPC is short for "Remote Procedure Call". It is a way of calling functions on one computer (the server) from another computer (the client). With traditional HTTP/REST APIs, you call a URL and get a response. With RPC, you call a function and get a response.

```ts
// HTTP/REST
const res = await fetch('/api/users/1');
const user = await res.json();

// RPC
const user = await api.users.getById({ id: 1 });
```

tRPC (TypeScript Remote Procedure Call) is one implementation of RPC, designed for TypeScript monorepos. It has its own flavor, but is RPC at its heart.

### Don't think about HTTP/REST implementation details

If you inspect the network traffic of a tRPC app, you'll see that it's fairly standard HTTP requests and responses, but you don't need to think about the implementation details while writing your application code. You call functions, and tRPC takes care of everything else. You should ignore details like HTTP Verbs, since they carry meaning in REST APIs but, in RPC, form part of your function names instead, for instance: `getUser(id)` instead of `GET /users/:id`.

## Vocabulary

Below are some terms that are used frequently in the tRPC ecosystem. We'll be using these throughout the documentation, so it's good to get familiar with them. Most of these concepts also have their own pages in the documentation.

<table width="100%">
      <thead>
        <tr>
          <th>Term</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <a href="/docs/server/procedures">
              <strong class="text-green-600 dark:text-green-400">
                Procedure&nbsp;↗
              </strong>
            </a>
          </td>
          <td>
            API endpoint - can be a 
            <strong class="text-teal-700 dark:text-teal-400">query</strong>, 
            <strong class="text-teal-700 dark:text-teal-400">
              mutation
            </strong>
            , or 
            <strong class="text-teal-700 dark:text-teal-400">
              subscription
            </strong>
            .
          </td>
        </tr>
        <tr>
          <td>
            <strong class="text-teal-700 dark:text-teal-400">Query</strong>
          </td>
          <td>
            A 
            <strong class="text-green-600 dark:text-green-400">
              procedure
            </strong> 
            that gets some data.
          </td>
        </tr>
        <tr>
          <td>
            <strong class="text-teal-700 dark:text-teal-400">
              Mutation
            </strong>
          </td>
          <td>
            A 
            <strong class="text-green-600 dark:text-green-400">
              procedure
            </strong> 
            that creates, updates, or deletes some data.
          </td>
        </tr>
        <tr>
          <td>
            <a href="/docs/server/subscriptions">
              <strong class="text-teal-700 dark:text-teal-400">
                Subscription&nbsp;↗
              </strong>
            </a>
          </td>
          <td>
            A 
            <strong class="text-green-600 dark:text-green-400">
              procedure
            </strong> 
            that creates a persistent connection and listens to changes.
          </td>
        </tr>
        <tr>
          <td>
            <a href="/docs/server/routers">
              <strong class="text-blue-700 dark:text-blue-400">
                Router&nbsp;↗
              </strong>
            </a>
          </td>
          <td>
            A collection of 
            <strong class="text-green-600 dark:text-green-400">
              procedures
            </strong> 
            (and/or other routers) under a shared namespace.
          </td>
        </tr>
        <tr>
          <td>
            <a href="/docs/server/context">
              <strong class="text-violet-700 dark:text-violet-400">
                Context&nbsp;↗
              </strong>
            </a>
          </td>
          <td>
            Stuff that every 
            <strong class="text-green-600 dark:text-green-400">
              procedure
            </strong> 
            can access. Commonly used for things like session state and database
            connections.
          </td>
        </tr>
        <tr>
          <td>
            <a href="/docs/server/middlewares">
              <strong class="text-blue-600 dark:text-blue-400">
                Middleware&nbsp;↗
              </strong>
            </a>
          </td>
          <td>
            A function that can run code before and after a 
            <strong class="text-green-600 dark:text-green-400">
              procedure
            </strong>
            . Can modify 
            <strong class="text-violet-700 dark:text-violet-400">
              context
            </strong>
            .
          </td>
        </tr>
        <tr>
          <td>
            <a href="/docs/server/validators">
              <strong class="text-blue-600 dark:text-blue-400">
                Validation&nbsp;↗
              </strong>
            </a>
          </td>
          <td>&quot;Does this input data contain the right stuff?&quot;</td>
        </tr>
      </tbody>
    </table>

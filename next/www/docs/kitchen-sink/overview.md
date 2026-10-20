---
title: Kitchen sink
label: Overview
description: Small apps to edit and run on the page, each beside how it works.
section: Kitchen sink
order: 0
experiment: kitchen-sink
---

Each page here runs a small app built with tRPC beside the text that explains it. The app's code is in an editor: change it and the app restarts with your change, in a moment, without leaving the page.

## How a demo runs

Everything runs in your browser, in the page:

- The app's server is a real tRPC router served by `createFetchHandler`. Its database is in memory, so each change to the code starts it over.
- The app's client calls it with `httpLink`, whose `fetch` goes to a pretend network instead of the internet. The requests panel shows each request and response as they cross it, a subscription's events as they arrive.
- The toolbar slows the network down, or drops the next request, to see what the app does while it waits and when a call fails. Once the app subscribes, it can also drop the open connections, to see the subscriptions reconnect.
- The app's pages use TanStack Router, in a browser of their own with an address bar and back and forward buttons.

Code is compiled as you type, without type checking: the types are in the page's code blocks, which compile at build time. An import the demo doesn't have, a syntax error or an error while the code runs shows under the editor, and the last version that worked keeps running.

Each demo is an app in `www/samples/` that typechecks with the rest of the repo, so its code is the code the page shows.

## Demos

- [Forms](./forms.md): a react-hook-form form whose fields are checked by the same zod schema in the browser and on the server, with the server's errors put on the fields they're about.
- [Optimistic updates](./optimistic.md): a todo list that changes before the server answers, and rolls back through the typed query key when the call fails.

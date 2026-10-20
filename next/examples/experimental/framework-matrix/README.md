# Framework matrix (experimental)

One server and one poll, with a page per tier-B TanStack Query adapter: Vue (`@trpc12/experimental-tanstack-vue-query`), Solid (`@trpc12/experimental-tanstack-solid-query`) and Svelte (`@trpc12/experimental-tanstack-svelte-query`). Each page reads `votes.list`, votes with `votes.cast` and invalidates with `pathFilter()`, and shows the `clock` subscription. See the [Vue](https://v12.trpc.io/v12/docs/integrations/tanstack-query/vue), [Solid](https://v12.trpc.io/v12/docs/integrations/tanstack-query/solid) and [Svelte](https://v12.trpc.io/v12/docs/integrations/tanstack-query/svelte) pages.

The three adapters are experimental packages (`@trpc12/experimental-tanstack-*-query`): their docs are still hidden for review, and they might change or go away in any release. The server and `httpLink` are stable.

The files follow the [examples layout](../../README.md):

- `server.ts`: the router, `listen()`, and `trpcMiddleware()`, which Vite's dev and preview servers mount at `/trpc`.
- `client.ts`: the client every page wraps (`src/trpc.ts`), called from Node: it votes for each framework and reads two ticks.
- `src/vue/`, `src/solid/`, `src/svelte/`: one page each (`vue.html`, `solid.html`, `svelte.html`). Each `App.test` renders its page in happy-dom against `listen()` and runs `checkPage()`: read, vote, see the count go up, tick. `pnpm test` from `next/` runs them.

`@shared/ui`'s components are React, so the pages share its theme (`src/styles.css`) and its shadcn classes (`src/ui.ts`) instead. Vue's page is a render function in a `.ts` file and Svelte's are `.svelte` files: there is no `vue-tsc` or `svelte-check` for TypeScript 7, so tsc checks the Vue page and the code around the Svelte ones, and the Svelte plugin compiles their markup.

`pnpm start` runs the server and client; `pnpm dev` serves the pages at <http://localhost:5173>. `pnpm smoke` builds the pages first.

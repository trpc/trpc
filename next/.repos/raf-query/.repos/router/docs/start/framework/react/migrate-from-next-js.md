---
id: migrate-from-next-js
title: Migrate from Next.js
description: Move a Next.js App Router application to TanStack Start while preserving routes, metadata, authentication, mutations, and deployment behavior.
---

This guide migrates a Next.js App Router application to TanStack Start. The [runnable before-and-after example](https://github.com/TanStack/router/tree/main/examples/react/start-next-migration) implements the same article site in both frameworks, including public articles, URL search, sign-in, a private saved-article page, and a mutation.

Start does not interpret Next.js route conventions or configuration. Keep your application behavior, then translate each framework boundary. If your application relies heavily on React Server Components, read the [comparison](./start-vs-nextjs) and [RSC guide](./guide/server-components) first. Start's RSC support is experimental and opt-in; the example uses ordinary route components and server functions.

## Run the reference application

Use Node 24 or newer and pnpm 11:

```sh
git clone --depth 1 https://github.com/TanStack/router.git
cd router
pnpm install
pnpm nx run @tanstack/react-start:build
cd examples/react/start-next-migration
```

Follow the example's [README](https://github.com/TanStack/router/blob/main/examples/react/start-next-migration/README.md) to set `SESSION_PASSWORD` and `DEMO_PASSWORD`. Run `pnpm dev:next` at `http://localhost:3100` and `pnpm dev` in another terminal at `http://localhost:3101`.

The example's single account is `reader@example.com`. It stores one saved-article flag in a session cookie so you can exercise a protected mutation without connecting a database. It is not a production authentication implementation. The two apps use different session formats and cookie names, so sign in separately to each.

With those ports free, run:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build:next
pnpm build
MIGRATION_PRODUCTION=1 pnpm test:e2e
```

The same browser tests run against both apps. They check public URLs, server-rendered metadata, query filtering, redirects, missing pages, sitemap entries, sign-in errors, session persistence, private response caching, mutations, and server rejection after sign-out.

## Inventory the application before changing it

Record your current paths and observable behavior. Include dynamic paths, query parameters, redirects, trailing slashes, locale prefixes, response status, title, description, canonical, robots directives, and sitemap membership. Keep representative HTML responses and run your existing application tests against the replacement.

Inventory Next.js-specific code separately: `next/*` imports, `'use server'`, server-only modules, metadata exports, `generateStaticParams`, `revalidatePath`, `revalidateTag`, cache directives, route configuration, Proxy or middleware, and image/font configuration. A route that renders successfully can still have lost authentication, cache invalidation, or an important search URL.

| Request                    | Required behavior                                                    |
| -------------------------- | -------------------------------------------------------------------- |
| `/`                        | Article list, title, description, self-referencing canonical         |
| `/?q=metadata`             | Filtered article list; canonical remains `/`                         |
| `/posts/keeping-your-urls` | Same article, title, description, canonical, and Open Graph title    |
| `/posts/missing`           | HTTP 404                                                             |
| `/old-notes`               | HTTP 308 to `/posts/keeping-your-urls`                               |
| `/saved`                   | Signed-out users reach sign-in; private HTML is not shared-cacheable |
| `/sitemap.xml`             | Public pages only                                                    |

For your application, decide which query variants deserve indexing. Do not copy the example's canonical policy onto meaningful product filters or paginated results without checking their content.

## Set up Start alongside the existing app

Create a Start application using [Getting Started](./getting-started) and [Build from Scratch](./build-from-scratch). Keep the Next.js app runnable until the migrated routes pass their checks. You do not need to remove Next.js, its configuration, or its CSS tooling before you can test Start.

```text
next-app/                 # Before: Next.js App Router
  app/
    layout.tsx
    page.tsx
    posts/[slug]/page.tsx
    actions.ts
src/                      # After: TanStack Start
  router.tsx
  routes/
    __root.tsx
    index.tsx
    posts.$slug.tsx
  server/account.ts
vite.config.ts
```

The Start Vite plugin generates `src/routeTree.gen.ts`. `src/router.tsx` returns a new router using that tree. The root route renders `HeadContent` in the document head and `Scripts` in the body. Merge your existing CSS, document attributes, and providers into that root.

The reference uses Vite and Nitro's Node output. If you use another host or build tool, follow its [hosting instructions](./guide/hosting) and test its actual build output. A Next.js deployment adapter does not become a Start adapter by changing dependencies.

## Preserve paths while changing route files

| Next.js App Router             | Default Start route directory                  |
| ------------------------------ | ---------------------------------------------- |
| `app/layout.tsx`               | `src/routes/__root.tsx`                        |
| `app/page.tsx`                 | `src/routes/index.tsx`                         |
| `app/posts/page.tsx`           | `src/routes/posts.index.tsx`                   |
| `app/posts/[slug]/page.tsx`    | `src/routes/posts.$slug.tsx`                   |
| `app/docs/[...parts]/page.tsx` | `src/routes/docs.$.tsx`                        |
| `app/api/hello/route.ts`       | `src/routes/api.hello.ts` with server handlers |

`src/routes` is a source directory, not a URL prefix. A route for `/posts/example` uses `createFileRoute('/posts/$slug')`, not `/app/posts/$slug`.

Nested layouts, pathless layouts, route groups, optional parameters, catch-alls, parallel routes, and intercepting routes need individual mapping. Read [routing concepts](/router/latest/docs/routing/routing-concepts) instead of mechanically renaming every file. The reference does not reproduce Next.js parallel or intercepting route behavior.

Replace `next/link` with Router's `Link`. Dynamic paths use typed `params`:

```tsx
<Link to="/posts/$slug" params={{ slug: article.slug }}>
  {article.title}
</Link>
```

Check direct requests, client navigation, back/forward, and reload for each representative path. Update your redirects and sitemap from the same route inventory.

## Validate URL search state

Next.js passes `searchParams` to an App Router page. Start validates URL state in the route:

```tsx
export const Route = createFileRoute('/')({
  validateSearch: (search) => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  component: Articles,
})

function Articles() {
  const { q } = Route.useSearch()
  return <p>Searching for: {q}</p>
}
```

If a loader depends on search state, declare the relevant values in `loaderDeps`. That makes those values part of the loader's dependency and cache behavior. Validate page numbers, sorting, and filters at runtime; TypeScript types alone do not validate an incoming URL. See [search parameters](/router/latest/docs/guide/search-params) and [data loading](/router/latest/docs/guide/data-loading).

## Move server reads into server functions

An ordinary Start route loader can execute on the server for the initial request and in the browser during navigation. Do not move a database query, credential, or privileged SDK directly from an async Next.js Server Component into an ordinary loader.

Put the privileged read inside a [server function](./guide/server-functions), then call it from the loader. The reference's `/saved` route calls `getAccount`, checks the result, and redirects signed-out readers. Its public article loader only reads bundled public content.

Return the data the browser is allowed to see, not an entire database record. Keep connection setup and secrets on the server. For a database-backed application, preserve your schema and access layer where possible, and change the framework-facing handler around them.

## Translate mutations and their invalidation

The reference's Next.js form calls a Server Action. That Action authorizes the session, changes the saved flag, and calls `revalidatePath('/saved')`. The Start version calls a POST server function through `useServerFn`, then awaits `router.invalidate()` to reload the active route data.

These invalidation APIs operate on different caches. `router.invalidate()` does not purge a CDN, clear a database cache, or revalidate all statically generated pages. If the app uses TanStack Query, invalidate the relevant query keys as well. Map each existing `revalidatePath`, tag, and cache directive to the layer that owns the replacement data.

The Start function checks authorization even though the route already checks it. A caller can invoke the mutation without visiting the page. Validate every untrusted input inside the server boundary and preserve resource-level permissions.

`useServerFn` returns a callable function. The reference keeps pending and error state in the component and reloads route data after a successful mutation. It also tests replaying the mutation after sign-out.

Next.js Action forms and these Start event-handler forms have different no-JavaScript behavior. The latter require JavaScript and keep their fields disabled until hydration. If progressive enhancement is a requirement, use a FormData-compatible [server function URL](./guide/server-functions#progressive-enhancement) or an ordinary form POST to a [server route](./guide/server-routes). Include validation, CSRF protection, and an appropriate response or redirect. Do not treat `createServerFn` as a drop-in replacement for the React form Action protocol.

## Preserve authentication and session boundaries

Follow the [authentication guide](./guide/authentication) for the route-context pattern. Check sessions on the server for private reads and mutations. A hidden button or a client route guard is not authorization.

The example deliberately changes from `iron-session` with Next.js `cookies()` to Start's `useSession`. Existing cookies are not assumed to be compatible. A real migration can keep its existing auth provider or session service and adapt the request boundary instead. If sessions must survive cutover or rollback, verify cookie names, domains, paths, signing/encryption formats, expiration, key rotation, and logout in both deployments.

Private pages need a cache policy that prevents another user receiving personalized HTML. The Start reference returns `Cache-Control: private, no-store` for `/saved`. Check the final response through your deployment and CDN, including after sign-in and sign-out. Do not prerender or publicly cache pages that include private account data.

## Preserve metadata and search responses

Next.js `metadata` and `generateMetadata` become a Start route's `head` configuration. The article route derives title, description, Open Graph title, and canonical from its loader result. Keep `HeadContent` in the root document so those values appear in the response.

Compare HTML responses before JavaScript runs, then check the head after client navigation. Keep the public canonical origin independent of a local or preview host. Preserve locale alternates and social images where your app has them. See [SEO](./guide/seo) and [head management](/router/latest/docs/guide/document-head-management).

Next.js metadata file conventions also need replacements. The reference turns `app/sitemap.ts` into a Start server route at `/sitemap.xml`. Migrate `robots.txt`, icons, manifests, and generated social images explicitly. Return real 404s for missing content and maintain intentional permanent redirects. Avoid redirecting every missing URL to the homepage.

## Replace image and font services deliberately

Start does not automatically provide the Next.js image optimizer. Preserve image dimensions, responsive sources, loading behavior, alt text, and cache policy. Plain `<img>` works for preprocessed assets; an image component such as Unpic needs a compatible image service or prepared sources to provide transformations. It does not create Next.js's image processing backend by itself. Next.js also supports its optimizer when [self-hosted](https://nextjs.org/docs/app/guides/self-hosting).

Replace `next/font` with self-hosted font files, a package such as Fontsource, or another chosen font delivery method. CSS `@font-face` does not require Tailwind. Preserve font weights and subsets, set an appropriate `font-display`, and check layout shift and network requests. Copy public assets and update imports only after confirming their resulting URLs.

The reference uses text and the browser's default font. It does not claim to verify your image transformations or font loading.

## Rebuild caching and deployment behavior

List each cache separately: browser data, Router loaders, Query, server data, generated pages, and CDN responses. Define what populates it, its key, expiration, and the operation that invalidates it. Test after changing data, signing out, and deploying a new version.

Next.js cache directives, revalidation, and `generateStaticParams` do not carry across automatically. Use [static prerendering](./guide/static-prerendering) only for suitable public routes, and review [ISR](./guide/isr) with your hosting provider's actual behavior. A cache header alone is not proof of equivalent regeneration or invalidation.

Move server-only environment variables into the server runtime. Audit any public variable prefix changes rather than exposing the old environment wholesale. Verify API/webhook URLs, forwarded host/protocol, cookies behind a proxy, asset paths, streaming, and runtime limits in the deployment you will use.

## Cut over with a rollback path

1. Build both applications and run the contract checks against a staging deployment of Start. Include real representative data, authenticated sessions, and the CDN in that check.
2. Keep the current database schema compatible with both versions during the transition. Separate destructive schema changes from the framework cutover.
3. Preserve the public origin and paths where possible. If paths must change, deploy tested redirects and update internal links, canonicals, and sitemaps together.
4. Record the previous deployment and routing configuration. Know how to route traffic back, and what happens to sessions and writes if you do.
5. Monitor error rates, login and mutation failures, response status, indexing signals, and application conversion events after cutover. Compare against the baseline rather than assuming a framework change will improve search traffic.

Remove Next.js and its unused configuration after the migrated behavior and rollback plan are verified. Retain historical redirects and any assets still referenced by public content.

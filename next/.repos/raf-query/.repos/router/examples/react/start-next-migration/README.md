# Next.js to TanStack Start

Two versions of the same small article site. `next-app/` uses the Next.js App Router; `src/` uses TanStack Start. They keep the public paths, article content, titles, descriptions, canonical URLs, search parameter, and permanent redirect.

The private page saves one article in an encrypted session cookie. This keeps the example runnable without a database or an auth-provider account. It is a migration reference, not an authentication starter: the single demo account has no registration, password recovery, rate limiting, or account database. Do not deploy it as a public sign-in service.

## Run

Use Node 24 or newer and pnpm 11. From the repository root:

```sh
pnpm install
pnpm nx run @tanstack/react-start:build
cd examples/react/start-next-migration
```

In each terminal that starts a server, set these variables. Generate your own secret and choose a demo password:

```sh
export SESSION_PASSWORD="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")"
export DEMO_PASSWORD='choose-a-local-demo-password'
```

Run `pnpm dev:next` for Next.js at <http://localhost:3100> and `pnpm dev` in another terminal for Start at <http://localhost:3101>. Sign in as `reader@example.com` using the password you set.

The apps use different cookie names and session formats. Signing in to one does not sign you in to the other. Changing `SESSION_PASSWORD` invalidates that app's session. Saved state is tied to that session, not durable account storage.

## Check the migration

From this directory, with those ports free:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build:next
pnpm build
MIGRATION_PRODUCTION=1 pnpm test:e2e
```

Playwright starts both dev servers with test-only credentials. The same tests run against each app and check server-rendered metadata, public paths, search, a 308 redirect, a missing article, sitemap membership, login errors, session persistence, private cache headers, saved-state mutation, and rejection of a captured mutation after sign-out.

For a production-mode smoke check, keep the environment variables set and run `pnpm start:next` or `PORT=3101 pnpm start` after building. The cookie settings assume HTTPS in production. Deployment infrastructure, a shared database, real account security, and CDN behavior are outside this local fixture.

## Compare

| Next.js                                       | TanStack Start                                          |
| --------------------------------------------- | ------------------------------------------------------- |
| `next-app/app/page.tsx`, async `searchParams` | `src/routes/index.tsx`, `validateSearch`                |
| `next-app/app/posts/[slug]/page.tsx`          | `src/routes/posts.$slug.tsx`                            |
| `generateMetadata`                            | Route `head` using `loaderData`                         |
| `next-app/app/actions.ts`                     | `src/server/account.ts`                                 |
| Server Action form and `revalidatePath`       | `useServerFn`, local pending state, `router.invalidate` |
| `cookies()` with `iron-session`               | `useSession`                                            |
| `next-app/next.config.ts` redirect            | `src/routes/old-notes.tsx` redirect                     |
| `next-app/app/sitemap.ts`                     | `src/routes/sitemap[.]xml.ts` server route              |

The Next.js forms use Server Actions. The Start forms in this example handle client submit events and require JavaScript. For a no-JavaScript form, use a FormData-compatible server function URL or an explicit server-route POST implementation, including validation and CSRF protection. Replacing an Action with `createServerFn` does not preserve progressive enhancement automatically.

The canonical origin is intentionally `https://field-notes.example` in both content modules, so local ports do not change the comparison. Replace it with your real public origin before adapting the example.

The Start app enables `createCsrfMiddleware` for server-function requests in `src/start.ts`. The paired browser tests replay a mutation with an authenticated cookie jar and cross-site request metadata, then verify that it was rejected and the saved value did not change. Endpoint authorization is still checked independently after sign-out.

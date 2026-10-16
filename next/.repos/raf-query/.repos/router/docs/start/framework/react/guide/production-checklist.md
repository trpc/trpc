---
id: production-checklist
title: Production Checklist
description: Check a TanStack Start production build for secret exposure, authorization, cache isolation, HTTP status codes, SEO, assets, logging, and deployment failures.
---

Run these checks against the production build and again through your public hostname. A passing development server does not verify your deployment adapter, runtime environment, or CDN.

## Secrets and server boundaries

- [ ] **Check required environment variables at runtime.** Start the production server with the same variable names and runtime bindings as your host. Missing configuration should fail clearly before it serves dependent requests. Look for undefined credentials, connections to a development database, or values that only existed during the build. See [Environment Variables](./environment-variables).
- [ ] **Keep secrets out of browser output.** Build with a harmless, unique test secret and search the emitted client files, source maps you publish, and response bodies for that value. Do not use a real secret for this check. A match means a value crossed the server boundary, even if its variable name lacks `VITE_`. Check server-function return values as well as imports. See [Environment Variables](./environment-variables#security-best-practices) and [Import Protection](./import-protection).

## Authorization and mutations

- [ ] **Test endpoints directly.** Record a private read and write, then repeat them while signed out and as a different account. Both must reject unauthorized access without changing data. A redirect in `beforeLoad` does not protect a separately callable endpoint. See [Authentication Server Primitives](./authentication-server-primitives#protect-data-first).
- [ ] **Exercise session expiry and sign-out.** Reload a private page, expire its session, sign out, and revisit it. Confirm the cookie's HTTPS flags and that old account data disappears from browser caches. Look for sessions that survive beyond your intended policy or another account's data appearing after switching accounts. See [Session Cookies](./authentication-server-primitives#session-cookies).
- [ ] **Reject invalid and cross-site writes.** Send malformed input and browser-like requests from an untrusted origin to each mutation entry point, including ordinary server-route forms. Use an authenticated test session for protected writes so an authentication failure cannot be mistaken for CSRF protection. Verify validation and your intended CSRF policy before any write occurs. Also test rapid or repeated submissions. A disabled button helps the interface, but the endpoint still needs its own checks. See [Authentication Server Primitives](./authentication-server-primitives) and [Server Functions](./server-functions).

## Cache isolation and rendering

- [ ] **Request the same private URL as two accounts concurrently.** Inspect each HTML response and any serialized loader or query data. Each response must contain only its own account's values. Repeat through the CDN and after a browser account switch. Shared personalized HTML or process-wide user caches are failures. See [Middleware](./middleware) and [Authentication Server Primitives](./authentication-server-primitives).
- [ ] **Check final cache headers and update behavior.** Use `Cache-Control: no-store` for personalized responses unless you have an explicit identity-partitioned cache key and lifecycle that prevents reuse across accounts. `private` alone does not prevent a browser cache from retaining one account's response after sign-out. For public cached content, perform a write and confirm it becomes visible within the freshness policy you chose. Inspect the final headers from your host, not just the values assigned in route code. Query invalidation, Router invalidation, and CDN invalidation affect different caches. See [Server Routes](./server-routes) and [Static Prerendering](./static-prerendering).
- [ ] **Compare a direct visit with client navigation.** Test initial HTML, hydration, back/forward navigation, and a reload for a parameterized route and a route with search values. Missing content, mismatched metadata, hydration warnings, or repeated immediate reads need investigation. See [Hydration Errors](./hydration-errors) and [Routing](./routing).

## HTTP responses and search visibility

- [ ] **Probe success, missing, redirect, and error responses.** A real missing public resource should return HTTP 404, a moved URL should use its intended redirect, and a failed request should not masquerade as a successful page. Check status codes before following redirects. Test a controlled failure in staging and confirm the error interface offers recovery without leaking sensitive details. See [Server Routes](./server-routes), [Error Boundaries](./error-boundaries), and [Router Not Found Errors](/router/latest/docs/guide/not-found-errors).
- [ ] **Inspect public HTML before JavaScript runs.** Verify useful content, a specific title and description, the public canonical URL, and relevant social metadata. Repeat after client navigation. Look for preview hostnames in canonicals, duplicate titles, or metadata that depends on a browser effect. See [SEO](./seo).
- [ ] **Check indexing rules and discovery files.** Fetch `robots.txt` and the sitemap from the deployed hostname. Sitemap URLs should resolve to intended public canonical pages. Remove accidental production `noindex` rules, but keep private and preview content out of search. Robots rules are not access control. See [SEO](./seo#sitemaps).

## Assets, logging, and deployment

- [ ] **Inspect the production network waterfall.** Test a representative page on a narrow viewport with slower network and CPU settings. Check large images, missing dimensions, font loading, third-party scripts, and failed asset requests. Record a baseline so later releases have something to compare against. Local lab results do not establish real-user performance. See [SEO performance guidance](./seo#performance-matters), [CDN Asset URLs](./cdn-asset-urls), and [Observability](./observability).
- [ ] **Trigger and find a controlled error.** Confirm your chosen logs or error service receive it with enough route and release context to investigate. Check that credentials, cookies, and sensitive payloads are absent. An error boundary that only changes the screen is not evidence of a working alert. See [Observability](./observability).
- [ ] **Run the deployed entry point and rehearse rollback.** Use your adapter's production output and start command, then test a direct deep link, a static asset, a server function, and a server route. Check that requests still work after a restart. Rehearse restoring a previous release and account for any database migration separately. Local success cannot prove host bindings, asset retention, or database rollback safety. See [Hosting](./hosting).

## Keep a release record

Record the tested commit, runtime, hostname, commands, and results. Turn repeatable HTTP and browser checks into CI tests; repeat host-specific checks after deployment changes.

The [Next.js migration reference](../examples/start-next-migration) provides production browser checks for public HTML and metadata, search, redirects, missing pages, session reloads, and protected mutations. Its demo credentials and cookie session are for local comparison, not a production authentication system. Use its tests as a starting point, then add your own authorization rules, external services, CDN behavior, and operational checks.

# TanStack Start — Skill Spec

TanStack Start is a full-stack React framework built on TanStack Router and Vite. It adds SSR, streaming, server functions (type-safe RPCs), middleware, server routes, and universal deployment. All code is isomorphic by default — it runs in both server and client environments unless explicitly constrained.

## Domains

| Domain                   | Description                                                   | Skills                        |
| ------------------------ | ------------------------------------------------------------- | ----------------------------- |
| Project Setup            | Scaffolding, Vite plugin, router factory, root route, entries | start-setup                   |
| Server Functions         | Type-safe RPCs with createServerFn, validation, streaming     | server-functions              |
| Middleware and Context   | Request/function middleware, context, global middleware       | middleware                    |
| Execution Model          | Isomorphic defaults, environment boundaries, env vars         | execution-model               |
| Server Routes            | API endpoints, HTTP handlers, handler middleware              | server-routes                 |
| Deployment and Rendering | Hosting, selective SSR, prerendering, SEO                     | deployment, server-components |

## Skill Inventory

| Skill               | Type      | Domain                   | What it covers                                          | Failure modes |
| ------------------- | --------- | ------------------------ | ------------------------------------------------------- | ------------- |
| start-setup         | core      | project-setup            | tanstackStart(), getRouter(), root route, entries       | 3             |
| server-functions    | core      | server-functions         | createServerFn, validation, useServerFn, streaming      | 8             |
| middleware          | core      | middleware-and-context   | createMiddleware, context, global middleware, factories | 3             |
| execution-model     | core      | execution-model          | Isomorphic defaults, environment functions, env vars    | 5             |
| server-routes       | core      | server-routes            | server property, HTTP handlers, createHandlers          | 5             |
| deployment          | core      | deployment-and-rendering | Hosting, SSR modes, prerendering, SEO                   | 3             |
| server-components   | sub-skill | deployment-and-rendering | React Server Components, cache ownership, selective SSR | 3             |
| react-start         | framework | project-setup            | React bindings, useServerFn, full setup                 | 3             |
| migrate-from-nextjs | lifecycle | project-setup            | Next.js App Router migration checklist                  | 3             |

## Failure Mode Inventory

### start-setup (3 failure modes)

| #   | Mistake                                         | Priority | Source                  |
| --- | ----------------------------------------------- | -------- | ----------------------- |
| 1   | React plugin before Start plugin in Vite config | CRITICAL | docs/build-from-scratch |
| 2   | Enabling verbatimModuleSyntax in tsconfig       | HIGH     | docs/build-from-scratch |
| 3   | Missing Scripts component in root route         | HIGH     | docs/guide/routing      |

### server-functions (8 failure modes)

| #   | Mistake                                                         | Priority | Source                      |
| --- | --------------------------------------------------------------- | -------- | --------------------------- |
| 1   | Putting server-only code in loaders instead of server functions | CRITICAL | maintainer interview        |
| 2   | Using dynamic imports for server functions                      | HIGH     | docs/guide/server-functions |
| 3   | Not using useServerFn for component calls                       | MEDIUM   | docs/guide/server-functions |
| 4   | Generating Next.js or Remix server patterns                     | CRITICAL | maintainer interview        |
| 5   | Relying on a route guard to protect a server function           | CRITICAL | protocol-v4 evaluation      |
| 6   | Self-fetching a relative API URL from an SSR loader             | CRITICAL | protocol-v4 evaluation      |
| 7   | Mutating without invalidating cached loader data                | HIGH     | protocol-v4 evaluation      |
| 8   | Treating typecheck as proof of output schema propagation        | CRITICAL | protocol-v4 evaluation      |

### middleware (3 failure modes)

| #   | Mistake                                               | Priority | Source                |
| --- | ----------------------------------------------------- | -------- | --------------------- |
| 1   | Trusting client sendContext without server validation | HIGH     | docs/guide/middleware |
| 2   | Confusing request vs server function middleware       | MEDIUM   | docs/guide/middleware |
| 3   | Wrong middleware method order                         | MEDIUM   | docs/guide/middleware |

### execution-model (5 failure modes)

| #   | Mistake                                           | Priority | Source                           |
| --- | ------------------------------------------------- | -------- | -------------------------------- |
| 1   | Assuming loaders are server-only                  | CRITICAL | docs/guide/execution-model       |
| 2   | Exposing secrets via module-level process.env     | CRITICAL | docs/guide/execution-model       |
| 3   | Using VITE\_ prefix for server secrets            | CRITICAL | docs/guide/environment-variables |
| 4   | Hydration mismatches from env-dependent rendering | HIGH     | docs/guide/execution-model       |
| 5   | Using a relative URL in an isomorphic loader      | CRITICAL | protocol-v4 evaluation           |

### server-routes (5 failure modes)

| #   | Mistake                                          | Priority | Source                   |
| --- | ------------------------------------------------ | -------- | ------------------------ |
| 1   | Duplicate path resolution for server routes      | MEDIUM   | docs/guide/server-routes |
| 2   | Forgetting to await request body methods         | MEDIUM   | docs/guide/server-routes |
| 3   | Relying on page auth to protect a server route   | CRITICAL | protocol-v4 evaluation   |
| 4   | Self-fetching a server route from an SSR loader  | CRITICAL | protocol-v4 evaluation   |
| 5   | Omitting a field from serialized response output | CRITICAL | protocol-v4 evaluation   |

### deployment (3 failure modes)

| #   | Mistake                                           | Priority | Source                   |
| --- | ------------------------------------------------- | -------- | ------------------------ |
| 1   | Missing nodejs_compat flag for Cloudflare Workers | HIGH     | docs/guide/hosting       |
| 2   | Bun deployment with React 18                      | MEDIUM   | docs/guide/hosting       |
| 3   | Child route loosening parent SSR config           | MEDIUM   | docs/guide/selective-ssr |

### server-components (3 failure modes)

| #   | Mistake                                                       | Priority | Source                       |
| --- | ------------------------------------------------------------- | -------- | ---------------------------- |
| 1   | Using renderServerComponent when the UI needs slots           | HIGH     | docs/guide/server-components |
| 2   | Omitting structuralSharing: false for Query-cached RSC values | HIGH     | docs/guide/server-components |
| 3   | Copying stale renderRsc or .validator examples                | MEDIUM   | docs/guide/server-functions  |

## Tensions

| Tension                                              | Skills                             | Agent implication                                                             |
| ---------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| Isomorphic defaults vs server-only expectations      | execution-model ↔ server-functions | Agents put secrets/DB queries in loaders instead of server functions          |
| Simplicity of isomorphic code vs security boundaries | execution-model ↔ middleware       | Agents expose secrets via module-level process.env or skip context validation |

## Cross-References

| From             | To              | Reason                                          |
| ---------------- | --------------- | ----------------------------------------------- |
| server-functions | execution-model | Server functions ARE the isomorphic boundary    |
| server-functions | middleware      | Middleware chains compose with server functions |
| middleware       | server-routes   | Server routes use the same middleware system    |
| deployment       | execution-model | Deployment target affects where code runs       |

# 23 — Test layout and rules

| Status     | Area | Depends on | oRPC parity rows |
| ---------- | ---- | ---------- | ---------------- |
| `proposed` | repo | 22         | —                |

## Summary

Tests sit in five workspace packages under `next/test/`, away from the code they test. `packages/tanstack-react-query` has no tests in it, though `test/tanstack-query/react.test.tsx` covers it. The human, 2026-10-17: "tests should be contextual and sit in places close to the code their testing", "i don't think /next/test should exist at all", "i like reading tests as a sort of documentation on how to use stuff".

**Recommendation:**

- Each test moves into the package it exercises, next to the module, as `src/<area>/<module>.test.ts`.
- Each test file reads like a guide to that module, and edge cases move to a sibling `-edges` file.
- `next/test/` is deleted. The exceptions are a type-portability check, which moves to `tooling/`, and recipes for third-party libraries, which move to `examples/`.

## Today

- **`next/test/`** holds five workspace packages:

  | Package          | What it holds                                                                           |
  | ---------------- | --------------------------------------------------------------------------------------- |
  | `integration`    | 59 files, all for `@trpc12/trpc`, plus `fixtures/`                                      |
  | `tanstack-query` | 16 files covering eight packages, with a shared `fixtures/app.ts` and Svelte components |
  | `react`          | the two experimental React packages                                                     |
  | `bun`            | a Bun runtime smoke                                                                     |
  | `portability`    | a TS2742 declaration-emit fixture                                                       |

  Their dependencies are declared by the test packages, not by the packages under test.

- **Already in `src/`:** `packages/nest/src/index.test.ts`, `packages/upgrade/src/transform.test.ts`, `packages/trpc/src/exports.test.ts` and two `internal/*.test.ts` files.
- **v11** has a shared `packages/tests` package (`server/`, `showcase/`) and per-package `test/` folders with snapshots. Not a model to copy.

## Goals

- A reader opens a package and finds its tests beside the code, and the tests show how to use it.
- A package declares every dependency its tests import.
- Library type checks stay strict: platform-neutral, `isolatedDeclarations`. Test code doesn't loosen them.
- Coverage, CI and `pnpm test` keep working from the root as one Vitest run.

## Non-goals

- What tests check, and the "integration first" rule ([approach](../approach.md#3-principles)). The ≥98% coverage gate stays.
- Snapshot testing (none today).

## Options

### Q23.1: where a package's tests go

**A — beside the module, in `src/`** ⭐

```text
packages/tanstack-react-query/src/
  index.ts
  index.test.tsx          ← how to use the adapter: provider, queries, mutations, subscriptions
  rsc.ts
  rsc.test.tsx
packages/trpc/src/openapi/
  handler.ts
  openapi.test.ts
  to-contract.ts
  to-contract.test.ts
```

- ✅ The test is one click from the code, and imports the entry point a user would.
- ✅ This is what `nest`, `upgrade` and `trpc/src/exports.test.ts` already do.
- ❌ `src/` mixes library files and test files. A naming rule and the tsconfig split (Q23.6) keep them apart.

**B — a `test/` folder per package** (`packages/<pkg>/test/`)

- ✅ `src/` holds only library code.
- ❌ A test sits further from its module, and the `test/` tree has to mirror `src/` by hand.

### Q23.2: tests as documentation

**A — a guide file, plus an edges file** ⭐

- `<module>.test.ts` follows a user's path through the module: the simplest use first, in the order the docs teach it.
- `<module>-edges.test.ts` holds edge cases, regressions and coverage cases (several `*-edges` files already exist).

```ts
/**
 * `@trpc12/tanstack-react-query`: a provider, then queryOptions and
 * mutationOptions with TanStack's own hooks. See docs/tanstack-query.md.
 */
test('useQuery takes queryOptions from useTrpc()', async () => { … });
test('a mutation invalidates the queries under a path', async () => { … });
```

**B — one file per module, edge cases at the bottom**

- ✅ Fewer files.
- ❌ The guide gets buried as edge cases pile up, and many files are already 400+ lines.

### Q23.3: fixtures shared across packages

The TanStack app fixture (200 lines: router, server, `createApp`) is used by eight packages. The experimental React router (100 lines) is used by two.

**A — it lives in the package the others build on, and they import it by relative path** ⭐

```ts
// packages/tanstack-vue-query/src/index.test.ts
import { createApp } from '../../tanstack-query/src/fixtures/app.ts';
```

- ✅ No extra package. It only goes one way, toward a dependency (`tanstack-*-query` → `tanstack-query`).
- ❌ A relative import across package folders.
- (agent) `experimental-react-atom` doesn't depend on `experimental-react`, so it keeps its own copy of the router.

**B — a private fixtures package** (`tooling/fixtures`, `@fixtures/tanstack-app`)

- ✅ Imported by name.
- ❌ It is `next/test/` again under another name.

**C — inline the setup in every test file**

- ✅ Each file stands alone as documentation.
- ❌ Copies the 200-line app eight times.

### Q23.4: the Bun runtime smoke

**A — `packages/trpc/src/http/serve.bun.test.ts`** ⭐

- `bun test` runs it. Vitest excludes `**/*.bun.test.ts`, and a `tsconfig.bun.json` gives it Bun's types.
- ✅ It tests `@trpc12/trpc` on Bun, so it sits in that package.

**B — `examples/bun`, with a smoke script**

- ✅ Doubles as a "run tRPC on Bun" example.
- ❌ Its subscription and abort assertions are a test, not an example.

### Q23.5: tests that aren't about one package

- **Type portability** (consumer `.d.ts` emit across every package): it needs its own consumer package under pnpm isolation.
  - **A — `tooling/portability`** ⭐: repo-wide checks already live in `tooling/`.
  - **B — `examples/portability`**: it isn't an example.
- **Recipes** for libraries that need no adapter (`ai-sdk`, `better-auth`, `firebase-callable`, `publisher-recipes`), which back `docs/integrations.md`, `docs/platforms.md` and `docs/subscriptions.md`:
  - **A — `examples/integrations/`**, one test per recipe ⭐
    - ✅ It's a showcase.
    - ✅ `ai`, `better-auth` and `@effect/sql-pg` stay out of the core package.
    - Its tests run in `pnpm test` and count for coverage.
  - **B — in `packages/trpc/src/server/`** as `ai-sdk.test.ts` and so on.
    - ✅ Next to the code.
    - ❌ Third-party dev dependencies land in the core package.

### Q23.6: type-checking test code

**A — two tsconfigs per package** ⭐

```jsonc
// packages/trpc/tsconfig.json: the library, as strict as today
{ "include": ["src"], "exclude": ["src/**/*.test.*", "src/**/fixtures"] }
// packages/trpc/tsconfig.test.json: tests and fixtures, with Node's types and no isolatedDeclarations
{ "extends": "./tsconfig.json", "compilerOptions": { "types": ["node"], "declaration": false, "isolatedDeclarations": false }, "include": ["src"], "exclude": [] }
// "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json"
```

**B — one tsconfig with Node's types**

- ❌ Library code could use Node globals unnoticed. `@trpc12/trpc` promises it imports no `node:*`.

### Q23.7: docs link to the tests that prove them

**A — yes** ⭐: each docs page section that has tests ends with "Tested in [`…test.ts`](…)", so readers can jump from the prose to running code.

**B — no**

## Rules (recommended picks)

1. **Place:** a test lives in the package whose public API it uses, beside the module, as `src/<area>/<module>.test.ts`. Use `index.test.ts` for a package's entry point. When a file passes about 400 lines, split it by feature (`subscriptions.test.ts`).
2. **Read as a guide:** the file opens with a doc comment saying what it shows and which docs page it backs. Tests run in the order a user meets the features. Test names are sentences of behaviour. Edge cases and regressions go in `<module>-edges.test.ts`.
3. **Imports:** use public entry points (`@trpc12/trpc/server`), the same imports a user writes. Relative imports are allowed only for `internal/` modules that have no entry point.
4. **Visible setup:** each test builds what it calls (a router inline, or a fixture named at the top of the file), cleans up with `await using`, and shares no mutable state between tests.
5. **Types are documentation too:** use `expectTypeOf` inline next to the call that infers the type. Use `*.test-d.ts` only for type-only checks.
6. **Fixtures:** test-only helpers live in `src/**/fixtures/`.
   - They are excluded from builds (pack follows `exports` only), from coverage (test code, not library code), from the JSDoc rule and from the library tsconfig.
   - A fixture used by other packages lives in the package they depend on.
7. **Dependencies:** a package's `devDependencies` list everything its tests and fixtures import.
8. **Type checks:** each package has `tsconfig.json` for the library and `tsconfig.test.json` for tests, and `typecheck` runs both.
9. **No `next/test/`.** Cross-package consumer checks go in `tooling/` and showcases with third-party libraries go in `examples/`. Both run from the root `pnpm test`, `typecheck` and `coverage`.

## Where today's files go

- **`packages/trpc/src/`**
  - `actions/`: `actions.test.ts`, and `react.test.tsx` (from `test/tanstack-query/actions.test.tsx`)
  - `aws-lambda/`: `aws-lambda.test.ts`
  - `client/links/`:
    - `links.test.ts` and `typed-links.test.ts`
    - `http.test.ts` (batching and streaming), `http-edges.test.ts`
    - `socket-frames.test.ts` (from `ws-link-frames`)
    - `validation.test.ts` (from `client-validation`)
  - `cloudflare/`: `hibernation.test.ts`, `lock.test.ts` (from `durable-lock`), `tracer.test.ts` (from `workers-tracer`)
  - `contract/`: `contract.test.ts`
  - `effect/`: `effect.test.ts`
  - `http/`: `adapters.test.ts`, `core.test.ts`, `platforms.test.ts`, `serve.bun.test.ts`
  - `internal/testing/`: `testing.test.ts` (from `test-server`)
  - `interop/`: `handler.test.ts`, `handler-edges.test.ts`, `socket.test.ts`, `link.test.ts` (from `interop-v11*` and `v11-links`)
  - `openapi/`: `openapi.test.ts`, `openapi-edges.test.ts`, `coerce.test.ts`, `json-schema.test.ts`, `to-contract.test.ts`, `typescript.test.ts`, and `fixtures/` (typed router, shapes, generated files)
  - `serializer/`: `danson.test.ts`, `serializers.test.ts`, `transport.test.ts`, `protocol.test.ts`
  - `server/`: everything else
    - `basics`, `procedures`, `routers`, `composition`, `root-extensions` and `errors`
    - `tagged-errors`, `stream-output`, `subscriptions` and `publisher`
    - `files`, `fetch-edges`, `websockets` and `tracing`
    - `message-port`, plus `message-port-edges` (from `socket-edges`)
    - `lock`, `ratelimit` and `durable`
    - `fixtures/worker-server.ts`
  - `socket/`: `socket.test.ts`
  - `fixtures/`: `server.ts` and `contract.ts`, shared across areas
- **`packages/tanstack-query/src/`:** `index.test.ts` (from `core`), `sharing.test.ts`, `cache-tags.test.ts`, `db.test.ts`, and `fixtures/app.ts` and `fixtures/dom.ts`
- **Each adapter's `src/`:**
  - `react`: `index.test.tsx` and `rsc.test.tsx`
  - `vue` and `lit`: `index.test.ts`
  - `preact`: `index.test.tsx`
  - `angular`, `solid` and `svelte`: `index.test.ts` and `ssr.test.ts`. Svelte also gets `fixtures/*.svelte`.
- **`packages/experimental-react/src/`:** `index.test.ts`, `dom.test.tsx` and `fixtures/router.ts`
- **`packages/experimental-react-atom/src/`:** `index.test.tsx` and its own `fixtures/router.ts`
- **`tooling/portability/`:** today's `test/portability`
- **`examples/integrations/`:** `ai-sdk`, `better-auth`, `firebase-callable` and `publisher-recipes`

## Recommendation

- A for every question.
- Move one package per commit with `git mv`, so `git log --follow` keeps each file's history.
- Update the root `vite.config.ts` includes, the per-package dependencies and the links in docs and decisions.
- Coverage stays ≥98%.

## Questions

- **Q23.1** Where do a package's tests go: A beside the module in `src/`, or B a `test/` folder per package?
- **Q23.2** Tests as documentation: A a guide file plus a `-edges` file, or B one file per module?
- **Q23.3** Fixtures shared across packages: A in the package the others build on, imported by relative path; B a private fixtures package; or C inlined per file?
- **Q23.4** The Bun smoke: A `packages/trpc/src/http/serve.bun.test.ts`, or B `examples/bun`?
- **Q23.5** Tests not about one package: A portability in `tooling/` and recipes in `examples/integrations/`, or B something else?
- **Q23.6** Type-checking tests: A two tsconfigs per package, or B one with Node's types?
- **Q23.7** Should docs pages link to the tests that prove them?

## Decision

> Human: tick an answer per question (or write your own), add notes, and set **Status** to `accepted`.
> The agent then records it in `../decisions/` and links back here.

- **Q23.1:** [x] A · [ ] B → [test-layout](../decisions/test-layout.md)
- **Q23.2:** [ ] A · [ ] B
- **Q23.3:** [x] A · [ ] B · [ ] C → [test-layout](../decisions/test-layout.md)
- **Q23.4:** [x] A · [ ] B → [test-layout](../decisions/test-layout.md)
- **Q23.5:** `recipes stay in test/integration for now; the rest move to their packages` → [test-layout](../decisions/test-layout.md)
- **Q23.6:** [ ] A · [ ] B
- **Q23.7:** [ ] A · [x] B → [test-layout](../decisions/test-layout.md)
- **Notes:**

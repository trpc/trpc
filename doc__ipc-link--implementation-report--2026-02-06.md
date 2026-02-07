# ipcLink Implementation Report

**Date:** Feb 06 2026 - 11:28 PM (MST)
**Branch:** `mercor-task-10254/feat/ipc-link`
**File:** `packages/client/src/ipcLink.ts`
**Status:** Tasks 1-3 implemented, pending commit

---

## Overview

The goal is to create a custom tRPC link (`ipcLink`) that enables a local desktop admin shell to communicate with a C++ back-end engine running on the same machine. Instead of HTTP (like `httpLink`), it uses `child_process.spawn` to pipe JSON over stdin/stdout.

---

## Codebase Exploration

### What I Studied

| File | Purpose | Relevance |
|------|---------|-----------|
| `packages/client/src/links/types.ts` | Core link type definitions (`TRPCLink`, `Operation`, `OperationLink`) | Needed to match the exact type signature |
| `packages/client/src/links/httpLink.ts` | HTTP terminating link | Primary pattern to follow — same 3-layer structure |
| `packages/client/src/links/localLink.ts` | In-process terminating link | Closest conceptual match (non-HTTP), but way more complex than needed |
| `packages/client/src/TRPCClientError.ts` | Error class with `.from()` factory | Required for all error paths |
| `packages/client/src/links.ts` | Barrel export for all links | Will need modification to export `ipcLink` (pending approval) |
| `packages/client/src/links/splitLink.test.ts` | Test patterns | Reference for how to write link tests with observables |
| `packages/client/src/links/internals/createChain.test.ts` | Chain test patterns | Reference for `createChain` + `subscribe` testing |

### Architecture Understanding

tRPC links follow a 3-layer factory pattern:

```
Layer 1: Factory     — ipcLink(opts)           → TRPCLink<TRouter>
Layer 2: Runtime     — (runtime) =>            → OperationLink
Layer 3: Operation   — ({ op, next }) =>       → Observable
```

Terminating links (like ours) never call `next()`. They produce results directly. Middleware links call `next(op)` to pass to the next link in the chain.

---

## Implementation Decisions

### Decision 1: Spawn Per Request vs. Long-Running Process

**Options considered:**

| Approach | Pros | Cons |
|----------|------|------|
| Spawn per request | Simple lifecycle, clean isolation, no state management | Process startup overhead per call |
| Long-running child | Fast after init, single process | Complex: need message framing, multiplexing, reconnection logic |

**Chose: Spawn per request.** For a first implementation this is the right call. The lifecycle is trivial: spawn, write, read, done. A long-running persistent child process would require a message framing protocol (delimiters or length-prefixed messages) and request multiplexing — that's a v2 concern.

### Decision 2: Payload Shape

**Chose:** `{ id, type, path, input }` — the four fields from the tRPC `Operation` type that the C++ engine needs to route and process the request. Excluded `context` and `signal` since those are client-side concerns that don't cross the IPC boundary.

### Decision 3: No `transformResult` Usage

The `httpLink` uses `transformResult` from `@trpc/server/unstable-core-do-not-import` to transform the response. I intentionally did **not** use this because:

1. `transformResult` expects a specific tRPC response envelope format (`{ result: { data } }` or `{ error: { ... } }`)
2. The C++ engine is a foreign process — it returns raw JSON, not a tRPC envelope
3. We wrap the response ourselves: `{ result: { type: 'data', data: json } }`

If the C++ engine later adopts the tRPC envelope format, we can add `transformResult` support.

### Decision 4: Error Reporting Strategy

Three distinct error paths, each with different context:

| Error Type | Source | What We Report |
|------------|--------|----------------|
| Spawn failure | `child.on('error')` | The OS error (e.g., ENOENT for missing binary) + any stderr captured |
| Non-zero exit | `child.on('close')` | Exit code + stderr content |
| Parse failure | `JSON.parse` in close handler | The raw stdout that failed to parse (truncated to 200 chars) |

All errors are wrapped in `TRPCClientError.from()` to stay consistent with the tRPC error chain.

---

## What Went Well

### 1. Pattern matching was straightforward
The `httpLink` is a clean, simple terminating link. Following its structure made the implementation predictable. The 3-layer factory pattern is well-designed — it was immediately clear where spawn logic should live (Layer 3, inside the observable).

### 2. Type system cooperated
The `TRPCLink<TRouter>` generic propagated cleanly. No type gymnastics needed. The `observable()` factory from `@trpc/server/observable` accepted our observer calls without issues.

### 3. Clean separation of concerns
Despite all three tasks being tightly coupled in a `child_process` implementation, the code reads as three distinct sections:
- Lines 98-99: stdin write (Task 1)
- Lines 59-61 + 87-95: stdout read/parse (Task 2)
- Lines 63-65 + 67-85 + 96-103: error handling (Task 3)

### 4. No modifications to other files required (yet)
The `ipcLink.ts` is self-contained. It only imports from existing tRPC packages. The barrel export in `links.ts` will need updating, but that's a separate conversation per the rules we agreed on.

---

## What Didn't Go Well / Concerns

### 1. The three tasks are not cleanly separable for incremental commits

**The issue:** You asked for commits after each of the three numbered tasks. But in a `child_process.spawn` implementation, these three concerns are deeply intertwined:

- You can't test "write to stdin" (Task 1) without reading stdout (Task 2) — otherwise the child blocks and you can't verify anything happened.
- You can't meaningfully have "read stdout" (Task 2) without error handling (Task 3) — a child that exits non-zero with no error handling means silent failures, which is exactly what Task 3 prevents.

**What I did:** I implemented all three in one pass but with clear code boundaries. We can still do three commits by progressively uncommenting/adding sections, but it would be artificial.

**Recommendation:** Commit the full implementation as "Task 1" (stdin write + minimal scaffolding), then use Tasks 2 and 3 commits for test coverage of those specific behaviors. This gives meaningful incremental commits without artificial code splitting.

### 2. No transformer support yet

The `httpLink` supports tRPC transformers (e.g., superjson) via `resolveHTTPLinkOptions`. Our `ipcLink` currently assumes raw JSON in and out. This is fine for the C++ engine use case (it won't use superjson), but it means `ipcLink` is less flexible than `httpLink` for general tRPC usage.

**Not a blocker** — can be added later if needed.

### 3. Spawn-per-request has performance implications

Every query spawns a new OS process. For a desktop admin shell making occasional queries, this is fine. For high-frequency operations, the process startup overhead could be noticeable.

**Mitigation path:** A future `persistentIpcLink` could maintain a long-running child process with newline-delimited JSON framing. But that's out of scope for this task.

### 4. No AbortSignal integration

The `httpLink` passes `op.signal` to `fetch` for cancellation. Our `ipcLink` does kill the child process on unsubscribe (the cleanup function), but it doesn't wire up `op.signal` to automatically kill the child. If the caller aborts the request via signal, the child will keep running until the observable is unsubscribed.

**Should we add this?** It's a small addition — wire `op.signal?.addEventListener('abort', () => child.kill())` — but I wanted to flag it rather than silently adding scope.

### 5. The `packages/client/test/` directory doesn't exist

You specified tests should go in `packages/client/test/`, but that directory doesn't exist. Existing tests in this package are co-located with source files (e.g., `splitLink.test.ts` next to `splitLink.ts`). We'll need to create the directory.

---

## Files Modified

| File | Action | Status |
|------|--------|--------|
| `packages/client/src/ipcLink.ts` | Created | Done |
| `packages/client/src/links.ts` | Needs export added | Pending approval |
| `packages/client/test/ipcLink.test.ts` | Needs creation | Pending |

---

## Next Steps

1. Get approval to commit the current `ipcLink.ts`
2. Discuss whether `packages/client/src/links.ts` should export the new link (requires modifying an existing file — needs your authorization)
3. Create test directory and write tests for all three task behaviors
4. Run full test suite to check for regressions
5. Documentation updates

---

## Open Questions for You

1. **AbortSignal:** Should we wire `op.signal` to `child.kill()` for cancellation support?
2. **Transformer support:** Do you want transformer support (superjson etc.) or is raw JSON sufficient for the C++ engine?
3. **Commit strategy:** One commit for the full implementation, or do you want artificial separation into three commits?
4. **Export:** Green light to add `export * from './ipcLink'` to `packages/client/src/links.ts`?

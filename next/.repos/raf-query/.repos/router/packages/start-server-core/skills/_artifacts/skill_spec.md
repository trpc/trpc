# @tanstack/start-server-core — Skill Spec

Server-side runtime for TanStack Start: createStartHandler, request/response utilities, cookie/session management, three-phase request handling, AsyncLocalStorage context.

## Domains

| Domain         | Description                                                  | Skills            |
| -------------- | ------------------------------------------------------------ | ----------------- |
| Server Runtime | Server request handling, cookies/sessions, AsyncLocalStorage | start-server-core |

## Skill Inventory

| Skill             | Type | Domain         | What it covers                                                   | Failure modes |
| ----------------- | ---- | -------------- | ---------------------------------------------------------------- | ------------- |
| start-server-core | core | server-runtime | createStartHandler, cookies, sessions, three-phase handling, ALS | 4             |

## Failure Mode Inventory

### start-server-core (4 failure modes)

| #   | Mistake                                                   | Priority | Source                 |
| --- | --------------------------------------------------------- | -------- | ---------------------- |
| 1   | Missing AsyncLocalStorage setup                           | HIGH     | source/docs            |
| 2   | Incorrect handler export for deployment target            | MEDIUM   | source/docs            |
| 3   | Capturing request or environment state at module scope    | CRITICAL | protocol-v4 evaluation |
| 4   | Treating cookie session data as authoritative persistence | HIGH     | protocol-v4 evaluation |

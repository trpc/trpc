---
title: Should wsLink report a successor that keeps failing to open after a server's `reconnect`?
summary: "v11 emits `connecting` with the last error after 3 failed successors; v12's wsLink has no connection state to emit it on."
area: client
recommended: A
links:
  - kind: decision
    label: ws-graceful-switchover
    url: ../decisions/ws-graceful-switchover.md
  - kind: code
    label: wsLink's supervise
    url: ../../packages/trpc/src/client/links/socket.ts
---

# Should wsLink report a successor that keeps failing to open after a server's `reconnect`?

## Why it matters

After a server's `reconnect`, `wsLink` keeps the old connection serving while a successor opens, and retries a successor that fails with its `reconnect.delay`. The spec for v11 says: "after 3 consecutive failures, emit `connecting` with the last error". v11's `wsClient` has a `connectionState` observable and subscriptions see `connecting`; v12's `wsLink` has neither, so today the failures are silent until the old connection closes, when its subscriptions reconnect as after any drop and fail with the last error once `reconnect.attempts` run out.

## Options

### A) Stay silent while the old connection serves

Nothing new. Subscribers keep getting events from the old connection; the server's drain timeout bounds how long that lasts.

- ✅ No new public API
- ❌ An app can't show "reconnecting" while the successor is failing

### B) A connection-state callback on `wsLink`

```ts
wsLink({
  url,
  onConnectionState: (state) => {
    // { type: 'connecting', error } after 3 failed successors, then { type: 'open' }
  },
});
```

- ✅ Matches v11's `connecting` signal
- ❌ A new public option; the state would also need defining for ordinary drops and lazy connections

## Recommendation

**A** for now, and B as its own design if apps ask for a connection state: it covers more than the switchover.

## Blocked until answered

- Nothing is blocked.

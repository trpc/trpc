---
title: Should subscriptions and streamed outputs be offered to agents as MCP tools, and how?
summary: A subscription or streamed query could stay hidden from agents, run to completion with progress, become an MCP resource, or become an MCP task.
area: mcp
recommended: A
questions: [Q25.5]
links:
  - kind: spike
    label: spikes/mcp
    url: ../../spikes/mcp/
  - kind: proposal
    label: Proposal 25, MCP
    url: ../proposals/25-mcp.md
  - kind: note
    label: mcp-tools spike note
    url: ../notes/mcp-tools.md
  - kind: decision
    label: durable-calls
    url: ../decisions/durable-calls.md
  - kind: decision
    label: subscriptions
    url: ../decisions/subscriptions.md
---

# Should subscriptions and streamed outputs be offered to agents as MCP tools, and how?

## Why it matters

An MCP tool call returns one result. The spike never publishes subscriptions, even with `include: 'all'`, and has no handling for streamed outputs. Every option except A depends on another answer: B needs server-sent event responses (B in the transport question), C needs sessions (C there) and resources (B in the beyond-tools question), and D needs an experimental part of the spec.

## Options

### A) Not tools in v1

Subscriptions are left out of `tools/list`; streamed outputs aren't published either.

```ts
const appRouter = {
  post: {
    watch: t.procedure.meta({ mcp: true }).subscription(async function* () {
      yield tracked('1', 'Hello');
    }), // not in tools/list
  },
};
```

- ✅ Nothing to build, and no half-fitting mapping to undo later.
- ❌ Agents can't watch live data or read a streamed answer.

### B) Run to completion, with progress

The call iterates until the stream ends or `maxItems` is reached. It sends each item as `notifications/progress`, then all items as the result.

```ts
watch: t.procedure
  .meta({ mcp: { maxItems: 20 } })
  .subscription(async function* () { … }),
// what the agent's client gets:
// notifications/progress per item, then
// { structuredContent: { result: [ …items ] } }
```

- ✅ A streamed output works as a tool with no new concept.
- ❌ Needs server-sent event responses, and an endless subscription only makes sense with a cap.

### C) MCP resources with `resources/subscribe`

A subscription becomes a resource the agent reads and watches for changes.

```ts
watch: t.procedure
  .meta({ mcp: { resource: { uri: 'blog://posts' } } })
  .subscription(async function* () { … }),
// resources/subscribe { uri: 'blog://posts' } → notifications/resources/updated
```

- ✅ MCP's own concept for changing data.
- ❌ Needs sessions and the GET stream, and resources aren't in v1's scope yet.

### D) MCP tasks

A long call becomes a task the agent polls (experimental in protocol `2025-11-25`). It's stored by `experimental_durable()`, the middleware that keeps a call's result so retries reuse it.

```ts
report: t.procedure
  .use(experimental_durable({ ttl: '1 hour' }))
  .meta({ mcp: { task: true } })
  .mutation(async function* () { … }),
// tools/call → a task id; tasks/get → status, then the result
```

- ✅ Fits long-running work, on the durable store that already exists.
- ❌ An experimental part of the spec, with little client support yet.

## Recommendation

**A.** Each mapping depends on a bigger transport or scope choice, and no one has asked for one yet. Leaving streams out now doesn't rule any of them out later.

## Blocked until answered

- Nothing. A matches the spike; the docs page would say subscriptions aren't tools.

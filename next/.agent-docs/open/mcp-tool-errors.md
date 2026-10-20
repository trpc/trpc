---
title: When an MCP tool fails, should the error go back to the model as a result it can read, or as a protocol error?
summary: A failed tool could return an `isError` result with the code, message and data, which the model reads and retries, or a JSON-RPC error.
area: mcp
recommended: A
questions: [Q25.6]
links:
  - kind: spike
    label: spikes/mcp
    url: ../../spikes/mcp/
  - kind: proposal
    label: Proposal 25, MCP
    url: ../proposals/25-mcp.md
  - kind: code
    label: The spike's tests (errors)
    url: ../../spikes/mcp/mcp.test.ts
  - kind: decision
    label: closed-client-errors
    url: ../decisions/closed-client-errors.md
  - kind: decision
    label: mask-unexpected-errors
    url: ../decisions/mask-unexpected-errors.md
---

# When an MCP tool fails, should the error go back to the model as a result it can read, or as a protocol error?

## Why it matters

MCP has two error channels. A tool result with `isError: true` reaches the model, which can fix its arguments and retry. A JSON-RPC error usually reaches the user instead. In the spike's Inspector run, the model read a validation issue and retried with fixed arguments. The server code is the same under both options; only what the agent sees changes. This only applies if MCP is built in or shipped as a package.

## Options

### A) A procedure's failures are `isError` results

Failures from the procedure (validation, declared and thrown errors) are results the model reads. The same body is in `_meta['io.trpc/error']` for programs. Unexpected errors are masked as on RPC. Protocol failures (an unknown tool, bad JSON) are JSON-RPC errors.

```ts
byId: t.procedure
  .meta({ mcp: true })
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
  .query(({ input }) => posts.get(input.id) ?? error({ code: 'NOT_FOUND', data: { id: input.id } })),

// what the agent gets for tools/call post_byId { id: '9' }:
// { isError: true,
//   content: [{ type: 'text', text: '{"code":"NOT_FOUND","message":"NOT_FOUND","data":{"id":"9"}}' }],
//   _meta: { 'io.trpc/error': { code: 'NOT_FOUND', message: 'NOT_FOUND', data: { id: '9' } } } }
// an unexpected throw: '{"code":"INTERNAL_SERVER_ERROR","message":"Internal server error"}'
// an unknown tool: JSON-RPC error -32602
```

- ✅ The model sees validation issues and declared errors, and can correct itself. That's what MCP specifies.
- ✅ Masking matches RPC, and programs read `_meta['io.trpc/error']` without parsing text.
- ❌ A client that ignores `isError` may treat a failure as success text.

### B) Every failure is a JSON-RPC error

Procedure failures use the protocol's error channel, like RPC errors.

```ts
// what the agent's client gets for tools/call post_byId { id: '9' }:
// { jsonrpc: '2.0', id: 3, error: { code: -32000, message: 'NOT_FOUND', data: { id: '9' } } }
```

- ✅ One error channel, closer to how RPC clients see failures.
- ❌ Clients show JSON-RPC errors to the user, not the model, so the model can't retry.

## Recommendation

**A.** It's what MCP asks for, and the spike's Inspector run shows the retry loop working with nothing extra from us. Masking and the closed error union stay as on RPC: thrown codes keep their code and data, and only unexpected errors are masked.

## Blocked until answered

- Nothing. A matches the spike.

---
title: How should MCP tools accept dates and other values JSON can't carry?
summary: An agent sends a date as an ISO string; a `z.date()` or Effect `Schema.Date` input rejects it unless tRPC decodes it with the schema's JSON codec.
area: mcp
recommended: B
questions: [Q25.8]
links:
  - kind: spike
    label: spikes/mcp
    url: ../../spikes/mcp/
  - kind: proposal
    label: Proposal 25, MCP
    url: ../proposals/25-mcp.md
  - kind: note
    label: mcp-tools spike note (findings)
    url: ../notes/mcp-tools.md
  - kind: decision
    label: openapi-generated-clients (zod dates as date-time)
    url: ../decisions/openapi-generated-clients.md
  - kind: decision
    label: client-validation-link (the JSON codec)
    url: ../decisions/client-validation-link.md
  - kind: code
    label: The shared JSON Schema generator
    url: ../../packages/trpc/src/internal/json-schema.ts
---

# How should MCP tools accept dates and other values JSON can't carry?

## Why it matters

The spike found that `z.date()` was described as `{}`, and that a date input fails validation when an agent sends a string. Since the spike, the shared generator (`toJsonSchema`, used by OpenAPI and MCP) describes zod `Date` outputs and `z.coerce.date()` inputs as `{ type: 'string', format: 'date-time' }`. The input side is still open. A plain `z.date()` input is `{}` and rejects strings. Effect's `Schema.Date` is described as `{ type: 'string' }` but rejects the string `"1970-01-01T00:00:00.000Z"` when validated. OpenAPI's JSON bodies have the same gap, so the fix is in shared code. This only applies if MCP is built in or shipped as a package.

## Options

### A) Keep it as it is

Outputs are described correctly. For date inputs, the user writes a schema that accepts strings.

```ts
// zod
.input(z.object({ at: z.coerce.date() })) // described as date-time, accepts the string
.input(z.object({ at: z.date() })) // described as {}, rejects the string

// Effect
.input(Schema.Struct({ at: Schema.Date })) // described as { type: 'string' }, rejects the string
.input(Schema.Struct({ at: Schema.DateFromString })) // accepts the string
```

- ✅ Nothing to build. The zod side is documented in `www/docs/openapi/document.md`.
- ❌ An Effect `Schema.Date` input says it takes a string and then rejects one, so the agent can't satisfy the tool.

### B) Decode arguments with the input schema's JSON codec

For Effect Schema inputs, MCP arguments (and OpenAPI JSON bodies) are decoded with `Schema.toCodecJson(input)`, as `experimental_validationLink({ output: 'json' })` already does for responses. zod has no JSON codec, so zod inputs keep `z.coerce.date()`.

```ts
const t = initTrpc().concat(experimental_mcp());

t.procedure
  .meta({ mcp: true })
  .input(Schema.Struct({ at: Schema.Date }))
  .query(({ input }) => input.at.getFullYear()); // `at` is a Date

// tools/call { arguments: { at: '1970-01-01T00:00:00.000Z' } } → decoded to a Date, returns 1970
```

- ✅ Effect-native: the schema's own JSON form is described and accepted, with no option to learn. It fixes OpenAPI bodies too.
- ❌ Two decoding paths, one for Effect Schema and one for every other Standard Schema library.

### C) Per-tool schema overrides

`mcp.inputSchema` and `mcp.outputSchema` replace the generated schema, like OpenAPI's `route.spec`.

```ts
t.procedure.meta({
  mcp: { inputSchema: (generated) => withDateTime(generated, 'at') },
});
```

- ✅ Covers any schema the generator gets wrong, not only dates.
- ❌ Restates schemas by hand, against describing them once, and decoding still fails.

## Recommendation

**B.** It's the Effect-native fix ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)): Effect Schema already knows its JSON form, and the client side already decodes with it. zod users have a working answer in `z.coerce.date()`, which the generator describes correctly. Track it as a fix to the shared input path, apart from MCP.

## Blocked until answered

- Nothing in MCP itself. The input path of the OpenAPI handler would change with B.

## Details

- Checked on 2026-10-20 against `effect` 4.0.2: `toJsonSchema(Schema.Struct({ at: Schema.Date }), 'input')` gives `{ at: { type: 'string' } }`; the Standard Schema validation of `{ at: '1970-01-01T00:00:00.000Z' }` fails with `Expected a valid Date`; `Schema.decodeUnknownSync(Schema.toCodecJson(…))` returns a `Date`.
- `bigint` stays `{}` either way. Under B, an Effect `Schema.BigInt` input would accept its JSON (string) form.

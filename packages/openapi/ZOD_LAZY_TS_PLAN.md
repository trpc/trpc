# Zod Lazy: TS-First Plan

## Goal

Keep TypeScript inference as the source of truth for OpenAPI schema generation.
Use runtime Zod walking only for metadata extraction such as descriptions.
Do not depend on Zod's `toJSONSchema()` output.

## Problem Summary

For some procedures typed through `z.lazy()`, the procedure input type reaches the
schema generator as a recursive structural type that eventually collapses to `{}`
instead of being emitted as a named recursive component.

The important distinction is:

- TypeScript already knows the semantic recursive type.
- The current schema generation path loses stable schema identity for that type.

That means the fix should target the TS schema conversion path first, not replace
schema generation with runtime Zod conversion.

## Desired Architecture

There should be two separate responsibilities:

1. TypeScript type walking builds the OpenAPI schema.
2. Runtime Zod walking extracts metadata and parser-origin hints only.

The runtime Zod pass should not become a second schema generator.

## TS Inference Plan For `z.lazy()`

### Core Idea

When the procedure input type is recursive, the TS walker should register a stable
component placeholder before descending into child properties. That is already how
named recursive object types are handled in the normal object conversion path.

The missing piece is doing that reliably for recursive procedure inputs whose type
arrives as a structural object rather than a clearly named alias.

### Proposed Flow

1. Detect when a procedure input schema produced by `typeToJsonSchema(...)` is
   empty or otherwise indicates recursive collapse.
2. Instead of falling back to runtime schema generation, inspect the TS type for a
   stable naming source:
   - `aliasSymbol`
   - symbol name
   - declaration name
   - procedure-path-derived fallback name as a last resort
3. Register that input type in `ctx.typeToRef` and `ctx.schemas` before descending.
4. Re-run object conversion against the same TS type with the placeholder already
   installed.
5. Recursive edges should now resolve to `$ref` against that placeholder instead of
   collapsing to `{}`.

### Important Constraint

This should still be driven by `ts.Type` identity, not by runtime parser identity.
The schema graph remains a TS graph.

### What To Add

- A small pre-registration branch for recursive or potentially recursive procedure
  input types.
- A naming helper for anonymous-but-recursive input types.
- Tests proving recursive `z.lazy()` input procedures resolve to named components
  and preserve well-known TS types such as `Date`.

## Runtime Zod Walking Plan For Metadata

### Core Idea

The runtime router walk should continue to import the router and inspect Zod input
and output parsers, but only to extract metadata.

That includes:

- `.describe()` text
- possibly defaults/examples later
- parser-origin information if needed for debugging

It should not convert schemas to OpenAPI.

### Handling `lazy`

The runtime metadata walker should explicitly support `z.lazy()` by following
`lazyType._zod.def.getter()` when traversing parser structure.

The traversal rules should be:

1. When a Zod node is `lazy`, call `getter()` to obtain the underlying schema.
2. Use a `seen` set keyed by the lazy wrapper schema object before descending.
3. If the same lazy wrapper is seen again, stop recursion for metadata walking.
4. Continue traversing the resolved inner schema for object fields, array elements,
   wrapper types, unions, and so on.

### Why Key By The Lazy Wrapper

The getter may return a fresh inner object graph on each call. The stable identity
is the `ZodLazy` wrapper itself, not necessarily the resolved inner schema object.

## Implementation Phases

### Phase 1

- Remove runtime OpenAPI conversion from the Zod metadata layer.
- Keep the new tests failing.

### Phase 2

- Fix the TS schema walker so recursive procedure inputs get stable component
  registration.
- Make the failing recursive input tests pass with no runtime schema conversion.

### Phase 3

- Extend the runtime metadata walker to traverse `lazy` via `getter()`.
- Confirm descriptions still land on recursive schemas.

## Success Criteria

- Recursive `z.lazy()` procedure inputs resolve to named OpenAPI components.
- Well-known types inside those recursive inputs, including `Date`, survive through
  the TS path.
- Runtime metadata extraction still works for recursive Zod schemas.
- No call to Zod `toJSONSchema()` is required anywhere in the OpenAPI generator.

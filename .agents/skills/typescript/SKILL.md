---
name: typescript
description: tRPC's TypeScript conventions beyond lint. Required internal parameters and options instead of optionals, discriminated unions, branded primitives, `unknown` at boundaries, inferred and derived types, `satisfies` over `as`, `opts` objects and `await using` cleanup. Use when writing, refactoring or reviewing TypeScript in packages/, especially when adding a parameter, an option, a type or a type guard.
---

# TypeScript

Make impossible states fail to compile. Adapted from pstack's [type system discipline](https://github.com/cursor/plugins/blob/main/pstack/skills/principle-type-system-discipline/SKILL.md) and [TypeScript best practices](https://github.com/cursor/plugins/blob/main/pstack/skills/typescript-best-practices/SKILL.md).

Lint (`.oxlintrc.json`, `tooling/oxlint-plugin/`) already enforces type imports, at most three parameters, type-parameter names, no non-null assertions and exhaustive switches.

## Types

- Prefer required over optional. Internal (non-exported) parameters, properties and options aren't optional: pass an explicit `null`, a literal string or a symbol. Optionals are only for the convenience of public APIs.

  ```ts
  function connect(url: string, retry?: RetryOptions); // before
  function connect(url: string, retry: RetryOptions | null); // after
  ```

- Model variants as a discriminated union on a literal field, not booleans plus optional fields.
- Brand a primitive when two values of its type mean different things: `string & { __brand: 'TrackedId' }`, as in `stream/tracked.ts`.
- Data from outside (request bodies, headers, messages) is `unknown` until it's parsed at the boundary; trust the type after that. `any` is fine in generic constraints such as `AnyRouter`.
- Let TypeScript infer, and derive types from whatever owns the shape (`typeof`, `ReturnType`, `inferRouterInputs`) before declaring a parallel one. Declare return types only on public APIs.
- Check a value with `satisfies`, not `as`; cast only after validating. A type guard (`isX`) must check what its name claims.

## Functions

- Take one options object, `opts`, and read its members. Destructure only keys read three or more times.
- Clean up with `await using` and `makeResource()` or `makeAsyncResource()`, not `try`/`finally`.

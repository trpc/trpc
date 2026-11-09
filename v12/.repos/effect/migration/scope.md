# Scope

## `Scope.extend` → `Scope.provide`

`Scope.extend` has been renamed to `Scope.provide` in v4. The behavior is
identical: it provides a `Scope` to an effect that requires one, removing
`Scope` from the effect's requirements without closing the scope when the
effect completes.

The new name better reflects the operation — you are providing a service (the
`Scope`) to an effect, consistent with how other services are provided in
Effect.

**v3**

```ts
import { Effect, Scope } from "effect"

const program = Effect.gen(function*() {
  const scope = yield* Scope.make()
  yield* Scope.extend(myEffect, scope)
})
```

**v4**

```ts
import { Effect, Scope } from "effect"

const program = Effect.gen(function*() {
  const scope = yield* Scope.make()
  yield* Scope.provide(scope)(myEffect)
})
```

Both data-first and data-last (curried) forms are supported:

```ts
// data-first
Scope.provide(myEffect, scope)

// data-last (curried)
myEffect.pipe(Scope.provide(scope))
```

## Quick Reference

| v3             | v4              |
| -------------- | --------------- |
| `Scope.extend` | `Scope.provide` |

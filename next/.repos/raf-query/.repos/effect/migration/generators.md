# Generators

## `Effect.gen`: Passing `this`

In v3, you could pass a `self` value directly as the first argument to
`Effect.gen`. In v4, `self` must be wrapped in an options object.

**v3**

```ts
import { Effect } from "effect"

class MyService {
  readonly local = 1
  compute = Effect.gen(this, function*() {
    return yield* Effect.succeed(this.local + 1)
  })
}
```

**v4**

```ts
import { Effect } from "effect"

class MyService {
  readonly local = 1
  compute = Effect.gen({ self: this }, function*() {
    return yield* Effect.succeed(this.local + 1)
  })
}
```

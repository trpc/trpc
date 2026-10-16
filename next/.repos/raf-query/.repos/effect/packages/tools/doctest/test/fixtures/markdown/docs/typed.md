# Typed Markdown examples

This prose is not JavaScript and must never execute.
throw new Error("Markdown prose must not execute")

```ts import.meta.vitest name=static-import
import { expect } from "vitest"
import { answer } from "./helper.ts"
const local: number = answer
expect.assertions(2)
expect(local).toBe(42)
expect(import.meta.url).toContain("/docs/typed.md")
```

```ts import.meta.vitest name=dynamic-import
import { expect } from "vitest"
const { answer } = await import("./helper.ts")
const local: number = answer + 1
expect.assertions(2)
expect(local).toBe(43)
expect(import.meta.url).toContain("/docs/typed.md")
```

```ts import.meta.vitest name=javascript
import { expect } from "vitest"
const local = 42
expect.assertions(1)
expect(local).toBe(42)
```

```ts import.meta.vitest name=assertion-comments
import { expect } from "vitest"
import { answer } from "./helper.ts"
let evaluations = 0
const expected = (value: number): number => {
  evaluations++
  return value
}
const local: number = answer // => expected(42)
local + 1 // => expected(43)
expect.assertions(1)
expect(evaluations).toBe(2)
```

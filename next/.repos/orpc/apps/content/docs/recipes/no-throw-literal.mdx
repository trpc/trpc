---
title: "No Throw Literal"
description: "Learn why oRPC recommends throwing only Error instances and how to customize this behavior with ThrowableError in the Registry."
---

```ts
// eslint-disable-next-line no-throw-literal
throw 'error' // ✗ avoid
throw new Error('error') // ✓ recommended
```

:::info
oRPC treats thrown `Error` instances as best practice by default, as recommended by the [JavaScript Standard Style](https://standardjs.com/rules.html#throw-new-error-old-style).
:::

## Configuration

Customize oRPC's behavior by setting `ThrowableError` in the `Registry`:

```ts
declare module '@orpc/server' { // or '@orpc/contract', or '@orpc/client'
  interface Registry {
    ThrowableError: Error // [!code highlight]
  }
}
```

:::info
Avoid using `any` or `unknown` for `ThrowableError` because doing so prevents the client from inferring [typesafe errors](/docs/client/error-handling#using-safe-and-isdefinederror). Instead, use `null | undefined | {}` (equivalent to `unknown`) for stricter error type inference.
:::

:::warning
If `ThrowableError` is configured as `null | undefined | {}`, check `isSuccess` instead of relying on `error`:

```ts
const { error, data, isSuccess } = await safe(client('input'))

if (!isSuccess) {
  if (isDefinedError(error)) {
    // handle typesafe errors
  }

  // handle other errors
}
else {
  // handle success
}
```

:::

## Bonus

If you use ESLint, enable the [no-throw-literal](https://eslint.org/docs/rules/no-throw-literal) rule to enforce throwing only `Error` instances.

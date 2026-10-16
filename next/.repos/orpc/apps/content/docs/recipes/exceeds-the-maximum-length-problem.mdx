---
title: "Exceeds the Maximum Length Problem"
description: "Fix the TypeScript error where an inferred router type exceeds the maximum length the compiler will serialize."
sidebar:
  label: "Exceeds the maximum length ..."
---

TypeScript may report this error when you export a large or complex [router](/docs/router). This is a known TypeScript limitation, not an oRPC bug. TypeScript enforces it to maintain reasonable editor and type-checking performance for large types.

```ts twoslash
// @error: The inferred type of this node exceeds the maximum length the compiler will serialize. An explicit type annotation is needed.
export const router = {
  // many procedures here
}
```

## When It Happens

You usually see this error when all of the following are true:

1. Your project uses `"declaration": true` in `tsconfig.json`.
2. Your project is large or your types are very complex.
3. You export your router as a single, large object.

## How to Fix It

### 1. Disable `"declaration": true`

If you don't need this feature, disable this option in your `tsconfig.json`:

```diff tsconfig.json
  {
    "compilerOptions": {
--    "declaration": true,
++    "declaration": false
    }
  }
```

### 2. Add Explicit Output Types

Add `.output` or an explicit handler return type to your procedures. This lets TypeScript use the declared output shape instead of fully expanding the handler implementation, which often improves both type-checking and editor performance.

:::tip
Use the [type](/docs/procedure#type-utility) utility if you just want to specify the output type without validating the output.
:::

### 3. Split the Router into Smaller Exports

If you need `"declaration": true`, avoid exporting a single massive router object from the server. Instead, export smaller router segments and combine them on the client side, where `"declaration": false`:

```ts
export const userRouter = { /** ... */ }
export const planetRouter = { /** ... */ }
export const publicRouter = { /** ... */ }
```

Then define the client type from those smaller exports:

```ts
interface Router {
  user: typeof userRouter
  planet: typeof planetRouter
  public: typeof publicRouter
}

export const client: RouterClient<Router> = createORPCClient(link)
```

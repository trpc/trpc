---
title: "Monorepo Setup"
description: "Set up a monorepo with oRPC using TypeScript project references to keep end-to-end type safety across interconnected apps and packages."
---

:::info[Playground]
Explore a sample monorepo setup in our [Multiservice Monorepo Playground](https://github.com/middleapi/orpc-multiservice-monorepo-playground).
:::

## TypeScript Project References

When consuming, some parts of the client may end up being typed as `any` because the client environment doesn't have access to all types that oRPC procedures depend on. The most effective solution is to use [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html). This ensures the client can resolve all types used by oRPC procedures while also improving TypeScript performance.

<CodeGroup>

```json client/tsconfig.json
{
  "compilerOptions": {
    // ...
  },
  "references": [
    { "path": "../server" } // [!code highlight]
  ]
}
```

```json server/tsconfig.json
{
  "compilerOptions": {
    "composite": true // [!code highlight]
    // ...
  }
}
```

</CodeGroup>

:::tip[Common `composite` option's constraint]
The most common issue with `composite` is missing type definitions, resulting in: `The inferred type of "X" cannot be named without a reference to "Y". This is likely not portable. A type annotation is necessary.`

If you encounter this, try installing package `Y` if not already installed and adding this to your codebase where the error occurs:

```ts
import type * as _A from '../../node_modules/detail_Y_path_here'
```

:::

## Recommended Structure

- `/apps`: `references` dependencies in `tsconfig.json`
- `/packages`: Enable `composite` in `tsconfig.json`

The key principle is separating the server component (with `composite` enabled) into a dedicated package containing only necessary files. This approach simplifies dealing with the `composite` option's constraints.

:::tip
Avoid **alias imports** inside server components when possible. Instead, use **linked workspace packages** (e.g., [PNPM Workspace protocol](https://pnpm.io/workspaces#workspace-protocol-workspace)).
:::

<CodeGroup>

```txt title="Contract First"
apps/
├─ api/    // Import `core-contract` and implement it
├─ web/    // Import `core-contract` and set up @orpc/client here
├─ app/
packages/
├─ core-contract/  // Define contract with @orpc/contract
├─ .../
```

```txt title="Service First"
apps/
├─ api/    // Import `core-service` and run it in your environment
├─ web/    // Import `core-service` and set up @orpc/client here
├─ app/
packages/
├─ core-service/   // Define procedures with @orpc/server
├─ .../
```

```txt Hybrid
apps/
├─ api/    // Import `core-service` and set up @orpc/server here
├─ web/    // Import `core-contract` and set up @orpc/client here
├─ app/
packages/
├─ core-contract/  // Define contract with @orpc/contract
├─ core-service/   // Import `core-contract` and implement it
├─ .../
```

</CodeGroup>

:::info
This is just a suggestion. You can structure your monorepo however you like.
:::

## Learn More

- [Contract Client Factory](/docs/contract/client-factory)
- [Publish Client to NPM](/docs/recipes/publish-client-to-npm)

---
title: Should `TrpcModuleOptions` go back to being an interface that can be declaration-merged?
summary: '`TrpcModuleOptions` became a type alias so `layer` and `runtime` are exclusive; it can no longer be augmented with `declare module`.'
area: platforms
recommended: A
links:
  - kind: decision
    label: nest-integration
    url: ../decisions/nest-integration.md
  - kind: docs
    label: NestJS
    url: https://v12.trpc.io/v12/docs/integrations/nestjs
  - kind: code
    label: TrpcModuleOptions
    url: ../../packages/experimental-nest/src/index.ts
---

# Should `TrpcModuleOptions` go back to being an interface that can be declaration-merged?

## Why it matters

The second pass gave `TrpcModule` a `runtime` option beside `layer`. To make passing both a type error, as on the handlers, `TrpcModuleOptions` changed from an interface to a type alias ending in `{ layer?; runtime?: undefined } | { runtime; layer?: undefined }`. An alias can't be augmented, so `declare module '@trpc12/experimental-nest'` can no longer add fields to it. Passing both also throws when the module is built, for untyped callers. The package is experimental and nobody has asked to merge into it.

## Options

### A) Keep the type alias

```ts twoslash
// @errors: 2300 2322
// ---cut-start---
import type { ExecutionContext } from '@nestjs/common';
import { TrpcModule } from '@trpc12/experimental-nest';
import type { CreateContextOpts } from '@trpc12/trpc/server';
import { Context, type Layer, type ManagedRuntime } from 'effect';
class Db extends Context.Service<Db, {}>()('Db') {
  declare static readonly layer: Layer.Layer<Db>;
}
declare const runtime: ManagedRuntime.ManagedRuntime<Db, never>;
declare function createContext(opts: CreateContextOpts<ExecutionContext>): {};
// ---cut-end---
TrpcModule.forRoot({ createContext, runtime }); // ok
// Doesn't compile: `layer` and `runtime` together
TrpcModule.forRoot({ createContext, layer: Db.layer, runtime });

declare module '@trpc12/experimental-nest' {
  // Doesn't compile: duplicate identifier, it's a type alias
  interface TrpcModuleOptions {
    tenant?: string;
  }
}
```

- ✅ Passing both is a type error, like `createFetchHandler`, whose options are aliases too
- ❌ No declaration merging

### B) Back to one interface, with both keys optional

The exclusivity is only checked at runtime, by the `TypeError` the module already throws.

```ts twoslash
// ---cut-start---
import type { ExecutionContext } from '@nestjs/common';
import type { CreateContextOpts } from '@trpc12/trpc/server';
import { Context, type Layer, type ManagedRuntime } from 'effect';
import { TrpcModuleB as TrpcModule } from '../open/nest-module-options-interface.ts';
class Db extends Context.Service<Db, {}>()('Db') {
  declare static readonly layer: Layer.Layer<Db>;
}
declare const runtime: ManagedRuntime.ManagedRuntime<Db, never>;
declare function createContext(opts: CreateContextOpts<ExecutionContext>): {};
// ---cut-end---
TrpcModule.forRoot({ createContext, layer: Db.layer, runtime }); // compiles, throws at startup
```

```ts
declare module '@trpc12/experimental-nest' {
  interface TrpcModuleOptions {
    tenant?: string;
  } // ok
}
```

- ✅ Declaration merging works again
- ❌ The mistake moves from the editor to startup, unlike the handlers

### C) A mergeable base interface, and the alias over it

`TrpcModuleBaseOptions` is an interface with everything but `layer` and `runtime`; `TrpcModuleOptions` is it plus the exclusive union, as actions do with `CreateActionBaseOptions`.

```ts twoslash
// @errors: 2322
// ---cut-start---
import type { ExecutionContext } from '@nestjs/common';
import type { CreateContextOpts } from '@trpc12/trpc/server';
import { Context, type Layer, type ManagedRuntime } from 'effect';
import { TrpcModuleC as TrpcModule } from '../open/nest-module-options-interface.ts';
class Db extends Context.Service<Db, {}>()('Db') {
  declare static readonly layer: Layer.Layer<Db>;
}
declare const runtime: ManagedRuntime.ManagedRuntime<Db, never>;
declare function createContext(opts: CreateContextOpts<ExecutionContext>): {};
// ---cut-end---
// Doesn't compile: `layer` and `runtime` together
TrpcModule.forRoot({ createContext, layer: Db.layer, runtime });
```

```ts
declare module '@trpc12/experimental-nest' {
  interface TrpcModuleBaseOptions {
    tenant?: string;
  } // ok
}
```

- ✅ Both: the type error and a type to augment
- ❌ One more exported type, and merged fields reach nothing unless app code reads them from `TRPC_MODULE_OPTIONS`

## Recommendation

**A.** The options are spread into the OpenAPI handler, so a merged field does nothing unless app code reads it back, and nobody does. The type error is what users actually meet. C is cheap to add if someone needs to augment the options.

## Blocked until answered

- Nothing is blocked.

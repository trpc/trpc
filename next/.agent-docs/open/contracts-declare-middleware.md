---
title: Should contracts declare middleware, with `c.use(Key)`?
summary: A contract lists `UNAUTHORIZED` but can't say a procedure is authenticated. `c.use(Auth)` would add its errors and make `t.implement` require it.
area: server
recommended: B
questions: [Q27.5]
links:
  - kind: spike
    label: layered-services
    url: ../../spikes/layered-services/
  - kind: proposal
    label: 27 Layered services and strictness
    url: ../proposals/27-layered-services-and-strictness.md
  - kind: decision
    label: layered-services-and-strictness
    url: ../decisions/layered-services-and-strictness.md
  - kind: decision
    label: contracts
    url: ../decisions/contracts.md
  - kind: docs
    label: Contract-first
    url: https://v12.trpc.io/v12/docs/server/contract-first
  - kind: code
    label: experimental_contract
    url: ../../packages/trpc/src/contract/index.ts
---

# Should contracts declare middleware, with `c.use(Key)`?

## Why it matters

A contract plus `t.implement()` is already as strict as `effect/rpc`'s `RpcGroup` plus `toLayer`: outputs, errors and every procedure are checked. The gap is middleware. A contract lists `UNAUTHORIZED` in `.errors()` and the implementer adds `.use(authed)`, but nothing ties the two: the contract can't say a procedure is authenticated, and an implementation can forget the middleware. `effect/rpc` puts `Rpc.middleware(M)` in the declaration.

## Options

### A) Keep it as it is: contracts list middleware errors

```ts
const c = experimental_contract.create().errors({ UNAUTHORIZED: {} });
export const appContract = {
  me: c.output(User).query(),
};

const impl = t.implement(appContract).use(authed); // nothing requires this
export const router = impl.router({
  me: impl.me.query((opts) => opts.ctx.user),
});
```

- ✅ Built and documented; contracts stay schemas only
- ❌ Forgetting `.use(authed)` type-checks
- ❌ The contract can't document auth, so OpenAPI security and client hints can't come from it

### B) `c.use(Key)` with middleware keys

A contract names a middleware key ([`middleware-as-service.md`](./middleware-as-service.md)); its errors join the procedures', and `t.implement` makes the router require the key's implementation.

```ts
const c = experimental_contract.create();
export const appContract = {
  me: c.use(Auth).output(User).query(), // errors: UNAUTHORIZED, from Auth's type
};

const impl = t.implement(appContract); // every leaf under c.use(Auth) runs Auth
export const router = impl.router({
  me: impl.me.query(() => CurrentUser), // CurrentUser is provided
});
// inferRouterServices<typeof router> includes Auth: the handler's layer gives AuthLive
```

- ✅ A contract becomes a full `RpcGroup`: declared middleware gives typed client errors and documented auth (OpenAPI security from the key, later)
- ✅ The contract imports only the key (a type and an id), so a client importing it pulls in no implementation
- ❌ Needs middleware as a service first
- ❌ Contracts already cost more to type-check than declaring in the builder (about 50% more instantiations in the spike)

## Recommendation

**B**, if middleware keys ship. It closes the one place contracts are looser than `effect/rpc`, using the same key the builder's `.use(Key)` takes.

## Blocked until answered

- Needs [`middleware-as-service.md`](./middleware-as-service.md) answered B; under A this question goes away.

## Details

An optional extra, left open: a frozen contract. `experimental_toContract(router)` already derives a JSON contract from a router; a test comparing it with a committed one would catch unreviewed changes (a new error, a widened output) in an inferred router.

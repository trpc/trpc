# Service Oriented Architecture (SOA)

- **Not recommended** unless you really need it; if you're not sure you need it, you definitely don't need it.
- All routers currently need to have the same Context, error formatters, etc

### Overview

- `server-a` and `server-b` are two different node instances
- `server-lib` is glue code - making sure they have the same context & error formatters
- `faux-gateway` stitches together `server-a` & `server-b` **but is never actually run** in Node
- `client`:
  - is initialized with the types from `faux-gateway`
  - contains a custom ending [Link](https://trpc.io/docs/client/links) which allows you to call each server without caring where the call actually ends up

---

If you're using this in production, I bet you're in a large organization & using tRPC for business-critical applications. Please consider [sponsoring tRPC](https://trpc.io/sponsor).

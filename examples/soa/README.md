# Service Oriented Architecture (SOA)

- **Not recommended** unless you need it
- All routers currently need to have the same Context, error formatters, etc


### Overview

- `server-a` and `server-b` are two different node instances
- `server-lib` is glue code - making sure they have the same context & error formatters
- `faux-gateway` is stitches together `server-a` & `server-b` **but is never actually run** in Node
- `client/index`:
  - is initialized with the types from `faux-gateway`
  - contains a custom ending [Link](https://trpc.io/docs/links) which allows you to call each server without caring where the call actually ends up

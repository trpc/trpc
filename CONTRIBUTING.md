# Contributing

So excited to have you here! If you want **any** guidance whatsoever with contributing to tRPC, don't hesitate to reach out on [Discord](https://trpc.io/discord)!

## Development workflow

```bash
git clone git@github.com:trpc/trpc.git
cd trpc
yarn
```

### Get it running

**Terminal 1:**

```bash
# in project root directory
yarn dev
```

This will start a watcher in parallel which builds all `packages/*` on any file change.

**Terminal 2:**

In another terminal, you can for instance navigate to `examples/next-prisma-starter` and run `yarn dev` & it will update whenever code is changed in the packages.

### Testing

> Note: you will want to have `yarn dev` running in parallel in another terminal

```bash
# in project root directory
yarn test --watch

# example if you want to test a specific test file:
yarn test --watch --testPathPattern react
```

Testing is currently coalesced in [./packages/server/test](./packages/server/test); we import the different libs from here, this makes it easier for us to do integration testing + getting test coverage on the whole codebase.

### Linting

```bash
yarn lint-fix
```

### Documentation

```bash
cd www/ && yarn dev
```

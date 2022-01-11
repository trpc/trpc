# Contributing / Development workflow

```bash
git clone git@github.com:trpc/trpc.git
cd trpc
yarn
```

## Hacking around with it


In one terminal, will run `preconstruct watch` in parallel which builds all `packages/*` on change:

```bash
yarn dev
```

In another terminal, you can for instance navigate to `examples/next-prisma-starter` and run `yarn dev` & it will update whenever code is changed in the packages.

## Testing

```bash
yarn test --watch
```

All Integration testing is currently coalesced in [./packages/server/test](./packages/server/test) - we import the different libs from here, this makes it easier for us to do integration testing + getting test coverage on the whole codebase.


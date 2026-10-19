This is an example to test that declaration files work with a big router in tRPC.

It has a `postinstall`-script that generates 1400 procedures (which you can modify in `scripts/codegen.ts`).

```bash
git clone git@github.com:trpc/examples-v10-next-big-router.git
cd examples-v10-next-big-router
yarn && code . && yarn dev
```

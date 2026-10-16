# Experiment: raf-query on TanStack Query

Private comparison build: the same raf-query API (`useQuery`, handles, loaders, RSC) on `@tanstack/react-query` instead of raf-query's own engine. Not published; version stays `0.0.0`.

| Path       | Package                                        | Role                                        |
| ---------- | ---------------------------------------------- | ------------------------------------------- |
| `package/` | `@raf-query/experimental-tanstack-react-query` | Library                                     |
| `start/`   | `@examples/experimental-tanstack-query-start`  | TanStack Start app, <http://localhost:3002> |
| `nextjs/`  | `@examples/experimental-tanstack-query-nextjs` | Next.js app, <http://localhost:3003>        |

```shell
pnpm --filter @raf-query/experimental-tanstack-react-query test
pnpm --filter @examples/experimental-tanstack-query-start dev
pnpm --filter @examples/experimental-tanstack-query-nextjs dev
pnpm dev:experimental   # both apps
```

See [package/README.md](./package/README.md) for the API differences from `@raf-query/react`.

## Making it real

If this experiment becomes a published package:

1. Move `package/` to `packages/tanstack-react-query` (or the chosen public name) and drop the `experimental-` prefix from the package name.
2. Move or delete the apps under `examples/` if they should ship, or keep them here until then.
3. Add the package to the release-it publish list and trusted publishers; give it a real version.
4. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).

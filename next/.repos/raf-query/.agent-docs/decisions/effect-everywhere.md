# Write all the logic we can in Effect (human)

- Human: "Write it in Effect. Make a note to write all logic we can in Effect", about the Vercel ignore step, which was a plain Node script.
- Applies everywhere, not just the libraries: build steps (`www/build`), tooling (`tooling/*`), CI and deploy scripts. Files, processes, HTTP and env go through `FileSystem`, `Path`, `ChildProcessSpawner`, `HttpClient` and `Config`, with `NodeServices.layer` provided at the entry point.
- Code that runs before `pnpm install`, such as Vercel's ignore step, is still Effect: it installs its own package's runtime dependencies first (`tooling/vercel-ignore`).
- Plain code only where Effect can't run or would only wrap a sync API: React renders and `useSyncExternalStore` listeners (see `effect-module-layout.md`), config files a tool loads (`vite.config.ts` is the edge), and a one-line `package.json` script.
- Lost: Node built-ins for small scripts because they need no install. They skip typed errors and spans, and we'd keep two styles.

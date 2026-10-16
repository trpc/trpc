# Acronyms are cased as words, enforced by lint (human)

- Human, 2026-10-15: "I want stuff to be like TrpcError … and there should be an oxlint thing for it", then "A" (every acronym, not only `TRPC`). Identifiers we declare capitalise only an acronym's first letter: `TrpcError`, `initTrpc`, `createTrpcClient`, `useTrpc`, `generateOpenApi`, `toJsonSchema`, `maxUrlLength`, `httpLink`.
- Platform names we don't own stay as they are (`URL`, `URLSearchParams`, `JSON`, `HTMLElement`, `TextEncoder`), and so do wire names (`trpc-version`) and the prose name "tRPC".
- Enforced by the `trpcdev/acronym-case` rule in the repo's oxlint JS plugin: an identifier we declare may not contain two capitals in a row.
- Human, 2026-10-15 (Q21.4): "Yes". The same plugin's `trpcdev/jsdoc` rule requires `@since` and `@stability` on public exports of published packages.
- Why: one casing rule with no exception list, and names read the same in every position (`trpcClient`, `TrpcClient`).
- Lost: v11's `TRPC*` names.
- Lives in: `tooling/oxlint-plugin/`, `vite.config.ts` (`lint.jsPlugins`).

# `undefined` is valid data (human)

- **`undefined` is valid data** (human, 2026-10-12), unlike TanStack, which rejects it. "No data" is `hasData: false`, never `data === undefined`: check `hasData` in core code. TypeScript already catches the usual mistakes (a forgotten `return` types data as `void`; `prev && {...}` fails the updater's return type). Hydration treats `updatedAt > 0` as settled, so JSON dropping `data: undefined` is fine. Cost: `getData` and an updater's `previous` can't tell no data from `undefined` data.

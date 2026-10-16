# Docs: don't teach dependent queries

- Docs examples never chain queries (`await qc.fetch(a)` to build `b`'s input) as a normal pattern. The fix taught is reshaping data: input in the route, or a backend endpoint that resolves it.
- The chained form appears only as a last-resort escape hatch, next to `useWaterfall`.
- `prefetch` vs `ensure` is framed as a loading-experience choice (granular Suspense skeletons vs blocked navigation / full-page pending UI), not as a correctness or speed one.

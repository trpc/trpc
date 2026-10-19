# Only Effect is vendored (human)

- Human, 2026-10-19: "we only want effect there", then "delete orpc and raf-query from vendor-src and the repo". `.repos/` holds `effect` alone; oRPC and raf-query are no longer vendored.
- Why: Effect is the library the code is written in, so its source is what agents need to read. oRPC and raf-query are prior art for features, not for how to write them ([`effect-native-by-default.md`](./effect-native-by-default.md)).
- Lost: reading oRPC's and raf-query's source locally. Earlier decisions that cite them link their upstream repos at the refs that were vendored (oRPC `v2.0.0-beta.44`, raf-query `a9f2aa77`).
- Lives in: `../vendor-src.json`, `.repos/`, `AGENTS.md` (Vendored Source).
